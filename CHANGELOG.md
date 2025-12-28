# Changelog

All notable changes to this project will be documented in this file.

## [2.1.0] - 2024-12-28

### Added

#### Automatic Timestamps
- **Automatic `created_at` and `updated_at`**: Automatically add timestamps to INSERT and UPDATE operations
  - Enabled by default, can be disabled with `timestamps: false`
  - Configurable column names via `createdAtColumn` and `updatedAtColumn`
  - Per-operation control with `skipTimestamps` option
- New hooks: `beforeInsert`, `afterInsert`, `beforeUpdate`, `afterUpdate`

#### Stored Procedures
- `callProcedure()`: Execute stored procedures with parameters
- `createProcedure()`: Create new stored procedures
- `dropProcedure()`: Remove stored procedures
- `procedureExists()`: Check if procedure exists
- `listProcedures()`: Get all procedures in database
- Support for multiple result sets from procedures
- Events: `procedureCalled`, `procedureCreated`, `procedureDropped`

#### Index Management
- `createIndex()`: Create indexes with options (unique, type: BTREE/HASH/FULLTEXT/SPATIAL)
- `dropIndex()`: Remove indexes
- `indexExists()`: Check if index exists
- `listIndexes()`: Get all indexes for a table with metadata
- `analyzeTable()`: Update table statistics for query optimization
- `optimizeTable()`: Defragment and optimize table storage
- Events: `indexCreated`, `indexDropped`, `tableAnalyzed`, `tableOptimized`

#### Enhanced Query Builder
- **Separate Module**: QueryBuilder now exported as standalone module
- `whereNotIn()`: Exclude values from results
- `whereNotBetween()`: Exclude range from results
- `whereLike()`: Pattern matching
- `whereNotLike()`: Negative pattern matching
- `whereRaw()`: Custom WHERE conditions with parameters
- `crossJoin()`: Cartesian product joins
- `orderByRaw()`: Custom ORDER BY expressions
- `exists()`: Check if query returns any results
- `paginate()`: Built-in pagination on query builder
- `clone()`: Duplicate query builder with current state

### Changed
- Query Builder can now be imported separately: `import { QueryBuilder } from 'mysql2-helper'`
- INSERT operations now include timestamps by default
- UPDATE operations now automatically update `updated_at`
- Enhanced TypeScript definitions with all new features

### Package Structure
```
mysql2-helper/
├── index.mjs          # Main MySQLHelper class
├── QueryBuilder.mjs   # Separate QueryBuilder class
├── index.d.ts         # TypeScript definitions
└── ...
```

## [2.0.0] - 2024-12-28

### Added

#### Core Features
- **Event System**: EventEmitter-based architecture for monitoring database operations
  - `queryExecuted`, `connectionAcquired`, `transactionStarted`, `transactionCommitted`, `cacheHit`, `batchProgress` events
- **Hooks System**: Middleware-style hooks for query lifecycle
  - `beforeQuery`, `afterQuery`, `onError` hooks
  - Support for multiple hooks per event
- **Query Builder**: Fluent API for building complex SQL queries
  - Support for SELECT, WHERE, JOIN, GROUP BY, HAVING, ORDER BY, LIMIT, OFFSET
  - Methods: `where()`, `whereIn()`, `whereBetween()`, `whereNull()`, `orWhere()`
  - Join methods: `join()`, `leftJoin()`, `rightJoin()`
  - Aggregation: `count()`, `first()`
  - SQL generation: `toSQL()`

#### Batch Processing
- `batchInsert()`: Insert large datasets in configurable batch sizes
- `batchUpdate()`: Update multiple records in batches
- `batchProcess()`: Generic batch processor with concurrency control
- Progress tracking with events and callbacks

#### Caching
- Built-in query result caching with TTL
- Per-query cache control
- Cache key generation based on SQL + parameters
- `clearCache()` method

#### Connection Management
- Automatic retry on connection failure with exponential backoff
- Configurable retry attempts and delays
- Connection pool monitoring
- `getPoolStatus()`: Get real-time pool statistics
- `testConnection()`: Health check method

#### CRUD Operations
- `upsert()`: INSERT or UPDATE on duplicate key
- `findOne()`: Get single record with WHERE conditions
- `exists()`: Check if record exists
- Enhanced `select()` with GROUP BY and HAVING support

#### Pagination
- `paginate()`: Built-in pagination with metadata
- Returns data + pagination info (currentPage, totalPages, hasNextPage, etc.)

#### Aggregations
- `sum()`: Calculate sum of column
- `avg()`: Calculate average
- `min()`: Get minimum value
- `max()`: Get maximum value

#### Monitoring & Logging
- Query logging with execution time tracking
- `getQueryLog()`: Retrieve all logged queries
- `getSlowQueries()`: Filter slow queries by threshold
- `clearQueryLog()`: Clear query history

#### Utilities
- `getTableSchema()`: Get table structure
- `getTables()`: List all tables in database
- `truncate()`: Truncate table with event emission

### Changed
- Enhanced error messages with more context
- Improved transaction error handling
- Better type safety in method signatures
- More descriptive event payloads

### Configuration Options
- `cache`: Enable/disable caching (default: false)
- `cacheTTL`: Cache time-to-live in milliseconds (default: 300000)
- `logQueries`: Enable query logging (default: false)
- `retryAttempts`: Number of connection retry attempts (default: 3)
- `retryDelay`: Delay between retries in ms (default: 1000)
- `connectTimeout`: Connection timeout (default: 10000)
- `acquireTimeout`: Connection acquisition timeout (default: 10000)

### Backward Compatibility
- All v1.0.0 methods remain unchanged
- New features are additive and optional
- Existing code will work without modifications

## [1.0.0] - 2024-12-27

### Added
- Initial release
- Connection pool and single connection support
- Basic CRUD operations
  - `select()`, `insert()`, `insertMany()`, `update()`, `delete()`
- Transaction support
  - `beginTransaction()`, `transaction()`, `transactionQuery()`
- Query execution
  - `query()`: Raw SQL execution
- Utility methods
  - `findById()`, `count()`, `tableExists()`
- Connection management
  - `createPool()`, `connect()`, `close()`
- MySQL2 peer dependency

### Configuration
- Basic connection options
- Pool configuration
- Connection limits and timeouts

---

## Upgrade Guide

### From 1.0.0 to 2.0.0

Version 2.0 is fully backward compatible. Your existing code will continue to work without any changes.

#### Optional: Adopt New Features

**Before (v1.0.0):**
```javascript
const users = await db.select('users', {
  where: { status: 'active' },
  limit: 10
});
```

**After (v2.0.0 - Using Query Builder):**
```javascript
const users = await db.queryBuilder()
  .table('users')
  .where('status', 'active')
  .limit(10)
  .get();
```

**Enable New Features:**
```javascript
const db = new MySQLHelper({
  // ... existing config
  cache: true,           // Enable caching
  cacheTTL: 300000,      // 5 minutes
  logQueries: true,      // Enable query logging
  retryAttempts: 3       // Retry failed connections
});

// Add hooks
db.addHook('afterQuery', async (data) => {
  console.log(`Query took ${data.executionTime}ms`);
});

// Listen to events
db.on('queryExecuted', ({ sql, executionTime }) => {
  console.log(`Executed: ${sql} (${executionTime}ms)`);
});
```

**Use Batch Processing:**
```javascript
// Old way: Loop with individual inserts
for (const item of largeArray) {
  await db.insert('table', item);
}

// New way: Batch insert
await db.batchInsert('table', largeArray, 1000);
```

**Use Pagination:**
```javascript
// Old way: Manual pagination
const offset = (page - 1) * perPage;
const data = await db.select('users', { limit: perPage, offset });
const total = await db.count('users');

// New way: Built-in pagination
const result = await db.paginate('users', { page, perPage });
// result includes both data and pagination metadata
```