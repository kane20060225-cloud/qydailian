'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {operational,guidance}=require('../lib/order-guidance');
const {decorateMetrics}=require('../lib/order-metrics');
const {parseFilters,sortClause,decorateOrder}=require('../lib/order-center');
const {createOrderCenterRouter}=require('../routes/order-center');

test('waiting reminders use stage evidence, explicitly distinguish historical creation ages and do not change state',()=>{
 const now=Date.parse('2026-09-16T12:00:00Z');
 const base={order_type:'boost',state:'payment_review',admin_task:'payment',created_at:'2026-09-14T00:00:00Z',stage_recorded_at:'2026-09-16T11:00:00Z'};
 const recent=operational(base,now);assert.equal(recent.waiting_hours,1);assert.equal(recent.overdue,false);assert.equal(recent.waiting_basis,'stage');
 const historical=operational({...base,stage_recorded_at:null},now);assert.equal(historical.waiting_basis,'created');assert.equal(historical.overdue,true);assert.equal(base.state,'payment_review');
 assert.equal(operational({...base,state:'dispute'},now).priority,3);
});
test('payment review guidance tells the customer to wait rather than repay, and admin to verify',()=>{
 const order=decorateOrder({order_type:'boost',customer_id:7,state:'payment_review',payment_status:'pending',admin_task:'payment',created_at:new Date().toISOString()},7,false);
 const user=guidance(order,{userId:7});assert.equal(user.needs_action,false);assert.match(user.next,/无需重复付款/);assert.match(user.headline,/等待管理员核实/);assert.equal(order.actions.includes('boost_payment'),false);
 const admin=guidance(order,{userId:1,admin:true});assert.equal(admin.needs_action,true);assert.match(admin.next,/真实收款/);
});
test('rental rejection and disputes present actual reasons and actionable guidance',()=>{
 const base={order_type:'rental',customer_id:7,related_user_id:9,state:'pending_payment',payment_status:'rejected',created_at:new Date().toISOString()};
 const rejected=guidance(base,{userId:7,details:[{label:'付款驳回原因',value:'截图不是本次交易'}]});assert.equal(rejected.needs_action,true);assert.equal(rejected.reason,'截图不是本次交易');assert.match(rejected.headline,/被驳回/);
 const dispute=guidance({...base,state:'dispute',payment_status:'paid'},{userId:7,details:[{label:'争议原因',value:'坦克清单与账号不符'}]});assert.equal(dispute.reason,'坦克清单与账号不符');assert.match(dispute.next,/租号处理入口/);
});
test('latest events and registered expected dates supply real update times and delay reminders without invented promises',()=>{
 const old=new Date(Date.now()-86400000).toISOString(),latest=new Date().toISOString();
 const result=guidance({order_type:'third_party',state:'in_progress',created_at:old},{events:[{created_at:latest}],details:[{label:'预计完成',value:old}]});assert.equal(result.last_updated_at,latest);assert.equal(result.delayed,true);assert.match(result.feedback,/已超过预计时间/);
 const unknown=guidance({state:'in_progress',created_at:old});assert.match(unknown.feedback,/尚未确认/);
});
test('admin sorts are whitelisted and prioritize unresolved funds, with oldest waiting order as tie breaker',()=>{
 assert.throws(()=>parseFilters({sort:'newest; DROP TABLE orders'}));
 const sql=sortClause(parseFilters({}),true);assert.match(sql,/dispute','exception','credit_pending/);assert.match(sql,/submitted_at/);assert.match(sql,/ASC,c.order_type,c.order_ref/);
 assert.match(sortClause(parseFilters({sort:'waiting'}),true),/admin_task END IS NOT NULL/);
 assert.match(sortClause(parseFilters({}),false),/created_at DESC/);
});
test('operating metrics have explicit denominators and missing timing samples remain null',()=>{
 const metrics=decorateMetrics({assignment_hours:null,completion_hours:'4.126',completion_samples:2,paid_rentals:20,disputed_rentals:2,paying_customers:10,repeat_customers:3});assert.equal(metrics.assignment_hours,null);assert.equal(metrics.completion_hours,4.13);assert.equal(metrics.dispute_rate,10);assert.equal(metrics.repeat_rate,30);
 assert.equal(decorateMetrics({}).repeat_rate,null);
});
test('fully discounted boost orders retain manual review without asking for a zero-value transfer',()=>{
 const row={order_type:'boost',state:'payment_review',payment_status:'unpaid',amount:0,customer_id:7,admin_task:'payment',created_at:new Date().toISOString()};
 const customer=decorateOrder(row,7,false);assert.equal(customer.actions.includes('boost_payment'),false);assert.equal(customer.actions.includes('cancel_unpaid'),true);
 assert.equal(decorateOrder(row,1,true).actions.includes('boost_confirm_payment'),true);
 assert.match(guidance(customer,{userId:7}).next,/无需转账/);assert.equal(guidance(customer,{userId:7}).needs_action,false);
});
test('metrics endpoint is restricted to explicit authenticated admin scope',async t=>{
 let queries=0;const pool={execute:async sql=>sql.startsWith('SELECT role')?[[{role:pool.role}]]:(queries++,[[{orders_count:2}]])};pool.role='user';
 const app=express();app.use('/api/order-center',createOrderCenterRouter({pool,authMiddleware:(req,res,next)=>{req.userId=7;next();},recordOperation:async()=>{},revealOrderCredentials:x=>x}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}/api/order-center/metrics`;
 assert.equal((await fetch(base)).status,403);assert.equal((await fetch(base+'?scope=admin')).status,403);assert.equal(queries,0);pool.role='admin';assert.equal((await fetch(base)).status,403);const res=await fetch(base+'?scope=admin');assert.equal(res.status,200);assert.equal((await res.json()).orders_count,2);assert.equal(queries,1);
});
test('rental detail puts real dispute notes, latest update and actual activation period in its response',async t=>{
 const started='2026-09-16T08:00:00.000Z',updated='2026-09-16T09:00:00.000Z';
 const row={order_type:'rental',order_ref:'RNT-GUIDANCE',customer_id:7,related_user_id:8,assignee_name:'测试出租方',state:'dispute',payment_status:'paid',admin_task:'refund',amount:4,created_at:started};
 const pool={execute:async sql=>{
   if(sql.startsWith('SELECT role'))return [[{role:'user'}]];
   if(sql.startsWith('SELECT c.*'))return [[row]];
   if(sql.startsWith('SELECT * FROM rental_orders'))return [[{quantity:2,rental_type:'hour',credits_used:0}]];
   if(sql.includes('FROM order_management_events'))return [[{action:'rental_activated',created_at:started},{action:'rental_disputed',note:'交接账号的坦克不符',created_at:updated}]];
   return [[]];
 }};
 const app=express();app.use('/api/order-center',createOrderCenterRouter({pool,authMiddleware:(req,res,next)=>{req.userId=7;next();},recordOperation:async()=>{},revealOrderCredentials:x=>x}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const res=await fetch(`http://127.0.0.1:${server.address().port}/api/order-center/rental/RNT-GUIDANCE`);assert.equal(res.status,200);const data=await res.json();assert.equal(data.guidance.reason,'交接账号的坦克不符');assert.equal(data.guidance.last_updated_at,updated);assert.ok(data.details.find(d=>d.label==='实际起租时间'));assert.ok(data.details.find(d=>d.label==='约定到期时间'));
});
