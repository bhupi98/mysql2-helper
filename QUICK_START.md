# Quick Start Guide

Get started with mysql2-helper in 5 minutes!

## Installation

```bash
npm install mysql2-helper mysql2
```

## Basic Setup

```javascript
import MySQLHelper from 'mysql2-helper';

const db = new MySQLHelper({
  host: 'localhost',
  user: 'root',
  password: 'your_password',
  database: 'your_database'
});

await db.createPool();
```

## 1. Automatic Timestamps ⏰

Tables automatically get `created_at` and `updated_at` timestamps!

```sql
-- Create your table with timestamp columns
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

```javascript
// Insert - timestamps added automatically!
await db.insert('users', {
  name: 'John Doe',
  email: 'john@example.com'
});
// Automatically includes: created_at: NOW, updated_at: NOW

// Update - updated_at refreshed automatically!
await db.update('users', 
  { name: 'John Updated' },
  { id: 1 }
);
// Automatically updates: updated_at: NOW
```

## 2. Simple CRUD Operations

```javascript
// INSERT
const result = await db.insert('users', {
  name: 'Alice',
  email: 'alice@example.com'
});
console.log('New user ID:', result.insertId);

// SELECT
const users = await db.select('users', {
  where: { status: 'active' },
  orderBy: 'created_at DESC',
  limit: 10
});

// UPDATE
await db.update('users',
  { status: 'inactive' },
  { id: 1 }
);

// DELETE
await db.delete('users', { id: 1 });

// FIND ONE
const user = await db.findOne('users', { email: 'alice@example.com' });
```

## 3. Query Builder 🔨

Build complex queries easily:

```javascript
// Simple query
const activeUsers = await db.queryBuilder()
  .table('users')
  .where('status', 'active')
  .orderBy('created_at', 'DESC')
  .limit(10)
  .get();

// Complex query with joins
const orders = await db.queryBuilder()
  .table('orders')
  .select('orders.*', 'users.name', 'users.email')
  .join('users', 'orders.user_id', '=', 'users.id')
  .where('orders.status', 'completed')
  .whereBetween('orders.total', 100, 1000)
  .orderBy('orders.created_at', 'DESC')
  .get();

// Pagination
const result = await db.queryBuilder()
  .table('products')
  .where('category', 'electronics')
  .paginate(1, 20); // page 1, 20 items per page

console.log(result.data); // Products
console.log(result.pagination); // Pagination info
```

## 4. Transactions 💳

Safe multi-step operations:

```javascript
await db.transaction(async (conn) => {
  // Deduct from account 1
  await conn.execute(
    'UPDATE accounts SET balance = balance - ? WHERE id = ?',
    [100, 1]
  );
  
  // Add to account 2
  await conn.execute(
    'UPDATE accounts SET balance = balance + ? WHERE id = ?',
    [100, 2]
  );
  
  // Log transaction
  await conn.execute(
    'INSERT INTO transactions (from_id, to_id, amount) VALUES (?, ?, ?)',
    [1, 2, 100]
  );
});
// Auto-commits on success, auto-rollback on error!
```

## 5. Batch Processing 📦

Process large datasets efficiently:

```javascript
// Prepare 10,000 records
const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
  name: `User ${i}`,
  email: `user${i}@example.com`
}));

// Insert in batches of 1000
const result = await db.batchInsert('users', largeDataset, 1000);
console.log(`Inserted ${result.totalInserted} records in ${result.totalBatches} batches`);
```

## 6. Stored Procedures 🔧

```javascript
// Create a procedure
await db.createProcedure(
  'GetActiveUsers',
  '', // No parameters
  'SELECT * FROM users WHERE status = "active";'
);

// Call the procedure
const activeUsers = await db.callProcedure('GetActiveUsers');

// With parameters
await db.createProcedure(
  'GetUsersByStatus',
  'IN userStatus VARCHAR(50)',
  'SELECT * FROM users WHERE status = userStatus;'
);

const users = await db.callProcedure('GetUsersByStatus', ['premium']);
```

## 7. Index Management 🚀

Optimize your queries with indexes:

```javascript
// Create index on email column
await db.createIndex('users', 'idx_email', 'email', { unique: true });

// Create composite index
await db.createIndex('orders', 'idx_user_status', ['user_id', 'status']);

// List all indexes
const indexes = await db.listIndexes('users');
console.log('Indexes:', indexes);

// Optimize table
await db.optimizeTable('users');
```

## 8. Monitoring & Events 📊

Track everything that happens:

```javascript
// Log slow queries
db.on('queryExecuted', ({ sql, executionTime }) => {
  if (executionTime > 1000) {
    console.warn(`Slow query (${executionTime}ms):`, sql);
  }
});

// Monitor batch progress
db.on('batchProgress', ({ current, total, processedRows }) => {
  console.log(`Progress: ${Math.round((current/total)*100)}%`);
});

// Track cache hits
db.on('cacheHit', () => {
  console.log('✅ Cache hit!');
});
```

## 9. Caching 💾

Speed up repeated queries:

```javascript
const db = new MySQLHelper({
  // ... config
  cache: true,           // Enable caching
  cacheTTL: 300000      // Cache for 5 minutes
});

// First call - hits database
const categories = await db.select('categories');

// Second call - from cache! ⚡
const categoriesAgain = await db.select('categories');

// Disable cache for specific query
const liveData = await db.query(
  'SELECT * FROM live_inventory',
  [],
  { cache: false }
);
```

## 10. Pagination 📄

Built-in pagination support:

```javascript
// Method 1: Using helper
const result = await db.paginate('users', {
  page: 1,
  perPage: 20,
  where: { status: 'active' },
  orderBy: 'created_at DESC'
});

console.log(result.data); // Users array
console.log(result.pagination);
// {
//   currentPage: 1,
//   perPage: 20,
//   totalItems: 150,
//   totalPages: 8,
//   hasNextPage: true,
//   hasPrevPage: false
// }

// Method 2: Using query builder
const result = await db.queryBuilder()
  .table('products')
  .where('category', 'electronics')
  .paginate(2, 25); // page 2, 25 per page
```

## Complete Example: E-commerce Order

```javascript
import MySQLHelper from 'mysql2-helper';

const db = new MySQLHelper({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'shop',
  timestamps: true,  // Auto timestamps
  cache: true,       // Enable caching
  logQueries: true   // Log all queries
});

await db.createPool();

// Create an order with transaction
async function createOrder(userId, items) {
  return await db.transaction(async (conn) => {
    // 1. Create order (with auto timestamps!)
    const [orderResult] = await conn.execute(
      'INSERT INTO orders (user_id, total, status) VALUES (?, ?, ?)',
      [userId, calculateTotal(items), 'pending']
    );
    
    // 2. Add order items
    for (const item of items) {
      await conn.execute(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderResult.insertId, item.productId, item.quantity, item.price]
      );
      
      // 3. Update inventory
      await conn.execute(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.productId]
      );
    }
    
    return orderResult.insertId;
  });
}

// Get orders with query builder
async function getUserOrders(userId, page = 1) {
  return await db.queryBuilder()
    .table('orders')
    .select('orders.*', 'users.name', 'users.email')
    .join('users', 'orders.user_id', '=', 'users.id')
    .where('orders.user_id', userId)
    .orderBy('orders.created_at', 'DESC')
    .paginate(page, 10);
}

// Use it
const orderId = await createOrder(1, [
  { productId: 101, quantity: 2, price: 29.99 },
  { productId: 102, quantity: 1, price: 49.99 }
]);

console.log('Order created:', orderId);

const userOrders = await getUserOrders(1);
console.log('User orders:', userOrders.data);
console.log('Pagination:', userOrders.pagination);

await db.close();
```

## Disable Timestamps (Optional)

```javascript
// Globally disable
const db = new MySQLHelper({
  // ... config
  timestamps: false
});

// Or skip for specific operations
await db.insert('logs', { message: 'test' }, { skipTimestamps: true });
await db.update('logs', { processed: true }, { id: 1 }, { skipTimestamps: true });
```

## Next Steps

- Read the [Complete Documentation](./README.md)
- Check [Advanced Features](./ADVANCED_FEATURES.md)
- Review [Best Practices](./BEST_PRACTICES.md)
- See [Testing Guide](./TEST.md)

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/yourusername/mysql2-helper/issues)
- Documentation: [Full API Reference](./README.md)

---

**That's it! You're ready to build production applications with mysql2-helper! 🚀**