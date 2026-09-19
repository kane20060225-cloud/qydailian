'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const files = require('../scripts/b38-release-files.cjs');

const scripts = path.join(__dirname, '..', 'scripts');

test('B38 release contains only reviewed news runtime files', () => {
  assert.deepEqual(files, [
    'backend/server.js', 'backend/package.json', 'backend/lib/game-news.js',
    'backend/lib/b38-game-news-migration.js', 'backend/migrations/20260919_b38_game_news_hub.sql',
    'backend/scripts/migrate-b38-game-news.js', 'public/index.html', 'public/script.js',
    'public/service-worker.js', 'public/game-news.css', 'public/game-news.js'
  ]);
  assert.equal(files.some(file => /\.env|node_modules|artifacts/.test(file)), false);
});

test('B38 production tool backs up the database before applying the additive migration and can restore runtime', () => {
  const deploy = fs.readFileSync(path.join(scripts, 'deploy-b38-release.cjs'), 'utf8');
  const backup = deploy.indexOf("database-before.sql");
  const apply = deploy.indexOf("runMigration(production, { apply: true })");
  assert.ok(backup > 0 && apply > backup);
  assert.match(deploy, /runtime-before\.tar/);
  assert.match(deploy, /B38 runtime rollback completed/);
  assert.match(deploy, /assert\.equal\(hash\(fs\.readFileSync\(site \+ '\/backend\/\.env'\)\), before\.env_sha256\)/);
  const rollback = fs.readFileSync(path.join(scripts, 'rollback-b38-release.cjs'), 'utf8');
  assert.match(rollback, /Later runtime change/);
  assert.match(rollback, /database_unchanged: true/);
});
