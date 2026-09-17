(function(global){
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
 const money=value=>Number(value||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
 const time=value=>value?new Date(typeof value==='string'&&/^\d+$/.test(value)?Number(value):value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'暂无记录';
 const identities={gold:'金牌',silver:'银牌',standard:'标准',budget:'特惠'};
 let config,hall=[],mine=[],financeData,previewData,financeVersion=0;
 const state={range:'7',from:'',to:'',page:1,myStatus:'playing'};
 const el=id=>document.getElementById(id);
 async function api(path,body){
  const response=await fetch('/api'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+config.token(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'请求失败，请重试');return data;
 }
 function empty(message){return `<div class="bw-empty" role="status">${esc(message)}</div>`;}
 function cards(rows,isHall){
  if(!rows.length)return empty(isHall?'暂无符合条件的可接订单，稍后刷新看看。':'当前筛选下暂无订单。');
  return `<div class="bw-order-grid">${rows.map(o=>{
   const settled=o.status==='done'&&o.settled_earnings!==null&&o.settled_earnings!==undefined;
   return `<article class="card bw-order-card"><div class="bw-order-top"><span class="bw-order-ref">${esc(o.order_no)}</span><span class="bw-status ${o.status==='done'?'bw-done':''}">${isHall?'待接单':({playing:'代练中',done:'已完成',pending:'待处理',cancelled:'已取消'})[o.status]||esc(o.status)}</span></div>
    <h4>${esc(o.project)}</h4><p class="bw-order-description">${esc(o.detail)}</p><div class="bw-tags"><span>${esc(o.client_type||'未注明客户端')}</span><span>${esc(identities[o.required_identity]||'标准')}要求</span>${o.urgent?'<span class="bw-urgent">加急</span>':''}</div>
    <dl class="bw-order-meta"><div><dt>服务数量</dt><dd>${esc(o.quantity)}</dd></div><div><dt>下单时间</dt><dd>${time(o.created_at)}</dd></div></dl>
    <div class="bw-order-footer"><div><span>${o.earnings_reversed?'测试收益已冲正':settled?'已入账收益':o.status==='done'?'历史预估 · 未关联流水':'预估收益'}</span><strong>¥${money(o.earnings_reversed?0:settled?o.settled_earnings:o.earnings)}</strong></div><div class="bw-order-actions">${isHall?`<button type="button" class="take-order-btn bw-primary" data-order="${esc(o.order_no)}">接单</button>`:`${o.status==='playing'?`<button type="button" class="complete-order-btn bw-primary" data-order="${esc(o.order_no)}">确认完单</button>`:''}<button type="button" class="detail-btn" data-order="${esc(o.order_no)}">详情</button>`}</div></div>
   </article>`;
  }).join('')}</div>`;
 }
 function renderHall(){
  const root=el('hallOrderList'),search=root.querySelector('[name=search]')?.value.toLowerCase()||'',client=root.querySelector('[name=client]')?.value||'';
  const rows=hall.filter(o=>(!client||o.client_type===client)&&`${o.order_no} ${o.project} ${o.detail}`.toLowerCase().includes(search));
  root.querySelector('[data-count]').textContent=rows.length+' 个可接订单';root.querySelector('[data-list]').innerHTML=cards(rows,true);
 }
 function renderMy(){
  const root=el('myBoosterOrderList'),rows=mine.filter(o=>state.myStatus==='all'||o.status===state.myStatus);
  root.querySelector('[data-list]').innerHTML=cards(rows,false);
  root.querySelectorAll('[data-my-status]').forEach(b=>{b.classList.toggle('active',b.dataset.myStatus===state.myStatus);b.setAttribute('aria-pressed',String(b.dataset.myStatus===state.myStatus));b.querySelector('span').textContent=mine.filter(o=>b.dataset.myStatus==='all'||o.status===b.dataset.myStatus).length;});
 }
 async function loadHall(){
  const root=el('hallOrderList');
  if(!root.querySelector('[data-list]'))root.innerHTML=`<div class="bw-page-heading"><div><span class="bw-eyebrow">ORDER HALL</span><h3>找到适合你的订单</h3><p>按身份要求展示可接订单，加急优先、同类订单按等待时间排列。</p></div><button type="button" data-hall-refresh>刷新大厅</button></div><div class="bw-toolbar"><label>查找订单<input name="search" type="search" placeholder="订单号、项目或方案"></label><label>客户端<select name="client"><option value="">全部客户端</option><option>Android</option><option>iOS</option></select></label><span data-count></span></div><p class="bw-note">当前分成：现金结算价的75%。预估收益尚未入账，确认完单后结算。</p><div data-list>${empty('正在加载可接订单…')}</div>`;
  try {
   const token=config.token();const [profile,rows]=await Promise.all([api('/user/profile'),api('/booster/hall')]);if(config.token()!==token)return;
   const weights={budget:0,standard:1,silver:2,gold:3};hall=rows.filter(o=>(weights[o.required_identity]??0)<=(weights[profile.booster_identity]??1));renderHall();
  }catch(e){root.querySelector('[data-list]').innerHTML=empty(e.message+'，可点击刷新大厅重试。');}
 }
 async function loadMy(){
  const root=el('myBoosterOrderList');
  if(!root.querySelector('[data-list]'))root.innerHTML=`<div class="bw-page-heading"><div><span class="bw-eyebrow">MY ORDERS</span><h3>专注正在处理的订单</h3><p>确认完成服务后再完单，完单会记入收益。</p></div><button type="button" data-my-refresh>刷新订单</button></div><div class="bw-periods" aria-label="我的接单状态">${[['playing','进行中'],['done','已完成'],['all','全部']].map(([key,label])=>`<button type="button" data-my-status="${key}">${label} <span>0</span></button>`).join('')}</div><div data-list>${empty('正在加载订单…')}</div>`;
  try{const token=config.token();const rows=await api('/booster/my-orders');if(config.token()!==token)return;mine=rows;renderMy();}catch(e){root.querySelector('[data-list]').innerHTML=empty(e.message+'，可点击刷新订单重试。');}
 }
 function financeShell(){
  const root=el('earningsDisplay');if(root.querySelector('[data-finance-content]'))return;
  root.innerHTML=`<div class="bw-page-heading"><div><span class="bw-eyebrow">EARNINGS</span><h3>每一笔收益，都有记录</h3><p>按实际入账时间统计，北京时间；进行中的订单仅展示预估。</p></div><button type="button" data-finance-refresh>刷新收益</button></div><div class="bw-finance-filter"><div class="bw-periods" aria-label="收益日期范围">${[['7','近7天'],['30','近30天'],['all','全部'],['custom','自选日期']].map(([value,label])=>`<button type="button" data-range="${value}">${label}</button>`).join('')}</div><form class="bw-date-form" hidden><label>开始日期<input name="from" type="date" required></label><label>结束日期<input name="to" type="date" required></label><button type="submit">查询收益</button></form></div><div data-finance-content></div>`;
 }
 function renderFinance(data){
  const root=el('earningsDisplay'),s=data.summary,summary=[['区间净收益',s.net,'入账减去冲正／调整'],['区间入账',s.income,'按流水入账时间'],['区间扣减',s.deductions,'测试冲正及其他调整'],['累计净收益',data.earnings,'当前账户记录']];
  financeData=data;
  root.querySelector('[data-finance-content]').innerHTML=`<div class="bw-summary-grid">${summary.map(([title,amount,note],i)=>`<section class="card bw-summary-card ${i===0?'bw-summary-primary':''}"><h4>${title}</h4><strong>¥${money(amount)}</strong><p>${note}</p></section>`).join('')}</div>
   <div class="bw-pending-note">进行中 ${esc(data.pending.orders)} 单 · 预估 ¥${money(data.pending.estimate)} <span>未计入收入，不受日期筛选影响</span></div>
   ${Number(data.legacy_unlinked)!==0?`<div class="bw-legacy-note">历史未关联流水差额：¥${money(data.legacy_unlinked)}。已计入累计净收益，无法归属到具体日期，因此不计入区间收入。${Number(data.legacy_unlinked)<0?'差额为负，需管理员核对历史账户。':''}</div>`:''}
   <section class="card bw-ledger-card"><div class="bw-card-heading"><h4>收益明细</h4><span>共 ${esc(s.total)} 条记录</span></div><p class="bw-note">正数为入账，负数为冲正／调整；原收入与冲正记录均保留。</p>
   ${data.entries.length?`<div class="bw-ledger-list">${data.entries.map(l=>`<article class="bw-ledger-entry"><div class="bw-ledger-main"><span class="bw-status ${Number(l.amount_delta)<0?'bw-adjustment':'bw-done'}">${Number(l.amount_delta)<0?(l.source_type==='booster_test_legacy'?'历史测试冲正':l.source_type==='booster_test_reversal'?'测试收益冲正':'收益调整'):'收益入账'}${Number(l.amount_delta)>0&&l.reversed?' · 已冲正':''}</span><h5>${esc(l.project||'历史收益记录')}${l.detail?' · '+esc(l.detail):''}</h5><p>${esc(l.order_no)} · ${time(l.occurred_at)}</p>${l.total_price!==null&&l.total_price!==undefined?`<small>订单现金结算价 ¥${money(l.total_price)} · 本笔${Number(l.amount_delta)<0?'扣减':'入账'}以流水金额为准</small>`:''}</div><div class="bw-ledger-amount"><strong class="${Number(l.amount_delta)<0?'bw-negative':''}">${Number(l.amount_delta)>0?'+':'−'}¥${money(Math.abs(Number(l.amount_delta)))}</strong>${data.admin&&l.order_income&&!l.reversed?`<button type="button" data-preview="${esc(l.order_no)}">核对测试收益</button>`:''}</div></article>`).join('')}</div>`:empty('所选日期内暂无收益流水。')}
   <div class="bw-pagination"><button type="button" data-finance-page="${data.page-1}" ${data.page===1?'disabled':''}>上一页</button><span>第 ${data.page} / ${Math.max(1,Math.ceil(Number(s.total)/20))} 页</span><button type="button" data-finance-page="${data.page+1}" ${data.page*20>=Number(s.total)?'disabled':''}>下一页</button></div></section>
   ${data.admin?'<details class="card bw-admin-finance"><summary>管理员 · 测试收益核对</summary><p class="bw-note">按订单核实后冲正对应收益，保留原订单和流水。仅扣减打手现金收益，不变更客户积分、打手积分或身份。</p><form data-admin-preview><label>测试订单号<input name="order" maxlength="64" required placeholder="填写已确认的测试订单号"></label><button type="submit">核对订单</button></form></details>':''}`;
 }
 async function loadFinance(){
  financeShell();const root=el('earningsDisplay'),version=++financeVersion,token=config.token();
  root.querySelectorAll('[data-range]').forEach(b=>{b.classList.toggle('active',b.dataset.range===state.range);b.setAttribute('aria-pressed',String(b.dataset.range===state.range));});root.querySelector('.bw-date-form').hidden=state.range!=='custom';
  if(state.range==='custom'&&(!state.from||!state.to)){root.querySelector('[data-finance-content]').innerHTML=empty('请选择开始和结束日期后查询收益。');return;}
  root.querySelector('[data-finance-content]').setAttribute('aria-busy','true');
  try{const data=await api('/booster/finance?'+new URLSearchParams(state));if(version!==financeVersion||config.token()!==token)return;renderFinance(data);}catch(e){if(version===financeVersion)root.querySelector('[data-finance-content]').innerHTML=empty(e.message+'，可刷新重试。');}finally{if(version===financeVersion)root.querySelector('[data-finance-content]').setAttribute('aria-busy','false');}
 }
 function dialog(){
  let d=el('bwTestDialog');if(d)return d;d=document.createElement('dialog');d.id='bwTestDialog';d.className='bw-test-dialog';d.setAttribute('aria-labelledby','bwTestTitle');d.innerHTML='<div class="bw-dialog-heading"><h3 id="bwTestTitle">核对测试订单收益</h3><button type="button" data-close-dialog aria-label="关闭">×</button></div><div data-preview-body></div>';document.body.appendChild(d);return d;
 }
 async function openPreview(ref,legacyAmount){
  const d=dialog();previewData=null;if(!d.open)d.showModal();const body=d.querySelector('[data-preview-body]');body.innerHTML=empty('正在核对…');
  try{
   const p=await api('/admin/booster-finance/'+encodeURIComponent(ref)+'/preview'+(legacyAmount!==undefined?'?legacy_amount='+encodeURIComponent(legacyAmount):''));if(!d.open)return;previewData=p;
   body.innerHTML=`<dl class="bw-preview-details"><div><dt>订单号</dt><dd>${esc(p.order_no)}</dd></div><div><dt>打手</dt><dd>${esc(p.booster_name)}</dd></div><div><dt>当前累计净收益</dt><dd>¥${money(p.balance)}</dd></div><div><dt>拟冲正金额</dt><dd>${p.amount===null?'尚未核实':'−¥'+money(p.amount)}</dd></div><div><dt>冲正后</dt><dd>${p.amount===null?'待核对':'¥'+money(p.balance-p.amount)}</dd></div></dl>
   ${p.reversed?empty('该订单收益已冲正，不会再次扣减。'):p.legacy?`<div class="bw-legacy-note">无原始收益流水，不能自动认定该单实际收入。仅在有记录依据时填写历史核实金额，当前上限 ¥${money(p.legacy_limit)}。</div><form data-legacy-preview><label>历史已入账金额<input name="amount" type="number" min="0.01" max="${p.legacy_limit}" step="0.01" value="${p.amount??''}" required></label><button type="submit">重新核对金额</button></form>`:'<p class="bw-note">冲正金额来自该订单的原始入账流水。</p>'}
   ${!p.reversed&&p.amount!==null?`<form data-confirm-reversal><label>测试核对说明<textarea name="reason" minlength="2" maxlength="250" required placeholder="说明为何确认为测试订单"></textarea></label><label>核对依据${p.legacy?'（必填）':'（选填）'}<input name="reference" maxlength="120" ${p.legacy?'required':''} placeholder="原测试记录、账单编号等"></label><label class="bw-confirm-check"><input name="confirmed" type="checkbox" required>确认这是测试订单，仅冲正上述现金收益</label><button type="submit" class="bw-danger" ${p.balance<p.amount?'disabled':''}>确认冲正 ¥${money(p.amount)}</button>${p.balance<p.amount?'<p class="bw-note">当前余额不足，无法冲正。</p>':''}</form>`:''}<p class="bw-dialog-error" role="status"></p>`;
  }catch(e){body.innerHTML=empty(e.message);}
 }
 function init(options){config=options;
  document.addEventListener('input',e=>{if(e.target.closest('#hallOrderList .bw-toolbar'))renderHall();if(e.target.closest('[data-legacy-preview]')){previewData=null;el('bwTestDialog').querySelector('[data-confirm-reversal]')?.remove();}});
  document.addEventListener('change',e=>{if(e.target.closest('#hallOrderList .bw-toolbar'))renderHall();});
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
   if(b.hasAttribute('data-hall-refresh'))loadHall();if(b.hasAttribute('data-my-refresh'))loadMy();
   if(b.dataset.myStatus){state.myStatus=b.dataset.myStatus;renderMy();}
   if(b.dataset.range){state.range=b.dataset.range;state.page=1;loadFinance();}
   if(b.hasAttribute('data-finance-refresh'))loadFinance();
   if(b.dataset.financePage){state.page=Number(b.dataset.financePage);loadFinance();}
   if(b.dataset.preview)openPreview(b.dataset.preview);
   if(b.hasAttribute('data-close-dialog')){el('bwTestDialog').close();previewData=null;}
  });
  document.addEventListener('submit',async e=>{const f=e.target;
   if(f.matches('.bw-date-form')){e.preventDefault();state.from=f.elements.from.value;state.to=f.elements.to.value;state.page=1;loadFinance();}
   if(f.matches('[data-admin-preview]')){e.preventDefault();openPreview(f.elements.order.value.trim());}
   if(f.matches('[data-legacy-preview]')){e.preventDefault();const ref=el('bwTestDialog').querySelector('.bw-preview-details dd').textContent;openPreview(ref,f.elements.amount.value);}
   if(f.matches('[data-confirm-reversal]')){
    e.preventDefault();if(!previewData)return;const p=previewData,b=f.querySelector('button[type=submit]');b.disabled=true;
    try{await api('/admin/booster-finance/'+encodeURIComponent(p.order_no)+'/reverse-test',{snapshot:p.snapshot,legacy_amount:p.legacy?p.amount:undefined,reason:f.elements.reason.value,reference:f.elements.reference.value,confirmation:'REVERSE_TEST_EARNINGS'});el('bwTestDialog').close();previewData=null;config.toast('测试收益已冲正，原订单与流水已保留');loadFinance();loadMy();}
    catch(error){el('bwTestDialog').querySelector('.bw-dialog-error').textContent=error.message;b.disabled=false;}
   }
  });
 }
 global.BoosterWorkbench={init,loadHall,loadMy,loadFinance,cards};
})(window);
