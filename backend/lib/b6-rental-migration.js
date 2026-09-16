'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VERSION = '20260916_b6_rental_soft_delete';
const LOCK_NAME = 'qydailian_b6_rental_migration';
const SQL_FILE = path.join(__dirname, '..', 'migrations', `${VERSION}.sql`);
const EXPECTED = Object.freeze([
  { kind: 'column', table: 'rental_accounts', name: 'deleted_at', type: 'datetime' },
  { kind: 'index', table: 'rental_accounts', name: 'idx_rental_accounts_visibility_created',
    columns: ['deleted_at', 'status', 'created_at', 'id'] },
  { kind: 'index', table: 'rental_accounts', name: 'idx_rental_accounts_owner_visibility_created',
    columns: ['owner_id', 'deleted_at', 'created_at', 'id'] },
  { kind: 'index', table: 'rental_orders', name: 'idx_rental_orders_account_status',
    columns: ['account_id', 'status'] }
]);

function loadMigration() {
  const sql = fs.readFileSync(SQL_FILE, 'utf8').replace(/\r\n/g, '\n');
  const statements = sql.split('\n').filter((line) => !line.trimStart().startsWith('--'))
    .join('\n').split(';').map((part) => part.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  if (statements.length !== EXPECTED.length ||
      !/^ALTER TABLE rental_accounts ADD COLUMN deleted_at DATETIME NULL$/i.test(statements[0]) ||
      !/^CREATE INDEX idx_rental_accounts_visibility_created ON rental_accounts \(deleted_at, status, created_at, id\)$/i.test(statements[1]) ||
      !/^CREATE INDEX idx_rental_accounts_owner_visibility_created ON rental_accounts \(owner_id, deleted_at, created_at, id\)$/i.test(statements[2]) ||
      !/^CREATE INDEX idx_rental_orders_account_status ON rental_orders \(account_id, status\)$/i.test(statements[3])) {
    throw new Error('B6 migration must contain only the reviewed additive column and indexes');
  }
  return { version: VERSION, statements,
    checksum: crypto.createHash('sha256').update(sql).digest('hex') };
}

async function readSchema(conn) {
  const [columns] = await conn.execute(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name,
            COLUMN_TYPE AS column_type FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name IN ('rental_accounts', 'rental_orders')`
  );
  const [indexes] = await conn.execute(
    `SELECT TABLE_NAME AS table_name, INDEX_NAME AS index_name,
            SEQ_IN_INDEX AS seq_in_index, COLUMN_NAME AS column_name
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name IN ('rental_accounts', 'rental_orders')`
  );
  const [versionTables] = await conn.execute(
    `SELECT COUNT(*) AS total FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'`
  );
  if (Number(versionTables[0]?.total) !== 1) {
    throw new Error('B5 schema_migrations is required before B6');
  }
  const [versions] = await conn.execute(
    'SELECT checksum FROM schema_migrations WHERE version = ?', [VERSION]
  );
  const foundColumns = new Map(columns.map((row) =>
    [`${row.table_name}.${row.column_name}`, row.column_type.toLowerCase()]));
  for (const column of ['rental_accounts.id', 'rental_accounts.owner_id',
    'rental_accounts.status', 'rental_accounts.created_at',
    'rental_orders.account_id', 'rental_orders.status']) {
    if (!foundColumns.has(column)) throw new Error(`Missing prerequisite: ${column}`);
  }
  const foundIndexes = new Map();
  for (const row of indexes) {
    const key = `${row.table_name}.${row.index_name}`;
    if (!foundIndexes.has(key)) foundIndexes.set(key, []);
    foundIndexes.get(key).push([Number(row.seq_in_index), row.column_name]);
  }
  const plan = EXPECTED.map((item) => {
    const key = `${item.table}.${item.name}`;
    if (item.kind === 'column') {
      const found = foundColumns.get(key);
      if (found && found !== item.type) throw new Error(`Schema conflict: ${key}`);
      return { name: key, status: found ? 'applied' : 'pending' };
    }
    const found = foundIndexes.get(key);
    if (found) {
      const actual = found.sort((a, b) => a[0] - b[0]).map(([, column]) => column);
      if (actual.join(',') !== item.columns.join(',')) throw new Error(`Index conflict: ${key}`);
    }
    return { name: key, status: found ? 'applied' : 'pending' };
  });
  return { plan, storedChecksum: versions[0]?.checksum || null };
}

async function runB6RentalMigration(conn, { apply = false } = {}) {
  const migration = loadMigration();
  if (!apply) {
    const state = await readSchema(conn);
    if (state.storedChecksum && state.storedChecksum !== migration.checksum) {
      throw new Error('B6 migration checksum mismatch');
    }
    if (state.storedChecksum && state.plan.some((item) => item.status !== 'applied')) {
      throw new Error('B6 migration was recorded but its schema is incomplete');
    }
    return state.plan;
  }
  const [locks] = await conn.execute('SELECT GET_LOCK(?, 10) AS acquired', [LOCK_NAME]);
  if (Number(locks[0]?.acquired) !== 1) throw new Error('Could not acquire B6 migration lock');
  try {
    const state = await readSchema(conn);
    if (state.storedChecksum && state.storedChecksum !== migration.checksum) {
      throw new Error('B6 migration checksum mismatch');
    }
    if (state.storedChecksum && state.plan.some((item) => item.status !== 'applied')) {
      throw new Error('B6 migration was recorded but its schema is incomplete');
    }
    for (const [index, item] of state.plan.entries()) {
      if (item.status === 'pending') await conn.query(migration.statements[index]);
    }
    const verified = await readSchema(conn);
    if (verified.plan.some((item) => item.status !== 'applied')) {
      throw new Error('B6 schema verification failed after additive DDL');
    }
    if (!state.storedChecksum) {
      await conn.execute('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)',
        [migration.version, migration.checksum]);
    }
    return verified.plan;
  } finally {
    await conn.execute('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

module.exports = { loadMigration, runB6RentalMigration };
