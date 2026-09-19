'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = __dirname, site = '/var/www/your-site', allowed = require('./allowed.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const contentHash = bytes => hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));
const run = (name, args) => cp.execFileSync(name, args, { stdio: ['ignore', 'pipe', 'pipe'] });
function atomic(relative, bytes, mode) {
  const target = path.join(site, relative), temporary = target + '.b38.rollback';
  fs.writeFileSync(temporary, bytes, { mode }); fs.chmodSync(temporary, mode); fs.renameSync(temporary, target);
}
(async () => {
  assert.equal(process.argv[2], '--restore-runtime', 'Use --restore-runtime');
  assert.ok(fs.existsSync(root + '/verified.json'), 'Release was not verified');
  assert.ok(!fs.existsSync(root + '/rollback.json'), 'Runtime was already rolled back');
  const manifest = JSON.parse(fs.readFileSync(root + '/manifest.json'));
  const before = JSON.parse(fs.readFileSync(root + '/before.json'));
  assert.deepEqual(manifest.files.map(file => file.path), allowed);
  for (const file of manifest.files) assert.equal(contentHash(fs.readFileSync(site + '/' + file.path)), file.sha256, 'Later runtime change: ' + file.path);
  fs.mkdirSync(root + '/manual-rollback', { mode: 0o700 });
  run('tar', ['-xf', root + '/backup/runtime-before.tar', '-C', root + '/manual-rollback']);
  for (const file of [...manifest.files].reverse()) {
    if (before.existing.includes(file.path)) atomic(file.path, fs.readFileSync(root + '/manual-rollback/' + file.path), before.modes[file.path]);
    else fs.unlinkSync(site + '/' + file.path);
  }
  run('pm2', ['restart', 'my-backend']);
  const result = { runtime_restored: true, database_unchanged: true, restored_at: new Date().toISOString() };
  fs.writeFileSync(root + '/rollback.json', JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error('B38 rollback refused/failed:', error.message); process.exitCode = 1; });
