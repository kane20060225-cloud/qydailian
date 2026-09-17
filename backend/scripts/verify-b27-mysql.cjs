'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');const {Readable}=require('node:stream');
async function verify(db,{completion,reset,accounting,finance,uploadDir}){
 await db.execute("CREATE TABLE users(id INT PRIMARY KEY,username VARCHAR(80),role VARCHAR(20),earnings DECIMAL(10,2),rental_earnings DECIMAL(10,2),qy_credits INT,booster_points INT,chest_tickets INT,balance DECIMAL(10,2)) ENGINE=InnoDB");
 await db.execute("CREATE TABLE orders(order_no VARCHAR(64) PRIMARY KEY,user_id INT,booster_id INT,status VARCHAR(20),payment_status VARCHAR(20),total_price DECIMAL(10,2),project VARCHAR(80),detail VARCHAR(200)) ENGINE=InnoDB");
 await db.execute('CREATE TABLE rental_orders(order_no VARCHAR(64) PRIMARY KEY)');await db.execute('CREATE TABLE third_party_orders(order_no VARCHAR(64) PRIMARY KEY)');
 await db.execute("CREATE TABLE account_ledger(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,entry_key VARCHAR(128) UNIQUE,user_id INT,account_type VARCHAR(30),amount_delta DECIMAL(16,2),balance_after DECIMAL(16,2),source_type VARCHAR(40),source_ref VARCHAR(80),actor_user_id INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB");
 await db.execute('CREATE TABLE operation_audit(id BIGINT AUTO_INCREMENT PRIMARY KEY,event_key VARCHAR(128) UNIQUE,actor_user_id INT,action VARCHAR(64),target_type VARCHAR(40),target_ref VARCHAR(80)) ENGINE=InnoDB');
 await db.execute('CREATE TABLE order_management_events(id BIGINT AUTO_INCREMENT PRIMARY KEY,order_type VARCHAR(20),order_ref VARCHAR(64),actor_user_id INT,action VARCHAR(50),note VARCHAR(500)) ENGINE=InnoDB');
 await completion.migrate(db);await db.execute("INSERT INTO users VALUES(7,'fixture','booster',10,5,200,100,10,6)");await db.execute("INSERT INTO orders VALUES('TEST',7,7,'playing','paid',10,'test','fixture')");
 const conn={execute:(q,p)=>db.execute(q,p),beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release(){}};
 const pool={getConnection:async()=>conn,execute:conn.execute};
 const send=()=>completion.submit({pool,userId:7,orderNo:'TEST',stream:Readable.from([Buffer.from('89504e470d0a1a0a00000000','hex')]),contentType:'image/png',uploadDir});
 const settle=async(c,o,actor)=>{await c.execute("UPDATE orders SET status='done' WHERE order_no=?",[o.order_no]);await accounting.postAccountDelta(c,{userId:7,accountType:'earnings',delta:7.5,entryKey:'order:TEST:booster_earnings',sourceType:'order',sourceRef:'TEST',actorUserId:actor});return 7.5;};settle.uploadDir=uploadDir;
 const s=await send();assert.equal(Number((await db.execute('SELECT earnings FROM users'))[0][0].earnings),10);await assert.rejects(()=>send());
 await completion.review({pool,id:s.submission_id,actor:1,decision:'rejected',reason:'补充结果',settle});const second=await send();await completion.review({pool,id:second.submission_id,actor:1,decision:'approved',reason:'核对通过',settle});await assert.rejects(()=>completion.review({pool,id:second.submission_id,actor:1,decision:'approved',reason:'',settle}));
 assert.equal(Number((await db.execute('SELECT earnings FROM users'))[0][0].earnings),17.5);
 const result=await reset.resetIncome(db,'ISOLATED-B27');assert.equal(result.booster_total,17.5);assert.equal(result.rental_total,5);assert.equal(result.test_orders.boost,1);
 const u=(await db.execute('SELECT * FROM users'))[0][0];assert.equal(Number(u.earnings),0);assert.equal(Number(u.rental_earnings),0);assert.equal(u.qy_credits,200);assert.equal(u.booster_points,100);assert.equal(u.chest_tickets,10);assert.equal(Number(u.balance),6);
 assert.equal((await reset.resetIncome(db,'ISOLATED-B27')).already_applied,true);const zero=await finance.earnings(pool,7,{range:'all'});assert.equal(Number(zero.summary.net),0);assert.equal(zero.entries.length,0);assert.equal(zero.legacy_unlinked,0);
 await accounting.postAccountDelta(db,{userId:7,accountType:'earnings',delta:3.25,entryKey:'new-live-income',sourceType:'order',sourceRef:'NEW'});
 const live=await finance.earnings(pool,7,{range:'all'});assert.equal(Number(live.summary.income),3.25);assert.equal(live.earnings,3.25);assert.equal(live.entries.length,1);await fs.rm(uploadDir,{recursive:true,force:true});
 return {screenshot_submission:true,rejection_resubmission:true,one_time_approval:true,reset_idempotent:true,other_balances_preserved:true,historical_income_excluded:true,new_income_visible:true};
}
module.exports={verify};
