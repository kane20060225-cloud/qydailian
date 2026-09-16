'use strict';
// Local browser verification uses synthetic API responses and never opens a real payment.
const assert=require('node:assert/strict');
const path=require('node:path');
const express=require('express');
const {chromium}=require('playwright');
const {decorateOrder}=require('../lib/order-center');
(async()=>{
  const app=express();app.use(express.static(path.join(__dirname,'..','..','public')));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
      const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(()=>{localStorage.setItem('token','synthetic-browser-test');localStorage.setItem('role','admin');localStorage.setItem('userId','3');localStorage.setItem('username','test-admin');});
      const now=new Date().toISOString();let credited=false,confirmed=false,dispatches=0,confirmations=0,refreshes=0;
      const rechargeRef='RC1700000000000ABCDEF1234';
      const rows=()=>[
        {order_type:'recharge',order_ref:rechargeRef,title:'军需券充值 · 10000券',customer_id:3,customer_name:'test-admin',amount:'6.00',amount_unit:'money',created_at:now,business_status:credited?'paid':'pending',payment_status:credited?'paid':'unpaid',payment_channel:'支付宝',state:credited?'credited':'pending_payment',admin_task:null},
        {order_type:'boost',order_ref:'TEST-BOOST',title:'银币 · test',customer_id:1,customer_name:'test-customer',amount:'10.00',amount_unit:'money',created_at:now,business_status:'pending',payment_status:confirmed?'paid':'pending',payment_channel:'人工核实',state:confirmed?'awaiting_assignment':'payment_review',admin_task:confirmed?'review':'payment'},
        {order_type:'rental',order_ref:'TEST-RENT',title:'账号租用 · 1天',customer_id:3,related_user_id:2,customer_name:'test-admin',amount:'6.00',amount_unit:'money',created_at:now,business_status:'active',payment_status:'paid',payment_channel:'人工核实',state:'awaiting_acceptance',admin_task:null},
        {order_type:'shop',order_ref:'SHOP1',title:'测试兑换商品',customer_id:3,customer_name:'test-admin',amount:10,amount_unit:'credits',created_at:now,business_status:'completed',payment_status:'paid',payment_channel:'情谊积分',state:'completed',admin_task:null},
        {order_type:'third_party',order_ref:'TEST-TP',title:'安卓官服测试订单',customer_id:5,customer_name:'test-booster',amount:'6.00',amount_unit:'money',created_at:now,business_status:'pending',payment_status:'unpaid',payment_channel:'人工核实',state:'pending',admin_task:'review'}
      ];
      await page.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());if(url.origin!==origin){await route.abort();return;}if(!url.pathname.startsWith('/api/')){await route.continue();return;}
        let data=[];let status=200;const pathname=url.pathname;
        if(pathname==='/api/order-center'){
          const admin=url.searchParams.get('scope')==='admin';let orders=rows().filter(o=>admin||o.customer_id===3||o.related_user_id===3);
          const summary=orders.map(o=>({state:o.state,admin_task:o.admin_task,total:1}));
          if(url.searchParams.get('type'))orders=orders.filter(o=>o.order_type===url.searchParams.get('type'));
          if(url.searchParams.get('state')==='todo')orders=orders.filter(o=>admin?o.admin_task:['pending_payment','awaiting_acceptance'].includes(o.state));
          if(url.searchParams.get('task'))orders=orders.filter(o=>o.admin_task===url.searchParams.get('task'));
          data={orders:orders.map(o=>decorateOrder(o,3,admin)),total:orders.length,page:1,page_size:25,summary};
        }else if(pathname.startsWith('/api/order-center/')){
          const [, , ,type,ref]=pathname.split('/');const row=rows().find(o=>o.order_type===type&&o.order_ref===ref);data={order:decorateOrder(row,3,url.searchParams.get('scope')==='admin'),details:[{label:'购买数量',value:'10000军需券'}],ledger:credited&&type==='recharge'?[{account_type:'chest_tickets',amount_delta:10000,balance_after:10000,created_at:now}]:[],events:[],warning:null};
        }else if(pathname==='/api/chest/recharge'){data={order_no:rechargeRef,amount:'6.00',ticket_quantity:10000};status=201;
        }else if(pathname.endsWith('/refresh')&&pathname.includes('/chest/payments/')){credited=true;refreshes++;data={found:true,outcome:'credited',acknowledge:true};
        }else if(pathname.endsWith('/confirm-payment')){assert.ok(req.postDataJSON().reason);confirmed=true;confirmations++;data={success:true};
        }else if(pathname.endsWith('/hall')){assert.ok(confirmed);dispatches++;data={success:true};
        }else if(pathname==='/api/user/profile'){data={id:3,username:'test-admin',role:'admin',balance:0,qy_credits:0,chest_tickets:credited?10000:0};
        }else if(pathname==='/api/user/credits'){data={qy_credits:0};
        }else if(pathname==='/api/chest/tickets'){data={tickets:credited?10000:0};}
        await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
      });
      await page.goto(origin,{waitUntil:'networkidle'});
      assert.equal(await page.locator('[data-target="league"],#leagueAdminBtn,#sectionLeague,#sectionLeagueAdmin,#leagueDetailModal,[data-ctype="league-news"]').count(),0);
      assert.equal(await page.locator('.content-mgr-tab').count(),2);
      assert.equal(await page.locator('#shopItemsContainer').evaluate(element=>getComputedStyle(element).display),'grid');
      await page.evaluate(()=>showSection('profile'));
      await page.locator('#userOrderCenter .oc-card').first().waitFor();
      await page.locator('#userOrderCenter [name=type]').selectOption('recharge');
      await page.waitForFunction(()=>document.querySelectorAll('#orderList .oc-card').length===1);
      await page.locator('#orderList [data-ref]').click();await page.locator('[data-action=refresh]').waitFor();
      assert.equal(await page.locator('#orderCenterModal').getAttribute('aria-hidden'),'false');
      const before=await page.locator('#ocDetailActions').boundingBox();assert.ok(before.y+before.height<=viewport.height);
      await page.locator('[data-action=refresh]').click();await page.waitForFunction(()=>document.querySelector('#ocDetailBody').textContent.includes('已到账'));
      assert.equal(refreshes,1);assert.equal(await page.locator('[data-action=pay]').count(),0);
      await page.keyboard.press('Escape');await page.waitForFunction(()=>document.getElementById('orderCenterModal').style.display==='none');
      assert.equal(await page.locator('#userOrderCenter [name=type]').inputValue(),'recharge');
      await page.evaluate(()=>showSection('admin'));await page.locator('#adminOrderList [data-ref="TEST-BOOST"]').waitFor();
      await page.locator('#adminOrderList [data-ref="TEST-BOOST"]').click();await page.locator('[data-action=boost_confirm_payment]').click();
      await page.locator('[data-confirm=boost_confirm_payment]').click();assert.equal(confirmations,0);
      await page.locator('#ocReason').fill('已核对实际收款凭证');await page.locator('[data-confirm=boost_confirm_payment]').click();await page.locator('[data-action=boost_dispatch]').waitFor();
      await page.locator('[data-action=boost_dispatch]').click();await page.locator('[data-confirm=boost_dispatch]').click();await page.waitForFunction(()=>document.querySelector('#ocDetailBody').textContent.includes('待接单'));assert.equal(dispatches,1);assert.equal(confirmations,1);
      await page.keyboard.press('Escape');
      await page.evaluate(()=>showSection('profile'));await page.locator('#orderList [data-ref]').waitFor();
      if(viewport.width<680){const layout=await page.evaluate(()=>({columns:getComputedStyle(document.getElementById('orderList')).gridTemplateColumns,overflow:document.documentElement.scrollWidth>innerWidth}));assert.equal(layout.columns.split(' ').length,1);assert.equal(layout.overflow,false);}
      assert.deepEqual(errors,[]);await context.close();console.log(`Browser verification passed at ${viewport.width}×${viewport.height}: filtering, details, fixed footer, safe confirmation, recharge refresh, Escape and no page errors.`);
    }
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
