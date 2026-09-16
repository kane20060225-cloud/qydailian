'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {purgeEligibility,purgeExpiredTrash,createCleanupService,TRASH_RETENTION_DAYS}=require('../lib/order-cleanup');
test('permanent trash expiry protects funded, ongoing and unverified payment orders',()=>{
  assert.equal(TRASH_RETENTION_DAYS,14);
  const order={order_type:'boost',state:'pending_payment',payment_status:'unpaid'};
  assert.equal(purgeEligibility(order),true);
  for(const status of ['paid','pending','submitted'])assert.equal(purgeEligibility({...order,payment_status:status}),false);
  assert.equal(purgeEligibility({order_type:'rental',state:'in_progress',payment_status:'unpaid'}),false);
  assert.equal(purgeEligibility({order_type:'recharge',state:'pending_payment',payment_status:'unpaid'}),false);
  assert.equal(purgeEligibility({order_type:'recharge',state:'closed',payment_status:'closed',provider_status:'TRADE_CLOSED'}),true);
  assert.equal(purgeEligibility({order_type:'shop',state:'completed',payment_status:'paid'}),false);
});
test('trash expiry runs while invalid-order cleanup is disabled; manual preview cleanup does not purge trash',async()=>{
  let expiryQueries=0;
  const pool={execute:async sql=>{
    if(sql.startsWith('SELECT enabled'))return [[{enabled:0,retention_days:7}]];
    if(sql.includes('c.removed_at<=DATE_SUB')){expiryQueries++;assert.match(sql,/INTERVAL 14 DAY/);assert.match(sql,/NOT EXISTS.*account_ledger/s);return [[]];}
    if(sql.includes('c.removed_at IS NULL'))return [[]];throw Error(sql);
  }};
  const service=createCleanupService({pool,recordOperation:async()=>{}});
  const automatic=await service.run();assert.equal(automatic.disabled,true);assert.equal(automatic.purged,0);assert.equal(expiryQueries,1);
  await service.run(1,true);assert.equal(expiryQueries,1);
  assert.deepEqual(await purgeExpiredTrash({pool}),{purged:0,protected_count:0});
});
