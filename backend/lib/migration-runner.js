'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATION_DIR = path.join(__dirname, '..', 'migrations');
const B5_FILES = ['20260915_b5_accounting.sql', '20260915_b5_workflows.sql'];
const MIGRATION_LOCK = 'qydailian_b5_migrations';
const REQUIRED_SCHEMA = Object.freeze({
  account_ledger: { columns: {
    entry_key: 'varchar(128)', amount_delta: 'decimal(16,2)',
    balance_after: 'decimal(16,2)', user_id: 'int'
  }, unique: 'entry_key' },
  operation_audit: { columns: {
    event_key: 'varchar(128)', action: 'varchar(64)', target_ref: 'varchar(80)'
  }, unique: 'event_key' },
  rental_order_workflow: { columns: {
    order_no: 'varchar(30)',
    payment_status: "enum('unpaid','submitted','paid','rejected')",
    owner_complete_requested_at: 'datetime'
  }, unique: 'order_no' },
  third_party_order_finalization: { columns: {
    order_no: 'varchar(30)', final_status: "enum('completed')", finalized_by: 'int'
  }, unique: 'order_no' },
  manual_payment_evidence: { columns: {
    business_ref: 'varchar(30)', filename: 'varchar(255)',
    expected_amount: 'decimal(10,2)', reviewer_user_id: 'int'
  } }
});

function parseMigration(sql) {
  const withoutComments = sql.split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  const statements = withoutComments.split(';').map((part) => part.trim()).filter(Boolean);
  if (statements.some((statement) => !/^CREATE TABLE IF NOT EXISTS\s+/i.test(statement))) {
    throw new Error('B5 migrations must contain additive CREATE TABLE statements only');
  }
  return statements;
}

function loadMigrations() {
  return B5_FILES.map((file) => {
    const sql = fs.readFileSync(path.join(MIGRATION_DIR, file), 'utf8');
    return {
      version: file.replace(/\.sql$/, ''),
      checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      statements: parseMigration(sql)
    };
  });
}

async function existingVersions(conn, { createVersionTable = false } = {}) {
  if (createVersionTable) {
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(80) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } else {
    const [tables] = await conn.execute(
      `SELECT COUNT(*) AS count FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'`
    );
    if (Number(tables[0].count) === 0) return new Map();
  }
  const [rows] = await conn.execute('SELECT version, checksum FROM schema_migrations');
  return new Map(rows.map(({ version, checksum }) => [version, checksum]));
}

function planMigrations(migrations, existing) {
  return migrations.map((migration) => {
    const appliedChecksum = existing.get(migration.version);
    if (appliedChecksum && appliedChecksum !== migration.checksum) {
      throw new Error(`Migration checksum mismatch: ${migration.version}`);
    }
    return { version: migration.version, status: appliedChecksum ? 'applied' : 'pending' };
  });
}

async function verifyTableSchema(conn, statement) {
  const table = /^CREATE TABLE IF NOT EXISTS\s+(\w+)/i.exec(statement)?.[1];
  const expected = REQUIRED_SCHEMA[table];
  if (!expected) throw new Error(`No schema verification for migration table: ${table}`);
  const [columns] = await conn.execute(
    `SELECT column_name, column_type FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?`, [table]
  );
  const found = new Map(columns.map((row) =>
    [row.column_name, row.column_type.toLowerCase()]));
  for (const [column, type] of Object.entries(expected.columns)) {
    if (found.get(column) !== type) {
      throw new Error(`Migration schema conflict: ${table}.${column}`);
    }
  }
  if (expected.unique) {
    const [indexes] = await conn.execute(
      `SELECT column_name, non_unique FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ?`, [table]
    );
    if (!indexes.some((index) => index.column_name === expected.unique &&
        Number(index.non_unique) === 0)) {
      throw new Error(`Migration unique constraint conflict: ${table}.${expected.unique}`);
    }
  }
}

async function runMigrations(conn, { apply = false, migrations = loadMigrations() } = {}) {
  if (!apply) return planMigrations(migrations, await existingVersions(conn));
  const [lockRows] = await conn.execute('SELECT GET_LOCK(?, 10) AS acquired', [MIGRATION_LOCK]);
  if (Number(lockRows[0].acquired) !== 1) throw new Error('Could not acquire migration lock');
  try {
    const existing = await existingVersions(conn, { createVersionTable: true });
    const plan = planMigrations(migrations, existing);
    for (const migration of migrations) {
      if (existing.has(migration.version)) continue;
      for (const statement of migration.statements) {
        await conn.query(statement);
        await verifyTableSchema(conn, statement);
      }
      await conn.execute(
        'INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)',
        [migration.version, migration.checksum]
      );
    }
    return plan.map((item) => ({ ...item, status: 'applied' }));
  } finally {
    await conn.execute('SELECT RELEASE_LOCK(?)', [MIGRATION_LOCK]);
  }
}

module.exports = { parseMigration, loadMigrations, planMigrations, runMigrations };
