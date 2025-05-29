# node-red-contrib-redis-variable

A comprehensive Node-RED node for Redis operations with flexible connection management and modern features.

## 🚀 Features

### 🔧 **Flexible Connection Management**
- **Multiple Input Types**: Host, port, database, username, password support string values, flow/global context, and environment variables
- **Secure Credentials**: String values stored encrypted in Node-RED credentials
- **Runtime Resolution**: Context and environment variables resolved at runtime
- **SSL/TLS Support**: Full SSL/TLS encryption with client certificates and custom CAs
- **Advanced Configuration**: JSON-based advanced options for Redis client

### 📊 **Comprehensive Redis Operations**

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

### Basic Operations

#### GET - Retrieve Value
```javascript
msg = {
  topic: "mykey",
  payload: null
}
// Returns: { payload: "stored_value" }
```

#### SET - Store Value
```javascript
msg = {
  topic: "mykey",
  payload: "myvalue"
}
// Returns: { payload: { success: true, result: "OK" } }
```

#### DEL - Delete Key
```javascript
msg = {
  topic: "mykey",
  payload: null
}
// Returns: { payload: { success: true, deleted: 1 } }
```

#### EXISTS - Check Key Existence
```javascript
msg = {
  topic: "mykey",
  payload: null
}
// Returns: { payload: { exists: true } }
```

#### EXPIRE - Set Key Expiration
```javascript
msg = {
  topic: "mykey",
  payload: 3600  // seconds
}
// Returns: { payload: { success: true } }
```

#### TTL - Get Time To Live
```javascript
msg = {
  topic: "mykey",
  payload: null
}
// Returns: { payload: { ttl: 3600 } }
```

#### INCR/DECR - Increment/Decrement
```javascript
msg = {
  topic: "counter",
  payload: null
}
// Returns: { payload: { value: 1 } }
```

### List Operations

#### LPUSH/RPUSH - Add to List
```javascript
msg = {
  topic: "mylist",
  payload: "item1"
}
// Returns: { payload: { success: true, length: 1 } }
```

#### LPOP/RPOP - Remove from List
```javascript
msg = {
  topic: "mylist",
  payload: null
}
// Returns: { payload: "item1" }
```

#### LRANGE - Get List Range
```javascript
msg = {
  topic: "mylist",
  payload: {
    start: 0,
    stop: -1
  }
}
// Returns: { payload: ["item1", "item2", "item3"] }
```

#### BLPOP/BRPOP - Blocking Pop
Configure timeout in node settings. These operations run continuously and emit messages when items are available.

### Hash Operations

#### HSET - Set Hash Field
```javascript
// Single field
msg = {
  topic: "myhash",
  payload: {
    field: "name",
    value: "John"
  }
}

// Multiple fields
msg = {
  topic: "myhash",
  payload: {
    name: "John",
    age: 30,
    city: "New York"
  }
}
// Returns: { payload: { success: true, result: 1 } }
```

#### HGET - Get Hash Field
```javascript
msg = {
  topic: "myhash",
  payload: {
    field: "name"
  }
}
// Or simply:
msg = {
  topic: "myhash",
  payload: "name"
}
// Returns: { payload: "John" }
```

#### HGETALL - Get All Hash Fields
```javascript
msg = {
  topic: "myhash",
  payload: null
}
// Returns: { payload: { name: "John", age: "30", city: "New York" } }
```

#### HDEL - Delete Hash Field
```javascript
msg = {
  topic: "myhash",
  payload: {
    field: "age"
  }
}
// Returns: { payload: { success: true, deleted: 1 } }
```

### Pub/Sub Operations

#### PUBLISH - Publish Message
```javascript
msg = {
  topic: "mychannel",
  payload: "Hello World"
}
// Returns: { payload: { success: true, subscribers: 2 } }
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

msg = {
  payload: ["mykey"]  // Array of keys and arguments
}
// Returns: { payload: "script_result" }
```

#### Generic Command Execution
```javascript
msg = {
  payload: {
    command: "MGET",
    args: ["key1", "key2", "key3"]
  }
}
// Returns: { payload: ["value1", "value2", "value3"] }
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
```json
{
  "payload": {
    "key": "user:123",
    "value": {
      "name": "John Doe",
      "age": 30,
      "preferences": {
        "theme": "dark",
        "language": "en"
      }
    }
  }
}
// Automatically stored as: '{"name":"John Doe","age":30,"preferences":{"theme":"dark","language":"en"}}'
```

#### Retrieving Objects
```json
{
  "payload": "user:123"
}
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
```json
// Store simple string
{"payload": {"key": "message", "value": "Hello World"}}
// Returns: "Hello World"

// Store number  
{"payload": {"key": "count", "value": 42}}
// Returns: "42"

// Store object
{"payload": {"key": "config", "value": {"debug": true, "timeout": 5000}}}
// Returns: {"debug": true, "timeout": 5000}
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
msg = {
  topic: "session:abc123",
  payload: {
    userId: 456,
    loginTime: new Date().toISOString(),
    permissions: ["read", "write"]
  }
}
```

### Message Queue with Lists
```javascript
// Producer
msg = {
  topic: "task_queue",
  payload: {
    id: "task_001",
    type: "email",
    data: { to: "user@example.com", subject: "Welcome" }
  }
}

// Consumer (using BLPOP)
// Automatically receives tasks as they're added
```

### Caching with Expiration
```javascript
// Cache API response for 1 hour
msg = {
  topic: "api_cache:users",
  payload: apiResponse
}
// Then set expiration
msg = {
  topic: "api_cache:users",
  payload: 3600  // 1 hour
}
```

### Real-time Notifications
```javascript
// Publisher
msg = {
  topic: "notifications:user:123",
  payload: {
    type: "message",
    from: "user:456",
    content: "Hello there!"
  }
}

// Subscriber automatically receives notifications
```

## 📖 Usage Examples

### Basic Operations

#### GET Operation
```json
// Simple format
{
  "payload": "user:123"
}

// Object format
{
  "payload": {"key": "user:123"}
}
// Returns: "John Doe" (or stored value)
```

#### SET Operation
```json
// Simple SET
{
  "payload": {
    "key": "user:123",
    "value": "John Doe"
  }
}

// SET with TTL (expires in 1 hour)
{
  "payload": {
    "key": "session:abc123",
    "value": {"userId": 42, "role": "admin"},
    "ttl": 3600
  }
}
// Returns: { success: true, result: "OK", ttl: 3600 }
```

#### DELETE Operations
```json
// Delete single key
{
  "payload": {"key": "temp:data"}
}

// Delete multiple keys
{
  "payload": {"keys": ["cache:page1", "cache:page2", "temp:data"]}
}
// Returns: { success: true, deleted: 3, keys: [...] }
```

### TTL Operations

#### Check TTL
```json
{
  "payload": "session:abc123"
}
// Returns: { key: "session:abc123", ttl: 2847, status: "expires in 2847 seconds" }
```

#### Set Expiration
```json
{
  "payload": {
    "key": "temp:data",
    "ttl": 1800
  }
}
// Returns: { success: true, key: "temp:data", ttl: 1800, message: "Expiration set" }
```

#### Remove Expiration
```json
{
  "payload": "permanent:key"
}
// Returns: { success: true, key: "permanent:key", message: "Expiration removed" }
```

### Counter Operations

#### Increment Counter
```json
// Simple increment
{
  "payload": "page:views"
}
// Returns: { key: "page:views", value: 1547 }

// Increment by amount
{
  "payload": {
    "key": "score:player1",
    "amount": 100
  }
}
// Returns: { key: "score:player1", value: 2350, increment: 100 }
```

### List Operations

#### Add to List
```json
{
  "payload": {
    "key": "queue:tasks",
    "value": {"task": "process_order", "id": 12345}
  }
}
// Returns: { success: true, key: "queue:tasks", length: 8, operation: "lpush" }
```

#### Get List Range
```json
{
  "payload": {
    "key": "queue:tasks",
    "start": 0,
    "stop": 4
  }
}
// Returns: { key: "queue:tasks", range: {start: 0, stop: 4}, values: [...], count: 5 }
```

#### Pop from List
```json
{
  "payload": "queue:tasks"
}
// Returns: {"task": "process_order", "id": 12345} (first item)
```

### Hash Operations

#### Set Hash Fields
```json
// Single field
{
  "payload": {
    "key": "user:123",
    "field": "email",
    "value": "john.doe@example.com"
  }
}
// Returns: { success: true, key: "user:123", field: "email", created: true }

// Multiple fields
{
  "payload": {
    "key": "user:123",
    "fields": {
      "name": "John Doe",
      "age": 30,
      "city": "New York",
      "active": true
    }
  }
}
// Returns: { success: true, key: "user:123", fields: ["name", "age", "city", "active"], created: 4 }
```

#### Get Hash Data
```json
// Get single field
{
  "payload": {
    "key": "user:123",
    "field": "email"
  }
}
// Returns: "john.doe@example.com"

// Get all fields
{
  "payload": "user:123"
}
// Returns: { name: "John Doe", age: "30", city: "New York", email: "john.doe@example.com", active: "true" }
```

### Pub/Sub Operations

#### Publish Message
```json
{
  "payload": {
    "channel": "notifications",
    "message": {
      "type": "alert",
      "text": "System maintenance in 5 minutes",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  }
}
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