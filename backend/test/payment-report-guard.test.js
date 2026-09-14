'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

test('payment anomaly script refuses to connect without explicit report mode', () => {
  const script = path.join(__dirname, '..', 'scripts', 'report-payment-anomalies.js');
  const result = spawnSync(process.execPath, [script], {
    env: {},
    encoding: 'utf8'
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /仅支持显式 --report/);
});
