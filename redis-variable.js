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
        this.sha1 = "";

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

        // Try to get Redis configuration, but don't fail if not found
        const redisConfig = RED.nodes.getNode(config.redisConfig);
        
        if (!redisConfig) {
            node.warn("Redis configuration not found. Node will be in standby mode.");
            node.status({
                fill: "yellow",
                shape: "dot",
                text: "no config"
            });
            
            // Still handle input, but just pass through with warning
            node.on('input', function(msg) {
                msg.payload = { error: "Redis configuration not found" };
                node.send(msg);
            });
            return;
        }

        // Initialize Redis client only if config is available
        try {
            const nodeId = this.block ? node.id : redisConfig.id;
            client = redisConfig.getClient({}, node, nodeId);
            
            if (!client) {
                throw new Error("Failed to initialize Redis client");
            }
        } catch (error) {
            node.error(`Failed to initialize Redis client: ${error.message}`);
            node.status({
                fill: "red",
                shape: "dot",
                text: "connection error"
            });
            
            // Handle input with error
            node.on('input', function(msg) {
                msg.payload = { error: error.message };
                node.send(msg);
            });
            return;
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
                if (node.operation === "psubscribe") {
                    client.on("pmessage", function (pattern, channel, message) {
                        var payload = smartParse(message);
                        node.send({
                            pattern: pattern,
                            topic: channel,
                            payload: payload,
                        });
                    });
                    client[node.operation](node.topic, (err, count) => {
                        if (err) {
                            node.error(err.message);
                            node.status({
                                fill: "red",
                                shape: "dot",
                                text: "error",
                            });
                        } else {
                            node.status({
                                fill: "green",
                                shape: "dot",
                                text: "connected",
                            });
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
                    client[node.operation](node.topic, (err, count) => {
                        if (err) {
                            node.error(err.message);
                            node.status({
                                fill: "red",
                                shape: "dot",
                                text: "error",
                            });
                        } else {
                            node.status({
                                fill: "green",
                                shape: "dot",
                                text: "connected",
                            });
                        }
                    });
                }
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

                try {
                    let response;
                    let payload = msg.payload;

                    // Validate payload
                    if (!payload) {
                        throw new Error("Missing payload");
                    }

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
                        case "rpush":
                            if (!payload.key) {
                                throw new Error(`Missing key for ${node.operation.toUpperCase()} operation. Use payload.key`);
                            }
                            let pushValue = payload.value !== undefined ? payload.value : payload.data;
                            if (pushValue === undefined) {
                                throw new Error(`Missing value for ${node.operation.toUpperCase()} operation. Use payload.value or payload.data`);
                            }
                            pushValue = smartSerialize(pushValue);
                            response = await client[node.operation](payload.key, pushValue);
                            msg.payload = { success: true, key: payload.key, length: response, operation: node.operation };
                            break;

                        case "lpop":
                        case "rpop":
                            let popKey = payload.key || payload;
                            if (!popKey || typeof popKey !== 'string') {
                                throw new Error(`Missing key for ${node.operation.toUpperCase()} operation. Use payload.key or payload as string`);
                            }
                            response = await client[node.operation](popKey);
                            msg.payload = smartParse(response);
                            break;

                        case "llen":
                            let llenKey = payload.key || payload;
                            if (!llenKey || typeof llenKey !== 'string') {
                                throw new Error("Missing key for LLEN operation. Use payload.key or payload as string");
                            }
                            response = await client.llen(llenKey);
                            msg.payload = { key: llenKey, length: response };
                            break;

                        case "lrange":
                            if (!payload.key) {
                                throw new Error("Missing key for LRANGE operation. Use payload.key");
                            }
                            let start = payload.start !== undefined ? payload.start : 0;
                            let stop = payload.stop !== undefined ? payload.stop : -1;
                            response = await client.lrange(payload.key, start, stop);
                            // Auto-parse each item in the array
                            response = response.map(item => smartParse(item));
                            msg.payload = { key: payload.key, range: { start, stop }, values: response, count: response.length };
                            break;

                        // Hash Operations
                        case "hset":
                            if (!payload.key) {
                                throw new Error("Missing key for HSET operation. Use payload.key");
                            }
                            if (payload.field && payload.value !== undefined) {
                                // Single field
                                let hashValue = smartSerialize(payload.value);
                                response = await client.hset(payload.key, payload.field, hashValue);
                                msg.payload = { success: true, key: payload.key, field: payload.field, created: response === 1 };
                            } else if (payload.fields && typeof payload.fields === 'object') {
                                // Multiple fields from payload.fields
                                const fields = {};
                                for (const [key, value] of Object.entries(payload.fields)) {
                                    fields[key] = smartSerialize(value);
                                }
                                response = await client.hset(payload.key, fields);
                                msg.payload = { success: true, key: payload.key, fields: Object.keys(fields), created: response };
                            } else {
                                throw new Error("HSET requires field and value (payload.field, payload.value) or multiple fields (payload.fields)");
                            }
                            break;

                        case "hget":
                            if (!payload.key) {
                                throw new Error("Missing key for HGET operation. Use payload.key");
                            }
                            let field = payload.field;
                            if (!field) {
                                throw new Error("Missing field for HGET operation. Use payload.field");
                            }
                            response = await client.hget(payload.key, field);
                            msg.payload = smartParse(response);
                            break;

                        case "hgetall":
                            let hgetallKey = payload.key || payload;
                            if (!hgetallKey || typeof hgetallKey !== 'string') {
                                throw new Error("Missing key for HGETALL operation. Use payload.key or payload as string");
                            }
                            response = await client.hgetall(hgetallKey);
                            // Auto-parse each field value
                            const parsed = {};
                            for (const [key, value] of Object.entries(response)) {
                                parsed[key] = smartParse(value);
                            }
                            msg.payload = parsed;
                            break;

                        case "hdel":
                            if (!payload.key) {
                                throw new Error("Missing key for HDEL operation. Use payload.key");
                            }
                            let fieldsToDelete = payload.fields || payload.field;
                            if (!fieldsToDelete) {
                                throw new Error("Missing fields for HDEL operation. Use payload.fields (array) or payload.field");
                            }
                            fieldsToDelete = Array.isArray(fieldsToDelete) ? fieldsToDelete : [fieldsToDelete];
                            response = await client.hdel(payload.key, ...fieldsToDelete);
                            msg.payload = { success: true, key: payload.key, deleted: response, fields: fieldsToDelete };
                            break;

                        case "publish":
                            let channel = payload.channel || payload.key;
                            if (!channel) {
                                throw new Error("Missing channel for PUBLISH operation. Use payload.channel or payload.key");
                            }
                            let pubValue = payload.message || payload.value || payload.data;
                            if (pubValue === undefined) {
                                throw new Error("Missing message for PUBLISH operation. Use payload.message, payload.value, or payload.data");
                            }
                            pubValue = smartSerialize(pubValue);
                            response = await client.publish(channel, pubValue);
                            msg.payload = { success: true, channel: channel, subscribers: response, message: pubValue };
                            break;

                        default:
                            throw new Error(`Unsupported operation: ${node.operation}`);
                    }

                    send(msg);
                    done();

                } catch (err) {
                    node.error(err.message, msg);
                    msg.payload = { error: err.message };
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