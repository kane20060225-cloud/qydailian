'use strict';
const express=require('express');
const {loadAvailability,evaluateAvailability,validateChange,changeAvailability}=require('../lib/booster-availability');
function createAvailabilityRouter({pool,boosterMiddleware,adminMiddleware}){
  const router=express.Router();
  async function read(userId){
    const state=await loadAvailability(pool,userId);
    const [info]=await pool.execute(`SELECT COUNT(DISTINCT o.id) AS active_orders,
      MAX(CASE WHEN b.user_id IS NOT NULL AND b.corp_id=c.corp_id AND b.agent_id=c.agent_id THEN 1 ELSE 0 END) AS bound,
      MAX(COALESCE(c.enabled,0)) AS app_enabled, MAX(COALESCE(p.wecom,1)*COALESCE(p.new_orders,1)*COALESCE(s.notify_order_update,1)) AS preferences_enabled
      FROM users u LEFT JOIN orders o ON o.booster_id=u.id AND o.status='playing'
      LEFT JOIN wecom_user_bindings b ON b.user_id=u.id LEFT JOIN wecom_notification_config c ON c.id=1
      LEFT JOIN notification_preferences p ON p.user_id=u.id LEFT JOIN user_settings s ON s.user_id=u.id WHERE u.id=?`,[userId]);
    const meta=info[0]||{};return {...state,active_orders:Number(meta.active_orders||0),wecom_bound:Boolean(meta.bound),
      reminder_status:!state.online?'offline':!meta.bound?'unbound':!meta.app_enabled?'app_disabled':!meta.preferences_enabled?'preferences_disabled':'ready'};
  }
  router.get('/booster/availability',boosterMiddleware,async(req,res)=>res.json(await read(req.userId)));
  router.put('/booster/availability',boosterMiddleware,async(req,res)=>{
    const change=validateChange(req.body);const conn=await pool.getConnection();
    try{await conn.beginTransaction();await changeAvailability(conn,req.userId,req.userId,change,req.body.action);await conn.commit();}
    catch(err){await conn.rollback();throw err;}finally{conn.release();}res.json(await read(req.userId));
  });
  router.get('/booster/availability/events',boosterMiddleware,async(req,res)=>{
    const [rows]=await pool.execute('SELECT action,detail,created_at,actor_id FROM booster_availability_events WHERE user_id=? ORDER BY id DESC LIMIT 20',[req.userId]);res.json(rows);
  });
  router.get('/admin/booster-availability',adminMiddleware,async(req,res)=>{
    const [rows]=await pool.execute(`SELECT u.id,u.username,u.booster_identity,u.booster_points,u.role,a.*,
      (SELECT COUNT(*) FROM orders o WHERE o.booster_id=u.id AND o.status='playing') AS active_orders,
      CASE WHEN b.user_id IS NOT NULL AND b.corp_id=c.corp_id AND b.agent_id=c.agent_id THEN 1 ELSE 0 END AS wecom_bound
      FROM users u LEFT JOIN booster_availability a ON a.user_id=u.id
      LEFT JOIN wecom_user_bindings b ON b.user_id=u.id LEFT JOIN wecom_notification_config c ON c.id=1
      WHERE u.role IN ('booster','admin') ORDER BY u.username,u.id`);
    const now=Date.now();res.json(rows.map(row=>({...evaluateAvailability(row,now),id:row.id,username:row.username,
      booster_identity:row.booster_identity,booster_points:row.booster_points,role:row.role,active_orders:Number(row.active_orders),wecom_bound:Boolean(row.wecom_bound)})));
  });
  function target(req,res,next){if(!/^[1-9]\d{0,9}$/.test(req.params.userId))return res.status(400).json({error:'无效打手编号'});next();}
  router.put('/admin/booster-availability/:userId',adminMiddleware,target,async(req,res)=>{
    const body=req.body||{};if(typeof body.paused!=='boolean'||typeof body.reason!=='string'||body.reason.trim().length>200||body.paused&&!body.reason.trim())return res.status(400).json({error:'暂停时请填写原因（最多200字）'});
    if(body.hours!==null&&!([1,2,4,8,24].includes(body.hours)))return res.status(400).json({error:'请选择有效暂停时长'});
    const conn=await pool.getConnection();try{await conn.beginTransaction();
      const [users]=await conn.execute("SELECT role FROM users WHERE id=? FOR UPDATE",[req.params.userId]);
      if(!['booster','admin'].includes(users[0]?.role))throw Object.assign(Error('打手不存在'),{status:404});
      await changeAvailability(conn,Number(req.params.userId),req.userId,{admin_paused:+body.paused,admin_reason:body.paused?body.reason.trim():'',admin_pause_until:body.paused&&body.hours?Date.now()+body.hours*3600000:null},body.paused?'admin_pause':'admin_resume');await conn.commit();
    }catch(err){await conn.rollback();throw err;}finally{conn.release();}res.json(await read(Number(req.params.userId)));
  });
  router.get('/admin/booster-availability/:userId/events',adminMiddleware,target,async(req,res)=>{
    const [rows]=await pool.execute('SELECT e.action,e.detail,e.created_at,u.username AS actor_name FROM booster_availability_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.user_id=? ORDER BY e.id DESC LIMIT 30',[req.params.userId]);res.json(rows);
  });
  router.use((err,req,res,next)=>{if(res.headersSent)return next(err);res.status(err.status||503).json({error:err.status?err.message:'工作状态服务暂不可用，请重试'});});return router;
}
module.exports={createAvailabilityRouter};
