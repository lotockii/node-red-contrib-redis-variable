const Redis = require("ioredis");

module.exports = function (RED) {
    let connections = {};
    let usedConn = {};

    function getValueFromContext(node, value, type, msg) {
        if (value === null || value === undefined) return null;

        try {
            let result;
            switch (type) {
                case 'flow':
                    const flowContext = node.context().flow;
                    if (!flowContext) {
                        return null;
                    }
                    result = getNestedValue(flowContext, value);
                    break;
                case 'global':
                    const globalContext = node.context().global;
                    if (!globalContext) {
                        return null;
                    }
                    result = getNestedValue(globalContext, value);
                    break;
                case 'env':
                    result = process.env[value];
                    break;
                case 'msg':
                    result = RED.util.getMessageProperty(msg, value);
                    break;
                default:
                    result = value;
            }

            return result !== undefined ? result : null;
        } catch (err) {
            throw new Error(`Failed to get value for type: ${type}, value: ${value}. Error: ${err.message}`);
        }
    }

    // Helper function to get nested values like "redis_config.host"
    function getNestedValue(context, path) {
        if (!context) return undefined;
        
        if (path.includes('.')) {
            const parts = path.split('.');
            let result = context.get(parts[0]);
            
            // If the first part returns an object, traverse it
            if (result && typeof result === 'object') {
                for (let i = 1; i < parts.length; i++) {
                    if (result && typeof result === 'object' && result[parts[i]] !== undefined) {
                        result = result[parts[i]];
                    } else {
                        return undefined;
                    }
                }
                return result;
            } else {
                // If first part is not an object, try to get the full path as a single value
                return context.get(path);
            }
        } else {
            return context.get(path);
        }
    }

    function RedisConfigNode(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name || "Redis Config";
        this.cluster = config.cluster || false;
        
        // Connection configuration
        this.hostType = config.hostType || 'str';
        this.host = config.host || 'localhost';
        this.hostContext = config.hostContext;
        this.port = config.port || 6379;
        this.portType = config.portType || 'str';
        this.portContext = config.portContext;
        
        // Authentication
        this.passwordType = config.passwordType || 'str';
        this.password = config.password;
        this.passwordContext = config.passwordContext;
        this.username = config.username;
        this.usernameType = config.usernameType || 'str';
        this.usernameContext = config.usernameContext;
        
        // SSL/TLS Configuration
        this.enableTLS = config.enableTLS || false;
        this.tlsRejectUnauthorized = config.tlsRejectUnauthorized !== false; // Default to true
        this.tlsCertType = config.tlsCertType || 'str';
        this.tlsCertContext = config.tlsCertContext;
        this.tlsKeyType = config.tlsKeyType || 'str';
        this.tlsKeyContext = config.tlsKeyContext;
        this.tlsCaType = config.tlsCaType || 'str';
        this.tlsCaContext = config.tlsCaContext;
        
        // Database and other options
        this.database = config.database || 0;
        this.databaseType = config.databaseType || 'str';
        this.databaseContext = config.databaseContext;
        
        // Advanced options
        this.optionsType = config.optionsType || 'json';
        this.options = config.options || '{}';
        this.optionsContext = config.optionsContext;

        // Get credentials for string passwords
        const credentials = this.credentials || {};

        // Helper method to parse credential values
        this.parseCredentialValue = function(value, type, msg, executingNode) {
            if (!value && value !== 0) {
                return null;
            }
            
            try {
                let result;
                switch (type) {
                    case 'str':
                        result = value;
                        break;
                    case 'flow':
                        result = getValueFromContext(executingNode || this, value, 'flow', msg);
                        break;
                    case 'global':
                        result = getValueFromContext(executingNode || this, value, 'global', msg);
                        if (executingNode && process.env.NODE_RED_DEBUG) {
                            executingNode.log(`Context lookup - Type: global, Path: ${value}, Result: ${result}`);
                        }
                        break;
                    case 'env':
                        result = process.env[value] || null;
                        break;
                    case 'json':
                        try {
                            result = JSON.parse(value);
                        } catch (e) {
                            result = value;
                        }
                        break;
                    case 'num':
                        result = Number(value);
                        break;
                    default:
                        result = value;
                }
                return result;
            } catch (error) {
                if (executingNode) {
                    executingNode.error(`Error parsing credential value: ${error.message}`);
                }
                return null;
            }
        };

        // Check if configuration exists in context
        this.hasValidConfiguration = function(msg, executingNode) {
            try {
                // If using string configuration for host and port, it's always valid
                if (this.hostType === 'str' && this.portType === 'str') {
                    return true;
                }
                
                // For context-based configuration, check if the required values exist
                let hasHost = false;
                let hasPort = false;
                
                // Check host configuration
                if (this.hostType === 'str') {
                    hasHost = !!(this.host);
                } else {
                    const contextHost = this.parseCredentialValue(this.hostContext, this.hostType, msg, executingNode);
                    hasHost = !!(contextHost);
                }
                
                // Check port configuration
                if (this.portType === 'str') {
                    hasPort = !!(this.port);
                } else {
                    const contextPort = this.parseCredentialValue(this.portContext, this.portType, msg, executingNode);
                    hasPort = !!(contextPort);
                }
                
                // We need at least host and port to have a valid configuration
                const result = hasHost && hasPort;
                
                if (executingNode && process.env.NODE_RED_DEBUG) {
                    executingNode.log(`Configuration check - hasHost: ${hasHost}, hasPort: ${hasPort}, result: ${result}`);
                }
                
                return result;
                
            } catch (error) {
                if (executingNode) {
                    executingNode.error(`Error checking configuration: ${error.message}`);
                }
                return false;
            }
        };

        // Get Redis connection options
        this.getConnectionOptions = function(msg, executingNode) {
            try {
                // Parse host - handle both typedInput and direct context
                let host;
                if (this.hostType === 'str') {
                    host = this.host || 'localhost';
                } else {
                    host = this.parseCredentialValue(this.hostContext, this.hostType, msg, executingNode) || 'localhost';
                }

                // Parse port - handle both typedInput and direct context
                let port;
                if (this.portType === 'str') {
                    port = this.port || 6379;
                } else {
                    port = this.parseCredentialValue(this.portContext, this.portType, msg, executingNode) || 6379;
                }

                // Parse database - handle both typedInput and direct context
                let database;
                if (this.databaseType === 'str') {
                    database = this.database || 0;
                } else {
                    database = this.parseCredentialValue(this.databaseContext, this.databaseType, msg, executingNode) || 0;
                }

                // Parse password
                let password = null;
                if (this.passwordType === 'str') {
                    password = this.credentials?.password;
                } else {
                    password = this.parseCredentialValue(this.passwordContext, this.passwordType, msg, executingNode);
                }

                // Parse username
                let username = null;
                if (this.usernameType === 'str') {
                    username = this.credentials?.username;
                } else {
                    username = this.parseCredentialValue(this.usernameContext, this.usernameType, msg, executingNode);
                }

                // Parse additional options
                let additionalOptions = {};
                if (this.optionsType === 'json') {
                    try {
                        additionalOptions = JSON.parse(this.options || '{}');
                    } catch (e) {
                        additionalOptions = {};
                    }
                } else {
                    additionalOptions = this.parseCredentialValue(this.optionsContext, this.optionsType, msg, executingNode) || {};
                }

                // Build connection options
                const connectionOptions = {
                    host: host,
                    port: parseInt(port),
                    db: parseInt(database),
                    retryDelayOnFailover: 100,
                    enableReadyCheck: false,
                    maxRetriesPerRequest: null,
                    ...additionalOptions
                };

                // Add authentication if provided
                if (password) {
                    connectionOptions.password = password;
                }
                if (username) {
                    connectionOptions.username = username;
                }

                // Add SSL/TLS configuration if enabled
                if (this.enableTLS) {
                    connectionOptions.tls = {
                        rejectUnauthorized: this.tlsRejectUnauthorized
                    };

                    // Parse TLS Certificate
                    let tlsCert = null;
                    if (this.tlsCertType === 'str') {
                        tlsCert = this.credentials?.tlsCert;
                    } else {
                        tlsCert = this.parseCredentialValue(this.tlsCertContext, this.tlsCertType, msg, executingNode);
                    }

                    // Parse TLS Key
                    let tlsKey = null;
                    if (this.tlsKeyType === 'str') {
                        tlsKey = this.credentials?.tlsKey;
                    } else {
                        tlsKey = this.parseCredentialValue(this.tlsKeyContext, this.tlsKeyType, msg, executingNode);
                    }

                    // Parse TLS CA
                    let tlsCa = null;
                    if (this.tlsCaType === 'str') {
                        tlsCa = this.credentials?.tlsCa;
                    } else {
                        tlsCa = this.parseCredentialValue(this.tlsCaContext, this.tlsCaType, msg, executingNode);
                    }

                    // Add TLS options if provided
                    if (tlsCert && tlsKey) {
                        connectionOptions.tls.cert = tlsCert;
                        connectionOptions.tls.key = tlsKey;
                    }

                    if (tlsCa) {
                        connectionOptions.tls.ca = tlsCa;
                    }

                    // If using custom CA or self-signed certificates, might need to disable rejection
                    if (!this.tlsRejectUnauthorized) {
                        connectionOptions.tls.rejectUnauthorized = false;
                    }
                } else {
                    // Explicitly disable TLS for non-SSL connections
                    connectionOptions.tls = false;
                }

                return connectionOptions;

            } catch (error) {
                if (executingNode) {
                    executingNode.error(`Failed to get Redis connection options: ${error.message}`);
                }
                throw error;
            }
        };

        // Get Redis client
        this.getClient = function(msg, executingNode, nodeId) {
            try {
                const id = nodeId || this.id;
                
                // Return existing connection if available
                if (connections[id]) {
                    usedConn[id]++;
                    return connections[id];
                }

                // Check if configuration is available before attempting connection
                if (!this.hasValidConfiguration(msg, executingNode)) {
                    if (executingNode) {
                        // Only warn once per node to avoid spam
                        if (!executingNode._configWarningShown) {
                            executingNode.warn("Redis configuration not available in context. Skipping connection attempt.");
                            executingNode._configWarningShown = true;
                            
                            // Reset warning flag after 30 seconds
                            setTimeout(() => {
                                if (executingNode) {
                                    executingNode._configWarningShown = false;
                                }
                            }, 30000);
                        }
                    }
                    return null;
                }

                const options = this.getConnectionOptions(msg, executingNode);

                // Add connection limits to prevent infinite retry loops
                const connectionOptions = {
                    ...options,
                    maxRetriesPerRequest: 1, // Limit retries per request
                    retryDelayOnFailover: 100,
                    enableReadyCheck: false,
                    lazyConnect: true, // Don't connect immediately
                    connectTimeout: 5000, // 5 second timeout
                    commandTimeout: 3000, // 3 second command timeout
                    // Disable automatic reconnection to prevent error loops
                    retryDelayOnClusterDown: 0,
                    retryDelayOnFailover: 0,
                    maxRetriesPerRequest: 0
                };

                // Create Redis client
                let client;
                if (this.cluster) {
                    // For cluster mode, options should be an array of nodes
                    const clusterNodes = Array.isArray(connectionOptions) ? connectionOptions : [connectionOptions];
                    client = new Redis.Cluster(clusterNodes);
                } else {
                    client = new Redis(connectionOptions);
                }

                // Track error state to prevent spam
                let errorReported = false;
                let lastErrorTime = 0;
                const ERROR_REPORT_INTERVAL = 30000; // Report errors only once per 30 seconds

                // Handle connection errors
                client.on("error", (e) => {
                    const now = Date.now();
                    
                    // Only report errors once per interval to prevent spam
                    if (!errorReported || (now - lastErrorTime) > ERROR_REPORT_INTERVAL) {
                        let errorMsg = `Redis connection error: ${e.message}`;
                        
                        // Add specific diagnostics for common SSL issues
                        if (e.message.includes("Protocol error") || e.message.includes("\\u0015")) {
                            errorMsg += "\nThis usually indicates an SSL/TLS configuration issue. Try:";
                            errorMsg += "\n1. Disable SSL/TLS if your Redis server doesn't support it";
                            errorMsg += "\n2. Use port 6380 for Redis SSL instead of 6379";
                            errorMsg += "\n3. Check if your Redis server is configured for SSL";
                            errorMsg += "\n4. Enable 'Debug: Force No SSL' option for testing";
                        }
                        
                        if (executingNode) {
                            executingNode.error(errorMsg, {});
                        } else {
                            this.error(errorMsg, {});
                        }
                        
                        errorReported = true;
                        lastErrorTime = now;
                    }
                });

                // Handle successful connection
                client.on("connect", () => {
                    errorReported = false;
                    if (executingNode) {
                        executingNode.status({ fill: "green", shape: "dot", text: "connected" });
                    }
                });

                // Handle disconnection
                client.on("disconnect", () => {
                    if (executingNode) {
                        executingNode.status({ fill: "red", shape: "ring", text: "disconnected" });
                    }
                });

                // Store connection
                connections[id] = client;
                if (usedConn[id] === undefined) {
                    usedConn[id] = 1;
                } else {
                    usedConn[id]++;
                }

                return client;

            } catch (error) {
                if (executingNode) {
                    executingNode.error(`Failed to create Redis client: ${error.message}`);
                }
                throw error;
            }
        };

        // Disconnect method
        this.disconnect = function(nodeId) {
            const id = nodeId || this.id;
            if (usedConn[id] !== undefined) {
                usedConn[id]--;
            }
            if (connections[id] && usedConn[id] <= 0) {
                connections[id].disconnect();
                delete connections[id];
                delete usedConn[id];
            }
        };

        // Force disconnect method for error recovery
        this.forceDisconnect = function(nodeId) {
            const id = nodeId || this.id;
            if (connections[id]) {
                try {
                    connections[id].disconnect();
                } catch (e) {
                    // Ignore disconnect errors
                }
                delete connections[id];
                delete usedConn[id];
            }
        };

        // Clean up on node close
        this.on('close', function() {
            this.disconnect();
        });
    }

    RED.nodes.registerType("redis-variable-config", RedisConfigNode, {
        credentials: {
            password: { type: "password" },
            username: { type: "text" }
        }
    });
}; 