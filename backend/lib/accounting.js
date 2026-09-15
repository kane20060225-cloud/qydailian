'use strict';

const ACCOUNTS = Object.freeze({
  qy_credits: { column: 'qy_credits', integer: true },
  chest_tickets: { column: 'chest_tickets', integer: true },
  booster_points: { column: 'booster_points', integer: true },
  earnings: { column: 'earnings', integer: false },
  rental_earnings: { column: 'rental_earnings', integer: false },
  balance: { column: 'balance', integer: false }
});

function safeAmount(value, integer) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 1e12 ||
      (integer && !Number.isSafeInteger(number)) ||
      (!integer && Math.round(number * 100) / 100 !== number)) {
    throw new Error('Invalid account amount');
  }
  return number;
}

async function postAccountDelta(conn, {
  userId, accountType, delta, entryKey, sourceType, sourceRef, actorUserId = null
}) {
  const account = ACCOUNTS[accountType];
  if (!account || !Number.isSafeInteger(Number(userId)) || Number(userId) <= 0 ||
      !entryKey || !sourceType || !sourceRef) {
    throw new Error('Invalid account entry');
  }
  const amount = safeAmount(delta, account.integer);
  if (amount === 0) throw new Error('Zero account entry is not allowed');
  const [rows] = await conn.execute(
    `SELECT ${account.column} AS balance FROM users WHERE id = ? FOR UPDATE`, [userId]
  );
  if (rows.length !== 1) throw new Error('Account owner not found');
  const before = safeAmount(rows[0].balance, account.integer);
  const after = account.integer
    ? before + amount
    : Math.round((before + amount) * 100) / 100;
  if (after < 0 || !Number.isSafeInteger(account.integer ? after : Math.round(after * 100))) {
    throw new Error('Insufficient account balance');
  }
  await conn.execute(`UPDATE users SET ${account.column} = ? WHERE id = ?`, [after, userId]);
  await conn.execute(
    `INSERT INTO account_ledger
     (entry_key, user_id, account_type, amount_delta, balance_after, source_type, source_ref, actor_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [entryKey, userId, accountType, amount, after, sourceType, sourceRef, actorUserId]
  );
  return after;
}

async function recordAppliedDelta(conn, {
  userId, accountType, delta, entryKey, sourceType, sourceRef, actorUserId = null
}) {
  const account = ACCOUNTS[accountType];
  if (!account || !entryKey || !sourceType || !sourceRef) {
    throw new Error('Invalid applied account entry');
  }
  const amount = safeAmount(delta, account.integer);
  if (amount === 0) throw new Error('Zero account entry is not allowed');
  const [rows] = await conn.execute(
    `SELECT ${account.column} AS balance FROM users WHERE id = ? FOR UPDATE`, [userId]
  );
  if (rows.length !== 1) throw new Error('Account owner not found');
  const after = safeAmount(rows[0].balance, account.integer);
  if (after < 0) throw new Error('Invalid resulting account balance');
  await conn.execute(
    `INSERT INTO account_ledger
     (entry_key, user_id, account_type, amount_delta, balance_after, source_type, source_ref, actor_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [entryKey, userId, accountType, amount, after, sourceType, sourceRef, actorUserId]
  );
  return after;
}

async function recordOperation(conn, {
  eventKey, actorUserId = null, action, targetType, targetRef
}) {
  if (!eventKey || !action || !targetType || !targetRef) {
    throw new Error('Invalid audit event');
  }
  await conn.execute(
    `INSERT INTO operation_audit
     (event_key, actor_user_id, action, target_type, target_ref)
     VALUES (?, ?, ?, ?, ?)`,
    [eventKey, actorUserId, action, targetType, targetRef]
  );
}

module.exports = { postAccountDelta, recordAppliedDelta, recordOperation };
