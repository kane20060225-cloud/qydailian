'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createNotificationSystem,enqueueHall}=require('../lib/order-notifications');
async function run(kind,states){
 let queued=true,sends=0,reads=0;const updates=[];
 const cfg={id:1,enabled:1,corp_id:'synthetic-corp',agent_id:1,corp_secret:'synthetic-encrypted'};
 const n={id:1,user_id:7,kind,order_ref:'TEST',role:'booster',booster_identity:'gold',new_orders_enabled:1,order_updates_enabled:1,wecom_enabled:1,wecom_user_id:'synthetic-worker',corp_id:cfg.corp_id,agent_id:1,created_at:new Date()};
 const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async q=>{if(q.startsWith('SELECT notification_id')){const rows=queued?[{notification_id:1}]:[];queued=false;return [rows];}return [{affectedRows:1}];}};
 const pool={getConnection:async()=>conn,execute:async q=>{
  if(q.startsWith('SELECT * FROM wecom_notification_config'))return [[cfg]];
  if(q.startsWith('SELECT n.*'))return [[n]];
  if(q.startsWith('SELECT hall_status'))return [[{hall_status:'open',booster_id:null,status:'pending',payment_status:'paid',required_identity:'standard'}]];
  if(q.startsWith('SELECT * FROM booster_availability WHERE')){const online=states[Math.min(reads++,states.length-1)];return [[{mode:'manual',manual_online:online}]];}
  if(q.startsWith('UPDATE notification_deliveries'))updates.push(q);return [{affectedRows:1}];
 }};
 const system=createNotificationSystem({pool,cipher:{decrypt:()=> 'synthetic-secret'},wecomClient:{send:async()=>{sends++;return 'synthetic-message';}},siteUrl:'https://example.test'});
 await system.deliver();return {sends,reads,updates};
}
test('offline boosters receive no new-order WeCom delivery, including queued retries',async()=>{
 const result=await run('new_order',[0]);assert.equal(result.sends,0);assert.ok(result.updates.some(q=>q.includes("status='skipped'")));
});
test('new-order delivery checks online state again immediately before sending',async()=>{
 const result=await run('new_order',[1,0]);assert.equal(result.reads,2);assert.equal(result.sends,0);assert.ok(result.updates.some(q=>q.includes('BOOSTER_OFFLINE')));
 const online=await run('new_order',[1,1]);assert.equal(online.sends,1);
});
test('existing-order notifications continue when the booster is offline',async()=>{
 const result=await run('take_confirmed',[0]);assert.equal(result.sends,1);assert.equal(result.reads,0);
});
test('dispatch queues enterprise invitations only for users online at dispatch time',async()=>{
 let queued;const conn={execute:async(q,p)=>{
  if(q==='SELECT * FROM booster_availability')return [[{user_id:7,mode:'manual',manual_online:1},{user_id:8,mode:'manual',manual_online:0}]];
  if(q.startsWith('INSERT IGNORE INTO notification_deliveries'))queued={q,p};return [{affectedRows:1}];
 }};
 await enqueueHall(conn,'TEST');assert.match(queued.q,/n.user_id IN \(\?\)/);assert.deepEqual(queued.p,['hall:TEST',7]);
});
