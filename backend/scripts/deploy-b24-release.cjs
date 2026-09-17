'use strict';
// Run from the protected server release directory after uploading its manifest/archive.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = __dirname, site = '/var/www/your-site', origin = 'https://wotbqydailian.vip';
const allowed = ["public/index.html","public/script.js","public/velnora-coin.png","public/favicon.ico","public/favicon-16.png","public/favicon-32.png","public/apple-touch-icon.png"];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const contentHash = (name, bytes) => hash(/\.(png|ico)$/.test(name) ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));
const run = (name, args) => cp.execFileSync(name, args, {stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024});
const get = route => fetch(origin + route, {signal: AbortSignal.timeout(15000), redirect: 'error'});
function atomic(name, bytes, mode) {
  assert.ok(allowed.includes(name));
  const target = path.join(site, name), temporary = target + '.b24.tmp';
  fs.writeFileSync(temporary, bytes, {mode}); fs.chmodSync(temporary, mode); fs.renameSync(temporary, target);
}
(async () => {
  const manifest = JSON.parse(fs.readFileSync(root + '/manifest.json'));
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  assert.equal(root, '/root/b24-icons-release-' + manifest.commit.slice(0, 10));
  assert.deepEqual(manifest.files.map(file => file.path), allowed);
  assert.equal(hash(fs.readFileSync(root + '/runtime.tar')), manifest.archive_sha256);
  const before = {
    env_sha256: hash(fs.readFileSync(site + '/backend/.env')),
    pid: run('pm2', ['pid', 'my-backend']).toString().trim(),
    git_head: run('git', ['-C', site, 'rev-parse', 'HEAD']).toString().trim(),
    existing: [], modes: {}
  };
  assert.match(before.pid, /^\d+$/);
  assert.equal((await get('/api/health')).status, 200);
  for (const file of manifest.files) {
    const target = site + '/' + file.path;
    if (fs.existsSync(target)) {
      assert.ok(file.baseline, 'Unexpected existing file: ' + file.path);
      assert.equal(contentHash(file.path, fs.readFileSync(target)), file.baseline, 'Production baseline changed: ' + file.path);
      before.existing.push(file.path); before.modes[file.path] = fs.statSync(target).mode & 0o777;
    } else assert.equal(file.baseline, null, 'Missing production file: ' + file.path);
  }
  fs.mkdirSync(root + '/backup', {mode: 0o700});
  run('tar', ['-czf', root + '/backup/public-before.tar.gz', '-C', site, 'public']);
  run('tar', ['-cf', root + '/backup/runtime-before.tar', '-C', site, ...before.existing]);
  for (const name of ['public-before.tar.gz', 'runtime-before.tar']) fs.chmodSync(root + '/backup/' + name, 0o600);
  fs.writeFileSync(root + '/before.json', JSON.stringify(before, null, 2), {mode: 0o600});
  fs.mkdirSync(root + '/code', {mode: 0o700});
  assert.deepEqual(run('tar', ['-tf', root + '/runtime.tar']).toString().trim().split('\n').filter(name => !name.endsWith('/')).sort(), [...allowed].sort());
  run('tar', ['-xf', root + '/runtime.tar', '-C', root + '/code']);
  for (const file of manifest.files) assert.equal(contentHash(file.path, fs.readFileSync(root + '/code/' + file.path)), file.sha256);
  // Publish assets first so the new document never references missing files.
  const publishOrder = [...manifest.files.filter(file => file.path !== 'public/index.html'), manifest.files[0]];
  let changed = false, verified = false;
  try {
    changed = true;
    for (const file of publishOrder) atomic(file.path, fs.readFileSync(root + '/code/' + file.path), before.modes[file.path] || 0o644);
    const result = {commit: manifest.commit, public_files: [], backend_restarted: false, database_migrations: [], backups: {}};
    for (const file of manifest.files) {
      assert.equal(contentHash(file.path, fs.readFileSync(site + '/' + file.path)), file.sha256);
      const name = file.path.slice(7), response = await get('/' + (name === 'index.html' ? '' : name) + '?verify=' + manifest.commit);
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(contentHash(file.path, bytes), file.sha256, 'Public content differs: ' + name);
      result.public_files.push(name);
    }
    assert.equal((await get('/api/health')).status, 200);
    assert.equal((await get('/api/order-center?scope=admin')).status, 401);
    assert.equal(hash(fs.readFileSync(site + '/backend/.env')), before.env_sha256);
    assert.equal(run('git', ['-C', site, 'rev-parse', 'HEAD']).toString().trim(), before.git_head);
    assert.equal(run('pm2', ['pid', 'my-backend']).toString().trim(), before.pid);
    result.pid = Number(before.pid); result.environment_unchanged = true; result.server_git_unchanged = true;
    result.health_status = 200; result.auth_guard_verified = true; result.verified_at = new Date().toISOString();
    for (const name of ['public-before.tar.gz', 'runtime-before.tar']) result.backups[name] = fs.statSync(root + '/backup/' + name).size;
    fs.writeFileSync(root + '/verified.json', JSON.stringify(result, null, 2), {mode: 0o600});
    verified = true; console.log(JSON.stringify(result, null, 2));
  } finally {
    if (changed && !verified) {
      fs.mkdirSync(root + '/rollback', {mode: 0o700}); run('tar', ['-xf', root + '/backup/runtime-before.tar', '-C', root + '/rollback']);
      for (const file of [...publishOrder].reverse()) {
        if (before.existing.includes(file.path)) atomic(file.path, fs.readFileSync(root + '/rollback/' + file.path), before.modes[file.path]);
        else if (fs.existsSync(site + '/' + file.path)) fs.unlinkSync(site + '/' + file.path);
      }
      assert.equal((await get('/api/health')).status, 200); console.error('B24 front-end rollback completed.');
    }
  }
})().catch(error => { console.error('B24 deployment failed:', error.code || error.message); process.exitCode = 1; });
