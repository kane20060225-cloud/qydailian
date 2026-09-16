'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VERSION = '20260916_b8_third_party_workflow';
const LOCK_NAME = 'qydailian_b8_third_party_migration';
const SQL_FILE = path.join(__dirname, '..', 'migrations', `${VERSION}.sql`);
const EXPECTED = Object.freeze({
  third_party_order_workflow: {
    columns: {
      order_no: 'varchar(30)', external_order_no: 'varchar(80)', expected_at: 'datetime',
      rejection_reason: 'varchar(500)', completion_note: 'text',
      completion_return_reason: 'varchar(500)', payment_channel: 'varchar(30)',
      payment_reference: 'varchar(80)', payment_confirmed_by: 'int',
      payment_confirmed_at: 'datetime', revision_count: 'int unsigned',
      last_resubmitted_at: 'datetime', complete_requested_at: 'datetime'
    },
    indexes: {
      PRIMARY: ['order_no'],
      uq_tp_payment_reference: ['payment_channel', 'payment_reference'],
      idx_tp_workflow_expected: ['expected_at']
    }
  },
  third_party_order_events: {
    columns: {
      id: 'bigint unsigned', order_no: 'varchar(30)', event_type: 'varchar(40)',
      actor_user_id: 'int', note: 'varchar(500)'
    },
    indexes: { PRIMARY: ['id'], idx_tp_events_order_created: ['order_no', 'created_at', 'id'] }
  }
});

function loadB8Migration() {
  const sql = fs.readFileSync(SQL_FILE, 'utf8').replace(/\r\n/g, '\n');
  const statements = sql.split('\n').filter((line) => !line.trimStart().startsWith('--'))
    .join('\n').split(';').map((part) => part.trim()).filter(Boolean);
  if (statements.length !== 2 || statements.some((statement) =>
    !/^CREATE TABLE IF NOT EXISTS (third_party_order_workflow|third_party_order_events)\s*\(/i.test(statement))) {
    throw new Error('B8 migration must contain only the two reviewed additive tables');
  }
  return { version: VERSION, statements, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
}

async function readB8Schema(conn) {
  const tableNames = Object.keys(EXPECTED);
  const [versionTables] = await conn.execute(
    `SELECT COUNT(*) AS total FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'`
  );
  if (Number(versionTables[0]?.total) !== 1) throw new Error('B5 schema_migrations is required before B8');
  const [versions] = await conn.execute('SELECT checksum FROM schema_migrations WHERE version=?', [VERSION]);
  const [tables] = await conn.execute(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name IN (?,?)`, tableNames
  );
  const present = new Set(tables.map((row) => row.table_name));
  for (const table of present) {
    const [columns] = await conn.execute(
      `SELECT column_name, column_type FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ?`, [table]
    );
    const foundColumns = new Map(columns.map((row) => [row.column_name, row.column_type.toLowerCase()]));
    for (const [name, type] of Object.entries(EXPECTED[table].columns)) {
      if (foundColumns.get(name) !== type) throw new Error(`B8 schema conflict: ${table}.${name}`);
    }
    const [indexes] = await conn.execute(
      `SELECT index_name, seq_in_index, column_name FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ?`, [table]
    );
    for (const [indexName, expectedColumns] of Object.entries(EXPECTED[table].indexes)) {
      const actual = indexes.filter((row) => row.index_name === indexName)
        .sort((a, b) => Number(a.seq_in_index) - Number(b.seq_in_index)).map((row) => row.column_name);
      if (actual.join(',') !== expectedColumns.join(',')) throw new Error(`B8 index conflict: ${table}.${indexName}`);
    }
  }
  return {
    plan: tableNames.map((name) => ({ name, status: present.has(name) ? 'applied' : 'pending' })),
    storedChecksum: versions[0]?.checksum || null
  };
}

async function runB8Migration(conn, { apply = false } = {}) {
  const migration = loadB8Migration();
  const checkState = (state) => {
    if (state.storedChecksum && state.storedChecksum !== migration.checksum) throw new Error('B8 migration checksum mismatch');
    if (state.storedChecksum && state.plan.some((item) => item.status !== 'applied')) {
      throw new Error('B8 migration was recorded but its schema is incomplete');
    }
  };
  if (!apply) {
    const state = await readB8Schema(conn);
    checkState(state);
    return state.plan;
  }
  const [locks] = await conn.execute('SELECT GET_LOCK(?,10) AS acquired', [LOCK_NAME]);
  if (Number(locks[0]?.acquired) !== 1) throw new Error('Could not acquire B8 migration lock');
  try {
    const state = await readB8Schema(conn);
    checkState(state);
    for (const statement of migration.statements) await conn.query(statement);
    const verified = await readB8Schema(conn);
    if (verified.plan.some((item) => item.status !== 'applied')) throw new Error('B8 schema verification failed');
    if (!state.storedChecksum) {
      await conn.execute('INSERT INTO schema_migrations (version,checksum) VALUES (?,?)',
        [migration.version, migration.checksum]);
    }
    return verified.plan;
  } finally { await conn.execute('SELECT RELEASE_LOCK(?)', [LOCK_NAME]); }
}

module.exports = { loadB8Migration, readB8Schema, runB8Migration };
