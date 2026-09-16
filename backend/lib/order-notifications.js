'use strict';
const {SECRET_CONTEXT}=require('./wecom-client');
const WEIGHTS={budget:1,standard:2,silver:3,gold:4};
function canReceiveOrder(identity,required){return Boolean(WEIGHTS[identity]&&WEIGHTS[required]&&WEIGHTS[identity]>=WEIGHTS[required]);}
async function enqueueHall(conn,ref) {
  await conn.execute(`INSERT IGNORE INTO order_notifications (user_id,event_key,kind,order_type,order_ref,title,body)
    SELECT u.id,CONCAT('hall:',o.order_no),'new_order','boost',o.order_no,'有新订单可接',
      CONCAT(o.project,' · ',o.detail,'；预计收益 ¥',ROUND(o.total_price*0.75,2),'；客户端 ',COALESCE(o.client_type,'未指定'))
    FROM orders o JOIN users u ON u.role='booster'
    LEFT JOIN notification_preferences p ON p.user_id=u.id LEFT JOIN user_settings s ON s.user_id=u.id
    WHERE o.order_no=? AND o.hall_status='open' AND o.booster_id IS NULL AND o.status='pending' AND o.payment_status='paid'
    AND FIELD(u.booster_identity,'budget','standard','silver','gold')>=FIELD(o.required_identity,'budget','standard','silver','gold')
    AND FIELD(o.required_identity,'budget','standard','silver','gold')>0 AND COALESCE(p.new_orders,1)=1 AND COALESCE(s.notify_order_update,1)=1`,[ref]);
  await queueDeliveries(conn,`hall:${ref}`);
}
async function queueDeliveries(conn,key) {
  await conn.execute(`INSERT IGNORE INTO notification_deliveries (notification_id)
    SELECT n.id FROM order_notifications n JOIN wecom_user_bindings b ON b.user_id=n.user_id
    JOIN wecom_notification_config c ON c.id=1 AND c.enabled=1 AND c.corp_id=b.corp_id AND c.agent_id=b.agent_id
    LEFT JOIN notification_preferences p ON p.user_id=n.user_id
    WHERE n.event_key=? AND COALESCE(p.wecom,1)=1`,[key]);
}
async function enqueueUser(conn,{userId,key,kind='order_update',ref,title,body}) {
  await conn.execute(`INSERT IGNORE INTO order_notifications (user_id,event_key,kind,order_type,order_ref,title,body)
    SELECT u.id,?,?, 'boost',?,?,? FROM users u LEFT JOIN user_settings s ON s.user_id=u.id
    WHERE u.id=? AND COALESCE(s.notify_order_update,1)=1`,[key,kind,ref,title,body,userId]);
  await queueDeliveries(conn,key);
}
async function loadConfig(pool,cipher) {
  const [rows]=await pool.execute('SELECT * FROM wecom_notification_config WHERE id=1');const row=rows[0];
  return row?{...row,enabled:Boolean(row.enabled),secret:row.corp_secret?cipher.decrypt(row.corp_secret,SECRET_CONTEXT):null}:null;
}
function createNotificationSystem({pool,cipher,wecomClient,siteUrl}) {
  const listeners=new Set();let working=false;
  function poke(){for(const listener of listeners)listener();}
  async function snapshot(userId,cursor=null) {
    const [counts]=await pool.execute('SELECT COUNT(*) AS unread_count,COALESCE(MAX(id),0) AS latest_id FROM order_notifications WHERE user_id=? AND read_at IS NULL',[userId]);
    const [max]=await pool.execute('SELECT COALESCE(MAX(id),0) AS latest_id FROM order_notifications WHERE user_id=?',[userId]);
    const latest=Number(max[0].latest_id);
    if(cursor===null)return {unread_count:Number(counts[0].unread_count),cursor:latest,notifications:[],bootstrap:true};
    const [rows]=await pool.execute('SELECT id,kind,order_type,order_ref,title,body,read_at,created_at FROM order_notifications WHERE user_id=? AND id>? ORDER BY id LIMIT 20',[userId,cursor]);
    return {unread_count:Number(counts[0].unread_count),cursor:rows.length?Number(rows.at(-1).id):Math.max(cursor,latest),notifications:rows,bootstrap:false};
  }
  async function deliver() {
    if(working)return;working=true;
    try {
      const config=await loadConfig(pool,cipher);if(!config?.enabled || !config.secret)return {disabled:true};
      await pool.execute("UPDATE notification_deliveries SET status='pending',locked_at=NULL WHERE status='sending' AND locked_at<DATE_SUB(NOW(),INTERVAL 2 MINUTE)");
      for(let index=0;index<20;index++) {
        const conn=await pool.getConnection();let id;
        try {await conn.beginTransaction();const [rows]=await conn.execute("SELECT notification_id FROM notification_deliveries WHERE status IN ('pending','retry') AND attempts<5 AND retry_after<=NOW() ORDER BY retry_after,notification_id LIMIT 1 FOR UPDATE SKIP LOCKED");
          if(!rows.length){await conn.commit();break;}id=rows[0].notification_id;
          await conn.execute("UPDATE notification_deliveries SET status='sending',attempts=attempts+1,locked_at=NOW() WHERE notification_id=?",[id]);await conn.commit();
        }catch(err){await conn.rollback();throw err;}finally{conn.release();}
        try {
          const [rows]=await pool.execute(`SELECT n.*,b.wecom_user_id,b.corp_id,b.agent_id,u.role,u.booster_identity,
            COALESCE(p.wecom,1) AS wecom_enabled,COALESCE(p.new_orders,1) AS new_orders_enabled,COALESCE(s.notify_order_update,1) AS order_updates_enabled,
            d.attempts FROM order_notifications n JOIN notification_deliveries d ON d.notification_id=n.id JOIN users u ON u.id=n.user_id
            LEFT JOIN wecom_user_bindings b ON b.user_id=n.user_id LEFT JOIN notification_preferences p ON p.user_id=n.user_id
            LEFT JOIN user_settings s ON s.user_id=n.user_id WHERE n.id=?`,[id]);
          const n=rows[0];let valid=n && n.wecom_user_id && n.corp_id===config.corp_id && Number(n.agent_id)===Number(config.agent_id) && n.wecom_enabled && n.order_updates_enabled && ['booster','admin','user'].includes(n.role);
          if(valid && n.kind==='new_order') {const [orders]=await pool.execute('SELECT hall_status,booster_id,status,payment_status,required_identity FROM orders WHERE order_no=?',[n.order_ref]);const o=orders[0];
            valid=n.role==='booster' && n.new_orders_enabled && o?.hall_status==='open' && !o.booster_id && o.status==='pending' && o.payment_status==='paid' && canReceiveOrder(n.booster_identity,o.required_identity);}
          if(!valid || Date.now()-new Date(n.created_at).getTime()>86400000){await pool.execute("UPDATE notification_deliveries SET status='skipped',last_error_code='STALE_OR_DISABLED',locked_at=NULL WHERE notification_id=?",[id]);continue;}
          // Recheck config immediately before sending, so edits/disable do not use a stale secret.
          const fresh=await loadConfig(pool,cipher);
          if(!fresh?.enabled || fresh.corp_id!==config.corp_id || Number(fresh.agent_id)!==Number(config.agent_id) || fresh.secret!==config.secret){await pool.execute("UPDATE notification_deliveries SET status='pending',locked_at=NULL WHERE notification_id=?",[id]);break;}
          const messageId=await wecomClient.send(fresh,n.wecom_user_id,n,siteUrl);
          await pool.execute("UPDATE notification_deliveries SET status='sent',message_id=?,last_error_code=NULL,locked_at=NULL WHERE notification_id=?",[messageId,id]);
        }catch(err){const code=/^WECOM_[A-Z0-9_-]+$/.test(err.code||'')?err.code:'DELIVERY_FAILED';
          await pool.execute("UPDATE notification_deliveries SET status=IF(attempts>=5,'failed','retry'),last_error_code=?,retry_after=DATE_ADD(NOW(),INTERVAL LEAST(1800,POW(2,attempts)*30) SECOND),locked_at=NULL WHERE notification_id=?",[code,id]);}
      }
      await pool.execute('DELETE FROM wecom_oauth_states WHERE expires_at<NOW()');
      return {disabled:false};
    }finally{working=false;}
  }
  return {snapshot,poke,deliver,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
}
module.exports={canReceiveOrder,enqueueHall,enqueueUser,loadConfig,createNotificationSystem};
