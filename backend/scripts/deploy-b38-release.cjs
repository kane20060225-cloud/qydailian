'use strict';

// Protected B38 production release: isolated migration verification, private backups,
// additive production migration, atomic runtime replacement and read-only public checks.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = __dirname;
const site = '/var/www/your-site';
const origin = 'https://wotbqydailian.vip';
const allowed = require('./allowed.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const contentHash = bytes => hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));
const run = (name, args) => cp.execFileSync(name, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const get = route => fetch(origin + route, { signal: AbortSignal.timeout(15000), redirect: 'error' });
function atomic(relative, bytes, mode) {
  assert.ok(allowed.includes(relative));
  const target = path.join(site, relative), temporary = target + '.b38.tmp';
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temporary, bytes, { mode });
  fs.chmodSync(temporary, mode);
  fs.renameSync(temporary, target);
}
async function healthy(port) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) })).status === 200) return;
    } catch (_) { /* retry while PM2 restarts */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Backend health timeout');
}

(async () => {
  const manifest = JSON.parse(fs.readFileSync(root + '/manifest.json'));
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  assert.equal(root, '/root/' + manifest.release);
  assert.deepEqual(manifest.files.map(file => file.path), allowed);
  assert.equal(hash(fs.readFileSync(root + '/runtime.tar')), manifest.archive_sha256);
  assert.ok(!fs.existsSync(root + '/before.json'), 'Release already started; inspect before retrying');

  const processInfo = JSON.parse(run('pm2', ['jlist'])).find(item => item.name === 'my-backend');
  assert.ok(processInfo && processInfo.pm2_env.status === 'online');
  assert.equal(processInfo.pm2_env.pm_exec_path, site + '/backend/server.js');
  const dotenv = require(site + '/backend/node_modules/dotenv');
  const cfg = dotenv.parse(fs.readFileSync(site + '/backend/.env'));
  assert.equal(cfg.DB_NAME, 'wotbqydailian');
  const port = Number(processInfo.pm2_env.PORT || cfg.PORT || 3000);
  assert.equal(port, 3000);
  const before = {
    env_sha256: hash(fs.readFileSync(site + '/backend/.env')),
    pid: processInfo.pid,
    git_head: run('git', ['-C', site, 'rev-parse', 'HEAD']).toString().trim(),
    existing: [], modes: {}, backups: {}, database: {}
  };
  assert.equal((await get('/api/health')).status, 200);
  for (const file of manifest.files) {
    const target = site + '/' + file.path;
    if (fs.existsSync(target)) {
      assert.ok(file.baseline, 'Unexpected existing file: ' + file.path);
      assert.equal(contentHash(fs.readFileSync(target)), file.baseline, 'Production baseline changed: ' + file.path);
      before.existing.push(file.path);
      before.modes[file.path] = fs.statSync(target).mode & 0o777;
    } else assert.equal(file.baseline, null, 'Missing baseline file: ' + file.path);
  }

  fs.mkdirSync(root + '/backup', { mode: 0o700, recursive: true });
  run('tar', ['-czf', root + '/backup/public-before.tar.gz', '-C', site, 'public']);
  run('tar', ['-cf', root + '/backup/runtime-before.tar', '-C', site, ...before.existing]);
  fs.mkdirSync(root + '/code', { mode: 0o700, recursive: true });
  assert.deepEqual(run('tar', ['-tf', root + '/runtime.tar']).toString().trim().split('\n').filter(name => !name.endsWith('/')).sort(), [...allowed].sort());
  run('tar', ['-xf', root + '/runtime.tar', '-C', root + '/code']);
  for (const file of manifest.files) assert.equal(contentHash(fs.readFileSync(root + '/code/' + file.path)), file.sha256);
  for (const name of ['backend/server.js', 'backend/lib/game-news.js', 'backend/lib/b38-game-news-migration.js', 'public/script.js', 'public/game-news.js', 'public/service-worker.js']) {
    run('node', ['--check', root + '/code/' + name]);
  }

  process.env.NODE_PATH = site + '/backend/node_modules';
  require('module').Module._initPaths();
  const mysql = require('mysql2/promise');
  const dbOptions = { host: cfg.DB_HOST, port: Number(cfg.DB_PORT || 3306), user: cfg.DB_USER,
    password: cfg.DB_PASSWORD, database: cfg.DB_NAME, decimalNumbers: true };
  const migrationModule = require(root + '/code/backend/lib/b38-game-news-migration');
  const scratch = 'b38_verify_' + manifest.commit.slice(0, 10);
  run('mysql', ['--login-path=b4deploy', '-e', 'CREATE DATABASE ' + scratch + ' CHARACTER SET utf8mb4']);
  let isolatedChecks;
  try {
    const schema = run('mysqldump', ['--login-path=b4deploy', '--no-tablespaces', '--no-data', '--skip-triggers', cfg.DB_NAME, 'game_news']);
    const isolated = await mysql.createConnection({ ...dbOptions, database: scratch, multipleStatements: true });
    try {
      await isolated.query(schema.toString('utf8'));
      await isolated.execute("INSERT INTO game_news (title,content) VALUES ('Legacy news','Legacy body')");
      const first = await migrationModule.runMigration(isolated, { apply: true });
      assert.ok(first.every(item => item.status === 'applied'), JSON.stringify(first));
      const second = await migrationModule.runMigration(isolated, { apply: true });
      assert.ok(second.every(item => item.status === 'applied'), JSON.stringify(second));
      const [rows] = await isolated.execute('SELECT title,category,source_url FROM game_news ORDER BY id');
      assert.equal(rows.length, 3);
      assert.equal(rows[0].category, 'in_game');
      assert.deepEqual(new Set(rows.slice(1).map(row => row.source_url)), new Set(migrationModule.SEEDS.map(seed => seed.source_url)));
      isolatedChecks = { legacy_preserved: true, seeded_news: migrationModule.SEEDS.length, idempotent: true };
    } finally { await isolated.end(); }
  } finally {
    run('mysql', ['--login-path=b4deploy', '-e', 'DROP DATABASE ' + scratch]);
  }

  // A complete private database backup is required before any production DDL or seed insert.
  const sql = root + '/backup/database-before.sql', gz = sql + '.gz';
  const sqlFd = fs.openSync(sql, 'wx', 0o600);
  try {
    cp.execFileSync('mysqldump', ['--login-path=b4deploy', '--no-tablespaces', '--single-transaction', '--routines', '--events', '--triggers', '--databases', cfg.DB_NAME], { stdio: ['ignore', sqlFd, 'pipe'] });
  } finally { fs.closeSync(sqlFd); }
  const inFd = fs.openSync(sql, 'r'), outFd = fs.openSync(gz, 'wx', 0o600);
  try { cp.execFileSync('gzip', ['-c'], { stdio: [inFd, outFd, 'pipe'] }); }
  finally { fs.closeSync(inFd); fs.closeSync(outFd); }
  assert.ok(fs.statSync(gz).size > 100);
  fs.unlinkSync(sql);
  for (const name of ['public-before.tar.gz', 'runtime-before.tar', 'database-before.sql.gz']) {
    fs.chmodSync(root + '/backup/' + name, 0o600);
    const bytes = fs.readFileSync(root + '/backup/' + name);
    before.backups[name] = { bytes: bytes.length, sha256: hash(bytes) };
  }

  const production = await mysql.createConnection(dbOptions);
  let migrationPlan, migrationResult;
  try {
    const [counts] = await production.execute('SELECT COUNT(*) AS total FROM game_news');
    before.database.game_news_rows = Number(counts[0].total);
    const placeholders = migrationModule.SEEDS.map(() => '?').join(',');
    const [existingSeeds] = await production.execute(`SELECT source_url FROM game_news WHERE source_url IN (${placeholders})`, migrationModule.SEEDS.map(seed => seed.source_url)).catch(error => {
      if (error.code === 'ER_BAD_FIELD_ERROR') return [[]];
      throw error;
    });
    before.database.existing_seed_urls = existingSeeds.map(row => row.source_url);
    migrationPlan = await migrationModule.runMigration(production);
    migrationResult = await migrationModule.runMigration(production, { apply: true });
    assert.ok(migrationResult.every(item => item.status === 'applied'));
    const [afterRows] = await production.execute('SELECT COUNT(*) AS total FROM game_news');
    assert.equal(Number(afterRows[0].total), before.database.game_news_rows + migrationModule.SEEDS.length - before.database.existing_seed_urls.length);
  } finally { await production.end(); }
  fs.writeFileSync(root + '/before.json', JSON.stringify(before, null, 2), { mode: 0o600 });

  const order = [...manifest.files.filter(file => file.path !== 'public/index.html'), manifest.files.find(file => file.path === 'public/index.html')];
  let changed = false, verified = false;
  try {
    changed = true;
    for (const file of order) atomic(file.path, fs.readFileSync(root + '/code/' + file.path), before.modes[file.path] || 0o644);
    run('pm2', ['restart', 'my-backend']);
    await healthy(port);

    const newsResponse = await get('/api/game-news?verify=' + manifest.commit);
    assert.equal(newsResponse.status, 200);
    assert.equal(newsResponse.headers.get('cache-control'), 'no-store');
    const news = await newsResponse.json();
    assert.ok(Array.isArray(news));
    for (const seed of migrationModule.SEEDS) assert.ok(news.some(item => item.source_url === seed.source_url && item.category === 'community'));
    assert.equal((await get('/api/admin/game-news')).status, 401);
    const page = await get('/?verify=' + manifest.commit);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /game-news\.css\?v=20260919-b38/);
    for (const asset of ['/game-news.css', '/game-news.js', '/service-worker.js']) assert.equal((await get(asset + '?verify=' + manifest.commit)).status, 200);
    for (const file of manifest.files) assert.equal(contentHash(fs.readFileSync(site + '/' + file.path)), file.sha256);
    assert.equal(hash(fs.readFileSync(site + '/backend/.env')), before.env_sha256);
    assert.equal(run('git', ['-C', site, 'rev-parse', 'HEAD']).toString().trim(), before.git_head);
    const result = {
      commit: manifest.commit,
      baseline_commit: manifest.baseline_commit,
      release: root,
      backend_restarted: true,
      database_migrations: migrationResult.map(item => item.name),
      migration_plan: migrationPlan,
      isolated_checks: isolatedChecks,
      seeded_news: migrationModule.SEEDS.map(seed => seed.source_url),
      health_status: (await get('/api/health')).status,
      anonymous_admin_status: 401,
      environment_unchanged: true,
      server_git_unchanged: true,
      backups: before.backups,
      pid: Number(run('pm2', ['pid', 'my-backend']).toString().trim()),
      verified_at: new Date().toISOString()
    };
    assert.equal(result.health_status, 200);
    assert.notEqual(String(result.pid), String(before.pid));
    fs.writeFileSync(root + '/verified.json', JSON.stringify(result, null, 2), { mode: 0o600 });
    verified = true;
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (changed && !verified) {
      fs.mkdirSync(root + '/rollback', { mode: 0o700 });
      run('tar', ['-xf', root + '/backup/runtime-before.tar', '-C', root + '/rollback']);
      for (const file of [...order].reverse()) {
        if (before.existing.includes(file.path)) atomic(file.path, fs.readFileSync(root + '/rollback/' + file.path), before.modes[file.path]);
        else if (fs.existsSync(site + '/' + file.path)) fs.unlinkSync(site + '/' + file.path);
      }
      run('pm2', ['restart', 'my-backend']);
      await healthy(port);
      console.error('B38 runtime rollback completed; additive news schema and seeded rows retained.');
    }
  }
})().catch(error => {
  console.error('B38 deployment failed:', error.stack || error.code || error.message);
  process.exitCode = 1;
});
