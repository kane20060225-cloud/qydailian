require('dotenv').config({ path: __dirname + '/.env', quiet: true });
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const crypto = require('node:crypto');
const { createFieldCipher } = require('./lib/field-encryption');
const { createAuthMiddleware, issueSessionToken } = require('./lib/auth-session');
const { generateTotpSecret, verifyTotpCode } = require('./lib/totp');
const { createRecoveryCodes, hashRecoveryCode } = require('./lib/recovery-codes');
const { postAccountDelta, recordOperation } = require('./lib/accounting');
const { validateRentalPaymentEvidence } = require('./lib/rental-payment-evidence');
const { saveRentalScreenshot, MAX_IMAGE_BYTES } = require('./lib/rental-stream-upload');
const {
  THIRD_PARTY_PLATFORMS,
  cleanText: cleanThirdPartyText,
  normalizePlatform: normalizeThirdPartyPlatform,
  validateOrderInput: validateThirdPartyOrderInput,
  getWorkflowStage,
  canReview,
  canResubmit,
  canRequestCompletion,
  canReturnCompletion,
  canConfirmPayment
} = require('./lib/third-party-workflow');
const { createRentalAccountRouter } = require('./routes/rental-accounts');
const { createOrderCenterRouter } = require('./routes/order-center');
const { paymentFormParams, createRechargeOrder, processTrackedRecharge,
  refreshRecharge, canResumeRecharge } = require('./lib/recharge-orders');
const {
  RECHARGE_TICKETS,
  isValidOutTradeNo,
  maskTradeReference,
  validateAlipayConfiguration
} = require('./lib/payment-security');

function requireEnvironmentVariables(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`缺少必要环境变量: ${missing.join(', ')}`);
  }
}

requireEnvironmentVariables([
  'JWT_SECRET',
  'DATA_ENCRYPTION_KEY',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME'
]);

const sensitiveFieldCipher = createFieldCipher(process.env.DATA_ENCRYPTION_KEY);
const ORDER_GAME_ACCOUNT_CONTEXT = 'orders.game_account';
const ORDER_GAME_PASSWORD_CONTEXT = 'orders.game_password';
const TWO_FACTOR_SECRET_CONTEXT = 'user_settings.two_factor_secret';

function revealOrderCredentials(order, { includePassword = true } = {}) {
  const revealed = { ...order };
  if (Object.hasOwn(revealed, 'game_account')) {
    revealed.game_account = sensitiveFieldCipher.decrypt(
      revealed.game_account,
      ORDER_GAME_ACCOUNT_CONTEXT
    );
  }
  if (Object.hasOwn(revealed, 'game_password')) {
    revealed.game_password = includePassword
      ? sensitiveFieldCipher.decrypt(revealed.game_password, ORDER_GAME_PASSWORD_CONTEXT)
      : '******';
  }
  return revealed;
}

const app = express();
// 只信任本机 Nginx 转发的客户端 IP；直连 3000 端口的外部请求不能伪造 X-Forwarded-For。
app.set('trust proxy', 'loopback');

const repositoryPublicDir = path.join(__dirname, '..', 'public');
const legacyPublicDir = path.join(__dirname, 'public');
const publicDir = process.env.PUBLIC_DIR
  ? path.resolve(process.env.PUBLIC_DIR)
  : (fs.existsSync(repositoryPublicDir) ? repositoryPublicDir : legacyPublicDir);

app.use(express.static(publicDir));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

const JWT_SECRET = process.env.JWT_SECRET;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true
});

// ---------- 支付宝 SDK ----------
const ALIPAY_ENABLED = process.env.ALIPAY_ENABLED === 'true';
let alipaySdk = null;
let paymentConfig = null;

if (ALIPAY_ENABLED) {
  requireEnvironmentVariables([
    'ALIPAY_ENVIRONMENT',
    'ALIPAY_APP_ID',
    'ALIPAY_SELLER_ID',
    'ALIPAY_PRIVATE_KEY_PATH',
    'ALIPAY_PUBLIC_KEY_PATH',
    'ALIPAY_GATEWAY',
    'ALIPAY_NOTIFY_URL',
    'ALIPAY_RETURN_URL'
  ]);
  paymentConfig = validateAlipayConfiguration(process.env);

  const { AlipaySdk } = require('alipay-sdk');
  const alipayPrivateKey = fs.readFileSync(path.resolve(process.env.ALIPAY_PRIVATE_KEY_PATH), 'utf8');
  const alipayPublicKey = fs.readFileSync(path.resolve(process.env.ALIPAY_PUBLIC_KEY_PATH), 'utf8');

  alipaySdk = new AlipaySdk({
    appId: process.env.ALIPAY_APP_ID,
    privateKey: alipayPrivateKey,
    alipayPublicKey,
    gateway: paymentConfig.gateway,
    timeout: 10000,
    signType: 'RSA2'
  });
} else {
  console.warn('⚠️ 支付宝功能未启用；设置 ALIPAY_ENABLED=true 并提供完整配置后启用');
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
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

// 单进程登录尝试限制；多实例部署还需共享限流存储或网关规则。
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
function loginAttemptKey(req, username) {
  return `${req.ip || req.connection.remoteAddress}|${username.toLowerCase()}`;
}
function checkLoginAttempts(key) {
  const attempt = loginAttempts.get(key);
  if (!attempt) return false;
  if (Date.now() - attempt.startedAt >= LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return attempt.failures >= LOGIN_MAX_FAILURES;
}
function recordLoginFailure(key) {
  if (loginAttempts.size >= 10000 && !loginAttempts.has(key)) {
    loginAttempts.delete(loginAttempts.keys().next().value);
  }
  const attempt = loginAttempts.get(key) || { startedAt: Date.now(), failures: 0 };
  attempt.failures += 1;
  loginAttempts.set(key, attempt);
}

// ---------- 站内信辅助函数 ----------
async function sendMessage(userId, title, content) {
  try {
    await pool.execute('INSERT INTO user_messages (user_id, title, content) VALUES (?, ?, ?)', [userId, title, content]);
  } catch (err) {
    console.error('发送站内信失败:', err);
  }
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
        token_version INT UNSIGNED NOT NULL DEFAULT 0,
        email VARCHAR(100),
        phone VARCHAR(20),
        balance DECIMAL(10,2) DEFAULT 0.00,
        reputation INT DEFAULT 100,
        referrer_id INT,
        referral_code VARCHAR(10) UNIQUE,
        auth_provider VARCHAR(20) DEFAULT 'local',
        role VARCHAR(10) DEFAULT 'user',
        game_uid VARCHAR(50),
        game_account TEXT,
        game_password TEXT,
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

    // 用户设置表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id INT PRIMARY KEY,
        theme ENUM('dark','light') DEFAULT 'dark',
        language ENUM('zh','en') DEFAULT 'zh',
        notify_order_update TINYINT(1) DEFAULT 1,
        notify_promotion TINYINT(1) DEFAULT 1,
        privacy_show_phone_to_booster TINYINT(1) DEFAULT 0,
        privacy_show_email_to_booster TINYINT(1) DEFAULT 0,
        default_client_type ENUM('Android','iOS') DEFAULT 'Android',
        default_urgent TINYINT(1) DEFAULT 0,
        default_remark_template VARCHAR(255) DEFAULT '',
        two_factor_enabled TINYINT(1) DEFAULT 0,
        two_factor_secret TEXT,
        two_factor_last_step BIGINT NOT NULL DEFAULT -1,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_two_factor_recovery_codes (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        code_hash CHAR(64) NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        used_at TIMESTAMP NULL DEFAULT NULL,
        UNIQUE KEY uq_two_factor_code_hash (user_id, code_hash),
        KEY idx_two_factor_active (user_id, active),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 站内邮箱消息表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        is_read TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 登录设备记录表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS login_devices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        device_info TEXT,
        ip_address VARCHAR(100),
        login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
        game_account TEXT,
        game_password TEXT,
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

    // ========== 开箱模拟器系统 ==========
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chest_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        image VARCHAR(255),
        price INT NOT NULL DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chest_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chest_id INT NOT NULL,
        rarity ENUM('normal','rare') DEFAULT 'normal',
        item_name VARCHAR(100) NOT NULL,
        weight INT NOT NULL,
        FOREIGN KEY (chest_id) REFERENCES chest_configs(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        item_name VARCHAR(100) NOT NULL,
        chest_id INT NOT NULL,
        rarity ENUM('normal','rare') DEFAULT 'normal',
        quantity INT DEFAULT 1,
        obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_inventory (user_id, item_name, chest_id, rarity),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (chest_id) REFERENCES chest_configs(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_chest_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        chest_id INT NOT NULL,
        item_name VARCHAR(100) NOT NULL,
        rarity ENUM('normal','rare') DEFAULT 'normal',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (chest_id) REFERENCES chest_configs(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 普通奖励配置表（新增）
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chest_common_rewards (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chest_id INT NOT NULL,
        item_name VARCHAR(100) NOT NULL,
        min_quantity INT NOT NULL DEFAULT 1,
        max_quantity INT NOT NULL DEFAULT 1,
        drop_chance DECIMAL(5,2) NOT NULL DEFAULT 100.00 COMMENT '掉落概率百分比',
        FOREIGN KEY (chest_id) REFERENCES chest_configs(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 支付订单表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS payment_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        out_trade_no VARCHAR(64) NOT NULL UNIQUE,
        alipay_trade_no VARCHAR(64) NULL UNIQUE,
        user_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        status ENUM('pending','paid','closed') DEFAULT 'pending',
        paid_at DATETIME NULL,
        closed_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_payment_orders_status_created_at (status, created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);



    // 用户表增加军需券和签到日期字段
    try { await pool.execute(`ALTER TABLE users ADD COLUMN chest_tickets INT DEFAULT 0`); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await pool.execute(`ALTER TABLE users ADD COLUMN last_chest_checkin_date DATE DEFAULT NULL`); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

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

    // 动态内容系统
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS announcements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS game_news (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 租号系统
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS rental_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        game_uid VARCHAR(50),
        client_type VARCHAR(10) NOT NULL DEFAULT 'Android',
        tank_list TEXT,
        hourly_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        daily_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        available_time_desc VARCHAR(255) DEFAULT '',
        screenshots JSON,
        rules TEXT,
        status ENUM('pending','active','suspended') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS rental_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_no VARCHAR(30) NOT NULL UNIQUE,
        renter_id INT NOT NULL,
        owner_id INT NOT NULL,
        account_id INT NOT NULL,
        rental_type ENUM('hour','day') NOT NULL DEFAULT 'hour',
        quantity INT NOT NULL DEFAULT 1,
        total_price DECIMAL(10,2) NOT NULL,
        credits_used INT DEFAULT 0,
        status ENUM('pending','active','completed','cancelled') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (renter_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES rental_accounts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 三方订单系统
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS third_party_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_no VARCHAR(30) NOT NULL UNIQUE,
        creator_id INT NOT NULL,
        platform VARCHAR(50) DEFAULT '其他',
        content TEXT NOT NULL COMMENT '代练内容',
        account_info VARCHAR(200) NOT NULL COMMENT '账号信息(手机/邮箱)',
        price DECIMAL(10,2) NOT NULL,
        status ENUM('pending','approved','rejected') DEFAULT 'pending',
        complete_requested TINYINT(1) DEFAULT 0 COMMENT '打手是否申请完单',
        payment_status ENUM('unpaid','paid') DEFAULT 'unpaid' COMMENT '支付状态',
        reviewer_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 兼容旧字段 / 确保字段存在
    try { await pool.execute(`ALTER TABLE users ADD COLUMN qy_credits INT DEFAULT 0`); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await pool.execute(`ALTER TABLE users ADD COLUMN total_earned_credits INT DEFAULT 0`); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await pool.execute(`ALTER TABLE users ADD COLUMN vip_level TINYINT DEFAULT 0`); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await pool.execute(`ALTER TABLE orders ADD COLUMN required_identity ENUM('gold','silver','standard','budget') DEFAULT 'standard'`); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await pool.execute(`ALTER TABLE orders ADD COLUMN client_type VARCHAR(10) DEFAULT 'Android'`); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await pool.execute(`ALTER TABLE custom_requests ADD COLUMN status VARCHAR(20) DEFAULT 'pending'`); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await pool.execute(`ALTER TABLE users ADD COLUMN rental_earnings DECIMAL(10,2) DEFAULT 0.00`); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await pool.execute(`ALTER TABLE third_party_orders ADD COLUMN complete_requested TINYINT(1) DEFAULT 0`); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await pool.execute(`ALTER TABLE third_party_orders ADD COLUMN payment_status ENUM('unpaid','paid') DEFAULT 'unpaid'`); } catch(e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

    // 如果箱子表为空，插入默认箱子数据
    const [chestCount] = await pool.execute('SELECT COUNT(*) AS cnt FROM chest_configs');
    if (chestCount[0].cnt === 0) {
      const chests = [
        { name: '美国集装箱箱', price: 198, image: 'images/chests/chest_1.png', desc: '经典战斗资源补给，开出强力道具。' },
        { name: '苏联集装箱', price: 198, image: 'images/chests/chest_2.png', desc: '火焰主题，内含稀有坦克碎片。' },
        { name: '顶尖捕食者集装箱', price: 498, image: 'images/chests/chest_3.png', desc: '夜战专属，高概率出全局经验。' },
        { name: '超赞集装箱', price: 288, image: 'images/chests/chest_4.png', desc: '雷电系列，有机会获得高级坦克。' },
        { name: '我全都要集装箱', price: 98, image: 'images/chests/chest_5.png', desc: '冰雪奇缘，内含稀有银币加成。' },
        { name: '超大集装箱', price: 198, image: 'images/chests/chest_6.png', desc: '经典怀旧，出金币概率较高。' },
        { name: '重坦集装箱', price: 88, image: 'images/chests/chest_7.png', desc: '未来科技，有极小概率出绝版坦克。' },
        { name: '泰坦集装箱箱', price: 388, image: 'images/chests/chest_8.png', desc: '专为狂战士打造，必出好东西。' },
        { name: '赛季集装箱', price: 588, image: 'images/chests/chest_9.png', desc: '传奇级别，概率获得稀有指挥官坦克。' }
      ];

      for (let i = 0; i < chests.length; i++) {
        const [result] = await pool.execute(
          'INSERT INTO chest_configs (name, image, price, description) VALUES (?,?,?,?)',
          [chests[i].name, chests[i].image, chests[i].price, chests[i].desc]
        );
        const chestId = result.insertId;

        // 每个箱子独立奖池（这里初始化普通和稀有，但开箱普通奖励已改用 chest_common_rewards，这里保留普通物品不影响）
        const normalItems = [
          `银币 x50000`, `银币强化剂 x10`, `战斗经验强化剂 x10`, `全局经验强化剂 x10`, `金币 x500`
        ];
        const rareItems = [
          '概念型1B', '116F3', 'BZT70', '五式重战车', 'F1.0WT'
        ];
        for (const item of normalItems) {
          await pool.execute(
            'INSERT INTO chest_items (chest_id, rarity, item_name, weight) VALUES (?,?,?,?)',
            [chestId, 'normal', item, 20 + i * 5]
          );
        }
        for (const item of rareItems) {
          await pool.execute(
            'INSERT INTO chest_items (chest_id, rarity, item_name, weight) VALUES (?,?,?,?)',
            [chestId, 'rare', item, 10 + i * 3]
          );
        }
      }
      console.log('✅ 箱子数据已初始化');
    }

    // 如果普通奖励配置表为空，为每个箱子插入默认普通奖励
    const [commonCount] = await pool.execute('SELECT COUNT(*) AS cnt FROM chest_common_rewards');
    if (commonCount[0].cnt === 0) {
      const [chests] = await pool.execute('SELECT id FROM chest_configs');
      for (const chest of chests) {
        // 常规全局经验嘉奖令
        await pool.execute(
          'INSERT INTO chest_common_rewards (chest_id, item_name, min_quantity, max_quantity, drop_chance) VALUES (?,?,?,?,?)',
          [chest.id, '常规全局经验嘉奖令', 10, 25, 100]
        );
        // 银币
        await pool.execute(
          'INSERT INTO chest_common_rewards (chest_id, item_name, min_quantity, max_quantity, drop_chance) VALUES (?,?,?,?,?)',
          [chest.id, '银币', 250000, 500000, 100]
        );
        // 银币强化剂
        await pool.execute(
          'INSERT INTO chest_common_rewards (chest_id, item_name, min_quantity, max_quantity, drop_chance) VALUES (?,?,?,?,?)',
          [chest.id, '银币强化剂', 1, 5, 50]
        );
        // 战斗经验强化剂
        await pool.execute(
          'INSERT INTO chest_common_rewards (chest_id, item_name, min_quantity, max_quantity, drop_chance) VALUES (?,?,?,?,?)',
          [chest.id, '战斗经验强化剂', 1, 5, 50]
        );
        // 全局经验强化剂
        await pool.execute(
          'INSERT INTO chest_common_rewards (chest_id, item_name, min_quantity, max_quantity, drop_chance) VALUES (?,?,?,?,?)',
          [chest.id, '全局经验强化剂', 1, 5, 50]
        );
      }
      console.log('✅ 默认普通奖励配置已初始化');
    }

    console.log('✅ 数据库表已就绪');
  } catch (err) {
    console.error('❌ 建表失败:', err.message);
    throw err;
  }
}

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

    await connection.execute('INSERT INTO user_settings (user_id) VALUES (?)', [result.insertId]);

    if (referrer_id) {
      await connection.execute(
        'UPDATE users SET total_earned_credits = total_earned_credits + 300 WHERE id = ?',
        [referrer_id]
      );
      await connection.execute(
        'UPDATE users SET total_earned_credits = total_earned_credits + 300 WHERE id = ?',
        [result.insertId]
      );
      await postAccountDelta(connection, {
        userId: referrer_id, accountType: 'qy_credits', delta: 300,
        entryKey: `registration:${result.insertId}:referrer_bonus`,
        sourceType: 'registration', sourceRef: String(result.insertId)
      });
      await postAccountDelta(connection, {
        userId: result.insertId, accountType: 'qy_credits', delta: 300,
        entryKey: `registration:${result.insertId}:new_user_bonus`,
        sourceType: 'registration', sourceRef: String(result.insertId)
      });
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
  const { username, password, twoFactorCode, recoveryCode } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const attemptKey = loginAttemptKey(req, username);
  if (checkLoginAttempts(attemptKey)) return res.status(429).json({ error: '尝试次数过多，请稍后再试' });
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT id, username, password_hash, token_version, email, phone, balance,
              reputation, referral_code, role, created_at, booster_identity,
              booster_points, qy_credits, vip_level
       FROM users WHERE username = ?`,
      [username]
    );
    if (rows.length === 0) {
      recordLoginFailure(attemptKey);
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      recordLoginFailure(attemptKey);
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const [factorRows] = await connection.execute(
      'SELECT two_factor_enabled, two_factor_secret, two_factor_last_step FROM user_settings WHERE user_id = ?',
      [user.id]
    );
    const factor = factorRows[0];
    let nextTokenVersion = user.token_version;
    if (factor?.two_factor_enabled) {
      if (!twoFactorCode && !recoveryCode) {
        return res.status(401).json({ error: '请输入二次认证验证码或一次性恢复码', requiresTwoFactor: true });
      }
      if (!twoFactorCode && recoveryCode) {
        const codeHash = hashRecoveryCode(recoveryCode);
        if (!codeHash) {
          recordLoginFailure(attemptKey);
          return res.status(401).json({ error: '恢复码无效', requiresTwoFactor: true });
        }
        await connection.beginTransaction();
        const [consumed] = await connection.execute(
          `UPDATE user_two_factor_recovery_codes SET active = 0, used_at = CURRENT_TIMESTAMP
           WHERE user_id = ? AND code_hash = ? AND active = 1`,
          [user.id, codeHash]
        );
        if (consumed.affectedRows !== 1) {
          await connection.rollback();
          recordLoginFailure(attemptKey);
          return res.status(401).json({ error: '恢复码无效或已使用', requiresTwoFactor: true });
        }
        const [revoked] = await connection.execute(
          'UPDATE users SET token_version = token_version + 1 WHERE id = ? AND token_version = ?',
          [user.id, user.token_version]
        );
        if (revoked.affectedRows !== 1) {
          await connection.rollback();
          return res.status(409).json({ error: '账号登录状态已变化，请重新尝试' });
        }
        await connection.commit();
        nextTokenVersion += 1;
      } else {
        let verifiedStep;
        try {
          const secret = sensitiveFieldCipher.decrypt(factor.two_factor_secret, TWO_FACTOR_SECRET_CONTEXT);
          verifiedStep = verifyTotpCode(secret, twoFactorCode, Number(factor.two_factor_last_step));
        } catch {
          return res.status(503).json({ error: '二次认证配置无法验证，请联系管理员' });
        }
        if (verifiedStep === null) {
          recordLoginFailure(attemptKey);
          return res.status(401).json({ error: '二次认证验证码无效', requiresTwoFactor: true });
        }
        const [used] = await connection.execute(
          `UPDATE user_settings SET two_factor_last_step = ?
           WHERE user_id = ? AND two_factor_enabled = 1 AND two_factor_last_step < ?`,
          [verifiedStep, user.id, verifiedStep]
        );
        if (used.affectedRows !== 1) {
          recordLoginFailure(attemptKey);
          return res.status(401).json({ error: '验证码已使用，请等待下一组验证码', requiresTwoFactor: true });
        }
      }
    }
    loginAttempts.delete(attemptKey);
    const token = issueSessionToken(user.id, nextTokenVersion, JWT_SECRET);

    try {
      const ua = (req.headers['user-agent'] || '').substring(0, 65535);
      const ip = (req.ip || req.connection.remoteAddress || '').substring(0, 100);
      await connection.execute(
        'INSERT INTO login_devices (user_id, device_info, ip_address) VALUES (?, ?, ?)',
        [user.id, ua, ip]
      );
    } catch (e) { console.error('记录登录设备失败:', e.message); }

    try {
      await connection.execute('INSERT IGNORE INTO user_settings (user_id) VALUES (?)', [user.id]);
    } catch (e) { console.error('创建设置失败:', e.message); }

    res.json({ success: true, token, user: {
      id: user.id, username: user.username, email: user.email, phone: user.phone,
      balance: user.balance, reputation: user.reputation, referral_code: user.referral_code,
      role: user.role, created_at: user.created_at, booster_identity: user.booster_identity,
      booster_points: user.booster_points, qy_credits: user.qy_credits, vip_level: user.vip_level
    }});
  } catch(err) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('登录错误:', err);
    res.status(500).json({ error: '服务器内部错误' });
  } finally {
    if (connection) connection.release();
  }
});

// ---------- JWT 中间件 ----------
const authMiddleware = createAuthMiddleware(pool, JWT_SECRET);
function adminMiddleware(req, res, next) {
  authMiddleware(req, res, async () => {
    try {
      const [rows] = await pool.execute('SELECT role FROM users WHERE id = ?', [req.userId]);
      if (rows.length === 0 || rows[0].role !== 'admin') return res.status(403).json({ error: '无管理员权限' });
      next();
    } catch {
      res.status(503).json({ error: '暂时无法验证管理员权限' });
    }
  });
}
function boosterMiddleware(req, res, next) {
  authMiddleware(req, res, async () => {
    try {
      const [rows] = await pool.execute('SELECT role FROM users WHERE id = ?', [req.userId]);
      if (rows.length === 0 || (rows[0].role !== 'booster' && rows[0].role !== 'admin')) return res.status(403).json({ error: '需要打手或管理员权限' });
      next();
    } catch {
      res.status(503).json({ error: '暂时无法验证打手权限' });
    }
  });
}

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  try {
    const [result] = await pool.execute(
      'UPDATE users SET token_version = token_version + 1 WHERE id = ? AND token_version = ?',
      [req.userId, req.tokenVersion]
    );
    if (result.affectedRows !== 1) {
      return res.status(409).json({ error: '登录状态已失效' });
    }
    res.json({ success: true, message: '已退出所有设备' });
  } catch {
    res.status(503).json({ error: '暂时无法退出登录' });
  }
});

app.post('/api/auth/two-factor/setup', authMiddleware, async (req, res) => {
  const { password } = req.body;
  if (typeof password !== 'string' || !password) return res.status(400).json({ error: '请输入当前密码' });
  try {
    const [users] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [req.userId]);
    if (users.length !== 1 || !await bcrypt.compare(password, users[0].password_hash)) {
      return res.status(401).json({ error: '当前密码不正确' });
    }
    const [settings] = await pool.execute('SELECT two_factor_enabled FROM user_settings WHERE user_id = ?', [req.userId]);
    if (settings[0]?.two_factor_enabled) return res.status(409).json({ error: '二次认证已经启用' });
    const secret = generateTotpSecret();
    const setupToken = jwt.sign(
      { purpose: 'totp-setup', userId: req.userId, tokenVersion: req.tokenVersion, secret },
      JWT_SECRET, { expiresIn: '10m' }
    );
    res.set('Cache-Control', 'no-store').json({ secret, setupToken });
  } catch {
    res.status(503).json({ error: '暂时无法创建二次认证' });
  }
});

app.post('/api/auth/two-factor/confirm', authMiddleware, async (req, res) => {
  const { setupToken, code } = req.body;
  let setup;
  try {
    setup = jwt.verify(setupToken, JWT_SECRET);
  } catch {
    return res.status(400).json({ error: '绑定请求已失效，请重新开始' });
  }
  if (setup.purpose !== 'totp-setup' || setup.userId !== req.userId ||
      setup.tokenVersion !== req.tokenVersion || typeof setup.secret !== 'string') {
    return res.status(400).json({ error: '绑定请求无效' });
  }
  const step = verifyTotpCode(setup.secret, code);
  if (step === null) return res.status(400).json({ error: '验证码无效' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const encryptedSecret = sensitiveFieldCipher.encrypt(setup.secret, TWO_FACTOR_SECRET_CONTEXT);
    const [result] = await connection.execute(
      `UPDATE user_settings SET two_factor_enabled = 1, two_factor_secret = ?, two_factor_last_step = ?
       WHERE user_id = ? AND two_factor_enabled = 0`,
      [encryptedSecret, step, req.userId]
    );
    if (result.affectedRows !== 1) {
      await connection.rollback();
      return res.status(409).json({ error: '二次认证状态已变化' });
    }
    const recoveryCodes = createRecoveryCodes();
    for (const recoveryCode of recoveryCodes) {
      await connection.execute(
        'INSERT INTO user_two_factor_recovery_codes (user_id, code_hash) VALUES (?, ?)',
        [req.userId, hashRecoveryCode(recoveryCode)]
      );
    }
    const [revoked] = await connection.execute(
      'UPDATE users SET token_version = token_version + 1 WHERE id = ? AND token_version = ?',
      [req.userId, req.tokenVersion]
    );
    if (revoked.affectedRows !== 1) {
      await connection.rollback();
      return res.status(409).json({ error: '登录状态已变化，请重新登录' });
    }
    await connection.commit();
    res.set('Cache-Control', 'no-store').json({
      success: true, message: '二次认证已启用，其他设备已退出', recoveryCodes,
      token: issueSessionToken(req.userId, req.tokenVersion + 1, JWT_SECRET)
    });
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    res.status(503).json({ error: '暂时无法启用二次认证' });
  } finally {
    if (connection) connection.release();
  }
});

app.post('/api/auth/two-factor/disable', authMiddleware, async (req, res) => {
  const { password, code, recoveryCode } = req.body;
  if (typeof password !== 'string' || !password) return res.status(400).json({ error: '请输入当前密码' });
  let connection;
  try {
    const [users] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [req.userId]);
    if (users.length !== 1 || !await bcrypt.compare(password, users[0].password_hash)) {
      return res.status(401).json({ error: '当前密码不正确' });
    }
    const [settings] = await pool.execute(
      'SELECT two_factor_enabled, two_factor_secret, two_factor_last_step FROM user_settings WHERE user_id = ?',
      [req.userId]
    );
    if (!settings[0]?.two_factor_enabled) return res.status(409).json({ error: '二次认证未启用' });
    let step = null;
    let recoveryHash = null;
    if (code) {
      const secret = sensitiveFieldCipher.decrypt(settings[0].two_factor_secret, TWO_FACTOR_SECRET_CONTEXT);
      step = verifyTotpCode(secret, code, Number(settings[0].two_factor_last_step));
      if (step === null) return res.status(401).json({ error: '二次认证验证码无效' });
    } else {
      recoveryHash = hashRecoveryCode(recoveryCode);
      if (!recoveryHash) return res.status(401).json({ error: '请输入有效的验证码或一次性恢复码' });
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    if (recoveryHash) {
      const [consumed] = await connection.execute(
        `UPDATE user_two_factor_recovery_codes SET active = 0, used_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND code_hash = ? AND active = 1`,
        [req.userId, recoveryHash]
      );
      if (consumed.affectedRows !== 1) {
        await connection.rollback();
        return res.status(401).json({ error: '恢复码无效或已使用' });
      }
    }
    const [result] = await connection.execute(
      `UPDATE user_settings SET two_factor_enabled = 0, two_factor_secret = NULL, two_factor_last_step = -1
       WHERE user_id = ? AND two_factor_enabled = 1${step === null ? '' : ' AND two_factor_last_step < ?'}`,
      step === null ? [req.userId] : [req.userId, step]
    );
    if (result.affectedRows !== 1) {
      await connection.rollback();
      return res.status(409).json({ error: '验证码已使用或状态已变化' });
    }
    await connection.execute(
      'UPDATE user_two_factor_recovery_codes SET active = 0 WHERE user_id = ? AND active = 1',
      [req.userId]
    );
    const [revoked] = await connection.execute(
      'UPDATE users SET token_version = token_version + 1 WHERE id = ? AND token_version = ?',
      [req.userId, req.tokenVersion]
    );
    if (revoked.affectedRows !== 1) {
      await connection.rollback();
      return res.status(409).json({ error: '登录状态已变化，请重新登录' });
    }
    await connection.commit();
    res.json({ success: true, message: '二次认证已关闭，其他设备已退出',
      token: issueSessionToken(req.userId, req.tokenVersion + 1, JWT_SECRET) });
  } catch {
    if (connection) await connection.rollback().catch(() => {});
    res.status(503).json({ error: '暂时无法关闭二次认证' });
  } finally {
    if (connection) connection.release();
  }
});

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

// ---------- 订单创建 ----------
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
      const [creditsRow] = await conn.execute('SELECT qy_credits FROM users WHERE id = ? FOR UPDATE', [req.userId]);
      const available = creditsRow[0]?.qy_credits || 0;
      creditsUsed = Math.min(use_credits, available);
      const maxDiscountByCredits = creditsUsed / 100;
      const actualDiscount = Math.min(maxDiscountByCredits, total_price);
      creditsUsed = Math.floor(actualDiscount * 100);
      if (creditsUsed > 0) {
        await postAccountDelta(conn, {
          userId: req.userId, accountType: 'qy_credits', delta: -creditsUsed,
          entryKey: `order:${order_no}:credits_debit`, sourceType: 'order',
          sourceRef: order_no, actorUserId: req.userId
        });
      }
      finalTotal = total_price - actualDiscount;
    }

    const protectedGameAccount = sensitiveFieldCipher.encrypt(
      game_account,
      ORDER_GAME_ACCOUNT_CONTEXT
    );
    const protectedGamePassword = sensitiveFieldCipher.encrypt(
      game_password,
      ORDER_GAME_PASSWORD_CONTEXT
    );

    const [result] = await conn.execute(
      `INSERT INTO orders (order_no, user_id, project, detail, quantity, player_name, price, urgent, total_price, remark, game_uid, game_account, game_password, client_type, required_identity, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [order_no, req.userId, project, detail, quantity, player_name, price, urgent?1:0, finalTotal,
       remark||null, game_uid||null, protectedGameAccount, protectedGamePassword,
       client_type||'Android', player_type||'standard']
    );
    await recordOperation(conn, {
      eventKey: `order:${order_no}:created`, actorUserId: req.userId,
      action: 'order_created', targetType: 'order', targetRef: order_no
    });

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

// ---------- 用户设置 API ----------
app.get('/api/user/settings', authMiddleware, async (req, res) => {
  try {
    const settingsSql = `SELECT user_id, theme, language, notify_order_update,
      notify_promotion, privacy_show_phone_to_booster, privacy_show_email_to_booster,
      default_client_type, default_urgent, default_remark_template, two_factor_enabled
      FROM user_settings WHERE user_id = ?`;
    const [rows] = await pool.execute(settingsSql, [req.userId]);
    if (!rows.length) {
      await pool.execute('INSERT INTO user_settings (user_id) VALUES (?)', [req.userId]);
      const [newRows] = await pool.execute(settingsSql, [req.userId]);
      return res.json(newRows[0]);
    }
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.put('/api/user/settings', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const { theme, language, notify_order_update, notify_promotion, privacy_show_phone_to_booster,
          privacy_show_email_to_booster, default_client_type, default_urgent, default_remark_template,
          two_factor_enabled } = req.body;

  if (two_factor_enabled !== undefined) {
    return res.status(400).json({ error: '二次认证尚未实现，不能在设置中启用' });
  }

  try {
    const fields = [];
    const values = [];
    if (theme !== undefined) { fields.push('theme = ?'); values.push(theme); }
    if (language !== undefined) { fields.push('language = ?'); values.push(language); }
    if (notify_order_update !== undefined) { fields.push('notify_order_update = ?'); values.push(notify_order_update); }
    if (notify_promotion !== undefined) { fields.push('notify_promotion = ?'); values.push(notify_promotion); }
    if (privacy_show_phone_to_booster !== undefined) { fields.push('privacy_show_phone_to_booster = ?'); values.push(privacy_show_phone_to_booster); }
    if (privacy_show_email_to_booster !== undefined) { fields.push('privacy_show_email_to_booster = ?'); values.push(privacy_show_email_to_booster); }
    if (default_client_type !== undefined) { fields.push('default_client_type = ?'); values.push(default_client_type); }
    if (default_urgent !== undefined) { fields.push('default_urgent = ?'); values.push(default_urgent); }
    if (default_remark_template !== undefined) { fields.push('default_remark_template = ?'); values.push(default_remark_template); }

    if (fields.length === 0) return res.json({ success: true, message: '无更新字段' });

    values.push(userId);
    await pool.execute(`UPDATE user_settings SET ${fields.join(', ')} WHERE user_id = ?`, values);
    res.json({ success: true, message: '设置已更新' });
  } catch (err) {
    console.error('更新设置错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.put('/api/user/change-username', authMiddleware, async (req, res) => {
  const { newUsername } = req.body;
  if (!newUsername || newUsername.length < 4) return res.status(400).json({ error: '用户名至少4个字符' });
  try {
    const [existing] = await pool.execute('SELECT id FROM users WHERE username = ?', [newUsername]);
    if (existing.length) return res.status(400).json({ error: '用户名已被使用' });
    await pool.execute('UPDATE users SET username = ? WHERE id = ?', [newUsername, req.userId]);
    res.json({ success: true, message: '用户名已更新' });
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.put('/api/user/change-password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请提供原密码和新密码' });
  if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少6位' });
  try {
    const [rows] = await pool.execute(
      'SELECT password_hash, token_version FROM users WHERE id = ?',
      [req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: '用户不存在' });
    const valid = await bcrypt.compare(oldPassword, rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: '原密码不正确' });
    const password_hash = await bcrypt.hash(newPassword, 12);
    const [result] = await pool.execute(
      `UPDATE users SET password_hash = ?, token_version = token_version + 1
       WHERE id = ? AND password_hash = ? AND token_version = ?`,
      [password_hash, req.userId, rows[0].password_hash, req.tokenVersion]
    );
    if (result.affectedRows !== 1) {
      return res.status(409).json({ error: '密码或登录状态已变化，请重新登录后再试' });
    }
    const token = issueSessionToken(req.userId, req.tokenVersion + 1, JWT_SECRET);
    res.json({ success: true, message: '密码已更新，其他设备已退出', token });
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.put('/api/user/change-phone', authMiddleware, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: '手机号不能为空' });
  try {
    await pool.execute('UPDATE users SET phone = ? WHERE id = ?', [phone, req.userId]);
    res.json({ success: true, message: '手机号已更新' });
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.put('/api/user/change-email', authMiddleware, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: '邮箱不能为空' });
  try {
    await pool.execute('UPDATE users SET email = ? WHERE id = ?', [email, req.userId]);
    res.json({ success: true, message: '邮箱已更新' });
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

// 站内邮箱
app.get('/api/user/messages', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, title, content, is_read, created_at FROM user_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.userId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.put('/api/user/messages/:id/read', authMiddleware, async (req, res) => {
  const messageId = req.params.id;
  try {
    await pool.execute('UPDATE user_messages SET is_read = 1 WHERE id = ? AND user_id = ?', [messageId, req.userId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.put('/api/user/messages/read-all', authMiddleware, async (req, res) => {
  try {
    await pool.execute('UPDATE user_messages SET is_read = 1 WHERE user_id = ? AND is_read = 0', [req.userId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.get('/api/user/devices', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT device_info, ip_address, login_time FROM login_devices WHERE user_id = ? ORDER BY login_time DESC LIMIT 10',
      [req.userId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

// ---------- 支付上传 ----------
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.post('/api/orders/:orderNo/payment', authMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const { screenshot } = req.body;
  if (!screenshot) return res.status(400).json({ error: '请提供支付截图' });
  try {
    const [matchingOrders] = await pool.execute(
      'SELECT id, payment_status FROM orders WHERE order_no = ? AND user_id = ?',
      [orderNo, req.userId]
    );
    if (!matchingOrders.length) return res.status(404).json({ error: '订单不存在' });
    if (matchingOrders[0].payment_status === 'paid') {
      return res.status(409).json({ error: '订单已经确认付款' });
    }
  } catch {
    return res.status(503).json({ error: '暂时无法验证订单' });
  }
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
  const filename = `payment_${orderNo}_${Date.now()}_${crypto.randomUUID()}.png`;
  const newFilePath = path.join(uploadDir, filename);
  let newFileWritten = false;
  let committed = false;
  let conn;
  try {
    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync(newFilePath, base64Data, { encoding: 'base64', flag: 'wx' });
    newFileWritten = true;
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      'SELECT id, total_price, payment_status FROM orders WHERE order_no = ? AND user_id = ? FOR UPDATE',
      [orderNo, req.userId]
    );
    if (!orders.length || orders[0].payment_status === 'paid') {
      await conn.rollback();
      fs.unlinkSync(newFilePath);
      newFileWritten = false;
      return res.status(409).json({ error: '订单付款状态已变化' });
    }
    await conn.execute(
      'UPDATE orders SET payment_screenshot = ?, payment_status = ? WHERE id = ?',
      [filename, 'pending', orders[0].id]
    );
    const [evidence] = await conn.execute(
      `INSERT INTO manual_payment_evidence
       (business_type, business_ref, uploader_user_id, filename, expected_amount)
       VALUES (?, ?, ?, ?, ?)`,
      ['order', orderNo, req.userId, filename, orders[0].total_price]
    );
    await recordOperation(conn, {
      eventKey: `order:${orderNo}:evidence:${evidence.insertId}`,
      actorUserId: req.userId, action: 'manual_payment_submitted',
      targetType: 'order', targetRef: orderNo
    });
    await conn.commit();
    committed = true;
    res.json({ success: true, message: '支付凭证已上传' });
  } catch(err) {
    if (conn) await conn.rollback();
    if (newFileWritten && !committed) {
      try { fs.unlinkSync(newFilePath); } catch { /* exact new uncommitted upload only */ }
    }
    res.status(500).json({ error: '服务器错误' });
  } finally { if (conn) conn.release(); }
});

// ---------- 管理端订单 ----------
app.get('/api/admin/orders', adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT o.*, u.username AS customer_name,
             b.username AS booster_name
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN users b ON o.booster_id = b.id
      ORDER BY o.created_at DESC
    `);
    res.json(rows.map((order) => revealOrderCredentials(order)));
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});

app.put('/api/admin/orders/:orderNo', adminMiddleware, async (req, res) => {
  res.status(409).json({ error: '请使用确认收款、放入大厅和打手完单流程，不能直接覆盖订单状态' });
});

app.delete('/api/admin/orders/:orderNo', adminMiddleware, async (req, res) => {
  res.status(409).json({ error: '订单记录需要保留，请在订单中心归档已完成订单' });
});

app.put('/api/admin/orders/:orderNo/confirm-payment', adminMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 500) return res.status(400).json({ error: '请填写实际收款核对说明（最多500字）' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      'SELECT id, user_id, payment_status, status, booster_id FROM orders WHERE order_no = ? FOR UPDATE', [orderNo]
    );
    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ error: '订单不存在' });
    }
    if (orders[0].payment_status === 'paid') {
      await conn.rollback();
      return res.status(409).json({ error: '订单已确认付款' });
    }
    if (orders[0].status !== 'pending' || orders[0].booster_id) {
      await conn.rollback();return res.status(409).json({error:'订单执行状态与收款状态不一致，请先核对历史记录'});
    }
    await conn.execute(
      'UPDATE orders SET payment_status = ?, status = ? WHERE id = ?',
      ['paid', 'pending', orders[0].id]
    );
    const [evidence] = await conn.execute(
      `SELECT id FROM manual_payment_evidence
       WHERE business_type = ? AND business_ref = ? AND status = ?
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      ['order', orderNo, 'submitted']
    );
    if (evidence.length) {
      await conn.execute(
        `UPDATE manual_payment_evidence
         SET status = ?, reviewer_user_id = ?, reviewed_at = NOW() WHERE id = ?`,
        ['accepted', req.userId, evidence[0].id]
      );
    }
    await recordOperation(conn, {
      eventKey: `order:${orderNo}:payment_confirmed`, actorUserId: req.userId,
      action: evidence.length ? 'manual_payment_confirmed' : 'manual_payment_confirmed_without_evidence',
      targetType: 'order', targetRef: orderNo
    });
    await conn.execute('INSERT INTO order_management_events (order_type,order_ref,actor_user_id,action,note) VALUES (?,?,?,?,?)',
      ['boost',orderNo,req.userId,'payment_confirmed',reason]);
    await conn.commit();
    await sendMessage(orders[0].user_id, '支付已确认', `您的订单 ${orderNo} 已确认收款，代练即将开始。`);
    res.json({ success: true, message: '已确认支付' });
  } catch(err) {
    await conn.rollback();
    res.status(500).json({ error: '服务器错误' });
  } finally { conn.release(); }
});

app.put('/api/admin/orders/:orderNo/hall', adminMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT id,status,payment_status,booster_id,hall_status FROM orders WHERE order_no=? FOR UPDATE',[req.params.orderNo]);
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error:'订单不存在' }); }
    const order = rows[0];
    if (order.status !== 'pending' || order.payment_status !== 'paid' || order.booster_id || order.hall_status === 'open') {
      await conn.rollback(); return res.status(409).json({ error:'只有已收款且未分配的待接单订单可以放入大厅' });
    }
    await conn.execute('UPDATE orders SET hall_status=? WHERE id=?',['open',order.id]);
    await recordOperation(conn,{eventKey:`order:${req.params.orderNo}:hall_opened`,actorUserId:req.userId,
      action:'order_dispatched',targetType:'order',targetRef:req.params.orderNo});
    await conn.commit();
    res.json({ success: true, message: '已放入接单大厅' });
  } catch(err) { await conn.rollback(); res.status(500).json({ error: '服务器错误' }); }
  finally { conn.release(); }
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
    const includePassword = role === 'admin' || req.userId === order.user_id;
    res.json(revealOrderCredentials(order, { includePassword }));
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
      `SELECT order_no, project, detail, quantity, player_name, total_price, status, client_type, required_identity, created_at,
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
      `SELECT order_no, project, detail, quantity, player_name, total_price, status, client_type, required_identity, created_at,
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
    const [rows] = await conn.execute('SELECT * FROM orders WHERE order_no = ? AND booster_id = ? AND status = ? FOR UPDATE', [orderNo, boosterId, 'playing']);
    if (rows.length === 0) { await conn.rollback(); return res.status(400).json({ error: '订单无法完成' }); }
    const order = rows[0];
    if (order.payment_status !== 'paid') { await conn.rollback(); return res.status(400).json({ error: '该订单尚未确认支付，无法完成' }); }

    const earnings = Math.round(order.total_price * 0.75 * 100) / 100;
    const pointsEarned = Math.floor(earnings * 100);
    const [completed] = await conn.execute(
      'UPDATE orders SET status = ? WHERE order_no = ? AND status = ?',
      ['done', orderNo, 'playing']
    );
    if (completed.affectedRows !== 1) throw new Error('订单状态已变化');
    if (earnings > 0) {
      await postAccountDelta(conn, {
        userId: boosterId, accountType: 'earnings', delta: earnings,
        entryKey: `order:${orderNo}:booster_earnings`, sourceType: 'order',
        sourceRef: orderNo, actorUserId: boosterId
      });
    }
    if (pointsEarned > 0) {
      await postAccountDelta(conn, {
        userId: boosterId, accountType: 'booster_points', delta: pointsEarned,
        entryKey: `order:${orderNo}:booster_points`, sourceType: 'order',
        sourceRef: orderNo, actorUserId: boosterId
      });
    }
    await checkBoosterUpgrade(conn, boosterId);

    const creditsEarned = Math.floor(order.total_price * 0.03 * 100);
    if (creditsEarned > 0) {
      await postAccountDelta(conn, {
        userId: order.user_id, accountType: 'qy_credits', delta: creditsEarned,
        entryKey: `order:${orderNo}:customer_credits`, sourceType: 'order',
        sourceRef: orderNo, actorUserId: boosterId
      });
    }
    await conn.execute('UPDATE users SET total_earned_credits = total_earned_credits + ? WHERE id = ?',
      [creditsEarned, order.user_id]);

    const [userRow] = await conn.execute('SELECT total_earned_credits FROM users WHERE id = ?', [order.user_id]);
    const totalCredits = userRow[0].total_earned_credits;
    let newVip = 0;
    if (totalCredits >= 15000) newVip = 5;
    else if (totalCredits >= 6000) newVip = 4;
    else if (totalCredits >= 3000) newVip = 3;
    else if (totalCredits >= 1500) newVip = 2;
    else if (totalCredits >= 600) newVip = 1;
    await conn.execute('UPDATE users SET vip_level = ? WHERE id = ?', [newVip, order.user_id]);
    await recordOperation(conn, {
      eventKey: `order:${orderNo}:completed`, actorUserId: boosterId,
      action: 'order_completed', targetType: 'order', targetRef: orderNo
    });

    await sendMessage(order.user_id, '订单已完成', `您的订单 ${orderNo} 已代练完成，感谢您的信任！`);

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
app.put('/api/admin/custom-requests/:id/status', adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['pending', 'completed', 'cancelled'].includes(status)) return res.status(400).json({ error: '无效状态' });
  try {
    await pool.execute('UPDATE custom_requests SET status = ? WHERE id = ?', [status, id]);
    res.json({ success: true, message: '状态已更新' });
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});
app.delete('/api/admin/custom-requests/:id', adminMiddleware, async (req, res) => {
  try { await pool.execute('DELETE FROM custom_requests WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch(err) { res.status(500).json({ error: '服务器错误' }); }
});


// ---------- 打手管理 ----------
app.get('/api/admin/boosters', adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT u.id, u.username, u.booster_identity, u.booster_points,
             COUNT(CASE WHEN o.status = 'playing' AND o.booster_id = u.id THEN 1 END) AS active_orders
      FROM users u
      LEFT JOIN orders o ON o.booster_id = u.id
      WHERE u.role IN ('booster','admin')
      GROUP BY u.id
      ORDER BY u.booster_identity DESC
    `);
    res.json(rows);
  } catch(err) { res.status(500).json({ error: '服务器错误' }); }
});
app.put('/api/admin/boosters/:userId', adminMiddleware, async (req, res) => {
  const { booster_identity } = req.body;
  if (!['gold','silver','standard','budget'].includes(booster_identity)) return res.status(400).json({ error: '无效身份组' });
  try { await pool.execute('UPDATE users SET booster_identity = ? WHERE id = ?', [booster_identity, req.params.userId]); res.json({ success: true }); }
  catch(err) { res.status(500).json({ error: '服务器错误' }); }
});

// ---------- 积分商城 ----------
app.get('/api/admin/shop/items', adminMiddleware, async (req, res) => {
  try { const [rows] = await pool.execute('SELECT * FROM qy_shop_items ORDER BY id'); res.json(rows); }
  catch (err) { res.status(500).json({ error: '服务器错误' }); }
});
app.post('/api/admin/shop/items', adminMiddleware, async (req, res) => {
  const { id, name, description, image, price_credits, stock, is_active } = req.body;
  if (!name || price_credits == null) return res.status(400).json({ error: '名称和积分价格必填' });
  try {
    if (id) {
      await pool.execute('UPDATE qy_shop_items SET name=?, description=?, image=?, price_credits=?, stock=?, is_active=? WHERE id=?',
        [name, description, image, price_credits, stock ?? -1, is_active ?? 1, id]);
    } else {
      await pool.execute('INSERT INTO qy_shop_items (name, description, image, price_credits, stock, is_active) VALUES (?,?,?,?,?,?)',
        [name, description, image, price_credits, stock ?? -1, is_active ?? 1]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});
app.delete('/api/admin/shop/items/:id', adminMiddleware, async (req, res) => {
  try { await pool.execute('DELETE FROM qy_shop_items WHERE id=?', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: '服务器错误' }); }
});
app.get('/api/shop/items', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, name, description, image, price_credits, stock FROM qy_shop_items WHERE is_active=1 AND (stock > 0 OR stock = -1)');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});
app.post('/api/shop/buy/:itemId', authMiddleware, async (req, res) => {
  const itemId = req.params.itemId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [items] = await conn.execute('SELECT * FROM qy_shop_items WHERE id=? AND is_active=1 FOR UPDATE', [itemId]);
    if (items.length === 0) throw new Error('商品不存在或已下架');
    const item = items[0];
    if (item.stock === 0) throw new Error('商品库存不足');
    const [user] = await conn.execute('SELECT qy_credits FROM users WHERE id=? FOR UPDATE', [req.userId]);
    if (user[0].qy_credits < item.price_credits) throw new Error('积分不足');
    const [purchase] = await conn.execute('INSERT INTO qy_purchases (user_id, item_id, item_name, price_credits) VALUES (?,?,?,?)',
      [req.userId, item.id, item.name, item.price_credits]);
    await postAccountDelta(conn, {
      userId: req.userId, accountType: 'qy_credits', delta: -item.price_credits,
      entryKey: `shop:${purchase.insertId}:credits_debit`, sourceType: 'shop_purchase',
      sourceRef: String(purchase.insertId), actorUserId: req.userId
    });
    if (item.stock > 0) await conn.execute('UPDATE qy_shop_items SET stock = stock - 1 WHERE id=?', [itemId]);
    await recordOperation(conn, {
      eventKey: `shop:${purchase.insertId}:purchased`, actorUserId: req.userId,
      action: 'shop_purchased', targetType: 'shop_purchase',
      targetRef: String(purchase.insertId)
    });
    await conn.commit();
    res.json({ success: true, message: '购买成功' });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally { conn.release(); }
});

// ==================== 租号账号、审核与截图模块 ====================
app.use('/api', createRentalAccountRouter({
  pool, authMiddleware, adminMiddleware, recordOperation,
  saveRentalScreenshot, maxImageBytes: MAX_IMAGE_BYTES,
  uploadDir: path.join(__dirname, 'uploads'),
  randomUUID: crypto.randomUUID
}));
app.post('/api/rental/orders', authMiddleware, async (req, res) => {
  const { account_id, rental_type, quantity, use_credits } = req.body;
  if (!account_id || !rental_type || !quantity) return res.status(400).json({ error: '缺少必要参数' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [accounts] = await conn.execute(
      'SELECT * FROM rental_accounts WHERE id = ? AND status = ? AND deleted_at IS NULL FOR UPDATE',
      [account_id, 'active']
    );
    if (accounts.length === 0) throw new Error('账号不可租用');
    const account = accounts[0];
    if (account.owner_id === req.userId) throw new Error('不能租用自己的账号');
    const [occupied] = await conn.execute(
      'SELECT id FROM rental_orders WHERE account_id = ? AND status IN (?, ?) LIMIT 1',
      [account_id, 'pending', 'active']
    );
    if (occupied.length) throw new Error('账号已有未结束的租用订单');

    const unitPrice = rental_type === 'hour' ? account.hourly_price : account.daily_price;
    if (unitPrice <= 0) throw new Error('价格设置有误');
    let totalPrice = unitPrice * quantity;
    const orderNo = 'RNT' + Date.now() + Math.random().toString(36).substring(2, 8).toUpperCase();

    let creditsUsed = 0;
    if (use_credits && use_credits > 0) {
      const [creditsRow] = await conn.execute('SELECT qy_credits FROM users WHERE id = ? FOR UPDATE', [req.userId]);
      const available = creditsRow[0]?.qy_credits || 0;
      creditsUsed = Math.min(use_credits, available);
      const maxDiscount = creditsUsed / 100;
      const actualDiscount = Math.min(maxDiscount, totalPrice);
      creditsUsed = Math.floor(actualDiscount * 100);
      if (creditsUsed > 0) {
        await postAccountDelta(conn, {
          userId: req.userId, accountType: 'qy_credits', delta: -creditsUsed,
          entryKey: `rental:${orderNo}:credits_debit`, sourceType: 'rental_order',
          sourceRef: orderNo, actorUserId: req.userId
        });
      }
      totalPrice -= actualDiscount;
    }

    await conn.execute(
      `INSERT INTO rental_orders (order_no, renter_id, owner_id, account_id, rental_type, quantity, total_price, credits_used, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [orderNo, req.userId, account.owner_id, account_id, rental_type, quantity, totalPrice, creditsUsed]
    );
    await conn.execute(
      'INSERT INTO rental_order_workflow (order_no, payment_status) VALUES (?, ?)',
      [orderNo, totalPrice === 0 ? 'paid' : 'unpaid']
    );
    await recordOperation(conn, {
      eventKey: `rental:${orderNo}:created`, actorUserId: req.userId,
      action: 'rental_created', targetType: 'rental_order', targetRef: orderNo
    });

    await conn.commit();
    res.status(201).json({ success: true, order_no: orderNo });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
});

app.get('/api/rental/my-rented', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT ro.*, w.payment_status, w.owner_complete_requested_at,
              w.renter_confirmed_at, w.disputed_at, w.resolved_at,
              ra.game_uid, ra.client_type, u.username AS owner_name
       FROM rental_orders ro
       LEFT JOIN rental_order_workflow w ON w.order_no = ro.order_no
       JOIN rental_accounts ra ON ro.account_id = ra.id
       JOIN users u ON ro.owner_id = u.id
       WHERE ro.renter_id = ?
       ORDER BY ro.created_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.get('/api/rental/my-orders', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT ro.*, w.payment_status, w.owner_complete_requested_at,
              w.renter_confirmed_at, w.disputed_at, w.resolved_at,
              ra.game_uid, ra.client_type, u.username AS renter_name
       FROM rental_orders ro
       LEFT JOIN rental_order_workflow w ON w.order_no = ro.order_no
       JOIN rental_accounts ra ON ro.account_id = ra.id
       JOIN users u ON ro.renter_id = u.id
       WHERE ro.owner_id = ?
       ORDER BY ro.created_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.get('/api/admin/rental/orders', adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT ro.order_no, ro.status, ro.total_price, ro.credits_used,
              ro.created_at, renter.username AS renter_name,
              owner.username AS owner_name,
              w.payment_status, w.owner_complete_requested_at,
              w.renter_confirmed_at, w.disputed_at, w.resolved_at,
              e.id AS evidence_id, e.filename AS evidence_filename,
              e.status AS evidence_status, e.expected_amount,
              pr.payment_reference,
              rr.refund_reference, sr.decision AS dispute_decision
       FROM rental_orders ro
       JOIN users renter ON renter.id = ro.renter_id
       JOIN users owner ON owner.id = ro.owner_id
       LEFT JOIN rental_order_workflow w ON w.order_no = ro.order_no
       LEFT JOIN manual_payment_evidence e ON e.id = (
         SELECT MAX(e2.id) FROM manual_payment_evidence e2
         WHERE e2.business_type = 'rental_order' AND e2.business_ref = ro.order_no
       )
       LEFT JOIN rental_refund_reviews rr ON rr.order_no = ro.order_no
       LEFT JOIN rental_payment_reviews pr ON pr.order_no = ro.order_no
       LEFT JOIN rental_settlement_resolutions sr ON sr.order_no = ro.order_no
       ORDER BY ro.created_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/rental/orders/:orderNo/payment-evidence', authMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const { filename } = req.body;
  try {
    validateRentalPaymentEvidence(path.join(__dirname, 'uploads'), filename, req.userId);
  } catch {
    return res.status(400).json({ error: '付款截图无效，请重新上传 PNG 或 JPEG 图片' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      'SELECT id, total_price, status FROM rental_orders WHERE order_no = ? AND renter_id = ? FOR UPDATE',
      [orderNo, req.userId]
    );
    const [workflows] = await conn.execute(
      'SELECT payment_status, disputed_at FROM rental_order_workflow WHERE order_no = ? FOR UPDATE',
      [orderNo]
    );
    if (!orders.length || orders[0].status !== 'pending' || !workflows.length ||
        !['unpaid','rejected'].includes(workflows[0].payment_status) ||
        workflows[0].disputed_at) {
      await conn.rollback();
      return res.status(409).json({ error: '当前订单无法提交付款截图' });
    }
    const [evidence] = await conn.execute(
      `INSERT INTO manual_payment_evidence
       (business_type, business_ref, uploader_user_id, filename, expected_amount)
       VALUES (?, ?, ?, ?, ?)`,
      ['rental_order', orderNo, req.userId, filename, orders[0].total_price]
    );
    await conn.execute(
      'UPDATE rental_order_workflow SET payment_status = ? WHERE order_no = ?',
      ['submitted', orderNo]
    );
    await recordOperation(conn, {
      eventKey: `rental:${orderNo}:evidence:${evidence.insertId}`,
      actorUserId: req.userId, action: 'rental_payment_submitted',
      targetType: 'rental_order', targetRef: orderNo
    });
    await conn.commit();
    res.json({ success: true, message: '付款截图已提交，等待管理员核实收款' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: '服务器错误' });
  } finally { conn.release(); }
});

app.put('/api/admin/rental/orders/:orderNo/review-payment', adminMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const { approved, payment_reference: paymentReference } = req.body;
  if (typeof approved !== 'boolean') return res.status(400).json({ error: '审核结果无效' });
  if (approved && !validRentalReference(paymentReference)) {
    return res.status(400).json({ error: '请填写实际收款的核对编号' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      'SELECT total_price, status FROM rental_orders WHERE order_no = ? FOR UPDATE', [orderNo]
    );
    const [workflows] = await conn.execute(
      'SELECT payment_status FROM rental_order_workflow WHERE order_no = ? FOR UPDATE', [orderNo]
    );
    const [evidence] = await conn.execute(
      `SELECT id, uploader_user_id, filename, expected_amount
       FROM manual_payment_evidence
       WHERE business_type = ? AND business_ref = ? AND status = ?
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      ['rental_order', orderNo, 'submitted']
    );
    const [reviews] = await conn.execute(
      'SELECT order_no FROM rental_payment_reviews WHERE order_no = ? FOR UPDATE', [orderNo]
    );
    if (!orders.length || orders[0].status !== 'pending' || !workflows.length ||
        workflows[0].payment_status !== 'submitted' || !evidence.length || reviews.length ||
        Math.round(Number(evidence[0].expected_amount) * 100) !==
          Math.round(Number(orders[0].total_price) * 100)) {
      await conn.rollback();
      return res.status(409).json({ error: '付款凭证或订单状态已变化' });
    }
    if (approved) {
      try {
        validateRentalPaymentEvidence(path.join(__dirname, 'uploads'),
          evidence[0].filename, evidence[0].uploader_user_id);
      } catch {
        await conn.rollback();
        return res.status(409).json({ error: '付款截图文件已失效，不能确认收款' });
      }
      await conn.execute(
        `INSERT INTO rental_payment_reviews
         (order_no, evidence_id, payment_reference, confirmed_by)
         VALUES (?, ?, ?, ?)`,
        [orderNo, evidence[0].id, paymentReference, req.userId]
      );
    }
    await conn.execute(
      `UPDATE manual_payment_evidence
       SET status = ?, reviewer_user_id = ?, reviewed_at = NOW() WHERE id = ?`,
      [approved ? 'accepted' : 'rejected', req.userId, evidence[0].id]
    );
    await conn.execute(
      'UPDATE rental_order_workflow SET payment_status = ? WHERE order_no = ?',
      [approved ? 'paid' : 'rejected', orderNo]
    );
    await recordOperation(conn, {
      eventKey: `rental:${orderNo}:payment_review:${evidence[0].id}`,
      actorUserId: req.userId,
      action: approved ? 'rental_payment_confirmed' : 'rental_payment_rejected',
      targetType: 'rental_order', targetRef: orderNo
    });
    await conn.commit();
    res.json({ success: true, payment_status: approved ? 'paid' : 'rejected' });
  } catch (err) {
    await conn.rollback();
    res.status(err.code === 'ER_DUP_ENTRY' ? 409 : 500).json({
      error: err.code === 'ER_DUP_ENTRY' ? '收款核对编号已用于其他订单' : '服务器错误'
    });
  } finally { conn.release(); }
});

async function postRentalOwnerEarning(conn, order, actorUserId) {
  const amount = Math.round(Number(order.total_price) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0) throw new Error('租号收益金额无效');
  if (amount === 0) return;
  await postAccountDelta(conn, {
    userId: order.owner_id, accountType: 'rental_earnings', delta: amount,
    entryKey: `rental:${order.order_no}:owner_earnings`,
    sourceType: 'rental_order', sourceRef: order.order_no, actorUserId
  });
}

app.put('/api/rental/orders/:orderNo/confirm', authMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      'SELECT id, status FROM rental_orders WHERE order_no = ? AND owner_id = ? FOR UPDATE',
      [orderNo, req.userId]
    );
    const [workflows] = await conn.execute(
      'SELECT payment_status, disputed_at FROM rental_order_workflow WHERE order_no = ? FOR UPDATE',
      [orderNo]
    );
    if (!orders.length || orders[0].status !== 'pending' ||
        !workflows.length || workflows[0].payment_status !== 'paid' ||
        workflows[0].disputed_at) {
      await conn.rollback();
      return res.status(409).json({ error: '请先由管理员确认收款，或处理当前争议' });
    }
    const [result] = await conn.execute(
      'UPDATE rental_orders SET status = ? WHERE id = ? AND status = ?',
      ['active', orders[0].id, 'pending']
    );
    if (result.affectedRows !== 1) throw new Error('订单状态已变化');
    await recordOperation(conn, {
      eventKey: `rental:${orderNo}:activated`, actorUserId: req.userId,
      action: 'rental_activated', targetType: 'rental_order', targetRef: orderNo
    });
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: '服务器错误' });
  } finally { conn.release(); }
});

app.put('/api/rental/orders/:orderNo/complete', authMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orders] = await conn.execute(
      'SELECT id, status FROM rental_orders WHERE order_no = ? AND owner_id = ? FOR UPDATE',
      [orderNo, req.userId]
    );
    const [workflows] = await conn.execute(
      `SELECT payment_status, owner_complete_requested_at, disputed_at
       FROM rental_order_workflow WHERE order_no = ? FOR UPDATE`,
      [orderNo]
    );
    if (!orders.length || orders[0].status !== 'active' || !workflows.length ||
        workflows[0].payment_status !== 'paid' ||
        workflows[0].owner_complete_requested_at || workflows[0].disputed_at) {
      await conn.rollback();
      return res.status(409).json({ error: '当前无法申请完成，请核查收款或争议状态' });
    }
    const [updated] = await conn.execute(
      `UPDATE rental_order_workflow SET owner_complete_requested_at = NOW()
       WHERE order_no = ? AND owner_complete_requested_at IS NULL`,
      [orderNo]
    );
    if (updated.affectedRows !== 1) throw new Error('完成申请状态已变化');
    await recordOperation(conn, {
      eventKey: `rental:${orderNo}:owner_requested_completion`, actorUserId: req.userId,
      action: 'rental_completion_requested', targetType: 'rental_order', targetRef: orderNo
    });
    await conn.commit();
    res.json({ success: true, message: '已申请完成，等待租用方确认' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: '服务器错误' });
  } finally {
    conn.release();
  }
});

app.put('/api/rental/orders/:orderNo/confirm-completion', authMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      'SELECT * FROM rental_orders WHERE order_no = ? AND renter_id = ? FOR UPDATE',
      [orderNo, req.userId]
    );
    const [workflows] = await conn.execute(
      `SELECT payment_status, owner_complete_requested_at, renter_confirmed_at, disputed_at
       FROM rental_order_workflow WHERE order_no = ? FOR UPDATE`,
      [orderNo]
    );
    if (!orders.length || orders[0].status !== 'active' || !workflows.length ||
        workflows[0].payment_status !== 'paid' ||
        !workflows[0].owner_complete_requested_at ||
        workflows[0].renter_confirmed_at || workflows[0].disputed_at) {
      await conn.rollback();
      return res.status(409).json({ error: '订单尚未满足双方确认条件' });
    }
    const order = orders[0];
    const [updated] = await conn.execute(
      'UPDATE rental_orders SET status = ? WHERE id = ? AND status = ?',
      ['completed', order.id, 'active']
    );
    if (updated.affectedRows !== 1) throw new Error('订单状态已变化');
    await postRentalOwnerEarning(conn, order, req.userId);
    await conn.execute(
      'UPDATE rental_order_workflow SET renter_confirmed_at = NOW() WHERE order_no = ?',
      [orderNo]
    );
    await recordOperation(conn, {
      eventKey: `rental:${orderNo}:completed`, actorUserId: req.userId,
      action: 'rental_completed_by_renter', targetType: 'rental_order', targetRef: orderNo
    });
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: '服务器错误' });
  } finally { conn.release(); }
});

app.put('/api/rental/orders/:orderNo/cancel', authMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      'SELECT * FROM rental_orders WHERE order_no = ? AND (renter_id = ? OR owner_id = ?) AND status IN (?, ?) FOR UPDATE',
      [orderNo, req.userId, req.userId, 'pending', 'active']
    );
    const [workflows] = await conn.execute(
      `SELECT payment_status, owner_complete_requested_at, disputed_at
       FROM rental_order_workflow WHERE order_no = ? FOR UPDATE`, [orderNo]
    );
    if (orders.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: '无法取消' });
    }
    const order = orders[0];
    const workflow = workflows[0];
    if (!workflow || workflow.disputed_at || workflow.owner_complete_requested_at ||
        workflow.payment_status === 'submitted' ||
        workflow.payment_status === 'paid' ||
        (order.status === 'active' && workflow.payment_status !== 'paid')) {
      await conn.rollback();
      return res.status(409).json({ error: '订单已有付款或争议，需管理员核实退款后处理' });
    }
    const [result] = await conn.execute(
      'UPDATE rental_orders SET status = ? WHERE id = ? AND status = ?',
      ['cancelled', order.id, order.status]
    );
    if (result.affectedRows !== 1) throw new Error('无法取消');
    if (order.credits_used > 0) {
      await postAccountDelta(conn, {
        userId: order.renter_id, accountType: 'qy_credits', delta: order.credits_used,
        entryKey: `rental:${orderNo}:credits_refund`, sourceType: 'rental_order',
        sourceRef: orderNo, actorUserId: req.userId
      });
    }
    await recordOperation(conn, {
      eventKey: `rental:${orderNo}:cancelled`, actorUserId: req.userId,
      action: 'rental_cancelled', targetType: 'rental_order', targetRef: orderNo
    });
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: '服务器错误' });
  } finally { conn.release(); }
});

app.put('/api/rental/orders/:orderNo/dispute', authMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      `SELECT status FROM rental_orders WHERE order_no = ?
       AND (renter_id = ? OR owner_id = ?) FOR UPDATE`,
      [orderNo, req.userId, req.userId]
    );
    const [workflows] = await conn.execute(
      `SELECT payment_status, disputed_at, resolved_at
       FROM rental_order_workflow WHERE order_no = ? FOR UPDATE`, [orderNo]
    );
    if (!orders.length || !['pending', 'active'].includes(orders[0].status) ||
        !workflows.length || workflows[0].payment_status !== 'paid' ||
        workflows[0].disputed_at || workflows[0].resolved_at) {
      await conn.rollback();
      return res.status(409).json({ error: '当前订单不能发起争议' });
    }
    await conn.execute(
      'UPDATE rental_order_workflow SET disputed_at = NOW() WHERE order_no = ?', [orderNo]
    );
    await recordOperation(conn, {
      eventKey: `rental:${orderNo}:disputed`, actorUserId: req.userId,
      action: 'rental_disputed', targetType: 'rental_order', targetRef: orderNo
    });
    await conn.commit();
    res.json({ success: true, message: '争议已登记，等待管理员处理' });
  } catch {
    await conn.rollback();
    res.status(500).json({ error: '服务器错误' });
  } finally { conn.release(); }
});

function validRentalReference(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._:\/-]{4,80}$/.test(value);
}

app.put('/api/admin/rental/orders/:orderNo/confirm-refund', adminMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const { refunded_amount: refundedAmount, refund_reference: refundReference } = req.body;
  if (!validRentalReference(refundReference) ||
      !Number.isFinite(Number(refundedAmount)) || Number(refundedAmount) < 0) {
    return res.status(400).json({ error: '退款金额或外部退款凭据无效' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      'SELECT * FROM rental_orders WHERE order_no = ? FOR UPDATE', [orderNo]
    );
    const [workflows] = await conn.execute(
      `SELECT payment_status, disputed_at, resolved_at
       FROM rental_order_workflow WHERE order_no = ? FOR UPDATE`, [orderNo]
    );
    const [reviews] = await conn.execute(
      'SELECT order_no FROM rental_refund_reviews WHERE order_no = ? FOR UPDATE', [orderNo]
    );
    const order = orders[0];
    if (!order || !['pending', 'active'].includes(order.status) || !workflows.length ||
        workflows[0].payment_status !== 'paid' ||
        Math.round(Number(refundedAmount) * 100) !==
          Math.round(Number(order.total_price) * 100) || reviews.length ||
        workflows[0].resolved_at) {
      await conn.rollback();
      return res.status(409).json({ error: '订单尚未满足核实退款条件，或退款已登记' });
    }
    await conn.execute(
      `INSERT INTO rental_refund_reviews
       (order_no, refunded_amount, refund_reference, confirmed_by)
       VALUES (?, ?, ?, ?)`,
      [orderNo, refundedAmount, refundReference, req.userId]
    );
    if (workflows[0].disputed_at) {
      await conn.execute(
        `INSERT INTO rental_settlement_resolutions
         (order_no, decision, resolution_reference, decided_by)
         VALUES (?, 'cancelled', ?, ?)`,
        [orderNo, refundReference, req.userId]
      );
      await conn.execute(
        'UPDATE rental_order_workflow SET resolved_at = NOW() WHERE order_no = ?', [orderNo]
      );
    }
    const [updated] = await conn.execute(
      'UPDATE rental_orders SET status = ? WHERE id = ? AND status = ?',
      ['cancelled', order.id, order.status]
    );
    if (updated.affectedRows !== 1) throw new Error('订单状态已变化');
    if (Number(order.credits_used) > 0) {
      await postAccountDelta(conn, {
        userId: order.renter_id, accountType: 'qy_credits',
        delta: Number(order.credits_used),
        entryKey: `rental:${orderNo}:credits_refund`, sourceType: 'rental_order',
        sourceRef: orderNo, actorUserId: req.userId
      });
    }
    await recordOperation(conn, {
      eventKey: `rental:${orderNo}:refund_confirmed`, actorUserId: req.userId,
      action: 'rental_refund_confirmed', targetType: 'rental_order', targetRef: orderNo
    });
    await conn.commit();
    res.json({ success: true, message: '已核实退款或无现金应退，并取消订单' });
  } catch (err) {
    await conn.rollback();
    res.status(err.code === 'ER_DUP_ENTRY' ? 409 : 500).json({
      error: err.code === 'ER_DUP_ENTRY' ? '退款核对编号已用于其他订单' : '服务器错误'
    });
  } finally { conn.release(); }
});

app.put('/api/admin/rental/orders/:orderNo/resolve-dispute', adminMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const { decision, resolution_reference: reference } = req.body;
  if (decision !== 'completed' || !validRentalReference(reference)) {
    return res.status(400).json({ error: '裁决内容或凭据无效' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      'SELECT * FROM rental_orders WHERE order_no = ? FOR UPDATE', [orderNo]
    );
    const [workflows] = await conn.execute(
      `SELECT payment_status, owner_complete_requested_at, disputed_at, resolved_at
       FROM rental_order_workflow WHERE order_no = ? FOR UPDATE`, [orderNo]
    );
    const order = orders[0];
    if (!order || order.status !== 'active' || !workflows.length ||
        workflows[0].payment_status !== 'paid' ||
        !workflows[0].owner_complete_requested_at ||
        !workflows[0].disputed_at || workflows[0].resolved_at) {
      await conn.rollback();
      return res.status(409).json({ error: '争议订单尚未满足结算条件' });
    }
    await conn.execute(
      `INSERT INTO rental_settlement_resolutions
       (order_no, decision, resolution_reference, decided_by)
       VALUES (?, 'completed', ?, ?)`,
      [orderNo, reference, req.userId]
    );
    const [updated] = await conn.execute(
      'UPDATE rental_orders SET status = ? WHERE id = ? AND status = ?',
      ['completed', order.id, 'active']
    );
    if (updated.affectedRows !== 1) throw new Error('订单状态已变化');
    await postRentalOwnerEarning(conn, order, req.userId);
    await conn.execute(
      'UPDATE rental_order_workflow SET resolved_at = NOW() WHERE order_no = ?', [orderNo]
    );
    await recordOperation(conn, {
      eventKey: `rental:${orderNo}:resolved_completed`, actorUserId: req.userId,
      action: 'rental_dispute_resolved_completed',
      targetType: 'rental_order', targetRef: orderNo
    });
    await conn.commit();
    res.json({ success: true });
  } catch {
    await conn.rollback();
    res.status(500).json({ error: '服务器错误' });
  } finally { conn.release(); }
});

app.get('/api/rental/earnings', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT rental_earnings FROM users WHERE id = ?', [req.userId]);
    res.json({ earnings: rows[0]?.rental_earnings || 0 });
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

// ==================== 动态内容 API ====================
app.get('/api/announcements', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 1');
    res.json(rows.length ? rows[0] : null);
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.get('/api/game-news', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM game_news ORDER BY created_at DESC LIMIT 10');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});


app.get('/api/admin/announcements', adminMiddleware, async (req, res) => {
  try { const [rows] = await pool.execute('SELECT * FROM announcements ORDER BY created_at DESC'); res.json(rows); }
  catch (err) { res.status(500).json({ error: '服务器错误' }); }
});
app.get('/api/admin/game-news', adminMiddleware, async (req, res) => {
  try { const [rows] = await pool.execute('SELECT * FROM game_news ORDER BY created_at DESC'); res.json(rows); }
  catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.post('/api/admin/announcements', adminMiddleware, async (req, res) => {
  const { id, title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: '标题和内容必填' });
  try {
    if (id) {
      await pool.execute('UPDATE announcements SET title=?, content=? WHERE id=?', [title, content, id]);
      res.json({ success: true, message: '已更新' });
    } else {
      await pool.execute('INSERT INTO announcements (title, content) VALUES (?, ?)', [title, content]);
      res.json({ success: true, message: '已创建' });
    }
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.post('/api/admin/game-news', adminMiddleware, async (req, res) => {
  const { id, title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: '标题和内容必填' });
  try {
    if (id) {
      await pool.execute('UPDATE game_news SET title=?, content=? WHERE id=?', [title, content, id]);
      res.json({ success: true, message: '已更新' });
    } else {
      await pool.execute('INSERT INTO game_news (title, content) VALUES (?, ?)', [title, content]);
      res.json({ success: true, message: '已创建' });
    }
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});


app.delete('/api/admin/announcements/:id', adminMiddleware, async (req, res) => {
  try { await pool.execute('DELETE FROM announcements WHERE id=?', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: '服务器错误' }); }
});
app.delete('/api/admin/game-news/:id', adminMiddleware, async (req, res) => {
  try { await pool.execute('DELETE FROM game_news WHERE id=?', [req.params.id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.post('/api/upload-image', authMiddleware, async (req, res) => {
  const { image } = req.body;
  if (!image) return res.status(400).json({ error: '请提供图片数据' });
  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
  const filename = `content_${req.userId}_${Date.now()}.png`;
  try {
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync(path.join(uploadDir, filename), base64Data, 'base64');
    res.json({ success: true, url: `/uploads/${filename}` });
  } catch (err) {
    res.status(500).json({ error: '图片保存失败' });
  }
});

// ==================== 三方订单 API ====================
async function recordThirdPartyEvent(conn, orderNo, eventType, actorUserId, note = null) {
  await conn.execute(
    'INSERT INTO third_party_order_events (order_no, event_type, actor_user_id, note) VALUES (?,?,?,?)',
    [orderNo, eventType, actorUserId, note]
  );
}

app.use('/api/order-center', createOrderCenterRouter({
  pool, authMiddleware, recordOperation, revealOrderCredentials
}));

app.get('/api/third-party-orders/platforms', authMiddleware, (req, res) => {
  res.json(THIRD_PARTY_PLATFORMS);
});

app.post('/api/third-party-orders', authMiddleware, async (req, res) => {
  const [userRows] = await pool.execute('SELECT role FROM users WHERE id = ?', [req.userId]);
  if (!userRows.length || !['admin', 'booster'].includes(userRows[0].role)) {
    return res.status(403).json({ error: '无权限，仅管理员或打手可创建' });
  }
  const validated = validateThirdPartyOrderInput(req.body);
  if (validated.error) return res.status(400).json({ error: validated.error });

  const orderNo = 'TP' + Date.now() + crypto.randomBytes(2).toString('hex').toUpperCase();
  const input = validated.value;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      'INSERT INTO third_party_orders (order_no, creator_id, platform, content, account_info, price) VALUES (?,?,?,?,?,?)',
      [orderNo, req.userId, input.platform, input.content, input.accountInfo, input.price]
    );
    await conn.execute(
      `INSERT INTO third_party_order_workflow
       (order_no, external_order_no, expected_at) VALUES (?,?,?)`,
      [orderNo, input.externalOrderNo, input.expectedAt]
    );
    await recordThirdPartyEvent(conn, orderNo, 'created', req.userId, `来源：${input.platform}`);
    await conn.commit();
    res.status(201).json({ success: true, order_no: orderNo });
  } catch (err) {
    await conn.rollback();
    console.error('创建三方订单失败:', err);
    res.status(500).json({ error: '创建失败' });
  } finally { conn.release(); }
});

app.get('/api/third-party-orders', authMiddleware, async (req, res, next) => {
  const [userRows] = await pool.execute('SELECT role FROM users WHERE id = ?', [req.userId]);
  if (userRows.length === 0) return res.status(401).json({ error: '用户不存在' });

  const role = userRows[0].role;
  let sql, params;
  if (role === 'admin') {
    sql = `SELECT t.*, f.final_status, f.finalized_at, u.username AS creator_name,
        w.external_order_no, w.expected_at, w.rejection_reason, w.completion_note,
        w.completion_return_reason, w.payment_channel, w.payment_reference,
        w.payment_confirmed_at, w.revision_count, w.complete_requested_at
      FROM third_party_orders t
      LEFT JOIN third_party_order_finalization f ON f.order_no = t.order_no
      LEFT JOIN third_party_order_workflow w ON w.order_no = t.order_no
      JOIN users u ON t.creator_id = u.id ORDER BY t.created_at DESC`;
    params = [];
  } else if (role === 'booster') {
    sql = `SELECT t.*, f.final_status, f.finalized_at, u.username AS creator_name,
        w.external_order_no, w.expected_at, w.rejection_reason, w.completion_note,
        w.completion_return_reason, w.payment_channel, w.payment_reference,
        w.payment_confirmed_at, w.revision_count, w.complete_requested_at
      FROM third_party_orders t
      LEFT JOIN third_party_order_finalization f ON f.order_no = t.order_no
      LEFT JOIN third_party_order_workflow w ON w.order_no = t.order_no
      JOIN users u ON t.creator_id = u.id
      WHERE t.creator_id = ? ORDER BY t.created_at DESC`;
    params = [req.userId];
  } else {
    return res.status(403).json({ error: '无权限访问' });
  }

  try {
    const [rows] = await pool.execute(sql, params);
    res.json(rows.map((row) => ({
      ...row,
      platform: normalizeThirdPartyPlatform(row.platform),
      workflow_stage: getWorkflowStage(row)
    })));
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

app.put('/api/third-party-orders/:orderNo/review', adminMiddleware, async (req, res) => {
  const { status } = req.body;
  if (!['approved','rejected'].includes(status)) return res.status(400).json({ error: '无效状态' });
  const reason = cleanThirdPartyText(req.body.reason, 500);
  if (status === 'rejected' && !reason) return res.status(400).json({ error: '请填写驳回原因（最多 500 字）' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      'SELECT status FROM third_party_orders WHERE order_no = ? FOR UPDATE', [req.params.orderNo]
    );
    if (!orders.length) { await conn.rollback(); return res.status(404).json({ error: '订单不存在' }); }
    if (!canReview(orders[0])) {
      await conn.rollback();
      return res.status(409).json({ error: '只有待审核订单可以审核' });
    }
    await conn.execute('UPDATE third_party_orders SET status = ?, reviewer_id = ? WHERE order_no = ?',
      [status, req.userId, req.params.orderNo]);
    await conn.execute(
      `INSERT INTO third_party_order_workflow (order_no, rejection_reason)
       VALUES (?,?) ON DUPLICATE KEY UPDATE rejection_reason = VALUES(rejection_reason)`,
      [req.params.orderNo, status === 'rejected' ? reason : null]
    );
    await recordThirdPartyEvent(conn, req.params.orderNo,
      status === 'approved' ? 'approved' : 'rejected', req.userId, reason || null);
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: '服务器错误' });
  } finally { conn.release(); }
});

app.put('/api/third-party-orders/:orderNo/resubmit', authMiddleware, async (req, res) => {
  const validated = validateThirdPartyOrderInput(req.body);
  if (validated.error) return res.status(400).json({ error: validated.error });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      `SELECT t.creator_id, t.status, t.payment_status, f.final_status
       FROM third_party_orders t LEFT JOIN third_party_order_finalization f ON f.order_no=t.order_no
       WHERE t.order_no=? FOR UPDATE`, [req.params.orderNo]
    );
    if (!orders.length) { await conn.rollback(); return res.status(404).json({ error: '订单不存在' }); }
    const [users] = await conn.execute('SELECT role FROM users WHERE id=?', [req.userId]);
    const order = orders[0];
    if (order.creator_id !== req.userId && users[0]?.role !== 'admin') {
      await conn.rollback(); return res.status(403).json({ error: '无权修改此订单' });
    }
    if (!canResubmit(order)) {
      await conn.rollback(); return res.status(409).json({ error: '只有被驳回且未收款的订单可以修改重提' });
    }
    const input = validated.value;
    await conn.execute(
      `UPDATE third_party_orders SET platform=?, content=?, account_info=?, price=?,
       status='pending', reviewer_id=NULL, complete_requested=0 WHERE order_no=?`,
      [input.platform, input.content, input.accountInfo, input.price, req.params.orderNo]
    );
    await conn.execute(
      `INSERT INTO third_party_order_workflow (order_no, external_order_no, expected_at, revision_count, last_resubmitted_at)
       VALUES (?,?,?,1,NOW()) ON DUPLICATE KEY UPDATE external_order_no=VALUES(external_order_no),
       expected_at=VALUES(expected_at), rejection_reason=NULL, revision_count=revision_count+1,
       last_resubmitted_at=NOW()`,
      [req.params.orderNo, input.externalOrderNo, input.expectedAt]
    );
    await recordThirdPartyEvent(conn, req.params.orderNo, 'resubmitted', req.userId, null);
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: '服务器错误' });
  } finally { conn.release(); }
});

app.delete('/api/third-party-orders/:orderNo', authMiddleware, async (req, res) => {
  const { orderNo } = req.params;
  const [orderRows] = await pool.execute('SELECT * FROM third_party_orders WHERE order_no = ?', [orderNo]);
  if (orderRows.length === 0) return res.status(404).json({ error: '订单不存在' });

  const order = orderRows[0];
  if (order.payment_status === 'paid' || order.complete_requested) {
    return res.status(400).json({ error: '已付款或申请完单的订单不能删除' });
  }
  const [userRows] = await pool.execute('SELECT role FROM users WHERE id = ?', [req.userId]);
  const role = userRows[0]?.role;

  if (role !== 'admin' && order.creator_id !== req.userId) {
    return res.status(403).json({ error: '无权删除' });
  }

  try {
    await pool.execute('DELETE FROM third_party_orders WHERE order_no = ?', [orderNo]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

app.put('/api/third-party-orders/:orderNo/request-complete', authMiddleware, async (req, res) => {
  const completionNote = cleanThirdPartyText(req.body.completion_note, 1000);
  if (!completionNote) return res.status(400).json({ error: '请填写完单说明（最多 1000 字）' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      `SELECT t.*, f.final_status FROM third_party_orders t
       LEFT JOIN third_party_order_finalization f ON f.order_no=t.order_no WHERE t.order_no = ? FOR UPDATE`,
      [req.params.orderNo]
    );
    if (orders.length === 0) { await conn.rollback(); return res.status(404).json({ error: '订单不存在' }); }
    const order = orders[0];
    
    const [userRows] = await conn.execute('SELECT role FROM users WHERE id = ?', [req.userId]);
    if (!userRows.length) { await conn.rollback(); return res.status(401).json({ error: '用户不存在' }); }
    
    if (order.creator_id !== req.userId && userRows[0].role !== 'admin') {
      await conn.rollback(); return res.status(403).json({ error: '无权操作' });
    }
    if (!canRequestCompletion(order)) {
      await conn.rollback(); return res.status(409).json({ error: '当前订单不能申请验收' });
    }
    await conn.execute('UPDATE third_party_orders SET complete_requested = 1 WHERE order_no = ?', [req.params.orderNo]);
    await conn.execute(
      `INSERT INTO third_party_order_workflow (order_no, completion_note, completion_return_reason, complete_requested_at)
       VALUES (?,?,NULL,NOW()) ON DUPLICATE KEY UPDATE completion_note=VALUES(completion_note),
       completion_return_reason=NULL, complete_requested_at=NOW()`,
      [req.params.orderNo, completionNote]
    );
    await recordThirdPartyEvent(conn, req.params.orderNo, 'completion_requested', req.userId, completionNote);
    await conn.commit();
    res.json({ success: true, message: '已申请完单' });
  } catch (err) {
    await conn.rollback();
    console.error('申请完单失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  } finally { conn.release(); }
});

app.put('/api/third-party-orders/:orderNo/return-completion', adminMiddleware, async (req, res) => {
  const reason = cleanThirdPartyText(req.body.reason, 500);
  if (!reason) return res.status(400).json({ error: '请填写退回原因（最多 500 字）' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      `SELECT t.status, t.complete_requested, f.final_status FROM third_party_orders t
       LEFT JOIN third_party_order_finalization f ON f.order_no=t.order_no
       WHERE t.order_no=? FOR UPDATE`, [req.params.orderNo]
    );
    if (!orders.length) { await conn.rollback(); return res.status(404).json({ error: '订单不存在' }); }
    if (!canReturnCompletion(orders[0])) {
      await conn.rollback(); return res.status(409).json({ error: '当前订单不能退回验收' });
    }
    await conn.execute('UPDATE third_party_orders SET complete_requested=0 WHERE order_no=?', [req.params.orderNo]);
    await conn.execute(
      `INSERT INTO third_party_order_workflow (order_no, completion_return_reason)
       VALUES (?,?) ON DUPLICATE KEY UPDATE completion_return_reason=VALUES(completion_return_reason)`,
      [req.params.orderNo, reason]
    );
    await recordThirdPartyEvent(conn, req.params.orderNo, 'completion_returned', req.userId, reason);
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: '服务器错误' });
  } finally { conn.release(); }
});

app.put('/api/third-party-orders/:orderNo/mark-paid', adminMiddleware, async (req, res) => {
  const channel = cleanThirdPartyText(req.body.payment_channel, 30);
  const reference = cleanThirdPartyText(req.body.payment_reference, 80);
  if (!channel || !reference) return res.status(400).json({ error: '请填写收款渠道和交易单号' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      `SELECT t.status, t.payment_status, f.final_status FROM third_party_orders t
       LEFT JOIN third_party_order_finalization f ON f.order_no=t.order_no
       WHERE t.order_no=? FOR UPDATE`, [req.params.orderNo]
    );
    if (!orders.length) { await conn.rollback(); return res.status(404).json({ error: '订单不存在' }); }
    if (!canConfirmPayment(orders[0])) {
      await conn.rollback(); return res.status(409).json({ error: '当前订单不能确认收款' });
    }
    await conn.execute('UPDATE third_party_orders SET payment_status=? WHERE order_no=?', ['paid', req.params.orderNo]);
    await conn.execute(
      `INSERT INTO third_party_order_workflow
       (order_no, payment_channel, payment_reference, payment_confirmed_by, payment_confirmed_at)
       VALUES (?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE payment_channel=VALUES(payment_channel),
       payment_reference=VALUES(payment_reference), payment_confirmed_by=VALUES(payment_confirmed_by),
       payment_confirmed_at=NOW()`,
      [req.params.orderNo, channel, reference, req.userId]
    );
    await recordThirdPartyEvent(conn, req.params.orderNo, 'payment_confirmed', req.userId, channel);
    await conn.commit();
    res.json({ success: true, message: '收款已核实' });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '该交易单号已用于其他订单' });
    res.status(500).json({ error: '服务器错误' });
  } finally { conn.release(); }
});

app.get('/api/third-party-orders/:orderNo/events', authMiddleware, async (req, res) => {
  try {
    const [orders] = await pool.execute('SELECT creator_id FROM third_party_orders WHERE order_no=?', [req.params.orderNo]);
    if (!orders.length) return res.status(404).json({ error: '订单不存在' });
    const [users] = await pool.execute('SELECT role FROM users WHERE id=?', [req.userId]);
    if (orders[0].creator_id !== req.userId && users[0]?.role !== 'admin') {
      return res.status(403).json({ error: '无权查看' });
    }
    const [events] = await pool.execute(
      `SELECT e.event_type, e.note, e.created_at, u.username AS actor_name
       FROM third_party_order_events e LEFT JOIN users u ON u.id=e.actor_user_id
       WHERE e.order_no=? ORDER BY e.created_at DESC, e.id DESC`, [req.params.orderNo]
    );
    res.json(events);
  } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.put('/api/third-party-orders/:orderNo/finalize', adminMiddleware, async (req, res) => {
  const orderNo = req.params.orderNo;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.execute(
      'SELECT status, payment_status, complete_requested FROM third_party_orders WHERE order_no = ? FOR UPDATE',
      [orderNo]
    );
    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ error: '订单不存在' });
    }
    const order = orders[0];
    if (order.status !== 'approved' || order.payment_status !== 'paid' || !order.complete_requested) {
      await conn.rollback();
      return res.status(400).json({ error: '订单尚未满足最终完成条件' });
    }
    const [existing] = await conn.execute(
      'SELECT order_no FROM third_party_order_finalization WHERE order_no = ?', [orderNo]
    );
    if (existing.length) {
      await conn.rollback();
      return res.status(409).json({ error: '订单已经最终完成' });
    }
    await conn.execute(
      'INSERT INTO third_party_order_finalization (order_no, final_status, finalized_by) VALUES (?, ?, ?)',
      [orderNo, 'completed', req.userId]
    );
    await recordOperation(conn, {
      eventKey: `third_party:${orderNo}:finalized`, actorUserId: req.userId,
      action: 'third_party_finalized', targetType: 'third_party_order', targetRef: orderNo
    });
    await recordThirdPartyEvent(conn, orderNo, 'completed', req.userId, null);
    await conn.commit();
    res.json({ success: true, final_status: 'completed' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: '服务器错误' });
  } finally { conn.release(); }
});


// ==================== 开箱模拟器 API ====================

// 获取所有箱子及奖池（公开）
// 获取所有箱子及奖池（公开）
app.get('/api/chest/configs', async (req, res) => {
  try {
    const [chests] = await pool.execute('SELECT * FROM chest_configs ORDER BY id');
    const [rareItems] = await pool.execute('SELECT * FROM chest_items WHERE rarity = ?', ['rare']);
    const [commonRewards] = await pool.execute('SELECT * FROM chest_common_rewards');

    const result = chests.map(chest => {
      const rare = rareItems.filter(i => i.chest_id === chest.id);
      const common = commonRewards.filter(r => r.chest_id === chest.id);
      return {
        ...chest,
        items: rare,          // 兼容旧前端，只返回稀有物品作为 items（详情弹窗会用到）
        rare_items: rare,
        common_rewards: common
      };
    });
    res.json(result);
  } catch (err) {
    console.error('获取箱子配置失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取用户军需券余额
app.get('/api/chest/tickets', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT chest_tickets FROM users WHERE id = ?', [req.userId]);
    if (!rows.length) return res.status(404).json({ error: '用户不存在' });
    res.json({ tickets: rows[0].chest_tickets });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// 签到领券
app.post('/api/chest/checkin', authMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 使用数据库当前日期，避免时区问题
    const [todayRows] = await conn.execute(`SELECT DATE_FORMAT(NOW(), '%Y-%m-%d') AS today`);
    const today = todayRows[0].today;  // 现在是字符串，如 '2026-08-14'

    // 查询并锁定用户行，防止并发；直接返回格式化日期字符串，避免时区问题
    const [userRows] = await conn.execute(
      `SELECT chest_tickets, 
              DATE_FORMAT(last_chest_checkin_date, '%Y-%m-%d') AS last_date
       FROM users WHERE id = ? FOR UPDATE`,
      [req.userId]
    );
    if (!userRows.length) {
      await conn.rollback();
      return res.status(404).json({ error: '用户不存在' });
    }

    const lastDate = userRows[0].last_date;  // 例如 '2026-08-14' 或 null
    if (lastDate === today) {
      await conn.rollback();
      return res.status(400).json({ error: '今日已签到' });
    }

    const newTickets = await postAccountDelta(conn, {
      userId: req.userId, accountType: 'chest_tickets', delta: 1000,
      entryKey: `checkin:${req.userId}:${today}`, sourceType: 'checkin',
      sourceRef: today, actorUserId: req.userId
    });
    await conn.execute(
      'UPDATE users SET last_chest_checkin_date = ? WHERE id = ?',
      [today, req.userId]
    );
    await recordOperation(conn, {
      eventKey: `checkin:${req.userId}:${today}:completed`, actorUserId: req.userId,
      action: 'chest_checkin', targetType: 'user', targetRef: String(req.userId)
    });

    await conn.commit();
    res.json({ success: true, tickets: newTickets, message: '签到成功，获得1000军需券' });
  } catch (err) {
    await conn.rollback();
    console.error('签到失败:', err);
    res.status(500).json({ error: '服务器错误' });
  } finally {
    conn.release();
  }
});

// 创建支付宝充值订单
app.post('/api/chest/recharge', authMiddleware, async (req, res) => {
  if (!alipaySdk) {
    return res.status(503).json({ error: '支付服务暂未启用' });
  }

  let order;
  try {
    order = await createRechargeOrder(pool, req.userId);
    res.set('Cache-Control', 'no-store');
    res.set('X-Recharge-Order-No', order.out_trade_no);
    if (req.get('Accept')?.includes('application/json')) {
      return res.status(201).json({ order_no:order.out_trade_no,amount:order.amount,ticket_quantity:order.ticket_quantity });
    }
    const result = await alipaySdk.pageExecute('alipay.trade.page.pay', paymentFormParams(order,process.env));
    res.send(result);
  } catch (err) {
    // A failed payment-page request does not erase or locally close a payable order.
    console.error(`创建充值订单失败 code=${err.code || 'INTERNAL_ERROR'}`);
    if (!res.headersSent) {
      res.status(500).json({ error:order ? '支付页面暂时无法打开，请在所有订单中继续支付' : '创建支付订单失败',order_no:order?.out_trade_no });
    }
  }
});

app.post('/api/chest/payments/:outTradeNo/pay', authMiddleware, async (req,res) => {
  if (!alipaySdk) return res.status(503).json({ error:'支付服务暂未启用' });
  if (!isValidOutTradeNo(req.params.outTradeNo)) return res.status(400).json({ error:'支付订单号无效' });
  try {
    const [rows]=await pool.execute(`SELECT p.out_trade_no,p.amount,p.status,w.provider_status,w.ticket_quantity
      FROM payment_orders p LEFT JOIN recharge_order_workflow w ON w.out_trade_no=p.out_trade_no
      WHERE p.out_trade_no=? AND p.user_id=?`,[req.params.outTradeNo,req.userId]);
    if (!rows.length) return res.status(404).json({ error:'充值订单不存在' });
    if (!canResumeRecharge(rows[0])) return res.status(409).json({ error:'订单当前不能再次付款，请查询支付结果' });
    const order={ ...rows[0],ticket_quantity:rows[0].ticket_quantity || RECHARGE_TICKETS };
    const html=await alipaySdk.pageExecute('alipay.trade.page.pay',paymentFormParams(order,process.env));
    res.set('Cache-Control','no-store').send(html);
  } catch { res.status(502).json({ error:'支付页面暂时无法打开，可稍后在原订单继续支付' }); }
});

app.post('/api/chest/payments/:outTradeNo/refresh', authMiddleware, async (req,res) => {
  if (!alipaySdk || !paymentConfig) return res.status(503).json({ error:'支付服务暂未启用' });
  if (!isValidOutTradeNo(req.params.outTradeNo)) return res.status(400).json({ error:'支付订单号无效' });
  try {
    const [rows]=await pool.execute('SELECT out_trade_no FROM payment_orders WHERE out_trade_no=? AND user_id=?',
      [req.params.outTradeNo,req.userId]);
    if (!rows.length) return res.status(404).json({ error:'充值订单不存在' });
    const result=await refreshRecharge({ pool,alipaySdk,outTradeNo:req.params.outTradeNo,paymentConfig });
    res.set('Cache-Control','no-store').json(result);
  } catch { res.status(502).json({ error:'查询或到账处理暂时失败，请稍后刷新，不要再次付款' }); }
});

app.get('/api/chest/payments/:outTradeNo', authMiddleware, async (req, res) => {
  const { outTradeNo } = req.params;
  if (!isValidOutTradeNo(outTradeNo)) {
    return res.status(400).json({ error: '支付订单号格式无效' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT out_trade_no, amount, status, created_at, paid_at, closed_at
       FROM payment_orders
       WHERE out_trade_no = ? AND user_id = ?`,
      [outTradeNo, req.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: '支付订单不存在' });
    res.set('Cache-Control', 'no-store');
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/admin/chest/payments/:outTradeNo/provider-status', adminMiddleware, async (req, res) => {
  if (!alipaySdk) return res.status(503).json({ error: '支付服务暂未启用' });
  const { outTradeNo } = req.params;
  if (!isValidOutTradeNo(outTradeNo)) return res.status(400).json({error:'支付订单号无效'});

  try {
    const result = await refreshRecharge({ pool,alipaySdk,outTradeNo,paymentConfig,credit:false });
    res.set('Cache-Control', 'no-store');
    if (!result.found) {
      return res.json({
        found: false,
        providerCode: result.providerCode,
        providerSubCode: result.providerSubCode
      });
    }
    res.json({
      found: true,
      tradeStatus: result.tradeStatus,
      orderReference: maskTradeReference(outTradeNo)
    });
  } catch (err) {
    console.error(`支付宝订单查询失败 code=${err.code || 'INTERNAL_ERROR'}`);
    res.status(502).json({ error: '支付宝订单查询失败' });
  }
});

app.post('/api/admin/chest/payments/:outTradeNo/reconcile', adminMiddleware, async (req, res) => {
  if (!alipaySdk || !paymentConfig) {
    return res.status(503).json({ error: '支付服务暂未启用' });
  }
  if (req.body?.confirmation !== 'RECONCILE_SIGNED_ALIPAY_PAYMENT') {
    return res.status(400).json({ error: '缺少支付对账确认值' });
  }
  const reason=typeof req.body.reason==='string' ? req.body.reason.trim() : '';
  if (!reason || reason.length>500) return res.status(400).json({ error:'请填写人工重试到账原因（最多500字）' });

  const { outTradeNo } = req.params;
  try {
    if (!isValidOutTradeNo(outTradeNo)) return res.status(400).json({ error:'支付订单号无效' });
    const [orders]=await pool.execute('SELECT out_trade_no FROM payment_orders WHERE out_trade_no=?',[outTradeNo]);
    if (!orders.length) return res.status(404).json({ error:'充值订单不存在' });
    await pool.execute('INSERT INTO order_management_events (order_type,order_ref,actor_user_id,action,note) VALUES (?,?,?,?,?)',
      ['recharge',outTradeNo,req.userId,'reconcile_requested',reason]);
    const result = await refreshRecharge({ pool,alipaySdk,outTradeNo,paymentConfig });
    console.info(
      `支付宝人工对账 outcome=${result.outcome} order=${maskTradeReference(outTradeNo)}`
    );
    res.json({ success: Boolean(result.acknowledge), found: result.found, outcome: result.outcome });
  } catch (err) {
    console.error(`支付宝人工对账失败 code=${err.code || 'INTERNAL_ERROR'}`);
    res.status(502).json({ error: '支付宝订单对账失败' });
  }
});

// 开箱
app.post('/api/chest/open', authMiddleware, async (req, res) => {
  const { chestId } = req.body;
  if (!chestId) return res.status(400).json({ error: '缺少箱子ID' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 检查用户券
    const [userRows] = await conn.execute('SELECT chest_tickets FROM users WHERE id = ? FOR UPDATE', [req.userId]);
    if (!userRows.length) throw new Error('用户不存在');
    const tickets = userRows[0].chest_tickets;

    // 获取箱子信息
    const [chestRows] = await conn.execute('SELECT * FROM chest_configs WHERE id = ?', [chestId]);
    if (!chestRows.length) throw new Error('箱子不存在');
    const chest = chestRows[0];

    if (tickets < chest.price) throw new Error('军需券不足');

    // 扣券
    const openEventId = crypto.randomUUID();
    if (chest.price > 0) {
      await postAccountDelta(conn, {
        userId: req.userId, accountType: 'chest_tickets', delta: -chest.price,
        entryKey: `chest_open:${openEventId}:tickets_debit`, sourceType: 'chest_open',
        sourceRef: openEventId, actorUserId: req.userId
      });
    }

    // 决定稀有度：5% 稀有，95% 普通
    const isRare = Math.random() < 0.05;
    const rarity = isRare ? 'rare' : 'normal';

    const rewards = [];

    if (isRare) {
      // 从稀有池按权重抽一个
      const [rareItems] = await conn.execute(
        'SELECT * FROM chest_items WHERE chest_id = ? AND rarity = ?',
        [chestId, 'rare']
      );
      if (!rareItems.length) throw new Error('箱子稀有奖池为空');

      const totalWeight = rareItems.reduce((sum, item) => sum + item.weight, 0);
      let rand = Math.random() * totalWeight;
      let selectedItem = rareItems[0];
      for (const item of rareItems) {
        rand -= item.weight;
        if (rand <= 0) {
          selectedItem = item;
          break;
        }
      }
      rewards.push({ item_name: selectedItem.item_name, quantity: 1, rarity: 'rare' });
    } else {
      // 普通奖励：从数据库读取配置
      const [commonRewards] = await conn.execute(
        'SELECT * FROM chest_common_rewards WHERE chest_id = ?',
        [chestId]
      );
      if (!commonRewards.length) throw new Error('箱子普通奖励未配置');

      let atLeastOneDropped = false;
      for (const rewardConfig of commonRewards) {
        const dropRoll = Math.random() * 100;
        if (dropRoll <= parseFloat(rewardConfig.drop_chance)) {
          const qty = rewardConfig.min_quantity + Math.floor(Math.random() * (rewardConfig.max_quantity - rewardConfig.min_quantity + 1));
          rewards.push({ item_name: rewardConfig.item_name, quantity: qty, rarity: 'normal' });
          atLeastOneDropped = true;
        }
      }
      // 保底
      if (!atLeastOneDropped && commonRewards.length > 0) {
        const first = commonRewards[0];
        const qty = first.min_quantity + Math.floor(Math.random() * (first.max_quantity - first.min_quantity + 1));
        rewards.push({ item_name: first.item_name, quantity: qty, rarity: 'normal' });
      }
    }

    // 写入开箱记录和仓库
    for (const reward of rewards) {
      await conn.execute(
        'INSERT INTO user_chest_records (user_id, chest_id, item_name, rarity) VALUES (?,?,?,?)',
        [req.userId, chestId, reward.item_name, reward.rarity]
      );
      await conn.execute(
        `INSERT INTO user_inventory (user_id, item_name, chest_id, rarity, quantity)
         VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
        [req.userId, reward.item_name, chestId, reward.rarity, reward.quantity]
      );
    }

    await recordOperation(conn, {
      eventKey: `chest_open:${openEventId}:completed`, actorUserId: req.userId,
      action: 'chest_opened', targetType: 'chest', targetRef: String(chestId)
    });

    const [ticketsAfter] = await conn.execute('SELECT chest_tickets FROM users WHERE id = ?', [req.userId]);

    await conn.commit();
    res.json({
      success: true,
      rewards,
      rarity,
      tickets: ticketsAfter[0].chest_tickets
    });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
});


// 获取个人仓库
app.get('/api/chest/inventory', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM user_inventory WHERE user_id = ? ORDER BY obtained_at DESC',
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});


// ==================== 开箱配置管理（管理员） ====================

// 保存箱子配置（整体更新：更新基本信息 + 替换奖池物品）
app.put('/api/admin/chest/configs/:id', adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, price, image, description, rare_items, common_rewards } = req.body;

  if (!name || price == null || !Array.isArray(rare_items) || rare_items.length === 0) {
    return res.status(400).json({ error: '名称、价格和至少一个稀有物品必填' });
  }
  if (!Array.isArray(common_rewards) || common_rewards.length === 0) {
    return res.status(400).json({ error: '至少需要配置一条普通奖励' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      'UPDATE chest_configs SET name = ?, price = ?, image = ?, description = ? WHERE id = ?',
      [name, price, image || null, description || '', id]
    );

    await conn.execute('DELETE FROM chest_items WHERE chest_id = ? AND rarity = ?', [id, 'rare']);
    for (const item of rare_items) {
      if (!item.item_name || !item.weight) continue;
      await conn.execute(
        'INSERT INTO chest_items (chest_id, rarity, item_name, weight) VALUES (?,?,?,?)',
        [id, 'rare', item.item_name, item.weight]
      );
    }

    await conn.execute('DELETE FROM chest_common_rewards WHERE chest_id = ?', [id]);
    for (const reward of common_rewards) {
      if (!reward.item_name) continue;
      await conn.execute(
        'INSERT INTO chest_common_rewards (chest_id, item_name, min_quantity, max_quantity, drop_chance) VALUES (?,?,?,?,?)',
        [id, reward.item_name, reward.min_quantity || 1, reward.max_quantity || 1, reward.drop_chance ?? 100]
      );
    }

    await conn.commit();
    res.json({ success: true, message: '箱子配置已更新' });
  } catch (err) {
    await conn.rollback();
    console.error('保存箱子配置失败:', err);
    res.status(500).json({ error: '服务器错误' });
  } finally {
    conn.release();
  }
});


app.get('/api/admin/chest/configs/:id', adminMiddleware, async (req, res) => {
  try {
    const [chestRows] = await pool.execute('SELECT * FROM chest_configs WHERE id = ?', [req.params.id]);
    if (!chestRows.length) return res.status(404).json({ error: '箱子不存在' });

    const [rareItems] = await pool.execute('SELECT * FROM chest_items WHERE chest_id = ? AND rarity = ?', [req.params.id, 'rare']);
    const [commonRewards] = await pool.execute('SELECT * FROM chest_common_rewards WHERE chest_id = ?', [req.params.id]);

    res.json({
      ...chestRows[0],
      rare_items: rareItems,
      common_rewards: commonRewards
    });
  } catch (err) {
    console.error('获取箱子配置失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});






// 支付宝异步通知
app.post('/api/chest/alipay/notify', async (req, res) => {
  if (!alipaySdk || !paymentConfig) {
    return res.status(503).send('fail');
  }

  try {
    const valid = await Promise.resolve(alipaySdk.checkNotifySign(req.body));
    if (!valid) {
      console.error('支付宝通知签名验证失败');
      return res.send('fail');
    }

    const result = await processTrackedRecharge({
      pool,
      notification: req.body,
      expectedAppId: paymentConfig.appId,
      expectedSellerId: paymentConfig.sellerId,
      ticketCredit: RECHARGE_TICKETS
    });
    console.info(
      `支付宝通知处理 outcome=${result.outcome} order=${maskTradeReference(req.body.out_trade_no)}`
    );
    res.send(result.acknowledge ? 'success' : 'fail');
  } catch (err) {
    console.error(`支付宝通知处理失败 code=${err.code || 'INTERNAL_ERROR'}`);
    res.send('fail');
  }
});
// ---------- 启动 ----------
const PORT = process.env.PORT || 3000;

function startServer(port = PORT) {
  return app.listen(port, () => {
    console.log(`🚀 后端服务运行在 http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
