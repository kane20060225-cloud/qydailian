'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { issueSessionToken } = require('../lib/auth-session');

process.env.JWT_SECRET = 'b5-test-only-jwt';
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'test-user';
process.env.DB_PASSWORD = 'test-password';
process.env.DB_NAME = 'test-db';
process.env.ALIPAY_ENABLED = 'false';

const state = { balance: 200, ownerEarnings: 0, orders: [], workflows: [],
  ledger: [], audit: [], evidence: [], payments: [], reviews: [], resolutions: [], failLedger: false };
function snapshot() {
  return { balance: state.balance, ownerEarnings: state.ownerEarnings,
    orders: structuredClone(state.orders),
    workflows: structuredClone(state.workflows),
    ledger: structuredClone(state.ledger), audit: structuredClone(state.audit),
    evidence: structuredClone(state.evidence), payments: structuredClone(state.payments),
    reviews: structuredClone(state.reviews),
    resolutions: structuredClone(state.resolutions) };
}
const connection = {
  saved: null,
  async beginTransaction() { this.saved = snapshot(); },
  async commit() { this.saved = null; },
  async rollback() {
    if (!this.saved) return;
    Object.assign(state, this.saved);
    this.saved = null;
  },
  release() {},
  async execute(sql, params) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT * FROM rental_accounts') && q.endsWith('FOR UPDATE')) {
      return [[{ id: 9, owner_id: 8, hourly_price: 2, daily_price: 10 }]];
    }
    if (q.startsWith('SELECT id FROM rental_orders WHERE account_id')) {
      return [state.orders.filter((o) => o.status === 'pending' || o.status === 'active').map((o) => ({ id: o.id }))];
    }
    if (q === 'SELECT qy_credits FROM users WHERE id = ? FOR UPDATE' ||
        q === 'SELECT qy_credits AS balance FROM users WHERE id = ? FOR UPDATE') {
      return [[q.includes('AS balance') ? { balance: state.balance } : { qy_credits: state.balance }]];
    }
    if (q === 'SELECT rental_earnings AS balance FROM users WHERE id = ? FOR UPDATE') {
      return [[{ balance: state.ownerEarnings }]];
    }
    if (q === 'UPDATE users SET rental_earnings = ? WHERE id = ?') {
      state.ownerEarnings = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q === 'UPDATE users SET qy_credits = ? WHERE id = ?') {
      state.balance = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO account_ledger')) {
      if (state.failLedger) throw new Error('ledger unavailable');
      state.ledger.push(params);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO rental_orders')) {
      state.orders.push({ id: 1, order_no: params[0], renter_id: params[1],
        owner_id: params[2], account_id: params[3], total_price: params[6],
        credits_used: params[7], status: 'pending' });
      return [{ affectedRows: 1 }];
    }
    if (q === 'INSERT INTO rental_order_workflow (order_no, payment_status) VALUES (?, ?)') {
      state.workflows.push({ order_no: params[0], payment_status: params[1] });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('SELECT * FROM rental_orders WHERE order_no') && q.endsWith('FOR UPDATE')) {
      if (q === 'SELECT * FROM rental_orders WHERE order_no = ? FOR UPDATE') {
        return [state.orders.filter((o) => o.order_no === params[0])];
      }
      if (q.includes('AND renter_id = ?')) {
        return [state.orders.filter((o) => o.order_no === params[0] && o.renter_id === params[1])];
      }
      return [state.orders.filter((o) => o.order_no === params[0] &&
        (o.renter_id === params[1] || o.owner_id === params[2]) &&
        (o.status === 'pending' || o.status === 'active'))];
    }
    if (q === 'SELECT id, status FROM rental_orders WHERE order_no = ? AND owner_id = ? FOR UPDATE') {
      return [state.orders.filter((o) => o.order_no === params[0] && o.owner_id === params[1])];
    }
    if (q.startsWith('SELECT status FROM rental_orders WHERE order_no = ?')) {
      return [state.orders.filter((o) => o.order_no === params[0] &&
        (o.renter_id === params[1] || o.owner_id === params[2]))];
    }
    if (q === 'SELECT total_price, status FROM rental_orders WHERE order_no = ? FOR UPDATE') {
      return [state.orders.filter((o) => o.order_no === params[0])];
    }
    if (q === 'SELECT id, total_price, status FROM rental_orders WHERE order_no = ? AND renter_id = ? FOR UPDATE') {
      return [state.orders.filter((o) => o.order_no === params[0] && o.renter_id === params[1])];
    }
    if (q.includes('FROM rental_order_workflow WHERE order_no = ? FOR UPDATE')) {
      return [state.workflows.filter((w) => w.order_no === params[0])];
    }
    if (q.startsWith('UPDATE rental_order_workflow SET owner_complete_requested_at')) {
      const workflow = state.workflows.find((w) => w.order_no === params[0] &&
        !w.owner_complete_requested_at);
      if (!workflow) return [{ affectedRows: 0 }];
      workflow.owner_complete_requested_at = 'now';
      return [{ affectedRows: 1 }];
    }
    if (q === 'UPDATE rental_order_workflow SET disputed_at = NOW() WHERE order_no = ?') {
      state.workflows.find((w) => w.order_no === params[0]).disputed_at = 'now';
      return [{ affectedRows: 1 }];
    }
    if (q === 'UPDATE rental_order_workflow SET resolved_at = NOW() WHERE order_no = ?') {
      state.workflows.find((w) => w.order_no === params[0]).resolved_at = 'now';
      return [{ affectedRows: 1 }];
    }
    if (q === 'UPDATE rental_order_workflow SET payment_status = ? WHERE order_no = ?') {
      state.workflows.find((w) => w.order_no === params[1]).payment_status = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO manual_payment_evidence')) {
      const id = state.evidence.length + 1;
      state.evidence.push({ id, business_type: params[0], business_ref: params[1],
        uploader_user_id: params[2], filename: params[3], expected_amount: params[4],
        status: 'submitted' });
      return [{ insertId: id, affectedRows: 1 }];
    }
    if (q.startsWith('SELECT id, uploader_user_id, filename, expected_amount FROM manual_payment_evidence')) {
      return [state.evidence.filter((e) => e.business_ref === params[1] &&
        e.status === params[2]).reverse().slice(0, 1)];
    }
    if (q.startsWith('UPDATE manual_payment_evidence SET status')) {
      state.evidence.find((e) => e.id === params[2]).status = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q === 'SELECT order_no FROM rental_payment_reviews WHERE order_no = ? FOR UPDATE') {
      return [state.payments.filter((r) => r.order_no === params[0])];
    }
    if (q.startsWith('INSERT INTO rental_payment_reviews')) {
      if (state.payments.some((r) => r.reference === params[2])) {
        const error = new Error('duplicate payment reference');
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      state.payments.push({ order_no: params[0], evidence_id: params[1], reference: params[2] });
      return [{ affectedRows: 1 }];
    }
    if (q === 'SELECT order_no FROM rental_refund_reviews WHERE order_no = ? FOR UPDATE') {
      return [state.reviews.filter((r) => r.order_no === params[0])];
    }
    if (q.startsWith('INSERT INTO rental_refund_reviews')) {
      if (state.reviews.some((r) => r.reference === params[2])) {
        const error = new Error('duplicate refund reference');
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      state.reviews.push({ order_no: params[0], amount: params[1], reference: params[2] });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO rental_settlement_resolutions')) {
      state.resolutions.push({ order_no: params[0], decision: q.includes("'cancelled'") ?
        'cancelled' : 'completed', reference: params[1] });
      return [{ affectedRows: 1 }];
    }
    if (q === 'UPDATE rental_order_workflow SET renter_confirmed_at = NOW() WHERE order_no = ?') {
      state.workflows.find((w) => w.order_no === params[0]).renter_confirmed_at = 'now';
      return [{ affectedRows: 1 }];
    }
    if (q === 'UPDATE rental_orders SET status = ? WHERE id = ? AND status = ?') {
      const order = state.orders.find((o) => o.id === params[1] && o.status === params[2]);
      if (!order) return [{ affectedRows: 0 }];
      order.status = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO operation_audit')) {
      state.audit.push(params);
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected fake SQL: ${q}`);
  }
};
const fakePool = {
  getConnection: async () => connection,
  async execute(sql) {
    if (sql.trim() === 'SELECT token_version FROM users WHERE id = ?') {
      return [[{ token_version: 0 }]];
    }
    if (sql.trim() === 'SELECT role FROM users WHERE id = ?') {
      return [[{ role: 'admin' }]];
    }
    if (sql.includes('FROM rental_orders ro') && sql.includes('LEFT JOIN rental_payment_reviews')) {
      return [state.orders.map((o) => ({ order_no: o.order_no, status: o.status,
        total_price: o.total_price, credits_used: o.credits_used,
        payment_status: state.workflows.find((w) => w.order_no === o.order_no)?.payment_status }))];
    }
    throw new Error(`Unexpected pool SQL: ${sql}`);
  }
};
const originalCreatePool = mysql.createPool;
mysql.createPool = () => fakePool;
const evidenceValidator = require('../lib/rental-payment-evidence');
const originalEvidenceValidator = evidenceValidator.validateRentalPaymentEvidence;
evidenceValidator.validateRentalPaymentEvidence = (_uploadDir, filename, userId) => {
  if (filename !== `rental_${userId}_1700000000000.png`) throw new Error('invalid screenshot');
};
const { app } = require('../server');
mysql.createPool = originalCreatePool;
evidenceValidator.validateRentalPaymentEvidence = originalEvidenceValidator;

async function serve(t) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function reset() {
  state.balance = 200;
  state.ownerEarnings = 0;
  state.orders = [];
  state.workflows = [];
  state.ledger = [];
  state.audit = [];
  state.evidence = [];
  state.payments = [];
  state.reviews = [];
  state.resolutions = [];
  state.failLedger = false;
}

test('one rental account cannot be booked twice while pending', async (t) => {
  reset();
  const base = await serve(t);
  const token = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const request = () => fetch(`${base}/api/rental/orders`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: 9, rental_type: 'hour', quantity: 1, use_credits: 100 })
  });
  assert.equal((await request()).status, 201);
  assert.equal((await request()).status, 400);
  assert.equal(state.orders.length, 1);
  assert.equal(state.workflows.length, 1);
  assert.equal(state.balance, 100);
  assert.equal(state.ledger.length, 1);
});

test('cancel refunds deducted credits once in the same transaction', async (t) => {
  reset();
  state.balance = 100;
  state.orders = [{ id: 1, order_no: 'RNT-TEST', renter_id: 3, owner_id: 8,
    account_id: 9, total_price: 1, credits_used: 100, status: 'pending' }];
  state.workflows = [{ order_no: 'RNT-TEST', payment_status: 'unpaid' }];
  const base = await serve(t);
  const token = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const request = () => fetch(`${base}/api/rental/orders/RNT-TEST/cancel`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 400);
  assert.equal(state.balance, 200);
  assert.equal(state.orders[0].status, 'cancelled');
  assert.equal(state.ledger.length, 1);
});

test('ledger failure rolls back the booking and credit deduction', async (t) => {
  reset();
  state.failLedger = true;
  const base = await serve(t);
  const token = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const response = await fetch(`${base}/api/rental/orders`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: 9, rental_type: 'hour', quantity: 1, use_credits: 100 })
  });
  assert.equal(response.status, 400);
  assert.equal(state.balance, 200);
  assert.equal(state.orders.length, 0);
});

test('owner request alone pays nothing; renter confirmation settles once', async (t) => {
  reset();
  state.orders = [{ id: 1, order_no: 'RNT-TEST', renter_id: 3, owner_id: 8,
    account_id: 9, total_price: 2, credits_used: 0, status: 'pending' }];
  state.workflows = [{ order_no: 'RNT-TEST', payment_status: 'paid',
    owner_complete_requested_at: null, renter_confirmed_at: null, disputed_at: null }];
  const base = await serve(t);
  const owner = issueSessionToken(8, 0, process.env.JWT_SECRET);
  const renter = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const put = (suffix, token) => fetch(`${base}/api/rental/orders/RNT-TEST/${suffix}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal((await put('confirm', owner)).status, 200);
  assert.equal((await put('complete', owner)).status, 200);
  assert.equal(state.orders[0].status, 'active');
  assert.equal(state.ownerEarnings, 0);
  assert.equal(state.ledger.length, 0);
  assert.equal((await put('confirm-completion', renter)).status, 200);
  assert.equal((await put('confirm-completion', renter)).status, 409);
  assert.equal(state.orders[0].status, 'completed');
  assert.equal(state.ownerEarnings, 2);
  assert.equal(state.ledger.length, 1);
});

test('unreviewed rental screenshot cannot activate, admin approval permits activation', async (t) => {
  reset();
  state.orders = [{ id: 1, order_no: 'RNT-TEST', renter_id: 3, owner_id: 8,
    total_price: 2, credits_used: 0, status: 'pending' }];
  state.workflows = [{ order_no: 'RNT-TEST', payment_status: 'unpaid' }];
  const base = await serve(t);
  const renter = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const owner = issueSessionToken(8, 0, process.env.JWT_SECRET);
  const admin = issueSessionToken(99, 0, process.env.JWT_SECRET);
  const put = (path, token, body) => fetch(`${base}${path}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json' }, body: body && JSON.stringify(body)
  });
  assert.equal((await put('/api/rental/orders/RNT-TEST/confirm', owner)).status, 409);
  const submit = await fetch(`${base}/api/rental/orders/RNT-TEST/payment-evidence`, {
    method: 'POST', headers: { Authorization: `Bearer ${renter}`,
      'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'rental_3_1700000000000.png' })
  });
  assert.equal(submit.status, 200);
  assert.equal(state.workflows[0].payment_status, 'submitted');
  assert.equal((await fetch(`${base}/api/rental/orders/RNT-TEST/payment-evidence`, {
    method: 'POST', headers: { Authorization: `Bearer ${renter}`,
      'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'rental_3_1700000000000.png' })
  })).status, 409);
  assert.equal((await put('/api/rental/orders/RNT-TEST/cancel', renter)).status, 409);
  assert.equal((await put('/api/rental/orders/RNT-TEST/confirm', owner)).status, 409);
  assert.equal((await put('/api/admin/rental/orders/RNT-TEST/review-payment', admin,
    { approved: true })).status, 400);
  assert.equal((await put('/api/admin/rental/orders/RNT-TEST/review-payment', admin,
    { approved: true, payment_reference: 'PAY-1234' })).status, 200);
  assert.equal(state.workflows[0].payment_status, 'paid');
  assert.equal(state.evidence[0].status, 'accepted');
  assert.equal(state.payments.length, 1);
  assert.equal((await put('/api/rental/orders/RNT-TEST/confirm', owner)).status, 200);
  assert.equal((await put('/api/admin/rental/orders/RNT-TEST/review-payment', admin,
    { approved: true, payment_reference: 'PAY-1234' })).status, 409);
});

test('rejected screenshot may be resubmitted but not treated as paid', async (t) => {
  reset();
  state.orders = [{ id: 1, order_no: 'RNT-TEST', renter_id: 3, owner_id: 8,
    total_price: 2, credits_used: 0, status: 'pending' }];
  state.workflows = [{ order_no: 'RNT-TEST', payment_status: 'unpaid' }];
  const base = await serve(t);
  const renter = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const admin = issueSessionToken(99, 0, process.env.JWT_SECRET);
  const submit = (filename) => fetch(`${base}/api/rental/orders/RNT-TEST/payment-evidence`, {
    method: 'POST', headers: { Authorization: `Bearer ${renter}`,
      'Content-Type': 'application/json' }, body: JSON.stringify({ filename })
  });
  assert.equal((await submit('../wrong.png')).status, 400);
  assert.equal((await submit('rental_3_1700000000000.png')).status, 200);
  assert.equal((await fetch(`${base}/api/admin/rental/orders/RNT-TEST/review-payment`, {
    method: 'PUT', headers: { Authorization: `Bearer ${admin}`,
      'Content-Type': 'application/json' }, body: JSON.stringify({ approved: false })
  })).status, 200);
  assert.equal(state.workflows[0].payment_status, 'rejected');
  assert.equal(state.payments.length, 0);
  assert.equal((await submit('rental_3_1700000000000.png')).status, 200);
  assert.equal(state.workflows[0].payment_status, 'submitted');
  assert.equal(state.evidence.length, 2);
});

test('paid rental cancellation needs admin refund verification and returns credits once', async (t) => {
  reset();
  state.balance = 100;
  state.orders = [{ id: 1, order_no: 'RNT-TEST', renter_id: 3, owner_id: 8,
    total_price: 1, credits_used: 100, status: 'active' }];
  state.workflows = [{ order_no: 'RNT-TEST', payment_status: 'paid' }];
  const base = await serve(t);
  const renter = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const admin = issueSessionToken(99, 0, process.env.JWT_SECRET);
  const cancel = () => fetch(`${base}/api/rental/orders/RNT-TEST/cancel`, {
    method: 'PUT', headers: { Authorization: `Bearer ${renter}` }
  });
  const refund = (amount) => fetch(`${base}/api/admin/rental/orders/RNT-TEST/confirm-refund`, {
    method: 'PUT', headers: { Authorization: `Bearer ${admin}`,
      'Content-Type': 'application/json' },
    body: JSON.stringify({ refunded_amount: amount, refund_reference: 'BANK-REF-1234' })
  });
  assert.equal((await cancel()).status, 409);
  assert.equal(state.balance, 100);
  assert.equal((await refund(0.5)).status, 409);
  assert.equal((await refund(1)).status, 200);
  assert.equal((await refund(1)).status, 409);
  assert.equal(state.orders[0].status, 'cancelled');
  assert.equal(state.balance, 200);
  assert.equal(state.ledger.length, 1);
  assert.equal(state.reviews.length, 1);
});

test('dispute blocks renter payout; administrator resolution settles once', async (t) => {
  reset();
  state.orders = [{ id: 1, order_no: 'RNT-TEST', renter_id: 3, owner_id: 8,
    total_price: 2, credits_used: 0, status: 'active' }];
  state.workflows = [{ order_no: 'RNT-TEST', payment_status: 'paid',
    owner_complete_requested_at: 'now' }];
  const base = await serve(t);
  const renter = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const admin = issueSessionToken(99, 0, process.env.JWT_SECRET);
  const put = (path, token, body) => fetch(`${base}${path}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json' }, body: body && JSON.stringify(body)
  });
  assert.equal((await put('/api/rental/orders/RNT-TEST/dispute', renter)).status, 200);
  assert.equal((await put('/api/rental/orders/RNT-TEST/confirm-completion', renter)).status, 409);
  assert.equal(state.ownerEarnings, 0);
  assert.equal((await put('/api/admin/rental/orders/RNT-TEST/resolve-dispute', admin,
    { decision: 'completed', resolution_reference: 'CASE-1234' })).status, 200);
  assert.equal((await put('/api/admin/rental/orders/RNT-TEST/resolve-dispute', admin,
    { decision: 'completed', resolution_reference: 'CASE-1234' })).status, 409);
  assert.equal(state.ownerEarnings, 2);
  assert.equal(state.ledger.length, 1);
  assert.equal(state.resolutions.length, 1);
});

test('full-credit rental requires admin no-cash review before credit return', async (t) => {
  reset();
  state.balance = 0;
  state.orders = [{ id: 1, order_no: 'RNT-TEST', renter_id: 3, owner_id: 8,
    total_price: 0, credits_used: 200, status: 'pending' }];
  state.workflows = [{ order_no: 'RNT-TEST', payment_status: 'paid' }];
  const base = await serve(t);
  const renter = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const admin = issueSessionToken(99, 0, process.env.JWT_SECRET);
  assert.equal((await fetch(`${base}/api/rental/orders/RNT-TEST/cancel`, {
    method: 'PUT', headers: { Authorization: `Bearer ${renter}` }
  })).status, 409);
  assert.equal((await fetch(`${base}/api/admin/rental/orders/RNT-TEST/confirm-refund`, {
    method: 'PUT', headers: { Authorization: `Bearer ${admin}`,
      'Content-Type': 'application/json' },
    body: JSON.stringify({ refunded_amount: 0, refund_reference: 'NO-CASH-1234' })
  })).status, 200);
  assert.equal(state.balance, 200);
  assert.equal(state.ledger.length, 1);
});

test('failed refund ledger insert rolls back cancellation and review', async (t) => {
  reset();
  state.balance = 100;
  state.failLedger = true;
  state.orders = [{ id: 1, order_no: 'RNT-TEST', renter_id: 3, owner_id: 8,
    total_price: 1, credits_used: 100, status: 'active' }];
  state.workflows = [{ order_no: 'RNT-TEST', payment_status: 'paid' }];
  const base = await serve(t);
  const admin = issueSessionToken(99, 0, process.env.JWT_SECRET);
  assert.equal((await fetch(`${base}/api/admin/rental/orders/RNT-TEST/confirm-refund`, {
    method: 'PUT', headers: { Authorization: `Bearer ${admin}`,
      'Content-Type': 'application/json' },
    body: JSON.stringify({ refunded_amount: 1, refund_reference: 'BANK-REF-1234' })
  })).status, 500);
  assert.equal(state.orders[0].status, 'active');
  assert.equal(state.balance, 100);
  assert.equal(state.reviews.length, 0);
});

test('disputed paid rental can be closed only after verified refund', async (t) => {
  reset();
  state.orders = [{ id: 1, order_no: 'RNT-TEST', renter_id: 3, owner_id: 8,
    total_price: 2, credits_used: 0, status: 'active' }];
  state.workflows = [{ order_no: 'RNT-TEST', payment_status: 'paid', disputed_at: 'now' }];
  const base = await serve(t);
  const admin = issueSessionToken(99, 0, process.env.JWT_SECRET);
  assert.equal((await fetch(`${base}/api/admin/rental/orders/RNT-TEST/confirm-refund`, {
    method: 'PUT', headers: { Authorization: `Bearer ${admin}`,
      'Content-Type': 'application/json' },
    body: JSON.stringify({ refunded_amount: 2, refund_reference: 'BANK-REF-1234' })
  })).status, 200);
  assert.equal(state.orders[0].status, 'cancelled');
  assert.equal(state.ownerEarnings, 0);
  assert.equal(state.resolutions[0].decision, 'cancelled');
  assert.equal(state.workflows[0].resolved_at, 'now');
});

test('admin rental list exposes workflow state without account credentials', async (t) => {
  reset();
  state.orders = [{ id: 1, order_no: 'RNT-TEST', renter_id: 3, owner_id: 8,
    total_price: 2, credits_used: 0, status: 'pending' }];
  state.workflows = [{ order_no: 'RNT-TEST', payment_status: 'submitted' }];
  const base = await serve(t);
  const admin = issueSessionToken(99, 0, process.env.JWT_SECRET);
  const response = await fetch(`${base}/api/admin/rental/orders`, {
    headers: { Authorization: `Bearer ${admin}` }
  });
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.equal(rows[0].payment_status, 'submitted');
  assert.equal(rows[0].password, undefined);
  assert.equal(rows[0].login_password, undefined);
});

test('one external payment or refund reference cannot settle two rental orders', async (t) => {
  reset();
  state.orders = [1, 2].map((id) => ({ id, order_no: `RNT-${id}`,
    renter_id: 3, owner_id: 8, total_price: 2, credits_used: 0, status: 'pending' }));
  state.workflows = [1, 2].map((id) => ({ order_no: `RNT-${id}`,
    payment_status: 'submitted' }));
  state.evidence = [1, 2].map((id) => ({ id, business_ref: `RNT-${id}`,
    uploader_user_id: 3, filename: 'rental_3_1700000000000.png',
    expected_amount: 2, status: 'submitted' }));
  const base = await serve(t);
  const admin = issueSessionToken(99, 0, process.env.JWT_SECRET);
  const review = (id) => fetch(`${base}/api/admin/rental/orders/RNT-${id}/review-payment`, {
    method: 'PUT', headers: { Authorization: `Bearer ${admin}`,
      'Content-Type': 'application/json' },
    body: JSON.stringify({ approved: true, payment_reference: 'PAY-1234' })
  });
  assert.equal((await review(1)).status, 200);
  assert.equal((await review(2)).status, 409);
  assert.equal(state.workflows[1].payment_status, 'submitted');
  assert.equal(state.evidence[1].status, 'submitted');
  state.orders[0].status = 'active';
  state.orders[1].status = 'active';
  state.workflows[1].payment_status = 'paid';
  const refund = (id) => fetch(`${base}/api/admin/rental/orders/RNT-${id}/confirm-refund`, {
    method: 'PUT', headers: { Authorization: `Bearer ${admin}`,
      'Content-Type': 'application/json' },
    body: JSON.stringify({ refunded_amount: 2, refund_reference: 'BANK-REF-1234' })
  });
  assert.equal((await refund(1)).status, 200);
  assert.equal((await refund(2)).status, 409);
  assert.equal(state.orders[1].status, 'active');
  assert.equal(state.reviews.length, 1);
});
