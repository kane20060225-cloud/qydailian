'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createSupportRouter}=require('../routes/customer-support');
const {messageInput,orderSummary}=require('../lib/customer-support');
async function fixture(t){
 const users={1:'user',2:'user',3:'support',4:'admin',5:'booster'};
 let state={conversations:[{id:11,customer_id:1,order_type:'boost',order_ref:'ORDER1',status:'pending',last_message_id:0,customer_read_id:0,waiting_since:null}],messages:[],notifications:[],reads:[]},tail=Promise.resolve(),auditFail=false,queueFail=false;const versions={};
 async function execute(sql,p=[]){
  if(sql==='SELECT role FROM users WHERE id=?')return [[{role:users[p[0]]}]];
  if(sql==='SELECT role,token_version FROM users WHERE id=?')return [[{role:users[p[0]],token_version:versions[p[0]]||0}]];
  if(sql.startsWith('SELECT * FROM support_conversations'))return [[...state.conversations.filter(c=>c.id===Number(p[0])).map(c=>({...c}))]];
  if(sql.startsWith('SELECT order_type,order_ref,title'))return [[{order_type:'boost',order_ref:'ORDER1',title:'代练 · 测试',amount:10,amount_unit:'money',state:'in_progress',customer_id:1,related_user_id:5,game_password:'DO_NOT_EXPOSE'}]];
  if(sql.startsWith('SELECT id FROM support_messages'))return [[...state.messages.filter(m=>m.conversation_id===Number(p[0])&&m.sender_id===p[1]&&m.client_id===p[2]).map(m=>({id:m.id}))]];
  if(sql.startsWith('SELECT COUNT(*) AS total FROM support_messages'))return [[{total:0}]];
  if(sql.startsWith('INSERT INTO support_messages')){const m={id:state.messages.length+1,conversation_id:p[0],sender_id:p[1],sender_kind:p[2],client_id:p[3],body:p[4],image_name:p[5],created_at:new Date().toISOString()};state.messages.push(m);return [{insertId:m.id}];}
  if(sql.startsWith('UPDATE support_conversations SET last_message_id')){const c=state.conversations.find(c=>c.id===p[1]);c.last_message_id=p[0];c.status='pending';c.waiting_since=sql.includes('waiting_since=NULL')?null:c.waiting_since||new Date().toISOString();return [{affectedRows:1}];}
  if(sql.startsWith('INSERT IGNORE INTO order_notifications')){if(queueFail)throw Error('queue unavailable');state.notifications.push(p);return [{affectedRows:1}];}
  if(sql.startsWith('INSERT IGNORE INTO notification_deliveries'))return [{affectedRows:1}];
  if(sql.startsWith('SELECT id,sender_id,sender_kind')){let rows=state.messages.filter(m=>m.conversation_id===Number(p[0]));if(sql.includes('id<?'))rows=rows.filter(m=>m.id<p[1]);if(sql.includes('id>?'))rows=rows.filter(m=>m.id>p[1]);rows.sort((a,b)=>sql.includes('ASC')?a.id-b.id:b.id-a.id);return [rows.slice(0,51).map(({image_name,...m})=>({...m,has_image:image_name?1:0}))];}
  if(sql.startsWith('SELECT image_name FROM support_messages'))return [state.messages.filter(m=>m.conversation_id===Number(p[0])&&m.id===Number(p[1])).map(m=>({image_name:m.image_name}))];
  if(sql.startsWith('UPDATE support_conversations SET customer_read_id')){const c=state.conversations.find(c=>c.id===p[1]);c.customer_read_id=Math.max(c.customer_read_id,p[0]);return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO support_staff_reads')){state.reads.push(p);return [{affectedRows:1}];}
  if(sql.startsWith('UPDATE support_conversations SET status')){state.conversations.find(c=>c.id===p[1]).status=p[0];return [{affectedRows:1}];}
  throw Error('Unhandled fixture query: '+sql);
 }
 const pool={execute,getConnection:async()=>{let release,snapshot;return {execute,beginTransaction:async()=>{const prior=tail;tail=new Promise(r=>release=r);await prior;snapshot=structuredClone(state);},commit:async()=>{snapshot=null;release();},rollback:async()=>{if(snapshot){state=snapshot;snapshot=null;release();}},release(){}};}};
 const uploadDir=await fs.mkdtemp(path.join(os.tmpdir(),'support-test-'));t.after(()=>fs.rm(uploadDir,{recursive:true,force:true}));
 const app=express();app.use(express.json({limit:'10mb'}));app.use('/api/support',createSupportRouter({pool,uploadDir,streamIntervalMs:20,notificationSystem:{poke(){}},recordOperation:async()=>{if(auditFail)throw Error('audit unavailable');},authMiddleware:(req,res,next)=>{req.userId=Number(req.headers.authorization);req.tokenVersion=0;if(!users[req.userId])return res.status(401).json({error:'login'});next();}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}/api/support`;
 const request=(p,user=1,method='GET',body)=>fetch(base+p,{method,headers:{Authorization:String(user),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 return {request,state:()=>state,users,versions,uploadDir,failAudit:()=>auditFail=true,failQueue:value=>queueFail=value};
}
test('support conversations, staff queue and images reject other customers and ordinary boosters',async t=>{
 const f=await fixture(t);for(const id of [2,5]){assert.equal((await f.request('/conversations/11',id)).status,404);assert.equal((await f.request('/conversations/11/messages',id)).status,404);assert.equal((await f.request('/conversations/11/messages/1/image',id)).status,404);assert.equal((await f.request('/conversations?scope=staff',id)).status,403);assert.equal((await f.request('/conversations/11/status',id,'PUT',{status:'resolved'})).status,403);}
 for(const id of [3,4]){const r=await f.request('/conversations/11',id);assert.equal(r.status,200);const d=await r.json();assert.equal(d.order.state_label,'代练中');assert.equal(JSON.stringify(d).includes('DO_NOT_EXPOSE'),false);}
});
test('same client message ID is idempotent under parallel retries, including screenshot files and notifications',async t=>{
 const f=await fixture(t);const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1kAAAAASUVORK5CYII=';
 const body={client_id:'same_message_retry_123',body:'请帮我核对订单',image};const responses=await Promise.all([f.request('/conversations/11/messages',1,'POST',body),f.request('/conversations/11/messages',1,'POST',body)]);
 assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.equal(f.state().messages.length,1);assert.equal(f.state().notifications.length,1);assert.equal((await fs.readdir(f.uploadDir)).length,1);
 const history=await (await f.request('/conversations/11/messages')).json();assert.equal(history.messages[0].body,body.body);assert.equal(history.messages[0].has_image,1);assert.equal(JSON.stringify(history).includes('image_name'),false);
 assert.equal((await f.request('/conversations/11/messages/1/image')).status,200);assert.equal((await f.request('/conversations/11/messages/1/image',2)).status,404);
 const detail=await (await f.request('/conversations/11')).json();assert.ok(detail.waiting_since);
});
test('staff replies clear waiting time, reading never implies solved, and new customer messages reopen solved consultations',async t=>{
 const f=await fixture(t);await f.request('/conversations/11/messages',1,'POST',{client_id:'customer_message_01',body:'问题'});
 await f.request('/conversations/11/read',3,'PUT',{message_id:1});assert.equal(f.state().conversations[0].status,'pending');assert.ok(f.state().conversations[0].waiting_since);
 assert.equal((await f.request('/conversations/11/messages',3,'POST',{client_id:'support_message_01',body:'正在核对'})).status,200);assert.equal(f.state().conversations[0].waiting_since,null);assert.equal(f.state().messages[1].sender_kind,'staff');
 assert.equal((await f.request('/conversations/11/status',3,'PUT',{status:'resolved'})).status,200);
 await f.request('/conversations/11/messages',1,'POST',{client_id:'customer_message_02',body:'还有问题'});assert.equal(f.state().conversations[0].status,'pending');assert.ok(f.state().conversations[0].waiting_since);
 assert.equal((await f.request('/conversations/11/read',1,'PUT',{message_id:999})).status,400);
});
test('revoked staff cannot send or change status; failed status audit rolls back',async t=>{
 const f=await fixture(t);f.users[3]='user';assert.equal((await f.request('/conversations/11/messages',3,'POST',{client_id:'revoked_message_01',body:'无权限'})).status,404);
 f.failAudit();assert.equal((await f.request('/conversations/11/status',4,'PUT',{status:'resolved'})).status,503);assert.equal(f.state().conversations[0].status,'pending');
});
test('a failed durable reminder queue rolls back the message and deletes its screenshot; retry safely succeeds',async t=>{
 const f=await fixture(t);const b={client_id:'queue_failure_retry_01',body:'截图',image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1kAAAAASUVORK5CYII='};f.failQueue(true);
 assert.equal((await f.request('/conversations/11/messages',1,'POST',b)).status,503);assert.equal(f.state().messages.length,0);assert.equal((await fs.readdir(f.uploadDir)).length,0);f.failQueue(false);assert.equal((await f.request('/conversations/11/messages',1,'POST',b)).status,200);assert.equal(f.state().messages.length,1);
});
test('chat SSE rechecks staff permissions and closes revoked sessions without exposing message bodies',async t=>{
 const f=await fixture(t),r=await f.request('/stream',3),reader=r.body.getReader(),decoder=new TextDecoder();assert.match(decoder.decode((await reader.read()).value),/"is_staff":true/);
 f.users[3]='user';let frame='';for(let i=0;i<5&&!frame.includes('"is_staff":false');i++)frame=decoder.decode((await reader.read()).value);assert.match(frame,/"is_staff":false/);
 f.versions[3]=1;for(let i=0;i<5&&!frame.includes('session_expired');i++)frame=decoder.decode((await reader.read()).value);assert.match(frame,/session_expired/);await reader.cancel();
});
test('history and reconnect cursors return all pages without gaps or duplication',async t=>{
 const f=await fixture(t);for(let i=1;i<=123;i++)f.state().messages.push({id:i,conversation_id:11,sender_id:1,sender_kind:'customer',body:String(i),client_id:'fixture_message_'+i});
 const last=await (await f.request('/conversations/11/messages')).json();assert.deepEqual(last.messages.map(m=>m.id),Array.from({length:50},(_,i)=>74+i));assert.equal(last.has_more,true);
 const old=await (await f.request('/conversations/11/messages?before=74')).json();assert.equal(old.messages[0].id,24);assert.equal(old.messages.at(-1).id,73);
 let cursor=0,received=[];for(;;){const d=await (await f.request('/conversations/11/messages?after='+cursor)).json();received.push(...d.messages.map(m=>m.id));cursor=d.messages.at(-1)?.id||cursor;if(!d.has_more)break;}assert.deepEqual(received,Array.from({length:123},(_,i)=>i+1));
 assert.equal((await f.request('/conversations/11/messages?after=-1')).status,400);
});
test('order summaries enforce ownership and allowlist, and malformed message input is rejected',async()=>{
 const db={execute:async()=>[[{customer_id:1,related_user_id:5,order_type:'third_party',order_ref:'ORDER1',title:'freeform secret',amount:10,state:'pending',game_password:'secret'}]]};
 await assert.rejects(orderSummary(db,'third_party','ORDER1',2),e=>e.status===404);const summary=await orderSummary(db,'third_party','ORDER1',1);assert.equal(summary.title,'第三方订单');assert.equal(Object.hasOwn(summary,'game_password'),false);
 assert.throws(()=>messageInput({client_id:'short',body:'hello'}));assert.throws(()=>messageInput({client_id:'valid_client_id_001',body:'x'.repeat(2001)}));assert.throws(()=>messageInput({client_id:'valid_client_id_001',body:''}));
});
