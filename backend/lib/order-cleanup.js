'use strict';
const crypto = require('node:crypto');
const {READ_MODEL_SQL} = require('./order-center');
const SOURCES = Object.freeze({boost:['orders','order_no','order'],rental:['rental_orders','order_no','rental_order'],recharge:['payment_orders','out_trade_no','payment_order'],shop:['qy_purchases','id','shop_purchase'],third_party:['third_party_orders','order_no','third_party_order']});
const TERMINAL = ['completed','credited','closed'];
function removable(order) {
  return TERMINAL.includes(order.state) || (order.payment_status === 'unpaid' &&
    ((order.order_type === 'boost' && order.state === 'pending_payment') ||
     (order.order_type === 'recharge' && order.state === 'pending_payment') ||
     (order.order_type === 'third_party' && ['pending','rejected'].includes(order.state))));
}
function settingsInput(body={}) {
  if (typeof body.enabled !== 'boolean' || !Number.isInteger(body.retention_days) || body.retention_days < 7 || body.retention_days > 90)
    throw Object.assign(new Error('保留期限须为 7–90 天，并明确选择是否开启自动清理'),{status:400});
  return {enabled:body.enabled,retention_days:body.retention_days};
}
function failure(message,status=409) {throw Object.assign(new Error(message),{status});}
async function changeRemoval({pool,recordOperation,type,ref,actor,reason,restore=false,automatic=false,days=7}) {
  const source=SOURCES[type];
  if (!source || typeof ref!=='string' || !ref || ref.length>64) failure('无效订单',400);
  if (typeof reason!=='string' || !reason.trim() || reason.trim().length>500) failure('请填写删除或恢复原因（最多500字）',400);
  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sourceRef=type==='shop'?ref.replace(/^SHOP/,''):ref;
    const [raw]=await conn.execute(`SELECT * FROM ${source[0]} WHERE ${source[1]}=? FOR UPDATE`,[sourceRef]);
    if (!raw.length) failure('订单不存在',404);
    const [rows]=await conn.execute(READ_MODEL_SQL+' WHERE c.order_type=? AND c.order_ref=?',[type,ref]);
    const order=rows[0];if(!order) failure('订单不存在',404);
    if (restore) {
      const [result]=await conn.execute('DELETE FROM order_removals WHERE order_type=? AND order_ref=?',[type,ref]);
      if(!result.affectedRows) failure('订单已恢复，请刷新');
    } else {
      if(order.removed_at) failure('订单已在回收站');
      if(!removable(order)) failure('正在付款审核、执行、验收或处理异常的订单不能删除');
      if(!TERMINAL.includes(order.state) || automatic) {
        if(type==='boost' && (raw[0].booster_id || raw[0].hall_status || raw[0].payment_screenshot)) failure('订单已有接单或付款记录');
        const [ledger]=await conn.execute('SELECT id FROM account_ledger WHERE source_type=? AND source_ref=? LIMIT 1',[source[2],sourceRef]);
        if(ledger.length) failure('订单存在资金流水，请完成业务后归档');
        const [evidence]=await conn.execute('SELECT id FROM manual_payment_evidence WHERE business_type=? AND business_ref=? LIMIT 1',[source[2],sourceRef]);
        if(evidence.length) failure('订单存在付款凭证，不能作为无效订单清理');
      }
      if(automatic) {
        if(!['boost','rental','recharge','third_party'].includes(type) || order.payment_status==='paid' ||
          !((type==='boost' && order.state==='pending_payment') || (type==='rental' && order.state==='closed') ||
            (type==='recharge' && order.state==='closed' && order.provider_status==='TRADE_CLOSED') || (type==='third_party' && order.state==='rejected')))
          failure('订单不符合自动清理规则');
        const [age]=await conn.execute(`SELECT c.order_ref FROM (${READ_MODEL_SQL}) c WHERE c.order_type=? AND c.order_ref=? AND c.created_at<DATE_SUB(NOW(),INTERVAL ? DAY)`,[type,ref,days]);
        if(!age.length) failure('订单尚未超过保留期限');
      }
      await conn.execute(`INSERT INTO order_removals (order_type,order_ref,removed_at,removed_by,reason,state_snapshot,payment_snapshot)
        VALUES (?,?,NOW(),?,?,?,?) ON DUPLICATE KEY UPDATE removed_at=NOW(),removed_by=VALUES(removed_by),reason=VALUES(reason),state_snapshot=VALUES(state_snapshot),payment_snapshot=VALUES(payment_snapshot)`,
        [type,ref,actor,reason.trim(),order.state,order.payment_status || '']);
    }
    const action=restore?'restore':automatic?'auto_remove':'remove';
    await conn.execute('INSERT INTO order_management_events (order_type,order_ref,actor_user_id,action,note) VALUES (?,?,?,?,?)',[type,ref,actor,action,reason.trim()]);
    await recordOperation(conn,{eventKey:`order_cleanup:${crypto.randomUUID()}`,actorUserId:actor,action:`order_${action}`,targetType:source[2],targetRef:sourceRef});
    await conn.commit();return {type,ref,success:true};
  } catch(err) {await conn.rollback();throw err;} finally {conn.release();}
}
async function getSettings(pool) {
  const [rows]=await pool.execute('SELECT enabled,retention_days,updated_at FROM order_cleanup_settings WHERE id=1');
  return rows.length?{...rows[0],enabled:Boolean(rows[0].enabled)}:{enabled:false,retention_days:7};
}
async function candidates(pool,days) {
  const [rows]=await pool.execute(`SELECT c.* FROM (${READ_MODEL_SQL}) c WHERE c.removed_at IS NULL AND c.created_at<DATE_SUB(NOW(),INTERVAL ? DAY)
    AND ((c.order_type='boost' AND c.state='pending_payment') OR (c.order_type='rental' AND c.state='closed' AND c.payment_status!='paid')
      OR (c.order_type='recharge' AND c.state='closed' AND c.provider_status='TRADE_CLOSED') OR (c.order_type='third_party' AND c.state='rejected' AND c.payment_status='unpaid'))
    AND NOT EXISTS (SELECT 1 FROM account_ledger l WHERE l.source_ref=c.order_ref AND l.source_type=CASE c.order_type WHEN 'boost' THEN 'order' WHEN 'rental' THEN 'rental_order' WHEN 'recharge' THEN 'payment_order' ELSE 'third_party_order' END)
    AND NOT EXISTS (SELECT 1 FROM manual_payment_evidence e WHERE e.business_ref=c.order_ref AND e.business_type=CASE c.order_type WHEN 'boost' THEN 'order' WHEN 'rental' THEN 'rental_order' WHEN 'recharge' THEN 'payment_order' ELSE 'third_party_order' END)
    AND (c.order_type!='boost' OR EXISTS (SELECT 1 FROM orders o WHERE o.order_no=c.order_ref AND o.booster_id IS NULL AND o.hall_status IS NULL AND o.payment_screenshot IS NULL))
    ORDER BY c.created_at LIMIT 200`,[days]);
  return rows;
}
function createCleanupService(deps) {
  let running=false;
  return {async run(actor=null,force=false) {
    if(running) failure('清理正在运行，请稍后刷新');running=true;
    try {
      const settings=await getSettings(deps.pool);
      if(!force && !settings.enabled) return {removed:0,skipped:0,disabled:true};
      const rows=await candidates(deps.pool,settings.retention_days);let removed=0,skipped=0;
      for(const order of rows) {
        try {await changeRemoval({...deps,type:order.order_type,ref:order.order_ref,actor,reason:`自动清理：超过 ${settings.retention_days} 天的无效订单`,automatic:true,days:settings.retention_days});removed++;}
        catch(err) {if(![404,409].includes(err.status)) throw err;skipped++;}
      }
      return {removed,skipped,limit:200};
    } finally {running=false;}
  }};
}
module.exports={removable,settingsInput,changeRemoval,getSettings,candidates,createCleanupService};
