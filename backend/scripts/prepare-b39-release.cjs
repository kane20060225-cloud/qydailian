'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const workspace = path.resolve(__dirname, '../..');
const output = path.join(workspace, 'artifacts/ui-preview/b39-release');
const files = require('./b39-release-files.cjs');
const git = args => cp.execFileSync('git', args, { cwd: workspace, maxBuffer: 32 * 1024 * 1024 });
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const contentHash = bytes => hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));
const commit = git(['rev-parse', 'HEAD']).toString().trim();
const baseline = process.argv[2];

assert.match(baseline || '', /^[a-f0-9]{40}$/);
assert.equal(git(['status', '--porcelain']).toString().trim(), '', 'Commit release source before packaging');
fs.mkdirSync(output, { recursive: true });
git(['archive', '--format=tar', '--output=' + path.join(output, 'runtime.tar'), commit, ...files]);
const manifest = {
  commit,
  baseline_commit: baseline,
  release: 'b39-pwa-install-release-' + commit.slice(0, 10),
  archive_sha256: hash(fs.readFileSync(path.join(output, 'runtime.tar'))),
  files: files.map(name => ({
    path: name,
    baseline: contentHash(git(['show', baseline + ':' + name])),
    sha256: contentHash(git(['show', commit + ':' + name]))
  }))
};
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
for (const [source, target] of [
  ['deploy-b39-release.cjs', 'deploy.cjs'],
  ['rollback-b39-release.cjs', 'rollback.cjs'],
  ['b39-release-files.cjs', 'allowed.cjs']
]) fs.copyFileSync(path.join(__dirname, source), path.join(output, target));
console.log(JSON.stringify({ output, release: manifest.release, commit, baseline, archive_sha256: manifest.archive_sha256 }, null, 2));
