'use strict';

const mysql = require('mysql2/promise');
const { createFieldCipher, isEncryptedValue } = require('../lib/field-encryption');

const APPLY_CONFIRMATION = 'B2_ENCRYPT_EXISTING_CREDENTIALS';
const TARGETS = [
  {
    table: 'orders',
    accountContext: 'orders.game_account',
    passwordContext: 'orders.game_password'
  },
  {
    table: 'users',
    accountContext: 'users.game_account',
    passwordContext: 'users.game_password'
  }
];

function requireEnvironmentVariables(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`缺少必要环境变量: ${missing.join(', ')}`);
  }
}

function needsEncryption(value) {
  return value !== null && value !== '' && !isEncryptedValue(value);
}

async function assertExpandedColumns(connection) {
  const [columns] = await connection.execute(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, DATA_TYPE AS dataType
     FROM information_schema.columns
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME IN ('orders', 'users')
       AND COLUMN_NAME IN ('game_account', 'game_password')`,
    [process.env.DB_NAME]
  );

  const expanded = new Set(
    columns
      .filter((column) => ['text', 'mediumtext', 'longtext'].includes(column.dataType))
      .map((column) => `${column.tableName}.${column.columnName}`)
  );
  const required = [
    'orders.game_account',
    'orders.game_password',
    'users.game_account',
    'users.game_password'
  ];
  const missing = required.filter((column) => !expanded.has(column));
  if (missing.length > 0) {
    throw new Error(`敏感字段尚未扩容为 TEXT: ${missing.join(', ')}`);
  }
}

async function inspectTarget(connection, target) {
  const [rows] = await connection.execute(
    `SELECT id, game_account, game_password FROM ${target.table} ORDER BY id`
  );

  return {
    rows,
    accountCount: rows.filter((row) => needsEncryption(row.game_account)).length,
    passwordCount: rows.filter((row) => needsEncryption(row.game_password)).length
  };
}

async function applyTarget(connection, fieldCipher, target, rows) {
  let updatedCount = 0;

  for (const row of rows) {
    const shouldEncryptAccount = needsEncryption(row.game_account);
    const shouldEncryptPassword = needsEncryption(row.game_password);
    if (!shouldEncryptAccount && !shouldEncryptPassword) continue;

    const protectedAccount = shouldEncryptAccount
      ? fieldCipher.encrypt(row.game_account, target.accountContext)
      : row.game_account;
    const protectedPassword = shouldEncryptPassword
      ? fieldCipher.encrypt(row.game_password, target.passwordContext)
      : row.game_password;

    const [result] = await connection.execute(
      `UPDATE ${target.table}
       SET game_account = ?, game_password = ?
       WHERE id = ? AND game_account <=> ? AND game_password <=> ?`,
      [protectedAccount, protectedPassword, row.id, row.game_account, row.game_password]
    );

    if (result.affectedRows !== 1) {
      throw new Error(`${target.table} id=${row.id} 在迁移期间发生变化，已停止并回滚`);
    }
    updatedCount += 1;
  }

  return updatedCount;
}

async function main() {
  const mode = process.argv[2];
  if (!['--report', '--apply'].includes(mode)) {
    throw new Error('必须明确指定 --report 或 --apply；默认不会连接数据库');
  }
  if (mode === '--apply' && process.env.CONFIRM_DATA_MIGRATION !== APPLY_CONFIRMATION) {
    throw new Error(`执行迁移前必须设置 CONFIRM_DATA_MIGRATION=${APPLY_CONFIRMATION}`);
  }

  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

  requireEnvironmentVariables([
    'DATA_ENCRYPTION_KEY',
    'DB_HOST',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME'
  ]);

  const fieldCipher = createFieldCipher(process.env.DATA_ENCRYPTION_KEY);
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 1
  });
  let connection;

  try {
    connection = await pool.getConnection();
    await assertExpandedColumns(connection);
    const reports = [];
    for (const target of TARGETS) {
      reports.push({ target, ...(await inspectTarget(connection, target)) });
    }

    for (const report of reports) {
      console.log(
        `${report.target.table}: ${report.accountCount} 个账号字段、` +
        `${report.passwordCount} 个密码字段需要加密`
      );
    }

    if (mode === '--report') {
      console.log('REPORT_ONLY=OK；未修改任何数据');
      return;
    }

    await connection.beginTransaction();
    let updatedCount = 0;
    for (const report of reports) {
      updatedCount += await applyTarget(connection, fieldCipher, report.target, report.rows);
    }
    await connection.commit();
    console.log(`MIGRATION_APPLIED=OK；更新 ${updatedCount} 行`);
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`迁移失败: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { needsEncryption };
