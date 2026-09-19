'use strict';

// Protected static-only release: exact baseline, private backups, atomic writes and automatic rollback.
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
const run = (name, args) => cp.execFileSync(name, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
const get = route => fetch(origin + route, { signal: AbortSignal.timeout(15000), redirect: 'error' });

function atomic(relative, bytes, mode, suffix = '.b39.tmp') {
  assert.ok(allowed.includes(relative));
  const target = path.join(site, relative), temporary = target + suffix;
  fs.writeFileSync(temporary, bytes, { mode });
  fs.chmodSync(temporary, mode);
  fs.renameSync(temporary, target);
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
  const before = {
    env_sha256: hash(fs.readFileSync(site + '/backend/.env')),
    pid: processInfo.pid,
    git_head: run('git', ['-C', site, 'rev-parse', 'HEAD']).toString().trim(),
    existing: [], modes: {}, backups: {}
  };
  assert.equal((await get('/api/health')).status, 200);
  for (const file of manifest.files) {
    const target = site + '/' + file.path;
    assert.ok(fs.existsSync(target), 'Missing production file: ' + file.path);
    assert.equal(contentHash(fs.readFileSync(target)), file.baseline, 'Production baseline changed: ' + file.path);
    before.existing.push(file.path);
    before.modes[file.path] = fs.statSync(target).mode & 0o777;
  }
  fs.mkdirSync(root + '/backup', { mode: 0o700 });
  run('tar', ['-czf', root + '/backup/public-before.tar.gz', '-C', site, 'public']);
  run('tar', ['-cf', root + '/backup/runtime-before.tar', '-C', site, ...before.existing]);
  for (const name of ['public-before.tar.gz', 'runtime-before.tar']) {
    fs.chmodSync(root + '/backup/' + name, 0o600);
    const bytes = fs.readFileSync(root + '/backup/' + name);
    before.backups[name] = { bytes: bytes.length, sha256: hash(bytes) };
  }
  fs.writeFileSync(root + '/before.json', JSON.stringify(before, null, 2), { mode: 0o600 });
  fs.mkdirSync(root + '/code', { mode: 0o700 });
  assert.deepEqual(run('tar', ['-tf', root + '/runtime.tar']).toString().trim().split('\n').filter(name => !name.endsWith('/')).sort(), [...allowed].sort());
  run('tar', ['-xf', root + '/runtime.tar', '-C', root + '/code']);
  for (const file of manifest.files) assert.equal(contentHash(fs.readFileSync(root + '/code/' + file.path)), file.sha256);
  run('node', ['--check', root + '/code/public/pwa.js']);
  const order = [...manifest.files.filter(file => file.path !== 'public/index.html'), manifest.files.find(file => file.path === 'public/index.html')];
  let changed = false, verified = false;
  try {
    changed = true;
    for (const file of order) atomic(file.path, fs.readFileSync(root + '/code/' + file.path), before.modes[file.path]);
    const result = { commit: manifest.commit, baseline_commit: manifest.baseline_commit, release: root,
      public_files: [], backend_restarted: false, database_migrations: [], backups: before.backups };
    for (const file of manifest.files) {
      assert.equal(contentHash(fs.readFileSync(site + '/' + file.path)), file.sha256);
      const name = file.path.slice(7);
      const response = await get('/' + (name === 'index.html' ? '' : name) + '?verify=' + manifest.commit);
      assert.equal(response.status, 200);
      assert.equal(contentHash(Buffer.from(await response.arrayBuffer())), file.sha256, 'Public content differs: ' + name);
      result.public_files.push(name);
    }
    const page = await (await get('/?verify-ui=' + manifest.commit)).text();
    for (const marker of ['pwa.css?v=20260919-pwa2', 'pwa.js?v=20260919-pwa2', 'id="pwaInstallGuide"', 'id="pwaGuideSteps"']) assert.ok(page.includes(marker), marker);
    assert.equal((await get('/api/health')).status, 200);
    assert.equal((await get('/api/order-center?scope=admin')).status, 401);
    assert.equal(hash(fs.readFileSync(site + '/backend/.env')), before.env_sha256);
    assert.equal(run('git', ['-C', site, 'rev-parse', 'HEAD']).toString().trim(), before.git_head);
    assert.equal(Number(run('pm2', ['pid', 'my-backend']).toString().trim()), before.pid);
    Object.assign(result, { pid: before.pid, health_status: 200, auth_guard_verified: true,
      environment_unchanged: true, server_git_unchanged: true, verified_at: new Date().toISOString() });
    fs.writeFileSync(root + '/verified.json', JSON.stringify(result, null, 2), { mode: 0o600 });
    verified = true;
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (changed && !verified) {
      fs.mkdirSync(root + '/rollback', { mode: 0o700 });
      run('tar', ['-xf', root + '/backup/runtime-before.tar', '-C', root + '/rollback']);
      for (const file of [...order].reverse()) atomic(file.path, fs.readFileSync(root + '/rollback/' + file.path), before.modes[file.path], '.b39.rollback');
      assert.equal((await get('/api/health')).status, 200);
      console.error('B39 static release failed; original runtime restored.');
    }
  }
})().catch(error => { console.error('B39 deployment failed:', error.stack || error.code || error.message); process.exitCode = 1; });
