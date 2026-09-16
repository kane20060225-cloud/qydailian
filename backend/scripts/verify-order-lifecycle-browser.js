'use strict';
// Synthetic UI verification only; no production .env, real users or payment requests.
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const { chromium } = require('playwright');
const { decorateOrder } = require('../lib/order-center');

(async()=>{
  const app=express();app.use(express.json());
  app.use(express.static(path.join(__dirname,'..','..','public')));
  app.get('/lifecycle-test',(_,res)=>res.type('html').send(`<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/order-center.css"></head><body data-current-section="admin"><div class="container"><div id="adminOrderCenter"><div class="oc-list" id="adminOrderList"></div></div></div><div id="toast" role="status"></div><script src="/ui-runtime.js"></script><script src="/order-center.js"></script><script>OrderCenter.init({apiBase:'/api',getToken:()=> 'synthetic',getRole:()=> 'admin',onToast:s=>document.getElementById('toast').textContent=s,onTicketRefresh:()=>{},onBalanceRefresh:()=>{}});OrderCenter.load('admin');</script></body></html>`));
  let cancelled=false,resolved=null,enabled=false,cancelRequests=0,resolveRequests=0,timeoutRequests=0;
  const rows=()=>[
    {order_type:'boost',order_ref:'TEST-UNPAID',title:'未付款测试代练',customer_id:7,customer_name:'测试客户',amount:6,amount_unit:'money',payment_status:'unpaid',payment_channel:'人工核实',state:cancelled?'closed':'pending_payment',created_at:new Date().toISOString(),admin_task:null},
    {order_type:'recharge',order_ref:'RC1700000000000HISTORY',title:'历史测试充值',customer_id:7,customer_name:'测试客户',amount:6,amount_unit:'money',payment_status:'paid',payment_channel:'支付宝',business_status:'paid',state:resolved==='test_closed'?'closed':resolved?'credited':'exception',created_at:new Date().toISOString(),admin_task:resolved?null:'exception'}
  ];
  app.get('/api/order-center',(_,res)=>res.json({orders:rows().map(r=>decorateOrder(r,1,true)),total:2,summary:[]}));
  app.get('/api/order-center/metrics',(_,res)=>res.json({assignment_hours:null,completion_hours:null,dispute_rate:null,repeat_rate:null}));
  app.get('/api/order-center/timeout',(_,res)=>res.json({settings:{enabled,hours:24},candidates:cancelled?[]:[{type:'boost',ref:'TEST-UNPAID',created_at:new Date().toISOString()}],limit:200}));
  app.put('/api/order-center/timeout',(req,res)=>{enabled=req.body.enabled;res.json({success:true});});
  app.post('/api/order-center/timeout/run',(req,res)=>{assert.deepEqual(req.body.orders,[{type:'boost',ref:'TEST-UNPAID'}]);assert.equal(req.body.confirmation,'CLOSE_PREVIEWED_UNPAID_ORDERS');timeoutRequests++;cancelled=true;res.json({closed:1,skipped:0});});
  app.get('/api/order-center/:type/:ref',(req,res)=>{const row=rows().find(r=>r.order_type===req.params.type&&r.order_ref===req.params.ref);assert.ok(row);res.json({order:decorateOrder(row,1,true),details:resolved?[{label:'历史核销结果',value:resolved==='historical_credited'?'人工确认历史已到账，余额未变':'测试核销关闭'}]:[],ledger:[],events:[]});});
  app.post('/api/order-center/boost/TEST-UNPAID/cancel-unpaid',(req,res)=>{assert.equal(req.body.reason,'取消测试订单');cancelRequests++;cancelled=true;res.json({success:true,refunded_credits:50});});
  app.post('/api/order-center/recharge/RC1700000000000HISTORY/resolve',(req,res)=>{assert.equal(req.body.confirmation,'REVIEWED_PAYMENT_AND_TICKETS');assert.equal(req.body.reference,'测试记录已核对');assert.equal(req.body.reason,'处理历史测试');resolved=req.body.outcome;resolveRequests++;res.json({success:true,outcome:resolved});});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
      cancelled=false;resolved=null;enabled=false;
      const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/lifecycle-test`);
      await page.locator('[data-ref="TEST-UNPAID"]').click();await page.locator('[data-action="cancel_unpaid"]').click();
      await page.locator('#ocReason').fill('取消测试订单');const before=cancelRequests;await page.locator('[data-confirm="cancel_unpaid"]').click();
      await page.locator('#ocDetailActions [data-action="archive"]').waitFor();assert.equal(cancelRequests,before+1);assert.equal(await page.locator('[data-action="boost_payment"]').count(),0);
      assert.match(await page.locator('#toast').textContent(),/退回 50/);await page.locator('#ocClose').click();
      await page.locator('[data-ref="RC1700000000000HISTORY"]').click();await page.locator('[data-action="resolve_recharge"]').click();
      await page.locator('#ocResolutionOutcome').selectOption('historical_credited');await page.locator('#ocResolutionReference').fill('测试记录已核对');await page.locator('#ocReason').fill('处理历史测试');
      const beforeResolve=resolveRequests;await page.locator('[data-confirm="resolve_recharge"]').click();
      await page.getByText('请确认已核对付款和发券记录',{exact:true}).waitFor();assert.equal(resolveRequests,beforeResolve);
      await page.locator('#ocResolutionConfirm').check();await page.locator('[data-confirm="resolve_recharge"]').click();
      await page.locator('#ocDetailActions [data-action="archive"]').waitFor();assert.equal(resolveRequests,beforeResolve+1);assert.match(await page.locator('#ocDetailBody').textContent(),/余额未变/);
      await page.locator('#ocClose').click();cancelled=false;
      await page.locator('[data-timeout]').click();await page.locator('#ocTimeoutEnabled').waitFor();assert.equal(await page.locator('#ocTimeoutEnabled').isChecked(),false);
      const beforeTimeout=timeoutRequests;await page.locator('[data-run-timeout]').click();await page.getByText('请先确认已核对预览订单',{exact:true}).waitFor();assert.equal(timeoutRequests,beforeTimeout);
      await page.locator('#ocTimeoutConfirm').check();await page.locator('[data-run-timeout]').click();
      await page.locator('h4').filter({hasText:'本次可关闭 0 条'}).waitFor();assert.equal(timeoutRequests,beforeTimeout+1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('Lifecycle browser verification passed on desktop and mobile: cancellation/refund feedback, explicit history review, timeout preview and confirmation, no page errors or horizontal overflow.');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(err=>{console.error(err);process.exitCode=1;});
