'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = __dirname, site = '/var/www/your-site', origin = 'https://wotbqydailian.vip';
const allowed = require('./allowed.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const contentHash = bytes => hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));
function atomic(relative, bytes, mode) {
  assert.ok(allowed.includes(relative));
  const target = path.join(site, relative), temporary = target + '.b39.manual-rollback';
  fs.writeFileSync(temporary, bytes, { mode }); fs.chmodSync(temporary, mode); fs.renameSync(temporary, target);
}
(async () => {
  assert.equal(process.argv[2], '--restore-static', 'Use --restore-static');
  assert.ok(fs.existsSync(root + '/verified.json'), 'Release was not verified');
  assert.ok(!fs.existsSync(root + '/rollback.json'), 'Release was already rolled back');
  const manifest = JSON.parse(fs.readFileSync(root + '/manifest.json'));
  const before = JSON.parse(fs.readFileSync(root + '/before.json'));
  assert.deepEqual(manifest.files.map(file => file.path), allowed);
  for (const file of manifest.files) assert.equal(contentHash(fs.readFileSync(site + '/' + file.path)), file.sha256, 'Later runtime change: ' + file.path);
  fs.mkdirSync(root + '/manual-rollback', { mode: 0o700 });
  cp.execFileSync('tar', ['-xf', root + '/backup/runtime-before.tar', '-C', root + '/manual-rollback']);
  for (const file of [...manifest.files].reverse()) atomic(file.path, fs.readFileSync(root + '/manual-rollback/' + file.path), before.modes[file.path]);
  assert.equal((await fetch(origin + '/api/health', { signal: AbortSignal.timeout(15000) })).status, 200);
  const result = { static_restored: true, backend_restarted: false, database_unchanged: true, restored_at: new Date().toISOString() };
  fs.writeFileSync(root + '/rollback.json', JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error('B39 rollback refused/failed:', error.message); process.exitCode = 1; });
