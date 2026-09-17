'use strict';
const express=require('express'),path=require('node:path'),fsp=require('node:fs/promises');
const {staffRole,fail,messageInput,orderSummary,queueSupportNotification}=require('../lib/customer-support');
const {saveRentalScreenshot}=require('../lib/rental-stream-upload');
function createSupportRouter({pool,authMiddleware,notificationSystem,recordOperation,uploadDir=path.join(__dirname,'../private-support'),streamIntervalMs=5000}) {
 const r=express.Router(),streams=new Map();
 r.use(authMiddleware);r.use(async(req,res,next)=>{const [users]=await pool.execute('SELECT role FROM users WHERE id=?',[req.userId]);req.supportStaff=staffRole(users[0]?.role);req.supportAdmin=users[0]?.role==='admin';res.set('Cache-Control','no-store');next();});
 const staff=(req,res,next)=>req.supportStaff?next():res.status(403).json({error:'需要客服或管理员权限'});
 const admin=(req,res,next)=>req.supportAdmin?next():res.status(403).json({error:'需要管理员权限'});
 async function conversation(db,req,lock=false) {
  if(!/^[1-9]\d{0,9}$/.test(req.params.id))throw fail(400,'会话编号无效');
  const [rows]=await db.execute(`SELECT * FROM support_conversations WHERE id=?${lock?' FOR UPDATE':''}`,[req.params.id]);
  if(!rows[0]||(!req.supportStaff&&Number(rows[0].customer_id)!==req.userId))throw fail(404,'会话不存在');return rows[0];
 }
 async function settings(){const [rows]=await pool.execute('SELECT * FROM support_settings WHERE id=1');const s=rows[0]||{configured:0,enabled:1};const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(new Date()));return {...s,open:Boolean(s.configured&&s.enabled&&hour>=s.start_hour&&hour<s.end_hour),service_time:s.configured?`每天 ${String(s.start_hour).padStart(2,'0')}:00–${String(s.end_hour).padStart(2,'0')}:00（北京时间）`:'服务时间尚未设置，可以留言'};}
 r.get('/settings',async(req,res)=>{const s=await settings();res.json({...s,is_staff:req.supportStaff,is_admin:req.supportAdmin});});
 r.put('/settings',admin,async(req,res)=>{const b=req.body;if(!Number.isInteger(b.start_hour)||!Number.isInteger(b.end_hour)||b.start_hour<0||b.end_hour>24||b.end_hour<=b.start_hour||typeof b.enabled!=='boolean')throw fail(400,'请选择有效的服务时段');await pool.execute('UPDATE support_settings SET start_hour=?,end_hour=?,enabled=?,configured=1 WHERE id=1',[b.start_hour,b.end_hour,+b.enabled]);res.json({success:true});});
 r.get('/staff/notifications',staff,async(req,res)=>{
  const [members]=await pool.execute(`SELECT u.id,u.username,u.role,b.verified_at,IF(c.enabled=1 AND c.corp_id=b.corp_id AND c.agent_id=b.agent_id AND COALESCE(p.wecom,1)=1,1,0) AS ready FROM users u LEFT JOIN wecom_user_bindings b ON b.user_id=u.id LEFT JOIN wecom_notification_config c ON c.id=1 LEFT JOIN notification_preferences p ON p.user_id=u.id WHERE u.role IN ('support','admin') ORDER BY u.id`);
  const [deliveries]=await pool.execute(`SELECT d.status,d.last_error_code,n.created_at FROM notification_deliveries d JOIN order_notifications n ON n.id=d.notification_id WHERE n.kind='support_message' AND n.user_id=? ORDER BY n.id DESC LIMIT 10`,[req.userId]);
  res.json({members:req.supportAdmin?members:members.filter(m=>Number(m.id)===req.userId),ready_count:members.filter(m=>m.ready).length,deliveries});
 });
 r.post('/staff/notifications/test',staff,async(req,res)=>{await queueSupportNotification(pool,{conversationId:require('node:crypto').randomUUID(),testUserId:req.userId});notificationSystem.poke();res.json({success:true});});
 r.get('/summary',async(req,res)=>{
  const [own]=await pool.execute("SELECT COUNT(*) AS unread FROM support_messages m JOIN support_conversations c ON c.id=m.conversation_id WHERE c.customer_id=? AND m.sender_kind='staff' AND m.id>c.customer_read_id",[req.userId]);
  let staffUnread=0;if(req.supportStaff){const [all]=await pool.execute("SELECT COUNT(*) AS unread FROM support_messages m JOIN support_conversations c ON c.id=m.conversation_id LEFT JOIN support_staff_reads sr ON sr.conversation_id=c.id AND sr.user_id=? WHERE m.sender_kind='customer' AND m.sender_id<>? AND m.id>COALESCE(sr.read_id,0)",[req.userId,req.userId]);staffUnread=Number(all[0].unread);}res.json({unread:Number(own[0].unread),staff_unread:staffUnread});
 });
 r.get('/conversations',async(req,res)=>{
  const staffMode=req.query.scope==='staff';if(staffMode&&!req.supportStaff)throw fail(403,'需要客服或管理员权限');
  const page=Math.max(1,Math.min(100000,Number(req.query.page)||1));if(!Number.isInteger(page))throw fail(400,'页码无效');
  const where=staffMode?'1=1':'c.customer_id=?',params=staffMode?[]:[req.userId];
  const filter=['pending','resolved'].includes(req.query.status)?' AND c.status=?':'';if(filter)params.push(req.query.status);
  const [rows]=await pool.execute(`SELECT c.id,c.order_type,c.order_ref,c.status,c.waiting_since,c.created_at,c.updated_at,c.last_message_id,u.username,
   (SELECT COUNT(*) FROM support_messages m WHERE m.conversation_id=c.id AND m.sender_kind=? AND m.id>COALESCE(${staffMode?'sr.read_id':'c.customer_read_id'},0)) AS unread
   FROM support_conversations c JOIN users u ON u.id=c.customer_id LEFT JOIN support_staff_reads sr ON sr.conversation_id=c.id AND sr.user_id=? WHERE ${where}${filter}
   ORDER BY ${staffMode?"(c.status='pending' AND c.waiting_since IS NOT NULL) DESC,c.waiting_since ASC,":''} c.updated_at DESC,c.id DESC LIMIT 31 OFFSET ${((page-1)*30)}`,[staffMode?'customer':'staff',req.userId,...params]);
  res.json({conversations:rows.slice(0,30),has_more:rows.length>30,page});
 });
 r.post('/conversations',async(req,res)=>{
  const type=req.body.order_type||'',ref=req.body.order_ref||'';await orderSummary(pool,type,ref,req.userId);
  await pool.execute('INSERT INTO support_conversations (customer_id,order_type,order_ref) VALUES (?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',[req.userId,type,ref]);
  const [rows]=await pool.execute('SELECT id FROM support_conversations WHERE customer_id=? AND order_type=? AND order_ref=?',[req.userId,type,ref]);res.json(rows[0]);
 });
 r.get('/conversations/:id',async(req,res)=>{const c=await conversation(pool,req);let order=null;try{order=await orderSummary(pool,c.order_type,c.order_ref,req.userId,true);}catch(e){if(e.status!==404)throw e;}res.json({...c,order});});
 r.get('/conversations/:id/messages',async(req,res)=>{
  await conversation(pool,req);const before=req.query.before===undefined?null:Number(req.query.before),after=req.query.after===undefined?null:Number(req.query.after);
  if((before!==null&&(!Number.isSafeInteger(before)||before<1))||(after!==null&&(!Number.isSafeInteger(after)||after<0))||(before!==null&&after!==null))throw fail(400,'历史游标无效');
  const [rows]=await pool.execute(`SELECT id,sender_id,sender_kind,client_id,body,IF(image_name IS NULL,0,1) AS has_image,created_at FROM support_messages WHERE conversation_id=?${before!==null?' AND id<?':after!==null?' AND id>?':''} ORDER BY id ${after!==null?'ASC':'DESC'} LIMIT 51`,[req.params.id,...(before!==null?[before]:after!==null?[after]:[])]);
  res.json({messages:after!==null?rows.slice(0,50):rows.slice(0,50).reverse(),has_more:rows.length>50});
 });
 r.post('/conversations/:id/messages',async(req,res)=>{
  const value=messageInput(req.body);const conn=await pool.getConnection();let image,committed=false;
  try{await conn.beginTransaction();const c=await conversation(conn,req,true);
   const [users]=await conn.execute('SELECT role FROM users WHERE id=?',[req.userId]);req.supportStaff=staffRole(users[0]?.role);if(!req.supportStaff&&Number(c.customer_id)!==req.userId)throw fail(403,'客服权限已变更');
   const fromStaff=req.supportStaff&&Number(c.customer_id)!==req.userId;
   const [existing]=await conn.execute('SELECT id FROM support_messages WHERE conversation_id=? AND sender_id=? AND client_id=?',[c.id,req.userId,value.client_id]);if(existing.length){await conn.commit();return res.json({...existing[0],duplicate:true});}
   const [rate]=await conn.execute('SELECT COUNT(*) AS total FROM support_messages WHERE conversation_id=? AND sender_id=? AND created_at>DATE_SUB(NOW(),INTERVAL 1 MINUTE)',[c.id,req.userId]);if(Number(rate[0].total)>=20)throw fail(429,'发送较频繁，请稍后重试');
   if(value.image){try{image=await saveRentalScreenshot({body:{screenshot:value.image},contentType:'application/json',uploadDir,userId:req.userId});}catch(e){throw fail(400,e.message);}}
   const [insert]=await conn.execute('INSERT INTO support_messages (conversation_id,sender_id,sender_kind,client_id,body,image_name) VALUES (?,?,?,?,?,?)',[c.id,req.userId,fromStaff?'staff':'customer',value.client_id,value.body,image||null]);
   await conn.execute(`UPDATE support_conversations SET last_message_id=?,updated_at=NOW(),status='pending',waiting_since=${fromStaff?'NULL':'COALESCE(waiting_since,NOW())'} WHERE id=?`,[insert.insertId,c.id]);
   await queueSupportNotification(conn,{conversationId:c.id,messageId:insert.insertId,customerId:c.customer_id,fromStaff});
   await conn.commit();committed=true;notificationSystem.poke();res.json({id:insert.insertId});
  }catch(e){await conn.rollback();throw e;}finally{conn.release();if(image&&!committed)await fsp.rm(path.join(uploadDir,image),{force:true});}
 });
 r.get('/conversations/:id/messages/:messageId/image',async(req,res)=>{await conversation(pool,req);if(!/^\d{1,16}$/.test(req.params.messageId))throw fail(400,'图片编号无效');const [rows]=await pool.execute('SELECT image_name FROM support_messages WHERE conversation_id=? AND id=?',[req.params.id,req.params.messageId]);const name=rows[0]?.image_name;if(!name||!/^rental_\d+_\d+\.(png|jpg)$/.test(name))throw fail(404,'图片不存在');res.set({'X-Content-Type-Options':'nosniff','Content-Disposition':'inline'});res.sendFile(path.join(uploadDir,name));});
 r.put('/conversations/:id/read',async(req,res)=>{const c=await conversation(pool,req);const id=Number(req.body.message_id);if(!Number.isSafeInteger(id)||id<0||id>Number(c.last_message_id))throw fail(400,'已读位置无效');if(Number(c.customer_id)===req.userId)await pool.execute('UPDATE support_conversations SET customer_read_id=GREATEST(customer_read_id,?) WHERE id=?',[id,c.id]);if(req.supportStaff)await pool.execute('INSERT INTO support_staff_reads (conversation_id,user_id,read_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE read_id=GREATEST(read_id,VALUES(read_id))',[c.id,req.userId,id]);res.json({success:true});});
 r.put('/conversations/:id/status',staff,async(req,res)=>{if(!['pending','resolved'].includes(req.body.status))throw fail(400,'处理状态无效');const conn=await pool.getConnection();try{await conn.beginTransaction();const c=await conversation(conn,req,true);await conn.execute('UPDATE support_conversations SET status=?,updated_at=NOW() WHERE id=?',[req.body.status,c.id]);await recordOperation(conn,{eventKey:`support_status:${require('node:crypto').randomUUID()}`,actorUserId:req.userId,action:req.body.status==='resolved'?'support_resolved':'support_pending',targetType:'support',targetRef:String(c.id),note:req.body.status});await conn.commit();res.json({success:true});}catch(e){await conn.rollback();throw e;}finally{conn.release();}});
 r.get('/stream',async(req,res)=>{
  if((streams.get(req.userId)||0)>=2||[...streams.values()].reduce((a,b)=>a+b,0)>=300)throw fail(429,'聊天连接较多，请关闭多余页面');
  streams.set(req.userId,(streams.get(req.userId)||0)+1);res.set({'Content-Type':'text/event-stream; charset=utf-8','X-Accel-Buffering':'no','Cache-Control':'no-store, no-transform'});res.flushHeaders();let closed=false,busy=false;
  const close=()=>{if(closed)return;closed=true;clearInterval(timer);streams.set(req.userId,Math.max(0,(streams.get(req.userId)||1)-1));if(!streams.get(req.userId))streams.delete(req.userId);res.end();};
  const pump=async()=>{if(closed||busy)return;busy=true;try{const [u]=await pool.execute('SELECT role,token_version FROM users WHERE id=?',[req.userId]);if(!u.length||Number(u[0].token_version)!==req.tokenVersion){res.write('event: session_expired\ndata: {}\n\n');close();return;}res.write(`event: sync\ndata: ${JSON.stringify({is_staff:staffRole(u[0].role)})}\n\n`);if(res.writableLength>262144)close();}catch{close();}finally{busy=false;}};
  const timer=setInterval(pump,streamIntervalMs);timer.unref();req.once('close',close);pump();
 });
 r.use((e,req,res,next)=>{if(res.headersSent)return next(e);res.status(e.status||503).json({error:e.status?e.message:'客服服务暂不可用，请稍后重试'});});return r;
}
module.exports={createSupportRouter};
