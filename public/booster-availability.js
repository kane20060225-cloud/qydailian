(function(global){
  'use strict';
  let config,state,adminRows=[],dirty=false,busy=false,generation=0,sessionToken;
  const $=id=>document.getElementById(id),days=['周一','周二','周三','周四','周五','周六','周日'];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'无固定时间';
  const sources={manual:'手动模式',auto:'自动排班',temporary:'临时状态',admin:'管理员暂停'};
  const reminders={ready:'正常接收企业微信新单提醒',offline:'当前离线，暂停企业微信新单提醒',unbound:'尚未绑定企业微信',app_disabled:'企业微信应用尚未启用',preferences_disabled:'新单提醒或企业微信通知开关已关闭'};
  async function api(path,body){
    const token=config.getToken();if(!token)throw Error('请先登录');
    const response=await fetch(config.apiBase+path,{method:body?'PUT':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    let data;try{data=await response.json();}catch{throw Error('状态服务暂不可用');}
    if(!response.ok)throw Error(data.error||'状态服务暂不可用');return data;
  }
  function renderCard(){
    if(!state)return;
    $('boosterAvailabilityCard').innerHTML=`<div class="availability-heading"><div><span class="availability-label">工作状态</span><h3 class="availability-status ${state.online?'is-online':''}">${state.online?'● 当前在线':'● 当前离线'}</h3><p>${esc(sources[state.source])} · ${esc(reminders[state.reminder_status])}</p></div><div class="availability-count"><strong>${Number(state.active_orders)||0}</strong><span>进行中的订单</span></div></div>
      ${state.source==='admin'?`<p class="availability-notice">管理员暂停原因：${esc(state.admin_reason)}；${state.admin_pause_until?time(state.admin_pause_until)+'恢复':'由管理员恢复'}</p>`:''}
      ${state.source==='temporary'?`<p class="availability-notice">临时${state.online?'上线':'休息'}至 ${time(state.override_until)}，之后恢复${state.mode==='auto'?'每周排班':'原手动状态'}。</p>`:''}
      <p class="availability-next">${state.next_change?'下次'+(state.next_change.online?'上线':'下线')+'：'+time(state.next_change.at):'暂无下一次状态切换'} · 北京时间</p>
      <div class="availability-actions"><button type="button" data-availability="toggle" ${state.source==='admin'?'disabled':''}>${state.online?'立即下线':'立即上线'}</button><label>临时持续 <select id="availabilityDuration"><option value="2">2小时</option><option value="4">4小时</option><option value="8">8小时</option><option value="today">今天结束</option></select></label><button type="button" data-availability="temporary-online" ${state.source==='admin'?'disabled':''}>临时上线</button><button type="button" data-availability="rest">今日休息</button>${state.source==='temporary'?'<button type="button" data-availability="resume">恢复原模式</button>':''}<button type="button" data-availability="schedule">调整排班</button><button type="button" data-availability="notifications">通知设置</button><button type="button" data-availability="refresh">刷新状态</button></div>
      <p class="field-help">上线表示愿意接收新单提醒，关闭网页仍有效。离线不影响已接订单；上线后可在大厅查看现有订单，不会补发离线期间的新单邀请。</p>`;
  }
  async function refresh(){
    if(!config)return;const version=++generation,token=config.getToken();
    if(token!==sessionToken){sessionToken=token;state=null;dirty=false;$('boosterScheduleContent').innerHTML='';}
    try{const value=await api('/booster/availability');if(version!==generation||token!==config.getToken())return;state=value;renderCard();
      if(!$('boosterScheduleForm')&&$('booster-availability').style.display!=='none')renderSchedule();
    }catch(err){if(version===generation)$('boosterAvailabilityCard').innerHTML=`<p role="alert">${esc(err.message)}</p><button type="button" data-availability="refresh">重试</button>`;}
  }
  async function update(body){
    if(busy)return;busy=true;++generation;const token=config.getToken();
    document.querySelectorAll('#boosterAvailabilityCard button,#boosterScheduleForm button').forEach(b=>b.disabled=true);
    try{const value=await api('/booster/availability',body);if(token!==config.getToken())return;state=value;renderCard();if(body.action==='configure'){dirty=false;renderSchedule();}config.onToast('工作状态已更新');}
    catch(err){config.onToast(err.message);renderCard();}
    finally{busy=false;document.querySelectorAll('#boosterScheduleForm button').forEach(b=>b.disabled=false);}
  }
  function slotHTML(slot={start:'18:00',end:'23:00'}){return `<div class="availability-slot"><label>上线 <input type="time" data-slot="start" value="${esc(slot.start)}" required></label><span>—</span><label>下线 <input type="time" data-slot="end" value="${esc(slot.end)}" required></label><button type="button" data-remove-slot aria-label="删除此时段">×</button></div>`;}
  function renderSchedule(){
    if(!state)return;
    $('boosterScheduleContent').innerHTML=`<form id="boosterScheduleForm" class="availability-schedule card"><div><h3>上下线设置</h3><p class="field-help">北京时间；最多每天四个时段。结束时间早于开始时间表示次日下线，重叠时段会合并。</p></div><div class="availability-mode"><label>控制方式 <select name="mode"><option value="manual" ${state.mode==='manual'?'selected':''}>手动模式</option><option value="auto" ${state.mode==='auto'?'selected':''}>自动排班</option></select></label><label><input type="checkbox" name="manual_online" ${state.manual_online?'checked':''}> 手动模式默认上线</label></div><div class="availability-copy"><button type="button" data-copy="all">周一时段应用到每天</button><button type="button" data-copy="weekdays">应用到工作日，周末休息</button></div><div id="availabilityWeek">${days.map((day,i)=>`<div class="availability-day" data-day="${i}"><strong>${day}</strong><div class="availability-slots">${state.weekly_schedule[i].map(slotHTML).join('')}</div><button type="button" data-add-slot>+ 时段</button></div>`).join('')}</div><p class="field-help">未设置时段的日期为休息日。保存后结束当前临时状态，按新的设置工作；管理员暂停仍然有效。</p><p id="availabilityFormMessage" role="status"></p><button type="submit" class="submit-btn">保存工作设置</button></form><details class="availability-history"><summary>最近状态操作记录</summary><div id="ownAvailabilityEvents"></div></details>`;
    const form=$('boosterScheduleForm');
    form.addEventListener('input',()=>dirty=true);
    form.addEventListener('click',event=>{
      const add=event.target.closest('[data-add-slot]'),remove=event.target.closest('[data-remove-slot]'),copy=event.target.closest('[data-copy]');
      if(add){const slots=add.closest('[data-day]').querySelector('.availability-slots');if(slots.children.length>=4)return config.onToast('每天最多四个时段');slots.insertAdjacentHTML('beforeend',slotHTML());dirty=true;}
      if(remove){remove.closest('.availability-slot').remove();dirty=true;}
      if(copy){const monday=collectSchedule()[0];document.querySelectorAll('[data-day]').forEach((el,i)=>el.querySelector('.availability-slots').innerHTML=(copy.dataset.copy==='weekdays'&&i>=5?[]:monday).map(slotHTML).join(''));dirty=true;}
    });
    form.addEventListener('submit',event=>{event.preventDefault();const weekly=collectSchedule();if(weekly.some(day=>day.some(s=>!s.start||!s.end||s.start===s.end))){$('availabilityFormMessage').textContent='开始和结束时间必须有效且不同';return;}
      if(form.elements.mode.value==='auto'&&!weekly.some(day=>day.length)){$('availabilityFormMessage').textContent='自动模式至少设置一个上线时段';return;}
      update({action:'configure',mode:form.elements.mode.value,manual_online:form.elements.manual_online.checked,weekly_schedule:weekly});
    });
    $('boosterScheduleContent').querySelector('details').addEventListener('toggle',async event=>{if(event.target.open)await renderEvents('/booster/availability/events',$('ownAvailabilityEvents'));});
  }
  function collectSchedule(){return Array.from(document.querySelectorAll('#availabilityWeek [data-day]')).map(day=>Array.from(day.querySelectorAll('.availability-slot')).map(slot=>({start:slot.querySelector('[data-slot="start"]').value,end:slot.querySelector('[data-slot="end"]').value})));}
  async function showSchedule(){if(!state)await refresh();if(!$('boosterScheduleForm'))renderSchedule();}
  function summarySchedule(row){return row.weekly_schedule.map((slots,i)=>slots.length?days[i]+' '+slots.map(s=>s.start+'—'+(s.end<s.start?'次日':'')+s.end).join('、'):'').filter(Boolean).join('；')||'尚未设置排班';}
  function renderAdmin(){
    const root=$('adminBoostersList'),q=($('availabilitySearch')?.value||'').toLowerCase(),status=$('availabilityFilter')?.value||'',mode=$('availabilityModeFilter')?.value||'',identity=$('availabilityIdentityFilter')?.value||'';
    const rows=adminRows.filter(row=>(!q||row.username.toLowerCase().includes(q))&&(!status||(status==='online'?row.online:status==='offline'?!row.online:!row.wecom_bound))&&(!mode||row.mode===mode)&&(!identity||row.booster_identity===identity));
    $('availabilityAdminSummary').textContent=`全部 ${adminRows.length} · 在线 ${adminRows.filter(r=>r.online).length} · 离线 ${adminRows.filter(r=>!r.online).length} · 未绑定企业微信 ${adminRows.filter(r=>!r.wecom_bound).length}`;
    $('availabilityAdminCards').innerHTML=rows.length?rows.map(row=>`<article class="availability-admin-card card"><div class="availability-heading"><h3>${esc(row.username)}${row.role==='admin'?' <small>管理员</small>':''}</h3><span class="availability-status ${row.online?'is-online':''}">${row.online?'● 在线':'● 离线'}</span></div><div class="availability-admin-meta"><span>${esc(sources[row.source])}</span><span>进行中 ${row.active_orders} 单</span><span>企业微信${row.wecom_bound?'已绑定':'未绑定'}</span><span>积分 ${Number(row.booster_points)||0}</span></div><p>${row.next_change?'下次'+(row.next_change.online?'上线':'下线')+' '+time(row.next_change.at):'暂无下一次切换'}</p><details><summary>每周排班</summary><p>${esc(summarySchedule(row))}</p></details>${row.source==='admin'?`<p class="availability-notice">暂停：${esc(row.admin_reason)} · ${row.admin_pause_until?time(row.admin_pause_until)+'恢复':'手动恢复'}</p>`:''}<div class="availability-actions"><label>身份组 <select class="booster-identity-select" data-userid="${row.id}">${[['gold','金牌'],['silver','银牌'],['standard','标准'],['budget','特惠']].map(([key,label])=>`<option value="${key}" ${row.booster_identity===key?'selected':''}>${label}</option>`).join('')}</select></label><button type="button" data-identity="${row.id}">更新身份</button><button type="button" data-pause="${row.id}" data-paused="${row.source==='admin'}">${row.source==='admin'?'恢复接单提醒':'暂停接单提醒'}</button><button type="button" data-events="${row.id}">操作记录</button></div><div class="availability-pause-form" id="availabilityPause${row.id}" hidden></div><div class="availability-history" id="availabilityEvents${row.id}" hidden></div></article>`).join(''):'<p>没有符合筛选条件的打手</p>';
    void root;
  }
  async function loadAdmin(){
    const root=$('adminBoostersList');root.innerHTML='<p>正在读取打手工作状态…</p>';
    try{adminRows=await api('/admin/booster-availability');root.innerHTML=`<h3>打手工作与提醒管理</h3><p id="availabilityAdminSummary" class="availability-summary"></p><div class="availability-filters"><label>搜索 <input id="availabilitySearch" placeholder="打手用户名"></label><label>当前状态 <select id="availabilityFilter"><option value="">全部</option><option value="online">在线</option><option value="offline">离线</option><option value="unbound">未绑定企业微信</option></select></label><label>控制方式 <select id="availabilityModeFilter"><option value="">全部</option><option value="manual">手动</option><option value="auto">自动</option></select></label><label>身份组 <select id="availabilityIdentityFilter"><option value="">全部</option><option value="gold">金牌</option><option value="silver">银牌</option><option value="standard">标准</option><option value="budget">特惠</option></select></label><button type="button" data-admin-refresh>刷新</button></div><div id="availabilityAdminCards" class="availability-admin-grid"></div>`;renderAdmin();root.querySelectorAll('input,select').forEach(el=>{if(!el.closest('#availabilityAdminCards'))el.addEventListener('input',renderAdmin);});}
    catch(err){root.innerHTML=`<p role="alert">${esc(err.message)}</p><button type="button" data-admin-refresh>重试</button>`;}
  }
  async function renderEvents(endpoint,root){root.innerHTML='正在读取…';try{const rows=await api(endpoint);const names={configure:'修改工作设置',temporary:'临时上下线',resume:'恢复原模式',admin_pause:'管理员暂停',admin_resume:'管理员恢复',take_online:'接单并上线'};root.innerHTML=rows.length?rows.map(row=>{let detail={};try{detail=JSON.parse(row.detail);}catch{}return `<p>${time(row.created_at)} · ${esc(names[row.action]||row.action)}${row.actor_name?' · '+esc(row.actor_name):''}${detail.admin_reason?' · '+esc(detail.admin_reason):''}${detail.override_online!==undefined&&detail.override_online!==null?' · '+(detail.override_online?'上线':'下线'):''}${detail.mode?' · '+esc(sources[detail.mode]):''}</p>`;}).join(''):'暂无状态操作';}catch(err){root.textContent=err.message;}}
  async function prepareTake(){const value=await api('/booster/availability');state=value;if(value.online)return {go_online:false};if(value.source==='admin')return confirm('管理员已暂停你的新单提醒。仍然主动接下这个订单？')?{go_online:false}:null;return confirm('你当前离线。接下这个订单并临时上线2小时？')?{go_online:true}:null;}
  function init(options){
    if(config)return;config=options;
    $('boosterAvailabilityCard').addEventListener('click',async event=>{
      const button=event.target.closest('[data-availability]');if(!button||busy)return;const action=button.dataset.availability;
      if(action==='refresh')return refresh();if(action==='notifications')return config.onSettings();
      if(action==='schedule')return document.querySelector('.booster-tab[data-tab="booster-availability"]').click();
      if(!state)return;
      if(action==='toggle'){if(state.mode==='manual'&&state.source!=='temporary')return update({action:'configure',mode:'manual',manual_online:!state.online,weekly_schedule:state.weekly_schedule});return update({action:'temporary',online:!state.online,...(state.online?{until:'today'}:{hours:2})});}
      if(action==='rest')return update({action:'temporary',online:false,until:'today'});
      if(action==='resume')return update({action:'resume'});
      const duration=$('availabilityDuration').value;return update({action:'temporary',online:true,...(duration==='today'?{until:'today'}:{hours:Number(duration)})});
    });
    $('adminBoostersList').addEventListener('click',async event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.hasAttribute('data-admin-refresh'))return loadAdmin();
      if(button.dataset.identity){await config.onIdentity(Number(button.dataset.identity));return loadAdmin();}
      if(button.dataset.events){const root=$('availabilityEvents'+button.dataset.events);root.hidden=!root.hidden;if(!root.hidden)await renderEvents('/admin/booster-availability/'+button.dataset.events+'/events',root);return;}
      if(button.dataset.pause){const id=button.dataset.pause,root=$('availabilityPause'+id);root.hidden=!root.hidden;
        root.innerHTML=button.dataset.paused==='true'?`<p>恢复后按打手自己的排班或手动状态接收提醒。</p><button type="button" data-confirm-pause="${id}" data-resume="true">确认恢复提醒</button>`:`<label>暂停原因 <input maxlength="200" data-pause-reason placeholder="请填写原因"></label><label>恢复时间 <select data-pause-hours><option value="2">2小时后</option><option value="8">8小时后</option><option value="24">24小时后</option><option value="">由管理员恢复</option></select></label><button type="button" data-confirm-pause="${id}">确认暂停提醒</button>`;return;}
      if(button.dataset.confirmPause){const id=button.dataset.confirmPause,root=$('availabilityPause'+id),resume=button.dataset.resume==='true';button.disabled=true;try{await api('/admin/booster-availability/'+id,{paused:!resume,reason:resume?'':root.querySelector('[data-pause-reason]').value,hours:resume?null:Number(root.querySelector('[data-pause-hours]').value)||null});config.onToast(resume?'提醒已恢复':'接单提醒已暂停');await loadAdmin();}catch(err){config.onToast(err.message);button.disabled=false;}}
    });
    setInterval(()=>{
      if(document.body.dataset.currentSection==='booster'&&!busy)refresh();
      if(document.body.dataset.currentSection==='admin'&&$('adminBoostersSection').style.display!=='none'&&$('availabilityAdminCards')&&!document.querySelector('.availability-pause-form:not([hidden])')){
        api('/admin/booster-availability').then(rows=>{adminRows=rows;if($('availabilityAdminCards'))renderAdmin();}).catch(()=>{});
      }
    },60000);
    global.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  }
  function canLeave(){return !dirty||confirm('上下线排班尚未保存，确定离开？');}
  function leave(){if(dirty){dirty=false;$('boosterScheduleContent').innerHTML='';}}
  global.BoosterAvailability={init,refresh,showSchedule,loadAdmin,prepareTake,canLeave,leave};
})(window);
