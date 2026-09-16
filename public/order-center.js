(function (global) {
  'use strict';
  const types = { boost:'代练', rental:'租号', recharge:'充值', shop:'商城兑换', third_party:'三方订单' };
  const states = {
    boost:{pending_payment:'待支付',payment_review:'待核实收款',awaiting_assignment:'待接单',in_progress:'代练中',completed:'已完成',closed:'已取消',exception:'状态待核对'},
    rental:{pending_payment:'待支付',payment_review:'待核实收款',awaiting_activation:'待确认租用',in_progress:'租用中',awaiting_acceptance:'待确认完成',dispute:'争议处理中',completed:'已完成',closed:'已取消'},
    recharge:{pending_payment:'待支付',credit_pending:'到账处理中',credited:'已到账',closed:'已关闭',exception:'到账待核对'},
    shop:{completed:'已兑换'},third_party:{pending:'待审核',in_progress:'进行中',awaiting_acceptance:'待验收',completed:'已完成',rejected:'已驳回'}
  };
  const actionNames = {pay:'继续支付',refresh:'刷新到账状态',provider:'查询支付宝',reconcile:'重试到账',boost_payment:'上传付款凭证',boost_confirm_payment:'核实收款',boost_dispatch:'放入接单大厅',rental_manage:'处理租号订单',third_party_manage:'处理三方订单',archive:'归档',unarchive:'恢复归档'};
  Object.assign(actionNames,{remove:'删除订单',restore:'恢复订单'});
  Object.assign(actionNames,{cancel_unpaid:'取消未付款订单',resolve_recharge:'核销历史到账异常'});
  Object.assign(actionNames,{request_deletion:'申请删除',review_deletion:'审核删除申请',reviewed_remove:'核对后删除（保留记录）'});
  const eventNames = {created:'订单创建',payment_credited:'充值到账',payment_confirmed:'确认收款',manual_payment_confirmed:'确认付款凭证',manual_payment_confirmed_without_evidence:'核实实际收款',order_dispatched:'放入接单大厅',reconcile_requested:'申请重新核对到账',archive:'归档',unarchive:'恢复归档',order_archived:'订单归档',order_unarchived:'恢复订单',payment_evidence_submitted:'提交付款凭证',rental_payment_confirmed:'租号收款确认',rental_completed:'租号完成',third_party_completed:'三方订单完成'};
  Object.assign(eventNames,{remove:'删除到回收站',restore:'从回收站恢复',auto_remove:'自动清理到回收站',order_remove:'删除到回收站',order_restore:'恢复订单',order_auto_remove:'自动清理'});
  Object.assign(eventNames,{unpaid_cancelled:'取消未付款订单',unpaid_timeout_closed:'24小时未付款关闭',recharge_test_closed:'测试充值订单核销关闭',recharge_historical_credited:'确认历史已到账（余额未变）',recharge_tickets_backfilled:'核实支付后补发军需券'});
  Object.assign(eventNames,{order_created:'订单创建',order_completed:'代练完成',manual_payment_submitted:'提交付款凭证',payment_closed:'充值订单关闭',payment_reference_backfilled:'核对交易号',shop_purchased:'商城兑换',rental_created:'租号订单创建',rental_payment_submitted:'提交租号付款凭证',rental_payment_rejected:'付款凭证已驳回',rental_activated:'确认租用',rental_completion_requested:'出租方申请完成',rental_completed_by_renter:'租用方确认完成',rental_cancelled:'租号订单取消',rental_disputed:'发起租号争议',rental_refund_confirmed:'核实退款并取消',rental_dispute_resolved_completed:'争议裁决完成',third_party_finalized:'三方订单验收完成',approved:'审核通过',rejected:'审核驳回',resubmitted:'修改后重新提交',completion_requested:'申请验收',completion_returned:'验收退回',completed:'订单完成'});
  Object.assign(eventNames,{deletion_requested:'申请删除订单',deletion_rejected:'删除申请被驳回',reviewed_order_removed:'核对后移入回收站（记录保留）'});
  let config, modal, detail, detailScope='user', detailGeneration=0, busy=false, createBusy=false;
  const panels = {};
  let timeoutPreview=[];
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
    const p=panels[scope]={root,list:$(admin?'adminOrderList':'orderList'),generation:0,rows:[],selected:new Set(),filters:{type:'',state:admin?'todo':'',task:'',search:'',from:'',to:'',channel:'',archived:'0',trash:'0',sort:admin?'priority':'newest',page:1}};
    root.insertAdjacentHTML('afterbegin',`<div class="oc-summary" aria-label="订单快捷筛选"></div><form class="oc-filters">
      <label>订单类型<select name="type"><option value="">全部类型</option>${Object.entries(types).filter(([k])=>k!=='third_party'||['admin','booster'].includes(config.getRole())).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>订单状态<select name="state"></select></label><label class="oc-search">搜索<input name="search" type="search" maxlength="100" placeholder="订单号、交易号、用户或内容"></label>
      ${admin?'<label>处理顺序<select name="sort"><option value="priority">紧急程度优先</option><option value="waiting">等待最久优先</option><option value="newest">最新创建优先</option></select></label>':''}<button type="button" data-refresh>刷新</button><details class="oc-more"><summary>更多筛选</summary><div class="oc-filter-extra"><label>起始日期<input name="from" type="date"></label><label>结束日期<input name="to" type="date"></label><label>支付渠道<select name="channel"><option value="">全部渠道</option><option>支付宝</option><option>人工核实</option><option>情谊积分</option></select></label>${admin?'<label>归档记录<select name="archived"><option value="0">未归档</option><option value="1">已归档</option></select></label><button type="button" data-export>导出当前结果</button>':''}<button type="button" data-reset>重置筛选</button></div></details></form>`);
    root.insertAdjacentHTML('beforeend','<div class="oc-paging"><button type="button" data-page="-1">上一页</button><span aria-live="polite"></span><button type="button" data-page="1">下一页</button></div>');
    if(admin)root.querySelector('form').insertAdjacentHTML('afterend','<div class="oc-bulk"><label><input type="checkbox" data-select-all> 选择本页可操作订单</label><button type="button" data-bulk disabled>删除选中（0）</button><button type="button" data-trash>回收站</button><button type="button" data-cleanup>自动清理设置</button><button type="button" data-timeout>24小时超时关闭</button><span class="oc-muted">普通无资金订单在回收站保留14天；付款、凭证及核对删除记录长期保留。</span></div>');
    if(admin)root.querySelector('[data-refresh]').insertAdjacentHTML('afterend','<button type="button" data-show-metrics>经营指标</button>');
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
      else if(b.hasAttribute('data-show-metrics'))showMetrics();
      else if(b.hasAttribute('data-trash')){p.filters.trash=p.filters.trash==='1'?'0':'1';p.filters.state='';p.filters.task='';p.filters.page=1;statusOptions(scope);load(scope);}
      else if(b.hasAttribute('data-cleanup'))showCleanup();
      else if(b.hasAttribute('data-timeout'))showTimeout();
      else if(b.hasAttribute('data-bulk')){const action=p.filters.trash==='1'?'restore':'remove';detail={batch:p.rows.filter(o=>p.selected.has(o.order_type+':'+o.order_ref))};detailScope='admin';++detailGeneration;modal.style.display='flex';$('ocDetailTitle').textContent=`${actionNames[action]} · ${detail.batch.length} 条`;$('ocDetailBody').innerHTML='<div id="ocActionForm"></div><p id="ocActionMessage" role="status"></p>';$('ocDetailActions').innerHTML='';reasonForm(action);}
      else if(b.hasAttribute('data-reset')) {p.filters={type:'',state:admin?'todo':'',task:'',search:'',from:'',to:'',channel:'',archived:'0',trash:'0',sort:admin?'priority':'newest',page:1};root.querySelector('form').reset();statusOptions(scope);load(scope);}
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
  async function cleanupAction(run){if(busy)return;const enabled=$('ocCleanupEnabled').checked,days=Number($('ocCleanupDays').value);if(run&&!$('ocCleanupConfirm').checked){$('ocActionMessage').textContent='请先勾选确认清理预览';return;}setBusy(true);try{
    if(run){const current=await request('/order-center/cleanup?scope=admin');if(current.settings.enabled!==enabled||current.settings.retention_days!==days)throw new Error('规则已修改，请先保存并刷新预览');const result=await request('/order-center/cleanup/run?scope=admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'MOVE_INVALID_ORDERS_TO_TRASH'})});config.onToast(`已清理 ${result.removed} 条，跳过 ${result.skipped} 条`);load('admin');load('user');}
    else{await request('/order-center/cleanup?scope=admin',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled,retention_days:days})});config.onToast('清理规则已保存');}
    await showCleanup();
  }catch(err){$('ocActionMessage').textContent=err.message;}finally{setBusy(false);}}
  async function showTimeout(){modal.style.display='flex';const generation=++detailGeneration;detailScope='admin';timeoutPreview=[];$('ocDetailTitle').textContent='24小时未付款订单关闭';$('ocDetailActions').innerHTML='';$('ocDetailBody').innerHTML='<p>正在核对候选订单及积分流水…</p>';
    try{const data=await request('/order-center/timeout?scope=admin');if(generation!==detailGeneration)return;timeoutPreview=data.candidates;
      $('ocDetailBody').innerHTML=`<p>关闭超过24小时未提交付款凭证、未接单的代练及租号订单。按匹配的原始扣减流水退回积分；付款审核、凭证、其他资金流水及历史积分不一致的订单保留。关闭后可归档或删除到回收站，资金流水始终保留。</p><label><input id="ocTimeoutEnabled" type="checkbox" ${data.settings.enabled?'checked':''}> 开启每小时自动检查（默认关闭；开启后也会处理历史候选订单）</label><button type="button" data-save-timeout>保存超时关闭开关</button><h4>本次可关闭 ${timeoutPreview.length} 条${timeoutPreview.length===data.limit?'（本次上限200条）':''}</h4><ul class="oc-cleanup-preview">${timeoutPreview.map(o=>`<li>${esc(types[o.type])} · ${esc(o.ref)} · ${time(o.created_at)}</li>`).join('')||'<li>没有符合条件的订单</li>'}</ul><label><input id="ocTimeoutConfirm" type="checkbox"> 已核对上方订单，立即关闭本次预览订单并退回匹配积分</label><button type="button" data-run-timeout ${timeoutPreview.length?'':'disabled'}>关闭本次预览订单</button><p id="ocActionMessage" role="status"></p>`;
    }catch(err){if(generation===detailGeneration)$('ocDetailBody').innerHTML=`<p role="alert">${esc(err.message)}</p>`;}}
  async function timeoutAction(run){if(busy)return;if(run&&!$('ocTimeoutConfirm').checked){$('ocActionMessage').textContent='请先确认已核对预览订单';return;}setBusy(true);try{
    const result=await request(`/order-center/timeout${run?'/run':''}?scope=admin`,{method:run?'POST':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(run?{confirmation:'CLOSE_PREVIEWED_UNPAID_ORDERS',orders:timeoutPreview.map(o=>({type:o.type,ref:o.ref}))}:{enabled:$('ocTimeoutEnabled').checked})});
    config.onToast(run?`已关闭 ${result.closed} 条，跳过 ${result.skipped} 条`:'超时关闭设置已保存');if(run){load('admin');load('user');config.onBalanceRefresh?.();}await showTimeout();
  }catch(err){$('ocActionMessage').textContent=err.message;}finally{setBusy(false);}}
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
      p.list.innerHTML=data.orders.length ? data.orders.map(o=>`<article class="oc-card"><div class="oc-card-top"><span class="oc-type">${types[o.order_type]}</span><span data-tone="${['exception','dispute'].includes(o.state)?'danger':['completed','credited'].includes(o.state)?'success':['payment_review','credit_pending','review','completion_review'].includes(o.state)?'warning':['in_progress','awaiting_assignment','accepted','active'].includes(o.state)?'info':'neutral'}" class="oc-state ${['exception','credit_pending','dispute'].includes(o.state)?'oc-warning-state':''}">${esc(o.state_label)}</span></div><h4>${esc(o.title)}</h4><div class="oc-reference">${esc(o.order_ref)}</div><div class="oc-meta"><span>${scope==='admin'?'用户：'+esc(o.customer_name):'创建：'+time(o.created_at)}</span><strong>${amount(o)}</strong></div>${scope==='admin'?`<div class="oc-meta"><span>${time(o.created_at)}</span><span>处理方：${esc(o.responsible||o.assignee_name||'待确认')}</span></div><p class="oc-wait ${o.overdue?'oc-overdue':''}">${o.waiting_basis==='stage'?'本阶段等待':'创建至今'} ${waitTime(o.waiting_hours)}${o.overdue?' · 超过提醒阈值 '+o.reminder_hours+' 小时':''}${o.priority===3?' · 优先核对':''}</p>`:''}<div class="oc-card-footer"><small>${esc(o.payment_channel)}${o.payment_reference?' · '+esc(o.payment_reference):''}</small><button type="button" data-type="${o.order_type}" data-ref="${esc(o.order_ref)}">${o.actions.length?esc(actionNames[o.actions[0]]):'查看详情'} · 详情</button></div></article>`).join('') : '<div class="oc-empty">当前筛选下没有订单，可调整类型或状态查看历史记录。</div>';
      if(p.filters.trash==='1')p.list.querySelectorAll('.oc-card').forEach((card,i)=>{const o=p.rows[i];card.insertAdjacentHTML('beforeend',`<p class="oc-trash-expiry">${o.retention_protected?"核对删除：原始记录长期保留，不自动永久删除":"14天清理期限："+esc(time(o.purge_after||new Date(new Date(o.removed_at).getTime()+14*86400000)))}</p>`);});
      const totalPages=Math.max(1,Math.ceil(data.total/25));const paging=p.root.querySelector('.oc-paging');paging.querySelector('span').textContent=`共 ${data.total} 条 · 第 ${p.filters.page} / ${totalPages} 页`;paging.querySelector('[data-page="-1"]').disabled=p.filters.page<=1;paging.querySelector('[data-page="1"]').disabled=p.filters.page>=totalPages;
      if(scope==='admin'){p.list.querySelectorAll('.oc-card').forEach((card,i)=>{const o=p.rows[i];if(o.actions.includes(p.filters.trash==='1'?'restore':'remove'))card.insertAdjacentHTML('afterbegin',`<label class="oc-select"><input type="checkbox" data-select="${esc(o.order_type+':'+o.order_ref)}" aria-label="选择订单 ${esc(o.order_ref)}">选择</label>`);});updateSelection(p);}
      const summary=p.root.querySelector('.oc-summary');
      if(scope==='admin'){const counts={todo:0,review:0,payment:0,acceptance:0,exception:0,refund:0,assignment:0,activation:0,deletion:0,all:0};data.summary.forEach(s=>{counts.all+=Number(s.total);if(s.admin_task){counts.todo+=Number(s.total);counts[s.admin_task]+=Number(s.total);}});summary.innerHTML=Object.entries({todo:'全部待办',deletion:'删除申请',review:'审核 / 派单',assignment:'已收款无人接单',activation:'待出租方确认',payment:'核实收款',acceptance:'验收',exception:'到账异常',refund:'争议 / 退款',all:'所有记录'}).map(([k,v])=>`<button type="button" data-task="${k}" class="${(p.filters.task|| (p.filters.state==='todo'?'todo':'all'))===k?'active':''}">${v} <b>${counts[k]}</b></button>`).join('');}
      else summary.innerHTML='<span>充值、代练、租号与商城兑换均在这里查看。付款和到账以服务器核实结果为准。</span>';
      if(document.body.dataset.currentSection===(scope==='admin'?'admin':'profile'))window.scrollTo({top:scroll});
    }catch(err){if(generation===p.generation)p.list.innerHTML=`<p role="alert">${esc(err.message)}，请点击刷新重试。</p>`;}finally{if(generation===p.generation)p.list.removeAttribute('aria-busy');}
  }
  function waitTime(hours){if(hours==null)return '时间未记录';const minutes=Math.max(0,Math.floor(Number(hours)*60));return minutes<60?minutes+' 分钟':Math.floor(minutes/60)+' 小时 '+minutes%60+' 分钟';}
  async function showMetrics(){
    if(config.getRole()!=='admin')return;
    modal.style.display='flex';detail=null;detailScope='admin';const generation=++detailGeneration,token=config.getToken();
    $('ocDetailTitle').textContent='近90天经营指标';$('ocDetailActions').innerHTML='<button type="button" data-show-metrics>刷新指标</button>';
    $('ocDetailBody').innerHTML='<section class="oc-operating-metrics" aria-label="经营指标"><div data-metrics>正在加载指标…</div></section>';
    const target=$('ocDetailBody').querySelector('[data-metrics]');
    try{const m=await request('/order-center/metrics?scope=admin');if(generation!==detailGeneration||token!==config.getToken())return;
      const duration=v=>v==null?'暂无有效样本':v+' 小时',percent=v=>v==null?'暂无有效样本':v+'%';
      target.innerHTML=`<div class="oc-metric-grid"><div>收款至接单平均<strong>${esc(duration(m.assignment_hours))}</strong><small>${m.assignment_samples||0} 单有时间记录</small></div><div>接单至完成平均<strong>${esc(duration(m.completion_hours))}</strong><small>${m.completion_samples||0} 单有时间记录</small></div><div>租号争议比例<strong>${esc(percent(m.dispute_rate))}</strong><small>${m.disputed_rentals||0} / ${m.paid_rentals||0} 个已核实付款租单</small></div><div>代练 / 租号复购率<strong>${esc(percent(m.repeat_rate))}</strong><small>${m.repeat_customers||0} / ${m.paying_customers||0} 位已核实付款用户</small></div></div><p class="oc-muted">统计按近90天创建的代练与租号订单；复购指期间至少2个已核实付款服务订单。耗时仅使用实际收款、接单与完成记录，缺少时间的历史订单不纳入平均值。等待提醒为内部跟进阈值，不是服务时限。</p><p>${m.assignment_hours!=null&&m.assignment_hours>=8?'优先排查派单与打手供给，收款到接单平均等待较长。':m.dispute_rate!=null&&m.dispute_rate>=10?'优先排查租号交接和规则说明，争议比例较高。':'结合等待最久的待办与服务类型判断瓶颈；完成耗时受服务内容影响，避免直接比较不同项目。'}</p>`;
    }catch(err){if(generation===detailGeneration&&token===config.getToken())target.textContent=err.message+'，请点击刷新指标重试。';}
  }
  async function copySummary(){const text=`订单号：${detail.order_ref}\n类型：${types[detail.order_type]}\n内容：${detail.order_type==='third_party'?'三方订单（交付内容请在站内查看）':detail.title}\n当前状态：${detail.state_label}\n金额：${amount(detail)}`;try{
    if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);
    else{const field=document.createElement('textarea');field.value=text;document.body.append(field);field.select();const ok=document.execCommand('copy');field.remove();if(!ok)throw Error();}
    config.onToast('已复制订单摘要（不含游戏账号和密码）');
  }catch{config.onToast('复制失败，请手动选取订单号和服务内容');}}
  function close(){modal.style.display='none';++detailGeneration;}
  function setBusy(value){
    busy=value;modal.setAttribute('aria-busy',String(value));$('ocClose').disabled=value;
    if(!value&&modal.style.display!=='none'&&!modal.contains(document.activeElement))$('ocClose').focus();
  }
  async function showDetail(order,scope='user') {
    detailScope=scope;detail=order;modal.style.display='flex';const generation=++detailGeneration;
    $('ocDetailTitle').textContent=`${types[order.order_type]} · ${order.order_ref}`;$('ocDetailBody').innerHTML='<p>正在读取订单…</p>';$('ocDetailActions').innerHTML='';
    try{const data=await request(`/order-center/${order.order_type}/${encodeURIComponent(order.order_ref)}?${new URLSearchParams(scope==='admin'?{scope:'admin'}:{})}`);if(generation!==detailGeneration)return;detail=data.order;
      const pairs=[...(detail.removed_at?[{label:'进入回收站',value:time(detail.removed_at)},{label:'14天清理期限',value:detail.retention_protected?'核对删除：原始记录长期保留，不自动永久删除':time(detail.purge_after||new Date(new Date(detail.removed_at).getTime()+14*86400000))},{label:'到期规则',value:'普通无资金订单到期永久删除，无法恢复；付款、资金流水、凭证及支付状态未确定的充值记录保留。'}]:[]),{label:'订单状态',value:detail.state_label},{label:'订单金额',value:amount(detail)},{label:'订单内容',value:detail.title},{label:'创建时间',value:time(detail.created_at)},{label:'支付渠道',value:detail.payment_channel},{label:'付款用户',value:detail.customer_name},...data.details];
      const g=data.guidance||{headline:detail.state_label,next:'可通过下方入口处理或查看记录。',responsible:detail.responsible||detail.assignee_name||'待确认',last_updated_at:detail.last_updated_at||detail.created_at,feedback:'尚未确认具体反馈时间',needs_action:false};
      const deletionInfo=detail.deletion_status?`<p class="oc-warning">删除申请：${esc(({pending:'待管理员审核',rejected:'已驳回',approved:'已同意，原始记录保留'})[detail.deletion_status]||detail.deletion_status)}<br>申请原因：${esc(detail.deletion_reason)}${detail.deletion_review_note?'<br>管理员说明：'+esc(detail.deletion_review_note):''}</p>`:'';
      const guide=`<section class="oc-guidance"><h4>${esc(g.headline)}</h4><p>${esc(g.next)}</p><dl class="oc-details"><div><dt>当前处理方</dt><dd>${esc(g.responsible)}</dd></div><div><dt>最后更新</dt><dd>${time(g.last_updated_at)}</dd></div><div><dt>${scope==='admin'?'管理员是否需要操作':'你是否需要操作'}</dt><dd>${g.needs_action?'需要，请使用下方处理入口':'暂不需要，等待处理结果'}</dd></div><div><dt>下一次反馈</dt><dd>${esc(g.feedback)}</dd></div></dl>${g.reason?`<p class="oc-warning">处理原因：${esc(g.reason)}</p>`:''}${g.delayed||detail.overdue?'<p class="oc-overdue">已触发时间提醒，请跟进处理；具体延迟原因尚需处理方确认。</p>':''}<div class="oc-guidance-actions">${detail.actions.filter(a=>!['archive','unarchive','remove','restore'].includes(a)).map(a=>`<button type="button" data-guidance-action="${a}">${actionNames[a]}</button>`).join('')}<button type="button" data-copy-summary>复制已有订单摘要</button></div></section><div id="ocActionForm"></div><p id="ocActionMessage" role="status"></p>`;
      $('ocDetailBody').innerHTML=`${guide}${deletionInfo}${data.warning?`<p class="oc-warning" role="status">${esc(data.warning)}</p>`:''}<h4>订单与交付信息</h4><dl class="oc-details">${pairs.map(p=>`<div><dt>${esc(p.label)}</dt><dd>${esc(p.value??'—')}</dd></div>`).join('')}</dl>${data.screenshot?`<h4>付款凭证</h4><a href="/uploads/${encodeURIComponent(data.screenshot)}" target="_blank" rel="noopener"><img class="oc-evidence" src="/uploads/${encodeURIComponent(data.screenshot)}" alt="付款凭证"></a>`:''}<details class="oc-history"><summary>到账与资金流水</summary>${data.ledger.length?data.ledger.map(l=>`<div class="oc-ledger"><span>${esc(({chest_tickets:'军需券',qy_credits:'情谊积分',booster_points:'打手积分',earnings:'代练收益',rental_earnings:'租号收益',balance:'账户余额'})[l.account_type]||'账户')}${l.user_name?' · '+esc(l.user_name):''}</span><strong>${Number(l.amount_delta)>0?'+':''}${esc(l.amount_delta)}</strong><small>余额 ${esc(l.balance_after)} · ${time(l.created_at)}</small></div>`).join(''):'<p class="oc-muted">暂无对应资金流水；待支付订单尚未到账。</p>'}</details><details class="oc-history"><summary>完整操作记录</summary><ol class="oc-timeline"><li><time>${time(detail.created_at)}</time><p>订单创建</p></li>${data.events.map(e=>`<li><time>${time(e.created_at)}</time><p>${esc(eventNames[e.action]||'订单状态更新')}${e.actor_name?' · '+esc(e.actor_name):''}</p>${e.note?`<small>${esc(e.note)}</small>`:''}</li>`).join('')}</ol></details>`;
      $('ocDetailActions').innerHTML=detail.actions.map((a,i)=>`<button type="button" data-action="${a}" class="${i===0?'submit-btn':''}">${actionNames[a]}</button>`).join('');
      if(!modal.contains(document.activeElement)) $('ocClose').focus();
    }catch(err){if(generation===detailGeneration)$('ocDetailBody').innerHTML=`<p role="alert">${esc(err.message)}</p><button type="button" id="ocDetailRetry">重试</button>`;}
  }
  function reasonForm(action) {
    if(['request_deletion','review_deletion','reviewed_remove'].includes(action)){
      const review=action!=='request_deletion';
      $('ocActionForm').innerHTML=`<div class="oc-reason"><p>${review?'仅移入回收站，保留原付款、余额、交付、接单和操作记录。请核对重复/测试/历史异常依据，确认无需继续履约后操作。恢复后可重新查看，后续业务或付款状态变化将使旧删除快照失效。':'填写重复提交或历史异常的原因，管理员核对后处理。提交申请不会直接删除或改变付款。'} </p>${action==='review_deletion'?'<label>审核结果<select id="ocDeletionDecision"><option value="approve">同意删除（保留记录）</option><option value="reject">驳回申请</option></select></label>':''}<label>${review?'核对说明 / 驳回原因':'申请原因'}<textarea id="ocReason" maxlength="500" rows="3"></textarea></label>${review?'<label>核对依据<input id="ocDeletionReference" maxlength="200" placeholder="重复订单号、测试记录或收款/交付核对说明"></label><label><input id="ocDeletionConfirm" type="checkbox"> 已核对当前状态，确认仅移入回收站；资金与原始记录保留，不会自动退款或撤销真实付款</label>':''}<button type="button" data-confirm="${action}">确认${actionNames[action]}</button><button type="button" data-cancel-reason>取消</button></div>`;
      $('ocReason').focus();$('ocActionForm').scrollIntoView({block:'nearest'});return;
    }
    if(action==='resolve_recharge'){
      $('ocActionForm').innerHTML='<div class="oc-reason"><p>逐笔核对实际付款和历史发券记录后选择结果。确认历史已到账仅登记核对结论，不修改余额、不补造流水；补发会查询支付宝确认真实支付成功，并使用唯一流水防止重复发券。</p><label>核对结果<select id="ocResolutionOutcome"><option value="">请选择核对结果</option><option value="test_closed">纯测试：无真实付款，且从未发券，核销关闭</option><option value="historical_credited">历史已到账：确认已经发券，只登记核对结论</option><option value="tickets_backfilled">真实已支付：确认从未发券，补发军需券</option></select></label><label>核对依据<input id="ocResolutionReference" maxlength="200" placeholder="交易记录、历史发券记录或测试记录的编号与说明"></label><label>处理原因<textarea id="ocReason" maxlength="500" rows="3"></textarea></label><label><input id="ocResolutionConfirm" type="checkbox"> 已逐笔核对付款和发券记录，确认所选结果；补发时已确认从未发券</label><button type="button" data-confirm="resolve_recharge">确认核销</button><button type="button" data-cancel-reason>取消</button></div>';$('ocResolutionOutcome').focus();$('ocActionForm').scrollIntoView({block:'nearest'});return;
    }
    const labels={reconcile:'已查询支付宝成功，请填写重试到账说明。',boost_confirm_payment:'请核对真实收款及凭证后填写说明。',boost_dispatch:'确认将已收款订单放入接单大厅？',archive:'归档后管理员默认列表隐藏，用户仍能查看订单。',unarchive:'请填写恢复归档的原因。'};
    labels.cancel_unpaid='取消尚未付款、未提交凭证且未接单的订单；按原始扣减流水退回积分。含其他资金或付款记录的订单不会取消。';
    Object.assign(labels,{remove:'确认将订单移入回收站？普通无资金订单满14天后永久删除，无法恢复，请及时恢复需要保留的订单。付款、资金流水、凭证和支付状态未确定的充值记录保留。未完成的租号订单须先取消。',restore:'确认恢复到订单中心？请填写恢复原因。'});
    $('ocActionForm').innerHTML=`<div class="oc-reason"><p>${labels[action]}</p>${action==='boost_dispatch'?'':'<label>操作说明<textarea id="ocReason" maxlength="500" rows="3" placeholder="填写核对结果或操作原因"></textarea></label>'}<button type="button" data-confirm="${action}">确认${actionNames[action]}</button><button type="button" data-cancel-reason>取消</button></div>`;$('ocReason')?.focus();$('ocActionForm').scrollIntoView({block:'nearest'});
  }
  async function perform(action) {
    if(busy)return;
    const order=detail,scope=detailScope,ref=encodeURIComponent(order.order_ref);
    if(['request_deletion','review_deletion','reviewed_remove'].includes(action)){
      setBusy(true);try{const reason=$('ocReason')?.value.trim();if(!reason)throw Error('请填写原因');
        let body={reason},path=`/order-center/${order.order_type}/${ref}/deletion-request`;
        if(action!=='request_deletion'){const decision=action==='reviewed_remove'?'remove':$('ocDeletionDecision').value;
          if(decision!=='reject'&&!$('ocDeletionConfirm').checked)throw Error('请确认已核对并保留原始记录');
          body={reason,decision,reference:$('ocDeletionReference').value.trim(),confirmation:$('ocDeletionConfirm').checked?'REVIEWED_REMOVAL_RETAINS_ALL_RECORDS':'',expected_state:order.state,expected_payment_status:order.payment_status||''};
          path=`/order-center/${order.order_type}/${ref}/deletion-review?scope=admin`;
        }
        const result=await request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        config.onToast(action==='request_deletion'?'删除申请已提交，等待管理员审核':result.removed?'订单已移入回收站，原始记录保留':'删除申请已驳回');
        await showDetail(order,scope);load(scope);config.onDeletionRefresh?.();
      }catch(err){$('ocActionMessage').textContent=err.message;}finally{setBusy(false);}return;
    }
    if(action==='boost_payment'){close();config.onBoostPayment(order.order_ref);return;}
    if(action==='rental_manage'||action==='third_party_manage'){close();config.onManage(order,scope);return;}
    // Reserve the payment window during the user's click, before awaiting the network.
    const paymentWindow=action==='pay'?window.open('','ocPayment'):null;
    if(paymentWindow)paymentWindow.document.body.textContent='正在打开原充值订单的支付页面…';
    setBusy(true);$('ocDetailActions').querySelectorAll('button').forEach(b=>b.disabled=true);
    try {
      if(action==='pay'){
        const res=await fetch(`${config.apiBase}/chest/payments/${ref}/pay`,{method:'POST',headers:{Authorization:`Bearer ${config.getToken()}`}});
        if(!res.ok)throw new Error((await res.json()).error);
        const parsed=new DOMParser().parseFromString(await res.text(),'text/html');const original=parsed.querySelector('form');if(!original)throw new Error('支付页面未返回有效表单');
        const url=new URL(original.action);if(url.protocol!=='https:'|| !/^(openapi|openapi-sandbox|mapi)\.alipay\.com$/.test(url.hostname))throw new Error('支付地址异常');
        const form=document.createElement('form');form.action=url.href;form.method='POST';form.target=paymentWindow?'ocPayment':'_self';original.querySelectorAll('input[name]').forEach(input=>{const field=document.createElement('input');field.type='hidden';field.name=input.name;field.value=input.value;form.appendChild(field);});document.body.appendChild(form);form.submit();form.remove();config.onToast('支付后回到订单详情，点击刷新到账状态');
      }else{
        const reason=$('ocReason')?.value.trim()||'';
        if(['reconcile','boost_confirm_payment','archive','unarchive','remove','restore','cancel_unpaid','resolve_recharge','request_deletion','review_deletion','reviewed_remove'].includes(action)&&!reason)throw new Error('请填写操作说明');
        if(['remove','restore'].includes(action)){const orders=(order.batch||[order]).map(o=>({type:o.order_type,ref:o.order_ref}));const result=await request('/order-center/removals?scope=admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orders,reason,action})});const failures=result.results.filter(r=>!r.success);config.onToast(`已${action==='remove'?'删除':'恢复'} ${result.success_count} 条${failures.length?'，失败 '+failures.length+' 条':''}`);load(scope);load('user');if(failures.length){$('ocActionMessage').textContent=failures.map(r=>`${r.ref}：${r.error}`).join('；');}else close();return;}
        let path,method='POST',body;
        if(action==='refresh')path=`/chest/payments/${ref}/refresh`;
        if(action==='provider'){path=`/admin/chest/payments/${ref}/provider-status`;method='GET';}
        if(action==='reconcile'){path=`/admin/chest/payments/${ref}/reconcile`;body={confirmation:'RECONCILE_SIGNED_ALIPAY_PAYMENT',reason};}
        if(action==='boost_confirm_payment'){path=`/admin/orders/${ref}/confirm-payment`;method='PUT';body={reason};}
        if(action==='boost_dispatch'){path=`/admin/orders/${ref}/hall`;method='PUT';}
        if(['archive','unarchive'].includes(action)){path=`/order-center/${order.order_type}/${ref}/archive?scope=admin`;body={action,reason};}
        if(action==='cancel_unpaid'){path=`/order-center/${order.order_type}/${ref}/cancel-unpaid`;body={reason};}
        if(action==='resolve_recharge'){if(!$('ocResolutionConfirm').checked)throw new Error('请确认已核对付款和发券记录');path=`/order-center/recharge/${ref}/resolve?scope=admin`;body={reason,outcome:$('ocResolutionOutcome').value,reference:$('ocResolutionReference').value.trim(),confirmation:'REVIEWED_PAYMENT_AND_TICKETS'};}
        const result=await request(path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
        config.onToast(action==='cancel_unpaid'?`订单已取消${result.refunded_credits?'，退回 '+result.refunded_credits+' 积分':''}`:action==='resolve_recharge'?'历史异常已核销，请查看核对结果':result.found===false?'支付平台尚未查到成功交易，请稍后刷新':'订单已重新核实');
        await showDetail(order,scope);load(scope);config.onTicketRefresh();if(action==='cancel_unpaid')config.onBalanceRefresh?.();
      }
    }catch(err){if(paymentWindow)paymentWindow.close();const msg=$('ocActionMessage');if(msg)msg.textContent=err.message;else config.onToast(err.message);}
    finally{setBusy(false);$('ocDetailActions').querySelectorAll('button').forEach(b=>b.disabled=false);}
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
    modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('#ocClose')){if(!busy)close();return;}const b=e.target.closest('button');if(!b||busy)return;if(e.target.id==='ocDetailRetry')showDetail(detail,detailScope);if(b.hasAttribute('data-show-metrics')){showMetrics();return;}if(b.hasAttribute('data-save-cleanup')){cleanupAction(false);return;}if(b.hasAttribute('data-run-cleanup')){cleanupAction(true);return;}if(b.hasAttribute('data-save-timeout')){timeoutAction(false);return;}if(b.hasAttribute('data-run-timeout')){timeoutAction(true);return;}if(b.hasAttribute('data-copy-summary')){copySummary();return;}const action=b.dataset.action||b.dataset.guidanceAction;if(action){if(['reconcile','boost_confirm_payment','boost_dispatch','archive','unarchive','remove','restore','cancel_unpaid','resolve_recharge','request_deletion','review_deletion','reviewed_remove'].includes(action))reasonForm(action);else perform(action);}if(b.dataset.confirm)perform(b.dataset.confirm);if(b.hasAttribute('data-cancel-reason'))$('ocActionForm').innerHTML='';});
    $('rechargeOrdersBtn')?.addEventListener('click',()=>{config.onOpenOrders();selectType('recharge');});
    const returned=new URLSearchParams(location.search).get('out_trade_no');
    if(config.getToken()&&/^RC\d{13}[a-f0-9]{10}$/i.test(returned||'')){config.onOpenOrders();selectType('recharge');showDetail({order_type:'recharge',order_ref:returned});}
  }
  global.OrderCenter={init,load,createRecharge,showDetail,selectType};
})(window);
