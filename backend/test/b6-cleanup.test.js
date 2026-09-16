'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backend = path.join(__dirname, '..');

test('B6 rental modules have no debug logging, synchronous upload or duplicate crypto load', () => {
  const server = fs.readFileSync(path.join(backend, 'server.js'), 'utf8');
  const routes = fs.readFileSync(path.join(backend, 'routes', 'rental-accounts.js'), 'utf8');
  const upload = fs.readFileSync(path.join(backend, 'lib', 'rental-stream-upload.js'), 'utf8');
  assert.equal((server.match(/require\('node:crypto'\)/g) || []).length, 1);
  assert.doesNotMatch(routes, /console\.(?:log|warn|error)/);
  assert.doesNotMatch(routes, /(?:writeFileSync|mkdirSync|existsSync)/);
  assert.doesNotMatch(upload, /(?:writeFileSync|mkdirSync|existsSync)/);
  assert.match(upload, /pipeline\(source, limiter/);
});
