'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { cancelUnpaid, resolveRecharge, closeExpired, timeoutSettings } = require('../lib/order-lifecycle');
const { decorateOrder } = require('../lib/order-center');
const { createOrderCenterRouter } = require('../routes/order-center');
const { recordOperation } = require('../lib/accounting');

const REF = 'RC1700000000000LIFECYCLE';
function fixture(options = {}) {
  const state = { order: { id: 1, order_no: REF, out_trade_no: REF, user_id: 7, renter_id: 7, owner_id: 8,
    status: 'pending', payment_status: 'unpaid', credits_used: 0, expired: 1, amount: '6.00', alipay_trade_no: null, ...options.order },
    workflow: options.workflow || {}, ledger: options.ledger || [], resolutions: [], evidence: options.evidence || [], reviews: options.reviews || [],
    removed: options.removed || [], balance: 100, tickets: 20, events: [], audit: [], failAudit: false };
  let tail = Promise.resolve();
  const pool = { execute: async(sql) => {
    if (sql.startsWith('SELECT timeout_enabled')) return [[]];
    if (sql.startsWith('SELECT role')) return [[{role: 'admin'}]];
    throw Error(sql);
  }, getConnection: async() => {
    let snapshot, unlock;
    return {
      async beginTransaction() { const previous = tail; tail = new Promise(r => { unlock = r; }); await previous; snapshot = structuredClone(state); },
      async commit() { snapshot = null; },
      async rollback() { if (snapshot) Object.assign(state, snapshot); snapshot = null; },
      release() { unlock?.(); },
      async execute(sql, p = []) {
        if (sql.startsWith('SELECT *,created_at') || sql.startsWith('SELECT * FROM payment_orders')) { assert.match(sql, /FOR UPDATE$/); return [[{...state.order}]]; }
        if (sql.startsWith('SELECT order_ref FROM order_removals')) return [state.removed];
        if (sql.startsWith('SELECT * FROM rental_order_workflow') || sql.startsWith('SELECT * FROM recharge_order_workflow')) return [[{...state.workflow}]];
        if (sql.startsWith('SELECT order_no FROM rental_payment_reviews')) return [state.reviews];
        if (sql.startsWith('SELECT id FROM manual_payment_evidence')) return [state.evidence];
        if (sql.startsWith('SELECT * FROM account_ledger')) return [structuredClone(state.ledger)];
        if (sql.startsWith('SELECT * FROM recharge_order_resolutions')) return [structuredClone(state.resolutions)];
        if (sql.startsWith('SELECT qy_credits AS balance')) return [[{balance: state.balance}]];
        if (sql.startsWith('SELECT chest_tickets AS balance')) return [[{balance: state.tickets}]];
        if (sql.startsWith('UPDATE users SET qy_credits')) { state.balance = p[0]; return [{}]; }
        if (sql.startsWith('UPDATE users SET chest_tickets')) { state.tickets = p[0]; return [{}]; }
        if (sql.startsWith('INSERT INTO account_ledger')) {
          if (state.ledger.some(l => l.entry_key === p[0])) throw Error('duplicate entry');
          state.ledger.push({entry_key:p[0],user_id:p[1],account_type:p[2],amount_delta:p[3],balance_after:p[4],source_type:p[5],source_ref:p[6]}); return [{}];
        }
        if (sql.startsWith('UPDATE orders SET status') || sql.startsWith('UPDATE rental_orders SET status')) { state.order.status = 'cancelled'; return [{}]; }
        if (sql.startsWith('UPDATE payment_orders SET status')) { state.order.status='paid';state.order.alipay_trade_no=p[0];return [{}]; }
        if (sql.startsWith('INSERT INTO recharge_order_workflow')) { state.workflow.provider_status=p[2];return [{}]; }
        if (sql.startsWith('INSERT INTO recharge_order_resolutions')) { state.resolutions=[{out_trade_no:p[0],outcome:p[1],status_snapshot:p[2],trade_snapshot:p[3]}];return [{}]; }
        if (sql.startsWith('INSERT INTO order_management_events')) { state.events.push(p);return [{}]; }
        if (sql.startsWith('INSERT INTO operation_audit')) { if(state.failAudit)throw Error('audit failure');state.audit.push(p);return [{}]; }
        throw Error(sql);
      }
    };
  }};
  const deps={pool,recordOperation,ref:REF,actor:7};
  return {state,pool,cancel:(extra={})=>cancelUnpaid({...deps,type:'boost',reason:'取消测试订单',...extra}),
    resolve:(extra={})=>resolveRecharge({...deps,actor:1,outcome:'historical_credited',reason:'核对历史订单',reference:'旧版发券记录已核对',confirmation:'REVIEWED_PAYMENT_AND_TICKETS',...extra})};
}
function debit(type='boost', delta=-50) {return {entry_key:`${type==='boost'?'order':'rental'}:${REF}:credits_debit`,user_id:7,account_type:'qy_credits',amount_delta:delta};}
function sdk(status='TRADE_SUCCESS',amount='6.00',tradeNo='test-trade') {
  return {exec:async(method,p,opts)=>{assert.equal(method,'alipay.trade.query');assert.equal(p.bizContent.out_trade_no,REF);assert.equal(opts.validateSign,true);
    return {code:'10000',outTradeNo:REF,tradeNo,tradeStatus:status,totalAmount:amount};}};
}

test('cancel refunds original reserved credits once, including concurrent requests',async()=>{
  const f=fixture({ledger:[debit()]});
  const results=await Promise.all([f.cancel(),f.cancel()]);
  assert.equal(results.filter(r=>r.already_closed).length,1);assert.equal(f.state.balance,150);
  assert.equal(f.state.order.status,'cancelled');assert.equal(f.state.ledger.length,2);assert.equal(f.state.events.length,1);
  assert.equal(f.state.ledger[1].entry_key,`order:${REF}:credits_refund`);
});
test('cancel rejects a different user, assigned work, payment evidence and unrelated funds without mutations',async()=>{
  for(const options of [{order:{user_id:8}},{order:{booster_id:3}},{order:{hall_status:'open'}},{order:{payment_status:'pending'}},{order:{payment_status:'paid'}},{evidence:[{id:1}]},{removed:[{order_ref:REF}]},{ledger:[{...debit(),entry_key:'unrelated'}]}]){
    const f=fixture(options);await assert.rejects(()=>f.cancel());assert.equal(f.state.order.status,'pending');assert.equal(f.state.balance,100);assert.equal(f.state.audit.length,0);
  }
});
test('cancellation rolls back refund and close if audit cannot be recorded',async()=>{
  const f=fixture({ledger:[debit()]});f.state.failAudit=true;await assert.rejects(()=>f.cancel(),/audit failure/);
  assert.equal(f.state.balance,100);assert.equal(f.state.order.status,'pending');assert.equal(f.state.ledger.length,1);
});
test('rental cancellation matches original credit debit and protects missing historical entries',async()=>{
  const f=fixture({order:{credits_used:50},ledger:[debit('rental')]});await f.cancel({type:'rental'});assert.equal(f.state.balance,150);
  for(const options of [{order:{credits_used:50}},{workflow:{payment_status:'submitted'}},{reviews:[{order_no:REF}]},{workflow:{disputed_at:'2026-09-16'}}]){
    const blocked=fixture(options);await assert.rejects(()=>blocked.cancel({type:'rental'}));assert.equal(blocked.state.balance,100);
  }
});
test('timeout is disabled by default and cannot close a younger order',async()=>{
  const f=fixture({order:{expired:0}});assert.deepEqual(await timeoutSettings(f.pool),{enabled:false,hours:24});
  assert.equal((await closeExpired({pool:f.pool,recordOperation})).disabled,true);
  await assert.rejects(()=>f.cancel({timeout:true,admin:true}),/尚未超过/);assert.equal(f.state.order.status,'pending');
});
test('historical credited resolution records evidence without adding tickets or fabricated ledger',async()=>{
  const f=fixture({order:{status:'paid'}});await f.resolve();assert.equal(f.state.tickets,20);assert.equal(f.state.ledger.length,0);
  assert.equal(f.state.resolutions[0].outcome,'historical_credited');assert.equal(f.state.audit.length,1);
  await assert.rejects(()=>f.resolve(),/已有核销/);assert.equal(f.state.tickets,20);
});
test('historic references up to 64 characters keep audit keys within the database limit',async()=>{
  const ref='H'.repeat(64);const f=fixture({order:{status:'paid',out_trade_no:ref}});await f.resolve({ref});
  assert.ok(f.state.audit[0][0].length<=128);assert.equal(f.state.audit[0][4],ref);
});
test('pure unpaid test resolution closes with metadata while preserving original payment record',async()=>{
  const f=fixture({order:{status:'paid'}});await f.resolve({outcome:'test_closed'});
  assert.equal(f.state.order.status,'paid');assert.equal(f.state.tickets,20);assert.equal(f.state.ledger.length,0);assert.equal(f.state.resolutions[0].outcome,'test_closed');
});
test('test closure rejects known success or an open provider trade',async()=>{
  const f=fixture({order:{status:'paid'},workflow:{provider_status:'TRADE_SUCCESS'}});await assert.rejects(()=>f.resolve({outcome:'test_closed'}),/支付成功/);
  const waiting=fixture({order:{status:'paid'}});await assert.rejects(()=>waiting.resolve({outcome:'test_closed',alipaySdk:sdk('WAIT_BUYER_PAY')}),/尚未关闭/);
  assert.equal(f.state.resolutions.length,0);assert.equal(waiting.state.tickets,20);
});
test('ticket backfill requires signed successful provider result and matching amount/reference',async()=>{
  for(const alipaySdk of [undefined,sdk('TRADE_CLOSED'),sdk('TRADE_SUCCESS','0.01'),sdk('TRADE_SUCCESS','6.00','other-trade')]){
    const f=fixture({order:{status:'paid',alipay_trade_no:'test-trade'}});
    await assert.rejects(()=>f.resolve({outcome:'tickets_backfilled',alipaySdk}));assert.equal(f.state.tickets,20);assert.equal(f.state.ledger.length,0);
  }
});
test('backfill commits one unique credit and resolution under concurrent requests',async()=>{
  const f=fixture({order:{status:'paid'}});
  const results=await Promise.allSettled([f.resolve({outcome:'tickets_backfilled',alipaySdk:sdk()}),f.resolve({outcome:'tickets_backfilled',alipaySdk:sdk()})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.state.tickets,10020);
  assert.equal(f.state.ledger.length,1);assert.equal(f.state.ledger[0].entry_key,`payment:${REF}:tickets_credited`);
});
test('backfill rolls back tickets, workflow, resolution and ledger if audit fails',async()=>{
  const f=fixture({order:{status:'closed'},workflow:{provider_status:'TRADE_SUCCESS'}});f.state.failAudit=true;
  await assert.rejects(()=>f.resolve({outcome:'tickets_backfilled',alipaySdk:sdk()}),/audit failure/);
  assert.equal(f.state.tickets,20);assert.equal(f.state.ledger.length,0);assert.equal(f.state.resolutions.length,0);assert.equal(f.state.order.status,'closed');
});
test('resolution blocks existing ledger and missing explicit evidence/confirmation',async()=>{
  const f=fixture({order:{status:'paid'},ledger:[{account_type:'chest_tickets',amount_delta:10000}]});await assert.rejects(()=>f.resolve(),/已有资金流水/);
  const empty=fixture({order:{status:'paid'}});for(const extra of [{confirmation:''},{reference:''},{outcome:'arbitrary'}])await assert.rejects(()=>empty.resolve(extra));
  assert.equal(empty.state.audit.length,0);
});
test('closed orders offer archive/delete but no payment or cancellation, exceptions offer admin review only',()=>{
  const closed={order_type:'boost',customer_id:7,payment_status:'unpaid',state:'closed'};
  assert.deepEqual(decorateOrder(closed,7,false).actions,[]);assert.deepEqual(decorateOrder(closed,1,true).actions,['archive','remove']);
  const abnormal={order_type:'recharge',customer_id:7,business_status:'paid',state:'exception'};
  assert.equal(decorateOrder(abnormal,7,false).actions.includes('resolve_recharge'),false);
  assert.equal(decorateOrder(abnormal,1,true).actions.includes('resolve_recharge'),true);
});
test('HTTP permissions reject user timeout controls and historic resolution; user may cancel only own order',async t=>{
  const f=fixture();const app=express();app.use(express.json());let role='user';
  f.pool.execute=async sql=>{if(sql.startsWith('SELECT role'))return [[{role}]];throw Error(sql);};
  app.use(createOrderCenterRouter({pool:f.pool,recordOperation,authMiddleware:(req,res,next)=>{req.userId=9;next();}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const [path,method] of [['/timeout','GET'],['/timeout','PUT'],['/timeout/run','POST'],[`/recharge/${REF}/resolve`,'POST']])assert.equal((await fetch(base+path,{method})).status,403);
  assert.equal((await fetch(base+`/boost/${REF}/cancel-unpaid`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:'取消'})})).status,404);
  role='admin';assert.equal((await fetch(base+'/timeout/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'CLOSE_PREVIEWED_UNPAID_ORDERS',orders:[]})})).status,400);
});
