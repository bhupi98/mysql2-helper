import mysql from 'mysql2/promise';

class MySQLHelper {
  constructor(config) {
    this.config = config;
    this.pool = null;
    this.connection = null;
  }

  /**
   * Create a connection pool (recommended for most applications)
   */
  async createPool() {
    if (!this.pool) {
      this.pool = mysql.createPool({
        host: this.config.host || 'localhost',
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        port: this.config.port || 3306,
        waitForConnections: this.config.waitForConnections !== false,
        connectionLimit: this.config.connectionLimit || 10,
        queueLimit: this.config.queueLimit || 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
      });
    }
    return this.pool;
  }

  /**
   * Create a single connection
   */
  async connect() {
    if (!this.connection) {
      this.connection = await mysql.createConnection({
        host: this.config.host || 'localhost',
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        port: this.config.port || 3306
      });
    }
    return this.connection;
  }

  /**
   * Execute a query with parameters
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Query results
   */
  async query(sql, params = []) {
    try {
      const conn = this.pool || this.connection;
      if (!conn) {
        await this.createPool();
      }
      const [rows] = await (this.pool || this.connection).execute(sql, params);
      return rows;
    } catch (error) {
      throw new Error(`Query failed: ${error.message}`);
    }
  }

  /**
   * Execute a SELECT query
   * @param {string} table - Table name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Query results
   */
  async select(table, options = {}) {
    const { columns = '*', where = {}, orderBy, limit, offset } = options;
    
    let sql = `SELECT ${Array.isArray(columns) ? columns.join(', ') : columns} FROM ${table}`;
    const params = [];

    // WHERE clause
    if (Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => {
        params.push(where[key]);
        return `${key} = ?`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    // ORDER BY
    if (orderBy) {
      sql += ` ORDER BY ${orderBy}`;
    }

    // LIMIT
    if (limit) {
      sql += ` LIMIT ${limit}`;
    }

    // OFFSET
    if (offset) {
      sql += ` OFFSET ${offset}`;
    }

    return await this.query(sql, params);
  }

  /**
   * Insert a record
   * @param {string} table - Table name
   * @param {Object} data - Data to insert
   * @returns {Promise<Object>} Insert result with insertId
   */
  async insert(table, data) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    const result = await this.query(sql, values);
    
    return {
      insertId: result.insertId,
      affectedRows: result.affectedRows
    };
  }

  /**
   * Insert multiple records
   * @param {string} table - Table name
   * @param {Array<Object>} dataArray - Array of data objects
   * @returns {Promise<Object>} Insert result
   */
  async insertMany(table, dataArray) {
    if (!dataArray || dataArray.length === 0) {
      throw new Error('Data array cannot be empty');
    }

    const columns = Object.keys(dataArray[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const valuesSql = dataArray.map(() => `(${placeholders})`).join(', ');
    
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valuesSql}`;
    const values = dataArray.flatMap(obj => Object.values(obj));
    
    const result = await this.query(sql, values);
    
    return {
      insertId: result.insertId,
      affectedRows: result.affectedRows
    };
  }

  /**
   * Update records
   * @param {string} table - Table name
   * @param {Object} data - Data to update
   * @param {Object} where - WHERE conditions
   * @returns {Promise<Object>} Update result
   */
  async update(table, data, where) {
    const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ');
    const whereClause = Object.keys(where).map(key => `${key} = ?`).join(' AND ');
    
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    const params = [...Object.values(data), ...Object.values(where)];
    
    const result = await this.query(sql, params);
    
    return {
      affectedRows: result.affectedRows,
      changedRows: result.changedRows
    };
  }

  /**
   * Delete records
   * @param {string} table - Table name
   * @param {Object} where - WHERE conditions
   * @returns {Promise<Object>} Delete result
   */
  async delete(table, where) {
    const whereClause = Object.keys(where).map(key => `${key} = ?`).join(' AND ');
    const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
    const params = Object.values(where);
    
    const result = await this.query(sql, params);
    
    return {
      affectedRows: result.affectedRows
    };
  }

  /**
   * Get a single record by ID
   * @param {string} table - Table name
   * @param {number|string} id - Record ID
   * @param {string} idColumn - ID column name (default: 'id')
   * @returns {Promise<Object|null>} Record or null
   */
  async findById(table, id, idColumn = 'id') {
    const results = await this.select(table, {
      where: { [idColumn]: id },
      limit: 1
    });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Begin a transaction
   * @returns {Promise<Object>} Transaction connection
   */
  async beginTransaction() {
    const conn = await (this.pool ? this.pool.getConnection() : this.connect());
    await conn.beginTransaction();
    return conn;
  }

  /**
   * Execute queries within a transaction
   * @param {Function} callback - Callback function with connection parameter
   * @returns {Promise<any>} Result from callback
   */
  async transaction(callback) {
    const conn = await this.beginTransaction();
    
    try {
      const result = await callback(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw new Error(`Transaction failed: ${error.message}`);
    } finally {
      if (this.pool) {
        conn.release();
      }
    }
  }

  /**
   * Execute raw SQL within a transaction context
   * @param {Object} conn - Transaction connection
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Query results
   */
  async transactionQuery(conn, sql, params = []) {
    const [rows] = await conn.execute(sql, params);
    return rows;
  }

  /**
   * Count records
   * @param {string} table - Table name
   * @param {Object} where - WHERE conditions
   * @returns {Promise<number>} Count of records
   */
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

  /**
   * Check if table exists
   * @param {string} table - Table name
   * @returns {Promise<boolean>} True if exists
   */
  async tableExists(table) {
    const sql = `SHOW TABLES LIKE ?`;
    const result = await this.query(sql, [table]);
    return result.length > 0;
  }

  /**
   * Close connection or pool
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  /**
   * Test database connection
   * @returns {Promise<boolean>} True if connected
   */
  async testConnection() {
    try {
      if (this.pool) {
        const conn = await this.pool.getConnection();
        conn.release();
      } else {
        await this.connect();
      }
      return true;
    } catch (error) {
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }
}

export default MySQLHelper;