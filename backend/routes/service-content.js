'use strict';
const express=require('express'),{read,published,validateProjects,validateActivities,error}=require('../lib/service-content');
function createServiceContentRouter({pool,adminMiddleware,recordOperation}){
 const router=express.Router();
 router.get('/service-content',async(req,res)=>{try{res.set('Cache-Control','no-store').json(published(await read(pool)));}catch(e){res.status(503).json({error:'活动与项目暂时无法加载，请重试'});}});
 router.get('/admin/service-content',adminMiddleware,async(req,res)=>{try{res.set('Cache-Control','no-store').json(await read(pool));}catch(e){res.status(503).json({error:'配置暂时无法加载，请重试'});}});
 for(const field of ['projects','activities'])router.put('/admin/service-content/'+field,adminMiddleware,async(req,res)=>{
  let conn;
  try{if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw error('请提供有效的配置内容');conn=await pool.getConnection();await conn.beginTransaction();const current=await read(conn,true);
   if(req.body.revision!==current.revision)throw error('配置已被其他管理员更新，请重新加载后编辑',409);
   const next={catalog_revision:(current.catalog_revision||current.revision)+(field==='projects'?1:0),projects:current.projects,activities:current.activities};
   if(field==='projects'){next.projects=validateProjects(req.body.projects);const keys=new Set(next.projects.map(p=>p.key));if(next.activities.some(a=>a.project_key&&!keys.has(a.project_key)))throw error('项目仍被活动关联，请先修改活动或将项目下架');}
   else next.activities=validateActivities(req.body.activities,current.projects);
   await conn.execute('UPDATE site_service_content SET document=?,revision=revision+1,updated_by=? WHERE id=1',[JSON.stringify(next),req.userId]);
   await recordOperation(conn,{eventKey:`service-content:${current.revision+1}:${field}`,actorUserId:req.userId,action:'service_content_updated',targetType:'site_content',targetRef:field});
   await conn.commit();res.json({success:true,revision:current.revision+1,...next});
  }catch(e){if(conn)await conn.rollback();res.status(e.status||503).json({error:e.status?e.message:'保存失败，配置未更新，请重试'});}finally{conn?.release();}
 });return router;
}
module.exports={createServiceContentRouter};
