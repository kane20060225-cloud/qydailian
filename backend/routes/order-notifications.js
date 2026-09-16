'use strict';
const express=require('express');const crypto=require('node:crypto');const bcrypt=require('bcryptjs');
const {loadConfig}=require('../lib/order-notifications');const {validateConfig,SECRET_CONTEXT}=require('../lib/wecom-client');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function createNotificationRouter({pool,authMiddleware,system,cipher,wecomClient,siteUrl,recordOperation}) {
  const router=express.Router();const streams=new Map();const passwordFailures=new Map();
  const publicConfig=c=>({configured:Boolean(c?.corp_id&&c?.agent_id&&c?.secret),enabled:Boolean(c?.enabled),corp_id:c?.corp_id || '',agent_id:c?.agent_id || '',has_secret:Boolean(c?.secret),callback_url:new URL('/api/notifications/wecom/callback',siteUrl).href});
  async function role(req,res,next){const [rows]=await pool.execute('SELECT role FROM users WHERE id=?',[req.userId]);if(!rows.length)return res.status(401).json({error:'用户不存在'});req.notificationRole=rows[0].role;next();}
  // The callback is public but requires a short-lived, one-use state tied to a current website session.
  router.get('/wecom/callback',async(req,res)=>{
    res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});let result='failed';
    const state=typeof req.query.state==='string'?req.query.state:'';const code=typeof req.query.code==='string'?req.query.code:'';
    if(!/^[a-f0-9]{64}$/.test(state)||!code||code.length>512)return res.redirect(new URL('/?wecom_binding=failed',siteUrl).href);
    let conn;
    try {
      conn=await pool.getConnection();await conn.beginTransaction();const [states]=await conn.execute('SELECT * FROM wecom_oauth_states WHERE state_hash=? AND expires_at>NOW() FOR UPDATE',[hash(state)]);
      if(!states.length){await conn.rollback();return res.redirect(new URL('/?wecom_binding=expired',siteUrl).href);}
      const s=states[0];await conn.execute('DELETE FROM wecom_oauth_states WHERE state_hash=?',[hash(state)]);await conn.commit();
      const config=await loadConfig(pool,cipher);if(!config?.secret||config.corp_id!==s.corp_id||Number(config.agent_id)!==Number(s.agent_id))throw Error('config changed');
      const identity=await wecomClient.identity(config,code);
      await conn.beginTransaction();const [users]=await conn.execute('SELECT role,token_version FROM users WHERE id=? FOR UPDATE',[s.user_id]);
      if(!['booster','admin'].includes(users[0]?.role)||Number(users[0]?.token_version)!==Number(s.token_version))throw Error('session revoked');
      const fresh=await loadConfig(conn,cipher);if(fresh?.corp_id!==config.corp_id||Number(fresh?.agent_id)!==Number(config.agent_id)||fresh?.secret!==config.secret)throw Error('config changed');
      await conn.execute(`INSERT INTO wecom_user_bindings (user_id,corp_id,agent_id,wecom_user_id) VALUES (?,?,?,?)
        ON DUPLICATE KEY UPDATE corp_id=VALUES(corp_id),agent_id=VALUES(agent_id),wecom_user_id=VALUES(wecom_user_id),verified_at=NOW()`,[s.user_id,config.corp_id,config.agent_id,identity]);
      // A unique identity conflict must not silently overwrite another website user's binding.
      const [binding]=await conn.execute('SELECT user_id FROM wecom_user_bindings WHERE corp_id=? AND agent_id=? AND wecom_user_id=?',[config.corp_id,config.agent_id,identity]);
      if(Number(binding[0]?.user_id)!==Number(s.user_id))throw Error('identity already bound');
      await recordOperation(conn,{eventKey:`wecom_binding:${crypto.randomUUID()}`,actorUserId:s.user_id,action:'wecom_bound',targetType:'user',targetRef:String(s.user_id)});
      await conn.commit();result='success';
    }catch(err){if(conn)await conn.rollback();result=err.code==='ER_DUP_ENTRY'?'already_bound':'failed';}
    finally{if(conn)conn.release();}
    res.redirect(new URL(`/?wecom_binding=${result}`,siteUrl).href);
  });
  router.use(authMiddleware);router.use(role);router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/stream',async(req,res)=>{
    let cursor=req.query.since===undefined?null:Number(req.query.since);
    if(cursor!==null&&(!Number.isSafeInteger(cursor)||cursor<0))return res.status(400).json({error:'无效通知游标'});
    if((streams.get(req.userId)||0)>=3||[...streams.values()].reduce((sum,n)=>sum+n,0)>=500)return res.status(429).json({error:'通知连接较多，请关闭多余页面后重试'});
    streams.set(req.userId,(streams.get(req.userId)||0)+1);
    res.set({'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive','X-Accel-Buffering':'no','Cache-Control':'no-store, no-transform'});res.flushHeaders();
    let closed=false,pumping=false,again=false;let unsubscribe=()=>{};let timer;
    const close=()=>{if(closed)return;closed=true;clearInterval(timer);unsubscribe();const n=(streams.get(req.userId)||1)-1;if(n)streams.set(req.userId,n);else streams.delete(req.userId);res.end();};
    async function pump(){if(closed)return;if(pumping){again=true;return;}pumping=true;
      try {
        const [users]=await pool.execute('SELECT token_version FROM users WHERE id=?',[req.userId]);
        if(!users.length||Number(users[0].token_version)!==Number(req.tokenVersion)){res.write('event: session_expired\ndata: {}\n\n');close();return;}
        const data=await system.snapshot(req.userId,cursor);if(closed)return;cursor=data.cursor;
        res.write(`event: snapshot\nid: ${cursor}\ndata: ${JSON.stringify(data)}\n\n`);if(res.writableLength>262144)close();
        if(data.notifications.length===20)again=true;
      }catch{if(!closed)res.write('event: retry\ndata: {}\n\n');close();}
      finally{pumping=false;if(again&&!closed){again=false;setImmediate(pump);}}
    }
    req.once('close',close);unsubscribe=system.subscribe(pump);timer=setInterval(pump,15000);timer.unref();pump();
  });
  router.get('/',async(req,res)=>{const [rows]=await pool.execute('SELECT id,kind,order_type,order_ref,title,body,read_at,created_at FROM order_notifications WHERE user_id=? ORDER BY id DESC LIMIT 50',[req.userId]);const summary=await system.snapshot(req.userId);res.json({notifications:rows,unread_count:summary.unread_count});});
  router.put('/read-all',async(req,res)=>{await pool.execute('UPDATE order_notifications SET read_at=NOW() WHERE user_id=? AND read_at IS NULL',[req.userId]);system.poke();res.json({success:true});});
  router.put('/:id/read',async(req,res)=>{if(!/^\d{1,16}$/.test(req.params.id))return res.status(400).json({error:'无效通知编号'});await pool.execute('UPDATE order_notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=? AND user_id=?',[req.params.id,req.userId]);system.poke();res.json({success:true});});
  router.get('/preferences',async(req,res)=>{const [rows]=await pool.execute('SELECT new_orders,wecom,sound FROM notification_preferences WHERE user_id=?',[req.userId]);res.json(rows[0] || {new_orders:1,wecom:1,sound:0});});
  router.put('/preferences',async(req,res)=>{const b=req.body || {};if(['new_orders','wecom','sound'].some(k=>typeof b[k]!=='boolean'))return res.status(400).json({error:'请选择通知开关'});
    await pool.execute('INSERT INTO notification_preferences (user_id,new_orders,wecom,sound) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE new_orders=VALUES(new_orders),wecom=VALUES(wecom),sound=VALUES(sound)',[req.userId,+b.new_orders,+b.wecom,+b.sound]);res.json({success:true});});
  router.get('/wecom/status',async(req,res)=>{const c=await loadConfig(pool,cipher);const [rows]=await pool.execute('SELECT wecom_user_id,corp_id,agent_id,verified_at FROM wecom_user_bindings WHERE user_id=?',[req.userId]);const b=rows[0];res.json({configured:Boolean(c?.secret),enabled:Boolean(c?.enabled),bound:Boolean(b&&b.corp_id===c?.corp_id&&Number(b.agent_id)===Number(c.agent_id)),identity:b?.wecom_user_id || null,can_bind:['booster','admin'].includes(req.notificationRole)});});
  router.post('/wecom/bind',async(req,res)=>{
    if(!['booster','admin'].includes(req.notificationRole))return res.status(403).json({error:'仅打手和管理员可以绑定接单通知'});
    const c=await loadConfig(pool,cipher);if(!c?.secret)return res.status(409).json({error:'管理员尚未配置企业微信自建应用'});
    await pool.execute('DELETE FROM wecom_oauth_states WHERE user_id=? OR expires_at<NOW()',[req.userId]);
    const state=crypto.randomBytes(32).toString('hex');await pool.execute('INSERT INTO wecom_oauth_states (state_hash,user_id,token_version,corp_id,agent_id,expires_at) VALUES (?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 10 MINUTE))',[hash(state),req.userId,req.tokenVersion,c.corp_id,c.agent_id]);
    const url=new URL('https://open.weixin.qq.com/connect/oauth2/authorize');for(const [k,v]of Object.entries({appid:c.corp_id,agentid:String(c.agent_id),redirect_uri:new URL('/api/notifications/wecom/callback',siteUrl).href,response_type:'code',scope:'snsapi_base',state}))url.searchParams.set(k,v);url.hash='wechat_redirect';res.json({url:url.href});
  });
  router.delete('/wecom/bind',async(req,res)=>{const conn=await pool.getConnection();try{await conn.beginTransaction();await conn.execute('DELETE FROM wecom_user_bindings WHERE user_id=?',[req.userId]);await conn.execute('DELETE FROM wecom_oauth_states WHERE user_id=?',[req.userId]);await conn.execute("UPDATE notification_deliveries d JOIN order_notifications n ON n.id=d.notification_id SET d.status='skipped',d.last_error_code='UNBOUND' WHERE n.user_id=? AND d.status IN ('pending','retry')",[req.userId]);await conn.commit();res.json({success:true});}catch(err){await conn.rollback();throw err;}finally{conn.release();}});
  router.use('/wecom/config',(req,res,next)=>req.notificationRole==='admin'?next():res.status(403).json({error:'无管理员权限'}));
  router.get('/wecom/config',async(req,res)=>{const c=await loadConfig(pool,cipher);const [counts]=await pool.execute('SELECT status,COUNT(*) AS total FROM notification_deliveries GROUP BY status');res.json({...publicConfig(c),deliveries:counts});});
  router.post('/wecom/config/check',async(req,res)=>{const c=await loadConfig(pool,cipher);if(!c?.secret)return res.status(409).json({error:'请先保存应用配置'});try{await wecomClient.token(c,true);res.json({success:true});}catch(err){res.status(502).json({error:`连接验证失败（${err.code || 'WECOM_NETWORK'}），请检查应用 Secret 和企业可信 IP`});}});
  router.put('/wecom/config',async(req,res)=>{
    let value;try{value=validateConfig(req.body || {});}catch(err){return res.status(400).json({error:err.message});}
    const attempt=passwordFailures.get(req.userId);if(attempt&&attempt.until>Date.now()&&attempt.count>=5)return res.status(429).json({error:'密码验证失败次数过多，请10分钟后重试'});
    const [users]=await pool.execute('SELECT password_hash FROM users WHERE id=?',[req.userId]);
    if(typeof req.body.current_password!=='string'||req.body.current_password.length>200||!await bcrypt.compare(req.body.current_password,users[0]?.password_hash || '')){const next=attempt?.until>Date.now()?attempt:{count:0,until:Date.now()+600000};next.count++;passwordFailures.set(req.userId,next);return res.status(403).json({error:'管理员登录密码不正确'});}passwordFailures.delete(req.userId);
    const conn=await pool.getConnection();try{await conn.beginTransaction();const c=await loadConfig(conn,cipher);const secret=value.corp_secret?cipher.encrypt(value.corp_secret,SECRET_CONTEXT):c?.corp_secret;
      if(!secret)throw Object.assign(new Error('首次配置必须填写应用 Secret'),{status:400});
      const changed=c&&(c.corp_id!==value.corp_id||Number(c.agent_id)!==value.agent_id);if(changed&&!value.corp_secret)throw Object.assign(new Error('更换企业或应用时必须填写新的 Secret'),{status:400});
      await conn.execute('INSERT INTO wecom_notification_config (id,corp_id,agent_id,corp_secret,enabled) VALUES (1,?,?,?,?) ON DUPLICATE KEY UPDATE corp_id=VALUES(corp_id),agent_id=VALUES(agent_id),corp_secret=VALUES(corp_secret),enabled=VALUES(enabled)',[value.corp_id,value.agent_id,secret,+value.enabled]);
      if(changed){await conn.execute('DELETE FROM wecom_user_bindings');await conn.execute('DELETE FROM wecom_oauth_states');await conn.execute("UPDATE notification_deliveries SET status='skipped',last_error_code='APPLICATION_CHANGED' WHERE status IN ('pending','retry')");}
      await recordOperation(conn,{eventKey:`wecom_config:${crypto.randomUUID()}`,actorUserId:req.userId,action:'wecom_config_changed',targetType:'wecom_config',targetRef:'1'});await conn.commit();res.json({success:true});
    }catch(err){await conn.rollback();res.status(err.status || 500).json({error:err.status?err.message:'配置保存失败'});}finally{conn.release();}
  });
  router.use((err,req,res,next)=>{if(res.headersSent)return next(err);res.status(503).json({error:'通知服务暂不可用，请稍后重试'});});return router;
}
module.exports={createNotificationRouter};
