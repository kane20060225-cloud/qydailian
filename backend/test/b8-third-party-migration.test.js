'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadB8Migration } = require('../lib/b8-third-party-migration');

test('B8 migration contains only the reviewed additive workflow tables', () => {
  const migration = loadB8Migration();
  assert.equal(migration.statements.length, 2);
  for (const statement of migration.statements) assert.match(statement, /^CREATE TABLE IF NOT EXISTS/);
  assert.match(migration.statements[0], /uq_tp_payment_reference/);
  assert.match(migration.statements[1], /idx_tp_events_order_created/);
});

test('B8 migration CLI refuses implicit execution', () => {
  const result = spawnSync(process.execPath,
    [path.join(__dirname, '..', 'scripts', 'migrate-b8-third-party.js')], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Use --plan/);
});
