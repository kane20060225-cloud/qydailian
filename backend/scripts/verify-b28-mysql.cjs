'use strict';
// Run only with an explicitly isolated database whose schema matches production.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function verify(pool,{uploadDir,migrationSql}){
 const [[database]]=await pool.execute('SELECT DATABASE() AS name');assert.match(database.name,/^b28_verify_[a-f0-9]{10}$/);
 for(let pass=0;pass<2;pass++)for(const sql of migrationSql.split(';').map(s=>s.trim()).filter(Boolean))await pool.query(sql);
 for(const [id,role] of [[1,'user'],[2,'user'],[3,'support'],[4,'admin'],[5,'booster']])await pool.execute('INSERT INTO users (id,username,password_hash,role) VALUES (?,?,?,?)',[id,'fixture_'+id,'synthetic-not-a-login-hash',role]);
 await pool.execute("INSERT INTO orders (order_no,user_id,project,detail,quantity,player_name,price,total_price,status,payment_status,booster_id,game_password) VALUES ('B28TEST',1,'胜率','标准服务',1,'标准',10,10,'playing','paid',5,'synthetic-private-password')");
 const express=require('express'),{createSupportRouter}=require('../routes/customer-support'),{createPermissionsRouter}=require('../routes/user-permissions'),{createAuthMiddleware,issueSessionToken}=require('../lib/auth-session'),{recordOperation}=require('../lib/accounting');
 const secret=crypto.randomBytes(32).toString('hex'),auth=createAuthMiddleware(pool,secret),app=express();app.use(express.json({limit:'10mb'}));
 const admin=(req,res,next)=>auth(req,res,async()=>{const [u]=await pool.execute('SELECT role FROM users WHERE id=?',[req.userId]);u[0]?.role==='admin'?next():res.status(403).json({error:'admin'});});
 app.use('/support',createSupportRouter({pool,authMiddleware:auth,notificationSystem:{poke(){}},recordOperation,uploadDir,streamIntervalMs:40}));app.use('/users',createPermissionsRouter({pool,adminMiddleware:admin,recordOperation}));
 const tokens=new Map([1,2,3,4,5].map(id=>[id,issueSessionToken(id,0,secret)])),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 const request=(route,user=1,body,method)=>fetch(origin+route,{method:method||(body?'POST':'GET'),headers:{Authorization:'Bearer '+tokens.get(user),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=async(...args)=>{const r=await request(...args);assert.equal(r.status,200,await r.clone().text());return r.json();};
 try{
  const c=await data('/support/conversations',1,{order_type:'boost',order_ref:'B28TEST'}),base='/support/conversations/'+c.id;
  assert.equal((await data('/support/conversations',1,{order_type:'boost',order_ref:'B28TEST'})).id,c.id);assert.equal((await request('/support/conversations',2,{order_type:'boost',order_ref:'B28TEST'})).status,404);
  for(const user of [2,5]){assert.equal((await request(base,user)).status,404);assert.equal((await request('/support/conversations?scope=staff',user)).status,403);}
  const body={client_id:'b28_parallel_retry_01',body:'核对订单',image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1kAAAAASUVORK5CYII='};
  const sent=await Promise.all([data(base+'/messages',1,body),data(base+'/messages',1,body)]);assert.equal(sent[0].id,sent[1].id);
  assert.equal(Number((await pool.execute('SELECT COUNT(*) AS n FROM support_messages'))[0][0].n),1);assert.equal((await fs.readdir(uploadDir)).length,1);assert.equal(Number((await pool.execute('SELECT COUNT(*) AS n FROM order_notifications'))[0][0].n),2);
  assert.equal((await request(base+'/messages/'+sent[0].id+'/image',2)).status,404);assert.equal((await request(base+'/messages/'+sent[0].id+'/image',3)).status,200);
  const summary=await data(base,3);assert.equal(summary.order.state_label,'代练中');assert.equal(JSON.stringify(summary).includes('synthetic-private-password'),false);
  const queue=await data('/support/conversations?scope=staff&status=pending',3);assert.equal(Number(queue.conversations[0].unread),1);assert.equal((await data('/support/summary',3)).staff_unread,1);
  await data(base+'/read',3,{message_id:sent[0].id},'PUT');assert.ok((await data(base,3)).waiting_since);assert.equal((await data('/support/summary',3)).staff_unread,0);
  await data(base+'/messages',3,{client_id:'b28_staff_reply_001',body:'正在核对'});assert.equal((await data(base,3)).waiting_since,null);assert.equal((await data('/support/summary',1)).unread,1);
  await data(base+'/status',3,{status:'resolved'},'PUT');await data(base+'/messages',1,{client_id:'b28_reopen_message_1',body:'还有问题'});assert.equal((await data(base,3)).status,'pending');
  const conn=await pool.getConnection();try{await conn.beginTransaction();for(let i=0;i<121;i++)await conn.execute("INSERT INTO support_messages (conversation_id,sender_id,sender_kind,client_id,body) VALUES (?,1,'customer',?,?)",[c.id,'history_fixture_'+i,String(i)]);await conn.commit();}finally{conn.release();}
  let cursor=0,ids=[];for(;;){const history=await data(base+'/messages?after='+cursor);ids.push(...history.messages.map(m=>Number(m.id)));cursor=Number(history.messages.at(-1)?.id)||cursor;if(!history.has_more)break;}assert.equal(ids.length,124);assert.equal(new Set(ids).size,124);
  const search=await data('/users?q=fixture_3&role=support&page=1',4);assert.equal(search.total,1);assert.equal(search.users[0].id,3);
  assert.equal((await request('/users/4/role',4,{role:'user',expected_role:'admin'},'PUT')).status,409);await data('/users/3/role',4,{role:'user',expected_role:'support'},'PUT');assert.equal((await request(base,3)).status,401);
  assert.equal((await request('/users/3/role',4,{role:'admin',expected_role:'support'},'PUT')).status,409);
  return {real_mysql:true,migration_idempotent:true,parallel_retry:true,private_images:true,order_summary_safe:true,staff_queue:true,unread_and_waiting:true,history_reconnect_complete:true,search_and_permissions:true,session_revocation:true};
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(uploadDir,{recursive:true,force:true});}
}
module.exports={verify};
