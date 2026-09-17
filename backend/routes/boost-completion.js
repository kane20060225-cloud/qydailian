'use strict';
const express=require('express'),path=require('node:path');
const completion=require('../lib/boost-completion');
function createCompletionRouter({pool,authMiddleware,boosterMiddleware,adminMiddleware,uploadDir,settle,notify}){
 const r=express.Router();settle.uploadDir=uploadDir;
 const handle=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{await fn(req,res);}catch(e){res.status(e.status||400).json({error:e.status?e.message:'截图提交或审核失败，请检查图片并重试'});}};
 r.post('/booster/complete/:orderNo',boosterMiddleware,handle(async(req,res)=>{
  const contentType=req.get('Content-Type')||'';if(!/^image\/(png|jpeg)(;|$)/i.test(contentType))return res.status(400).json({error:'请上传PNG或JPEG结单截图，不能直接完成订单'});
  let note;try{note=decodeURIComponent(req.get('X-Completion-Note')||'');}catch{return res.status(400).json({error:'结单说明无效'});}
  res.json(await completion.submit({pool,userId:req.userId,orderNo:req.params.orderNo,stream:req,contentType,note,uploadDir}));
 }));
 r.get('/admin/boost-completions',adminMiddleware,handle(async(req,res)=>{
  const [rows]=await pool.execute(`SELECT s.id,s.order_no,s.note,s.status,s.created_at,o.project,o.detail,o.total_price,b.username AS booster_name,
  EXISTS(SELECT 1 FROM income_test_orders t WHERE t.order_type='boost' AND t.order_ref=o.order_no) AS test_order
  FROM boost_completion_submissions s JOIN orders o ON o.order_no=s.order_no JOIN users b ON b.id=s.booster_id WHERE s.status='pending' ORDER BY s.created_at,s.id LIMIT 200`);res.json(rows);
 }));
 r.post('/admin/boost-completions/:id/review',adminMiddleware,handle(async(req,res)=>{
  const result=await completion.review({pool,id:req.params.id,actor:req.userId,decision:req.body?.decision,reason:req.body?.reason||'',settle});res.json(result);notify();
 }));
 r.get('/boost-completions/:id/image',authMiddleware,handle(async(req,res)=>{
  if(!/^\d{1,18}$/.test(req.params.id))return res.status(400).json({error:'编号无效'});
  const [rows]=await pool.execute('SELECT s.filename,s.booster_id,o.user_id FROM boost_completion_submissions s JOIN orders o ON o.order_no=s.order_no WHERE s.id=?',[req.params.id]);
  const [users]=await pool.execute('SELECT role FROM users WHERE id=?',[req.userId]);const s=rows[0];
  if(!s||(users[0]?.role!=='admin'&&Number(s.booster_id)!==Number(req.userId)&&Number(s.user_id)!==Number(req.userId)))return res.status(404).json({error:'截图不存在'});
  if(path.basename(s.filename)!==s.filename)return res.status(404).json({error:'截图不存在'});
  res.set('X-Content-Type-Options','nosniff');res.sendFile(path.join(uploadDir,s.filename),err=>{if(err&&!res.headersSent)res.status(404).json({error:'截图不存在'});});
 }));return r;
}
module.exports={createCompletionRouter};
