'use strict';
const express=require('express'),crypto=require('node:crypto');
function createPermissionsRouter({pool,adminMiddleware,recordOperation}) {
 const r=express.Router();r.use(adminMiddleware);
 r.get('/',async(req,res)=>{
  const q=String(req.query.q||'').trim(),role=req.query.role||'',page=Number(req.query.page||1);
  if(q.length>80||!Number.isSafeInteger(page)||page<1||page>100000||(role&&!['user','booster','support','admin'].includes(role)))return res.status(400).json({error:'搜索条件无效'});
  const clauses=[],params=[];if(q){clauses.push('(username LIKE ? OR CAST(id AS CHAR)=?)');params.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%',q);}if(role){clauses.push('role=?');params.push(role);}
  const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
  const [counts]=await pool.execute('SELECT COUNT(*) AS total FROM users'+where,params);
  const [users]=await pool.execute('SELECT id,username,role,created_at FROM users'+where+` ORDER BY id LIMIT 20 OFFSET ${(page-1)*20}`,params);
  res.json({users,total:Number(counts[0].total),page,page_size:20});
 });
 r.put('/:userId/role',async(req,res)=>{
  const id=Number(req.params.userId),role=req.body.role;if(!Number.isSafeInteger(id)||id<1||!['user','booster','support','admin'].includes(role))return res.status(400).json({error:'角色或用户编号无效'});
  if(id===req.userId&&role!=='admin')return res.status(409).json({error:'不能移除自己当前的管理员权限'});
  const conn=await pool.getConnection();try{await conn.beginTransaction();
   const [users]=await conn.execute("SELECT id,role FROM users WHERE role='admin' OR id=? ORDER BY id FOR UPDATE",[id]);const target=users.find(u=>Number(u.id)===id);
   if(!target){await conn.rollback();return res.status(404).json({error:'用户不存在'});}
   if(!users.some(u=>Number(u.id)===req.userId&&u.role==='admin')){await conn.rollback();return res.status(403).json({error:'管理员权限已变更'});}
   if(req.body.expected_role!==target.role){await conn.rollback();return res.status(409).json({error:'用户权限已被更新，请刷新后重新选择'});}
   if(target.role==='admin'&&role!=='admin'&&users.filter(u=>u.role==='admin').length<=1){await conn.rollback();return res.status(409).json({error:'至少保留一位管理员'});}
   if(target.role!==role){await conn.execute('UPDATE users SET role=?,token_version=token_version+1 WHERE id=?',[role,id]);await recordOperation(conn,{eventKey:`user_role:${crypto.randomUUID()}`,actorUserId:req.userId,action:`user_role:${target.role}:${role}`,targetType:'user',targetRef:String(id),metadata:{before:target.role,after:role}});}
   await conn.commit();res.json({success:true,message:'权限已更新，用户重新登录后生效'});
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
 });
 r.use((e,req,res,next)=>res.status(503).json({error:'权限管理暂不可用，请稍后重试'}));return r;
}
module.exports={createPermissionsRouter};
