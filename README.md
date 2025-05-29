# node-red-contrib-redis-variable

A comprehensive Node-RED node for Redis operations with flexible connection management and modern features.

**Developed by Andrii Lototskyi**

## 🚀 Features

### 🔧 **Flexible Connection Management**
- **Multiple Input Types**: Host, port, database, username, password support string values, flow/global context, and environment variables
- **Secure Credentials**: String values stored encrypted in Node-RED credentials
- **Runtime Resolution**: Context and environment variables resolved at runtime
- **SSL/TLS Support**: Full SSL/TLS encryption with client certificates and custom CAs
- **Advanced Configuration**: JSON-based advanced options for Redis client

### 📊 **Comprehensive Redis Operations**

#### **Universal Payload Interface**
- **Flexible Input**: All operations use `msg.payload` for parameters
- **Simple Format**: Single keys can be passed as strings
- **Object Format**: Complex operations use structured objects
- **Consistent Returns**: Standardized response format across all operations

#### **Basic Operations**
- **GET** - Retrieve value by key
- **SET** - Store value with optional TTL
- **DEL** - Delete single or multiple keys
- **EXISTS** - Check if single or multiple keys exist

#### **TTL Operations**
- **TTL** - Get remaining time to live in seconds
- **EXPIRE** - Set expiration time for existing key
- **PERSIST** - Remove expiration from key

#### **Counter Operations**
- **INCR** - Increment value by 1
- **DECR** - Decrement value by 1
- **INCRBY** - Increment value by N
- **DECRBY** - Decrement value by N

#### **List Operations**
- **LPUSH** - Add element to beginning of list
- **RPUSH** - Add element to end of list
- **LPOP** - Remove and return first element
- **RPOP** - Remove and return last element
- **LLEN** - Get list length
- **LRANGE** - Get range of elements

#### **Hash Operations**
- **HSET** - Set hash field value (single or multiple fields)
- **HGET** - Get hash field value
- **HGETALL** - Get all hash fields and values
- **HDEL** - Delete hash field(s)

#### **Pub/Sub Operations**
- **PUBLISH** - Publish message to channel

## Installation

```bash
npm install node-red-contrib-redis-variable
```

Or install directly through the Node-RED palette manager.

## Configuration

### Redis Configuration Node

The Redis configuration node supports flexible connection parameters:

#### Connection Settings
- **Host**: Redis server hostname or IP address
- **Port**: Redis server port (default: 6379)
- **Database**: Redis database number (default: 0)
- **Cluster Mode**: Enable for Redis Cluster deployments

#### Authentication
- **Username**: Redis username (Redis 6.0+ ACL support)
- **Password**: Redis password for authentication

#### Credential Sources
All connection parameters support multiple input types:
- **String**: Direct value stored securely in Node-RED credentials
- **Flow Context**: Retrieved from flow context variables
- **Global Context**: Retrieved from global context variables
- **Environment Variable**: Retrieved from environment variables

#### Advanced Options
JSON object with additional ioredis connection options:
```json
{
  "connectTimeout": 10000,
  "lazyConnect": true,
  "keepAlive": 30000,
  "family": 4,
  "retryDelayOnFailover": 100
}
```

#### SSL/TLS Configuration
The module provides comprehensive SSL/TLS support for secure Redis connections:

##### SSL Settings
- **Enable SSL/TLS**: Enable secure connection to Redis server
- **Verify Certificate**: Validate server certificates (recommended for production)
- **Client Certificate**: Client certificate for mutual TLS authentication
- **Private Key**: Private key corresponding to client certificate  
- **CA Certificate**: Certificate Authority certificate for custom CAs

##### SSL Examples

**Basic SSL (server verification only):**
```
Enable SSL/TLS: ✓
Verify Certificate: ✓
Client Certificate: (empty)
Private Key: (empty)
CA Certificate: (empty)
```

**Mutual TLS (client + server authentication):**
```
Enable SSL/TLS: ✓
Verify Certificate: ✓
Client Certificate: Your client certificate
Private Key: Your private key
CA Certificate: Custom CA if needed
```

**Self-signed certificates:**
```
Enable SSL/TLS: ✓
Verify Certificate: ✗ (disable for self-signed)
CA Certificate: Your self-signed CA
```

**Environment-based SSL configuration:**
```
Enable SSL/TLS: ✓
Client Certificate Type: Environment Variable → TLS_CLIENT_CERT
Private Key Type: Environment Variable → TLS_PRIVATE_KEY
CA Certificate Type: Environment Variable → TLS_CA_CERT
```

### Example Configurations

#### Environment-based Configuration
```
Host: Environment Variable → REDIS_HOST
Port: Environment Variable → REDIS_PORT
Password: Environment Variable → REDIS_PASSWORD
```

#### Context-based Configuration
```
Host: Global Context → redis_config.host
Port: Global Context → redis_config.port
Password: Flow Context → redis_password
```

## Operations

**Universal Payload Interface**: All Redis operations use a unified `msg.payload` interface. Parameters can be passed as simple strings (for single keys) or as objects with specific properties. This provides flexibility while maintaining simplicity.

### Basic Operations

#### GET - Retrieve Value
```javascript
// Simple key format
msg.payload = "user:123";
// Returns: { payload: "stored_value" }

// Object format
msg.payload = { 
    key: "user:123" 
};
// Returns: { payload: "stored_value" }
```

#### SET - Store Value
```javascript
// Simple SET
msg.payload = {
  key: "user:123",
  value: "John Doe"
};
// Returns: { payload: { success: true, result: "OK", ttl: null } }

// SET with TTL
msg.payload = {
  key: "session:abc123",
  value: { userId: 42, role: "admin" },
  ttl: 3600
};
// Returns: { payload: { success: true, result: "OK", ttl: 3600 } }
```

#### DEL - Delete Key
```javascript
// Delete single key
msg.payload = { 
    key: "mykey" 
};
// Or simple format
msg.payload = "mykey";
// Returns: { payload: { success: true, deleted: 1, keys: ["mykey"] } }

// Delete multiple keys
msg.payload = { 
    keys: ["key1", "key2", "key3"] 
};
// Returns: { payload: { success: true, deleted: 3, keys: ["key1", "key2", "key3"] } }
```

#### EXISTS - Check Key Existence
```javascript
// Check single key
msg.payload = "mykey";
// Or object format
msg.payload = { 
    key: "mykey" 
};
// Returns: { payload: { exists: true, count: 1, keys: ["mykey"] } }

// Check multiple keys
msg.payload = { 
    keys: ["key1", "key2", "key3"] 
};
// Returns: { payload: { exists: true, count: 2, keys: ["key1", "key2", "key3"] } }
```

#### TTL - Get Time To Live
```javascript
msg.payload = "mykey";
// Returns: { payload: { key: "mykey", ttl: 3600, status: "expires in 3600 seconds" } }
```

#### EXPIRE - Set Key Expiration
```javascript
msg.payload = {
  key: "mykey",
  ttl: 3600
};
// Returns: { payload: { success: true, key: "mykey", ttl: 3600, message: "Expiration set" } }
```

#### PERSIST - Remove Expiration
```javascript
msg.payload = "mykey";
// Returns: { payload: { success: true, key: "mykey", message: "Expiration removed" } }
```

#### INCR/DECR - Increment/Decrement
```javascript
// Simple increment
msg.payload = "counter";
// Returns: { payload: { key: "counter", value: 1 } }

// Increment by amount
msg.payload = {
  key: "score",
  amount: 10
};
// Returns: { payload: { key: "score", value: 110, increment: 10 } }
```

### List Operations

#### LPUSH/RPUSH - Add to List
```javascript
msg.payload = {
  key: "mylist",
  value: "item1"
};
// Returns: { payload: { success: true, key: "mylist", length: 1, operation: "lpush" } }
```

#### LPOP/RPOP - Remove from List
```javascript
msg.payload = "mylist";
// Returns: { payload: "item1" }
```

#### LLEN - Get List Length
```javascript
msg.payload = "mylist";
// Returns: { payload: { key: "mylist", length: 5 } }
```

#### LRANGE - Get List Range
```javascript
msg.payload = {
  key: "mylist",
  start: 0,
  stop: -1
};
// Returns: { payload: { key: "mylist", range: {start: 0, stop: -1}, values: ["item1", "item2", "item3"], count: 3 } }
```

#### BLPOP/BRPOP - Blocking Pop
Configure timeout in node settings. These operations run continuously and emit messages when items are available.

### Hash Operations

#### HSET - Set Hash Field
```javascript
// Single field
msg.payload = {
  key: "myhash",
  field: "name",
  value: "John"
};
// Returns: { payload: { success: true, key: "myhash", field: "name", created: true } }

// Multiple fields
msg.payload = {
  key: "myhash",
  fields: {
    name: "John",
    age: 30,
    city: "New York"
  }
};
// Returns: { payload: { success: true, key: "myhash", fields: ["name", "age", "city"], created: 3 } }
```

#### HGET - Get Hash Field
```javascript
msg.payload = {
  key: "myhash",
  field: "name"
};
// Returns: { payload: "John" }
```

#### HGETALL - Get All Hash Fields
```javascript
msg.payload = "myhash";
// Returns: { payload: { name: "John", age: "30", city: "New York" } }
```

#### HDEL - Delete Hash Field
```javascript
// Delete single field
msg.payload = {
  key: "myhash",
  field: "age"
};
// Returns: { payload: { success: true, key: "myhash", deleted: 1, fields: ["age"] } }

// Delete multiple fields
msg.payload = {
  key: "myhash",
  fields: ["age", "city"]
};
// Returns: { payload: { success: true, key: "myhash", deleted: 2, fields: ["age", "city"] } }
```

### Pub/Sub Operations

#### PUBLISH - Publish Message
```javascript
msg.payload = {
  channel: "mychannel",
  message: "Hello World"
};
// Returns: { payload: { success: true, channel: "mychannel", subscribers: 2, message: "Hello World" } }
```

#### SUBSCRIBE - Subscribe to Channel
Configure channel in node settings. Messages are automatically emitted:
```javascript
// Received message format:
{
  topic: "mychannel",
  payload: "Hello World"
}
```

#### PSUBSCRIBE - Pattern Subscribe
Configure pattern in node settings (e.g., "news.*"):
```javascript
// Received message format:
{
  pattern: "news.*",
  topic: "news.sports",
  payload: "Sports update"
}
```

### Advanced Operations

#### Lua Script Execution
```javascript
// Configure Lua script in node editor:
// return redis.call('GET', KEYS[1])

msg.payload = ["mykey"];  // Array of keys and arguments
// Returns: { payload: "script_result" }
```

#### Redis Instance in Context
Stores Redis client in flow or global context for direct access:
```javascript
// Access stored instance
const redis = flow.get("redis_client");
const result = await redis.get("mykey");
```

## 🔄 Automatic JSON Handling

The module automatically detects and handles JSON data without any configuration:

### 🤖 Smart Detection
- **Objects**: JavaScript objects are automatically serialized to JSON strings when storing
- **JSON Strings**: Valid JSON strings are automatically parsed back to objects when retrieving  
- **Simple Values**: Strings, numbers, and other simple types are handled as-is
- **Arrays**: Each item in Redis lists is automatically parsed if it's valid JSON

### 📝 Examples

#### Storing Objects
```javascript
msg.payload = {
  key: "user:123",
  value: {
    name: "John Doe",
    age: 30,
    preferences: {
      theme: "dark",
      language: "en"
    }
  }
};
// Automatically stored as: '{"name":"John Doe","age":30,"preferences":{"theme":"dark","language":"en"}}'
```

#### Retrieving Objects
```javascript
msg.payload = "user:123";
// Returns: {
//   "name": "John Doe",
//   "age": 30,
//   "preferences": {
//     "theme": "dark", 
//     "language": "en"
//   }
// }
```

#### Mixed Data Types
```javascript
// Store simple string
msg.payload = {
    key: "message", 
    value: "Hello World"
};
// Returns: "Hello World"

// Store number  
msg.payload = {
    key: "count", 
    value: 42
};
// Returns: "42"

// Store object
msg.payload = {
    key: "config", 
    value: {
        debug: true, 
        timeout: 5000
    }
};
// Returns: {debug: true, timeout: 5000}
```

## Connection Management

### Connection Pooling
- Connections are automatically pooled and reused across nodes
- Each configuration creates a single connection pool
- Connections are automatically cleaned up when nodes are removed

### Blocking Operations
For blocking operations (BLPOP, BRPOP, Lua scripts), enable "Force new connection" to prevent blocking other operations.

### Error Handling
All operations include comprehensive error handling:
```javascript
// Error response format:
{
  payload: {
    error: "Connection failed: ECONNREFUSED"
  }
}
```

## Security Best Practices

1. **Use Environment Variables**: Store sensitive credentials in environment variables
2. **Enable Redis AUTH**: Always use password authentication in production
3. **Use Redis ACLs**: Implement fine-grained access control (Redis 6.0+)
4. **Enable SSL/TLS**: Use encrypted connections for production environments
5. **Verify Certificates**: Always verify server certificates in production
6. **Secure Certificate Storage**: Store certificates and keys in environment variables or secure context
7. **Network Security**: Use TLS/SSL for connections over untrusted networks
8. **Principle of Least Privilege**: Grant minimal required permissions

## Examples

### Basic Key-Value Storage
```javascript
// Store user session
msg.payload = {
  key: "session:abc123",
  value: {
    userId: 456,
    loginTime: new Date().toISOString(),
    permissions: ["read", "write"]
  },
  ttl: 3600  // 1 hour expiration
};
```

### Message Queue with Lists
```javascript
// Producer - Add task to queue
msg.payload = {
  key: "task_queue",
  value: {
    id: "task_001",
    type: "email",
    data: { to: "user@example.com", subject: "Welcome" }
  }
};

// Consumer (using BLPOP)
// Configure BLPOP operation in node settings
// Automatically receives tasks as they're added
```

### Caching with Expiration
```javascript
// Cache API response for 1 hour
msg.payload = {
  key: "api_cache:users",
  value: apiResponse,
  ttl: 3600  // 1 hour
};
```

### Real-time Notifications
```javascript
// Publisher
msg.payload = {
  channel: "notifications:user:123",
  message: {
    type: "message",
    from: "user:456",
    content: "Hello there!"
  }
};

// Subscriber automatically receives notifications
```

## 📖 Usage Examples

### Basic Operations

#### GET Operation
```javascript
// Simple format
msg.payload = "user:123";

// Object format
msg.payload = {
    key: "user:123"
};
// Returns: "John Doe" (or stored value)
```

#### SET Operation
```javascript
// Simple SET
msg.payload = {
  key: "user:123",
  value: "John Doe"
};

// SET with TTL (expires in 1 hour)
msg.payload = {
  key: "session:abc123",
  value: {userId: 42, role: "admin"},
  ttl: 3600
};
// Returns: { success: true, result: "OK", ttl: 3600 }
```

#### DELETE Operations
```javascript
// Delete single key
msg.payload = {
    key: "temp:data"
};

// Delete multiple keys
msg.payload = {
    keys: ["cache:page1", "cache:page2", "temp:data"]
};
// Returns: { success: true, deleted: 3, keys: [...] }
```

### TTL Operations

#### Check TTL
```javascript
msg.payload = "session:abc123";
// Returns: { key: "session:abc123", ttl: 2847, status: "expires in 2847 seconds" }
```

#### Set Expiration
```javascript
msg.payload = {
  key: "temp:data",
  ttl: 1800
};
// Returns: { success: true, key: "temp:data", ttl: 1800, message: "Expiration set" }
```

#### Remove Expiration
```javascript
msg.payload = "permanent:key";
// Returns: { success: true, key: "permanent:key", message: "Expiration removed" }
```

### Counter Operations

#### Increment Counter
```javascript
// Simple increment
msg.payload = "page:views";
// Returns: { key: "page:views", value: 1547 }

// Increment by amount
msg.payload = {
  key: "score:player1",
  amount: 100
};
// Returns: { key: "score:player1", value: 2350, increment: 100 }
```

### List Operations

#### Add to List
```javascript
msg.payload = {
  key: "queue:tasks",
  value: {
      task: "process_order", 
      id: 12345
  }
};
// Returns: { success: true, key: "queue:tasks", length: 8, operation: "lpush" }
```

#### Get List Range
```javascript
msg.payload = {
  key: "queue:tasks",
  start: 0,
  stop: 4
};
// Returns: { key: "queue:tasks", range: {start: 0, stop: 4}, values: [...], count: 5 }
```

#### Pop from List
```javascript
msg.payload = "queue:tasks";
// Returns: {"task": "process_order", "id": 12345} (first item)
```

### Hash Operations

#### Set Hash Fields
```javascript
// Single field
msg.payload = {
  key: "user:123",
  field: "email",
  value: "john.doe@example.com"
};
// Returns: { success: true, key: "user:123", field: "email", created: true }

// Multiple fields
msg.payload = {
  key: "user:123",
  fields: {
    name: "John Doe",
    age: 30,
    city: "New York",
    active: true
  }
};
// Returns: { success: true, key: "user:123", fields: ["name", "age", "city", "active"], created: 4 }
```

#### Get Hash Data
```javascript
// Get single field
msg.payload = {
  key: "user:123",
  field: "email"
};
// Returns: "john.doe@example.com"

// Get all fields
msg.payload = "user:123";
// Returns: { name: "John Doe", age: "30", city: "New York", email: "john.doe@example.com", active: "true" }
```

### Pub/Sub Operations

#### Publish Message
```javascript
msg.payload = {
  channel: "notifications",
  message: {
    type: "alert",
    text: "System maintenance in 5 minutes",
    timestamp: "2024-01-15T10:30:00Z"
  }
};
// Returns: { success: true, channel: "notifications", subscribers: 3, message: "..." }
```

## Troubleshooting

### Common Issues

1. **Connection Refused**: Check Redis server is running and accessible
2. **Authentication Failed**: Verify username/password configuration
3. **Timeout Errors**: Increase connection timeout in advanced options
4. **Memory Issues**: Monitor Redis memory usage and configure appropriate limits

### Debug Mode
Enable Node-RED debug mode to see detailed connection and operation logs:
```bash
DEBUG=redis* node-red
```

## Contributing

Contributions are welcome! Please read the contributing guidelines and submit pull requests to the GitHub repository.

## License

MIT License - see LICENSE file for details.

## Changelog

### v1.0.0
- Initial release
- Complete Redis operations support
- Flexible connection management
- Modern ioredis integration
- Comprehensive documentation