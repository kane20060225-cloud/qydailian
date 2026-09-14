'use strict';

const mysql = require('mysql2/promise');

function requireEnvironmentVariables(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`缺少必要环境变量: ${missing.join(', ')}`);
  }
}

function pendingAgeMinutes() {
  const value = Number(process.env.PAYMENT_PENDING_MAX_AGE_MINUTES || 30);
  if (!Number.isInteger(value) || value < 5 || value > 1440) {
    throw new Error('PAYMENT_PENDING_MAX_AGE_MINUTES 必须是 5 到 1440 的整数');
  }
  return value;
}

async function assertB3Schema(connection) {
  const [rows] = await connection.execute(
    `SELECT COLUMN_NAME AS columnName
     FROM information_schema.columns
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payment_orders'
       AND COLUMN_NAME IN ('alipay_trade_no', 'paid_at', 'closed_at', 'updated_at')`,
    [process.env.DB_NAME]
  );
  if (new Set(rows.map((row) => row.columnName)).size !== 4) {
    throw new Error('payment_orders 尚未执行 B3 字段迁移');
  }
}

async function main() {
  if (process.argv[2] !== '--report') {
    console.error('拒绝执行：仅支持显式 --report 只读模式');
    process.exitCode = 2;
    return;
  }

  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
  requireEnvironmentVariables(['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']);
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    await assertB3Schema(connection);
    const maxAge = pendingAgeMinutes();
    const [rows] = await connection.execute(
      `SELECT
         COUNT(*) AS totalCount,
         SUM(status = 'pending') AS pendingCount,
         SUM(status = 'pending' AND created_at < NOW() - INTERVAL ? MINUTE) AS stalePendingCount,
         SUM(status = 'paid') AS paidCount,
         SUM(status = 'paid' AND alipay_trade_no IS NULL) AS paidMissingTradeNoCount,
         SUM(status = 'closed') AS closedCount,
         SUM(amount <> 6.00) AS unexpectedAmountCount
       FROM payment_orders`,
      [maxAge]
    );
    const report = rows[0];
    console.log(`支付订单总数: ${Number(report.totalCount || 0)}`);
    console.log(`pending: ${Number(report.pendingCount || 0)}`);
    console.log(`超过 ${maxAge} 分钟的 pending: ${Number(report.stalePendingCount || 0)}`);
    console.log(`paid: ${Number(report.paidCount || 0)}`);
    console.log(`paid 但缺少支付宝交易号: ${Number(report.paidMissingTradeNoCount || 0)}`);
    console.log(`closed: ${Number(report.closedCount || 0)}`);
    console.log(`金额不是 6.00 的订单: ${Number(report.unexpectedAmountCount || 0)}`);
    console.log('REPORT_ONLY=OK；未修改任何支付订单或用户券');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
