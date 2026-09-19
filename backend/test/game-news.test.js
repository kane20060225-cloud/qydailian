'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const backendNews = require('../lib/game-news');
const uiNews = require('../../public/game-news');

const publicDir = path.join(__dirname, '..', '..', 'public');

test('legacy news remains visible as in-game content with a generated summary', () => {
  const item = uiNews.normalizeNews({
    id: 4,
    title: '版本更新',
    content: '新版本已经开放。\n![战斗截图](/uploads/news.png)',
    created_at: '2026-09-19 08:00:00'
  });
  assert.equal(item.category, 'in_game');
  assert.equal(item.summary, '新版本已经开放。');
  assert.equal(item.cover_url, '');
});

test('news categories are separated and priority cards stay deterministic', () => {
  const rows = [
    { id: 1, title: '旧资讯', content: 'a', category: 'in_game', published_at: '2026-09-17T00:00:00Z' },
    { id: 2, title: '赛事', content: 'b', category: 'community', published_at: '2026-09-19T00:00:00Z' },
    { id: 3, title: '重点更新', content: 'c', category: 'in_game', is_featured: 1, published_at: '2026-09-16T00:00:00Z' },
    { id: 4, title: '新资讯', content: 'd', category: 'in_game', published_at: '2026-09-18T00:00:00Z' }
  ];
  const inGame = uiNews.selectCardGroups(rows, 'in_game');
  assert.deepEqual(inGame.featured.map(item => item.id), [3, 4]);
  assert.deepEqual(inGame.standard.map(item => item.id), [1]);
  assert.deepEqual(uiNews.selectCardGroups(rows, 'community').featured.map(item => item.id), [2]);
});

test('news URLs only allow web sources and safe local media', () => {
  assert.equal(uiNews.safeMediaUrl('/uploads/cover.png'), '/uploads/cover.png');
  assert.equal(uiNews.safeMediaUrl('javascript:alert(1)'), '');
  assert.equal(uiNews.safeSourceUrl('data:text/html,bad'), '');
  assert.throws(() => backendNews.normalizeGameNewsInput({
    title: '资讯', content: '正文', source_url: 'javascript:alert(1)'
  }), /HTTP/);
});

test('admin input normalizes card metadata and local publish time', () => {
  const item = backendNews.normalizeGameNewsInput({
    title: ' 社区赛事 ',
    content: '赛事将在周末开始。',
    category: 'community',
    cover_url: '/uploads/event.webp',
    source_name: '官方',
    source_url: 'https://example.com/news',
    published_at: '2026-09-19T18:30',
    is_featured: true
  });
  assert.equal(item.category, 'community');
  assert.equal(item.label, '社区与赛事');
  assert.equal(item.summary, '赛事将在周末开始。');
  assert.equal(item.published_at, '2026-09-19 18:30:00');
  assert.equal(item.is_featured, 1);
});

test('game-news UI stays isolated and exposes both sections and the detail view', () => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(publicDir, 'game-news.css'), 'utf8');
  const script = fs.readFileSync(path.join(publicDir, 'script.js'), 'utf8');
  assert.match(html, /data-news-category="in_game"[\s\S]*data-news-category="community"/);
  assert.match(html, /id="gameNewsDetailModal"/);
  assert.match(css, /\.game-news-featured-grid[\s\S]*\.game-news-standard-grid/);
  assert.match(script, /GameNewsUI\.render\(document, container, tabs, news\)/);
});
