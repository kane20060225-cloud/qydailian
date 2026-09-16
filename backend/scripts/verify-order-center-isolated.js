'use strict';
// This verification can only connect to an explicitly named, empty test database.
const assert=require('node:assert/strict');
const mysql=require('mysql2/promise');
const express=require('express');
const {runMigration}=require('../lib/b9-order-center-migration');
const {createRechargeOrder,processTrackedRecharge,refreshRecharge}=require('../lib/recharge-orders');
const {createOrderCenterRouter}=require('../routes/order-center');
const {recordOperation}=require('../lib/accounting');
const database=process.argv.find(arg=>arg.startsWith('--database='))?.slice(11);
if(!/^qydailian_b9_test_[a-z0-9_]+$/.test(database||'')) {
  console.error('An explicit --database=qydailian_b9_test_<suffix> is required');process.exit(2);
}
(async()=>{
  const pool=mysql.createPool({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),
    user:process.env.DB_USER,password:process.env.DB_PASSWORD,database,connectionLimit:6});
  let server;
  try {
    const [[identity]]=await pool.execute('SELECT DATABASE() AS name');assert.equal(identity.name,database);
    const [[count]]=await pool.execute('SELECT COUNT(*) AS total FROM users');assert.equal(Number(count.total),0,'Test database must contain no users');
    const conn=await pool.getConnection();try{await runMigration(conn);await runMigration(conn,{apply:true});await runMigration(conn,{apply:true});}finally{conn.release();}
    await pool.execute("INSERT INTO users (id,username,password_hash,role) VALUES (1,'test-customer','test','user'),(2,'test-owner','test','user'),(3,'test-admin','test','admin'),(4,'test-other','test','user'),(5,'test-booster','test','booster')");
    await pool.execute("INSERT INTO orders (order_no,user_id,project,detail,total_price,payment_status,game_account,game_password) VALUES ('B9-BOOST',1,'test','boost',10,'pending','test-account','test-password')");
    const [account]=await pool.execute("INSERT INTO rental_accounts (owner_id,client_type,status) VALUES (2,'Android','active')");
    await pool.execute("INSERT INTO rental_orders (order_no,renter_id,owner_id,account_id,total_price) VALUES ('B9-RENT',1,2,?,6)",[account.insertId]);
    await pool.execute("INSERT INTO rental_order_workflow (order_no,payment_status) VALUES ('B9-RENT','submitted')");
    await pool.execute("INSERT INTO qy_purchases (user_id,item_id,item_name,price_credits) VALUES (1,1,'test item',10)");
    await pool.execute("INSERT INTO third_party_orders (order_no,creator_id,platform,content,account_info,price) VALUES ('B9-TP',5,'安卓官服','test task','test account',6)");
    const recharge=await createRechargeOrder(pool,1);
    const paymentConfig={appId:'test-app',sellerId:'test-seller'};
    const notification={out_trade_no:recharge.out_trade_no,trade_no:'test-trade-1',trade_status:'TRADE_SUCCESS',total_amount:'6.00',app_id:paymentConfig.appId,seller_id:paymentConfig.sellerId};
    const options={pool,notification,expectedAppId:paymentConfig.appId,expectedSellerId:paymentConfig.sellerId};
    const failedPool={execute:pool.execute.bind(pool),getConnection:async()=>{
      const c=await pool.getConnection();return {beginTransaction:c.beginTransaction.bind(c),commit:c.commit.bind(c),rollback:c.rollback.bind(c),release:c.release.bind(c),execute:async(sql,p)=>{if(sql.startsWith('INSERT INTO account_ledger'))throw Error('synthetic ledger failure');return c.execute(sql,p);}};
    }};
    await assert.rejects(()=>processTrackedRecharge({...options,pool:failedPool}));
    const [[before]]=await pool.execute('SELECT chest_tickets FROM users WHERE id=1');assert.equal(before.chest_tickets,0);
    const app=express();app.use(express.json());app.use('/api/order-center',createOrderCenterRouter({pool,
      authMiddleware:(req,res,next)=>{req.userId=Number(req.get('X-Test-User')||1);next();},recordOperation,revealOrderCredentials:x=>x}));
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api/order-center`;
    const get=async(path='',user=1)=>{const res=await fetch(base+path,{headers:{'X-Test-User':String(user)}});const data=await res.json();assert.equal(res.status,200,JSON.stringify(data));return data;};
    let data=await get('?type=recharge');assert.equal(data.orders[0].state,'credit_pending');assert.equal(data.orders[0].actions.includes('pay'),false);
    const sdk={exec:async(method,params,opts)=>{assert.equal(opts.validateSign,true);return {code:'10000',outTradeNo:recharge.out_trade_no,tradeNo:'test-trade-1',tradeStatus:'TRADE_SUCCESS',totalAmount:'6.00'};}};
    await refreshRecharge({pool,alipaySdk:sdk,outTradeNo:recharge.out_trade_no,paymentConfig});
    await Promise.all([processTrackedRecharge(options),processTrackedRecharge(options)]);
    const [[after]]=await pool.execute('SELECT chest_tickets FROM users WHERE id=1');assert.equal(after.chest_tickets,10000);
    const [[ledger]]=await pool.execute("SELECT COUNT(*) AS total FROM account_ledger WHERE source_type='payment_order' AND source_ref=?",[recharge.out_trade_no]);assert.equal(Number(ledger.total),1);
    await pool.execute("INSERT INTO payment_orders (out_trade_no,user_id,amount,status,alipay_trade_no) VALUES ('RC1700000000000HISTORY',1,6,'paid','test-historic-trade')");
    const historic={...notification,out_trade_no:'RC1700000000000HISTORY',trade_no:'test-historic-trade'};await processTrackedRecharge({...options,notification:historic});
    assert.equal((await get('/recharge/RC1700000000000HISTORY')).order.state,'exception');
    assert.equal((await get('/recharge/'+recharge.out_trade_no)).order.state,'credited');
    for(let i=0;i<27;i++)await createRechargeOrder(pool,1);
    await createRechargeOrder(pool,4);
    data=await get();assert.equal(data.total,32);assert.equal(data.orders.length,25);assert.equal(data.orders.some(o=>o.order_type==='third_party'),false);assert.equal(data.orders.some(o=>'game_password' in o),false);
    assert.equal((await get('?page=2')).orders.length,7);
    for(const type of ['boost','rental','recharge','shop']){const list=await get('?type='+type);assert.ok(list.orders.every(o=>o.order_type===type));await get('/'+type+'/'+list.orders[0].order_ref);}
    assert.equal((await get('?type=rental',2)).total,1);
    assert.equal((await get('?type=third_party',5)).total,1);await get('/third_party/B9-TP',5);
    assert.equal((await fetch(base+'?scope=admin')).status,403);
    assert.equal((await fetch(base+'/recharge/'+recharge.out_trade_no,{headers:{'X-Test-User':'4'}})).status,404);
    const todos=await get('?scope=admin&state=todo',3);assert.ok(todos.orders.some(o=>o.admin_task==='exception'));assert.ok(todos.orders.some(o=>o.admin_task==='payment'));
    const archive=await fetch(base+'/recharge/'+recharge.out_trade_no+'/archive?scope=admin',{method:'POST',headers:{'X-Test-User':'3','Content-Type':'application/json'},body:JSON.stringify({action:'archive',reason:'isolated verification'})});assert.equal(archive.status,200,await archive.text());
    assert.equal((await get('?scope=admin&archived=1',3)).total,1);assert.equal((await get('?search='+recharge.out_trade_no)).total,1);
    const unarchive=await fetch(base+'/recharge/'+recharge.out_trade_no+'/archive?scope=admin',{method:'POST',headers:{'X-Test-User':'3','Content-Type':'application/json'},body:JSON.stringify({action:'unarchive',reason:'isolated restoration'})});assert.equal(unarchive.status,200);
    const csv=await fetch(base+'/export?scope=admin&type=recharge',{headers:{'X-Test-User':'3'}});assert.equal(csv.status,200);assert.match(await csv.text(),/充值|recharge/);
    assert.equal((await pool.execute('SELECT chest_tickets FROM users WHERE id=1'))[0][0].chest_tickets,10000);
    console.log('Isolated verification passed: all 5 order types, permissions, pagination, archive/export, failed credit rollback and duplicate notification credited once.');
  } finally {if(server)await new Promise(resolve=>server.close(resolve));await pool.end();}
})().catch(err=>{console.error('Isolated verification failed:',err.code||err.message);process.exitCode=1;});
