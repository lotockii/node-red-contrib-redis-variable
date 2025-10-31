const async = require("async");

module.exports = function (RED) {
    function RedisVariableNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        // Node configuration
        this.operation = config.operation || "get";
        this.timeout = config.timeout || 0;
        this.block = config.block || false;
        this.keyval = config.keyval || 0;
        this.func = config.func;
        this.stored = config.stored || false;
        this.params = config.params;
        this.location = config.location || 'flow';
        this.topic = config.topic || "";
        this.sha1 = "";

        // Save redisConfig once in the constructor
        let redisConfig = RED.nodes.getNode(config.redisConfig);
        let client = null;
        let running = true;

        // Helper functions for automatic JSON handling
        function isJsonString(str) {
            if (typeof str !== 'string') return false;
            try {
                const parsed = JSON.parse(str);
                return typeof parsed === 'object' && parsed !== null;
            } catch (e) {
                return false;
            }
        }

        function smartSerialize(value) {
            if (typeof value === 'object' && value !== null) {
                return JSON.stringify(value);
            }
            return String(value);
        }

        function smartParse(str) {
            if (typeof str !== 'string') return str;
            if (isJsonString(str)) {
                try {
                    return JSON.parse(str);
                } catch (e) {
                    return str;
                }
            }
            return str;
        }

        // Handle different operations
        switch (this.operation) {
            case "subscribe":
            case "psubscribe":
                handleSubscription();
                break;
            case "blpop":
            case "brpop":
                handleBlockingPop();
                break;
            case "lua-script":
                handleLuaScript();
                break;
            case "instance":
                handleInstance();
                break;
            default:
                handleInput();
                break;
        }

        // Subscription operations (subscribe, psubscribe)
        function handleSubscription() {
            try {
                if (!redisConfig) {
                    node.status({ fill: "yellow", shape: "ring", text: "no config" });
                    node.warn("Redis configuration not found for subscription.");
                    return;
                }

                if (!node.topic) {
                    node.status({ fill: "red", shape: "dot", text: "missing channel" });
                    node.error("Missing channel/pattern for subscription (topic)");
                    return;
                }

                client = redisConfig.getClient(null, node, node.id);
                if (!client) {
                    node.status({ fill: "yellow", shape: "ring", text: "no config" });
                    node.warn("Redis configuration not available. Subscription skipped.");
                    return;
                }

                const setup = async () => {
                    try {
                        if (client.status !== 'ready' && client.status !== 'connect') {
                            await client.connect();
                        }

                        const topics = (node.topic || "").split(/[\s,]+/).filter(Boolean);

                        if (node.operation === "psubscribe") {
                            client.on("pmessage", function (pattern, channel, message) {
                                var payload = smartParse(message);
                                node.send({
                                    pattern: pattern,
                                    topic: channel,
                                    payload: payload,
                                });
                            });
                            client.psubscribe(...topics, (err) => {
                                if (err) {
                                    // Fallback: if server doesn't support PSUBSCRIBE and no wildcard is used, try SUBSCRIBE
                                    if (err.message && err.message.toLowerCase().includes('unknown command')) {
                                        const hasWildcard = topics.some(t => t.includes('*'));
                                        if (!hasWildcard) {
                                            client.subscribe(...topics, (subErr) => {
                                                if (subErr) {
                                                    node.error(subErr.message);
                                                    node.status({ fill: "red", shape: "dot", text: "error" });
                                                } else {
                                                    node.status({ fill: "green", shape: "dot", text: "connected" });
                                                }
                                            });
                                            return;
                                        }
                                    }
                                    node.error(err.message);
                                    node.status({ fill: "red", shape: "dot", text: "error" });
                                } else {
                                    node.status({ fill: "green", shape: "dot", text: "connected" });
                                }
                            });
                        } else if (node.operation === "subscribe") {
                            client.on("message", function (channel, message) {
                                var payload = smartParse(message);
                                node.send({
                                    topic: channel,
                                    payload: payload,
                                });
                            });
                            client.subscribe(...topics, (err) => {
                                if (err) {
                                    node.error(err.message);
                                    node.status({ fill: "red", shape: "dot", text: "error" });
                                } else {
                                    node.status({ fill: "green", shape: "dot", text: "connected" });
                                }
                            });
                        }
                    } catch (e) {
                        node.error(`Subscription setup failed: ${e.message}`);
                        node.status({ fill: "red", shape: "dot", text: "error" });
                    }
                };

                setup();
            } catch (error) {
                node.error(`Subscription error: ${error.message}`);
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "error",
                });
            }
        }

        // Blocking pop operations (blpop, brpop)
        function handleBlockingPop() {
            try {
                async.whilst(
                    (cb) => {
                        cb(null, running);
                    },
                    (cb) => {
                        client[node.operation](node.topic, Number(node.timeout))
                            .then((data) => {
                                if (data !== null && data.length == 2) {
                                    var payload = smartParse(data[1]);
                                    node.send({
                                        topic: node.topic,
                                        payload: payload,
                                    });
                                }
                                cb(null);
                            })
                            .catch((e) => {
                                node.error(e.message);
                                running = false;
                                cb(e);
                            });
                    },
                    () => {}
                );
            } catch (error) {
                node.error(`Blocking pop error: ${error.message}`);
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "error",
                });
            }
        }

        // Lua script operations
        function handleLuaScript() {
            try {
                if (node.stored) {
                    client.script("load", node.func, function (err, res) {
                        if (err) {
                            node.status({
                                fill: "red",
                                shape: "dot",
                                text: "script not loaded",
                            });
                            node.error(err.message);
                        } else {
                            node.status({
                                fill: "green",
                                shape: "dot",
                                text: "script loaded",
                            });
                            node.sha1 = res;
                        }
                    });
                }

                node.on("input", function (msg, send, done) {
                    send = send || function() { node.send.apply(node, arguments) };
                    done = done || function(err) { if(err) node.error(err, msg); };

                    try {
                        if (node.keyval > 0 && !Array.isArray(msg.payload)) {
                            done(new Error("Payload is not Array"));
                            return;
                        }

                        var args = null;
                        var command = "eval";
                        if (node.stored) {
                            command = "evalsha";
                            args = [node.sha1, node.keyval].concat(msg.payload || []);
                        } else {
                            args = [node.func, node.keyval].concat(msg.payload || []);
                        }

                        client[command](args, function (err, res) {
                            if (err) {
                                done(err);
                            } else {
                                msg.payload = res;
                                send(msg);
                                done();
                            }
                        });
                    } catch (error) {
                        done(error);
                    }
                });
            } catch (error) {
                node.error(`Lua script error: ${error.message}`);
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "error",
                });
            }
        }

        // Instance operation - store client in context
        function handleInstance() {
            try {
                node.context()[node.location].set(node.topic, client);
                node.status({
                    fill: "green",
                    shape: "dot",
                    text: "ready",
                });
            } catch (error) {
                node.error(`Failed to store Redis instance: ${error.message}`);
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "error",
                });
            }
        }

        // Handle input for other operations
        function handleInput() {
            node.on('input', async (msg, send, done) => {
                send = send || function() { node.send.apply(node, arguments) };
                done = done || function(err) { if(err) node.error(err, msg); };

                if (!running) {
                    running = true;
                }

                // Use redisConfig saved at construction
                if (!redisConfig) {
                    node.error("Redis configuration not found", msg);
                    msg.payload = { error: "Redis configuration not found" };
                    send(msg);
                    done();
                    return;
                }

                // Only create client if not already created
                try {
                    if (!client) {
                        client = redisConfig.getClient(msg, node, node.id);
                        if (!client) {
                            node.warn("Redis configuration not available. Operation skipped.");
                            node.status({ fill: "yellow", shape: "ring", text: "no config" });
                            msg.payload = { error: "Redis configuration not available" };
                            send(msg);
                            done();
                            return;
                        }
                    }
                    
                    // Check if client is connected before proceeding
                    if (client.status !== 'ready' && client.status !== 'connect') {
                        // Try to connect if not connected
                        if (client.status === 'disconnect' || client.status === 'end') {
                            await client.connect();
                        } else {
                            // Force disconnect and recreate client for other error states
                            try {
                                redisConfig.forceDisconnect(node.id);
                                client = null;
                                client = redisConfig.getClient(msg, node, node.id);
                                if (!client) {
                                    node.warn("Redis configuration not available during reconnection. Operation skipped.");
                                    node.status({ fill: "yellow", shape: "ring", text: "no config" });
                                    msg.payload = { error: "Redis configuration not available" };
                                    send(msg);
                                    done();
                                    return;
                                }
                            } catch (reconnectError) {
                                throw new Error(`Failed to reconnect: ${reconnectError.message}`);
                            }
                        }
                    }
                } catch (err) {
                    node.error(err.message, msg);
                    msg.payload = { error: err.message };
                    send(msg);
                    done();
                    return;
                }

                try {
                    let response;
                    let payload = msg.payload;

                    // Validate payload
                    if (!payload) {
                        throw new Error("Missing payload");
                    }

                    // Wrap all Redis operations in try-catch to handle connection errors gracefully
                    try {
                        switch (node.operation) {
                            case "get":
                                let getKey = payload.key || payload;
                                if (!getKey || typeof getKey !== 'string') {
                                    throw new Error("Missing or invalid key for GET operation. Use payload.key or payload as string");
                                }
                                response = await client.get(getKey);
                                msg.payload = smartParse(response);
                                break;

                            case "set":
                                if (!payload.key) {
                                    throw new Error("Missing key for SET operation. Use payload.key");
                                }
                                let setValue = payload.value !== undefined ? payload.value : payload.data;
                                if (setValue === undefined) {
                                    throw new Error("Missing value for SET operation. Use payload.value or payload.data");
                                }
                                setValue = smartSerialize(setValue);
                                
                                // Support TTL
                                if (payload.ttl && payload.ttl > 0) {
                                    response = await client.setex(payload.key, payload.ttl, setValue);
                                } else {
                                    response = await client.set(payload.key, setValue);
                                }
                                msg.payload = { success: true, result: response, ttl: payload.ttl || null };
                                break;

                            case "del":
                                let delKeys = payload.keys || payload.key || payload;
                                if (!delKeys) {
                                    throw new Error("Missing keys for DEL operation. Use payload.keys (array) or payload.key");
                                }
                                let keysToDelete = Array.isArray(delKeys) ? delKeys : [delKeys];
                                response = await client.del(...keysToDelete);
                                msg.payload = { success: true, deleted: response, keys: keysToDelete };
                                break;

                            case "exists":
                                let existsKeys = payload.keys || payload.key || payload;
                                if (!existsKeys) {
                                    throw new Error("Missing keys for EXISTS operation. Use payload.keys (array) or payload.key");
                                }
                                let keysToCheck = Array.isArray(existsKeys) ? existsKeys : [existsKeys];
                                response = await client.exists(...keysToCheck);
                                msg.payload = { exists: response > 0, count: response, keys: keysToCheck };
                                break;

                            case "match":
                                let pattern = payload.pattern || payload;
                                if (!pattern || typeof pattern !== 'string') {
                                    throw new Error("Missing pattern for MATCH operation. Use payload.pattern or payload as string");
                                }
                                
                                let count = payload.count || 100; // Default scan count
                                let startCursor = payload.cursor || payload.skip || 0; // Support cursor/skip for pagination
                                let allKeys = [];
                                let cursor = startCursor;
                                let maxIterations = 1000; // Prevent infinite loops
                                let iterations = 0;
                                
                                // If skip is specified, we need to scan through keys without collecting them
                                if (payload.skip && payload.skip > 0) {
                                    let skipped = 0;
                                    do {
                                        if (iterations++ > maxIterations) {
                                            throw new Error("Maximum scan iterations exceeded. Check your pattern or reduce skip value.");
                                        }
                                        const scanResult = await client.scan(cursor, 'MATCH', pattern, 'COUNT', count);
                                        cursor = scanResult[0];
                                        skipped += scanResult[1].length;
                                        
                                        if (skipped >= payload.skip) {
                                            // We've skipped enough, start collecting from this point
                                            const excessSkipped = skipped - payload.skip;
                                            if (excessSkipped > 0) {
                                                // Add keys from current batch, excluding the excess
                                                allKeys = scanResult[1].slice(excessSkipped);
                                            }
                                            break;
                                        }
                                    } while (cursor !== 0 && cursor !== '0');
                                }
                                
                                // Continue scanning to collect keys up to the limit
                                do {
                                    if (iterations++ > maxIterations) {
                                        throw new Error("Maximum scan iterations exceeded. Check your pattern or reduce count value.");
                                    }
                                    const scanResult = await client.scan(cursor, 'MATCH', pattern, 'COUNT', count);
                                    cursor = scanResult[0];
                                    allKeys = allKeys.concat(scanResult[1]);
                                    
                                    // Break early if we've found enough keys
                                    if (allKeys.length >= count) {
                                        allKeys = allKeys.slice(0, count); // Trim to exact count
                                        break;
                                    }
                                } while (cursor !== 0 && cursor !== '0');
                                
                                msg.payload = { 
                                    pattern: pattern,
                                    keys: allKeys,
                                    count: allKeys.length,
                                    limit: count,
                                    cursor: cursor, // Return next cursor for pagination
                                    startCursor: startCursor,
                                    scanned: true,
                                    truncated: allKeys.length === count,
                                    iterations: iterations
                                };
                                break;

                            // TTL Operations
                            case "ttl":
                                let ttlKey = payload.key || payload;
                                if (!ttlKey || typeof ttlKey !== 'string') {
                                    throw new Error("Missing key for TTL operation. Use payload.key or payload as string");
                                }
                                response = await client.ttl(ttlKey);
                                msg.payload = { 
                                    key: ttlKey,
                                    ttl: response,
                                    status: response === -1 ? "no expiration" : response === -2 ? "key not found" : "expires in " + response + " seconds"
                                };
                                break;

                            case "expire":
                                if (!payload.key) {
                                    throw new Error("Missing key for EXPIRE operation. Use payload.key");
                                }
                                let expireSeconds = payload.ttl || payload.seconds || payload.value || 3600;
                                response = await client.expire(payload.key, expireSeconds);
                                msg.payload = { 
                                    success: response === 1,
                                    key: payload.key,
                                    ttl: expireSeconds,
                                    message: response === 1 ? "Expiration set" : "Key not found"
                                };
                                break;

                            case "persist":
                                let persistKey = payload.key || payload;
                                if (!persistKey || typeof persistKey !== 'string') {
                                    throw new Error("Missing key for PERSIST operation. Use payload.key or payload as string");
                                }
                                response = await client.persist(persistKey);
                                msg.payload = { 
                                    success: response === 1,
                                    key: persistKey,
                                    message: response === 1 ? "Expiration removed" : "Key not found or no expiration"
                                };
                                break;

                            // Counter Operations
                            case "incr":
                                let incrKey = payload.key || payload;
                                if (!incrKey || typeof incrKey !== 'string') {
                                    throw new Error("Missing key for INCR operation. Use payload.key or payload as string");
                                }
                                response = await client.incr(incrKey);
                                msg.payload = { key: incrKey, value: response };
                                break;

                            case "decr":
                                let decrKey = payload.key || payload;
                                if (!decrKey || typeof decrKey !== 'string') {
                                    throw new Error("Missing key for DECR operation. Use payload.key or payload as string");
                                }
                                response = await client.decr(decrKey);
                                msg.payload = { key: decrKey, value: response };
                                break;

                            case "incrby":
                                if (!payload.key) {
                                    throw new Error("Missing key for INCRBY operation. Use payload.key");
                                }
                                let incrAmount = payload.amount || payload.value || payload.increment || 1;
                                response = await client.incrby(payload.key, incrAmount);
                                msg.payload = { key: payload.key, value: response, increment: incrAmount };
                                break;

                            case "decrby":
                                if (!payload.key) {
                                    throw new Error("Missing key for DECRBY operation. Use payload.key");
                                }
                                let decrAmount = payload.amount || payload.value || payload.decrement || 1;
                                response = await client.decrby(payload.key, decrAmount);
                                msg.payload = { key: payload.key, value: response, decrement: decrAmount };
                                break;

                            // List Operations
                            case "lpush":
                                if (!payload.key) {
                                    throw new Error("Missing key for LPUSH operation. Use payload.key");
                                }
                                let lpushValue = payload.value !== undefined ? payload.value : payload.data;
                                if (lpushValue === undefined) {
                                    throw new Error("Missing value for LPUSH operation. Use payload.value or payload.data");
                                }
                                lpushValue = smartSerialize(lpushValue);
                                response = await client.lpush(payload.key, lpushValue);
                                msg.payload = { success: true, result: response, key: payload.key };
                                break;

                            case "rpush":
                                if (!payload.key) {
                                    throw new Error("Missing key for RPUSH operation. Use payload.key");
                                }
                                let rpushValue = payload.value !== undefined ? payload.value : payload.data;
                                if (rpushValue === undefined) {
                                    throw new Error("Missing value for RPUSH operation. Use payload.value or payload.data");
                                }
                                rpushValue = smartSerialize(rpushValue);
                                response = await client.rpush(payload.key, rpushValue);
                                msg.payload = { success: true, result: response, key: payload.key };
                                break;

                            case "lpop":
                                let lpopKey = payload.key || payload;
                                if (!lpopKey || typeof lpopKey !== 'string') {
                                    throw new Error("Missing key for LPOP operation. Use payload.key or payload as string");
                                }
                                response = await client.lpop(lpopKey);
                                msg.payload = smartParse(response);
                                break;

                            case "rpop":
                                let rpopKey = payload.key || payload;
                                if (!rpopKey || typeof rpopKey !== 'string') {
                                    throw new Error("Missing key for RPOP operation. Use payload.key or payload as string");
                                }
                                response = await client.rpop(rpopKey);
                                msg.payload = smartParse(response);
                                break;

                            case "lrange":
                                if (!payload.key) {
                                    throw new Error("Missing key for LRANGE operation. Use payload.key");
                                }
                                let start = payload.start || payload.from || 0;
                                let stop = payload.stop || payload.to || -1;
                                response = await client.lrange(payload.key, start, stop);
                                msg.payload = response.map(item => smartParse(item));
                                break;

                            case "llen":
                                let llenKey = payload.key || payload;
                                if (!llenKey || typeof llenKey !== 'string') {
                                    throw new Error("Missing key for LLEN operation. Use payload.key or payload as string");
                                }
                                response = await client.llen(llenKey);
                                msg.payload = { key: llenKey, length: response };
                                break;

                            // Hash Operations
                            case "hset":
                                if (!payload.key) {
                                    throw new Error("Missing key for HSET operation. Use payload.key");
                                }
                                let hsetField = payload.field || payload.name;
                                let hsetValue = payload.value !== undefined ? payload.value : payload.data;
                                if (!hsetField || hsetValue === undefined) {
                                    throw new Error("Missing field or value for HSET operation. Use payload.field and payload.value");
                                }
                                hsetValue = smartSerialize(hsetValue);
                                response = await client.hset(payload.key, hsetField, hsetValue);
                                msg.payload = { success: true, result: response, key: payload.key, field: hsetField };
                                break;

                            case "hget":
                                if (!payload.key) {
                                    throw new Error("Missing key for HGET operation. Use payload.key");
                                }
                                let hgetField = payload.field || payload.name;
                                if (!hgetField) {
                                    throw new Error("Missing field for HGET operation. Use payload.field");
                                }
                                response = await client.hget(payload.key, hgetField);
                                msg.payload = smartParse(response);
                                break;

                            case "hgetall":
                                let hgetallKey = payload.key || payload;
                                if (!hgetallKey || typeof hgetallKey !== 'string') {
                                    throw new Error("Missing key for HGETALL operation. Use payload.key or payload as string");
                                }
                                response = await client.hgetall(hgetallKey);
                                // Parse all values in the hash
                                const parsedHash = {};
                                for (const [field, value] of Object.entries(response)) {
                                    parsedHash[field] = smartParse(value);
                                }
                                msg.payload = parsedHash;
                                break;

                            case "hdel":
                                if (!payload.key) {
                                    throw new Error("Missing key for HDEL operation. Use payload.key");
                                }
                                let hdelFields = payload.fields || payload.field || payload.names;
                                if (!hdelFields) {
                                    throw new Error("Missing fields for HDEL operation. Use payload.fields (array) or payload.field");
                                }
                                let fieldsToDelete = Array.isArray(hdelFields) ? hdelFields : [hdelFields];
                                response = await client.hdel(payload.key, ...fieldsToDelete);
                                msg.payload = { success: true, deleted: response, key: payload.key, fields: fieldsToDelete };
                                break;

                            // Pub/Sub Operations
                            case "publish":
                                if (!payload.channel) {
                                    throw new Error("Missing channel for PUBLISH operation. Use payload.channel");
                                }
                                let publishMessage = payload.message !== undefined ? payload.message : payload.data;
                                if (publishMessage === undefined) {
                                    throw new Error("Missing message for PUBLISH operation. Use payload.message or payload.data");
                                }
                                publishMessage = smartSerialize(publishMessage);
                                response = await client.publish(payload.channel, publishMessage);
                                msg.payload = { success: true, subscribers: response, channel: payload.channel };
                                break;

                            default:
                                throw new Error(`Unknown operation: ${node.operation}`);
                        }
                    } catch (redisError) {
                        // Handle Redis-specific errors (connection, command errors, etc.)
                        if (redisError.message.includes('ECONNREFUSED') || 
                            redisError.message.includes('ENOTFOUND') ||
                            redisError.message.includes('ETIMEDOUT')) {
                            // Connection-related errors - force disconnect to prevent dead connections
                            if (client) {
                                try {
                                    redisConfig.forceDisconnect(node.id);
                                    client = null;
                                } catch (e) {
                                    // Ignore disconnect errors
                                }
                            }
                            
                            msg.payload = { 
                                error: `Redis connection failed: ${redisError.message}`,
                                operation: node.operation,
                                retryable: true
                            };
                            node.status({ fill: "red", shape: "ring", text: "connection failed" });
                        } else {
                            // Other Redis errors (command errors, etc.)
                            msg.payload = { 
                                error: `Redis operation failed: ${redisError.message}`,
                                operation: node.operation,
                                retryable: false
                            };
                        }
                        send(msg);
                        done();
                        return;
                    }

                    // Update node status on success
                    node.status({ fill: "green", shape: "dot", text: node.operation });
                    send(msg);
                    done();

                } catch (error) {
                    // Handle general errors (validation, etc.)
                    node.error(error.message, msg);
                    msg.payload = { error: error.message };
                    send(msg);
                    done();
                }
            });
        }

        // Set initial status
        if (["subscribe", "psubscribe", "blpop", "brpop"].includes(node.operation)) {
            node.status({
                fill: "green",
                shape: "dot",
                text: "connected",
            });
        } else if (node.operation === "instance") {
            // Status set in handleInstance
        } else {
            node.status({
                fill: "blue",
                shape: "dot",
                text: "ready",
            });
        }

        // Clean up on node close
        node.on("close", async (undeploy, done) => {
            node.status({});
            running = false;
            
            if (node.operation === "instance" && node.location && node.topic) {
                try {
                    node.context()[node.location].set(node.topic, null);
                } catch (e) {
                    // Ignore errors when cleaning up context
                }
            }
            
            if (client) {
                try {
                    if (node.operation === 'subscribe' && node.topic) {
                        await client.unsubscribe(node.topic);
                    } else if (node.operation === 'psubscribe' && node.topic) {
                        await client.punsubscribe(node.topic);
                    }
                } catch (e) {
                    // ignore
                }
            }

            if (redisConfig) {
                const nodeId = node.block ? node.id : redisConfig.id;
                redisConfig.disconnect(nodeId);
            }
            
            client = null;
            done();
        });
    }

    RED.nodes.registerType("redis-variable", RedisVariableNode);
}; 