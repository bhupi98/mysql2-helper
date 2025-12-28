# Best Practices & Production Guide

## Table of Contents
1. [Connection Management](#connection-management)
2. [Error Handling](#error-handling)
3. [Performance Optimization](#performance-optimization)
4. [Security](#security)
5. [Monitoring & Logging](#monitoring--logging)
6. [Transaction Best Practices](#transaction-best-practices)
7. [Caching Strategy](#caching-strategy)
8. [Testing](#testing)
9. [Deployment](#deployment)

---

## Connection Management

### Use Connection Pooling

Always use connection pooling in production:

```javascript
// ✅ Good - Use connection pool
const db = new MySQLHelper({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0
});

await db.createPool();

// ❌ Bad - Single connection for production
await db.connect();
```

### Configure Appropriate Pool Size

```javascript
const poolSize = {
  development: 5,
  staging: 10,
  production: 20
}[process.env.NODE_ENV] || 10;

const db = new MySQLHelper({
  // ... other config
  connectionLimit: poolSize,
  connectTimeout: 10000,
  acquireTimeout: 10000
});
```

### Implement Graceful Shutdown

```javascript
const shutdown = async (signal) => {
  console.log(`${signal} received. Closing database connections...`);
  
  try {
    await db.close();
    console.log('Database connections closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error closing database:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### Monitor Connection Pool

```javascript
// Set up periodic health checks
setInterval(async () => {
  const status = await db.getPoolStatus();
  
  if (!status) return;
  
  const utilizationPercent = ((status.totalConnections - status.freeConnections) / status.totalConnections) * 100;
  
  if (utilizationPercent > 80) {
    console.warn(`⚠️  High connection pool utilization: ${utilizationPercent.toFixed(1)}%`);
  }
  
  if (status.queuedRequests > 0) {
    console.warn(`⚠️  ${status.queuedRequests} requests queued`);
  }
}, 30000); // Check every 30 seconds
```

---

## Error Handling

### Use Try-Catch Blocks

```javascript
// ✅ Good
try {
  const result = await db.insert('users', userData);
  return { success: true, userId: result.insertId };
} catch (error) {
  logger.error('Failed to create user:', error);
  
  if (error.code === 'ER_DUP_ENTRY') {
    throw new Error('User with this email already exists');
  }
  
  throw new Error('Failed to create user');
}

// ❌ Bad - No error handling
const result = await db.insert('users', userData);
```

### Implement Global Error Hook

```javascript
db.addHook('onError', async (data) => {
  // Log to error tracking service
  await errorTracker.captureException(data.error, {
    sql: data.sql,
    params: data.params,
    timestamp: data.timestamp
  });
  
  // Send alerts for critical errors
  if (isCriticalError(data.error)) {
    await alertService.notify({
      level: 'critical',
      message: `Database error: ${data.error.message}`,
      context: { sql: data.sql }
    });
  }
});
```

### Handle Specific MySQL Errors

```javascript
const handleDatabaseError = (error) => {
  const errorCodes = {
    'ER_DUP_ENTRY': 'Duplicate entry',
    'ER_NO_REFERENCED_ROW': 'Referenced record not found',
    'ER_ROW_IS_REFERENCED': 'Cannot delete: record is referenced',
    'ER_BAD_NULL_ERROR': 'Required field is missing',
    'ER_DATA_TOO_LONG': 'Data too long for field',
    'PROTOCOL_CONNECTION_LOST': 'Connection lost',
    'ER_LOCK_WAIT_TIMEOUT': 'Lock wait timeout'
  };
  
  if (errorCodes[error.code]) {
    return new Error(errorCodes[error.code]);
  }
  
  return error;
};

try {
  await db.insert('users', userData);
} catch (error) {
  throw handleDatabaseError(error);
}
```

---

## Performance Optimization

### Use Batch Operations

```javascript
// ✅ Good - Batch insert
const users = [...]; // 10,000 records
await db.batchInsert('users', users, 1000);

// ❌ Bad - Individual inserts
for (const user of users) {
  await db.insert('users', user);
}
```

### Implement Query Caching

```javascript
const db = new MySQLHelper({
  // ... config
  cache: true,
  cacheTTL: 300000 // 5 minutes
});

// Cache read-heavy queries
const categories = await db.select('categories', {
  // Results cached automatically
});

// Disable cache for real-time data
const liveData = await db.query(
  'SELECT * FROM live_data',
  [],
  { cache: false }
);
```

### Use Query Builder for Complex Queries

```javascript
// ✅ Good - Query builder (easier to optimize)
const users = await db.queryBuilder()
  .table('users')
  .select('id', 'name', 'email') // Only select needed columns
  .where('status', 'active')
  .where('created_at', '>', lastWeek)
  .limit(100)
  .get();

// ❌ Bad - Select *
const users = await db.select('users');
```

### Monitor Slow Queries

```javascript
db.addHook('afterQuery', async (data) => {
  if (data.executionTime > 1000) {
    logger.warn('Slow query detected', {
      sql: data.sql,
      params: data.params,
      executionTime: data.executionTime
    });
    
    // Analyze and optimize
    await analyzeQuery(data.sql);
  }
});

// Periodic slow query report
setInterval(() => {
  const slowQueries = db.getSlowQueries(500); // > 500ms
  
  if (slowQueries.length > 0) {
    logger.info(`Found ${slowQueries.length} slow queries`);
    
    // Generate report
    const report = slowQueries.map(q => ({
      sql: q.sql,
      avgTime: q.executionTime,
      count: 1
    }));
    
    console.table(report);
  }
  
  db.clearQueryLog();
}, 3600000); // Every hour
```

### Index Your Tables

```sql
-- Add indexes for frequently queried columns
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- Composite indexes for multi-column queries
CREATE INDEX idx_users_status_created ON users(status, created_at);
```

---

## Security

### Use Environment Variables

```javascript
// ✅ Good
const db = new MySQLHelper({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// ❌ Bad - Hardcoded credentials
const db = new MySQLHelper({
  host: 'localhost',
  user: 'root',
  password: 'password123'
});
```

### Always Use Parameterized Queries

```javascript
// ✅ Good - Parameterized
const email = req.body.email;
const users = await db.query(
  'SELECT * FROM users WHERE email = ?',
  [email]
);

// ❌ Bad - SQL injection vulnerable
const users = await db.query(
  `SELECT * FROM users WHERE email = '${email}'`
);
```

### Validate Input Data

```javascript
const validateUserInput = (data) => {
  const schema = {
    name: { type: 'string', required: true, maxLength: 255 },
    email: { type: 'email', required: true },
    age: { type: 'number', min: 0, max: 150 }
  };
  
  // Validate against schema
  const errors = validate(data, schema);
  if (errors.length > 0) {
    throw new Error('Invalid input data');
  }
  
  return data;
};

// Use validation
try {
  const validData = validateUserInput(req.body);
  await db.insert('users', validData);
} catch (error) {
  res.status(400).json({ error: error.message });
}
```

### Limit Database Permissions

```sql
-- Create limited user for application
CREATE USER 'app_user'@'%' IDENTIFIED BY 'secure_password';

-- Grant only necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON mydb.* TO 'app_user'@'%';

-- Don't grant DROP, CREATE, ALTER to application user
REVOKE DROP, CREATE, ALTER ON mydb.* FROM 'app_user'@'%';

FLUSH PRIVILEGES;
```

---

## Monitoring & Logging

### Implement Comprehensive Logging

```javascript
const db = new MySQLHelper({
  // ... config
  logQueries: process.env.NODE_ENV !== 'production'
});

// Setup logging hooks
db.addHook('beforeQuery', async (data) => {
  logger.debug('Executing query', {
    sql: data.sql.substring(0, 100),
    params: data.params
  });
});

db.addHook('afterQuery', async (data) => {
  logger.info('Query completed', {
    sql: data.sql.substring(0, 100),
    executionTime: data.executionTime,
    rowCount: data.rows.length
  });
  
  // Send metrics
  metrics.histogram('db.query.duration', data.executionTime, {
    query_type: getQueryType(data.sql)
  });
});

db.addHook('onError', async (data) => {
  logger.error('Query failed', {
    sql: data.sql,
    params: data.params,
    error: data.error.message,
    stack: data.error.stack
  });
});
```

### Setup Metrics Collection

```javascript
// Track query performance
db.on('queryExecuted', ({ sql, executionTime, rowCount }) => {
  metrics.increment('db.queries.total');
  metrics.histogram('db.query.duration', executionTime);
  metrics.histogram('db.query.rows', rowCount);
  
  const queryType = sql.trim().split(' ')[0].toUpperCase();
  metrics.increment(`db.queries.${queryType.toLowerCase()}`);
});

// Track connection pool
setInterval(async () => {
  const status = await db.getPoolStatus();
  if (status) {
    metrics.gauge('db.pool.total', status.totalConnections);
    metrics.gauge('db.pool.free', status.freeConnections);
    metrics.gauge('db.pool.queued', status.queuedRequests);
  }
}, 10000);

// Track cache performance
let cacheHits = 0;
let cacheMisses = 0;

db.on('cacheHit', () => {
  cacheHits++;
  metrics.increment('db.cache.hits');
});

db.on('queryExecuted', () => {
  cacheMisses++;
  metrics.increment('db.cache.misses');
});

setInterval(() => {
  const hitRate = (cacheHits / (cacheHits + cacheMisses)) * 100;
  metrics.gauge('db.cache.hit_rate', hitRate);
  cacheHits = 0;
  cacheMisses = 0;
}, 60000);
```

### Create Health Check Endpoint

```javascript
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {}
    };
    
    // Database check
    try {
      await db.testConnection();
      health.checks.database = { status: 'up', latency: 0 };
    } catch (error) {
      health.status = 'unhealthy';
      health.checks.database = { status: 'down', error: error.message };
    }
    
    // Pool check
    const poolStatus = await db.getPoolStatus();
    if (poolStatus) {
      health.checks.pool = {
        status: poolStatus.freeConnections > 0 ? 'healthy' : 'degraded',
        ...poolStatus
      };
    }
    
    // Slow query check
    const slowQueries = db.getSlowQueries(1000);
    if (slowQueries.length > 10) {
      health.status = 'degraded';
      health.warnings = [`${slowQueries.length} slow queries detected`];
    }
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

---

## Transaction Best Practices

### Keep Transactions Short

```javascript
// ✅ Good - Short transaction
await db.transaction(async (conn) => {
  await conn.execute('UPDATE accounts SET balance = balance - 100 WHERE id = 1');
  await conn.execute('UPDATE accounts SET balance = balance + 100 WHERE id = 2');
});

// ❌ Bad - Long transaction with external API calls
await db.transaction(async (conn) => {
  await conn.execute('INSERT INTO orders ...');
  await sendEmail(); // External call - don't do this!
  await processPayment(); // External call - don't do this!
  await conn.execute('UPDATE inventory ...');
});
```

### Handle Transaction Errors

```javascript
try {
  const result = await db.transaction(async (conn) => {
    const [order] = await conn.execute('INSERT INTO orders ...');
    await conn.execute('UPDATE inventory ...');
    return order.insertId;
  });
  
  // Transaction successful - now do external operations
  await sendEmail(result);
  await processPayment(result);
  
} catch (error) {
  logger.error('Transaction failed:', error);
  // Transaction automatically rolled back
  throw error;
}
```

### Use Appropriate Isolation Levels

```javascript
// For critical operations requiring consistency
const conn = await db.beginTransaction();
await conn.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

try {
  // Your transactional operations
  await conn.commit();
} catch (error) {
  await conn.rollback();
  throw error;
}
```

---

## Caching Strategy

### Cache Static/Rarely Changing Data

```javascript
// Good candidates for caching
await db.select('countries', { cache: true });
await db.select('categories', { cache: true });
await db.select('settings', { cache: true });

// Don't cache frequently updated data
await db.select('orders', { cache: false });
await db.select('live_inventory', { cache: false });
```

### Implement Cache Invalidation

```javascript
// Clear cache on updates
await db.update('categories', { name: 'New Name' }, { id: 1 });
db.clearCache(); // Invalidate all cache

// Or implement selective cache invalidation
const cacheKeys = new Map();

db.addHook('beforeQuery', (data) => {
  const key = getCacheKey(data.sql, data.params);
  cacheKeys.set(key, data);
});

// Invalidate specific cache on update
await db.update('users', { name: 'Updated' }, { id: 1 });
invalidateCacheForTable('users');
```

---

## Testing

### Use Separate Test Database

```javascript
const getDbConfig = () => {
  if (process.env.NODE_ENV === 'test') {
    return {
      host: 'localhost',
      user: 'test_user',
      password: 'test_password',
      database: 'test_db'
    };
  }
  
  return {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  };
};
```

### Clean Database Between Tests

```javascript
beforeEach(async () => {
  // Truncate all tables
  const tables = await db.getTables();
  for (const table of tables) {
    await db.truncate(table);
  }
});
```

---

## Deployment

### Use Connection Strings

```javascript
// .env file
DATABASE_URL=mysql://user:password@host:3306/database

// Parse connection string
const parseConnectionString = (url) => {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || 3306,
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.slice(1)
  };
};

const db = new MySQLHelper(parseConnectionString(process.env.DATABASE_URL));
```

### Implement Database Migrations

Create a migrations system to manage schema changes:

```javascript
// migrations/001_create_users.js
export const up = async (db) => {
  await db.query(`
    CREATE TABLE users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

export const down = async (db) => {
  await db.query('DROP TABLE users');
};
```

### Use Read Replicas

```javascript
const primaryDB = new MySQLHelper({
  host: process.env.DB_PRIMARY_HOST,
  // ... config
});

const replicaDB = new MySQLHelper({
  host: process.env.DB_REPLICA_HOST,
  // ... config
});

// Write to primary
await primaryDB.insert('users', userData);

// Read from replica
const users = await replicaDB.select('users');
```

---

## Checklist for Production

- [ ] Connection pooling configured
- [ ] Environment variables for credentials
- [ ] Error handling implemented
- [ ] Logging and monitoring setup
- [ ] Slow query detection enabled
- [ ] Health check endpoint created
- [ ] Graceful shutdown implemented
- [ ] Database indexes optimized
- [ ] Caching strategy defined
- [ ] Backup strategy in place
- [ ] Migration system ready
- [ ] Test coverage adequate
- [ ] Documentation updated