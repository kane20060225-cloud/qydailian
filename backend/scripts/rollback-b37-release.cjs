'use strict';
const root = __dirname;
const { fs, assert, site, config, hash, contentHash, get, load, restore } = require('./common.cjs');
const allowed = require('./allowed.cjs'), { configure } = require('./nginx.cjs');
(async () => {
  assert.equal(process.argv[2], '--restore-pre-pwa', 'Explicit --restore-pre-pwa required');
  const manifest = load(root, allowed), before = JSON.parse(fs.readFileSync(root + '/before.json'));
  assert.ok(fs.existsSync(root + '/verified.json'), 'No completed release; inspect deployment failure first');
  assert.equal(hash(fs.readFileSync(config)), manifest.nginx_after_sha256, 'Nginx changed after this release; do not overwrite');
  for (const file of manifest.files) assert.equal(contentHash(file.path, fs.readFileSync(site + '/' + file.path)), file.sha256,
    'File changed after release; do not overwrite: ' + file.path);
  const result = await restore(root, manifest, before, configure, true);
  const document = await (await get('/')).text();
  assert.doesNotMatch(document, /manifest\.webmanifest|src="pwa\.js|pwaInstallArea/);
  const worker = await get('/service-worker.js');
  assert.equal(worker.status, 200);
  assert.match(worker.headers.get('content-type'), /javascript/);
  assert.match(worker.headers.get('cache-control'), /no-store/);
  assert.equal(hash(Buffer.from(await worker.arrayBuffer())), manifest.retire_worker_sha256);
  result.rolled_back_at = new Date().toISOString();
  fs.writeFileSync(root + '/rolled-back.json', JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error('B37 rollback refused/failed:', error.message); process.exitCode = 1; });
