# MySQL2 Helper

A simple and elegant MySQL2 helper class with common database operations for Node.js ES6 modules.

## Installation

```bash
npm install mysql2-helper mysql2
```

Note: `mysql2` is a peer dependency and must be installed separately.

## Usage

### Basic Setup

```javascript
import MySQLHelper from 'mysql2-helper';

const db = new MySQLHelper({
  host: 'localhost',
  user: 'root',
  password: 'your_password',
  database: 'your_database',
  port: 3306,
  connectionLimit: 10  // For connection pool
});

// Create a connection pool (recommended)
await db.createPool();

// OR create a single connection
// await db.connect();
```

### SELECT Queries

```javascript
// Simple select all
const users = await db.select('users');

// Select with conditions
const activeUsers = await db.select('users', {
  where: { status: 'active' },
  columns: ['id', 'name', 'email'],
  orderBy: 'created_at DESC',
  limit: 10,
  offset: 0
});

// Find by ID
const user = await db.findById('users', 1);
```

### INSERT Operations

```javascript
// Insert single record
const result = await db.insert('users', {
  name: 'John Doe',
  email: 'john@example.com',
  status: 'active'
});
console.log(result.insertId); // New record ID

// Insert multiple records
const bulkResult = await db.insertMany('users', [
  { name: 'Alice', email: 'alice@example.com' },
  { name: 'Bob', email: 'bob@example.com' }
]);
```

### UPDATE Operations

```javascript
const result = await db.update(
  'users',
  { status: 'inactive', updated_at: new Date() },  // Data to update
  { id: 1 }  // WHERE condition
);
console.log(result.affectedRows);
```

### DELETE Operations

```javascript
const result = await db.delete('users', { id: 1 });
console.log(result.affectedRows);
```

### Raw Queries

```javascript
// Execute raw SQL
const results = await db.query(
  'SELECT * FROM users WHERE age > ? AND city = ?',
  [25, 'New York']
);
```

### Transactions

```javascript
// Method 1: Using transaction helper
try {
  const result = await db.transaction(async (conn) => {
    // Execute queries within transaction
    const [result1] = await conn.execute(
      'UPDATE accounts SET balance = balance - ? WHERE id = ?',
      [100, 1]
    );
    
    const [result2] = await conn.execute(
      'UPDATE accounts SET balance = balance + ? WHERE id = ?',
      [100, 2]
    );
    
    return { result1, result2 };
  });
  
  console.log('Transaction completed successfully');
} catch (error) {
  console.error('Transaction failed:', error);
}

// Method 2: Manual transaction control
const conn = await db.beginTransaction();
try {
  await db.transactionQuery(conn, 
    'INSERT INTO orders (user_id, total) VALUES (?, ?)',
    [1, 99.99]
  );
  
  await db.transactionQuery(conn,
    'UPDATE inventory SET quantity = quantity - 1 WHERE product_id = ?',
    [123]
  );
  
  await conn.commit();
} catch (error) {
  await conn.rollback();
  throw error;
} finally {
  if (db.pool) conn.release();
}
```

### Utility Methods

```javascript
// Count records
const count = await db.count('users', { status: 'active' });

// Check if table exists
const exists = await db.tableExists('users');

// Test connection
try {
  await db.testConnection();
  console.log('Database connected successfully');
} catch (error) {
  console.error('Connection failed:', error);
}
```

### Closing Connections

```javascript
// Always close connections when done
await db.close();
```

## API Reference

### Constructor
- `new MySQLHelper(config)` - Create a new instance with database configuration

### Connection Methods
- `createPool()` - Create a connection pool (recommended)
- `connect()` - Create a single connection
- `close()` - Close all connections
- `testConnection()` - Test database connectivity

### Query Methods
- `query(sql, params)` - Execute raw SQL query
- `select(table, options)` - SELECT query with options
- `insert(table, data)` - Insert a single record
- `insertMany(table, dataArray)` - Insert multiple records
- `update(table, data, where)` - Update records
- `delete(table, where)` - Delete records
- `findById(table, id, idColumn)` - Find single record by ID
- `count(table, where)` - Count records

### Transaction Methods
- `beginTransaction()` - Start a transaction
- `transaction(callback)` - Execute callback within transaction
- `transactionQuery(conn, sql, params)` - Execute query in transaction context

### Utility Methods
- `tableExists(table)` - Check if table exists

## Configuration Options

```javascript
{
  host: 'localhost',           // Database host
  user: 'root',                // Database user
  password: 'password',        // Database password
  database: 'mydb',            // Database name
  port: 3306,                  // Database port
  connectionLimit: 10,         // Max connections in pool
  waitForConnections: true,    // Queue requests when no connections available
  queueLimit: 0               // Max queued requests (0 = unlimited)
}
```

## License

MIT