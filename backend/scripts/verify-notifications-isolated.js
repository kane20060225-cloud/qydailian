'use strict';
// Explicit isolated database and synthetic identities only. No production .env or real WeCom transport.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const mysql=require('mysql2/promise');const bcrypt=require('bcryptjs');
const {runMigration}=require('../lib/b12-order-notifications-migration');const {enqueueHall,createNotificationSystem}=require('../lib/order-notifications');const {createNotificationRouter}=require('../routes/order-notifications');const {createFieldCipher}=require('../lib/field-encryption');const {SECRET_CONTEXT}=require('../lib/wecom-client');const {recordOperation}=require('../lib/accounting');const {issueSessionToken}=require('../lib/auth-session');
const database=process.argv.find(a=>a.startsWith('--database='))?.slice(11);
if(!/^qydailian_b12_test_[a-z0-9_]+$/.test(database||'')||fs.existsSync(path.join(__dirname,'..','.env'))){console.error('Requires explicit --database=qydailian_b12_test_<suffix> and no .env in the test source');process.exit(2);}
Object.assign(process.env,{DB_NAME:database,JWT_SECRET:'b12-synthetic-session-only',DATA_ENCRYPTION_KEY:Buffer.alloc(32,12).toString('base64'),ALIPAY_ENABLED:'false'});
(async()=>{
  const pool=mysql.createPool({host:process.env.DB_HOST||'127.0.0.1',user:process.env.DB_USER,password:process.env.DB_PASSWORD,database,connectionLimit:6});let server,appPool;
  const cipher=createFieldCipher(process.env.DATA_ENCRYPTION_KEY);let sends=0,failOnce=false;
  const transport={identity:async(config,code)=>code==='synthetic-admin-code'?'admin_2':'worker_3',token:async()=> 'synthetic-token',send:async(config,identity,n)=>{assert.match(identity,/^(worker|admin)_/);assert.equal(n.body.includes('do-not-leak'),false);if(failOnce){failOnce=false;throw Object.assign(Error('synthetic failure'),{code:'WECOM_NETWORK'});}sends++;return 'synthetic-message-'+sends;}};
  try{
    assert.equal((await pool.execute('SELECT DATABASE() AS name'))[0][0].name,database);assert.equal(Number((await pool.execute('SELECT COUNT(*) AS n FROM users'))[0][0].n),0);
    const c=await pool.getConnection();try{await runMigration(c);await runMigration(c,{apply:true});await runMigration(c,{apply:true});}finally{c.release();}
    const password=await bcrypt.hash('synthetic-admin-password',4);
    await pool.execute("INSERT INTO users (id,username,password_hash,role,booster_identity) VALUES (1,'b12-customer',?,'user','standard'),(2,'b12-admin',?,'admin','gold'),(3,'b12-standard',?,'booster','standard'),(4,'b12-gold',?,'booster','gold'),(5,'b12-budget',?,'booster','budget'),(6,'b12-optout',?,'booster','gold')",Array(6).fill(password));
    await pool.execute('INSERT INTO notification_preferences (user_id,new_orders) VALUES (6,0)');
    await pool.execute("INSERT INTO wecom_notification_config (id,corp_id,agent_id,corp_secret,enabled) VALUES (1,'ww12345678',1000002,?,1)",[cipher.encrypt('syntheticSecret1234',SECRET_CONTEXT)]);
    await pool.execute("INSERT INTO wecom_user_bindings (user_id,corp_id,agent_id,wecom_user_id) VALUES (3,'ww12345678',1000002,'worker_3'),(4,'ww12345678',1000002,'worker_4')");
    for(const ref of ['TEST-HALL','TEST-RETRY','TEST-ROLLBACK'])await pool.execute("INSERT INTO orders (order_no,user_id,project,detail,total_price,payment_status,required_identity,game_account,game_password) VALUES (?,1,'silver','synthetic',10,'paid','standard','do-not-leak-account','do-not-leak-password')",[ref]);
    // Capture the actual app pool so it can be closed after using real authenticated take/dispatch routes.
    const original=mysql.createPool;mysql.createPool=options=>{appPool=original(options);return appPool;};let app;try{({app}=require('../server'));}finally{mysql.createPool=original;}
    const system=createNotificationSystem({pool,cipher,wecomClient:transport,siteUrl:'https://example.test'});
    app.use('/test-notifications',createNotificationRouter({pool,system,cipher,wecomClient:transport,siteUrl:'https://example.test',recordOperation,authMiddleware:require('../lib/auth-session').createAuthMiddleware(pool,process.env.JWT_SECRET)}));
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`;
    const headers=id=>({Authorization:`Bearer ${issueSessionToken(id,0,process.env.JWT_SECRET)}`});
    const dispatch=ref=>fetch(origin+'/api/admin/orders/'+ref+'/hall',{method:'PUT',headers:headers(2)});
    assert.equal((await dispatch('TEST-HALL')).status,200);assert.equal((await dispatch('TEST-HALL')).status,409);
    const [recipients]=await pool.execute("SELECT user_id,body FROM order_notifications WHERE event_key='hall:TEST-HALL' ORDER BY user_id");assert.deepEqual(recipients.map(n=>n.user_id),[3,4]);assert.equal(recipients.some(n=>n.body.includes('do-not-leak')),false);
    const tx=await pool.getConnection();try{await tx.beginTransaction();await enqueueHall(tx,'TEST-HALL');await tx.commit();}finally{tx.release();}
    assert.equal(Number((await pool.execute("SELECT COUNT(*) AS n FROM order_notifications WHERE event_key='hall:TEST-HALL'"))[0][0].n),2);
    await system.deliver();assert.equal(sends,2);
    const take=id=>fetch(origin+'/api/booster/take/TEST-HALL',{method:'POST',headers:headers(id)});
    const results=await Promise.all([take(3),take(4)]);assert.equal(results.filter(r=>r.status===200).length,1);
    assert.equal((await pool.execute("SELECT COUNT(*) AS n FROM operation_audit WHERE action='order_taken' AND target_ref='TEST-HALL'"))[0][0].n,1);
    const customer=await fetch(origin+'/api/notifications',{headers:headers(1)});const inbox=await customer.json();assert.equal(customer.status,200);assert.ok(inbox.notifications.some(n=>n.title==='订单已接单'));
    const forbidden=await fetch(origin+'/api/notifications/wecom/config',{headers:headers(1)});assert.equal(forbidden.status,403);
    await system.deliver();
    // Simulated external failure persists a retry; taking the order before retry suppresses stale hall messages.
    assert.equal((await dispatch('TEST-RETRY')).status,200);failOnce=true;await system.deliver();
    assert.ok((await pool.execute("SELECT status FROM notification_deliveries WHERE status='retry'"))[0].length>=1);
    await pool.execute("UPDATE orders SET booster_id=3,status='playing',hall_status='taken' WHERE order_no='TEST-RETRY'");await pool.execute('UPDATE notification_deliveries SET retry_after=NOW()');
    const before=sends;await system.deliver();assert.equal(sends,before);
    const failed=await pool.getConnection();try{await failed.beginTransaction();await failed.execute("UPDATE orders SET hall_status='open' WHERE order_no='TEST-ROLLBACK'");await enqueueHall(failed,'TEST-ROLLBACK');await failed.rollback();}finally{failed.release();}
    assert.equal((await pool.execute("SELECT COUNT(*) AS n FROM order_notifications WHERE order_ref='TEST-ROLLBACK'"))[0][0].n,0);
    assert.equal((await fetch(origin+'/test-notifications/wecom/config',{headers:headers(2)})).status,200);
    const publicSettings=await (await fetch(origin+'/test-notifications/wecom/config',{headers:headers(2)})).text();assert.equal(publicSettings.includes('syntheticSecret'),false);assert.equal(publicSettings.includes('enc:v1'),false);
    const bind=await fetch(origin+'/test-notifications/wecom/bind',{method:'POST',headers:headers(2)});const binding=await bind.json();const state=new URL(binding.url).searchParams.get('state');assert.equal(state.length,64);
    const callback=await fetch(origin+'/test-notifications/wecom/callback?state='+state+'&code=synthetic-admin-code',{redirect:'manual'});assert.match(callback.headers.get('location'),/wecom_binding=success/);
    const replay=await fetch(origin+'/test-notifications/wecom/callback?state='+state+'&code=synthetic-admin-code',{redirect:'manual'});assert.match(replay.headers.get('location'),/wecom_binding=expired/);
    const duplicateBind=await (await fetch(origin+'/test-notifications/wecom/bind',{method:'POST',headers:headers(2)})).json();
    const duplicate=await fetch(origin+'/test-notifications/wecom/callback?state='+new URL(duplicateBind.url).searchParams.get('state')+'&code=synthetic-worker-code',{redirect:'manual'});assert.equal(duplicate.headers.get('location').includes('wecom_binding=success'),false);
    assert.equal((await pool.execute("SELECT user_id FROM wecom_user_bindings WHERE wecom_user_id='worker_3'"))[0][0].user_id,3);
    const saved=await fetch(origin+'/test-notifications/wecom/config',{method:'PUT',headers:{...headers(2),'Content-Type':'application/json'},body:JSON.stringify({corp_id:'ww12345678',agent_id:1000002,corp_secret:'',enabled:false,current_password:'synthetic-admin-password'})});assert.equal(saved.status,200);
    assert.equal((await system.deliver()).disabled,true);
    console.log('Notification isolated verification passed: actual dispatch/take concurrency, identity/preferences, atomic rollback, dedup, retry/stale suppression, scoped inbox, encrypted config and one-use unique OAuth bindings; all enterprise calls simulated.');
  }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(appPool)await appPool.end();await pool.end();}
})().catch(err=>{console.error('Notification isolated verification failed:',err.code||err.message);console.error(err.stack?.split('\n').slice(0,5).join('\n'));process.exitCode=1;});
