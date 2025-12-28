import MySQLHelper from './index.mjs';

// ============================================
// EXAMPLE 1: Complete Setup with All Features
// ============================================

async function setupWithAllFeatures() {
  const db = new MySQLHelper({
    host: 'localhost',
    user: 'root',
    password: 'password',
    database: 'mydb',
    connectionLimit: 10,
    cache: true,
    cacheTTL: 300000,
    logQueries: true,
    retryAttempts: 3,
    timestamps: true,              // NEW: Auto timestamps
    createdAtColumn: 'created_at', // NEW: Custom column name
    updatedAtColumn: 'updated_at'  // NEW: Custom column name
  });

  // Setup hooks
  db.addHook('beforeQuery', async (data) => {
    console.log(`[${new Date().toISOString()}] Executing: ${data.sql}`);
  });

  db.addHook('afterQuery', async (data) => {
    if (data.executionTime > 1000) {
      console.warn(`⚠️  Slow query (${data.executionTime}ms): ${data.sql}`);
    }
  });

  db.addHook('onError', async (data) => {
    console.error(`❌ Query failed: ${data.error.message}`);
    // Send to error tracking service
    // await Sentry.captureException(data.error);
  });

  // Setup event listeners
  db.on('queryExecuted', ({ sql, executionTime, rowCount }) => {
    console.log(`✅ Query completed in ${executionTime}ms, returned ${rowCount} rows`);
  });

  db.on('cacheHit', ({ sql }) => {
    console.log(`🎯 Cache hit for: ${sql.substring(0, 50)}...`);
  });

  db.on('batchProgress', ({ current, total, processedRows }) => {
    const percentage = Math.round((current / total) * 100);
    console.log(`📦 Batch progress: ${percentage}% (${processedRows} rows)`);
  });

  await db.createPool();
  
  return db;
}

// ============================================
// EXAMPLE 2: E-commerce Order Processing
// ============================================

async function processOrder(db, orderData) {
  return await db.transaction(async (conn) => {
    // 1. Create order
    const [orderResult] = await conn.execute(
      'INSERT INTO orders (user_id, total, status) VALUES (?, ?, ?)',
      [orderData.userId, orderData.total, 'pending']
    );
    const orderId = orderResult.insertId;

    // 2. Insert order items
    for (const item of orderData.items) {
      await conn.execute(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.productId, item.quantity, item.price]
      );

      // 3. Update inventory
      await conn.execute(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.productId]
      );
    }

    // 4. Create payment record
    await conn.execute(
      'INSERT INTO payments (order_id, amount, method, status) VALUES (?, ?, ?, ?)',
      [orderId, orderData.total, orderData.paymentMethod, 'completed']
    );

    // 5. Update order status
    await conn.execute(
      'UPDATE orders SET status = ? WHERE id = ?',
      ['confirmed', orderId]
    );

    return { orderId, success: true };
  });
}

// ============================================
// EXAMPLE 3: Data Migration with Batch Processing
// ============================================

async function migrateData(db) {
  // Fetch old data
  const oldData = await db.select('old_users', {
    columns: ['id', 'name', 'email', 'created_at']
  });

  console.log(`Migrating ${oldData.length} records...`);

  // Transform and insert in batches
  const transformedData = oldData.map(user => ({
    legacy_id: user.id,
    full_name: user.name,
    email_address: user.email,
    registered_at: user.created_at,
    migrated_at: new Date()
  }));

  const result = await db.batchInsert('new_users', transformedData, 1000);
  
  console.log(`Migration complete: ${result.totalInserted} records in ${result.totalBatches} batches`);
  
  return result;
}

// ============================================
// EXAMPLE 4: Complex Reporting with Query Builder
// ============================================

async function generateSalesReport(db, startDate, endDate) {
  // Get sales by category
  const salesByCategory = await db.queryBuilder()
    .table('orders')
    .select(
      'products.category',
      'COUNT(DISTINCT orders.id) as total_orders',
      'SUM(order_items.quantity) as total_items',
      'SUM(order_items.price * order_items.quantity) as total_revenue'
    )
    .join('order_items', 'orders.id', '=', 'order_items.order_id')
    .join('products', 'order_items.product_id', '=', 'products.id')
    .where('orders.status', 'completed')
    .whereBetween('orders.created_at', startDate, endDate)
    .groupBy('products.category')
    .orderBy('total_revenue', 'DESC')
    .get();

  // Get top customers
  const topCustomers = await db.queryBuilder()
    .table('orders')
    .select(
      'users.id',
      'users.name',
      'users.email',
      'COUNT(orders.id) as order_count',
      'SUM(orders.total) as total_spent'
    )
    .join('users', 'orders.user_id', '=', 'users.id')
    .where('orders.status', 'completed')
    .whereBetween('orders.created_at', startDate, endDate)
    .groupBy('users.id', 'users.name', 'users.email')
    .orderBy('total_spent', 'DESC')
    .limit(10)
    .get();

  // Get daily sales trend
  const dailySales = await db.query(
    `SELECT 
      DATE(created_at) as date,
      COUNT(*) as orders,
      SUM(total) as revenue
    FROM orders
    WHERE status = 'completed'
      AND created_at BETWEEN ? AND ?
    GROUP BY DATE(created_at)
    ORDER BY date`,
    [startDate, endDate]
  );

  return {
    salesByCategory,
    topCustomers,
    dailySales,
    summary: {
      totalRevenue: salesByCategory.reduce((sum, cat) => sum + parseFloat(cat.total_revenue), 0),
      totalOrders: salesByCategory.reduce((sum, cat) => sum + cat.total_orders, 0)
    }
  };
}

// ============================================
// EXAMPLE 5: User Authentication Service
// ============================================

class UserService {
  constructor(db) {
    this.db = db;
  }

  async register(userData) {
    // Check if user exists
    const existingUser = await this.db.findOne('users', {
      email: userData.email
    });

    if (existingUser) {
      throw new Error('User already exists');
    }

    // Hash password (use bcrypt in production)
    const hashedPassword = await this.hashPassword(userData.password);

    // Insert user
    const result = await this.db.insert('users', {
      name: userData.name,
      email: userData.email,
      password: hashedPassword,
      created_at: new Date(),
      status: 'active'
    });

    return { userId: result.insertId };
  }

  async login(email, password) {
    const user = await this.db.findOne('users', { email });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isValid = await this.verifyPassword(password, user.password);

    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await this.db.update(
      'users',
      { last_login: new Date() },
      { id: user.id }
    );

    return {
      userId: user.id,
      name: user.name,
      email: user.email
    };
  }

  async getUserProfile(userId) {
    return await this.db.findById('users', userId);
  }

  async updateProfile(userId, updates) {
    return await this.db.update('users', updates, { id: userId });
  }

  async hashPassword(password) {
    // Use bcrypt in production
    return password; // Simplified for example
  }

  async verifyPassword(password, hash) {
    // Use bcrypt in production
    return password === hash; // Simplified for example
  }
}

// ============================================
// EXAMPLE 6: API Pagination Example
// ============================================

class UserAPI {
  constructor(db) {
    this.db = db;
  }

  async getUsers(req) {
    const {
      page = 1,
      perPage = 20,
      status,
      search,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    // Build where conditions
    const where = {};
    if (status) where.status = status;

    // Handle search (use query builder for complex search)
    if (search) {
      const results = await this.db.queryBuilder()
        .table('users')
        .select('*')
        .where('name', 'LIKE', `%${search}%`)
        .orWhere('email', 'LIKE', `%${search}%`)
        .orderBy(sortBy, sortOrder)
        .limit(parseInt(perPage))
        .offset((parseInt(page) - 1) * parseInt(perPage))
        .get();

      const total = await this.db.queryBuilder()
        .table('users')
        .where('name', 'LIKE', `%${search}%`)
        .orWhere('email', 'LIKE', `%${search}%`)
        .count();

      return {
        data: results,
        pagination: {
          currentPage: parseInt(page),
          perPage: parseInt(perPage),
          totalItems: total,
          totalPages: Math.ceil(total / parseInt(perPage))
        }
      };
    }

    // Simple pagination without search
    return await this.db.paginate('users', {
      page: parseInt(page),
      perPage: parseInt(perPage),
      where,
      orderBy: `${sortBy} ${sortOrder}`
    });
  }
}

// ============================================
// EXAMPLE 7: Background Job Processor
// ============================================

async function processEmailQueue(db) {
  // Get pending emails in batches
  const pendingEmails = await db.select('email_queue', {
    where: { status: 'pending' },
    orderBy: 'created_at ASC',
    limit: 1000
  });

  if (pendingEmails.length === 0) {
    console.log('No pending emails');
    return;
  }

  console.log(`Processing ${pendingEmails.length} emails...`);

  await db.batchProcess(
    pendingEmails,
    async (batch) => {
      for (const email of batch) {
        try {
          // Send email (use actual email service in production)
          await sendEmail(email);

          // Update status
          await db.update(
            'email_queue',
            { status: 'sent', sent_at: new Date() },
            { id: email.id }
          );
        } catch (error) {
          // Mark as failed
          await db.update(
            'email_queue',
            { 
              status: 'failed',
              error_message: error.message,
              attempts: email.attempts + 1
            },
            { id: email.id }
          );
        }
      }
    },
    {
      batchSize: 50,
      concurrency: 3,
      onProgress: (progress) => {
        console.log(`Email processing: ${progress.percentage}% complete`);
      }
    }
  );

  console.log('Email processing complete');
}

async function sendEmail(email) {
  // Simulate email sending
  await new Promise(resolve => setTimeout(resolve, 100));
  console.log(`Sent email to ${email.to}`);
}

// ============================================
// EXAMPLE 8: Health Check Endpoint
// ============================================

async function healthCheck(db) {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {}
  };

  try {
    // Test connection
    await db.testConnection();
    health.checks.database = 'connected';
  } catch (error) {
    health.status = 'unhealthy';
    health.checks.database = 'disconnected';
    health.error = error.message;
  }

  // Check pool status
  const poolStatus = await db.getPoolStatus();
  if (poolStatus) {
    health.checks.pool = {
      ...poolStatus,
      healthy: poolStatus.freeConnections > 0
    };

    if (poolStatus.freeConnections === 0) {
      health.status = 'degraded';
    }
  }

  // Check for slow queries
  const slowQueries = db.getSlowQueries(1000);
  if (slowQueries.length > 10) {
    health.status = 'degraded';
    health.warnings = [`${slowQueries.length} slow queries detected`];
  }

  return health;
}

// ============================================
// EXAMPLE 9: Using Multiple Databases
// ============================================

class MultiDatabaseApp {
  constructor() {
    this.primaryDB = new MySQLHelper({
      host: 'primary-db.example.com',
      user: 'primary_user',
      password: 'password',
      database: 'primary_db'
    });

    this.analyticsDB = new MySQLHelper({
      host: 'analytics-db.example.com',
      user: 'analytics_user',
      password: 'password',
      database: 'analytics_db'
    });

    this.cacheDB = new MySQLHelper({
      host: 'cache-db.example.com',
      user: 'cache_user',
      password: 'password',
      database: 'cache_db',
      cache: true,
      cacheTTL: 60000 // 1 minute for cache DB
    });
  }

  async init() {
    await Promise.all([
      this.primaryDB.createPool(),
      this.analyticsDB.createPool(),
      this.cacheDB.createPool()
    ]);
  }

  async syncUserToAnalytics(userId) {
    // Get from primary
    const user = await this.primaryDB.findById('users', userId);
    
    // Insert into analytics
    await this.analyticsDB.insert('user_events', {
      user_id: userId,
      event_type: 'profile_view',
      data: JSON.stringify(user),
      created_at: new Date()
    });
  }

  async close() {
    await Promise.all([
      this.primaryDB.close(),
      this.analyticsDB.close(),
      this.cacheDB.close()
    ]);
  }
}

// ============================================
// Usage Examples
// ============================================

async function main() {
  const db = await setupWithMonitoring();

  try {
    // Example 1: Process an order
    const order = {
      userId: 1,
      total: 99.99,
      paymentMethod: 'credit_card',
      items: [
        { productId: 1, quantity: 2, price: 49.99 }
      ]
    };
    await processOrder(db, order);

    // Example 2: Generate report
    const report = await generateSalesReport(
      db,
      '2024-01-01',
      '2024-12-31'
    );
    console.log('Sales Report:', report.summary);

    // Example 3: Check health
    const health = await healthCheck(db);
    console.log('Health Check:', health);

  } finally {
    await db.close();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  setupWithMonitoring,
  processOrder,
  migrateData,
  generateSalesReport,
  UserService,
  UserAPI,
  processEmailQueue,
  healthCheck,
  MultiDatabaseApp
};