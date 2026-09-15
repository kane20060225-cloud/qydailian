'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateRentalPaymentEvidence } = require('../lib/rental-payment-evidence');

test('only current-user PNG/JPEG screenshot files can be associated', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b5-evidence-'));
  t.after(() => {
    fs.unlinkSync(path.join(dir, 'rental_3_1700000000000.png'));
    fs.unlinkSync(path.join(dir, 'rental_3_1700000000001.png'));
    fs.rmdirSync(dir);
  });
  const name = 'rental_3_1700000000000.png';
  fs.writeFileSync(path.join(dir, name), Buffer.from('89504e470d0a1a0a00000000', 'hex'));
  assert.equal(validateRentalPaymentEvidence(dir, name, 3), path.join(dir, name));
  assert.throws(() => validateRentalPaymentEvidence(dir, name, 4), /当前用户/);
  assert.throws(() => validateRentalPaymentEvidence(dir, '../' + name, 3), /文件名/);
  const invalid = 'rental_3_1700000000001.png';
  fs.writeFileSync(path.join(dir, invalid), Buffer.from('not-an-image'));
  assert.throws(() => validateRentalPaymentEvidence(dir, invalid, 3), /PNG 或 JPEG/);
});
