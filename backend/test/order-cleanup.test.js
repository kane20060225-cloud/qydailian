'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {removable,settingsInput,changeRemoval}=require('../lib/order-cleanup');
const {decorateOrder,parseFilters,filterClause}=require('../lib/order-center');
const {createOrderCenterRouter}=require('../routes/order-center');
test('cleanup eligibility excludes ongoing work, evidence review and payment exceptions',()=>{
  for(const state of ['in_progress','awaiting_acceptance','payment_review','exception','credit_pending','awaiting_activation','dispute'])assert.equal(removable({order_type:'boost',state,payment_status:'unpaid'}),false);
  assert.equal(removable({order_type:'rental',state:'pending_payment',payment_status:'unpaid'}),false);
  assert.equal(removable({order_type:'recharge',state:'pending_payment',payment_status:'unpaid'}),true);
  assert.equal(removable({order_type:'shop',state:'completed',payment_status:'paid'}),true);
  assert.deepEqual(decorateOrder({order_type:'boost',state:'pending_payment',removed_at:new Date()},1,true).actions,['restore']);
});
test('trash cannot be selected by ordinary users and removal snapshots invalidate when status changes',()=>{
  const f=parseFilters({trash:'1'});
  const ordinary=filterClause(f,{admin:false,userId:2,role:'user'});
  assert.match(ordinary.sql,/state_snapshot=c.state/);assert.match(ordinary.sql,/ELSE NULL END IS NULL/);
  assert.match(filterClause(f,{admin:true}).sql,/ELSE NULL END IS NOT NULL/);
  assert.equal(filterClause(f,{admin:true}).sql.includes('a.archived_at'),false);
});
test('automatic settings require explicit booleans and a bounded retention period',()=>{
  for(const body of [{enabled:'true',retention_days:7},{enabled:true,retention_days:6},{enabled:false,retention_days:91},{enabled:true,retention_days:7.5}])assert.throws(()=>settingsInput(body));
  assert.deepEqual(settingsInput({enabled:false,retention_days:7}),{enabled:false,retention_days:7});
});
test('locked funded or assigned unpaid orders cannot be removed and failed audit rolls back metadata',async()=>{
  let funded=true,assigned=false,rollback=0,commits=0,inserts=0;
  const conn={beginTransaction:async()=>{},commit:async()=>{commits++;},rollback:async()=>{rollback++;},release(){},execute:async(sql)=>{
    if(sql.startsWith('SELECT * FROM orders')){assert.match(sql,/FOR UPDATE$/);return [[{booster_id:assigned?3:null,hall_status:null}]];}
    if(sql.startsWith('SELECT c.'))return [[{order_type:'boost',order_ref:'TEST',state:'pending_payment',payment_status:'unpaid'}]];
    if(sql.startsWith('SELECT id FROM account_ledger'))return [funded?[{id:1}]:[]];
    if(sql.startsWith('SELECT id FROM manual_payment_evidence'))return [[]];
    if(sql.startsWith('INSERT')){inserts++;return [{}];}throw Error(sql);
  }};
  const deps={pool:{getConnection:async()=>conn},recordOperation:async()=>{throw Error('audit failed');},type:'boost',ref:'TEST',actor:1,reason:'测试订单'};
  await assert.rejects(()=>changeRemoval(deps),/资金流水/);assert.equal(inserts,0);
  funded=false;assigned=true;await assert.rejects(()=>changeRemoval(deps),/接单/);assert.equal(inserts,0);
  assigned=false;await assert.rejects(()=>changeRemoval(deps),/audit failed/);assert.equal(commits,0);assert.equal(rollback,3);
});
test('cleanup and batch deletion endpoints are admin-only and reject invalid selections',async t=>{
  let role='user';const app=express();app.use(express.json());app.use(createOrderCenterRouter({pool:{execute:async()=>[[{role}]]},authMiddleware:(req,res,next)=>{req.userId=2;next();},recordOperation:async()=>{}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;
  for(const [path,method] of [['/cleanup','GET'],['/cleanup','PUT'],['/cleanup/run','POST'],['/removals','POST']])assert.equal((await fetch(base+path,{method})).status,403);
  role='admin';for(const orders of [[],Array(26).fill({type:'boost',ref:'x'}),[{type:'boost',ref:'x'},{type:'boost',ref:'x'}],[{type:'users',ref:'x'}]])
    assert.equal((await fetch(base+'/removals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orders,reason:'test',action:'remove'})})).status,400);
});
