'use strict';
// Local synthetic fixtures only; API requests never reach production.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const express=require('express'),{chromium}=require('playwright');
const {decorateOrder}=require('../lib/order-center'),{guidance}=require('../lib/order-guidance');
(async()=>{
 const output=path.resolve(process.env.UI_SCREENSHOT_DIR||path.join(__dirname,'../../artifacts/ui-preview'));fs.mkdirSync(output,{recursive:true});
 const app=express();app.use(express.static(path.join(__dirname,'../../public')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 const geometry=new Map(),fixtureNow=new Date().toISOString();
 try{
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  for(const theme of ['light','dark'])for(const viewport of [{width:1440,height:1000},{width:768,height:1024},{width:650,height:900},{width:390,height:844},{width:360,height:800}]){
   const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];let failSave=false,saves=0;
   await context.addInitScript(value=>{localStorage.setItem('theme',value);for(const [k,v]of Object.entries({token:'synthetic',userId:'7',role:'admin',username:'界面验收'}))localStorage.setItem(k,v);},theme);
   page.on('pageerror',e=>errors.push(e.message));
   const now=fixtureNow,rows=[{order_type:'boost',order_ref:'UI-REVIEW-001',title:'银币 · 标准打手',customer_id:7,customer_name:'测试用户',amount:7.8,amount_unit:'money',state:'payment_review',payment_status:'pending',created_at:now,stage_recorded_at:now,admin_task:'payment'},{order_type:'rental',order_ref:'UI-ACTIVE-002',title:'IS-7 · 账号租赁',customer_id:7,amount:24,amount_unit:'money',state:'in_progress',payment_status:'paid',created_at:now},{order_type:'boost',order_ref:'UI-DONE-003',title:'单车经验 · 已完成',customer_id:7,amount:28,amount_unit:'money',state:'completed',payment_status:'paid',created_at:now},{order_type:'boost',order_ref:'UI-EXCEPTION-004',title:'历史订单 · 状态核对',customer_id:7,amount:7.8,amount_unit:'money',state:'exception',payment_status:'unpaid',created_at:now,admin_task:'review'}];
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url()),p=url.pathname;if(url.origin!==origin){await route.abort();return;}if(!p.startsWith('/api/')){await route.continue();return;}
    let data=[],status=200;
    if(p==='/api/service-content'){await route.fulfill({json:require('../lib/service-content').published({revision:1,...require('../lib/service-content').defaults})});return;}
    if(p==='/api/user/settings'){if(req.method()==='PUT'){saves++;if(failSave){status=503;data={error:'测试：账号同步暂不可用'};}else data={success:true};}else data={theme};}
    else if(p==='/api/user/profile')data={id:7,username:'界面验收',email:'test@example.invalid',role:'admin',reputation:100,booster_identity:'standard',referral_code:'UI-TEST',created_at:now};
    else if(p==='/api/user/credits')data={qy_credits:1200,total_earned_credits:1500,vip_level:2};
    else if(p==='/api/order-center/metrics')data={assignment_hours:2.5,assignment_samples:4,completion_hours:12,completion_samples:3,dispute_rate:5,paid_rentals:20,disputed_rentals:1,repeat_rate:25,paying_customers:8,repeat_customers:2};
    else if(p==='/api/order-center'){const admin=url.searchParams.get('scope')==='admin';data={orders:rows.map(r=>decorateOrder(r,7,admin)),total:rows.length,page:1,summary:rows.map(r=>({state:r.state,admin_task:r.admin_task,total:1}))};}
    else if(/^\/api\/order-center\/[^/]+\/[^/]+$/.test(p)){const row=rows.find(r=>r.order_ref===p.split('/').pop());const order=decorateOrder(row,7,true),details=[{label:'客户端',value:'Android'},{label:'服务方案',value:'标准打手'}];data={order,details,ledger:[],events:[],guidance:guidance(order,{details,userId:7,admin:true})};}
    else if(p==='/api/rental/accounts')data=[{id:1,client_type:'Android',tank_list:'IS-7\nT-54\nE 100',hourly_price:2,daily_price:24,available_time_desc:'每天 18:00–24:00',rules:'禁止改密；禁止排位',owner_name:'测试出租方',availability_status:'available'},{id:2,client_type:'iOS',tank_list:'M60\nAMX 50 B',hourly_price:3,daily_price:30,available_time_desc:'周末',rules:'禁止改密',owner_name:'另一位出租方',availability_status:'available'}];
    else if(p==='/api/third-party-orders')data=[{order_no:'UI-TP-001',creator_id:7,creator_name:'测试打手',platform:'安卓官服',account_info:'synthetic-account',content:'三方银币订单 · 标准方案',price:12,workflow_stage:'pending',payment_status:'unpaid',created_at:now},{order_no:'UI-TP-002',creator_id:7,creator_name:'测试打手',platform:'亚服',account_info:'synthetic-account',content:'三方经验订单 · 等待收款核实',price:24,workflow_stage:'in_progress',payment_status:'unpaid',created_at:now}];
    else if(p==='/api/booster-availability/public')data={online_count:3,status:'online'};
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   });
   const check=async name=>{
    if(name==='admin'){assert.equal(await page.locator('#adminOrderCenter [data-metrics]').count(),0);}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,theme+' '+viewport.width+' '+name+' overflow');
    assert.deepEqual(errors,[],name+' page errors');
    const background=await page.evaluate(()=>getComputedStyle(document.body).backgroundImage);
    if(theme==='light')assert.equal(background,'none');else assert.match(background,/bg\.webp/);
    const layout=await page.evaluate(()=>Array.from(document.body.querySelectorAll('*')).filter(el=>el.getClientRects().length&& !el.closest('.toast-message')).map(el=>{
      const r=el.getBoundingClientRect(),s=getComputedStyle(el),round=n=>Math.round(n*2)/2;
      return {element:el.tagName+':'+el.id+':'+String(el.className),rect:[r.width,r.height,round(r.x+scrollX),round(r.y+scrollY)].map(round),display:s.display,font:s.fontSize,line:s.lineHeight,padding:s.padding,margin:s.margin,radius:s.borderRadius};
    }));
    const key=viewport.width+':'+name;if(theme==='light')geometry.set(key,layout);else assert.deepEqual(layout,geometry.get(key),'Theme layout differs at '+key);
    if((viewport.width===1440||viewport.width===390)&&['home','boost','rental','admin','detail','appearance','third-party'].includes(name))await page.screenshot({path:path.join(output,theme+'-'+viewport.width+'-'+name+'.png'),fullPage:name!=='detail'});
   };
   await page.goto(origin,{waitUntil:'networkidle'});assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('theme-light')),theme==='light');await check('home');
   await page.locator('#themeToggleBtn').click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme==='light'?'dark':'light');await page.locator('#themeToggleBtn').click();
   await page.evaluate(()=>{localStorage.setItem('username','用于检查手机排版的较长用户名称');checkLoginStatus();});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'long username overflow');
   await page.evaluate(()=>{localStorage.setItem('token','');checkLoginStatus();});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'anonymous navigation overflow');
   await page.evaluate(()=>{localStorage.setItem('token','synthetic');localStorage.setItem('username','界面验收');checkLoginStatus();});
   if(theme==='dark')assert.deepEqual(await page.evaluate(()=>{const s=getComputedStyle(document.body);return ['--bg','--card-bg','--border','--accent','--text','--text-secondary','--text-muted','--green','--red','--price'].map(v=>s.getPropertyValue(v).trim());}),['#0a0f1a','#141b26','#1e2a3a','#f0a050','#e2e8f0','#a0aec0','#6b7280','#48bb78','#f85149','#f0c060'],'Existing dark palette must remain unchanged');
   const contrast=theme==='light'?await page.evaluate(()=>{
    const style=getComputedStyle(document.body),color=v=>{let hex=style.getPropertyValue(v).trim().slice(1);if(hex.length===3)hex=hex.split('').map(c=>c+c).join('');if(!/^[\da-f]{6}$/i.test(hex))throw Error('Expected resolved hex color for '+v);return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));};
    const l=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),c=(a,b)=>{const x=l(a),y=l(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const pairs=['--text','--text-secondary','--text-muted','--accent'].flatMap(v=>['--bg','--card-bg','--surface-muted'].map(bg=>[v,bg]));pairs.push(['--on-primary','--primary-bg'],['--green','--success-soft'],['--red','--danger-soft'],['--warning','--warning-soft'],['--text','--accent-soft']);
    return Object.fromEntries(pairs.map(([v,bg])=>[v+'/'+bg,c(color(v),color(bg))]));
   }):{};
   for(const [token,ratio]of Object.entries(contrast))assert.ok(ratio>=4.5,theme+' '+token+' text contrast '+ratio);
   await page.evaluate(()=>showSection('boost'));await page.locator('#boostNext').waitFor();await check('boost');
   if(viewport.width===650){const box=await page.locator('.boost-checkout-bar').boundingBox();assert.ok(Math.abs(box.y+box.height-viewport.height)<=1,'checkout bar must sit at viewport bottom without mobile navigation');}
   await page.evaluate(()=>showSection('rental'));await page.locator('.rental-account-card').first().waitFor();await check('rental');
   await page.evaluate(()=>showSection('profile'));await page.locator('#orderList .oc-card').first().waitFor();await check('profile');
   await page.evaluate(()=>showSection('thirdparty'));await page.locator('.tp-order-card').first().waitFor();await check('third-party');
   await page.evaluate(()=>showSection('admin'));await page.locator('#adminOrderList .oc-card').first().waitFor();await check('admin');
   await page.evaluate(()=>OrderCenter.showDetail({order_type:'boost',order_ref:'UI-REVIEW-001'}));await page.locator('.oc-guidance').waitFor();await check('detail');assert.ok(await page.locator('#ocClose').isVisible());await page.locator('#ocClose').click();
   await page.evaluate(()=>showSection('settings'));await page.waitForFunction(()=>window._userSettings);await page.evaluate(()=>renderAppearance());await check('appearance');
   const other=theme==='light'?'dark':'light';await page.locator('input[name=theme][value='+other+']').check();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),other);
   failSave=true;await page.locator('#saveThemeBtn').click();await page.waitForFunction(()=>document.querySelector('#themeSaveStatus').textContent.includes('暂不可用'));assert.equal(saves,1);assert.equal(await page.locator('#saveThemeBtn').isDisabled(),false);
   failSave=false;await page.locator('#saveThemeBtn').click();await page.waitForFunction(()=>document.querySelector('#themeSaveStatus').textContent.includes('同步到账号'));assert.equal(saves,2);assert.equal(await page.evaluate(()=>window._userSettings.theme),other);
   assert.deepEqual(errors,[]);console.log(theme+' '+viewport.width+'×'+viewport.height+': layout, theme surfaces, status tones, preview, save failure and retry passed.');await context.close();
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
