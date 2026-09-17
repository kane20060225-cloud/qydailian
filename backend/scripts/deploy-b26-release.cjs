'use strict';
// Run from the protected server release directory after uploading its manifest/archive.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = __dirname, site = '/var/www/your-site', origin = 'https://wotbqydailian.vip';
const allowed = ["backend/server.js","backend/lib/booster-finance.js","backend/lib/accounting.js","backend/routes/booster-finance.js","backend/scripts/verify-booster-finance-mysql.cjs","public/index.html","public/script.js","public/order-center.js","public/booster-workbench.js","public/booster-workbench.css"];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const contentHash = (name, bytes) => hash(/\.(png|ico)$/.test(name) ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));
const run = (name, args) => cp.execFileSync(name, args, {stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024});
const get = route => fetch(origin + route, {signal: AbortSignal.timeout(15000), redirect: 'error'});
function atomic(name, bytes, mode) {
  assert.ok(allowed.includes(name));
  const target = path.join(site, name), temporary = target + '.b26.tmp';
  fs.writeFileSync(temporary, bytes, {mode}); fs.chmodSync(temporary, mode); fs.renameSync(temporary, target);
}
(async () => {
  const manifest = JSON.parse(fs.readFileSync(root + '/manifest.json'));
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  assert.equal(root, '/root/b26-workbench-release-' + manifest.commit.slice(0, 10));
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
  run('tar', ['-czf', root + '/backup/site-before.tar.gz', '--exclude=./.git','--exclude=./backend/node_modules','--exclude=./node_modules','--exclude=./artifacts', '-C', site, '.']);
  run('tar', ['-cf', root + '/backup/runtime-before.tar', '-C', site, ...before.existing]);
  for (const name of ['site-before.tar.gz', 'runtime-before.tar']) fs.chmodSync(root + '/backup/' + name, 0o600);
  fs.writeFileSync(root + '/before.json', JSON.stringify(before, null, 2), {mode: 0o600});
  fs.mkdirSync(root + '/code', {mode: 0o700});
  assert.deepEqual(run('tar', ['-tf', root + '/runtime.tar']).toString().trim().split('\n').filter(name => !name.endsWith('/')).sort(), [...allowed].sort());
  run('tar', ['-xf', root + '/runtime.tar', '-C', root + '/code']);
  for (const file of manifest.files) assert.equal(contentHash(file.path, fs.readFileSync(root + '/code/' + file.path)), file.sha256);
  const cfg=require(site+'/backend/node_modules/dotenv').parse(fs.readFileSync(site+'/backend/.env'));
  assert.equal(cfg.DB_NAME,'wotbqydailian');
  const mysql=require(site+'/backend/node_modules/mysql2/promise');
  const dbOptions={host:cfg.DB_HOST,port:Number(cfg.DB_PORT||3306),user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:cfg.DB_NAME,decimalNumbers:true};
  const finance=require(root+'/code/backend/lib/booster-finance');
  const verifier=require(root+'/code/backend/scripts/verify-booster-finance-mysql.cjs');
  const isolated=await mysql.createConnection(dbOptions);let mysqlChecks;
  try{mysqlChecks=await verifier.verify(isolated,finance);}finally{await isolated.end();}
  const readOnly=await mysql.createConnection(dbOptions);
  try{await readOnly.query('SET TRANSACTION READ ONLY');await readOnly.beginTransaction();mysqlChecks.production_explain_queries=await verifier.explain(readOnly,finance);mysqlChecks.order_explain_queries=await verifier.explainOrders(readOnly,fs.readFileSync(root+'/code/backend/server.js','utf8'),require(site+'/backend/lib/order-center').visibleOrdersSql);await readOnly.rollback();}finally{await readOnly.end();}
  const healthy=async()=>{for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:'+Number(cfg.PORT||3000)+'/api/health',{signal:AbortSignal.timeout(1000)})).status===200)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Backend health timeout');};
  // Publish assets first so the new document never references missing files.
  const publishOrder = [...manifest.files.filter(file => file.path !== 'public/index.html'), manifest.files.find(file=>file.path==='public/index.html')];
  let changed = false, verified = false;
  try {
    changed = true;
    for (const file of publishOrder) atomic(file.path, fs.readFileSync(root + '/code/' + file.path), before.modes[file.path] || 0o644);
    run('pm2',['restart','my-backend']);await healthy();
    const result = {commit: manifest.commit, public_files: [], backend_restarted: true, mysql_checks: mysqlChecks, database_migrations: [], backups: {}};
    for (const file of manifest.files) {
      assert.equal(contentHash(file.path, fs.readFileSync(site + '/' + file.path)), file.sha256);
      if(!file.path.startsWith('public/'))continue;
      const name = file.path.slice(7), response = await get('/' + (name === 'index.html' ? '' : name) + '?verify=' + manifest.commit);
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(contentHash(file.path, bytes), file.sha256, 'Public content differs: ' + name);
      result.public_files.push(name);
    }
    assert.equal((await get('/api/health')).status, 200);
    assert.equal((await get('/api/order-center?scope=admin')).status, 401);
    for(const route of ['/api/booster/finance','/api/admin/booster-finance/UNUSED/preview'])assert.equal((await get(route)).status,401);
    assert.equal((await fetch(origin+'/api/admin/booster-finance/UNUSED/reverse-test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)})).status,401);
    assert.equal(hash(fs.readFileSync(site + '/backend/.env')), before.env_sha256);
    assert.equal(run('git', ['-C', site, 'rev-parse', 'HEAD']).toString().trim(), before.git_head);
    assert.notEqual(run('pm2', ['pid', 'my-backend']).toString().trim(), before.pid);
    result.pid = Number(run('pm2',['pid','my-backend']).toString().trim()); result.environment_unchanged = true; result.server_git_unchanged = true;
    result.health_status = 200; result.auth_guard_verified = true; result.verified_at = new Date().toISOString();
    for (const name of ['site-before.tar.gz', 'runtime-before.tar']) result.backups[name] = fs.statSync(root + '/backup/' + name).size;
    fs.writeFileSync(root + '/verified.json', JSON.stringify(result, null, 2), {mode: 0o600});
    verified = true; console.log(JSON.stringify(result, null, 2));
  } finally {
    if (changed && !verified) {
      fs.mkdirSync(root + '/rollback', {mode: 0o700}); run('tar', ['-xf', root + '/backup/runtime-before.tar', '-C', root + '/rollback']);
      for (const file of [...publishOrder].reverse()) {
        if (before.existing.includes(file.path)) atomic(file.path, fs.readFileSync(root + '/rollback/' + file.path), before.modes[file.path]);
        else if (fs.existsSync(site + '/' + file.path)) fs.unlinkSync(site + '/' + file.path);
      }
      run('pm2',['restart','my-backend']);await healthy();
      assert.equal((await get('/api/health')).status, 200); console.error('B26 front-end rollback completed.');
    }
  }
})().catch(error => { console.error('B26 deployment failed:', error.code || error.message); process.exitCode = 1; });
