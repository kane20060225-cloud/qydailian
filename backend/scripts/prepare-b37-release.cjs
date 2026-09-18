'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const files = require('./b37-release-files.cjs'), { configure } = require('./b37-nginx.cjs');
const workspace = path.resolve(__dirname, '../..');
const output = path.join(workspace, 'artifacts/ui-preview/b37-release');
const git = args => cp.execFileSync('git', args, { cwd: workspace, maxBuffer: 32 * 1024 * 1024 });
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const contentHash = (name, bytes) => hash(/\.png$/.test(name) ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));
const commit = git(['rev-parse', 'HEAD']).toString().trim(), baseline = process.argv[2];
assert.match(baseline || '', /^[a-f0-9]{40}$/);
assert.equal(git(['status', '--porcelain']).toString().trim(), '', 'Commit release source before packaging');
const original = fs.readFileSync(path.join(workspace, 'artifacts/ui-preview/b37-preflight/your-site.conf'));
const configured = Buffer.from(configure(original.toString('utf8')));
fs.mkdirSync(output, { recursive: true });
git(['archive', '--format=tar', '--output=' + path.join(output, 'runtime.tar'), commit, ...files]);
const manifest = {
  commit, baseline_commit: baseline, release: 'b37-pwa-release-' + commit.slice(0, 10),
  archive_sha256: hash(fs.readFileSync(path.join(output, 'runtime.tar'))),
  nginx_before_sha256: hash(original), nginx_after_sha256: hash(configured),
  retire_worker_sha256: hash(fs.readFileSync(path.join(__dirname, 'pwa-retire-worker.js'))),
  files: files.map(name => ({ path: name,
    baseline: cp.spawnSync('git', ['cat-file', '-e', baseline + ':' + name], { cwd: workspace }).status === 0
      ? contentHash(name, git(['show', baseline + ':' + name])) : null,
    sha256: contentHash(name, git(['show', commit + ':' + name])) }))
};
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(output, 'nginx-after.conf'), configured);
for (const [source, target] of [
  ['deploy-b37-release.cjs', 'deploy.cjs'], ['rollback-b37-release.cjs', 'rollback.cjs'],
  ['b37-runtime.cjs', 'common.cjs'], ['b37-release-files.cjs', 'allowed.cjs'],
  ['b37-nginx.cjs', 'nginx.cjs'], ['pwa-retire-worker.js', 'retire-worker.js']
]) fs.copyFileSync(path.join(__dirname, source), path.join(output, target));
console.log(JSON.stringify({ output, release: manifest.release, commit, baseline, archive_sha256: manifest.archive_sha256 }, null, 2));
