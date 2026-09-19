'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { issueSessionToken } = require('../lib/auth-session');

Object.assign(process.env, {
  JWT_SECRET: 'game-news-http-test-jwt',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 12).toString('base64'),
  DB_HOST: '127.0.0.1', DB_USER: 'test', DB_PASSWORD: 'test', DB_NAME: 'test', ALIPAY_ENABLED: 'false'
});

let write;
const pool = { execute: async (sql, params = []) => {
  if (sql.startsWith('SELECT token_version')) return [[{ token_version: 0 }]];
  if (sql.startsWith('SELECT role')) return [[{ role: 'admin' }]];
  if (sql.startsWith('SELECT * FROM game_news')) return [[{
    id: 1, title: '社区赛事', content: '正文', category: 'community', summary: '摘要', created_at: '2026-09-19'
  }]];
  if (sql.startsWith('INSERT INTO game_news')) { write = { sql, params }; return [{ insertId: 2 }]; }
  throw new Error(sql);
} };
const original = mysql.createPool;
mysql.createPool = () => pool;
const { app } = require('../server');
mysql.createPool = original;

async function serve(t) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('public news returns categorized cards without caching API data', async t => {
  const base = await serve(t);
  const response = await fetch(`${base}/api/game-news`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json())[0].category, 'community');
});

test('admin news creation persists the card fields and rejects unsafe sources', async t => {
  const base = await serve(t);
  const headers = {
    Authorization: `Bearer ${issueSessionToken(7, 0, process.env.JWT_SECRET)}`,
    'Content-Type': 'application/json'
  };
  const response = await fetch(`${base}/api/admin/game-news`, {
    method: 'POST', headers, body: JSON.stringify({
      title: '赛事报名', content: '报名现已开放。', category: 'community', label: '赛事',
      summary: '参与社区挑战赛。', cover_url: '/uploads/event.webp', source_name: '官方',
      source_url: 'https://example.com/event', published_at: '2026-09-19T18:30', is_featured: true
    })
  });
  assert.equal(response.status, 200);
  assert.match(write.sql, /category, summary, cover_url, label, source_name, source_url, is_featured, published_at/);
  assert.deepEqual(write.params.slice(2, 10), [
    'community', '参与社区挑战赛。', '/uploads/event.webp', '赛事', '官方',
    'https://example.com/event', 1, '2026-09-19 18:30:00'
  ]);

  write = null;
  const invalid = await fetch(`${base}/api/admin/game-news`, {
    method: 'POST', headers, body: JSON.stringify({ title: '危险链接', content: '正文', source_url: 'javascript:alert(1)' })
  });
  assert.equal(invalid.status, 400);
  assert.equal(write, null);
});
