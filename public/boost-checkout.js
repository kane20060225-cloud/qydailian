(function (global) {
  'use strict';
  const key = 'qy.boost.services.v1';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let config, step = 1, submitted = null;
  const radio = name => document.querySelector(`input[name="${name}"]:checked`)?.value;
  function save() {
    // Keep a draft for dynamically added projects until the authoritative catalog loads.
    if(global.ServiceContent&&!global.ServiceContent.ready)return;
    // Strict allowlist: never persist account credentials, password, UID or remarks.
    const draft = {version:1, quantity:Number($('quantityInput').value), urgent:$('urgentCheckbox').checked};
    ['project','detail','player','clientType'].forEach(name => draft[name] = radio(name));
    try { localStorage.setItem(key, JSON.stringify(draft)); } catch {}
  }
  function restore() {
    try {
      const draft = JSON.parse(localStorage.getItem(key));
      if (!draft || draft.version !== 1) return;
      ['project','detail','player','clientType'].forEach(name => {
        const input = [...document.querySelectorAll(`input[name="${name}"]`)].find(r => r.value === draft[name]);
        if (input) input.checked = true;
      });
      if (Number.isInteger(draft.quantity) && draft.quantity >= 1 && draft.quantity <= 99) $('quantityInput').value = draft.quantity;
      $('urgentCheckbox').checked = draft.urgent === true;
      $('boostDraftHint').textContent = '已恢复服务选项和数量。游戏信息需要重新填写，密码不会保存到草稿。';
    } catch {}
  }
  function validate(target) {
    if(target>=2&&global.ServiceContent&&!global.ServiceContent.ready){config.toast('请先加载最新的项目与价格');global.ServiceContent.load();return false;}
    if (target >= 2 && !config.selection().valid) { config.toast('请选择服务方案'); return false; }
    if (target >= 3) {
      for (const id of ['gameAccount','gamePassword']) {
        const field = $(id);
        if (!field.value.trim()) {
          setStep(2, false); field.setCustomValidity(id === 'gameAccount' ? '请填写游戏账号' : '请填写游戏密码');
          field.reportValidity(); field.focus(); return false;
        }
        field.setCustomValidity('');
      }
    }
    return true;
  }
  function setStep(next, check = true) {
    if (check && !validate(next)) return false;
    step = next;
    const cards = [...document.querySelectorAll('.boost-form > .card')];
    cards.forEach((card, i) => card.hidden = (i < 4 ? 1 : i < 7 ? 2 : 3) !== step);
    document.querySelectorAll('.boost-progress span').forEach((item,i) => {
      item.classList.toggle('active', i + 1 === step);
      item.classList.toggle('completed', i + 1 < step);
      if (i + 1 === step) item.setAttribute('aria-current','step'); else item.removeAttribute('aria-current');
    });
    $('boostPrevious').hidden = step === 1;
    $('boostNext').hidden = step === 3;
    $('boostNext').textContent = step === 1 ? '下一步：填写信息' : '下一步：确认订单';
    $('submitOrderBtn').hidden = step !== 3;
    $('boostStepTitle').textContent = ['选择服务','填写游戏信息','确认订单'][step - 1];
    sync();
    return true;
  }
  function sync() {
    if (!config) return;
    const s = config.selection();
    if ($('useCreditsInput').value) $('useCreditsInput').value = s.credits;
    $('discountAmount').textContent = `¥${(s.credits / 100).toFixed(2)}`;
    $('boostMobileTotal').textContent = `¥${s.total.toFixed(2)}`;
    $('boostReview').innerHTML = `<dl class="oc-details"><div><dt>服务</dt><dd>${esc(s.project)} · ${esc(s.detail)}</dd></div><div><dt>数量与打手</dt><dd>${s.quantity} 份 · ${esc(s.player)}</dd></div><div><dt>客户端</dt><dd>${esc(radio('clientType'))}</dd></div><div><dt>游戏账号</dt><dd>${esc($('gameAccount').value || '尚未填写')}</dd></div><div><dt>加急</dt><dd>${s.urgent ? '是（优先安排）' : '否'}</dd></div><div><dt>积分抵扣</dt><dd>${s.credits} 积分</dd></div><div><dt>应付金额</dt><dd>¥${s.total.toFixed(2)}</dd></div></dl><p>确认后生成订单，付款并上传凭证。执行时间由接单打手确认。</p><p>游戏密码已填写后仅随订单安全提交，不展示在摘要中。</p>`;
    save();
  }
  async function copyText(text) {
    try {
      if (navigator.clipboard && global.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const input = document.createElement('textarea'); input.value = text; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select();
        const ok = document.execCommand('copy'); input.remove(); if (!ok) throw Error();
      }
      config.toast('已复制已有订单摘要（不含游戏账号和密码）');
    } catch { config.toast('复制失败，可在订单详情中手动选取摘要'); }
  }
  function success(data, body) {
    submitted = {order_type:'boost', order_ref:data.order_no};
    const amount = Number(data.total_price ?? (body.total_price - body.use_credits / 100));
    const status = amount===0 ? '积分抵扣后待管理员核实' : '待付款';
    const next = amount===0 ? '无需转账，等待管理员核实积分抵扣后安排接单。' : '请付款并上传凭证，管理员核实收款后安排接单。';
    const summary = `订单号：${data.order_no}\n当前状态：${status}\n服务：${body.project} · ${body.detail}\n数量：${body.quantity}\n打手方案：${body.player_name}\n应付：¥${amount.toFixed(2)}\n下一步：${next}`;
    $('boostOrderResult').hidden = false;
    $('boostOrderResult').innerHTML = `<h3>订单提交成功</h3><p class="boost-success-reference">${esc(data.order_no)}</p><p>当前状态：${status} · ${amount===0?'由管理员处理':'由你完成下一步'}</p><p>应付金额：<strong>¥${amount.toFixed(2)}</strong></p><p>${next}不要重复提交订单。</p><p>手机号登录需要验证码协助时，请联系客服并提供已有订单号。</p><div class="boost-result-actions">${amount>0?'<button type="button" data-result="payment">付款与上传凭证</button>':''}<button type="button" data-result="detail">查看实时订单状态</button><button type="button" data-result="copy">复制已有订单摘要</button><button type="button" data-result="new">再下一单</button></div>`;
    $('boostOrderResult').querySelector('[data-result="copy"]').onclick = () => copyText(summary);
    const paymentButton=$('boostOrderResult').querySelector('[data-result="payment"]');
    if(paymentButton)paymentButton.onclick = () => config.payment(data.order_no);
    $('boostOrderResult').querySelector('[data-result="detail"]').onclick = () => global.OrderCenter.showDetail(submitted);
    $('boostOrderResult').querySelector('[data-result="new"]').onclick = () => { submitted = null; $('boostOrderResult').hidden = true; document.querySelector('.boost-layout').hidden = false; $('boostCheckoutBar').hidden = false; setStep(1); };
    document.querySelector('.boost-layout').hidden = true; $('boostCheckoutBar').hidden = true;
    $('gamePassword').value = ''; $('gameAccount').value = ''; $('gameUid').value = ''; $('remarkInput').value = '';
    config.refreshBalance?.();
  }
  function init(options) {
    if (config) return; config = options;
    document.querySelector('.boost-progress').insertAdjacentHTML('afterend','<h3 id="boostStepTitle" tabindex="-1">选择服务</h3><p id="boostDraftHint">服务选项和数量自动保存。游戏信息与密码不保存到浏览器草稿。</p><section id="boostOrderResult" class="card" hidden aria-live="polite"></section>');
    document.querySelector('.boost-form').insertAdjacentHTML('beforeend','<section class="card" hidden><h3>核对后提交</h3><div id="boostReview"></div><button type="button" id="boostEditInfo">修改游戏信息</button></section>');
    document.querySelector('.boost-layout').insertAdjacentHTML('afterend','<div id="boostCheckoutBar" class="boost-checkout-bar"><div class="boost-bar-price">应付 <strong id="boostMobileTotal"></strong></div><button type="button" id="boostPrevious">上一步</button><button type="button" id="boostNext"></button></div>');
    $('boostCheckoutBar').append($('submitOrderBtn'));
    $('boostPrevious').onclick = () => setStep(Math.max(1, step - 1));
    $('boostNext').onclick = () => { if (setStep(step + 1)) { $('boostStepTitle').focus(); $('boostStepTitle').scrollIntoView({block:'start',behavior:'smooth'}); } };
    $('boostEditInfo').onclick = () => setStep(2);
    document.querySelectorAll('.boost-progress span').forEach((item,i) => {
      item.setAttribute('role','button'); item.tabIndex = 0;
      const go = () => setStep(i+1); item.onclick = go; item.onkeydown = e => { if (['Enter',' '].includes(e.key)) { e.preventDefault(); go(); } };
    });
    ['gameAccount','gamePassword'].forEach(id => $(id).addEventListener('input',()=>$(id).setCustomValidity('')));
    document.querySelector('#sectionBoost').addEventListener('input',sync);
    document.querySelector('#sectionBoost').addEventListener('change',sync);
    // Capture button-based quantity changes after their existing listeners finish.
    ['qtyMinus','qtyPlus'].forEach(id => $(id).addEventListener('click',sync));
    restore(); config.refresh(); setStep(1);
  }
  function resetForLogout(){if(!config)return;submitted=null;['gameAccount','gamePassword','gameUid','remarkInput','useCreditsInput'].forEach(id=>$(id).value='');$('availableCredits').textContent='0';$('boostOrderResult').hidden=true;document.querySelector('.boost-layout').hidden=false;$('boostCheckoutBar').hidden=false;setStep(1);config.refresh();}
  global.BoostCheckout = {init,sync,success,resetForLogout,catalogChanged:()=>{if(config&&!submitted)setStep(1,false);},selectService:()=>{if(submitted){config.toast('当前订单已提交，请先选择“再下一单”');return false;}return setStep(1,false);},canSubmit:() => !submitted && step === 3 && validate(3)};
})(window);
