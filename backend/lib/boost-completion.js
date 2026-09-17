'use strict';
const path=require('node:path'),fs=require('node:fs/promises');
const {saveRentalScreenshot}=require('./rental-stream-upload');
const {recordOperation}=require('./accounting');
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const ref=value=>{if(!/^[A-Za-z0-9_-]{1,64}$/.test(value||''))fail('订单号无效',400);return value;};
async function migrate(db){
 await db.execute(`CREATE TABLE IF NOT EXISTS boost_completion_submissions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,order_no VARCHAR(64) NOT NULL,booster_id INT NOT NULL,
 filename VARCHAR(120) NOT NULL,note VARCHAR(500) NOT NULL DEFAULT '',status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
 reviewer_id INT NULL,review_reason VARCHAR(500) NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,reviewed_at TIMESTAMP NULL,
 INDEX completion_order(order_no,id),INDEX completion_queue(status,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 await db.execute(`CREATE TABLE IF NOT EXISTS income_test_orders (order_type VARCHAR(20) NOT NULL,order_ref VARCHAR(64) NOT NULL,batch_ref VARCHAR(64) NOT NULL,PRIMARY KEY(order_type,order_ref)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 await db.execute(`CREATE TABLE IF NOT EXISTS income_reset_checkpoint (id TINYINT PRIMARY KEY,ledger_cutoff BIGINT UNSIGNED NOT NULL,batch_ref VARCHAR(64) NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}
async function submit({pool,userId,orderNo,stream,contentType,note='',uploadDir}){
 ref(orderNo);if(typeof note!=='string'||note.length>500)fail('结单说明最多500字',400);
 const conn=await pool.getConnection();let filename,committed=false;
 try{
  await conn.beginTransaction();
  const [orders]=await conn.execute('SELECT * FROM orders WHERE order_no = ? AND booster_id = ? AND status = ? FOR UPDATE',[orderNo,userId,'playing']);
  if(!orders.length||orders[0].payment_status!=='paid')fail('只能为本人已收款且代练中的订单提交结单');
  const [pending]=await conn.execute("SELECT id FROM boost_completion_submissions WHERE order_no=? AND status='pending'",[orderNo]);
  if(pending.length)fail('已提交结单，请等待管理员审核');
  filename=await saveRentalScreenshot({stream,contentType,uploadDir,userId});
  const [result]=await conn.execute('INSERT INTO boost_completion_submissions(order_no,booster_id,filename,note) VALUES(?,?,?,?)',[orderNo,userId,filename,note]);
  await conn.execute("INSERT INTO order_management_events(order_type,order_ref,actor_user_id,action,note) VALUES('boost',?,?,'boost_completion_submitted',?)",[orderNo,userId,note||'已上传结单截图，等待管理员审核']);
  await recordOperation(conn,{eventKey:'boost-completion:'+result.insertId+':submitted',actorUserId:userId,action:'boost_completion_submitted',targetType:'order',targetRef:orderNo});
  await conn.commit();committed=true;return {success:true,submission_id:result.insertId,message:'结单已提交，管理员审核通过后才会结算'};
 }catch(e){await conn.rollback();throw e;}finally{conn.release();if(filename&&!committed)await fs.rm(path.join(uploadDir,filename),{force:true});}
}
async function review({pool,id,actor,decision,reason,settle}){
 if(!Number.isSafeInteger(Number(id))||Number(id)<=0)fail('审核编号无效',400);
 if(!['approved','rejected'].includes(decision)||typeof reason!=='string'||reason.length>500||(decision==='rejected'&&reason.trim().length<2))fail('驳回时请填写原因（2至500字）',400);
 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();
  const [lookup]=await conn.execute('SELECT order_no FROM boost_completion_submissions WHERE id=?',[id]);if(!lookup.length)fail('结单申请不存在',404);
  const [orders]=await conn.execute('SELECT * FROM orders WHERE order_no=? FOR UPDATE',[lookup[0].order_no]);
  const [rows]=await conn.execute('SELECT * FROM boost_completion_submissions WHERE id=? FOR UPDATE',[id]);const s=rows[0],o=orders[0];
  if(!s||s.status!=='pending'||!o||o.status!=='playing'||o.payment_status!=='paid'||Number(o.booster_id)!==Number(s.booster_id))fail('申请已审核或订单状态已变化，请刷新');
  // Missing files must never be approved, even when the database still has a filename.
  if(path.basename(s.filename)!==s.filename)fail('截图记录无效，请重新提交');
  if(decision==='approved')await fs.access(path.join(settle.uploadDir,s.filename));
  let earnings=0;if(decision==='approved')earnings=await settle(conn,o,actor);
  await conn.execute('UPDATE boost_completion_submissions SET status=?,reviewer_id=?,review_reason=?,reviewed_at=NOW() WHERE id=?',[decision,actor,reason.trim(),id]);
  await conn.execute('INSERT INTO order_management_events(order_type,order_ref,actor_user_id,action,note) VALUES(?,?,?,?,?)',['boost',o.order_no,actor,'boost_completion_'+decision,reason.trim()||(decision==='approved'?'结单截图审核通过，订单完成':'结单已驳回')]);
  await recordOperation(conn,{eventKey:'boost-completion:'+id+':'+decision,actorUserId:actor,action:'boost_completion_'+decision,targetType:'order',targetRef:o.order_no});
  await conn.commit();return {success:true,earnings,message:decision==='approved'?'审核通过，订单已完成并结算':'已驳回，打手可补充截图重新提交'};
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
module.exports={migrate,submit,review};
