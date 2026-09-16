'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { loadMigration, runB6RentalMigration } = require('../lib/b6-rental-migration');

function fakeConnection() {
  const state = {
    columns: [
      ['rental_accounts', 'id', 'int'], ['rental_accounts', 'owner_id', 'int'],
      ['rental_accounts', 'status', "enum('pending','active','suspended')"],
      ['rental_accounts', 'created_at', 'timestamp'],
      ['rental_orders', 'account_id', 'int'], ['rental_orders', 'status', 'varchar(16)']
    ],
    indexes: [
      ['rental_accounts', 'PRIMARY', 1, 'id'],
      ['rental_accounts', 'owner_id', 1, 'owner_id'],
      ['rental_orders', 'account_id', 1, 'account_id']
    ],
    version: null, ddl: [], locked: false, failOnDdl: 0
  };
  const conn = {
    async execute(sql, params = []) {
      const q = sql.replace(/\s+/g, ' ').trim();
      if (q.startsWith('SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type FROM information_schema.columns')) {
        return [state.columns.map(([table_name, column_name, column_type]) =>
          ({ table_name, column_name, column_type }))];
      }
      if (q.startsWith('SELECT TABLE_NAME AS table_name, INDEX_NAME AS index_name, SEQ_IN_INDEX AS seq_in_index, COLUMN_NAME AS column_name FROM information_schema.statistics')) {
        return [state.indexes.map(([table_name, index_name, seq_in_index, column_name]) =>
          ({ table_name, index_name, seq_in_index, column_name }))];
      }
      if (q.startsWith('SELECT COUNT(*) AS total FROM information_schema.tables')) return [[{ total: 1 }]];
      if (q === 'SELECT checksum FROM schema_migrations WHERE version = ?') {
        return [state.version ? [{ checksum: state.version.checksum }] : []];
      }
      if (q === 'SELECT GET_LOCK(?, 10) AS acquired') {
        assert.equal(state.locked, false);
        state.locked = true;
        return [[{ acquired: 1 }]];
      }
      if (q === 'SELECT RELEASE_LOCK(?)') { state.locked = false; return [[{ released: 1 }]]; }
      if (q === 'INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)') {
        state.version = { version: params[0], checksum: params[1] };
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL: ${q}`);
    },
    async query(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      state.ddl.push(q);
      if (state.failOnDdl && state.ddl.length === state.failOnDdl) {
        throw new Error('synthetic DDL failure');
      }
      if (q.startsWith('ALTER TABLE rental_accounts ADD COLUMN deleted_at')) {
        state.columns.push(['rental_accounts', 'deleted_at', 'datetime']);
      } else {
        const match = /^CREATE INDEX (\w+) ON (\w+) \((.+)\)$/.exec(q);
        if (!match) throw new Error(`Unexpected DDL: ${q}`);
        match[3].split(',').map((column) => column.trim()).forEach((column, index) =>
          state.indexes.push([match[2], match[1], index + 1, column]));
      }
      return [{ affectedRows: 0 }];
    }
  };
  return { conn, state };
}

test('B6 rental migration contains only an additive column and reviewed indexes', () => {
  const migration = loadMigration();
  assert.equal(migration.statements.length, 4);
  assert.ok(migration.statements.every((statement) =>
    /^(ALTER TABLE .+ ADD COLUMN|CREATE INDEX)/.test(statement)));
  assert.equal(migration.statements.some((statement) => /\b(DROP|TRUNCATE|DELETE)\b/i.test(statement)), false);
});

test('plan does not run DDL; apply verifies schema and is idempotent', async () => {
  const { conn, state } = fakeConnection();
  const plan = await runB6RentalMigration(conn);
  assert.equal(plan.every((item) => item.status === 'pending'), true);
  assert.equal(state.ddl.length, 0);
  assert.equal(state.version, null);
  const applied = await runB6RentalMigration(conn, { apply: true });
  assert.equal(applied.every((item) => item.status === 'applied'), true);
  assert.equal(state.ddl.length, 4);
  assert.equal(state.version.version, loadMigration().version);
  await runB6RentalMigration(conn, { apply: true });
  assert.equal(state.ddl.length, 4);
  assert.equal(state.locked, false);
});

test('a partial additive migration may retry without repeating successful DDL', async () => {
  const { conn, state } = fakeConnection();
  state.failOnDdl = 2;
  await assert.rejects(runB6RentalMigration(conn, { apply: true }), /synthetic DDL failure/);
  assert.equal(state.version, null);
  assert.equal(state.columns.some((column) => column[1] === 'deleted_at'), true);
  state.failOnDdl = 0;
  await runB6RentalMigration(conn, { apply: true });
  assert.equal(state.ddl.filter((sql) => sql.startsWith('ALTER TABLE')).length, 1);
  assert.equal(state.version.version, loadMigration().version);
});

test('conflicting schema or checksum fails closed', async () => {
  const { conn, state } = fakeConnection();
  state.columns.push(['rental_accounts', 'deleted_at', 'varchar(8)']);
  await assert.rejects(runB6RentalMigration(conn), /Schema conflict/);
  state.columns.pop();
  state.version = { checksum: 'incorrect' };
  await assert.rejects(runB6RentalMigration(conn, { apply: true }), /checksum mismatch/);
  assert.equal(state.ddl.length, 0);
  assert.equal(state.locked, false);
});

test('B6 migration CLI refuses implicit apply before loading database configuration', () => {
  const script = path.join(__dirname, '..', 'scripts', 'migrate-b6-rental.js');
  for (const args of [[], ['--apply']]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      env: { PATH: process.env.PATH }, encoding: 'utf8'
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /after separate production approval/);
  }
});
