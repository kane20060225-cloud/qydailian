'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {requestDeletion,reviewDeletion}=require('../lib/order-deletion');
const {decorateOrder}=require('../lib/order-center');
const {purgeEligibility,changeRemoval}=require('../lib/order-cleanup');
const {createOrderCenterRouter}=require('../routes/order-center');
function fixture(type='third_party'){
 const state={native:{id:1,creator_id:7,user_id:7,booster_id:type==='boost'?9:null,hall_status:type==='boost'?'taken':null},order:{order_type:type,order_ref:'TEST',customer_id:7,state:type==='boost'?'exception':'in_progress',payment_status:'unpaid',admin_task:null,created_at:new Date().toISOString()},request:null,removed:null,events:[],audit:[]};
 const queries=[];let saved,failAudit=false;
 const conn={beginTransaction:async()=>{saved=structuredClone(state);},commit:async()=>{},rollback:async()=>Object.assign(state,saved),release(){},execute:async(sql,p=[])=>{
  queries.push(sql);
  if(sql.startsWith('SELECT * FROM orders')||sql.startsWith('SELECT * FROM third_party_orders'))return [[state.native]];
  if(sql.startsWith('SELECT c.'))return [[{...state.order,deletion_status:state.request?.status,deletion_requested_at:state.request?.created_at,retention_protected:state.request?.retain_records||0,removed_at:state.removed?.removed_at}]];
  if(sql.startsWith('SELECT * FROM order_deletion_requests'))return [state.request?[state.request]:[]];
  if(sql.startsWith('INSERT INTO order_deletion_requests')){
   if(sql.includes("VALUES (?,?,?,?,'pending'"))state.request={...state.request,status:'pending',requester_user_id:p[2],reason:p[3],state_snapshot:p[4],payment_snapshot:p[5],created_at:new Date().toISOString()};
   else state.request={...state.request,status:'approved',reason:p[2],retain_records:1,review_note:p[6],evidence_reference:p[7]};return [{affectedRows:1}];
  }
  if(sql.startsWith('UPDATE order_deletion_requests')){state.request.status='rejected';state.request.review_note=p[1];return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO order_removals')){state.removed={removed_at:new Date().toISOString(),state_snapshot:p[4],payment_snapshot:p[5]};return [{affectedRows:1}];}
  if(sql.startsWith('DELETE FROM order_removals')){state.removed=null;return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO order_management_events')){state.events.push(p);return [{affectedRows:1}];}
  throw Error('Unexpected SQL '+sql.slice(0,80));
 }};
 const pool={getConnection:async()=>conn};const recordOperation=async(conn,event)=>{if(failAudit)throw Error('audit unavailable');state.audit.push(event);};
 const deps={pool,recordOperation,type,ref:'TEST',actor:7,role:'booster',reason:'重复提交，保留另一笔订单'};
 const review={...deps,actor:1,decision:'approve',reason:'核对确属重复且无需继续履约',reference:'另一笔 TEST-VALID',confirmation:'REVIEWED_REMOVAL_RETAINS_ALL_RECORDS',expectedState:state.order.state,expectedPayment:'unpaid'};
 return {state,queries,pool,recordOperation,deps,review,setFailAudit:value=>failAudit=value};
}
test('only the submitting booster can request third-party deletion, without hiding or changing the order',async()=>{
 const f=fixture();await assert.rejects(()=>requestDeletion({...f.deps,actor:8}),/自己提交/);await assert.rejects(()=>requestDeletion({...f.deps,role:'user'}),/自己提交/);
 await requestDeletion(f.deps);assert.equal(f.state.request.status,'pending');assert.equal(f.state.removed,null);assert.equal(f.state.order.state,'in_progress');assert.equal(f.state.audit.length,1);
 assert.equal((await requestDeletion(f.deps)).already_requested,true);assert.equal(f.state.audit.length,1);
 const row={...f.state.order,deletion_status:'pending',deletion_requested_at:new Date().toISOString()};assert.equal(decorateOrder(row,1,true).admin_task,'deletion');assert.ok(decorateOrder(row,1,true).actions.includes('review_deletion'));assert.equal(decorateOrder(row,7,false).actions.includes('request_deletion'),false);
});
test('reviewed approval retains all records, no state/payment/balance writes, and can be restored',async()=>{
 const f=fixture();await requestDeletion(f.deps);await reviewDeletion(f.review);assert.ok(f.state.removed);assert.equal(f.state.request.retain_records,1);assert.equal(f.state.order.state,'in_progress');assert.equal(f.state.order.payment_status,'unpaid');
 assert.equal(f.queries.some(q=>/^(INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?(?:orders|third_party_orders|account_ledger|users)\b/.test(q)),false);
 assert.equal(purgeEligibility({order_type:'third_party',state:'pending',payment_status:'unpaid',retention_protected:1}),false);
 await changeRemoval({...f.deps,actor:1,restore:true});assert.equal(f.state.removed,null);assert.equal(f.state.request.retain_records,1);
});
test('rejection keeps order visible with an explanation and allows a new application',async()=>{
 const f=fixture();await requestDeletion(f.deps);await reviewDeletion({...f.review,decision:'reject',reason:'两个外部订单不同，请核对'});assert.equal(f.state.removed,null);assert.equal(f.state.request.status,'rejected');assert.match(f.state.request.review_note,/外部订单不同/);await requestDeletion({...f.deps,reason:'已核对外部订单相同'});assert.equal(f.state.request.status,'pending');
});
test('stale state, missing attestation and audit failure cannot partly delete an order',async()=>{
 const f=fixture();await requestDeletion(f.deps);
 await assert.rejects(()=>reviewDeletion({...f.review,confirmation:''}),/确认/);await assert.rejects(()=>reviewDeletion({...f.review,expectedPayment:'paid'}),/状态已变化/);assert.equal(f.state.removed,null);
 f.setFailAudit(true);await assert.rejects(()=>reviewDeletion(f.review),/audit unavailable/);assert.equal(f.state.removed,null);assert.equal(f.state.request.status,'pending');
});
test('assigned unpaid historical boost exceptions get reviewed removal without fabricated payment or refunds',async()=>{
 const f=fixture('boost');await reviewDeletion({...f.review,decision:'remove'});assert.ok(f.state.removed);assert.equal(f.state.native.booster_id,9);assert.equal(f.state.native.hall_status,'taken');assert.equal(f.state.order.payment_status,'unpaid');assert.equal(f.state.request.retain_records,1);
 const actions=decorateOrder({...f.state.order,amount:7.8},1,true).actions;assert.ok(actions.includes('reviewed_remove'));assert.equal(decorateOrder({...f.state.order,amount:7.8},7,false).actions.includes('boost_payment'),false);
});
test('deletion review API is admin-only, including ordinary customers who own the order',async t=>{
 let role='booster';const app=express();app.use(express.json());app.use('/api/order-center',createOrderCenterRouter({pool:{execute:async()=>[[{role}]]},authMiddleware:(req,res,next)=>{req.userId=7;next();},recordOperation:async()=>{}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const url=`http://127.0.0.1:${server.address().port}/api/order-center/third_party/TEST/deletion-review`;
 assert.equal((await fetch(url,{method:'POST'})).status,403);role='user';assert.equal((await fetch(url,{method:'POST'})).status,403);
});
