import { EventEmitter } from 'events';
import { Pool, PoolConnection, Connection } from 'mysql2/promise';

export interface MySQLConfig {
  host?: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  connectionLimit?: number;
  waitForConnections?: boolean;
  queueLimit?: number;
  connectTimeout?: number;
  acquireTimeout?: number;
  cache?: boolean;
  cacheTTL?: number;
  logQueries?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
  timestamps?: boolean;
  createdAtColumn?: string;
  updatedAtColumn?: string;
  [key: string]: any;
}

export interface SelectOptions {
  columns?: string | string[];
  where?: Record<string, any>;
  orderBy?: string;
  limit?: number;
  offset?: number;
  groupBy?: string;
  having?: string;
  cache?: boolean;
  cacheTTL?: number;
}

export interface QueryOptions {
  cache?: boolean;
  cacheTTL?: number;
}

export interface InsertResult {
  insertId: number;
  affectedRows: number;
}

export interface UpdateResult {
  affectedRows: number;
  changedRows: number;
}

export interface DeleteResult {
  affectedRows: number;
}

export interface BatchInsertResult {
  totalBatches: number;
  totalInserted: number;
  results: InsertResult[];
}

export interface PaginationMeta {
  currentPage: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginateResult<T = any> {
  data: T[];
  pagination: PaginationMeta;
}

export interface PaginateOptions {
  page?: number;
  perPage?: number;
  where?: Record<string, any>;
  orderBy?: string;
  columns?: string | string[];
}

export interface BatchProcessOptions {
  batchSize?: number;
  concurrency?: number;
  onProgress?: (progress: BatchProgress) => void;
}

export interface BatchProgress {
  processed: number;
  total: number;
  percentage: number;
}

export interface PoolStatus {
  totalConnections: number;
  freeConnections: number;
  queuedRequests: number;
  config: {
    connectionLimit: number;
    queueLimit: number;
  };
}

export interface QueryLog {
  sql: string;
  params: any[];
  executionTime: number;
  timestamp: number;
}

export interface HookData {
  sql: string;
  params: any[];
  timestamp: number;
}

export interface AfterQueryData extends HookData {
  rows: any[];
  executionTime: number;
}

export interface ErrorData extends HookData {
  error: Error;
}

export type HookCallback = (data: HookData | AfterQueryData | ErrorData) => Promise<void> | void;

export interface TableSchema {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: any;
  Extra: string;
}

export interface UpdateBatch {
  data: Record<string, any>;
  where: Record<string, any>;
}

export interface CRUDOptions {
  skipTimestamps?: boolean;
}

export interface IndexOptions {
  unique?: boolean;
  type?: 'BTREE' | 'HASH' | 'FULLTEXT' | 'SPATIAL' | '';
  using?: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  type: string;
}

export interface ProcedureInfo {
  name: string;
  created: Date;
  modified: Date;
}

declare class QueryBuilder {
  constructor(db: MySQLHelper);
  
  reset(): this;
  table(table: string): this;
  select(...columns: string[]): this;
  where(column: string, operator: string, value: any): this;
  where(column: string, value: any): this;
  whereIn(column: string, values: any[]): this;
  whereNotIn(column: string, values: any[]): this;
  whereBetween(column: string, min: any, max: any): this;
  whereNotBetween(column: string, min: any, max: any): this;
  whereNull(column: string): this;
  whereNotNull(column: string): this;
  whereLike(column: string, pattern: string): this;
  whereNotLike(column: string, pattern: string): this;
  orWhere(column: string, operator: string, value: any): this;
  orWhere(column: string, value: any): this;
  whereRaw(condition: string, params?: any[]): this;
  join(table: string, column1: string, operator: string, column2: string): this;
  leftJoin(table: string, column1: string, operator: string, column2: string): this;
  rightJoin(table: string, column1: string, operator: string, column2: string): this;
  crossJoin(table: string): this;
  orderBy(column: string, direction?: 'ASC' | 'DESC'): this;
  orderByRaw(rawOrder: string): this;
  groupBy(...columns: string[]): this;
  having(condition: string): this;
  limit(limit: number): this;
  offset(offset: number): this;
  toSQL(): { sql: string; params: any[] };
  get<T = any>(): Promise<T[]>;
  first<T = any>(): Promise<T | null>;
  count(): Promise<number>;
  exists(): Promise<boolean>;
  paginate<T = any>(page?: number, perPage?: number): Promise<PaginateResult<T>>;
  clone(): QueryBuilder;
}

declare class MySQLHelper extends EventEmitter {
  constructor(config: MySQLConfig);

  // Connection Management
  createPool(): Promise<Pool>;
  connect(): Promise<Connection>;
  getConnection(): Promise<PoolConnection | Connection>;
  testConnection(): Promise<boolean>;
  close(): Promise<void>;

  // Hooks
  addHook(hookName: 'beforeQuery' | 'afterQuery' | 'onError' | 'beforeInsert' | 'afterInsert' | 'beforeUpdate' | 'afterUpdate', callback: HookCallback): void;
  removeHook(hookName: 'beforeQuery' | 'afterQuery' | 'onError' | 'beforeInsert' | 'afterInsert' | 'beforeUpdate' | 'afterUpdate', callback: HookCallback): void;

  // Query Execution
  query<T = any>(sql: string, params?: any[], options?: QueryOptions): Promise<T[]>;
  queryBuilder(): QueryBuilder;

  // CRUD Operations
  select<T = any>(table: string, options?: SelectOptions): Promise<T[]>;
  insert(table: string, data: Record<string, any>, options?: CRUDOptions): Promise<InsertResult>;
  insertMany(table: string, dataArray: Record<string, any>[], options?: CRUDOptions): Promise<InsertResult>;
  upsert(table: string, data: Record<string, any>, updateFields?: string[], options?: CRUDOptions): Promise<InsertResult>;
  update(table: string, data: Record<string, any>, where: Record<string, any>, options?: CRUDOptions): Promise<UpdateResult>;
  delete(table: string, where: Record<string, any>): Promise<DeleteResult>;
  findById<T = any>(table: string, id: number | string, idColumn?: string): Promise<T | null>;
  findOne<T = any>(table: string, where: Record<string, any>): Promise<T | null>;
  exists(table: string, where: Record<string, any>): Promise<boolean>;

  // Batch Processing
  batchInsert(table: string, dataArray: Record<string, any>[], batchSize?: number): Promise<BatchInsertResult>;
  batchUpdate(table: string, updates: UpdateBatch[], batchSize?: number): Promise<UpdateResult[]>;
  batchProcess<T = any, R = any>(
    items: T[],
    processor: (batch: T[]) => Promise<R>,
    options?: BatchProcessOptions
  ): Promise<R[]>;

  // Pagination
  paginate<T = any>(table: string, options?: PaginateOptions): Promise<PaginateResult<T>>;

  // Transactions
  beginTransaction(): Promise<PoolConnection>;
  transaction<T = any>(callback: (conn: PoolConnection) => Promise<T>): Promise<T>;
  transactionQuery<T = any>(conn: PoolConnection, sql: string, params?: any[]): Promise<T[]>;

  // Aggregations
  count(table: string, where?: Record<string, any>): Promise<number>;
  sum(table: string, column: string, where?: Record<string, any>): Promise<number>;
  avg(table: string, column: string, where?: Record<string, any>): Promise<number>;
  min(table: string, column: string, where?: Record<string, any>): Promise<any>;
  max(table: string, column: string, where?: Record<string, any>): Promise<any>;

  // Caching
  clearCache(): void;

  // Stored Procedures
  callProcedure<T = any>(procedureName: string, params?: any[]): Promise<T[]>;
  createProcedure(procedureName: string, params: string, body: string): Promise<void>;
  dropProcedure(procedureName: string, ifExists?: boolean): Promise<void>;
  procedureExists(procedureName: string): Promise<boolean>;
  listProcedures(): Promise<ProcedureInfo[]>;

  // Index Management
  createIndex(table: string, indexName: string, columns: string | string[], options?: IndexOptions): Promise<{ success: boolean; indexName: string }>;
  dropIndex(table: string, indexName: string): Promise<void>;
  indexExists(table: string, indexName: string): Promise<boolean>;
  listIndexes(table: string): Promise<IndexInfo[]>;
  analyzeTable(table: string): Promise<any>;
  optimizeTable(table: string): Promise<any>;

  // Monitoring & Health
  getPoolStatus(): Promise<PoolStatus | null>;
  getQueryLog(): QueryLog[];
  clearQueryLog(): void;
  getSlowQueries(threshold?: number): QueryLog[];

  // Utilities
  tableExists(table: string): Promise<boolean>;
  getTableSchema(table: string): Promise<TableSchema[]>;
  getTables(): Promise<string[]>;
  truncate(table: string): Promise<void>;

  // Events
  on(event: 'queryExecuted', listener: (data: { sql: string; params: any[]; executionTime: number; rowCount: number }) => void): this;
  on(event: 'connectionAcquired', listener: (threadId: number) => void): this;
  on(event: 'connected', listener: (threadId: number) => void): this;
  on(event: 'poolCreated', listener: (pool: Pool) => void): this;
  on(event: 'poolClosed', listener: () => void): this;
  on(event: 'connectionClosed', listener: () => void): this;
  on(event: 'transactionStarted', listener: (data: { threadId: number }) => void): this;
  on(event: 'transactionCommitted', listener: (data: { threadId: number }) => void): this;
  on(event: 'transactionRolledBack', listener: (data: { threadId: number; error: string }) => void): this;
  on(event: 'cacheHit', listener: (data: { sql: string; params: any[] }) => void): this;
  on(event: 'cacheCleared', listener: () => void): this;
  on(event: 'batchProgress', listener: (data: { current: number; total: number; processedRows: number }) => void): this;
  on(event: 'queryError', listener: (data: { sql: string; params: any[]; error: string }) => void): this;
  on(event: 'connectionRetry', listener: (data: { attempt: number; error: string }) => void): this;
  on(event: 'connectionTest', listener: (data: { success: boolean; error?: string }) => void): this;
  on(event: 'tableTruncated', listener: (data: { table: string }) => void): this;
  on(event: 'procedureCalled', listener: (data: { procedureName: string; params: any[] }) => void): this;
  on(event: 'procedureCreated', listener: (data: { procedureName: string }) => void): this;
  on(event: 'procedureDropped', listener: (data: { procedureName: string }) => void): this;
  on(event: 'indexCreated', listener: (data: { table: string; indexName: string; columns: string | string[] }) => void): this;
  on(event: 'indexDropped', listener: (data: { table: string; indexName: string }) => void): this;
  on(event: 'tableAnalyzed', listener: (data: { table: string }) => void): this;
  on(event: 'tableOptimized', listener: (data: { table: string }) => void): this;
}

export default MySQLHelper;
export { QueryBuilder };