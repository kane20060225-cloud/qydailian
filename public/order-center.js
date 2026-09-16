(function (global) {
  'use strict';
  const types = { boost:'代练', rental:'租号', recharge:'充值', shop:'商城兑换', third_party:'三方订单' };
  const states = {
    boost:{pending_payment:'待支付',payment_review:'待核实收款',awaiting_assignment:'待接单',in_progress:'代练中',completed:'已完成',exception:'状态待核对'},
    rental:{pending_payment:'待支付',payment_review:'待核实收款',awaiting_activation:'待确认租用',in_progress:'租用中',awaiting_acceptance:'待确认完成',dispute:'争议处理中',completed:'已完成',closed:'已取消'},
    recharge:{pending_payment:'待支付',credit_pending:'到账处理中',credited:'已到账',closed:'已关闭',exception:'到账待核对'},
    shop:{completed:'已兑换'},third_party:{pending:'待审核',in_progress:'进行中',awaiting_acceptance:'待验收',completed:'已完成',rejected:'已驳回'}
  };
  const actionNames = {pay:'继续支付',refresh:'刷新到账状态',provider:'查询支付宝',reconcile:'重试到账',boost_payment:'上传付款凭证',boost_confirm_payment:'核实收款',boost_dispatch:'放入接单大厅',rental_manage:'处理租号订单',third_party_manage:'处理三方订单',archive:'归档',unarchive:'恢复归档'};
  Object.assign(actionNames,{remove:'删除订单',restore:'恢复订单'});
  const eventNames = {created:'订单创建',payment_credited:'充值到账',payment_confirmed:'确认收款',manual_payment_confirmed:'确认付款凭证',manual_payment_confirmed_without_evidence:'核实实际收款',order_dispatched:'放入接单大厅',reconcile_requested:'申请重新核对到账',archive:'归档',unarchive:'恢复归档',order_archived:'订单归档',order_unarchived:'恢复订单',payment_evidence_submitted:'提交付款凭证',rental_payment_confirmed:'租号收款确认',rental_completed:'租号完成',third_party_completed:'三方订单完成'};
  Object.assign(eventNames,{remove:'删除到回收站',restore:'从回收站恢复',auto_remove:'自动清理到回收站',order_remove:'删除到回收站',order_restore:'恢复订单',order_auto_remove:'自动清理'});
  Object.assign(eventNames,{order_created:'订单创建',order_completed:'代练完成',manual_payment_submitted:'提交付款凭证',payment_closed:'充值订单关闭',payment_reference_backfilled:'核对交易号',shop_purchased:'商城兑换',rental_created:'租号订单创建',rental_payment_submitted:'提交租号付款凭证',rental_payment_rejected:'付款凭证已驳回',rental_activated:'确认租用',rental_completion_requested:'出租方申请完成',rental_completed_by_renter:'租用方确认完成',rental_cancelled:'租号订单取消',rental_disputed:'发起租号争议',rental_refund_confirmed:'核实退款并取消',rental_dispute_resolved_completed:'争议裁决完成',third_party_finalized:'三方订单验收完成',approved:'审核通过',rejected:'审核驳回',resubmitted:'修改后重新提交',completion_requested:'申请验收',completion_returned:'验收退回',completed:'订单完成'});
  let config, modal, detail, detailScope='user', detailGeneration=0, busy=false, createBusy=false;
  const panels = {};
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time = value => value ? new Date(value).toLocaleString('zh-CN') : '—';
  const amount = order => order.amount_unit==='credits' ? `${order.amount} 积分` : `¥${Number(order.amount).toFixed(2)}`;
  async function request(path, options={}) {
    const res=await fetch(config.apiBase+path,{...options,headers:{Authorization:`Bearer ${config.getToken()}`,...options.headers}});
    const data=await res.json().catch(()=>({error:'服务器返回异常'}));
    if (!res.ok) throw new Error(data.error || '操作失败');
    return data;
  }
  function parameters(scope, extra={}) {
    return new URLSearchParams({...panels[scope].filters, ...(scope==='admin'?{scope:'admin'}:{}), ...extra});
  }
  function statusOptions(scope) {
    const p=panels[scope], map=p.filters.type ? states[p.filters.type] : Object.assign({},...Object.values(states));
    p.root.querySelector('[name=state]').innerHTML='<option value="">全部状态</option><option value="todo">待处理</option>'+Object.entries(map).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
    if (!(p.filters.state in map) && p.filters.state!=='todo') p.filters.state='';
    p.root.querySelector('[name=state]').value=p.filters.state;
  }
  function setupPanel(scope) {
    const root=$(scope==='admin'?'adminOrderCenter':'userOrderCenter'); if (!root) return;
    const admin=scope==='admin';
    const p=panels[scope]={root,list:$(admin?'adminOrderList':'orderList'),generation:0,rows:[],selected:new Set(),filters:{type:'',state:admin?'todo':'',task:'',search:'',from:'',to:'',channel:'',archived:'0',trash:'0',page:1}};
    root.insertAdjacentHTML('afterbegin',`<div class="oc-summary" aria-label="订单快捷筛选"></div><form class="oc-filters">
      <label>订单类型<select name="type"><option value="">全部类型</option>${Object.entries(types).filter(([k])=>k!=='third_party'||['admin','booster'].includes(config.getRole())).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>订单状态<select name="state"></select></label><label class="oc-search">搜索<input name="search" type="search" maxlength="100" placeholder="订单号、交易号、用户或内容"></label>
      <button type="button" data-refresh>刷新</button><details class="oc-more"><summary>更多筛选</summary><div class="oc-filter-extra"><label>起始日期<input name="from" type="date"></label><label>结束日期<input name="to" type="date"></label><label>支付渠道<select name="channel"><option value="">全部渠道</option><option>支付宝</option><option>人工核实</option><option>情谊积分</option></select></label>${admin?'<label>归档记录<select name="archived"><option value="0">未归档</option><option value="1">已归档</option></select></label><button type="button" data-export>导出当前结果</button>':''}<button type="button" data-reset>重置筛选</button></div></details></form>`);
    root.insertAdjacentHTML('beforeend','<div class="oc-paging"><button type="button" data-page="-1">上一页</button><span aria-live="polite"></span><button type="button" data-page="1">下一页</button></div>');
    if(admin)root.querySelector('form').insertAdjacentHTML('afterend','<div class="oc-bulk"><label><input type="checkbox" data-select-all> 选择本页可操作订单</label><button type="button" data-bulk disabled>删除选中（0）</button><button type="button" data-trash>回收站</button><button type="button" data-cleanup>自动清理设置</button><span class="oc-muted">回收站保留14天；无资金订单到期永久删除，付款及凭证记录保留。</span></div>');
    statusOptions(scope);
    let timer;
    root.querySelector('form').addEventListener('submit',e=>e.preventDefault());
    const change=e=>{if (!e.target.name) return; p.filters[e.target.name]=e.target.value;p.filters.page=1;
      if (e.target.name==='archived'&&e.target.value==='1') p.filters.state='';
      if (['type','archived'].includes(e.target.name)) statusOptions(scope);p.filters.task='';load(scope);};
    root.querySelector('form').addEventListener('change',e=>{if(e.target.name!=='search') change(e);});
    root.querySelector('[name=search]').addEventListener('input',e=>{clearTimeout(timer);timer=setTimeout(()=>change(e),300);});
    root.addEventListener('change',e=>{
      if(e.target.hasAttribute('data-select-all')){p.selected.clear();if(e.target.checked)p.rows.filter(o=>o.actions.includes(p.filters.trash==='1'?'restore':'remove')).forEach(o=>p.selected.add(o.order_type+':'+o.order_ref));}
      else if(e.target.dataset.select){if(e.target.checked)p.selected.add(e.target.dataset.select);else p.selected.delete(e.target.dataset.select);}
      else return;
      root.querySelectorAll('[data-select]').forEach(c=>c.checked=p.selected.has(c.dataset.select));updateSelection(p);
    });
    root.addEventListener('click',async e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.hasAttribute('data-refresh')) load(scope);
      else if(b.hasAttribute('data-trash')){p.filters.trash=p.filters.trash==='1'?'0':'1';p.filters.state='';p.filters.task='';p.filters.page=1;statusOptions(scope);load(scope);}
      else if(b.hasAttribute('data-cleanup'))showCleanup();
      else if(b.hasAttribute('data-bulk')){const action=p.filters.trash==='1'?'restore':'remove';detail={batch:p.rows.filter(o=>p.selected.has(o.order_type+':'+o.order_ref))};detailScope='admin';++detailGeneration;modal.style.display='flex';$('ocDetailTitle').textContent=`${actionNames[action]} · ${detail.batch.length} 条`;$('ocDetailBody').innerHTML='<div id="ocActionForm"></div><p id="ocActionMessage" role="status"></p>';$('ocDetailActions').innerHTML='';reasonForm(action);}
      else if(b.hasAttribute('data-reset')) {p.filters={type:'',state:admin?'todo':'',task:'',search:'',from:'',to:'',channel:'',archived:'0',trash:'0',page:1};root.querySelector('form').reset();statusOptions(scope);load(scope);}
      else if(b.dataset.task!==undefined){p.filters.state=b.dataset.task==='all'?'':'todo';p.filters.task=['all','todo'].includes(b.dataset.task)?'':b.dataset.task;p.filters.page=1;statusOptions(scope);load(scope);}
      else if(b.dataset.page){p.filters.page+=Number(b.dataset.page);load(scope);}
      else if(b.dataset.ref){const row=p.rows.find(o=>o.order_ref===b.dataset.ref&&o.order_type===b.dataset.type);if(row)showDetail(row,scope);}
      else if(b.hasAttribute('data-export')){b.disabled=true;try{const res=await fetch(`${config.apiBase}/order-center/export?${parameters(scope)}`,{headers:{Authorization:`Bearer ${config.getToken()}`}});if(!res.ok)throw new Error((await res.json()).error);const url=URL.createObjectURL(await res.blob());const a=document.createElement('a');a.href=url;a.download='订单导出.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(err){config.onToast(err.message);}finally{b.disabled=false;}}
    });
  }
  function updateSelection(p){const b=p.root.querySelector('[data-bulk]');if(!b)return;b.disabled=!p.selected.size;b.textContent=`${p.filters.trash==='1'?'恢复':'删除'}选中（${p.selected.size}）`;const boxes=[...p.root.querySelectorAll('[data-select]')],all=p.root.querySelector('[data-select-all]');all.checked=boxes.length>0&&boxes.every(c=>c.checked);all.indeterminate=p.selected.size>0&&!all.checked;p.root.querySelector('[data-trash]').textContent=p.filters.trash==='1'?'返回订单列表':'回收站';}
  async function showCleanup(){modal.style.display='flex';const generation=++detailGeneration;detailScope='admin';$('ocDetailTitle').textContent='无效订单自动清理';$('ocDetailActions').innerHTML='';$('ocDetailBody').innerHTML='<p>正在预览清理规则…</p>';
    try{const data=await request('/order-center/cleanup?scope=admin');if(generation!==detailGeneration)return;const s=data.settings;
      $('ocDetailBody').innerHTML=`<p>无效订单自动清理每小时检查一次，将订单移入回收站。回收站保留14天后自动永久删除普通无资金订单，无法恢复；付款、资金流水、付款凭证和支付状态未确定的充值记录保留。回收站到期删除独立运行，不受下方开关影响。</p><p>清理范围：未支付且未接单的代练、未支付的已取消租单、支付宝已确认关闭的充值、未支付的已驳回三方订单。含资金流水或付款凭证的订单不会自动清理。</p><div class="oc-reason"><label><input id="ocCleanupEnabled" type="checkbox" ${s.enabled?'checked':''}> 开启自动清理</label><label>保留期限（7–90 天）<input id="ocCleanupDays" type="number" min="7" max="90" value="${s.retention_days}"></label><button type="button" data-save-cleanup>保存并刷新预览</button></div><h4>当前规则预计清理 ${data.candidates.length} 条${data.candidates.length===data.limit?'（本次上限200条）':''}</h4><ul class="oc-cleanup-preview">${data.candidates.map(o=>`<li>${esc(types[o.type])} · ${esc(o.ref)}<br><small>${esc(o.title)} · ${time(o.created_at)}</small></li>`).join('')||'<li>没有符合规则的订单</li>'}</ul><label class="oc-cleanup-confirm"><input id="ocCleanupConfirm" type="checkbox"> 已核对上方规则和预览，立即移入回收站</label><button type="button" data-run-cleanup ${data.candidates.length?'':'disabled'}>按已保存规则清理一次</button><p id="ocActionMessage" role="status"></p>`;
      $('ocCleanupEnabled').focus();
    }catch(err){if(generation===detailGeneration)$('ocDetailBody').innerHTML=`<p role="alert">${esc(err.message)}</p>`;}
  }
  async function cleanupAction(run){if(busy)return;const enabled=$('ocCleanupEnabled').checked,days=Number($('ocCleanupDays').value);if(run&&!$('ocCleanupConfirm').checked){$('ocActionMessage').textContent='请先勾选确认清理预览';return;}busy=true;try{
    if(run){const current=await request('/order-center/cleanup?scope=admin');if(current.settings.enabled!==enabled||current.settings.retention_days!==days)throw new Error('规则已修改，请先保存并刷新预览');const result=await request('/order-center/cleanup/run?scope=admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'MOVE_INVALID_ORDERS_TO_TRASH'})});config.onToast(`已清理 ${result.removed} 条，跳过 ${result.skipped} 条`);load('admin');load('user');}
    else{await request('/order-center/cleanup?scope=admin',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled,retention_days:days})});config.onToast('清理规则已保存');}
    await showCleanup();
  }catch(err){$('ocActionMessage').textContent=err.message;}finally{busy=false;}}
  async function load(scope='user') {
    const p=panels[scope];if(!p)return;
    if(!config.getToken()){p.list.innerHTML='<p>登录后查看订单记录</p>';return;}
    const generation=++p.generation,scroll=window.scrollY,token=config.getToken();
    const typeSelect=p.root.querySelector('[name=type]');
    const allowedTypes=Object.entries(types).filter(([k])=>k!=='third_party'||['admin','booster'].includes(config.getRole()));
    if(p.filters.type&&!allowedTypes.some(([k])=>k===p.filters.type)){p.filters.type='';statusOptions(scope);}
    typeSelect.innerHTML='<option value="">全部类型</option>'+allowedTypes.map(([k,v])=>`<option value="${k}">${v}</option>`).join('');typeSelect.value=p.filters.type;
    p.list.setAttribute('aria-busy','true');
    try {
      const data=await request(`/order-center?${parameters(scope)}`);if(generation!==p.generation||token!==config.getToken())return;
      if(!data.orders.length&&p.filters.page>1){p.filters.page=Math.max(1,Math.ceil(data.total/25));return load(scope);}
      p.rows=data.orders;
      p.selected.clear();
      p.list.innerHTML=data.orders.length ? data.orders.map(o=>`<article class="oc-card"><div class="oc-card-top"><span class="oc-type">${types[o.order_type]}</span><span class="oc-state ${['exception','credit_pending','dispute'].includes(o.state)?'oc-warning-state':''}">${esc(o.state_label)}</span></div><h4>${esc(o.title)}</h4><div class="oc-reference">${esc(o.order_ref)}</div><div class="oc-meta"><span>${scope==='admin'?'用户：'+esc(o.customer_name):'创建：'+time(o.created_at)}</span><strong>${amount(o)}</strong></div>${scope==='admin'?`<div class="oc-meta"><span>${time(o.created_at)}</span><span>${esc(o.assignee_name||'')}</span></div>`:''}<div class="oc-card-footer"><small>${esc(o.payment_channel)}${o.payment_reference?' · '+esc(o.payment_reference):''}</small><button type="button" data-type="${o.order_type}" data-ref="${esc(o.order_ref)}">${o.actions.length?esc(actionNames[o.actions[0]]):'查看详情'} · 详情</button></div></article>`).join('') : '<div class="oc-empty">当前筛选下没有订单，可调整类型或状态查看历史记录。</div>';
      if(p.filters.trash==='1')p.list.querySelectorAll('.oc-card').forEach((card,i)=>{const o=p.rows[i];card.insertAdjacentHTML('beforeend',`<p class="oc-trash-expiry">14天清理期限：${esc(time(o.purge_after||new Date(new Date(o.removed_at).getTime()+14*86400000)))}</p>`);});
      const totalPages=Math.max(1,Math.ceil(data.total/25));const paging=p.root.querySelector('.oc-paging');paging.querySelector('span').textContent=`共 ${data.total} 条 · 第 ${p.filters.page} / ${totalPages} 页`;paging.querySelector('[data-page="-1"]').disabled=p.filters.page<=1;paging.querySelector('[data-page="1"]').disabled=p.filters.page>=totalPages;
      if(scope==='admin'){p.list.querySelectorAll('.oc-card').forEach((card,i)=>{const o=p.rows[i];if(o.actions.includes(p.filters.trash==='1'?'restore':'remove'))card.insertAdjacentHTML('afterbegin',`<label class="oc-select"><input type="checkbox" data-select="${esc(o.order_type+':'+o.order_ref)}" aria-label="选择订单 ${esc(o.order_ref)}">选择</label>`);});updateSelection(p);}
      const summary=p.root.querySelector('.oc-summary');
      if(scope==='admin'){const counts={todo:0,review:0,payment:0,acceptance:0,exception:0,refund:0,all:0};data.summary.forEach(s=>{counts.all+=Number(s.total);if(s.admin_task){counts.todo+=Number(s.total);counts[s.admin_task]+=Number(s.total);}});summary.innerHTML=Object.entries({todo:'全部待办',review:'审核 / 派单',payment:'核实收款',acceptance:'验收',exception:'到账异常',refund:'争议 / 退款',all:'所有记录'}).map(([k,v])=>`<button type="button" data-task="${k}" class="${(p.filters.task|| (p.filters.state==='todo'?'todo':'all'))===k?'active':''}">${v} <b>${counts[k]}</b></button>`).join('');}
      else summary.innerHTML='<span>充值、代练、租号与商城兑换均在这里查看。付款和到账以服务器核实结果为准。</span>';
      if(document.body.dataset.currentSection===(scope==='admin'?'admin':'profile'))window.scrollTo({top:scroll});
    }catch(err){if(generation===p.generation)p.list.innerHTML=`<p role="alert">${esc(err.message)}，请点击刷新重试。</p>`;}finally{if(generation===p.generation)p.list.removeAttribute('aria-busy');}
  }
  function close(){modal.style.display='none';++detailGeneration;}
  async function showDetail(order,scope='user') {
    detailScope=scope;detail=order;modal.style.display='flex';const generation=++detailGeneration;
    $('ocDetailTitle').textContent=`${types[order.order_type]} · ${order.order_ref}`;$('ocDetailBody').innerHTML='<p>正在读取订单…</p>';$('ocDetailActions').innerHTML='';
    try{const data=await request(`/order-center/${order.order_type}/${encodeURIComponent(order.order_ref)}?${new URLSearchParams(scope==='admin'?{scope:'admin'}:{})}`);if(generation!==detailGeneration)return;detail=data.order;
      const pairs=[...(detail.removed_at?[{label:'进入回收站',value:time(detail.removed_at)},{label:'14天清理期限',value:time(detail.purge_after||new Date(new Date(detail.removed_at).getTime()+14*86400000))},{label:'到期规则',value:'普通无资金订单到期永久删除，无法恢复；付款、资金流水、凭证及支付状态未确定的充值记录保留。'}]:[]),{label:'订单状态',value:detail.state_label},{label:'订单金额',value:amount(detail)},{label:'订单内容',value:detail.title},{label:'创建时间',value:time(detail.created_at)},{label:'支付渠道',value:detail.payment_channel},{label:'付款用户',value:detail.customer_name},...data.details];
      $('ocDetailBody').innerHTML=`${data.warning?`<p class="oc-warning" role="status">${esc(data.warning)}</p>`:''}<h4>订单与交付信息</h4><dl class="oc-details">${pairs.map(p=>`<div><dt>${esc(p.label)}</dt><dd>${esc(p.value??'—')}</dd></div>`).join('')}</dl>${data.screenshot?`<h4>付款凭证</h4><a href="/uploads/${encodeURIComponent(data.screenshot)}" target="_blank" rel="noopener"><img class="oc-evidence" src="/uploads/${encodeURIComponent(data.screenshot)}" alt="付款凭证"></a>`:''}<h4>到账与资金流水</h4>${data.ledger.length?data.ledger.map(l=>`<div class="oc-ledger"><span>${esc(({chest_tickets:'军需券',qy_credits:'情谊积分',booster_points:'打手积分',earnings:'代练收益',rental_earnings:'租号收益',balance:'账户余额'})[l.account_type]||'账户')}${l.user_name?' · '+esc(l.user_name):''}</span><strong>${Number(l.amount_delta)>0?'+':''}${esc(l.amount_delta)}</strong><small>余额 ${esc(l.balance_after)} · ${time(l.created_at)}</small></div>`).join(''):'<p class="oc-muted">暂无对应资金流水；待支付订单尚未到账。</p>'}<h4>操作记录</h4><ol class="oc-timeline"><li><time>${time(detail.created_at)}</time><p>订单创建</p></li>${data.events.map(e=>`<li><time>${time(e.created_at)}</time><p>${esc(eventNames[e.action]||'订单状态更新')}${e.actor_name?' · '+esc(e.actor_name):''}</p>${e.note?`<small>${esc(e.note)}</small>`:''}</li>`).join('')}</ol><div id="ocActionForm"></div><p id="ocActionMessage" role="status"></p>`;
      $('ocDetailActions').innerHTML=detail.actions.map((a,i)=>`<button type="button" data-action="${a}" class="${i===0?'submit-btn':''}">${actionNames[a]}</button>`).join('');
      if(!modal.contains(document.activeElement)) $('ocClose').focus();
    }catch(err){if(generation===detailGeneration)$('ocDetailBody').innerHTML=`<p role="alert">${esc(err.message)}</p><button type="button" id="ocDetailRetry">重试</button>`;}
  }
  function reasonForm(action) {
    const labels={reconcile:'已查询支付宝成功，请填写重试到账说明。',boost_confirm_payment:'请核对真实收款及凭证后填写说明。',boost_dispatch:'确认将已收款订单放入接单大厅？',archive:'归档后管理员默认列表隐藏，用户仍能查看订单。',unarchive:'请填写恢复归档的原因。'};
    Object.assign(labels,{remove:'确认将订单移入回收站？普通无资金订单满14天后永久删除，无法恢复，请及时恢复需要保留的订单。付款、资金流水、凭证和支付状态未确定的充值记录保留。未完成的租号订单须先取消。',restore:'确认恢复到订单中心？请填写恢复原因。'});
    $('ocActionForm').innerHTML=`<div class="oc-reason"><p>${labels[action]}</p>${action==='boost_dispatch'?'':'<label>操作说明<textarea id="ocReason" maxlength="500" rows="3" placeholder="填写核对结果或操作原因"></textarea></label>'}<button type="button" data-confirm="${action}">确认${actionNames[action]}</button><button type="button" data-cancel-reason>取消</button></div>`;$('ocReason')?.focus();$('ocActionForm').scrollIntoView({block:'nearest'});
  }
  async function perform(action) {
    if(busy)return;
    const order=detail,scope=detailScope,ref=encodeURIComponent(order.order_ref);
    if(action==='boost_payment'){close();config.onBoostPayment(order.order_ref);return;}
    if(action==='rental_manage'||action==='third_party_manage'){close();config.onManage(order,scope);return;}
    // Reserve the payment window during the user's click, before awaiting the network.
    const paymentWindow=action==='pay'?window.open('','ocPayment'):null;
    if(paymentWindow)paymentWindow.document.body.textContent='正在打开原充值订单的支付页面…';
    busy=true;$('ocDetailActions').querySelectorAll('button').forEach(b=>b.disabled=true);
    try {
      if(action==='pay'){
        const res=await fetch(`${config.apiBase}/chest/payments/${ref}/pay`,{method:'POST',headers:{Authorization:`Bearer ${config.getToken()}`}});
        if(!res.ok)throw new Error((await res.json()).error);
        const parsed=new DOMParser().parseFromString(await res.text(),'text/html');const original=parsed.querySelector('form');if(!original)throw new Error('支付页面未返回有效表单');
        const url=new URL(original.action);if(url.protocol!=='https:'|| !/^(openapi|openapi-sandbox|mapi)\.alipay\.com$/.test(url.hostname))throw new Error('支付地址异常');
        const form=document.createElement('form');form.action=url.href;form.method='POST';form.target=paymentWindow?'ocPayment':'_self';original.querySelectorAll('input[name]').forEach(input=>{const field=document.createElement('input');field.type='hidden';field.name=input.name;field.value=input.value;form.appendChild(field);});document.body.appendChild(form);form.submit();form.remove();config.onToast('支付后回到订单详情，点击刷新到账状态');
      }else{
        const reason=$('ocReason')?.value.trim()||'';
        if(['reconcile','boost_confirm_payment','archive','unarchive','remove','restore'].includes(action)&&!reason)throw new Error('请填写操作说明');
        if(['remove','restore'].includes(action)){const orders=(order.batch||[order]).map(o=>({type:o.order_type,ref:o.order_ref}));const result=await request('/order-center/removals?scope=admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orders,reason,action})});const failures=result.results.filter(r=>!r.success);config.onToast(`已${action==='remove'?'删除':'恢复'} ${result.success_count} 条${failures.length?'，失败 '+failures.length+' 条':''}`);load(scope);load('user');if(failures.length){$('ocActionMessage').textContent=failures.map(r=>`${r.ref}：${r.error}`).join('；');}else close();return;}
        let path,method='POST',body;
        if(action==='refresh')path=`/chest/payments/${ref}/refresh`;
        if(action==='provider'){path=`/admin/chest/payments/${ref}/provider-status`;method='GET';}
        if(action==='reconcile'){path=`/admin/chest/payments/${ref}/reconcile`;body={confirmation:'RECONCILE_SIGNED_ALIPAY_PAYMENT',reason};}
        if(action==='boost_confirm_payment'){path=`/admin/orders/${ref}/confirm-payment`;method='PUT';body={reason};}
        if(action==='boost_dispatch'){path=`/admin/orders/${ref}/hall`;method='PUT';}
        if(['archive','unarchive'].includes(action)){path=`/order-center/${order.order_type}/${ref}/archive?scope=admin`;body={action,reason};}
        const result=await request(path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
        config.onToast(result.found===false?'支付平台尚未查到成功交易，请稍后刷新':'订单已重新核实');
        await showDetail(order,scope);load(scope);config.onTicketRefresh();
      }
    }catch(err){if(paymentWindow)paymentWindow.close();const msg=$('ocActionMessage');if(msg)msg.textContent=err.message;else config.onToast(err.message);}
    finally{busy=false;$('ocDetailActions').querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  async function createRecharge() {
    if(!config.getToken()){config.onToast('请先登录');return;}if(createBusy)return;createBusy=true;const btn=$('rechargeBtn');if(btn)btn.disabled=true;
    try{const result=await request('/chest/recharge',{method:'POST',headers:{Accept:'application/json'}});config.onToast('充值订单已创建，可在所有订单中继续支付');await showDetail({order_type:'recharge',order_ref:result.order_no});load('user');}
    catch(err){config.onToast(err.message);}finally{createBusy=false;if(btn)btn.disabled=false;}
  }
  function selectType(type){const p=panels.user;p.filters.type=type;p.filters.state='';p.filters.page=1;p.root.querySelector('[name=type]').value=type;statusOptions('user');load('user');}
  function init(options) {
    if(config)return;config=options;setupPanel('user');setupPanel('admin');
    document.body.insertAdjacentHTML('beforeend','<div id="orderCenterModal" class="modal-overlay" style="display:none"><div class="modal-card oc-modal-card" role="dialog" aria-modal="true" aria-labelledby="ocDetailTitle"><header class="oc-modal-header"><h3 id="ocDetailTitle">订单详情</h3><button type="button" id="ocClose" class="modal-close" aria-label="关闭订单详情">×</button></header><div id="ocDetailBody" class="oc-modal-body"></div><footer id="ocDetailActions" class="oc-modal-footer"></footer></div></div>');modal=$('orderCenterModal');
    global.UIRuntime?.enhanceModals({querySelectorAll:()=>[modal],get activeElement(){return document.activeElement;}});
    modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('#ocClose')){if(!busy)close();return;}if(e.target.id==='ocDetailRetry')showDetail(detail,detailScope);const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-save-cleanup')){cleanupAction(false);return;}if(b.hasAttribute('data-run-cleanup')){cleanupAction(true);return;}if(b.dataset.action){if(['reconcile','boost_confirm_payment','boost_dispatch','archive','unarchive','remove','restore'].includes(b.dataset.action))reasonForm(b.dataset.action);else perform(b.dataset.action);}if(b.dataset.confirm)perform(b.dataset.confirm);if(b.hasAttribute('data-cancel-reason'))$('ocActionForm').innerHTML='';});
    $('rechargeOrdersBtn')?.addEventListener('click',()=>{config.onOpenOrders();selectType('recharge');});
    const returned=new URLSearchParams(location.search).get('out_trade_no');
    if(config.getToken()&&/^RC\d{13}[a-f0-9]{10}$/i.test(returned||'')){config.onOpenOrders();selectType('recharge');showDetail({order_type:'recharge',order_ref:returned});}
  }
  global.OrderCenter={init,load,createRecharge,showDetail,selectType};
})(window);
