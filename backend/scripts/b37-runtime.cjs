'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const site = '/var/www/your-site', config = '/etc/nginx/conf.d/your-site.conf', origin = 'https://wotbqydailian.vip';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const contentHash = (name, bytes) => hash(/\.png$/.test(name) ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));
const run = (name, args) => cp.execFileSync(name, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const get = route => fetch(origin + route, { signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store' });
function atomic(target, bytes, mode = 0o644) {
  assert.ok(target === config || target.startsWith(site + '/public/') || target.startsWith(site + '/backend/'));
  assert.equal(path.resolve(target), target);
  const temporary = target + '.b37.tmp';
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temporary, bytes, { mode }); fs.chmodSync(temporary, mode); fs.renameSync(temporary, target);
}
async function healthy() {
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch('http://127.0.0.1:3000/api/health', { signal: AbortSignal.timeout(1000) })).status === 200) return; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Backend health timeout');
}
function load(root, allowed) {
  const manifest = JSON.parse(fs.readFileSync(root + '/manifest.json'));
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  assert.equal(root, '/root/b37-pwa-release-' + manifest.commit.slice(0, 10));
  assert.deepEqual(manifest.files.map(file => file.path), allowed);
  assert.equal(hash(fs.readFileSync(root + '/runtime.tar')), manifest.archive_sha256);
  assert.equal(hash(fs.readFileSync(root + '/retire-worker.js')), manifest.retire_worker_sha256);
  return manifest;
}
async function restore(root, manifest, before, configure, retirement) {
  assert.equal(hash(fs.readFileSync(root + '/backup/runtime-before.tar')), before.backups['runtime-before.tar'].sha256);
  const originalConfig = fs.readFileSync(root + '/backup/nginx-before.conf');
  assert.equal(hash(originalConfig), manifest.nginx_before_sha256);
  const restored = root + '/restored';
  fs.mkdirSync(restored, { recursive: true, mode: 0o700 });
  run('tar', ['-xf', root + '/backup/runtime-before.tar', '-C', restored]);
  for (const file of manifest.files) {
    const target = site + '/' + file.path;
    if (before.existing.includes(file.path)) {
      const bytes = fs.readFileSync(restored + '/' + file.path);
      assert.equal(hash(bytes), before.raw_hashes[file.path]);
      atomic(target, bytes, before.modes[file.path]);
    } else if (fs.existsSync(target)) {
      assert.ok(manifest.files.some(item => item.path === file.path));
      fs.unlinkSync(target); // Exact new release files only, no directories/data deletion.
    }
  }
  if (retirement) atomic(site + '/public/service-worker.js', fs.readFileSync(root + '/retire-worker.js'));
  atomic(config, retirement ? Buffer.from(configure(originalConfig.toString('utf8'), true)) : originalConfig, before.nginx_mode);
  run('nginx', ['-t']); run('systemctl', ['reload', 'nginx']);
  run('pm2', ['restart', 'my-backend']); await healthy();
  assert.equal(hash(fs.readFileSync(site + '/backend/.env')), before.env_sha256);
  assert.equal(run('git', ['-C', site, 'rev-parse', 'HEAD']).toString().trim(), before.git_head);
  for (const name of before.existing) assert.equal(hash(fs.readFileSync(site + '/' + name)), before.raw_hashes[name]);
  assert.equal((await get('/api/health')).status, 200);
  return { retirement_worker_retained: retirement, restored_runtime_files: before.existing,
    environment_unchanged: true, server_git_unchanged: true, health_status: 200 };
}
module.exports = { fs, path, assert, site, config, origin, hash, contentHash, run, get, atomic, healthy, load, restore };
