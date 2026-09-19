'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { COLUMNS, INDEX_NAME, SEEDS, runMigration } = require('../lib/b38-game-news-migration');

test('B38 plan is read-only and apply only adds game-news fields and index', async () => {
  const columns = new Set(['id', 'title', 'content', 'created_at', 'updated_at']);
  let hasIndex = false;
  const seedUrls = new Set();
  let locked = false;
  let writes = 0;
  const conn = { execute: async (sql, params = []) => {
    if (sql.includes('information_schema.tables')) return [[{ total: 1 }]];
    if (sql.includes('information_schema.columns')) return [[...columns].map(column_name => ({ column_name }))];
    if (sql.includes('information_schema.statistics')) return [hasIndex ? [{ index_name: INDEX_NAME }] : []];
    if (sql.startsWith('SELECT source_url FROM game_news')) {
      return [[...seedUrls].map(source_url => ({ source_url }))];
    }
    if (sql.startsWith('SELECT GET_LOCK')) { locked = true; return [[{ acquired: 1 }]]; }
    if (sql.startsWith('SELECT RELEASE_LOCK')) { locked = false; return [[]]; }
    if (sql.startsWith('ALTER TABLE game_news ADD COLUMN')) {
      const name = /^ALTER TABLE game_news ADD COLUMN (\w+)/.exec(sql)[1];
      assert.ok(Object.hasOwn(COLUMNS, name));
      columns.add(name);
      writes++;
      return [{}];
    }
    if (sql.startsWith('UPDATE game_news SET published_at')) { writes++; return [{ affectedRows: 0 }]; }
    if (sql.startsWith('CREATE INDEX')) { hasIndex = true; writes++; return [{}]; }
    if (sql.startsWith('INSERT INTO game_news')) {
      seedUrls.add(params[4]);
      writes++;
      return [{ affectedRows: 1 }];
    }
    throw new Error(`${sql} ${params}`);
  } };

  const preview = await runMigration(conn);
  assert.equal(preview.filter(item => item.status === 'pending').length, Object.keys(COLUMNS).length + 1 + SEEDS.length);
  assert.equal(writes, 0);
  const applied = await runMigration(conn, { apply: true });
  assert.equal(applied.every(item => item.status === 'applied'), true);
  assert.equal(locked, false);
  assert.equal(writes, Object.keys(COLUMNS).length + 2 + SEEDS.length);
});

test('B38 CLI requires an explicit additive-migration confirmation', () => {
  const cli = path.join(__dirname, '..', 'scripts', 'migrate-b38-game-news.js');
  for (const args of [[], ['--apply', '--confirm=wrong']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2);
  }
});
