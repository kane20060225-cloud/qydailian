'use strict';
// Synthetic fixtures only. Never loads the production .env or accepts a production database name.
const assert=require('node:assert/strict');const mysql=require('mysql2/promise');const express=require('express');
const {runMigration}=require('../lib/b11-order-cleanup-migration');
const {changeRemoval,candidates,createCleanupService}=require('../lib/order-cleanup');
const {recordOperation}=require('../lib/accounting');const {createOrderCenterRouter}=require('../routes/order-center');
const {visibleOrdersSql}=require('../lib/order-center');
const {createRechargeOrder,processTrackedRecharge}=require('../lib/recharge-orders');
const database=process.argv.find(a=>a.startsWith('--database='))?.slice(11);
if(!/^qydailian_b11_test_[a-z0-9_]+$/.test(database||'')){console.error('Explicit --database=qydailian_b11_test_<suffix> required');process.exit(2);}
(async()=>{
  const pool=mysql.createPool({host:process.env.DB_HOST||'127.0.0.1',user:process.env.DB_USER,password:process.env.DB_PASSWORD,database,connectionLimit:6});let server;
  try{
    assert.equal((await pool.execute('SELECT DATABASE() AS name'))[0][0].name,database);
    assert.equal(Number((await pool.execute('SELECT COUNT(*) AS total FROM users'))[0][0].total),0,'Requires an empty test database');
    const conn=await pool.getConnection();try{await runMigration(conn);await runMigration(conn,{apply:true});await runMigration(conn,{apply:true});}finally{conn.release();}
    await pool.execute("INSERT INTO users (id,username,password_hash,role) VALUES (1,'b11-customer','test','user'),(2,'b11-admin','test','admin'),(3,'b11-booster','test','booster')");
    for(const ref of ['OLD','FUNDED','ASSIGNED','REVIEW','YOUNG','ROLLBACK','RACE','EVIDENCE'])await pool.execute("INSERT INTO orders (order_no,user_id,project,detail,total_price,payment_status,created_at) VALUES (?,1,'test','cleanup',6,'unpaid',DATE_SUB(NOW(),INTERVAL 10 DAY))",[ref]);
    await pool.execute("UPDATE orders SET created_at=NOW() WHERE order_no='YOUNG'");
    await pool.execute("UPDATE orders SET booster_id=3 WHERE order_no='ASSIGNED'");
    await pool.execute("UPDATE orders SET payment_status='pending' WHERE order_no='REVIEW'");
    await pool.execute("INSERT INTO account_ledger (entry_key,user_id,account_type,amount_delta,balance_after,source_type,source_ref) VALUES ('b11-test-funded',1,'qy_credits',-1,0,'order','FUNDED')");
    await pool.execute("INSERT INTO manual_payment_evidence (business_type,business_ref,uploader_user_id,filename,expected_amount) VALUES ('order','EVIDENCE',1,'synthetic.png',6)");
    const [account]=await pool.execute("INSERT INTO rental_accounts (owner_id,client_type,status) VALUES (3,'Android','active')");
    await pool.execute("INSERT INTO rental_orders (order_no,renter_id,owner_id,account_id,total_price,status,created_at) VALUES ('OLD-RENT',1,3,?,6,'cancelled',DATE_SUB(NOW(),INTERVAL 10 DAY))",[account.insertId]);
    await pool.execute("INSERT INTO third_party_orders (order_no,creator_id,platform,content,account_info,price,status,created_at) VALUES ('OLD-TP',3,'安卓官服','synthetic','test',6,'rejected',DATE_SUB(NOW(),INTERVAL 10 DAY))");
    const closed=await createRechargeOrder(pool,1);await pool.execute("UPDATE payment_orders SET status='closed',created_at=DATE_SUB(NOW(),INTERVAL 10 DAY) WHERE out_trade_no=?",[closed.out_trade_no]);
    await pool.execute("UPDATE recharge_order_workflow SET provider_status='TRADE_CLOSED',provider_checked_at=NOW() WHERE out_trade_no=?",[closed.out_trade_no]);
    const pending=await createRechargeOrder(pool,1);await pool.execute('UPDATE payment_orders SET created_at=DATE_SUB(NOW(),INTERVAL 10 DAY) WHERE out_trade_no=?',[pending.out_trade_no]);
    const deps={pool,recordOperation};
    const remove=(type,ref,extra={})=>changeRemoval({...deps,type,ref,actor:2,reason:'isolated test order',...extra});
    const app=express();app.use(express.json());app.use('/api/order-center',createOrderCenterRouter({...deps,authMiddleware:(req,res,next)=>{req.userId=Number(req.get('X-Test-User')||2);next();},revealOrderCredentials:x=>x}));
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/order-center`;
    const list=async(trash=false)=>{const response=await fetch(base+`?scope=admin&trash=${trash?'1':'0'}`);assert.equal(response.status,200);return response.json();};
    await remove('boost','OLD');assert.equal((await list()).orders.some(o=>o.order_ref==='OLD'),false);assert.equal((await list(true)).orders.some(o=>o.order_ref==='OLD'),true);
    assert.equal((await pool.execute(`SELECT orders.order_no FROM orders WHERE orders.order_no='OLD' AND ${visibleOrdersSql('boost','orders.order_no')}`))[0].length,0);
    assert.equal((await pool.execute("SELECT COUNT(*) AS n FROM orders WHERE order_no='OLD'"))[0][0].n,1);
    await remove('boost','OLD',{restore:true});assert.equal((await list()).orders.some(o=>o.order_ref==='OLD'),true);
    for(const ref of ['FUNDED','ASSIGNED','REVIEW','EVIDENCE'])await assert.rejects(()=>remove('boost',ref));
    await assert.rejects(()=>changeRemoval({...deps,type:'boost',ref:'ROLLBACK',actor:2,reason:'rollback',recordOperation:async()=>{throw Error('injected audit failure');}}));
    assert.equal((await pool.execute("SELECT COUNT(*) AS n FROM order_removals WHERE order_ref='ROLLBACK'"))[0][0].n,0);
    const recharge=await createRechargeOrder(pool,1);await remove('recharge',recharge.out_trade_no);
    assert.equal((await list(true)).orders.some(o=>o.order_ref===recharge.out_trade_no),true);
    const notify={pool,notification:{out_trade_no:recharge.out_trade_no,trade_no:'b11-synthetic-trade',trade_status:'TRADE_SUCCESS',total_amount:'6.00',app_id:'b11-app',seller_id:'b11-seller'},expectedAppId:'b11-app',expectedSellerId:'b11-seller'};
    await Promise.all([processTrackedRecharge(notify),processTrackedRecharge(notify)]);
    assert.equal((await pool.execute('SELECT chest_tickets FROM users WHERE id=1'))[0][0].chest_tickets,10000);
    assert.equal((await list()).orders.find(o=>o.order_ref===recharge.out_trade_no).state,'credited');
    await remove('recharge',recharge.out_trade_no);assert.equal((await pool.execute("SELECT COUNT(*) AS n FROM account_ledger WHERE source_ref=?",[recharge.out_trade_no]))[0][0].n,1);
    // A concurrent payment writer holds the same source-row lock. Deletion must observe its committed paid state.
    const writer=await pool.getConnection();await writer.beginTransaction();await writer.execute("SELECT id FROM orders WHERE order_no='RACE' FOR UPDATE");
    const racing=remove('boost','RACE');await writer.execute("UPDATE orders SET payment_status='paid' WHERE order_no='RACE'");await writer.commit();writer.release();await assert.rejects(()=>racing);
    const preview=await candidates(pool,7);for(const ref of ['OLD','OLD-RENT','OLD-TP',closed.out_trade_no])assert.ok(preview.some(o=>o.order_ref===ref));for(const ref of ['FUNDED','ASSIGNED','REVIEW','YOUNG','RACE','EVIDENCE',pending.out_trade_no])assert.equal(preview.some(o=>o.order_ref===ref),false);
    const service=createCleanupService(deps);assert.equal((await service.run()).disabled,true);await pool.execute('INSERT INTO order_cleanup_settings (id,enabled,retention_days) VALUES (1,1,7)');
    const result=await service.run();assert.ok(result.removed>=4);assert.equal((await list()).orders.some(o=>o.order_ref==='OLD'),false);
    assert.equal((await pool.execute(`SELECT ro.order_no FROM rental_orders ro WHERE ${visibleOrdersSql('rental','ro.order_no')}`))[0].length,0);
    assert.equal((await pool.execute(`SELECT t.order_no FROM third_party_orders t WHERE ${visibleOrdersSql('third_party','t.order_no')}`))[0].length,0);
    assert.equal((await pool.execute('SELECT COUNT(*) AS n FROM orders'))[0][0].n,8);
    console.log('B11 isolated verification passed: trash/restore, row locks, funded protection, rollback, expiry, automatic cleanup and late duplicate recharge callbacks credit once.');
  }finally{if(server)await new Promise(r=>server.close(r));await pool.end();}
})().catch(err=>{console.error('B11 isolated verification failed:',err.code||err.message);process.exitCode=1;});
