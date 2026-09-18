'use strict';
const root = __dirname;
const { fs, assert, site, config, hash, contentHash, run, get, atomic, healthy, load, restore } = require('./common.cjs');
const allowed = require('./allowed.cjs'), { configure } = require('./nginx.cjs');
(async () => {
  const manifest = load(root, allowed);
  assert.ok(!fs.existsSync(root + '/before.json'), 'Release already started; inspect before retrying');
  assert.equal(hash(fs.readFileSync(config)), manifest.nginx_before_sha256, 'Nginx baseline changed');
  assert.equal(hash(fs.readFileSync(root + '/nginx-after.conf')), manifest.nginx_after_sha256);
  const processInfo = JSON.parse(run('pm2', ['jlist'])).find(item => item.name === 'my-backend');
  assert.ok(processInfo && processInfo.pm2_env.status === 'online');
  assert.equal(processInfo.pm2_env.pm_exec_path, site + '/backend/server.js');
  const envConfig = require(site + '/backend/node_modules/dotenv').parse(fs.readFileSync(site + '/backend/.env'));
  const publicDir = processInfo.pm2_env.PUBLIC_DIR || envConfig.PUBLIC_DIR;
  assert.ok(!publicDir || publicDir === site + '/public', 'Unexpected PUBLIC_DIR');
  assert.equal(Number(processInfo.pm2_env.PORT || envConfig.PORT || 3000), 3000);
  const before = { env_sha256: hash(fs.readFileSync(site + '/backend/.env')), pid: processInfo.pid,
    git_head: run('git', ['-C', site, 'rev-parse', 'HEAD']).toString().trim(),
    existing: [], modes: {}, raw_hashes: {}, nginx_mode: fs.statSync(config).mode & 0o777, backups: {} };
  assert.equal((await get('/api/health')).status, 200);
  for (const file of manifest.files) {
    const target = site + '/' + file.path;
    if (fs.existsSync(target)) {
      assert.ok(file.baseline, 'Unexpected existing file: ' + file.path);
      assert.equal(contentHash(file.path, fs.readFileSync(target)), file.baseline, 'Runtime baseline changed: ' + file.path);
      before.existing.push(file.path); before.modes[file.path] = fs.statSync(target).mode & 0o777;
      before.raw_hashes[file.path] = hash(fs.readFileSync(target));
    } else assert.equal(file.baseline, null, 'Missing baseline file: ' + file.path);
  }
  fs.mkdirSync(root + '/backup', { mode: 0o700 });
  run('tar', ['-czf', root + '/backup/public-before.tar.gz', '-C', site, 'public']);
  run('tar', ['-cf', root + '/backup/runtime-before.tar', '-C', site, ...before.existing]);
  fs.copyFileSync(config, root + '/backup/nginx-before.conf');
  for (const name of ['public-before.tar.gz', 'runtime-before.tar', 'nginx-before.conf']) {
    fs.chmodSync(root + '/backup/' + name, 0o600);
    const bytes = fs.readFileSync(root + '/backup/' + name);
    before.backups[name] = { bytes: bytes.length, sha256: hash(bytes) };
  }
  fs.writeFileSync(root + '/before.json', JSON.stringify(before, null, 2), { mode: 0o600 });
  fs.mkdirSync(root + '/code', { mode: 0o700 });
  assert.deepEqual(run('tar', ['-tf', root + '/runtime.tar']).toString().trim().split('\n').filter(name => !name.endsWith('/')).sort(), [...allowed].sort());
  run('tar', ['-xf', root + '/runtime.tar', '-C', root + '/code']);
  for (const file of manifest.files) assert.equal(contentHash(file.path, fs.readFileSync(root + '/code/' + file.path)), file.sha256);
  for (const name of ['backend/server.js', 'public/service-worker.js', 'public/pwa.js']) run('node', ['--check', root + '/code/' + name]);
  const order = [...manifest.files.filter(file => file.path !== 'public/index.html'), manifest.files.find(file => file.path === 'public/index.html')];
  let changed = false, verified = false;
  try {
    changed = true;
    // New assets first. The document is published last after routes/headers are ready.
    for (const file of order.filter(file => file.path !== 'public/index.html')) atomic(site + '/' + file.path, fs.readFileSync(root + '/code/' + file.path), before.modes[file.path] || 0o644);
    atomic(config, fs.readFileSync(root + '/nginx-after.conf'), before.nginx_mode);
    run('nginx', ['-t']); run('systemctl', ['reload', 'nginx']);
    run('pm2', ['restart', 'my-backend']); await healthy();
    atomic(site + '/public/index.html', fs.readFileSync(root + '/code/public/index.html'), before.modes['public/index.html']);
    run('node', [site + '/backend/scripts/verify-pwa-live.cjs']);
    for (const file of manifest.files) assert.equal(contentHash(file.path, fs.readFileSync(site + '/' + file.path)), file.sha256);
    assert.equal(hash(fs.readFileSync(site + '/backend/.env')), before.env_sha256);
    assert.equal(run('git', ['-C', site, 'rev-parse', 'HEAD']).toString().trim(), before.git_head);
    const result = { commit: manifest.commit, baseline_commit: manifest.baseline_commit, release: root,
      backend_restarted: true, nginx_reloaded: true, database_migrations: [], health_status: 200,
      environment_unchanged: true, server_git_unchanged: true, backups: before.backups,
      pid: Number(run('pm2', ['pid', 'my-backend']).toString().trim()), verified_at: new Date().toISOString() };
    fs.writeFileSync(root + '/verified.json', JSON.stringify(result, null, 2), { mode: 0o600 });
    verified = true; console.log(JSON.stringify(result, null, 2));
  } finally {
    if (changed && !verified) {
      await restore(root, manifest, before, configure, true);
      console.error('B37 failed: original runtime restored; retirement worker retained for any exposed clients.');
    }
  }
})().catch(error => { console.error('B37 deployment failed:', error.message); process.exitCode = 1; });
