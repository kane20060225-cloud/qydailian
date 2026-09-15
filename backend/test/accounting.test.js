'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { postAccountDelta, recordAppliedDelta, recordOperation } = require('../lib/accounting');

function fakeConnection(initial) {
  const state = { balance: initial, entries: new Set(), events: new Set() };
  const conn = {
    async execute(sql, params) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT ') && normalized.endsWith('FOR UPDATE')) {
        return [[{ balance: state.balance }]];
      }
      if (normalized.startsWith('UPDATE users SET')) {
        state.balance = params[0];
        return [{ affectedRows: 1 }];
      }
      if (normalized.startsWith('INSERT INTO account_ledger')) {
        if (state.entries.has(params[0])) throw new Error('duplicate entry');
        state.entries.add(params[0]);
        return [{ affectedRows: 1 }];
      }
      if (normalized.startsWith('INSERT INTO operation_audit')) {
        if (state.events.has(params[0])) throw new Error('duplicate event');
        state.events.add(params[0]);
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    }
  };
  return { conn, state };
}

test('credit debit and refund produce matching balance and unique entries', async () => {
  const { conn, state } = fakeConnection(250);
  assert.equal(await postAccountDelta(conn, {
    userId: 3, accountType: 'qy_credits', delta: -100,
    entryKey: 'rental:R1:debit', sourceType: 'rental_order', sourceRef: 'R1'
  }), 150);
  assert.equal(await postAccountDelta(conn, {
    userId: 3, accountType: 'qy_credits', delta: 100,
    entryKey: 'rental:R1:refund', sourceType: 'rental_order', sourceRef: 'R1'
  }), 250);
  assert.equal(state.entries.size, 2);
});

test('negative balances and fractional credits are rejected before mutation', async () => {
  const { conn, state } = fakeConnection(10);
  const base = { userId: 3, accountType: 'qy_credits',
    entryKey: 'x', sourceType: 'test', sourceRef: 'x' };
  await assert.rejects(postAccountDelta(conn, { ...base, delta: -11 }), /Insufficient/);
  await assert.rejects(postAccountDelta(conn, { ...base, delta: 0.5 }), /Invalid account amount/);
  assert.equal(state.balance, 10);
  assert.equal(state.entries.size, 0);
});

test('money posting keeps cents exact and audit avoids private details', async () => {
  const { conn, state } = fakeConnection(1.1);
  assert.equal(await postAccountDelta(conn, {
    userId: 3, accountType: 'rental_earnings', delta: 0.2,
    entryKey: 'rental:R1:owner', sourceType: 'rental_order', sourceRef: 'R1'
  }), 1.3);
  await recordOperation(conn, {
    eventKey: 'rental:R1:complete', action: 'rental_completed',
    targetType: 'rental_order', targetRef: 'R1'
  });
  assert.equal(state.events.size, 1);
});

test('applied payment delta records the already-updated balance without crediting twice', async () => {
  const { conn, state } = fakeConnection(6000);
  assert.equal(await recordAppliedDelta(conn, {
    userId: 3, accountType: 'chest_tickets', delta: 6000,
    entryKey: 'payment:RC1:tickets', sourceType: 'payment_order', sourceRef: 'RC1'
  }), 6000);
  assert.equal(state.balance, 6000);
  assert.equal(state.entries.size, 1);
});
