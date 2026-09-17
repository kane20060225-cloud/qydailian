'use strict';
const {postAccountDelta,recordOperation}=require('./accounting');
async function resetIncome(db,batch){
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(batch))throw Error('Invalid reset batch');
 await db.beginTransaction();
 try{
  const [existing]=await db.execute('SELECT * FROM income_reset_checkpoint WHERE id=1 FOR UPDATE');
  if(existing.length){await db.rollback();return {already_applied:true,batch_ref:existing[0].batch_ref};}
  const [users]=await db.execute('SELECT id,earnings,rental_earnings FROM users ORDER BY id FOR UPDATE');
  const report={batch_ref:batch,accounts:[],booster_total:0,rental_total:0,test_orders:{}};
  for(const u of users)for(const account of ['earnings','rental_earnings']){
   const value=Math.round(Number(u[account]||0)*100)/100;if(!Number.isFinite(value))throw Error('Invalid historic earnings');
   if(value){await postAccountDelta(db,{userId:u.id,accountType:account,delta:-value,entryKey:`income-reset:${batch}:${u.id}:${account}`,sourceType:'test_income_reset',sourceRef:batch});
    report.accounts.push({user_id:u.id,account,before:value,after:0});report[account==='earnings'?'booster_total':'rental_total']+=value;}
  }
  for(const [type,table] of [['boost','orders'],['rental','rental_orders'],['third_party','third_party_orders']]){
   const [result]=await db.execute(`INSERT INTO income_test_orders(order_type,order_ref,batch_ref) SELECT ?,order_no,? FROM ${table}`,[type,batch]);report.test_orders[type]=result.affectedRows;
  }
  const [max]=await db.execute('SELECT COALESCE(MAX(id),0) AS cutoff FROM account_ledger');
  await db.execute('INSERT INTO income_reset_checkpoint(id,ledger_cutoff,batch_ref) VALUES(1,?,?)',[max[0].cutoff,batch]);
  await recordOperation(db,{eventKey:'income-reset:'+batch,action:'test_income_reset',targetType:'income_batch',targetRef:batch});
  const [remaining]=await db.execute('SELECT COUNT(*) AS count FROM users WHERE earnings<>0 OR rental_earnings<>0');if(Number(remaining[0].count)!==0)throw Error('Income reset verification failed');
  await db.commit();report.ledger_cutoff=String(max[0].cutoff);report.booster_total=Number(report.booster_total.toFixed(2));report.rental_total=Number(report.rental_total.toFixed(2));return report;
 }catch(e){await db.rollback();throw e;}
}
module.exports={resetIncome};
