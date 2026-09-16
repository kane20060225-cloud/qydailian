'use strict';
const crypto=require('node:crypto');
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const text=(value,max)=>typeof value==='string' && value.trim().length<=max ? value.trim() : '';
const source={boost:['orders','order','user_id'],third_party:['third_party_orders','third_party_order','creator_id']};
function reviewable(order){return !order.removed_at && (order.order_type==='third_party' || order.order_type==='boost' && order.state==='exception');}
async function audit(conn,recordOperation,type,ref,actor,action,note){
 await conn.execute('INSERT INTO order_management_events (order_type,order_ref,actor_user_id,action,note) VALUES (?,?,?,?,?)',[type,ref,actor,action,note]);
 await recordOperation(conn,{eventKey:`deletion:${crypto.randomUUID()}`,actorUserId:actor,action,targetType:source[type][1],targetRef:ref});
}
async function lockedOrder(conn,type,ref){
 const spec=source[type];if(!spec || typeof ref!=='string' || !ref || ref.length>64)fail('无效订单',400);
 const [native]=await conn.execute(`SELECT * FROM ${spec[0]} WHERE order_no=? FOR UPDATE`,[ref]);
 if(!native.length)fail('订单不存在',404);
 const [rows]=await conn.execute(require('./order-center').READ_MODEL_SQL+' WHERE c.order_type=? AND c.order_ref=?',[type,ref]);
 if(!rows.length)fail('订单不存在',404);
 return {order:rows[0],native:native[0],spec};
}
async function requestDeletion({pool,recordOperation,type,ref,actor,role,reason}){
 reason=text(reason,500);if(!reason)fail('请填写申请删除原因（最多500字）',400);
 const conn=await pool.getConnection();
 try{await conn.beginTransaction();const {order,native,spec}=await lockedOrder(conn,type,ref);
  if(Number(native[spec[2]])!==Number(actor) || type==='third_party' && role!=='booster')fail('只能为自己提交的订单申请删除',403);
  if(!reviewable(order))fail('当前订单请使用正常取消或联系管理员处理');
  const [requests]=await conn.execute('SELECT * FROM order_deletion_requests WHERE order_type=? AND order_ref=? FOR UPDATE',[type,ref]);
  if(requests[0]?.status==='pending'){await conn.commit();return {success:true,already_requested:true};}
  await conn.execute(`INSERT INTO order_deletion_requests (order_type,order_ref,requester_user_id,reason,status,state_snapshot,payment_snapshot)
   VALUES (?,?,?,?,'pending',?,?) ON DUPLICATE KEY UPDATE requester_user_id=VALUES(requester_user_id),reason=VALUES(reason),status='pending',
   state_snapshot=VALUES(state_snapshot),payment_snapshot=VALUES(payment_snapshot),reviewed_by=NULL,review_note=NULL,evidence_reference=NULL,reviewed_at=NULL,created_at=NOW()`,
   [type,ref,actor,reason,order.state,order.payment_status || '']);
  await audit(conn,recordOperation,type,ref,actor,'deletion_requested',reason);await conn.commit();return {success:true};
 }catch(err){await conn.rollback();throw err;}finally{conn.release();}
}
async function reviewDeletion({pool,recordOperation,type,ref,actor,decision,reason,reference,confirmation,expectedState,expectedPayment}){
 reason=text(reason,500);reference=text(reference,200);
 if(!['approve','reject','remove'].includes(decision) || !reason)fail('请选择处理结果并填写核对说明（最多500字）',400);
 if(decision!=='reject' && (!reference || confirmation!=='REVIEWED_REMOVAL_RETAINS_ALL_RECORDS'))fail('请填写核对依据并确认仅移入回收站，原始记录保留',400);
 if(typeof expectedState!=='string' || typeof expectedPayment!=='string')fail('请先打开最新订单详情再处理',400);
 const conn=await pool.getConnection();
 try{await conn.beginTransaction();const {order}=await lockedOrder(conn,type,ref);
  if(order.state!==expectedState || (order.payment_status || '')!==expectedPayment)fail('订单状态已变化，请刷新详情重新核对');
  const [requests]=await conn.execute('SELECT * FROM order_deletion_requests WHERE order_type=? AND order_ref=? FOR UPDATE',[type,ref]);
  if(decision!=='remove' && requests[0]?.status!=='pending')fail('申请已经处理，请刷新');
  if(decision!=='reject' && !reviewable(order))fail('订单已删除或状态不适用核对删除');
  if(decision==='reject')await conn.execute(`UPDATE order_deletion_requests SET status='rejected',reviewed_by=?,review_note=?,reviewed_at=NOW() WHERE order_type=? AND order_ref=?`,[actor,reason,type,ref]);
  else{
   // Explicitly reviewed removal never mutates business/payment state or posts balance entries.
   await conn.execute(`INSERT INTO order_removals (order_type,order_ref,removed_at,removed_by,reason,state_snapshot,payment_snapshot)
    VALUES (?,?,NOW(),?,?,?,?) ON DUPLICATE KEY UPDATE removed_at=NOW(),removed_by=VALUES(removed_by),reason=VALUES(reason),state_snapshot=VALUES(state_snapshot),payment_snapshot=VALUES(payment_snapshot)`,
    [type,ref,actor,reason,order.state,order.payment_status || '']);
   await conn.execute(`INSERT INTO order_deletion_requests (order_type,order_ref,reason,status,state_snapshot,payment_snapshot,reviewed_by,review_note,evidence_reference,reviewed_at,retain_records)
    VALUES (?,?,?,'approved',?,?,?,?,?,NOW(),1) ON DUPLICATE KEY UPDATE status='approved',reviewed_by=VALUES(reviewed_by),review_note=VALUES(review_note),evidence_reference=VALUES(evidence_reference),reviewed_at=NOW(),retain_records=1`,
    [type,ref,requests[0]?.reason || reason,order.state,order.payment_status || '',actor,reason,reference]);
  }
  await audit(conn,recordOperation,type,ref,actor,decision==='reject'?'deletion_rejected':'reviewed_order_removed',`${reason}${reference?'；核对依据：'+reference:''}`.slice(0,500));
  await conn.commit();return {success:true,removed:decision!=='reject',records_retained:decision!=='reject'};
 }catch(err){await conn.rollback();throw err;}finally{conn.release();}
}
module.exports={requestDeletion,reviewDeletion,reviewable};
