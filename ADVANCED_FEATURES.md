# Advanced Features Documentation

## Table of Contents
1. [Automatic Timestamps](#automatic-timestamps)
2. [Stored Procedures](#stored-procedures)
3. [Index Management](#index-management)
4. [Query Builder (Separate Module)](#query-builder-separate-module)

---

## Automatic Timestamps

The package automatically adds `created_at` and `updated_at` timestamps to your records.

### Configuration

```javascript
// Enable timestamps (default: enabled)
const db = new MySQLHelper({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'mydb',
  timestamps: true,              // Enable automatic timestamps (default: true)
  createdAtColumn: 'created_at', // Column name for creation timestamp
  updatedAtColumn: 'updated_at'  // Column name for update timestamp
});

// Disable timestamps globally
const dbNoTimestamps = new MySQLHelper({
  // ... config
  timestamps: false
});
```

### Database Schema

Make sure your tables have timestamp columns:

```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Usage

```javascript
// INSERT - automatically adds created_at and updated_at
await db.insert('users', {
  name: 'John Doe',
  email: 'john@example.com'
});
// Inserts: { name: 'John Doe', email: 'john@example.com', created_at: NOW, updated_at: NOW }

// UPDATE - automatically updates updated_at
await db.update(
  'users',
  { name: 'John Updated' },
  { id: 1 }
);
// Updates: { name: 'John Updated', updated_at: NOW }

// Skip timestamps for specific operations
await db.insert('users', {
  name: 'Jane',
  email: 'jane@example.com'
}, { skipTimestamps: true });

await db.update('users', 
  { name: 'Jane Updated' },
  { id: 2 },
  { skipTimestamps: true }
);
```

### Custom Column Names

```javascript
const db = new MySQLHelper({
  // ... config
  createdAtColumn: 'createdDate',
  updatedAtColumn: 'modifiedDate'
});

// Now uses 'createdDate' and 'modifiedDate' columns
```

### Timestamp Hooks

```javascript
// Hook before insert with timestamps
db.addHook('beforeInsert', async (data) => {
  console.log('Inserting:', data.data);
  // data.data will include created_at and updated_at
});

// Hook after update with timestamps
db.addHook('afterUpdate', async (data) => {
  console.log('Updated:', data.data);
  // data.data will include updated_at
});
```

---

## Stored Procedures

Manage and execute MySQL stored procedures.

### Calling Stored Procedures

```javascript
// Simple procedure call
const results = await db.callProcedure('GetActiveUsers');

// Procedure with parameters
const results = await db.callProcedure('GetUsersByStatus', ['active']);

// Procedure with multiple parameters
const results = await db.callProcedure('GetUserOrders', [userId, startDate, endDate]);

// Handle multiple result sets
const [users, orders, summary] = await db.callProcedure('GetUserOrdersSummary', [userId]);
console.log('Users:', users);
console.log('Orders:', orders);
console.log('Summary:', summary);
```

### Creating Stored Procedures

```javascript
// Create a simple procedure
await db.createProcedure(
  'GetActiveUsers',
  '', // No parameters
  `
    SELECT * FROM users WHERE status = 'active';
  `
);

// Create procedure with parameters
await db.createProcedure(
  'GetUsersByStatus',
  'IN userStatus VARCHAR(50)',
  `
    SELECT * FROM users WHERE status = userStatus;
  `
);

// Create procedure with multiple parameters and logic
await db.createProcedure(
  'CreateUserOrder',
  'IN userId INT, IN productId INT, IN quantity INT, OUT orderId INT',
  `
    DECLARE totalPrice DECIMAL(10,2);
    
    -- Get product price
    SELECT price * quantity INTO totalPrice 
    FROM products 
    WHERE id = productId;
    
    -- Create order
    INSERT INTO orders (user_id, total, status) 
    VALUES (userId, totalPrice, 'pending');
    
    SET orderId = LAST_INSERT_ID();
    
    -- Insert order item
    INSERT INTO order_items (order_id, product_id, quantity)
    VALUES (orderId, productId, quantity);
    
    -- Update inventory
    UPDATE products 
    SET stock = stock - quantity 
    WHERE id = productId;
  `
);
```

### Managing Procedures

```javascript
// Check if procedure exists
const exists = await db.procedureExists('GetActiveUsers');
console.log('Procedure exists:', exists);

// List all procedures
const procedures = await db.listProcedures();
console.log('Available procedures:');
procedures.forEach(proc => {
  console.log(`- ${proc.name} (Created: ${proc.created})`);
});

// Drop procedure
await db.dropProcedure('GetActiveUsers');

// Drop only if exists
await db.dropProcedure('GetActiveUsers', true);
```

### Complete Example

```javascript
// Setup
const db = new MySQLHelper({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'mydb'
});

await db.createPool();

// Create procedure for complex operation
await db.createProcedure(
  'ProcessMonthlyReport',
  'IN targetMonth INT, IN targetYear INT',
  `
    -- Create temporary table for calculations
    CREATE TEMPORARY TABLE IF NOT EXISTS monthly_stats (
      user_id INT,
      total_orders INT,
      total_revenue DECIMAL(10,2)
    );
    
    -- Calculate statistics
    INSERT INTO monthly_stats
    SELECT 
      user_id,
      COUNT(*) as total_orders,
      SUM(total) as total_revenue
    FROM orders
    WHERE MONTH(created_at) = targetMonth 
      AND YEAR(created_at) = targetYear
      AND status = 'completed'
    GROUP BY user_id;
    
    -- Return results
    SELECT 
      u.id,
      u.name,
      u.email,
      COALESCE(ms.total_orders, 0) as orders,
      COALESCE(ms.total_revenue, 0) as revenue
    FROM users u
    LEFT JOIN monthly_stats ms ON u.id = ms.user_id
    ORDER BY revenue DESC;
    
    DROP TEMPORARY TABLE monthly_stats;
  `
);

// Execute procedure
const report = await db.callProcedure('ProcessMonthlyReport', [12, 2024]);
console.log('December 2024 Report:', report);
```

### Listen to Procedure Events

```javascript
db.on('procedureCalled', ({ procedureName, params }) => {
  console.log(`Called procedure: ${procedureName}`, params);
});

db.on('procedureCreated', ({ procedureName }) => {
  console.log(`Created procedure: ${procedureName}`);
});

db.on('procedureDropped', ({ procedureName }) => {
  console.log(`Dropped procedure: ${procedureName}`);
});
```

---

## Index Management

Create, manage, and optimize database indexes.

### Creating Indexes

```javascript
// Simple index on single column
await db.createIndex('users', 'idx_email', 'email');

// Index on multiple columns
await db.createIndex('users', 'idx_name_email', ['name', 'email']);

// Unique index
await db.createIndex('users', 'idx_unique_username', 'username', {
  unique: true
});

// Index with specific type
await db.createIndex('users', 'idx_name_fulltext', 'name', {
  type: 'FULLTEXT'
});

// Composite index for common queries
await db.createIndex('orders', 'idx_user_status_date', ['user_id', 'status', 'created_at']);
```

### Index Types

```javascript
// BTREE (default)
await db.createIndex('users', 'idx_created', 'created_at', {
  type: 'BTREE'
});

// HASH (for exact matches, memory tables)
await db.createIndex('sessions', 'idx_token_hash', 'token', {
  type: 'HASH'
});

// FULLTEXT (for text searching)
await db.createIndex('articles', 'idx_content_fulltext', ['title', 'content'], {
  type: 'FULLTEXT'
});

// SPATIAL (for geographic data)
await db.createIndex('locations', 'idx_coordinates', 'coordinates', {
  type: 'SPATIAL'
});
```

### Managing Indexes

```javascript
// Check if index exists
const exists = await db.indexExists('users', 'idx_email');
console.log('Index exists:', exists);

// List all indexes on a table
const indexes = await db.listIndexes('users');
console.log('Indexes on users table:');
indexes.forEach(idx => {
  console.log(`- ${idx.name}: ${idx.columns.join(', ')} (${idx.unique ? 'UNIQUE' : 'NON-UNIQUE'})`);
});

// Drop index
await db.dropIndex('users', 'idx_email');
```

### Index Strategies

```javascript
// For WHERE clauses
await db.createIndex('orders', 'idx_status', 'status');
// Speeds up: SELECT * FROM orders WHERE status = 'pending'

// For JOIN operations
await db.createIndex('order_items', 'idx_order_id', 'order_id');
// Speeds up: SELECT * FROM orders JOIN order_items ON orders.id = order_items.order_id

// For ORDER BY clauses
await db.createIndex('users', 'idx_created_desc', 'created_at');
// Speeds up: SELECT * FROM users ORDER BY created_at DESC

// For range queries
await db.createIndex('products', 'idx_price', 'price');
// Speeds up: SELECT * FROM products WHERE price BETWEEN 10 AND 100

// Composite index for multiple conditions
await db.createIndex('orders', 'idx_user_status', ['user_id', 'status']);
// Speeds up: SELECT * FROM orders WHERE user_id = 1 AND status = 'pending'
```

### Table Optimization

```javascript
// Analyze table for query optimization
await db.analyzeTable('users');

// Optimize table (defragment, update statistics)
await db.optimizeTable('users');

// Optimize multiple tables
const tables = ['users', 'orders', 'products'];
for (const table of tables) {
  console.log(`Optimizing ${table}...`);
  await db.optimizeTable(table);
}
```

### Complete Indexing Example

```javascript
// Setup indexes for an e-commerce database
async function setupIndexes(db) {
  console.log('Creating indexes...');
  
  // Users table
  await db.createIndex('users', 'idx_email', 'email', { unique: true });
  await db.createIndex('users', 'idx_status_created', ['status', 'created_at']);
  
  // Products table
  await db.createIndex('products', 'idx_category', 'category_id');
  await db.createIndex('products', 'idx_price', 'price');
  await db.createIndex('products', 'idx_stock', 'stock');
  await db.createIndex('products', 'idx_name_fulltext', ['name', 'description'], {
    type: 'FULLTEXT'
  });
  
  // Orders table
  await db.createIndex('orders', 'idx_user_id', 'user_id');
  await db.createIndex('orders', 'idx_status', 'status');
  await db.createIndex('orders', 'idx_created', 'created_at');
  await db.createIndex('orders', 'idx_user_status_date', ['user_id', 'status', 'created_at']);
  
  // Order items table
  await db.createIndex('order_items', 'idx_order_id', 'order_id');
  await db.createIndex('order_items', 'idx_product_id', 'product_id');
  
  console.log('Indexes created successfully');
  
  // Analyze tables
  console.log('Analyzing tables...');
  await db.analyzeTable('users');
  await db.analyzeTable('products');
  await db.analyzeTable('orders');
  await db.analyzeTable('order_items');
  
  console.log('Database optimization complete');
}

// Run setup
await setupIndexes(db);

// Later, check what indexes exist
const userIndexes = await db.listIndexes('users');
console.log('User table indexes:', userIndexes);
```

### Monitoring Index Usage

```javascript
// Check index effectiveness
const checkIndexUsage = async (table) => {
  const indexes = await db.listIndexes(table);
  console.log(`\nIndexes on ${table}:`);
  
  indexes.forEach(idx => {
    console.log(`- ${idx.name}:`);
    console.log(`  Columns: ${idx.columns.join(', ')}`);
    console.log(`  Type: ${idx.type}`);
    console.log(`  Unique: ${idx.unique}`);
  });
};

await checkIndexUsage('orders');
```

### Listen to Index Events

```javascript
db.on('indexCreated', ({ table, indexName, columns }) => {
  console.log(`Created index ${indexName} on ${table}(${columns})`);
});

db.on('indexDropped', ({ table, indexName }) => {
  console.log(`Dropped index ${indexName} from ${table}`);
});

db.on('tableAnalyzed', ({ table }) => {
  console.log(`Analyzed table ${table}`);
});

db.on('tableOptimized', ({ table }) => {
  console.log(`Optimized table ${table}`);
});
```

---

## Query Builder (Separate Module)

The QueryBuilder is now exported as a separate module for flexibility.

### Import QueryBuilder

```javascript
import MySQLHelper, { QueryBuilder } from 'mysql2-helper';

// Use with MySQLHelper instance
const db = new MySQLHelper({ /* config */ });
const query = db.queryBuilder();

// Or create standalone (advanced usage)
const standaloneQuery = new QueryBuilder(db);
```

### Enhanced Query Builder Methods

```javascript
// All previous methods plus new ones:

// whereNotIn
const users = await db.queryBuilder()
  .table('users')
  .whereNotIn('status', ['banned', 'deleted'])
  .get();

// whereNotBetween
const products = await db.queryBuilder()
  .table('products')
  .whereNotBetween('price', 10, 100)
  .get();

// whereLike - search patterns
const users = await db.queryBuilder()
  .table('users')
  .whereLike('email', '%@gmail.com')
  .get();

// whereNotLike
const users = await db.queryBuilder()
  .table('users')
  .whereNotLike('email', '%@spam.com')
  .get();

// whereRaw - custom conditions
const users = await db.queryBuilder()
  .table('users')
  .whereRaw('YEAR(created_at) = ?', [2024])
  .get();

// crossJoin
const cartesian = await db.queryBuilder()
  .table('colors')
  .crossJoin('sizes')
  .get();

// orderByRaw - custom ordering
const users = await db.queryBuilder()
  .table('users')
  .orderByRaw('FIELD(status, "premium", "active", "inactive")')
  .get();

// exists - check if records exist
const hasActiveUsers = await db.queryBuilder()
  .table('users')
  .where('status', 'active')
  .exists();

// clone - duplicate query builder
const baseQuery = db.queryBuilder()
  .table('users')
  .where('status', 'active');

const query1 = baseQuery.clone().where('age', '>', 18);
const query2 = baseQuery.clone().where('country', 'US');
```

### Advanced Query Builder Examples

```javascript
// Complex search with multiple conditions
const results = await db.queryBuilder()
  .table('products')
  .select('id', 'name', 'price', 'stock')
  .where('category_id', 5)
  .whereBetween('price', 10, 100)
  .whereNotNull('discount')
  .whereLike('name', '%phone%')
  .whereNotIn('status', ['discontinued', 'out_of_stock'])
  .orderBy('price', 'ASC')
  .limit(20)
  .get();

// Subquery simulation
const expensiveProducts = await db.queryBuilder()
  .table('products')
  .whereRaw('price > (SELECT AVG(price) FROM products)')
  .get();

// Using with pagination
const page = 2;
const perPage = 20;
const paginatedResults = await db.queryBuilder()
  .table('orders')
  .where('status', 'completed')
  .orderBy('created_at', 'DESC')
  .paginate(page, perPage);

console.log(paginatedResults.data);
console.log(paginatedResults.pagination);

// Reusable query patterns
class UserRepository {
  constructor(db) {
    this.db = db;
  }
  
  activeUsersQuery() {
    return this.db.queryBuilder()
      .table('users')
      .where('status', 'active')
      .whereNotNull('email_verified_at');
  }
  
  async getActiveUsers() {
    return await this.activeUsersQuery().get();
  }
  
  async getActiveUserCount() {
    return await this.activeUsersQuery().count();
  }
  
  async getActiveUsersPaginated(page, perPage) {
    return await this.activeUsersQuery()
      .orderBy('created_at', 'DESC')
      .paginate(page, perPage);
  }
}
```

### Integration Example

```javascript
// Complete workflow using all features
async function setupAndUseAdvancedFeatures() {
  const db = new MySQLHelper({
    host: 'localhost',
    user: 'root',
    password: 'password',
    database: 'mydb',
    timestamps: true, // Auto timestamps
    cache: true,
    logQueries: true
  });
  
  await db.createPool();
  
  // 1. Setup indexes
  await db.createIndex('users', 'idx_email', 'email', { unique: true });
  await db.createIndex('users', 'idx_status_created', ['status', 'created_at']);
  
  // 2. Create stored procedure
  await db.createProcedure(
    'GetUserStats',
    'IN userId INT',
    `
      SELECT 
        COUNT(*) as total_orders,
        SUM(total) as total_spent
      FROM orders
      WHERE user_id = userId AND status = 'completed';
    `
  );
  
  // 3. Insert with auto timestamps
  const userResult = await db.insert('users', {
    name: 'John Doe',
    email: 'john@example.com',
    status: 'active'
  });
  // Automatically includes created_at and updated_at
  
  // 4. Query with builder
  const activeUsers = await db.queryBuilder()
    .table('users')
    .where('status', 'active')
    .orderBy('created_at', 'DESC')
    .limit(10)
    .get();
  
  // 5. Call stored procedure
  const stats = await db.callProcedure('GetUserStats', [userResult.insertId]);
  
  // 6. Update with auto updated_at
  await db.update(
    'users',
    { name: 'John Updated' },
    { id: userResult.insertId }
  );
  // Automatically updates updated_at
  
  // 7. Check indexes
  const indexes = await db.listIndexes('users');
  console.log('Indexes:', indexes);
  
  // 8. Optimize
  await db.optimizeTable('users');
  
  await db.close();
}
```

---

## Summary of New Features

✅ **Automatic Timestamps**: Auto-add `created_at` and `updated_at`  
✅ **Stored Procedures**: Create, call, and manage procedures  
✅ **Index Management**: Create, drop, and optimize indexes  
✅ **Enhanced Query Builder**: More methods, pagination, cloning  
✅ **Separate Module**: QueryBuilder exported independently  
✅ **Table Optimization**: Analyze and optimize tables  
✅ **Full Event Support**: Listen to all database operations