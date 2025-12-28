import mysql from 'mysql2/promise';
import { EventEmitter } from 'events';
import QueryBuilder from './querybuilder.mjs';

class MySQLHelper extends EventEmitter {
  constructor(config) {
    super();
    this.config = {
      host: config.host || 'localhost',
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port || 3306,
      connectionLimit: config.connectionLimit || 10,
      waitForConnections: config.waitForConnections !== false,
      queueLimit: config.queueLimit || 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: config.connectTimeout || 10000,
      acquireTimeout: config.acquireTimeout || 10000,
      ...config
    };
    
    this.pool = null;
    this.connection = null;
    this.hooks = {
      beforeQuery: [],
      afterQuery: [],
      onError: [],
      beforeInsert: [],
      afterInsert: [],
      beforeUpdate: [],
      afterUpdate: []
    };
    this.cache = new Map();
    this.cacheEnabled = config.cache || false;
    this.cacheTTL = config.cacheTTL || 300000; // 5 minutes default
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.queryLog = [];
    this.logQueries = config.logQueries || false;
    
    // Timestamp configuration
    this.timestamps = config.timestamps !== false; // Enable by default
    this.createdAtColumn = config.createdAtColumn || 'created_at';
    this.updatedAtColumn = config.updatedAtColumn || 'updated_at';
  }

  // ============================================
  // CONNECTION MANAGEMENT
  // ============================================

  async createPool() {
    if (!this.pool) {
      this.pool = mysql.createPool(this.config);
      this.emit('poolCreated', this.pool);
      
      this.pool.on('connection', (connection) => {
        this.emit('connectionAcquired', connection.threadId);
      });
    }
    return this.pool;
  }

  async connect() {
    if (!this.connection) {
      this.connection = await this._connectWithRetry();
      this.emit('connected', this.connection.threadId);
    }
    return this.connection;
  }

  async _connectWithRetry(attempt = 1) {
    try {
      return await mysql.createConnection(this.config);
    } catch (error) {
      if (attempt < this.retryAttempts) {
        this.emit('connectionRetry', { attempt, error: error.message });
        await this._sleep(this.retryDelay * attempt);
        return this._connectWithRetry(attempt + 1);
      }
      throw new Error(`Failed to connect after ${this.retryAttempts} attempts: ${error.message}`);
    }
  }

  async getConnection() {
    if (this.pool) {
      return await this.pool.getConnection();
    } else if (this.connection) {
      return this.connection;
    } else {
      await this.createPool();
      return await this.pool.getConnection();
    }
  }

  async testConnection() {
    try {
      const conn = await this.getConnection();
      await conn.ping();
      if (this.pool && conn.release) conn.release();
      this.emit('connectionTest', { success: true });
      return true;
    } catch (error) {
      this.emit('connectionTest', { success: false, error: error.message });
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  // ============================================
  // HOOKS SYSTEM
  // ============================================

  addHook(hookName, callback) {
    if (this.hooks[hookName]) {
      this.hooks[hookName].push(callback);
    } else {
      throw new Error(`Invalid hook name: ${hookName}`);
    }
  }

  removeHook(hookName, callback) {
    if (this.hooks[hookName]) {
      this.hooks[hookName] = this.hooks[hookName].filter(cb => cb !== callback);
    }
  }

  async _runHooks(hookName, data) {
    for (const callback of this.hooks[hookName]) {
      await callback(data);
    }
  }

  // ============================================
  // TIMESTAMP HELPERS
  // ============================================

  _addTimestamps(data, isUpdate = false) {
    if (!this.timestamps) return data;
    
    const now = new Date();
    const timestampedData = { ...data };
    
    if (!isUpdate && this.createdAtColumn && !data[this.createdAtColumn]) {
      timestampedData[this.createdAtColumn] = now;
    }
    
    if (this.updatedAtColumn && !data[this.updatedAtColumn]) {
      timestampedData[this.updatedAtColumn] = now;
    }
    
    return timestampedData;
  }

  // ============================================
  // QUERY EXECUTION WITH HOOKS & CACHING
  // ============================================

  async query(sql, params = [], options = {}) {
    const queryData = { sql, params, timestamp: Date.now() };
    
    try {
      // Check cache
      if (this.cacheEnabled && options.cache !== false) {
        const cacheKey = this._getCacheKey(sql, params);
        const cached = this._getFromCache(cacheKey);
        if (cached) {
          this.emit('cacheHit', { sql, params });
          return cached;
        }
      }

      // Before query hook
      await this._runHooks('beforeQuery', queryData);

      const conn = this.pool || this.connection;
      if (!conn) {
        await this.createPool();
      }

      const startTime = Date.now();
      const [rows] = await (this.pool || this.connection).execute(sql, params);
      const executionTime = Date.now() - startTime;

      // Log query if enabled
      if (this.logQueries) {
        this.queryLog.push({ sql, params, executionTime, timestamp: Date.now() });
      }

      // After query hook
      await this._runHooks('afterQuery', { ...queryData, rows, executionTime });

      // Cache result
      if (this.cacheEnabled && options.cache !== false) {
        const cacheKey = this._getCacheKey(sql, params);
        this._setCache(cacheKey, rows, options.cacheTTL);
      }

      this.emit('queryExecuted', { sql, params, executionTime, rowCount: rows.length });
      
      return rows;
    } catch (error) {
      await this._runHooks('onError', { ...queryData, error });
      this.emit('queryError', { sql, params, error: error.message });
      throw new Error(`Query failed: ${error.message}`);
    }
  }

  // ============================================
  // QUERY BUILDER
  // ============================================

  queryBuilder() {
    return new QueryBuilder(this);
  }

  // ============================================
  // BATCH PROCESSING
  // ============================================

  async batchInsert(table, dataArray, batchSize = 100) {
    if (!dataArray || dataArray.length === 0) {
      throw new Error('Data array cannot be empty');
    }

    const results = [];
    const batches = Math.ceil(dataArray.length / batchSize);

    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, dataArray.length);
      const batch = dataArray.slice(start, end);

      const result = await this.insertMany(table, batch);
      results.push(result);
      
      this.emit('batchProgress', {
        current: i + 1,
        total: batches,
        processedRows: end
      });
    }

    return {
      totalBatches: batches,
      totalInserted: dataArray.length,
      results
    };
  }

  async batchUpdate(table, updates, batchSize = 100) {
    const results = [];
    const batches = Math.ceil(updates.length / batchSize);

    for (let i = 0; i < batches; i++) {
      const batch = updates.slice(i * batchSize, (i + 1) * batchSize);
      
      const batchResults = await Promise.all(
        batch.map(({ data, where }) => this.update(table, data, where))
      );
      
      results.push(...batchResults);
      
      this.emit('batchProgress', {
        current: i + 1,
        total: batches,
        processedRows: (i + 1) * batchSize
      });
    }

    return results;
  }

  async batchProcess(items, processor, options = {}) {
    const {
      batchSize = 100,
      concurrency = 5,
      onProgress = null
    } = options;

    const results = [];
    const batches = [];

    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    for (let i = 0; i < batches.length; i += concurrency) {
      const currentBatches = batches.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        currentBatches.map(batch => processor(batch))
      );
      results.push(...batchResults);

      if (onProgress) {
        onProgress({
          processed: Math.min((i + concurrency) * batchSize, items.length),
          total: items.length,
          percentage: Math.round((Math.min((i + concurrency) * batchSize, items.length) / items.length) * 100)
        });
      }
    }

    return results;
  }

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  async select(table, options = {}) {
    const { columns = '*', where = {}, orderBy, limit, offset, groupBy, having } = options;
    
    let sql = `SELECT ${Array.isArray(columns) ? columns.join(', ') : columns} FROM ${table}`;
    const params = [];

    if (Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => {
        params.push(where[key]);
        return `${key} = ?`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (groupBy) {
      sql += ` GROUP BY ${groupBy}`;
    }

    if (having) {
      sql += ` HAVING ${having}`;
    }

    if (orderBy) {
      sql += ` ORDER BY ${orderBy}`;
    }

    if (limit) {
      sql += ` LIMIT ${limit}`;
    }

    if (offset) {
      sql += ` OFFSET ${offset}`;
    }

    return await this.query(sql, params, options);
  }

  async insert(table, data, options = {}) {
    const timestampedData = options.skipTimestamps ? data : this._addTimestamps(data, false);
    
    await this._runHooks('beforeInsert', { table, data: timestampedData });
    
    const columns = Object.keys(timestampedData);
    const values = Object.values(timestampedData);
    const placeholders = columns.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    const result = await this.query(sql, values);
    
    const insertResult = {
      insertId: result.insertId,
      affectedRows: result.affectedRows
    };
    
    await this._runHooks('afterInsert', { table, data: timestampedData, result: insertResult });
    
    return insertResult;
  }

  async insertMany(table, dataArray, options = {}) {
    if (!dataArray || dataArray.length === 0) {
      throw new Error('Data array cannot be empty');
    }

    const timestampedArray = options.skipTimestamps 
      ? dataArray 
      : dataArray.map(data => this._addTimestamps(data, false));

    const columns = Object.keys(timestampedArray[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const valuesSql = timestampedArray.map(() => `(${placeholders})`).join(', ');
    
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valuesSql}`;
    const values = timestampedArray.flatMap(obj => Object.values(obj));
    
    const result = await this.query(sql, values);
    
    return {
      insertId: result.insertId,
      affectedRows: result.affectedRows
    };
  }

  async upsert(table, data, updateFields = [], options = {}) {
    const timestampedData = options.skipTimestamps ? data : this._addTimestamps(data, false);
    
    const columns = Object.keys(timestampedData);
    const values = Object.values(timestampedData);
    const placeholders = columns.map(() => '?').join(', ');
    
    const fieldsToUpdate = updateFields.length > 0 ? updateFields : columns.filter(col => col !== this.createdAtColumn);
    const updateClause = fieldsToUpdate
      .map(field => `${field} = VALUES(${field})`)
      .join(', ');
    
    const sql = `
      INSERT INTO ${table} (${columns.join(', ')}) 
      VALUES (${placeholders})
      ON DUPLICATE KEY UPDATE ${updateClause}
    `;
    
    const result = await this.query(sql, values);
    
    return {
      insertId: result.insertId,
      affectedRows: result.affectedRows
    };
  }

  async update(table, data, where, options = {}) {
    const timestampedData = options.skipTimestamps ? data : this._addTimestamps(data, true);
    
    await this._runHooks('beforeUpdate', { table, data: timestampedData, where });
    
    const setClause = Object.keys(timestampedData).map(key => `${key} = ?`).join(', ');
    const whereClause = Object.keys(where).map(key => `${key} = ?`).join(' AND ');
    
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    const params = [...Object.values(timestampedData), ...Object.values(where)];
    
    const result = await this.query(sql, params);
    
    const updateResult = {
      affectedRows: result.affectedRows,
      changedRows: result.changedRows
    };
    
    await this._runHooks('afterUpdate', { table, data: timestampedData, where, result: updateResult });
    
    return updateResult;
  }

  async delete(table, where) {
    const whereClause = Object.keys(where).map(key => `${key} = ?`).join(' AND ');
    const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
    const params = Object.values(where);
    
    const result = await this.query(sql, params);
    
    return {
      affectedRows: result.affectedRows
    };
  }

  async findById(table, id, idColumn = 'id') {
    const results = await this.select(table, {
      where: { [idColumn]: id },
      limit: 1
    });
    return results.length > 0 ? results[0] : null;
  }

  async findOne(table, where) {
    const results = await this.select(table, { where, limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  async exists(table, where) {
    const count = await this.count(table, where);
    return count > 0;
  }

  // ============================================
  // PAGINATION
  // ============================================

  async paginate(table, options = {}) {
    const {
      page = 1,
      perPage = 10,
      where = {},
      orderBy = 'id DESC',
      columns = '*'
    } = options;

    const offset = (page - 1) * perPage;
    const totalCount = await this.count(table, where);
    const totalPages = Math.ceil(totalCount / perPage);

    const data = await this.select(table, {
      columns,
      where,
      orderBy,
      limit: perPage,
      offset
    });

    return {
      data,
      pagination: {
        currentPage: page,
        perPage,
        totalItems: totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }

  // ============================================
  // TRANSACTIONS
  // ============================================

  async beginTransaction() {
    const conn = await (this.pool ? this.pool.getConnection() : this.connect());
    await conn.beginTransaction();
    this.emit('transactionStarted', { threadId: conn.threadId });
    return conn;
  }

  async transaction(callback) {
    const conn = await this.beginTransaction();
    
    try {
      const result = await callback(conn);
      await conn.commit();
      this.emit('transactionCommitted', { threadId: conn.threadId });
      return result;
    } catch (error) {
      await conn.rollback();
      this.emit('transactionRolledBack', { threadId: conn.threadId, error: error.message });
      throw new Error(`Transaction failed: ${error.message}`);
    } finally {
      if (this.pool) {
        conn.release();
      }
    }
  }

  async transactionQuery(conn, sql, params = []) {
    const [rows] = await conn.execute(sql, params);
    return rows;
  }

  // ============================================
  // STORED PROCEDURES
  // ============================================

  async callProcedure(procedureName, params = []) {
    const placeholders = params.map(() => '?').join(', ');
    const sql = `CALL ${procedureName}(${placeholders})`;
    
    try {
      const result = await this.query(sql, params);
      this.emit('procedureCalled', { procedureName, params });
      
      // MySQL2 returns an array where the last element is metadata
      // Return all result sets except the last one (metadata)
      return result.length > 1 ? result.slice(0, -1) : result;
    } catch (error) {
      throw new Error(`Stored procedure '${procedureName}' failed: ${error.message}`);
    }
  }

  async createProcedure(procedureName, params, body) {
    const sql = `
      CREATE PROCEDURE ${procedureName}(${params})
      BEGIN
        ${body}
      END
    `;
    
    await this.query(sql);
    this.emit('procedureCreated', { procedureName });
  }

  async dropProcedure(procedureName, ifExists = true) {
    const sql = `DROP PROCEDURE ${ifExists ? 'IF EXISTS' : ''} ${procedureName}`;
    await this.query(sql);
    this.emit('procedureDropped', { procedureName });
  }

  async procedureExists(procedureName) {
    const sql = `
      SELECT COUNT(*) as count 
      FROM information_schema.ROUTINES 
      WHERE ROUTINE_SCHEMA = ? AND ROUTINE_NAME = ? AND ROUTINE_TYPE = 'PROCEDURE'
    `;
    const result = await this.query(sql, [this.config.database, procedureName]);
    return result[0].count > 0;
  }

  async listProcedures() {
    const sql = `
      SELECT ROUTINE_NAME as name, CREATED as created, LAST_ALTERED as modified
      FROM information_schema.ROUTINES 
      WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'
      ORDER BY ROUTINE_NAME
    `;
    return await this.query(sql, [this.config.database]);
  }

  // ============================================
  // INDEX MANAGEMENT
  // ============================================

  async createIndex(table, indexName, columns, options = {}) {
    const {
      unique = false,
      type = '', // BTREE, HASH, FULLTEXT, SPATIAL
      using = ''
    } = options;

    const columnList = Array.isArray(columns) ? columns.join(', ') : columns;
    const uniqueKeyword = unique ? 'UNIQUE' : '';
    const typeKeyword = type ? `USING ${type}` : '';
    
    const sql = `CREATE ${uniqueKeyword} INDEX ${indexName} ON ${table} (${columnList}) ${typeKeyword}`.trim();
    
    await this.query(sql);
    this.emit('indexCreated', { table, indexName, columns });
    
    return { success: true, indexName };
  }

  async dropIndex(table, indexName) {
    const sql = `DROP INDEX ${indexName} ON ${table}`;
    await this.query(sql);
    this.emit('indexDropped', { table, indexName });
  }

  async indexExists(table, indexName) {
    const sql = `
      SELECT COUNT(*) as count 
      FROM information_schema.STATISTICS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
    `;
    const result = await this.query(sql, [this.config.database, table, indexName]);
    return result[0].count > 0;
  }

  async listIndexes(table) {
    const sql = `
      SELECT 
        INDEX_NAME as name,
        COLUMN_NAME as column,
        NON_UNIQUE as non_unique,
        INDEX_TYPE as type,
        SEQ_IN_INDEX as sequence
      FROM information_schema.STATISTICS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `;
    const results = await this.query(sql, [this.config.database, table]);
    
    // Group by index name
    const indexes = {};
    results.forEach(row => {
      if (!indexes[row.name]) {
        indexes[row.name] = {
          name: row.name,
          columns: [],
          unique: row.non_unique === 0,
          type: row.type
        };
      }
      indexes[row.name].columns.push(row.column);
    });
    
    return Object.values(indexes);
  }

  async analyzeTable(table) {
    const sql = `ANALYZE TABLE ${table}`;
    const result = await this.query(sql);
    this.emit('tableAnalyzed', { table });
    return result;
  }

  async optimizeTable(table) {
    const sql = `OPTIMIZE TABLE ${table}`;
    const result = await this.query(sql);
    this.emit('tableOptimized', { table });
    return result;
  }

  // ============================================
  // AGGREGATION & UTILITY
  // ============================================

  async count(table, where = {}) {
    const params = [];
    let sql = `SELECT COUNT(*) as count FROM ${table}`;

    if (Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => {
        params.push(where[key]);
        return `${key} = ?`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    const result = await this.query(sql, params);
    return result[0].count;
  }

  async sum(table, column, where = {}) {
    const params = [];
    let sql = `SELECT SUM(${column}) as total FROM ${table}`;

    if (Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => {
        params.push(where[key]);
        return `${key} = ?`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    const result = await this.query(sql, params);
    return result[0].total || 0;
  }

  async avg(table, column, where = {}) {
    const params = [];
    let sql = `SELECT AVG(${column}) as average FROM ${table}`;

    if (Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => {
        params.push(where[key]);
        return `${key} = ?`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    const result = await this.query(sql, params);
    return result[0].average || 0;
  }

  async min(table, column, where = {}) {
    const params = [];
    let sql = `SELECT MIN(${column}) as minimum FROM ${table}`;

    if (Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => {
        params.push(where[key]);
        return `${key} = ?`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    const result = await this.query(sql, params);
    return result[0].minimum;
  }

  async max(table, column, where = {}) {
    const params = [];
    let sql = `SELECT MAX(${column}) as maximum FROM ${table}`;

    if (Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => {
        params.push(where[key]);
        return `${key} = ?`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    const result = await this.query(sql, params);
    return result[0].maximum;
  }

  // ============================================
  // CACHING
  // ============================================

  _getCacheKey(sql, params) {
    return `${sql}:${JSON.stringify(params)}`;
  }

  _getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiry) {
      return cached.data;
    }
    if (cached) {
      this.cache.delete(key);
    }
    return null;
  }

  _setCache(key, data, ttl = this.cacheTTL) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl
    });
  }

  clearCache() {
    this.cache.clear();
    this.emit('cacheCleared');
  }

  // ============================================
  // HEALTH & MONITORING
  // ============================================

  async getPoolStatus() {
    if (!this.pool) {
      return null;
    }

    return {
      totalConnections: this.pool._allConnections.length,
      freeConnections: this.pool._freeConnections.length,
      queuedRequests: this.pool._connectionQueue.length,
      config: {
        connectionLimit: this.config.connectionLimit,
        queueLimit: this.config.queueLimit
      }
    };
  }

  getQueryLog() {
    return this.queryLog;
  }

  clearQueryLog() {
    this.queryLog = [];
  }

  getSlowQueries(threshold = 1000) {
    return this.queryLog.filter(log => log.executionTime > threshold);
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  async tableExists(table) {
    const sql = `SHOW TABLES LIKE ?`;
    const result = await this.query(sql, [table]);
    return result.length > 0;
  }

  async getTableSchema(table) {
    const sql = `DESCRIBE ${table}`;
    return await this.query(sql);
  }

  async getTables() {
    const sql = 'SHOW TABLES';
    const result = await this.query(sql);
    return result.map(row => Object.values(row)[0]);
  }

  async truncate(table) {
    const sql = `TRUNCATE TABLE ${table}`;
    await this.query(sql);
    this.emit('tableTruncated', { table });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.emit('poolClosed');
    }
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
      this.emit('connectionClosed');
    }
    this.clearCache();
  }
}

export default MySQLHelper;
export { QueryBuilder };

 