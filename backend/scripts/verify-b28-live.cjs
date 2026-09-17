'use strict';
// Server-only verification. Sends exactly one explicit test to the owner's admin account.
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const root=__dirname,site='/var/www/your-site',origin='https://wotbqydailian.vip';assert.match(root,/^\/root\/b28-support-release-[a-f0-9]{10}$/);process.env.NODE_PATH=site+'/backend/node_modules';require('module').Module._initPaths();
 const cfg=require('dotenv').parse(fs.readFileSync(site+'/backend/.env')),mysql=require('mysql2/promise'),db=await mysql.createConnection({host:cfg.DB_HOST,port:Number(cfg.DB_PORT||3306),user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:cfg.DB_NAME});
 try{const [admins]=await db.execute("SELECT id,role,token_version FROM users WHERE role='admin' ORDER BY id");assert.equal(admins.length,1);assert.equal(admins[0].id,1);
  const token=require(site+'/backend/lib/auth-session').issueSessionToken(admins[0].id,admins[0].token_version,cfg.JWT_SECRET),headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const req=async(route,method='GET')=>{const r=await fetch(origin+route,{method,headers,...(method==='POST'?{body:'{}'}:{}),signal:AbortSignal.timeout(15000),redirect:'error'});assert.equal(r.status,200);return r.json();};
  const diag=await req('/api/support/staff/notifications');assert.equal(diag.members.find(m=>m.id===1)?.ready,1);await req('/api/notifications/wecom/config/check','POST');
  const [[before]]=await db.execute("SELECT COALESCE(MAX(id),0) AS id FROM order_notifications WHERE user_id=1 AND kind='support_message'");
  await req('/api/support/staff/notifications/test','POST');
  const [notifications]=await db.execute("SELECT id,event_key FROM order_notifications WHERE user_id=1 AND kind='support_message' AND title='客服上线测试提醒' AND id>? ORDER BY id DESC LIMIT 1",[before.id]);assert.equal(notifications.length,1);const n=notifications[0];
  const [[recipients]]=await db.execute('SELECT COUNT(*) AS count FROM order_notifications WHERE event_key=?',[n.event_key]);assert.equal(Number(recipients.count),1);
  let delivery;for(let i=0;i<35;i++){const [rows]=await db.execute('SELECT status,attempts,last_error_code,message_id IS NOT NULL AS provider_message_id FROM notification_deliveries WHERE notification_id=?',[n.id]);delivery=rows[0];if(['sent','failed','skipped'].includes(delivery?.status))break;await new Promise(r=>setTimeout(r,1000));}
  const result={owner_user_id:1,recipient_count:1,notification_id:n.id,...delivery,token_check:true,verified_at:new Date().toISOString(),phone_receipt:'awaiting_owner_confirmation'};fs.writeFileSync(root+'/wecom-test.json',JSON.stringify(result,null,2),{mode:0o600});
  const verified=JSON.parse(fs.readFileSync(root+'/verified.json'));verified.wecom={...verified.wecom,test_sent:true,delivery_status:delivery?.status,phone_receipt:result.phone_receipt};fs.writeFileSync(root+'/verified.json',JSON.stringify(verified,null,2),{mode:0o600});console.log(JSON.stringify(result,null,2));assert.equal(delivery?.status,'sent');
 }finally{await db.end();}
})().catch(e=>{console.error('B28 reminder verification failed:',e.code||e.message);process.exitCode=1;});
