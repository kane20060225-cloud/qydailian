'use strict';
// Called by the protected deployment script on a dedicated connection.
// Temporary tables shadow production names only for this connection and disappear on close.
const assert=require('node:assert/strict');
async function verify(db,finance){
 await db.execute("SET time_zone='+00:00'");
 await db.execute('CREATE TEMPORARY TABLE users (id INT PRIMARY KEY,username VARCHAR(80),role VARCHAR(20),earnings DECIMAL(10,2)) ENGINE=InnoDB');
 await db.execute('CREATE TEMPORARY TABLE orders (order_no VARCHAR(64) PRIMARY KEY,booster_id INT,status VARCHAR(20),payment_status VARCHAR(20),total_price DECIMAL(10,2),project VARCHAR(80),detail VARCHAR(200)) ENGINE=InnoDB');
 await db.execute("CREATE TEMPORARY TABLE account_ledger (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,entry_key VARCHAR(128) UNIQUE,user_id INT,account_type VARCHAR(30),amount_delta DECIMAL(16,2),balance_after DECIMAL(16,2),source_type VARCHAR(40),source_ref VARCHAR(80),actor_user_id INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB");
 await db.execute('CREATE TEMPORARY TABLE account_ledger_lookup LIKE account_ledger');
 await db.execute('CREATE TEMPORARY TABLE order_management_events (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,order_type VARCHAR(20),order_ref VARCHAR(64),actor_user_id INT,action VARCHAR(50),note VARCHAR(500)) ENGINE=InnoDB');
 await db.execute('CREATE TEMPORARY TABLE operation_audit (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,event_key VARCHAR(128) UNIQUE,actor_user_id INT,action VARCHAR(64),target_type VARCHAR(40),target_ref VARCHAR(80)) ENGINE=InnoDB');
 await db.execute("INSERT INTO users VALUES (7,'isolated-fixture','booster',100)");
 for(const ref of ['MYSQL-TEST','MYSQL-ROLLBACK','MYSQL-LEGACY'])await db.execute("INSERT INTO orders VALUES (?,7,'done','paid',70.20,'silver','isolated fixture')",[ref]);
 await db.execute("INSERT INTO account_ledger (entry_key,user_id,account_type,amount_delta,balance_after,source_type,source_ref) VALUES ('order:MYSQL-TEST:booster_earnings',7,'earnings',52.65,100,'order','MYSQL-TEST')");
 let failAudit=false;
 // MySQL temporary tables cannot be reopened twice in one SELECT. A synchronized
 // temporary lookup clone handles the reversal subquery; original production SQL
 // is independently checked unchanged by EXPLAIN below.
 const conn={execute:async(sql,p)=>{
  if(failAudit&&sql.startsWith('INSERT INTO operation_audit'))throw Error('intentional fixture audit failure');
  if(sql.startsWith('SELECT l.id')){await db.execute('DELETE FROM account_ledger_lookup');await db.execute('INSERT INTO account_ledger_lookup SELECT * FROM account_ledger');sql=sql.replace('account_ledger r','account_ledger_lookup r');}
  return db.execute(sql,p);
 },beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release(){}};
 const pool={execute:conn.execute,getConnection:async()=>conn};
 const report=await finance.earnings(pool,7,{range:'all'});assert.equal(Number(report.summary.income),52.65);assert.equal(report.legacy_unlinked,47.35);assert.equal(Number(report.entries[0].order_income),1);
 const p=await finance.preview(pool,'MYSQL-TEST');const body={snapshot:p.snapshot,confirmation:'REVERSE_TEST_EARNINGS',reason:'isolated MySQL fixture'};
 await finance.reverseTest({pool,ref:'MYSQL-TEST',actor:1,body});assert.equal(Number((await db.execute('SELECT earnings FROM users WHERE id=7'))[0][0].earnings),47.35);
 await assert.rejects(()=>finance.reverseTest({pool,ref:'MYSQL-TEST',actor:1,body}),e=>e.status===409);
 assert.equal(Number((await finance.earnings(pool,7,{range:'all'})).summary.net),0);
 await db.execute("INSERT INTO account_ledger (entry_key,user_id,account_type,amount_delta,balance_after,source_type,source_ref) VALUES ('order:MYSQL-ROLLBACK:booster_earnings',7,'earnings',52.65,100,'order','MYSQL-ROLLBACK')");await db.execute('UPDATE users SET earnings=100 WHERE id=7');
 const next=await finance.preview(pool,'MYSQL-ROLLBACK');failAudit=true;
 await assert.rejects(()=>finance.reverseTest({pool,ref:'MYSQL-ROLLBACK',actor:1,body:{...body,snapshot:next.snapshot}}));failAudit=false;
 assert.equal(Number((await db.execute('SELECT earnings FROM users WHERE id=7'))[0][0].earnings),100);
 assert.equal(Number((await db.execute("SELECT COUNT(*) AS n FROM account_ledger WHERE entry_key='order:MYSQL-ROLLBACK:booster_earnings_test_reversal'"))[0][0].n),0);
 const legacy=await finance.preview(pool,'MYSQL-LEGACY',50);await finance.reverseTest({pool,ref:'MYSQL-LEGACY',actor:1,body:{...body,snapshot:legacy.snapshot,legacy_amount:50,reference:'isolated historical record'}});
 assert.equal(Number((await db.execute('SELECT earnings FROM users WHERE id=7'))[0][0].earnings),50);
 await assert.rejects(()=>finance.preview(pool,'MYSQL-LEGACY',53),e=>e.status===400);
 return {temporary_mysql_tables:true,real_transactions_verified:true,repeated_reversal_blocked:true,audit_failure_rolled_back:true,legacy_evidence_verified:true};
}
async function explain(db,finance){
 let queries=0;
 const adapter={execute:async(sql,p)=>{
  if(sql.startsWith('SELECT earnings,role'))return [[{earnings:0,role:'booster'}]];
  assert.ok(sql.startsWith('SELECT'));await db.execute('EXPLAIN '+sql,p);queries++;
  return sql.startsWith('SELECT l.id')?[[]]:[[{income:0,deductions:0,net:0,total:0,orders:0,estimate:0}]];
 }};
 await finance.earnings(adapter,0,{range:'7'});assert.equal(queries,4);return queries;
}
module.exports={verify,explain};
