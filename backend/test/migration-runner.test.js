'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  parseMigration, loadMigrations, planMigrations, runMigrations
} = require('../lib/migration-runner');

test('B5 migration SQL is additive and contains only versioned tables', () => {
  const migrations = loadMigrations();
  assert.equal(migrations.length, 2);
  assert.deepEqual(migrations.map((migration) => migration.statements.length), [2, 3]);
  assert.ok(migrations.every((migration) => migration.checksum.length === 64));
  assert.throws(() => parseMigration('DROP TABLE users;'), /additive/);
  assert.throws(() => parseMigration('DELETE FROM users;'), /additive/);
});

test('plan mode does not create a migrations table or run DDL', async () => {
  const calls = [];
  const conn = {
    async execute(sql) {
      calls.push(sql);
      return [[{ count: 0 }]];
    },
    async query() { throw new Error('plan must be read-only'); }
  };
  assert.deepEqual(await runMigrations(conn), [
    { version: '20260915_b5_accounting', status: 'pending' },
    { version: '20260915_b5_workflows', status: 'pending' }
  ]);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /information_schema\.tables/);
});

test('apply holds a lock, records checksum and is idempotent', async () => {
  const migrations = loadMigrations();
  const migration = migrations[0];
  const calls = [];
  const versions = new Map();
  let currentTable = null;
  const columnsByTable = {
    account_ledger: { entry_key: 'varchar(128)', amount_delta: 'decimal(16,2)',
      balance_after: 'decimal(16,2)', user_id: 'int' },
    operation_audit: { event_key: 'varchar(128)', action: 'varchar(64)',
      target_ref: 'varchar(80)' },
    rental_order_workflow: { order_no: 'varchar(30)',
      payment_status: "enum('unpaid','submitted','paid','rejected')",
      owner_complete_requested_at: 'datetime' },
    third_party_order_finalization: { order_no: 'varchar(30)',
      final_status: "enum('completed')", finalized_by: 'int' },
    manual_payment_evidence: { business_ref: 'varchar(30)',
      filename: 'varchar(255)', expected_amount: 'decimal(10,2)',
      reviewer_user_id: 'int' }
  };
  const conn = {
    async query(sql) {
      calls.push(sql);
      currentTable = /^CREATE TABLE IF NOT EXISTS\s+(\w+)/i.exec(sql)?.[1] || currentTable;
      return [{}];
    },
    async execute(sql, params) {
      calls.push(sql);
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('information_schema.columns')) {
        return [Object.entries(columnsByTable[currentTable]).map(
          ([column_name, column_type]) => ({ column_name, column_type }))];
      }
      if (sql.includes('information_schema.statistics')) {
        const unique = currentTable === 'account_ledger' ? 'entry_key'
          : currentTable === 'operation_audit' ? 'event_key' : 'order_no';
        return [[{ column_name: unique, non_unique: 0 }]];
      }
      if (sql.startsWith('SELECT version')) {
        return [[...versions.entries()].map(([version, checksum]) => ({ version, checksum }))];
      }
      if (sql.startsWith('INSERT INTO schema_migrations')) {
        versions.set(params[0], params[1]);
        return [{ affectedRows: 1 }];
      }
      return [[{ count: 0 }]];
    }
  };
  assert.deepEqual(await runMigrations(conn, { apply: true }), [
    ...migrations.map(({ version }) => ({ version, status: 'applied' }))
  ]);
  assert.equal(versions.get(migration.version), migration.checksum);
  assert.equal(calls.filter((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS account_ledger')).length, 1);
  assert.equal(calls.filter((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS operation_audit')).length, 1);
  assert.match(calls.at(-1), /RELEASE_LOCK/);
  await runMigrations(conn, { apply: true });
  assert.equal(calls.filter((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS account_ledger')).length, 1);
});

test('checksum drift blocks an already-applied migration', () => {
  const migration = loadMigrations()[0];
  assert.throws(() => planMigrations([migration], new Map([[migration.version, '0'.repeat(64)]])),
    /checksum mismatch/);
});

test('an existing table with incompatible columns is not silently marked migrated', async () => {
  let inserted = false;
  const conn = {
    async query() { return [{}]; },
    async execute(sql) {
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.startsWith('SELECT version')) return [[]];
      if (sql.includes('information_schema.columns')) {
        return [[{ column_name: 'entry_key', column_type: 'varchar(10)' }]];
      }
      if (sql.startsWith('INSERT INTO schema_migrations')) inserted = true;
      return [[{}]];
    }
  };
  const migration = { version: 'conflict', checksum: 'a'.repeat(64),
    statements: ['CREATE TABLE IF NOT EXISTS account_ledger (entry_key VARCHAR(128))'] };
  await assert.rejects(runMigrations(conn, { apply: true, migrations: [migration] }),
    /schema conflict/);
  assert.equal(inserted, false);
});

test('CLI refuses implicit apply before loading database configuration', () => {
  const run = spawnSync(process.execPath, ['scripts/migrate-b5.js', '--apply'], {
    cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8',
    env: { PATH: process.env.PATH }
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /separate production approval/);
});
