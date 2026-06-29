require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

const app = express();

// 静态文件
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_change_me';

// MySQL 连接池
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '1677858022Gjc',
  database: process.env.DB_NAME || 'wotbqydailian',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 自动建表（users）
async function initDB() {
  try {
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ 数据库表 users 已就绪');
  } catch (err) {
    console.error('❌ 建表失败:', err.message);
  }
}
initDB();

// ==================== 注册 ====================
app.post('/api/auth/register', async (req, res) => {
  const { username, password, email, phone, referralCode } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少需要6位' });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (rows.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: '用户名已被注册' });
    }
    const referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();
    let referrer_id = null;
    if (referralCode) {
      const [refRows] = await connection.execute('SELECT id FROM users WHERE referral_code = ?', [referralCode]);
      if (refRows.length > 0) referrer_id = refRows[0].id;
    }
    const password_hash = await bcrypt.hash(password, 12);
    const [result] = await connection.execute(
      `INSERT INTO users (username, password_hash, email, phone, referrer_id, referral_code) VALUES (?, ?, ?, ?, ?, ?)`,
      [username, password_hash, email || null, phone || null, referrer_id, referral_code]
    );
    const userId = result.insertId;
    if (referrer_id) {
      await connection.execute('UPDATE users SET balance = balance + 5.00 WHERE id = ?', [referrer_id]);
    }
    await connection.commit();
    res.status(201).json({
      success: true,
      message: '注册成功',
      user: {
        id: userId,
        username,
        email: email || null,
        phone: phone || null,
        referral_code,
        created_at: new Date().toISOString()
      }
    });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('注册错误:', err);
    res.status(500).json({ error: '服务器内部错误' });
  } finally {
    if (connection) connection.release();
  }
});

// ==================== 登录 ====================
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        balance: user.balance,
        reputation: user.reputation,
        referral_code: user.referral_code,
        role: user.role,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('登录错误:', err);
    res.status(500).json({ error: '服务器内部错误' });
  } finally {
    if (connection) connection.release();
  }
});

// ==================== JWT 中间件 ====================
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: '令牌无效或已过期' });
  }
}

// ==================== 管理员权限中间件 ====================
function adminMiddleware(req, res, next) {
  authMiddleware(req, res, async () => {
    try {
      const [rows] = await pool.execute('SELECT role FROM users WHERE id = ?', [req.userId]);
      if (rows.length === 0 || rows[0].role !== 'admin') {
        return res.status(403).json({ error: '无管理员权限' });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: '服务器错误' });
    }
  });
}

// ==================== 订单创建 ====================
app.post('/api/orders', authMiddleware, async (req, res) => {
  const { project, detail, quantity, player_name, price, urgent, total_price, remark } = req.body;
  if (!project || !detail || !quantity || !player_name || !price || !total_price) {
    return res.status(400).json({ error: '缺少订单必要信息' });
  }
  const order_no = 'WOT' + Date.now() + Math.random().toString(36).substring(2, 8).toUpperCase();
  let connection;
  try {
    connection = await pool.getConnection();
    const [result] = await connection.execute(
      `INSERT INTO orders (order_no, user_id, project, detail, quantity, player_name, price, urgent, total_price, remark, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [order_no, req.userId, project, detail, quantity, player_name, price, urgent ? 1 : 0, total_price, remark || null]
    );
    res.status(201).json({ success: true, order_no, order_id: result.insertId });
  } catch (err) {
    console.error('创建订单失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  } finally {
    if (connection) connection.release();
  }
});

// ==================== 用户信息 ====================
app.get('/api/user/profile', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, email, phone, balance, reputation, referral_code, created_at FROM users WHERE id = ?',
      [req.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: '用户不存在' });
    res.json(rows[0]);
  } catch (err) {
    console.error('获取用户信息失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ==================== 用户订单列表（唯一且完整） ====================
app.get('/api/user/orders', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT order_no, project, detail, quantity, player_name, total_price, status, 
              remark, payment_status, payment_screenshot, created_at 
       FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('获取订单失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ==================== 管理端：获取所有订单 ====================
app.get('/api/admin/orders', adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT o.*, u.username FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('获取订单失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ==================== 管理端：更新订单状态 ====================
app.put('/api/admin/orders/:orderNo', adminMiddleware, async (req, res) => {
  const { status } = req.body;
  const { orderNo } = req.params;
  if (!['pending', 'playing', 'done'].includes(status)) {
    return res.status(400).json({ error: '无效的状态值' });
  }
  try {
    const [result] = await pool.execute(
      'UPDATE orders SET status = ? WHERE order_no = ?',
      [status, orderNo]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '订单不存在' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('更新订单失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ==================== 管理端：删除订单 ====================
app.delete('/api/admin/orders/:orderNo', adminMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  try {
    const [result] = await pool.execute('DELETE FROM orders WHERE order_no = ?', [orderNo]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '订单不存在' });
    }
    res.json({ success: true, message: '订单已删除' });
  } catch (err) {
    console.error('删除订单失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ==================== 用户上传支付凭证 ====================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post('/api/orders/:orderNo/payment', authMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const { screenshot } = req.body;
  if (!screenshot) {
    return res.status(400).json({ error: '请提供支付截图' });
  }
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
  const filename = `payment_${orderNo}_${Date.now()}.png`;
  const filepath = path.join(uploadDir, filename);
  try {
    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync(filepath, base64Data, 'base64');
    await pool.execute(
      'UPDATE orders SET payment_screenshot = ?, payment_status = ? WHERE order_no = ? AND user_id = ?',
      [filename, 'pending', orderNo, req.userId]
    );
    res.json({ success: true, message: '支付凭证已上传，等待管理员确认' });
  } catch (err) {
    console.error('上传截图失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ==================== 管理员确认支付 ====================
app.put('/api/admin/orders/:orderNo/confirm-payment', adminMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  try {
    const [result] = await pool.execute(
      'UPDATE orders SET payment_status = ?, status = ? WHERE order_no = ?',
      ['paid', 'playing', orderNo]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: '订单不存在' });
    res.json({ success: true, message: '已确认支付' });
  } catch (err) {
    console.error('确认支付失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ==================== 启动 ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 后端服务运行在 http://localhost:${PORT}`);
});