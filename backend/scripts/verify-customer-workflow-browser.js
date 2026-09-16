'use strict';
// Isolated synthetic responses: no real orders, accounts, payments or production data.
const assert=require('node:assert/strict');
const express=require('express');
const path=require('node:path');
const {chromium}=require('playwright');
const {decorateOrder}=require('../lib/order-center');
const {guidance}=require('../lib/order-guidance');
(async()=>{
 const app=express();app.use(express.static(path.join(__dirname,'..','..','public')));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`;
 let browser;
 try {
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
   const context=await browser.newContext({viewport});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   if(process.env.UI_THEME==='light')await context.addInitScript(()=>localStorage.setItem('theme','light'));
   await context.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>window.__copied=value},configurable:true}));
   let submits=0,body,credits=100,sort='';
   const accounts=[{id:1,client_type:'Android',tank_list:'IS-7\nT-54',hourly_price:2,daily_price:25,available_time_desc:'晚上 18:00–24:00',rules:'禁止排位',owner_name:'测试出租方',availability_status:'available'},{id:2,client_type:'iOS',tank_list:'IS-7\nM60',hourly_price:3,daily_price:30,available_time_desc:'周末',rules:'不得改密',owner_name:'另一位出租方',availability_status:'available'},{id:3,client_type:'Android',tank_list:'E 100',hourly_price:1,daily_price:10,available_time_desc:'全天',rules:'不得改密',availability_status:'rented'}];
   const now=new Date().toISOString(),hoursAgo=h=>new Date(Date.now()-h*3600000).toISOString();
   const rows=()=>[
    {order_type:'boost',order_ref:'TEST-NEW',title:'单车经验 · 测试方案',customer_id:7,customer_name:'测试用户',amount:body?Number((body.total_price-body.use_credits/100).toFixed(2)):10,amount_unit:'money',state:'pending_payment',payment_status:'unpaid',created_at:now,admin_task:null},
    {order_type:'boost',order_ref:'TEST-OPEN',title:'已收款无人接单',customer_id:9,customer_name:'测试客户',amount:10,amount_unit:'money',state:'awaiting_assignment',payment_status:'paid',created_at:hoursAgo(30),stage_recorded_at:hoursAgo(10),admin_task:'assignment'},
    {order_type:'boost',order_ref:'TEST-REVIEW',title:'付款待核实',customer_id:9,amount:10,amount_unit:'money',state:'payment_review',payment_status:'pending',created_at:hoursAgo(100),stage_recorded_at:hoursAgo(1),admin_task:'payment'},
    {order_type:'rental',order_ref:'TEST-DISPUTE',title:'租号争议',customer_id:7,related_user_id:8,amount:10,amount_unit:'money',state:'dispute',payment_status:'paid',created_at:hoursAgo(2),stage_recorded_at:hoursAgo(.5),admin_task:'refund'}
   ];
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url()),p=url.pathname;if(url.origin!==origin){await route.abort();return;}if(!p.startsWith('/api/')){await route.continue();return;}
    let data=[],status=200;
    if(p==='/api/service-content'){await route.fulfill({json:require('../lib/service-content').published({revision:1,...require('../lib/service-content').defaults})});return;}
    if(p==='/api/orders'&&req.method()==='POST'){submits++;body=req.postDataJSON();assert.equal(body.quantity,3);assert.equal(body.use_credits,100);assert.equal(body.total_price,17.4);credits=0;data={order_no:'TEST-NEW',total_price:16.4,credits_used:100};status=201;}
    else if(p==='/api/user/credits')data={qy_credits:credits};
    else if(p==='/api/auth/login')data={success:true,token:'synthetic',user:{id:7,username:'测试用户',role:'admin'}};
    else if(p==='/api/user/profile')data={id:7,username:'测试用户',role:'admin'};
    else if(p==='/api/rental/accounts')data=accounts;
    else if(/^\/api\/rental\/accounts\/\d+$/.test(p))data=accounts.find(a=>a.id===Number(p.split('/').pop()));
    else if(p==='/api/order-center/metrics')data={assignment_hours:9,assignment_samples:2,completion_hours:12,completion_samples:2,dispute_rate:10,paid_rentals:10,disputed_rentals:1,repeat_rate:50,paying_customers:4,repeat_customers:2};
    else if(p==='/api/order-center'){
     sort=url.searchParams.get('sort');const admin=url.searchParams.get('scope')==='admin';let orders=rows().filter(r=>admin||r.customer_id===7).map(r=>decorateOrder(r,7,admin));
     const summary=orders.map(r=>({state:r.state,admin_task:r.admin_task,total:1}));
     if(url.searchParams.get('state')==='todo')orders=orders.filter(r=>r.admin_task);if(url.searchParams.get('task'))orders=orders.filter(r=>r.admin_task===url.searchParams.get('task'));
     if(sort==='priority')orders.sort((a,b)=>b.priority-a.priority||new Date(a.stage_recorded_at||a.created_at)-new Date(b.stage_recorded_at||b.created_at));
     data={orders,total:orders.length,page:1,summary};
    }else if(/^\/api\/order-center\/[^/]+\/[^/]+$/.test(p)){
     const row=rows().find(r=>r.order_ref===decodeURIComponent(p.split('/').pop()));assert.ok(row);
     const order=decorateOrder(row,7,url.searchParams.get('scope')==='admin'),details=row.state==='dispute'?[{label:'争议原因',value:'坦克清单与账号不符'}]:[];
     data={order,details,ledger:[],events:[],guidance:guidance(order,{details,userId:7,admin:url.searchParams.get('scope')==='admin'})};
    }
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   });
   await page.goto(origin,{waitUntil:'networkidle'});await page.evaluate(()=>showSection('boost'));
   assert.equal(await page.locator('#copyBtn').count(),0);assert.equal(await page.locator('#submitOrderBtn').isVisible(),false);
   await page.locator('input[name=project][value=exp]').check();await page.locator('input[name=detail][value=b]').check();await page.locator('#quantityInput').fill('3');
   await page.locator('#boostNext').click();assert.equal(await page.locator('.boost-progress [aria-current=step]').textContent(),'2填写信息');
   await page.locator('#boostNext').click();assert.equal(await page.locator('#gameAccount').evaluate(el=>document.activeElement===el),true);assert.equal(await page.locator('#submitOrderBtn').isVisible(),false);
   await page.locator('#gameAccount').fill('synthetic@example.invalid');await page.locator('#gamePassword').fill('SYNTHETIC-SECRET');
   const draft=await page.evaluate(()=>localStorage.getItem('qy.boost.services.v1'));assert.equal(draft.includes('SYNTHETIC'),false);assert.equal(draft.includes('synthetic@example'),false);assert.equal(JSON.parse(draft).quantity,3);
   await page.reload({waitUntil:'networkidle'});await page.evaluate(()=>showSection('boost'));assert.equal(await page.locator('#quantityInput').inputValue(),'3');assert.equal(await page.locator('input[name=project][value=exp]').isChecked(),true);assert.equal(await page.locator('#gamePassword').inputValue(),'');
   await page.locator('#boostNext').click();await page.locator('#gameAccount').fill('synthetic@example.invalid');await page.locator('#gamePassword').fill('SYNTHETIC-SECRET');await page.locator('#boostNext').click();
   await page.locator('#submitOrderBtn').click();await page.locator('#loginModal').waitFor({state:'visible'});assert.equal(submits,0);
   await page.locator('#loginUsername').fill('测试用户');await page.locator('#loginPassword').fill('SYNTHETIC-LOGIN');await page.locator('#loginForm button[type=submit]').click();await page.locator('#loginModal').waitFor({state:'hidden'});
   await page.waitForFunction(()=>document.getElementById('availableCredits').textContent==='100');await page.locator('#useCreditsInput').fill('100');
   assert.match(await page.locator('#boostReview').textContent(),/¥16.40/);
   if(viewport.width<700){await page.evaluate(()=>window.scrollTo(0,0));const box=await page.locator('#submitOrderBtn').boundingBox();assert.ok(box.y>0&&box.y+box.height<viewport.height);assert.equal(await page.locator('#boostCheckoutBar').evaluate(el=>getComputedStyle(el).position),'fixed');}
   await page.locator('#submitOrderBtn').dblclick();await page.locator('#boostOrderResult').waitFor({state:'visible'});assert.equal(submits,1);await page.locator('#closePaymentGuideBtn').click();assert.match(await page.locator('#boostOrderResult').textContent(),/TEST-NEW/);assert.match(await page.locator('#boostOrderResult').textContent(),/¥16.40/);assert.equal(await page.locator('#gamePassword').inputValue(),'');
   await page.locator('[data-result=copy]').click();const copied=await page.evaluate(()=>window.__copied);assert.match(copied,/TEST-NEW/);assert.equal(copied.includes('SYNTHETIC-SECRET'),false);
   await page.locator('[data-result=detail]').click();await page.locator('.oc-guidance').waitFor();assert.match(await page.locator('.oc-guidance').textContent(),/当前处理方|下一次反馈/);assert.equal(await page.locator('.oc-history[open]').count(),0);await page.locator('#ocClose').click();
   await page.evaluate(()=>showSection('rental'));await page.locator('.rental-account-card').first().waitFor();assert.equal(await page.locator('.rental-account-card').count(),2);
   await page.locator('#rentalFilters [name=tank]').fill('IS-7');await page.locator('#rentalFilters [name=client]').selectOption('Android');assert.equal(await page.locator('.rental-account-card').count(),1);assert.match(await page.locator('.rental-account-card').textContent(),/禁止排位|小时/);
   await page.locator('#rentalFilters [name=max]').fill('1');assert.equal(await page.locator('.rental-account-card').count(),0);await page.locator('#rentalFilters [type=reset]').click();await page.waitForFunction(()=>document.querySelectorAll('.rental-account-card').length===2);
   await page.locator('#rentalFilters [name=availability]').fill('周末');assert.equal(await page.locator('.rental-account-card').count(),1);await page.locator('#rentalFilters [type=reset]').click();
   await page.locator('.rental-detail-btn[data-id="1"]').click();await page.locator('#rentalQuantity').fill('2');await page.locator('#rentalQuantity').dispatchEvent('change');assert.match(await page.locator('#rentalPeriod').textContent(),/至.*2小时/);assert.equal(await page.locator('#rentalTotalPrice').textContent(),'4.00');await page.locator('#closeOrderDetailBtn').click();
   await page.locator('#rentalFilters [name=availabilityStatus]').selectOption('rented');assert.equal(await page.locator('.rental-account-card').count(),1);await page.locator('.rental-detail-btn').click();await page.locator('#orderDetailModal').waitFor({state:'visible'});assert.equal(await page.locator('#submitRentBtn').isDisabled(),true);await page.locator('#closeOrderDetailBtn').click();
   await page.evaluate(()=>showSection('admin'));await page.locator('#adminOrderList .oc-card').first().waitFor();assert.equal(sort,'priority');assert.match(await page.locator('#adminOrderList .oc-card').first().textContent(),/TEST-DISPUTE/);assert.match(await page.locator('#adminOrderList').textContent(),/超过提醒阈值/);assert.equal(await page.locator('[data-metrics]').count(),0);await page.locator('[data-show-metrics]').click();await page.waitForFunction(()=>document.querySelector('[data-metrics]').textContent.includes('9 小时'));await page.locator('#ocClose').click();
   await page.locator('#adminOrderCenter [data-task=assignment]').click();await page.waitForFunction(()=>document.querySelectorAll('#adminOrderList .oc-card').length===1);assert.match(await page.locator('#adminOrderList').textContent(),/TEST-OPEN/);
   await page.evaluate(()=>OrderCenter.showDetail({order_type:'rental',order_ref:'TEST-DISPUTE'}));await page.locator('.oc-guidance').waitFor();assert.match(await page.locator('.oc-guidance').textContent(),/坦克清单与账号不符/);await page.locator('#ocClose').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
   console.log(`Customer workflow browser verification passed at ${viewport.width}×${viewport.height}: step validation, safe draft, login resume, exact credit discount, one submitted order, success summary, rental filters/occupancy/period, guidance and admin priorities/metrics.`);await context.close();
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(err=>{console.error(err);process.exitCode=1;});
