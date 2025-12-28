# Testing Guide

This guide provides examples of how to test your application that uses mysql2-helper.

## Setup Test Database

First, create a separate test database:

```sql
CREATE DATABASE test_db;
USE test_db;

CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## Unit Testing Examples

### Basic CRUD Tests

```javascript
import MySQLHelper from 'mysql2-helper';

describe('MySQLHelper CRUD Operations', () => {
  let db;
  
  beforeAll(async () => {
    db = new MySQLHelper({
      host: 'localhost',
      user: 'test_user',
      password: 'test_password',
      database: 'test_db'
    });
    await db.createPool();
  });
  
  afterAll(async () => {
    await db.close();
  });
  
  beforeEach(async () => {
    // Clean database before each test
    await db.truncate('users');
    await db.truncate('orders');
  });

  describe('INSERT operations', () => {
    test('should insert a single user', async () => {
      const result = await db.insert('users', {
        name: 'John Doe',
        email: 'john@example.com'
      });
      
      expect(result.insertId).toBeGreaterThan(0);
      expect(result.affectedRows).toBe(1);
      
      const user = await db.findById('users', result.insertId);
      expect(user.name).toBe('John Doe');
      expect(user.email).toBe('john@example.com');
    });

    test('should insert multiple users', async () => {
      const users = [
        { name: 'Alice', email: 'alice@example.com' },
        { name: 'Bob', email: 'bob@example.com' }
      ];
      
      const result = await db.insertMany('users', users);
      expect(result.affectedRows).toBe(2);
      
      const count = await db.count('users');
      expect(count).toBe(2);
    });

    test('should handle duplicate email error', async () => {
      await db.insert('users', {
        name: 'John',
        email: 'duplicate@example.com'
      });
      
      await expect(
        db.insert('users', {
          name: 'Jane',
          email: 'duplicate@example.com'
        })
      ).rejects.toThrow();
    });
  });

  describe('SELECT operations', () => {
    beforeEach(async () => {
      await db.insertMany('users', [
        { name: 'Alice', email: 'alice@example.com', status: 'active' },
        { name: 'Bob', email: 'bob@example.com', status: 'inactive' },
        { name: 'Charlie', email: 'charlie@example.com', status: 'active' }
      ]);
    });

    test('should select all users', async () => {
      const users = await db.select('users');
      expect(users).toHaveLength(3);
    });

    test('should select users with WHERE clause', async () => {
      const activeUsers = await db.select('users', {
        where: { status: 'active' }
      });
      expect(activeUsers).toHaveLength(2);
    });

    test('should select with LIMIT', async () => {
      const users = await db.select('users', { limit: 2 });
      expect(users).toHaveLength(2);
    });

    test('should find user by ID', async () => {
      const result = await db.insert('users', {
        name: 'Test User',
        email: 'test@example.com'
      });
      
      const user = await db.findById('users', result.insertId);
      expect(user).toBeTruthy();
      expect(user.name).toBe('Test User');
    });

    test('should find one user', async () => {
      const user = await db.findOne('users', { email: 'alice@example.com' });
      expect(user).toBeTruthy();
      expect(user.name).toBe('Alice');
    });

    test('should check if user exists', async () => {
      const exists = await db.exists('users', { email: 'alice@example.com' });
      expect(exists).toBe(true);
      
      const notExists = await db.exists('users', { email: 'nobody@example.com' });
      expect(notExists).toBe(false);
    });
  });

  describe('UPDATE operations', () => {
    test('should update user', async () => {
      const result = await db.insert('users', {
        name: 'John',
        email: 'john@example.com'
      });
      
      const updateResult = await db.update(
        'users',
        { name: 'John Updated' },
        { id: result.insertId }
      );
      
      expect(updateResult.affectedRows).toBe(1);
      
      const user = await db.findById('users', result.insertId);
      expect(user.name).toBe('John Updated');
    });
  });

  describe('DELETE operations', () => {
    test('should delete user', async () => {
      const result = await db.insert('users', {
        name: 'John',
        email: 'john@example.com'
      });
      
      const deleteResult = await db.delete('users', { id: result.insertId });
      expect(deleteResult.affectedRows).toBe(1);
      
      const user = await db.findById('users', result.insertId);
      expect(user).toBeNull();
    });
  });
});
```

### Query Builder Tests

```javascript
describe('Query Builder', () => {
  let db;
  
  beforeAll(async () => {
    db = new MySQLHelper({
      host: 'localhost',
      user: 'test_user',
      password: 'test_password',
      database: 'test_db'
    });
    await db.createPool();
  });
  
  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.truncate('users');
    await db.insertMany('users', [
      { name: 'Alice', email: 'alice@example.com', status: 'active' },
      { name: 'Bob', email: 'bob@example.com', status: 'inactive' },
      { name: 'Charlie', email: 'charlie@example.com', status: 'active' }
    ]);
  });

  test('should build simple SELECT query', async () => {
    const users = await db.queryBuilder()
      .table('users')
      .select('id', 'name')
      .where('status', 'active')
      .get();
    
    expect(users).toHaveLength(2);
    expect(users[0]).toHaveProperty('name');
    expect(users[0]).not.toHaveProperty('email');
  });

  test('should use WHERE IN clause', async () => {
    const users = await db.queryBuilder()
      .table('users')
      .whereIn('name', ['Alice', 'Bob'])
      .get();
    
    expect(users).toHaveLength(2);
  });

  test('should use ORDER BY', async () => {
    const users = await db.queryBuilder()
      .table('users')
      .orderBy('name', 'DESC')
      .get();
    
    expect(users[0].name).toBe('Charlie');
  });

  test('should get first result', async () => {
    const user = await db.queryBuilder()
      .table('users')
      .where('email', 'alice@example.com')
      .first();
    
    expect(user).toBeTruthy();
    expect(user.name).toBe('Alice');
  });

  test('should count results', async () => {
    const count = await db.queryBuilder()
      .table('users')
      .where('status', 'active')
      .count();
    
    expect(count).toBe(2);
  });
});
```

### Transaction Tests

```javascript
describe('Transactions', () => {
  let db;
  
  beforeAll(async () => {
    db = new MySQLHelper({
      host: 'localhost',
      user: 'test_user',
      password: 'test_password',
      database: 'test_db'
    });
    await db.createPool();
  });
  
  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.truncate('users');
    await db.truncate('orders');
  });

  test('should commit transaction on success', async () => {
    const usersBefore = await db.count('users');
    
    await db.transaction(async (conn) => {
      const [result] = await conn.execute(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        ['John', 'john@example.com']
      );
      
      await conn.execute(
        'INSERT INTO orders (user_id, total) VALUES (?, ?)',
        [result.insertId, 99.99]
      );
    });
    
    const usersAfter = await db.count('users');
    const ordersAfter = await db.count('orders');
    
    expect(usersAfter).toBe(usersBefore + 1);
    expect(ordersAfter).toBe(1);
  });

  test('should rollback transaction on error', async () => {
    const usersBefore = await db.count('users');
    
    await expect(
      db.transaction(async (conn) => {
        await conn.execute(
          'INSERT INTO users (name, email) VALUES (?, ?)',
          ['John', 'john@example.com']
        );
        
        // This will fail due to invalid foreign key
        await conn.execute(
          'INSERT INTO orders (user_id, total) VALUES (?, ?)',
          [99999, 99.99]
        );
      })
    ).rejects.toThrow();
    
    const usersAfter = await db.count('users');
    expect(usersAfter).toBe(usersBefore); // No change
  });
});
```

### Batch Processing Tests

```javascript
describe('Batch Processing', () => {
  let db;
  
  beforeAll(async () => {
    db = new MySQLHelper({
      host: 'localhost',
      user: 'test_user',
      password: 'test_password',
      database: 'test_db'
    });
    await db.createPool();
  });
  
  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.truncate('users');
  });

  test('should batch insert records', async () => {
    const largeDataset = Array.from({ length: 5000 }, (_, i) => ({
      name: `User ${i}`,
      email: `user${i}@example.com`
    }));
    
    const result = await db.batchInsert('users', largeDataset, 1000);
    
    expect(result.totalInserted).toBe(5000);
    expect(result.totalBatches).toBe(5);
    
    const count = await db.count('users');
    expect(count).toBe(5000);
  });

  test('should emit batch progress events', async () => {
    const progressEvents = [];
    
    db.on('batchProgress', (data) => {
      progressEvents.push(data);
    });
    
    const data = Array.from({ length: 3000 }, (_, i) => ({
      name: `User ${i}`,
      email: `user${i}@example.com`
    }));
    
    await db.batchInsert('users', data, 1000);
    
    expect(progressEvents).toHaveLength(3);
    expect(progressEvents[2].current).toBe(3);
    expect(progressEvents[2].total).toBe(3);
  });
});
```

### Hooks and Events Tests

```javascript
describe('Hooks and Events', () => {
  let db;
  
  beforeAll(async () => {
    db = new MySQLHelper({
      host: 'localhost',
      user: 'test_user',
      password: 'test_password',
      database: 'test_db',
      logQueries: true
    });
    await db.createPool();
  });
  
  afterAll(async () => {
    await db.close();
  });

  test('should trigger beforeQuery hook', async () => {
    let hookCalled = false;
    
    db.addHook('beforeQuery', async (data) => {
      hookCalled = true;
      expect(data).toHaveProperty('sql');
      expect(data).toHaveProperty('params');
    });
    
    await db.select('users');
    expect(hookCalled).toBe(true);
  });

  test('should trigger afterQuery hook', async () => {
    let executionTime = 0;
    
    db.addHook('afterQuery', async (data) => {
      executionTime = data.executionTime;
    });
    
    await db.select('users');
    expect(executionTime).toBeGreaterThan(0);
  });

  test('should trigger queryExecuted event', (done) => {
    db.once('queryExecuted', (data) => {
      expect(data).toHaveProperty('sql');
      expect(data).toHaveProperty('executionTime');
      done();
    });
    
    db.select('users');
  });

  test('should log queries when enabled', async () => {
    db.clearQueryLog();
    
    await db.select('users');
    await db.select('orders');
    
    const logs = db.getQueryLog();
    expect(logs).toHaveLength(2);
    expect(logs[0]).toHaveProperty('sql');
    expect(logs[0]).toHaveProperty('executionTime');
  });
});
```

### Caching Tests

```javascript
describe('Caching', () => {
  let db;
  
  beforeAll(async () => {
    db = new MySQLHelper({
      host: 'localhost',
      user: 'test_user',
      password: 'test_password',
      database: 'test_db',
      cache: true,
      cacheTTL: 1000
    });
    await db.createPool();
  });
  
  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    db.clearCache();
    await db.truncate('users');
  });

  test('should cache query results', async () => {
    await db.insert('users', { name: 'John', email: 'john@example.com' });
    
    const cacheHits = [];
    db.on('cacheHit', (data) => cacheHits.push(data));
    
    // First call - not cached
    await db.select('users');
    expect(cacheHits).toHaveLength(0);
    
    // Second call - should hit cache
    await db.select('users');
    expect(cacheHits).toHaveLength(1);
  });

  test('should respect cacheTTL', async () => {
    await db.insert('users', { name: 'John', email: 'john@example.com' });
    
    // First call
    await db.select('users');
    
    // Wait for cache to expire
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const cacheHits = [];
    db.on('cacheHit', (data) => cacheHits.push(data));
    
    // Should not hit cache after expiry
    await db.select('users');
    expect(cacheHits).toHaveLength(0);
  });

  test('should allow disabling cache per query', async () => {
    await db.insert('users', { name: 'John', email: 'john@example.com' });
    
    // First call with cache
    await db.query('SELECT * FROM users');
    
    const cacheHits = [];
    db.on('cacheHit', (data) => cacheHits.push(data));
    
    // Second call without cache
    await db.query('SELECT * FROM users', [], { cache: false });
    expect(cacheHits).toHaveLength(0);
  });
});
```

## Integration Testing

```javascript
describe('Integration Tests', () => {
  let db;
  
  beforeAll(async () => {
    db = new MySQLHelper({
      host: 'localhost',
      user: 'test_user',
      password: 'test_password',
      database: 'test_db'
    });
    await db.createPool();
  });
  
  afterAll(async () => {
    await db.close();
  });

  test('complete user registration flow', async () => {
    // Register user
    const userResult = await db.insert('users', {
      name: 'John Doe',
      email: 'john@example.com',
      status: 'active'
    });
    
    // Create order for user
    const orderResult = await db.insert('orders', {
      user_id: userResult.insertId,
      total: 99.99,
      status: 'pending'
    });
    
    // Get user with orders using query builder
    const orders = await db.queryBuilder()
      .table('orders')
      .select('orders.*', 'users.name', 'users.email')
      .join('users', 'orders.user_id', '=', 'users.id')
      .where('users.id', userResult.insertId)
      .get();
    
    expect(orders).toHaveLength(1);
    expect(orders[0].name).toBe('John Doe');
    expect(orders[0].total).toBe('99.99');
  });
});
```

## Performance Testing

```javascript
describe('Performance Tests', () => {
  let db;
  
  beforeAll(async () => {
    db = new MySQLHelper({
      host: 'localhost',
      user: 'test_user',
      password: 'test_password',
      database: 'test_db',
      logQueries: true
    });
    await db.createPool();
  });
  
  afterAll(async () => {
    await db.close();
  });

  test('should handle large batch inserts efficiently', async () => {
    const startTime = Date.now();
    
    const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
      name: `User ${i}`,
      email: `user${i}@example.com`
    }));
    
    await db.batchInsert('users', largeDataset, 1000);
    
    const duration = Date.now() - startTime;
    console.log(`Inserted 10,000 records in ${duration}ms`);
    
    expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
  });

  test('should identify slow queries', async () => {
    db.clearQueryLog();
    
    // Run some queries
    await db.select('users', { limit: 1000 });
    
    const slowQueries = db.getSlowQueries(100);
    console.log(`Found ${slowQueries.length} slow queries`);
  });
});
```

## Running Tests

```bash
# Install dependencies
npm install --save-dev jest

# Run all tests
npm test

# Run specific test file
npm test -- CRUD.test.js

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```