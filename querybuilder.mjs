/**
 * QueryBuilder class for building complex SQL queries with fluent API
 */
class QueryBuilder {
  constructor(db) {
    this.db = db;
    this.reset();
  }

  reset() {
    this._table = '';
    this._columns = ['*'];
    this._where = [];
    this._whereParams = [];
    this._joins = [];
    this._orderBy = [];
    this._groupBy = [];
    this._having = '';
    this._limit = null;
    this._offset = null;
    return this;
  }

  table(table) {
    this._table = table;
    return this;
  }

  select(...columns) {
    this._columns = columns.length > 0 ? columns : ['*'];
    return this;
  }

  where(column, operator, value) {
    if (arguments.length === 2) {
      value = operator;
      operator = '=';
    }
    this._where.push(`${column} ${operator} ?`);
    this._whereParams.push(value);
    return this;
  }

  whereIn(column, values) {
    const placeholders = values.map(() => '?').join(', ');
    this._where.push(`${column} IN (${placeholders})`);
    this._whereParams.push(...values);
    return this;
  }

  whereNotIn(column, values) {
    const placeholders = values.map(() => '?').join(', ');
    this._where.push(`${column} NOT IN (${placeholders})`);
    this._whereParams.push(...values);
    return this;
  }

  whereBetween(column, min, max) {
    this._where.push(`${column} BETWEEN ? AND ?`);
    this._whereParams.push(min, max);
    return this;
  }

  whereNotBetween(column, min, max) {
    this._where.push(`${column} NOT BETWEEN ? AND ?`);
    this._whereParams.push(min, max);
    return this;
  }

  whereNull(column) {
    this._where.push(`${column} IS NULL`);
    return this;
  }

  whereNotNull(column) {
    this._where.push(`${column} IS NOT NULL`);
    return this;
  }

  whereLike(column, pattern) {
    this._where.push(`${column} LIKE ?`);
    this._whereParams.push(pattern);
    return this;
  }

  whereNotLike(column, pattern) {
    this._where.push(`${column} NOT LIKE ?`);
    this._whereParams.push(pattern);
    return this;
  }

  orWhere(column, operator, value) {
    if (arguments.length === 2) {
      value = operator;
      operator = '=';
    }
    const prefix = this._where.length > 0 ? 'OR' : '';
    this._where.push(`${prefix} ${column} ${operator} ?`);
    this._whereParams.push(value);
    return this;
  }

  whereRaw(condition, params = []) {
    this._where.push(condition);
    this._whereParams.push(...params);
    return this;
  }

  join(table, column1, operator, column2) {
    this._joins.push(`INNER JOIN ${table} ON ${column1} ${operator} ${column2}`);
    return this;
  }

  leftJoin(table, column1, operator, column2) {
    this._joins.push(`LEFT JOIN ${table} ON ${column1} ${operator} ${column2}`);
    return this;
  }

  rightJoin(table, column1, operator, column2) {
    this._joins.push(`RIGHT JOIN ${table} ON ${column1} ${operator} ${column2}`);
    return this;
  }

  crossJoin(table) {
    this._joins.push(`CROSS JOIN ${table}`);
    return this;
  }

  orderBy(column, direction = 'ASC') {
    this._orderBy.push(`${column} ${direction.toUpperCase()}`);
    return this;
  }

  orderByRaw(rawOrder) {
    this._orderBy.push(rawOrder);
    return this;
  }

  groupBy(...columns) {
    this._groupBy.push(...columns);
    return this;
  }

  having(condition) {
    this._having = condition;
    return this;
  }

  limit(limit) {
    this._limit = limit;
    return this;
  }

  offset(offset) {
    this._offset = offset;
    return this;
  }

  /**
   * Generate SQL and parameters
   */
  toSQL() {
    let sql = `SELECT ${this._columns.join(', ')} FROM ${this._table}`;

    if (this._joins.length > 0) {
      sql += ' ' + this._joins.join(' ');
    }

    if (this._where.length > 0) {
      sql += ' WHERE ' + this._where.join(' AND ');
    }

    if (this._groupBy.length > 0) {
      sql += ' GROUP BY ' + this._groupBy.join(', ');
    }

    if (this._having) {
      sql += ' HAVING ' + this._having;
    }

    if (this._orderBy.length > 0) {
      sql += ' ORDER BY ' + this._orderBy.join(', ');
    }

    if (this._limit !== null) {
      sql += ` LIMIT ${this._limit}`;
    }

    if (this._offset !== null) {
      sql += ` OFFSET ${this._offset}`;
    }

    return { sql, params: this._whereParams };
  }

  /**
   * Execute query and return all results
   */
  async get() {
    const { sql, params } = this.toSQL();
    const result = await this.db.query(sql, params);
    this.reset();
    return result;
  }

  /**
   * Execute query and return first result
   */
  async first() {
    this.limit(1);
    const result = await this.get();
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Get count of matching records
   */
  async count() {
    const originalColumns = this._columns;
    this._columns = ['COUNT(*) as count'];
    const result = await this.first();
    this._columns = originalColumns;
    return result ? result.count : 0;
  }

  /**
   * Check if any records exist
   */
  async exists() {
    const count = await this.count();
    return count > 0;
  }

  /**
   * Paginate results
   */
  async paginate(page = 1, perPage = 15) {
    const offset = (page - 1) * perPage;
    const totalCount = await this.count();
    const totalPages = Math.ceil(totalCount / perPage);

    this.limit(perPage).offset(offset);
    const data = await this.get();

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

  /**
   * Clone current query builder
   */
  clone() {
    const cloned = new QueryBuilder(this.db);
    cloned._table = this._table;
    cloned._columns = [...this._columns];
    cloned._where = [...this._where];
    cloned._whereParams = [...this._whereParams];
    cloned._joins = [...this._joins];
    cloned._orderBy = [...this._orderBy];
    cloned._groupBy = [...this._groupBy];
    cloned._having = this._having;
    cloned._limit = this._limit;
    cloned._offset = this._offset;
    return cloned;
  }
}

export default QueryBuilder;