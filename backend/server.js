require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_change_me';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '1677858022Gjc',
  database: process.env.DB_NAME || 'wotbqydailian',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true
});

// ---------- IP 注册限流 ----------
const ipRegisterCount = new Map();

function ipRegisterLimit(req, res, next) {
  const clientIp = req.ip || req.connection.remoteAddress;
  const today = new Date().toISOString().slice(0, 10);
  const key = `${clientIp}_${today}`;
  const count = ipRegisterCount.get(key) || 0;
  if (count >= 5) {
    return res.status(429).json({ error: '操作频繁，请明天再试' });
  }
  ipRegisterCount.set(key, count + 1);
  next();
}

// ---------- 初始化数据库 ----------
async function initDB() {
  try {
    // 用户表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(30) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(20),
        balance DECIMAL(10,2) DEFAULT 0.00,
        reputation INT DEFAULT 100,
        referrer_id INT,
        referral_code VARCHAR(10) UNIQUE,
        auth_provider VARCHAR(20) DEFAULT 'local',
        role VARCHAR(10) DEFAULT 'user',
        game_uid VARCHAR(50),
        game_account VARCHAR(50),
        game_password VARCHAR(50),
        earnings DECIMAL(10,2) DEFAULT 0.00,
        booster_identity ENUM('gold','silver','standard','budget') DEFAULT 'standard',
        booster_points INT DEFAULT 0,
        qy_credits INT DEFAULT 0,
        total_earned_credits INT DEFAULT 0,
        vip_level TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 订单表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_no VARCHAR(30) NOT NULL UNIQUE,
        user_id INT NOT NULL,
        project VARCHAR(50) NOT NULL,
        detail VARCHAR(100) NOT NULL,
        quantity INT NOT NULL,
        player_name VARCHAR(10) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        urgent TINYINT(1) DEFAULT 0,
        total_price DECIMAL(10,2) NOT NULL,
        remark VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending',
        payment_status VARCHAR(20) DEFAULT 'unpaid',
        payment_screenshot VARCHAR(255),
        booster_id INT,
        hall_status ENUM('open','taken') DEFAULT NULL,
        game_uid VARCHAR(50),
        game_account VARCHAR(50),
        game_password VARCHAR(50),
        client_type VARCHAR(10) DEFAULT 'Android',
        required_identity ENUM('gold','silver','standard','budget') DEFAULT 'standard',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 定制需求表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS custom_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        client_type VARCHAR(10) NOT NULL DEFAULT 'Android',
        request_type VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        contact VARCHAR(100) NOT NULL,
        budget VARCHAR(50) DEFAULT '',
        available_time VARCHAR(100) DEFAULT '',
        remark VARCHAR(255) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 联赛相关表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS league_seasons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        current_round INT DEFAULT 1,
        current_day INT DEFAULT 1,
        prev_rank_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS league_points_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        season_id INT NOT NULL,
        round_num INT NOT NULL,
        day_num INT NOT NULL,
        rank_position INT NOT NULL,
        points INT NOT NULL,
        FOREIGN KEY (season_id) REFERENCES league_seasons(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS league_teams (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS league_scores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        season_id INT NOT NULL,
        team_id INT NOT NULL,
        round_num INT NOT NULL,
        day_num INT NOT NULL,
        rank_position INT NOT NULL,
        points INT NOT NULL,
        FOREIGN KEY (season_id) REFERENCES league_seasons(id) ON DELETE CASCADE,
        FOREIGN KEY (team_id) REFERENCES league_teams(id) ON DELETE CASCADE,
        UNIQUE KEY unique_score (season_id, team_id, round_num, day_num)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 积分商城商品表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS qy_shop_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        image VARCHAR(255) DEFAULT NULL,
        price_credits INT NOT NULL,
        stock INT DEFAULT -1,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 用户购买记录表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS qy_purchases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        item_id INT NOT NULL,
        item_name VARCHAR(100) NOT NULL,
        price_credits INT NOT NULL,
        purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 兼容旧字段（新增积分/VIP等）
    try { await pool.execute(`ALTER TABLE users ADD COLUMN qy_credits INT DEFAULT 0`); } catch(e) {}
    try { await pool.execute(`ALTER TABLE users ADD COLUMN total_earned_credits INT DEFAULT 0`); } catch(e) {}
    try { await pool.execute(`ALTER TABLE users ADD COLUMN vip_level TINYINT DEFAULT 0`); } catch(e) {}
    try { await pool.execute(`ALTER TABLE orders ADD COLUMN required_identity ENUM('gold','silver','standard','budget') DEFAULT 'standard'`); } catch(e) {}
    try { await pool.execute(`ALTER TABLE orders ADD COLUMN client_type VARCHAR(10) DEFAULT 'Android'`); } catch(e) {}

    console.log('✅ 数据库表已就绪');
  } catch (err) {
    console.error('❌ 建表失败:', err.message);
  }
}
initDB();

// ---------- 注册/登录 ----------
app.post('/api/auth/register', ipRegisterLimit, async (req, res) => {
  const { username, password, email, phone, referralCode } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少需要6位' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (rows.length > 0) { await connection.rollback(); return res.status(409).json({ error: '用户名已被注册' }); }

    const referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();
    let referrer_id = null;

    if (referralCode) {
      const [refRows] = await connection.execute('SELECT id FROM users WHERE referral_code = ?', [referralCode]);
      if (refRows.length === 0) { await connection.rollback(); return res.status(400).json({ error: '无效的推荐码' }); }
      referrer_id = refRows[0].id;

      // 检查推荐人今日推荐次数
      const [todayCnt] = await connection.execute(
        `SELECT COUNT(*) AS cnt FROM users WHERE referrer_id = ? AND DATE(created_at) = CURDATE()`,
        [referrer_id]
      );
      if (todayCnt[0].cnt >= 20) {
        await connection.rollback();
        return res.status(400).json({ error: '该推荐码今日使用次数已达上限' });
      }
    }

    const password_hash = await bcrypt.hash(password, 12);
    const [result] = await connection.execute(
      `INSERT INTO users (username, password_hash, email, phone, referrer_id, referral_code, booster_identity, qy_credits, total_earned_credits)
       VALUES (?, ?, ?, ?, ?, ?, 'standard', 0, 0)`,
      [username, password_hash, email || null, phone || null, referrer_id, referral_code]
    );

    // 推荐奖励：双方各得300积分
    if (referrer_id) {
      await connection.execute(
        `UPDATE users SET qy_credits = qy_credits + 300, total_earned_credits = total_earned_credits + 300 WHERE id = ?`,
        [referrer_id]
      );
      await connection.execute(
        `UPDATE users SET qy_credits = qy_credits + 300, total_earned_credits = total_earned_credits + 300 WHERE id = ?`,
        [result.insertId]
      );
    }

    await connection.commit();
    res.status(201).json({ success: true, message: '注册成功', user: { id: result.insertId, username, referral_code } });
  } catch(err) {
    if (connection) await connection.rollback();
    console.error('注册错误:', err);
    res.status(500).json({ error: '服务器内部错误' });
  } finally {
    if (connection) connection.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) return res.status(401).json({ error: '用户名或密码错误' });
    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: '用户名或密码错误' });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: {
      id: user.id, username: user.username, email: user.email, phone: user.phone,
      balance: user.balance, reputation: user.reputation, referral_code: user.referral_code,
      role: user.role, created_at: user.created_at, booster_identity: user.booster_identity,
      booster_points: user.booster_points, qy_credits: user.qy_credits, vip_level: user.vip_level
    }});
  } catch(err) { console.error('登录错误:', err); res.status(500).json({ error: '服务器内部错误' }); }
  finally { if (connection) connection.release(); }
});

// ---------- JWT 中间件 ----------
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: '未提供认证令牌' });
  const token = header.split(' ')[1];
  try { const decoded = jwt.verify(token, JWT_SECRET); req.userId = decoded.userId; next(); }
  catch(err) { return res.status(401).json({ error: '令牌无效或已过期' }); }
}
function adminMiddleware(req, res, next) {
  authMiddleware(req, res, async () => {
    const [rows] = await pool.execute('SELECT role FROM users WHERE id = ?', [req.userId]);
    if (rows.length === 0 || rows[0].role !== 'admin') return res.status(403).json({ error: '无管理员权限' });
    next();
  });
}
function boosterMiddleware(req, res, next) {
  authMiddleware(req, res, async () => {
    const [rows] = await pool.execute('SELECT role FROM users WHERE id = ?', [req.userId]);
    if (rows.length === 0 || (rows[0].role !== 'booster' && rows[0].role !== 'admin')) return res.status(403).json({ error: '需要打手或管理员权限' });
    next();
  });
}

// ---------- 打手身份权限工具 ----------
const identityWeights = { gold: 4, silver: 3, standard: 2, budget: 1 };
function canTakeOrder(boosterIdentity, requiredIdentity) {
  return (identityWeights[boosterIdentity] || 0) >= (identityWeights[requiredIdentity] || 0);
}

async function checkBoosterUpgrade(conn, userId) {
  const [rows] = await conn.execute('SELECT booster_identity, booster_points FROM users WHERE id = ?', [userId]);
  if (!rows.length) return;
  const { booster_identity, booster_points } = rows[0];
  let newIdentity = booster_identity;
  if (booster_points >= 50000 && booster_identity === 'silver') newIdentity = 'gold';
  else if (booster_points >= 10000 && booster_identity === 'standard') newIdentity = 'silver';
  else if (booster_points >= 5000 && booster_identity === 'budget') newIdentity = 'standard';
  if (newIdentity !== booster_identity) {
    await conn.execute('UPDATE users SET booster_identity = ? WHERE id = ?', [newIdentity, userId]);
    console.log(`打手 ${userId} 升级为 ${newIdentity}`);
  }
}

// ---------- 订单创建（支持积分抵扣） ----------
app.post('/api/orders', authMiddleware, async (req, res) => {
  const { project, detail, quantity, player_name, price, urgent, total_price, remark,
          game_uid, game_account, game_password, client_type, player_type, use_credits } = req.body;
  if (!project || !detail || !quantity || !player_name || !price || !total_price)
    return res.status(400).json({ error: '缺少订单必要信息' });

  const order_no = 'WOT' + Date.now() + Math.random().toString(36).substring(2,8).toUpperCase();
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    let finalTotal = total_price;
    let creditsUsed = 0;
    if (use_credits && use_credits > 0) {
      const [creditsRow] = await conn.execute('SELECT qy_credits FROM users WHERE id = ?', [req.userId]);
      const available = creditsRow[0]?.qy_credits || 0;
      creditsUsed = Math.min(use_credits, available);
      const maxDiscountByCredits = creditsUsed / 100;
      const actualDiscount = Math.min(maxDiscountByCredits, total_price);
      creditsUsed = Math.floor(actualDiscount * 100);
      if (creditsUsed > 0) {
        await conn.execute('UPDATE users SET qy_credits = qy_credits - ? WHERE id = ?', [creditsUsed, req.userId]);
      }
      finalTotal = total_price - actualDiscount;
    }

    const [result] = await conn.execute(
      `INSERT INTO orders (order_no, user_id, project, detail, quantity, player_name, price, urgent, total_price, remark, game_uid, game_account, game_password, client_type, required_identity, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [order_no, req.userId, project, detail, quantity, player_name, price, urgent?1:0, finalTotal,
       remark||null, game_uid||null, game_account||null, game_password||null,
       client_type||'Android', player_type||'standard']
    );

    await conn.commit();
    res.status(201).json({ success: true, order_no, order_id: result.insertId });
  } catch(err) {
    if (conn) await conn.rollback();
    console.error('创建订单失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  } finally {
    if (conn) conn.release();
  }
});

// ---------- 用户接口 ----------
app.get('/api/user/profile', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, email, phone, balance, reputation, referral_code, created_at, booster_identity, booster_points FROM users WHERE id = ?',
      [req.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: '用户不存在' });
    res.json(rows[0]);
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});

app.get('/api/user/orders', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT order_no, project, detail, quantity, player_name, total_price, status, remark, payment_status, payment_screenshot, created_at, client_type, required_identity
       FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});

// 获取积分与VIP
app.get('/api/user/credits', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT qy_credits, total_earned_credits, vip_level FROM users WHERE id = ?',
      [req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: '用户不存在' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

// ---------- 支付上传 ----------
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.post('/api/orders/:orderNo/payment', authMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const { screenshot } = req.body;
  if (!screenshot) return res.status(400).json({ error: '请提供支付截图' });
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
  const filename = `payment_${orderNo}_${Date.now()}.png`;
  try {
    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync(path.join(uploadDir, filename), base64Data, 'base64');
    await pool.execute('UPDATE orders SET payment_screenshot = ?, payment_status = ? WHERE order_no = ? AND user_id = ?',
      [filename, 'pending', orderNo, req.userId]);
    res.json({ success: true, message: '支付凭证已上传' });
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});

// ---------- 管理端订单 ----------
app.get('/api/admin/orders', adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(`SELECT o.*, u.username FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC`);
    res.json(rows);
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});
app.put('/api/admin/orders/:orderNo', adminMiddleware, async (req, res) => {
  const { status } = req.body;
  const { orderNo } = req.params;
  if (!['pending','playing','done'].includes(status)) return res.status(400).json({ error: '无效的状态值' });
  try {
    if (status === 'done') {
      const [orderRows] = await pool.execute('SELECT payment_status FROM orders WHERE order_no = ?', [orderNo]);
      if (orderRows.length === 0) return res.status(404).json({ error: '订单不存在' });
      if (orderRows[0].payment_status !== 'paid') return res.status(400).json({ error: '请先确认收款后才能标记为已完成' });
    }
    await pool.execute('UPDATE orders SET status = ? WHERE order_no = ?', [status, orderNo]);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});
app.delete('/api/admin/orders/:orderNo', adminMiddleware, async (req, res) => {
  try { await pool.execute('DELETE FROM orders WHERE order_no = ?', [req.params.orderNo]); res.json({ success: true }); }
  catch(err) { res.status(500).json({ error: '服务器错误' }); }
});
app.put('/api/admin/orders/:orderNo/confirm-payment', adminMiddleware, async (req, res) => {
  try {
    await pool.execute('UPDATE orders SET payment_status = ?, status = ? WHERE order_no = ?', ['paid', 'playing', req.params.orderNo]);
    res.json({ success: true, message: '已确认支付' });
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});
app.put('/api/admin/orders/:orderNo/hall', adminMiddleware, async (req, res) => {
  try {
    await pool.execute('UPDATE orders SET hall_status = ? WHERE order_no = ?', ['open', req.params.orderNo]);
    res.json({ success: true, message: '已放入接单大厅' });
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});

// ---------- 订单详情 ----------
app.get('/api/orders/:orderNo/detail', authMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  try {
    const [rows] = await pool.execute(`SELECT o.*, u.username AS customer_name FROM orders o JOIN users u ON o.user_id = u.id WHERE o.order_no = ?`, [orderNo]);
    if (rows.length === 0) return res.status(404).json({ error: '订单不存在' });
    const order = rows[0];
    const [userRows] = await pool.execute('SELECT role FROM users WHERE id = ?', [req.userId]);
    const role = userRows[0]?.role;
    if (role !== 'admin' && req.userId !== order.user_id && req.userId !== order.booster_id) return res.status(403).json({ error: '无权查看' });
    if (role !== 'admin' && req.userId !== order.user_id) order.game_password = '******';
    res.json(order);
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});

// ---------- 用户角色管理 ----------
app.get('/api/admin/users', adminMiddleware, async (req, res) => {
  try { const [rows] = await pool.execute('SELECT id, username, role FROM users ORDER BY id'); res.json(rows); }
  catch(err) { res.status(500).json({ error: '服务器错误' }); }
});
app.put('/api/admin/users/:userId/role', adminMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  if (!['user','booster','admin'].includes(role)) return res.status(400).json({ error: '无效的角色值' });
  try { await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, userId]); res.json({ success: true, message: `角色已更新为 ${role}` }); }
  catch(err) { res.status(500).json({ error: '服务器错误' }); }
});

// ---------- 打手接口 ----------
app.get('/api/booster/hall', boosterMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT order_no, project, detail, quantity, player_name, total_price, status, game_uid, game_account, client_type, required_identity, created_at,
       (total_price * 0.75) AS earnings FROM orders WHERE hall_status = 'open' AND booster_id IS NULL AND status = 'pending' ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});

app.post('/api/booster/take/:orderNo', boosterMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const boosterId = req.userId;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [orderRows] = await conn.execute('SELECT required_identity FROM orders WHERE order_no = ? AND hall_status = ? AND booster_id IS NULL', [orderNo, 'open']);
    if (orderRows.length === 0) { await conn.rollback(); return res.status(400).json({ error: '订单不可接' }); }
    const [boosterRows] = await conn.execute('SELECT booster_identity FROM users WHERE id = ?', [boosterId]);
    if (!canTakeOrder(boosterRows[0].booster_identity, orderRows[0].required_identity)) {
      await conn.rollback();
      return res.status(400).json({ error: '您的身份组不满足该订单要求' });
    }
    await conn.execute('UPDATE orders SET booster_id = ?, hall_status = ?, status = ? WHERE order_no = ?', [boosterId, 'taken', 'playing', orderNo]);
    await conn.commit();
    res.json({ success: true, message: '接单成功' });
  } catch(err) { if (conn) await conn.rollback(); res.status(500).json({ error: '服务器错误' }); }
  finally { if (conn) conn.release(); }
});

app.get('/api/booster/my-orders', boosterMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT order_no, project, detail, quantity, player_name, total_price, status, game_uid, game_account, client_type, required_identity, created_at,
       (total_price * 0.75) AS earnings FROM orders WHERE booster_id = ? ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});

app.post('/api/booster/complete/:orderNo', boosterMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const boosterId = req.userId;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM orders WHERE order_no = ? AND booster_id = ? AND status = ?', [orderNo, boosterId, 'playing']);
    if (rows.length === 0) { await conn.rollback(); return res.status(400).json({ error: '订单无法完成' }); }
    const order = rows[0];
    if (order.payment_status !== 'paid') { await conn.rollback(); return res.status(400).json({ error: '该订单尚未确认支付，无法完成' }); }

    // 打手收益
    const earnings = order.total_price * 0.75;
    const pointsEarned = Math.floor(earnings * 100);
    await conn.execute('UPDATE orders SET status = ? WHERE order_no = ?', ['done', orderNo]);
    await conn.execute('UPDATE users SET earnings = earnings + ?, booster_points = booster_points + ? WHERE id = ?',
      [earnings, pointsEarned, boosterId]);
    await checkBoosterUpgrade(conn, boosterId);

    // 积分返利：下单用户获得订单金额3%的QY积分
    const creditsEarned = Math.floor(order.total_price * 0.03 * 100);
    await conn.execute(
      'UPDATE users SET qy_credits = qy_credits + ?, total_earned_credits = total_earned_credits + ? WHERE id = ?',
      [creditsEarned, creditsEarned, order.user_id]
    );

    // VIP 自动升级
    const [userRow] = await conn.execute('SELECT total_earned_credits FROM users WHERE id = ?', [order.user_id]);
    const totalCredits = userRow[0].total_earned_credits;
    let newVip = 0;
    if (totalCredits >= 15000) newVip = 5;
    else if (totalCredits >= 6000) newVip = 4;
    else if (totalCredits >= 3000) newVip = 3;
    else if (totalCredits >= 1500) newVip = 2;
    else if (totalCredits >= 600) newVip = 1;
    await conn.execute('UPDATE users SET vip_level = ? WHERE id = ?', [newVip, order.user_id]);

    await conn.commit();
    res.json({ success: true, message: '订单已完成', earnings });
  } catch(err) { if (conn) await conn.rollback(); res.status(500).json({ error: '服务器错误' }); }
  finally { if (conn) conn.release(); }
});

app.get('/api/booster/earnings', boosterMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT earnings FROM users WHERE id = ?', [req.userId]);
    res.json({ earnings: rows[0]?.earnings || 0 });
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});

// ---------- 定制需求 ----------
app.post('/api/custom-request', authMiddleware, async (req, res) => {
  const { client_type, request_type, description, contact, budget, available_time, remark } = req.body;
  if (!client_type || !request_type || !description || !contact) return res.status(400).json({ error: '客户端、需求类型、描述和联系方式为必填' });
  try {
    await pool.execute(
      `INSERT INTO custom_requests (user_id, client_type, request_type, description, contact, budget, available_time, remark) VALUES (?,?,?,?,?,?,?,?)`,
      [req.userId, client_type, request_type, description, contact, budget||'', available_time||'', remark||'']
    );
    res.status(201).json({ success: true, message: '定制需求已提交' });
  } catch(err) { res.status(500).json({ error: '服务器内部错误' }); }
});
app.get('/api/admin/custom-requests', adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(`SELECT cr.*, u.username FROM custom_requests cr JOIN users u ON cr.user_id = u.id ORDER BY cr.created_at DESC`);
    res.json(rows);
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});

// ---------- 联赛管理 ----------
app.get('/api/admin/leagues', adminMiddleware, async (req, res) => {
  try { const [rows] = await pool.execute('SELECT * FROM league_seasons ORDER BY id DESC'); res.json(rows); }
  catch(err) { res.status(500).json({ error: '服务器错误' }); }
});
app.post('/api/admin/leagues', adminMiddleware, async (req, res) => {
  const { id, name, current_round, current_day } = req.body;
  if (!name) return res.status(400).json({ error: '请输入赛季名称' });
  try {
    if (id) {
      await pool.execute('UPDATE league_seasons SET name=?, current_round=?, current_day=? WHERE id=?', [name, current_round||1, current_day||1, id]);
      res.json({ success: true, message: '赛季已更新' });
    } else {
      const [result] = await pool.execute('INSERT INTO league_seasons (name) VALUES (?)', [name]);
      res.json({ success: true, id: result.insertId });
    }
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});
app.delete('/api/admin/leagues/:id', adminMiddleware, async (req, res) => {
  try { await pool.execute('DELETE FROM league_seasons WHERE id=?', [req.params.id]); res.json({ success: true }); }
  catch(err) { res.status(500).json({ error: '服务器错误' }); }
});
app.get('/api/admin/leagues/:id/rules', adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM league_points_rules WHERE season_id=? ORDER BY round_num, day_num, rank_position', [req.params.id]);
    res.json(rows);
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});
app.post('/api/admin/leagues/:id/rules', adminMiddleware, async (req, res) => {
  const { rules } = req.body;
  const seasonId = req.params.id;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.execute('DELETE FROM league_points_rules WHERE season_id=?', [seasonId]);
    if (rules && rules.length) {
      const sql = 'INSERT INTO league_points_rules (season_id, round_num, day_num, rank_position, points) VALUES ?';
      const values = rules.map(r => [seasonId, r.round_num, r.day_num, r.rank_position, r.points]);
      await conn.query(sql, [values]);
    }
    await conn.commit();
    res.json({ success: true, message: '积分规则已更新' });
  } catch(err) { if (conn) await conn.rollback(); res.status(500).json({ error: '服务器错误' }); }
  finally { if (conn) conn.release(); }
});

app.get('/api/admin/teams', adminMiddleware, async (req, res) => {
  try { const [rows] = await pool.execute('SELECT * FROM league_teams ORDER BY id'); res.json(rows); }
  catch(err) { res.status(500).json({ error: '服务器错误' }); }
});
app.post('/api/admin/teams', adminMiddleware, async (req, res) => {
  const { id, name } = req.body;
  if (!name) return res.status(400).json({ error: '队伍名必填' });
  try {
    if (id) await pool.execute('UPDATE league_teams SET name=? WHERE id=?', [name, id]);
    else await pool.execute('INSERT INTO league_teams (name) VALUES (?)', [name]);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.code === 'ER_DUP_ENTRY' ? '队伍名重复' : '服务器错误' }); }
});
app.delete('/api/admin/teams/:id', adminMiddleware, async (req, res) => {
  try { await pool.execute('DELETE FROM league_teams WHERE id=?', [req.params.id]); res.json({ success: true }); }
  catch(err) { res.status(500).json({ error: '服务器错误' }); }
});
app.get('/api/admin/leagues/:seasonId/scores/:round/:day', adminMiddleware, async (req, res) => {
  const { seasonId, round, day } = req.params;
  try {
    const [scores] = await pool.execute(
      `SELECT ls.*, lt.name as team_name FROM league_scores ls JOIN league_teams lt ON ls.team_id=lt.id WHERE ls.season_id=? AND ls.round_num=? AND ls.day_num=?`,
      [seasonId, round, day]
    );
    res.json(scores);
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});
app.post('/api/admin/leagues/:seasonId/scores', adminMiddleware, async (req, res) => {
  const { seasonId } = req.params;
  const { round_num, day_num, scores } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    for (let s of scores) {
      const [r] = await conn.execute(
        'SELECT points FROM league_points_rules WHERE season_id=? AND round_num=? AND day_num=? AND rank_position=?',
        [seasonId, round_num, day_num, s.rank_position]
      );
      const points = r.length ? r[0].points : 0;
      await conn.execute(
        `INSERT INTO league_scores (season_id, team_id, round_num, day_num, rank_position, points)
         VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE rank_position=?, points=?`,
        [seasonId, s.team_id, round_num, day_num, s.rank_position, points, s.rank_position, points]
      );
    }
    const [teamPoints] = await conn.execute(
      `SELECT team_id, SUM(points) as total FROM league_scores WHERE season_id=? GROUP BY team_id ORDER BY total DESC`,
      [seasonId]
    );
    const newRank = teamPoints.map((tp, idx) => ({ team_id: tp.team_id, total: tp.total, rank: idx+1 }));
    const newRankJson = JSON.stringify(newRank);
    const [seasonRows] = await conn.execute('SELECT prev_rank_json FROM league_seasons WHERE id=?', [seasonId]);
    const oldRank = seasonRows[0]?.prev_rank_json ? JSON.parse(seasonRows[0].prev_rank_json) : [];
    const oldMap = {};
    oldRank.forEach((t, idx) => oldMap[t.team_id] = idx+1);
    newRank.forEach(t => {
      const oldPos = oldMap[t.team_id];
      t.change = oldPos ? (oldPos - t.rank) : 0;
    });
    await conn.execute('UPDATE league_seasons SET prev_rank_json=? WHERE id=?', [newRankJson, seasonId]);
    await conn.commit();
    res.json({ success: true, rankings: newRank });
  } catch(err) { if (conn) await conn.rollback(); res.status(500).json({ error: '服务器错误' }); }
  finally { if (conn) conn.release(); }
});

// 公开积分榜
app.get('/api/league/:seasonId/rankings', async (req, res) => {
  const { seasonId } = req.params;
  try {
    const [season] = await pool.execute('SELECT * FROM league_seasons WHERE id=?', [seasonId]);
    if (!season.length) return res.status(404).json({ error: '赛季不存在' });
    const [teams] = await pool.execute('SELECT * FROM league_teams ORDER BY id');
    const [scores] = await pool.execute(
      `SELECT team_id, round_num, day_num, SUM(points) as points FROM league_scores WHERE season_id=? GROUP BY team_id, round_num, day_num`,
      [seasonId]
    );
    const teamScoreMap = {};
    teams.forEach(t => teamScoreMap[t.id] = { name: t.name, rounds: {}, total: 0 });
    scores.forEach(s => {
      const key = `R${s.round_num}D${s.day_num}`;
      if (teamScoreMap[s.team_id]) {
        teamScoreMap[s.team_id].rounds[key] = s.points;
        teamScoreMap[s.team_id].total += s.points;
      }
    });
    const rankingArray = Object.entries(teamScoreMap)
      .map(([team_id, data]) => ({ team_id: parseInt(team_id), ...data }))
      .sort((a, b) => b.total - a.total);
    const prevRankJson = season[0].prev_rank_json;
    const oldMap = {};
    if (prevRankJson) JSON.parse(prevRankJson).forEach((t, idx) => oldMap[t.team_id] = idx+1);
    rankingArray.forEach((t, idx) => {
      t.rank = idx + 1;
      const oldPos = oldMap[t.team_id];
      t.change = oldPos ? (oldPos - t.rank) : 0;
    });
    res.json({ season: season[0], rankings: rankingArray });
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});

// ---------- 打手管理（管理员） ----------
app.get('/api/admin/boosters', adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, booster_identity, booster_points FROM users WHERE role IN (\'booster\',\'admin\') ORDER BY booster_identity DESC'
    );
    res.json(rows);
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});
app.put('/api/admin/boosters/:userId', adminMiddleware, async (req, res) => {
  const { booster_identity } = req.body;
  if (!['gold','silver','standard','budget'].includes(booster_identity)) {
    return res.status(400).json({ error: '无效身份组' });
  }
  try {
    await pool.execute('UPDATE users SET booster_identity = ? WHERE id = ?', [booster_identity, req.params.userId]);
    res.json({ success: true, message: '身份已更新' });
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});

// ---------- 积分商城 ----------
// 管理员获取所有商品
app.get('/api/admin/shop/items', adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM qy_shop_items ORDER BY id');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

// 管理员新增/更新商品
app.post('/api/admin/shop/items', adminMiddleware, async (req, res) => {
  const { id, name, description, image, price_credits, stock, is_active } = req.body;
  if (!name || price_credits == null) return res.status(400).json({ error: '名称和积分价格必填' });
  try {
    if (id) {
      await pool.execute(
        'UPDATE qy_shop_items SET name=?, description=?, image=?, price_credits=?, stock=?, is_active=? WHERE id=?',
        [name, description, image, price_credits, stock ?? -1, is_active ?? 1, id]
      );
    } else {
      await pool.execute(
        'INSERT INTO qy_shop_items (name, description, image, price_credits, stock, is_active) VALUES (?,?,?,?,?,?)',
        [name, description, image, price_credits, stock ?? -1, is_active ?? 1]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

// 管理员删除商品
app.delete('/api/admin/shop/items/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.execute('DELETE FROM qy_shop_items WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

// 用户获取可购买商品
app.get('/api/shop/items', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, description, image, price_credits, stock FROM qy_shop_items WHERE is_active=1 AND (stock > 0 OR stock = -1)'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

// 用户购买商品
app.post('/api/shop/buy/:itemId', authMiddleware, async (req, res) => {
  const itemId = req.params.itemId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [items] = await conn.execute('SELECT * FROM qy_shop_items WHERE id=? AND is_active=1', [itemId]);
    if (items.length === 0) throw new Error('商品不存在或已下架');
    const item = items[0];
    if (item.stock === 0) throw new Error('商品库存不足');
    
    const [user] = await conn.execute('SELECT qy_credits FROM users WHERE id=?', [req.userId]);
    if (user[0].qy_credits < item.price_credits) throw new Error('积分不足');
    
    // 扣积分
    await conn.execute('UPDATE users SET qy_credits = qy_credits - ? WHERE id=?', [item.price_credits, req.userId]);
    // 扣库存
    if (item.stock > 0) {
      await conn.execute('UPDATE qy_shop_items SET stock = stock - 1 WHERE id=?', [itemId]);
    }
    // 记录购买
    await conn.execute(
      'INSERT INTO qy_purchases (user_id, item_id, item_name, price_credits) VALUES (?,?,?,?)',
      [req.userId, item.id, item.name, item.price_credits]
    );
    await conn.commit();
    res.json({ success: true, message: '购买成功' });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ---------- 启动 ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 后端服务运行在 http://localhost:${PORT}`);
});