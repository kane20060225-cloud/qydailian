'use strict';
const express=require('express'),finance=require('../lib/booster-finance');
function createBoosterFinanceRouter({pool,boosterMiddleware,adminMiddleware}) {
 const router=express.Router();
 const handle=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{res.json(await fn(req));}catch(e){res.status(e.status||500).json({error:e.status?e.message:'收益处理失败，请刷新核对；未确认成功前不要重复操作'});}};
 router.get('/booster/finance',boosterMiddleware,handle(req=>finance.earnings(pool,req.userId,req.query)));
 router.get('/admin/booster-finance/:orderNo/preview',adminMiddleware,handle(req=>finance.preview(pool,req.params.orderNo,req.query.legacy_amount)));
 router.post('/admin/booster-finance/:orderNo/reverse-test',adminMiddleware,handle(req=>finance.reverseTest({pool,ref:req.params.orderNo,actor:req.userId,body:req.body})));
 return router;
}
module.exports={createBoosterFinanceRouter};
