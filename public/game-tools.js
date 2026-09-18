(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => root.UIRuntime.safeText(value);
  const number = value => Number(value || 0).toLocaleString('zh-CN');
  const reducedMotion = () => root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nations = { ussr: '苏联', germany: '德国', usa: '美国', china: '中国', uk: '英国', france: '法国', japan: '日本', european: '欧洲系', other: '混合系' };
  const types = { light: '轻型坦克', medium: '中型坦克', heavy: '重型坦克', td: '坦克歼击车' };
  const tiers = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  let config, initialized = false, chests = [], selectedChest, chestLoading, opening = false, revealTimer;
  let catalogue = [], excluded = new Set(), currentTank, tankAnimation, drawing = false, finishDraw, reelIndex = 3;
  let ticketRevision = 0;
  function imageUrl(value, fallback) {
    try { const url = new URL(String(value || ''), location.href); return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback; } catch { return fallback; }
  }
  function rewardIcon(name) { return /坦克|工程|概念|重战|歼击|SPHT|BZT|116|GSOR|菲利斯/i.test(name) ? '◈' : /银币|金币/.test(name) ? '◉' : /经验/.test(name) ? '✦' : '▣'; }
  function rewardArt(item) {
    const key = value => String(value).toLowerCase().replace(/[\s.\-]/g, '');
    const tank = catalogue.find(tank => key(tank.name) === key(item.item_name));
    return tank ? picture(tank) : rewardIcon(item.item_name);
  }
  function picture(tank) { return `<img class="game-tank-image" src="${esc(imageUrl(tank.image, 'images/tank-silhouette.svg'))}" alt="${esc(tank.name)}" loading="lazy" decoding="async">`; }
  async function request(route, options = {}) {
    const response = await fetch('/api' + route, { ...options, headers: { ...(config.token() ? { Authorization: 'Bearer ' + config.token() } : {}), ...options.headers }, signal: AbortSignal.timeout(25000) });
    const data = await response.json();
    if (response.status === 401) config.onUnauthorized?.();
    if (!response.ok) throw Error(data.error || '请求失败，请稍后重试');
    return data;
  }
  function feedback(message) { $('chestBuyMsg').textContent = message; $('chestBuyMsg').hidden = !message; }
  function updateBalance(tickets) { ticketRevision++; $('ticketBalance').textContent = number(tickets); }
  function beginBalanceRead() { return ticketRevision; }
  function applyBalanceRead(tickets, revision) { if (revision === ticketRevision) $('ticketBalance').textContent = number(tickets); }
  async function loadChests() {
    if (chestLoading) return chestLoading;
    const grid = $('chestGrid');
    if (!chests.length) root.UIRuntime.renderAsyncState(grid, { message: '正在加载集装箱…' });
    chestLoading = (async () => {
      try {
        const data = await request('/chest/configs');
        if (!Array.isArray(data)) throw Error('集装箱信息暂时不可用');
        chests = data;
        $('chestCount').textContent = `${chests.length} 款集装箱`;
        grid.innerHTML = chests.map(chest => `<button type="button" class="supply-chest-card" data-chest-id="${esc(chest.id)}" aria-pressed="false" aria-label="查看 ${esc(chest.name)} 的奖池"><img class="game-chest-image" src="${esc(imageUrl(chest.image, 'images/chests/chest_1.png'))}" alt="${esc(chest.name)}" loading="lazy"><strong>${esc(chest.name)}</strong><span class="chest-card-description">${esc(chest.description || '查看当前奖励配置与掉落概率。')}</span><span class="chest-card-footer"><span><b>${number(chest.price)}</b> <small>军需券</small></span><span>查看奖池 →</span></span></button>`).join('');
        if (chests.length) selectChest(selectedChest?.id && chests.some(chest => chest.id === selectedChest.id) ? selectedChest.id : chests[0].id);
        else { root.UIRuntime.renderAsyncState(grid, { kind: 'empty', message: '暂无集装箱，稍后再来看看。' }); $('chestSelectionContent').hidden = true; $('chestSelectionEmpty').hidden = false; $('chestSelectionEmpty').textContent = '集装箱上架后，可在这里查看奖池。'; }
      } catch (error) {
        $('chestCount').textContent = '加载失败';
        root.UIRuntime.renderAsyncState(grid, { kind: 'error', message: error.message, onRetry: loadChests });
        if (!selectedChest) $('chestSelectionEmpty').textContent = '请重试加载集装箱。';
      } finally { chestLoading = null; }
    })();
    return chestLoading;
  }
  function selectChest(id) {
    if (opening) return;
    selectedChest = chests.find(chest => String(chest.id) === String(id));
    if (!selectedChest) return;
    $('chestSelectionEmpty').hidden = true;
    $('chestSelectionContent').hidden = false;
    document.querySelectorAll('#chestGrid [data-chest-id]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.chestId === String(id))));
    $('selectedChestName').textContent = selectedChest.name;
    delete $('chestDetailImg').dataset.fallback;
    $('chestDetailImg').src = imageUrl(selectedChest.image, 'images/chests/chest_1.png');
    $('chestDetailImg').alt = selectedChest.name;
    $('chestDetailDesc').textContent = selectedChest.description || '选择集装箱，查看下方奖池。';
    $('chestPriceDisplay').textContent = number(selectedChest.price);
    feedback('');
    const rare = selectedChest.rare_items || [], common = selectedChest.common_rewards || [];
    const totalWeight = rare.reduce((sum, item) => sum + Number(item.weight || 0), 0);
    const row = (item, chance, quantity) => `<div class="pool-item"><span class="pool-icon" aria-hidden="true">${rewardIcon(item.item_name)}</span><span>${esc(item.item_name)}<small>${esc(quantity)}</small></span><b>${chance}%</b></div>`;
    $('chestDetailProb').innerHTML = `<div class="pool-section"><h5>稀有奖池 <span>5% 进入概率</span></h5>${rare.map(item => row(item, totalWeight ? (Number(item.weight) / totalWeight * 5).toFixed(2) : '0.00', '单次可获得 ×1')).join('') || '<p>暂无稀有奖励配置</p>'}<p class="pool-note">稀有物品显示的是单次开箱获得该物品的概率。</p></div><div class="pool-section"><h5>普通奖池 <span>95% 进入概率</span></h5>${common.map(item => row(item, Number(item.drop_chance || 0).toFixed(2), `数量 ${number(item.min_quantity)}–${number(item.max_quantity)}`)).join('') || '<p>暂无普通奖励配置</p>'}<p class="pool-note">普通物品显示进入普通奖池后的配置概率；全部未命中时，首项奖励保底。</p></div>`;
    $('buyChestBtn').disabled = false;
    $('buyChestBtn').textContent = '开启集装箱';
  }
  function rewardCards(items, inventory = false) {
    return items.map(item => `<article class="reward-card ${item.rarity === 'rare' ? 'is-rare' : ''}"><div class="reward-icon" aria-hidden="true">${rewardArt(item)}</div><span class="reward-rarity">${item.rarity === 'rare' ? '稀有奖励' : '普通奖励'}</span><h4>${esc(item.item_name)}</h4><strong>×${number(item.quantity)}</strong>${inventory ? `<details class="inventory-record"><summary>查看获取记录</summary><p>记录时间：${esc(item.obtained_at ? new Date(item.obtained_at).toLocaleString('zh-CN') : '暂无时间记录')}</p><p>来源：${esc(chests.find(chest => String(chest.id) === String(item.chest_id))?.name || '集装箱 #' + item.chest_id)}</p></details>` : ''}</article>`).join('');
  }
  function revealRewards(data, chest) {
    clearTimeout(revealTimer);
    $('chestOpeningStage').hidden = true;
    $('chestOpeningStage').classList.remove('is-revealing');
    $('chestRewards').hidden = false;
    $('chestDetailTitle').textContent = '你的开箱收获';
    $('chestRewardsSummary').textContent = `${chest.name} · 获得 ${data.rewards.length} 项奖励，已放入仓库`;
    $('chestRewardGrid').innerHTML = rewardCards(data.rewards);
    opening = false;
    $('buyChestBtn').disabled = false;
    $('buyChestBtn').textContent = '再开一箱';
    $('skipChestAnimation').onclick = null;
  }
  async function openChest() {
    if (opening || !selectedChest) return;
    if (!config.token()) { config.toast('请先登录'); return; }
    opening = true;
    const chest = selectedChest;
    feedback('');
    $('buyChestBtn').disabled = true;
    $('buyChestBtn').textContent = '正在开启…';
    $('chestDetailTitle').textContent = chest.name;
    $('chestRewards').hidden = true;
    $('chestOpeningStage').hidden = false;
    $('chestOpeningStage').classList.remove('is-revealing');
    $('chestOpeningImg').src = imageUrl(chest.image, 'images/chests/chest_1.png');
    $('chestOpeningStatus').textContent = '正在获取本次开箱结果…';
    $('skipChestAnimation').hidden = true;
    $('closeChestDetailBtn').disabled = true;
    $('chestDetailModal').style.display = 'flex';
    try {
      const data = await request('/chest/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chestId: chest.id }) });
      if (!Array.isArray(data.rewards)) throw Error('暂未收到完整结果，请查看仓库确认');
      if (data.tickets != null && Number.isFinite(Number(data.tickets))) updateBalance(data.tickets); else config.refreshTickets();
      $('closeChestDetailBtn').disabled = false;
      $('chestOpeningStatus').textContent = '集装箱已开启，准备揭晓奖励…';
      $('chestOpeningStage').classList.add('is-revealing');
      const reveal = () => revealRewards(data, chest);
      $('skipChestAnimation').hidden = reducedMotion();
      $('skipChestAnimation').onclick = reveal;
      revealTimer = setTimeout(reveal, reducedMotion() ? 0 : 1500);
    } catch (error) {
      opening = false;
      $('buyChestBtn').disabled = false;
      $('buyChestBtn').textContent = '开启集装箱';
      $('closeChestDetailBtn').disabled = false;
      $('chestDetailModal').style.display = 'none';
      feedback(error.message);
    }
  }
  async function loadInventory() {
    if (!config.token()) { config.toast('请先登录'); return; }
    $('inventoryModal').style.display = 'flex';
    $('inventorySummary').textContent = '正在整理你的收藏…';
    root.UIRuntime.renderAsyncState($('inventoryList'));
    try {
      const items = await request('/chest/inventory');
      if (!Array.isArray(items)) throw Error('仓库信息暂时不可用');
      $('inventorySummary').textContent = `${items.length} 项收藏 · ${items.filter(item => item.rarity === 'rare').length} 项稀有奖励`;
      if (!items.length) root.UIRuntime.renderAsyncState($('inventoryList'), { kind: 'empty', message: '仓库还是空的，开启集装箱后，奖励会收藏在这里。' });
      else $('inventoryList').innerHTML = `<div class="inventory-grid">${rewardCards(items, true)}</div>`;
    } catch (error) { $('inventorySummary').textContent = ''; root.UIRuntime.renderAsyncState($('inventoryList'), { kind: 'error', message: error.message, onRetry: loadInventory }); }
  }
  function pool() {
    return catalogue.filter(tank => (!$('tankTier').value || tank.tier === Number($('tankTier').value)) && (!$('tankType').value || tank.type === $('tankType').value) && (!$('tankNation').value || tank.nation === $('tankNation').value) && !excluded.has(tank.id));
  }
  function reelCard(tank) { return `<div class="tank-reel-card" data-tank-id="${esc(tank.id)}">${picture(tank)}<b>${esc(tank.name)}</b><small>${tiers[tank.tier]} 级 · ${esc(types[tank.type])}</small></div>`; }
  function offset(index) {
    const style = getComputedStyle($('tankReelWindow'));
    return -(index * (parseFloat(style.getPropertyValue('--reel-card-width')) + parseFloat(style.getPropertyValue('--reel-gap'))) + parseFloat(style.getPropertyValue('--reel-card-width')) / 2);
  }
  function preview() {
    const eligible = pool();
    $('tankPoolCount').textContent = `${eligible.length} 辆可抽选`;
    $('spinWheelBtn').disabled = !eligible.length || drawing;
    $('restoreExcludedTanks').hidden = !excluded.size;
    $('tankResultActions').hidden = !currentTank && !excluded.size;
    $('excludeTankBtn').hidden = !currentTank;
    const cards = eligible.length ? Array.from({ length: 7 }, (_, index) => eligible[index % eligible.length]) : [];
    if (currentTank && eligible.some(tank => tank.id === currentTank.id)) cards[3] = currentTank;
    $('tankReel').innerHTML = cards.map(reelCard).join('');
    reelIndex = 3;
    $('tankReel').style.transform = `translateX(${offset(reelIndex)}px)`;
    $('tankReelWindow').hidden = !eligible.length;
    $('tankPickStatus').textContent = eligible.length ? (currentTank ? `抽中 ${currentTank.name}，这把就试试它吧。` : excluded.size ? `已排除 ${excluded.size} 辆坦克，本次在当前条件内随机抽选。` : '无需设置条件，也可以直接抽选。') : '当前条件没有可选坦克，请调整条件或恢复已排除坦克。';
  }
  function showTank(tank) {
    currentTank = tank;
    $('tankRecommendation').innerHTML = `<div class="tank-result">${picture(tank)}<div><span class="game-eyebrow">下一场主角</span><h4>${esc(tank.name)}</h4><div class="tank-result-tags"><span>${tiers[tank.tier]} 级</span><span>${esc(types[tank.type])}</span><span>${esc(nations[tank.nation] || tank.nation)}</span></div></div></div>`;
    $('tankPickStatus').textContent = `抽中 ${tank.name}，这把就试试它吧。`;
    $('tankResultActions').hidden = false;
    $('excludeTankBtn').hidden = false;
    $('spinWheelBtn').textContent = '再选一次';
  }
  function setDrawing(active) {
    drawing = active;
    $('tankFilters').querySelectorAll('select, button').forEach(el => el.disabled = active);
    $('spinWheelBtn').disabled = active || !pool().length;
    $('excludeTankBtn').disabled = active;
    $('restoreExcludedTanks').disabled = active;
    $('skipTankAnimation').hidden = !active || reducedMotion();
    $('spinWheelBtn').textContent = active ? '正在抽选…' : currentTank ? '再选一次' : '帮我选一辆';
  }
  function drawTank() {
    if (drawing) return;
    const eligible = pool();
    if (!eligible.length) { preview(); return; }
    const chosen = eligible[Math.floor(Math.random() * eligible.length)];
    const sequence = Array.from({ length: 28 }, () => eligible[Math.floor(Math.random() * eligible.length)]);
    sequence[24] = chosen;
    $('tankReel').innerHTML = sequence.map(reelCard).join('');
    setDrawing(true);
    $('tankPickStatus').textContent = '坦克正在就位，即将揭晓…';
    let finished = false;
    finishDraw = () => {
      if (finished) return;
      finished = true;
      tankAnimation?.cancel(); tankAnimation = null;
      reelIndex = 24;
      $('tankReel').style.transform = `translateX(${offset(reelIndex)}px)`;
      showTank(chosen);
      setDrawing(false);
      finishDraw = null;
    };
    if (reducedMotion()) { finishDraw(); return; }
    $('tankReel').style.transform = `translateX(${offset(2)}px)`;
    tankAnimation = $('tankReel').animate([{ transform: `translateX(${offset(2)}px)` }, { transform: `translateX(${offset(24)}px)` }], { duration: 2400, easing: 'cubic-bezier(.12,.7,.15,1)', fill: 'forwards' });
    tankAnimation.onfinish = finishDraw;
  }
  function init(options) {
    config = options;
    if (initialized) return;
    initialized = true;
    catalogue = root.TankCatalog || [];
    for (const [id, values, label] of [
      ['tankTier', [...new Set(catalogue.map(tank => tank.tier))].sort((a, b) => b - a), value => tiers[value] + ' 级'],
      ['tankType', Object.keys(types), value => types[value]],
      ['tankNation', Object.keys(nations), value => nations[value]]
    ]) { for (const value of values) { const option = document.createElement('option'); option.value = value; option.textContent = label(value); $(id).appendChild(option); } }
    $('chestGrid').addEventListener('click', event => { const button = event.target.closest('[data-chest-id]'); if (button && !opening) { selectChest(button.dataset.chestId); if (root.innerWidth <= 900) $('chestSelected').scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' }); } });
    $('changeChestBtn').addEventListener('click', () => document.querySelector('#toolChestSim .supply-catalog').scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' }));
    $('buyChestBtn').addEventListener('click', openChest);
    $('inventoryBtn').addEventListener('click', loadInventory);
    $('closeInventoryBtn').addEventListener('click', () => $('inventoryModal').style.display = 'none');
    $('inventoryModal').addEventListener('click', event => { if (event.target === $('inventoryModal')) $('inventoryModal').style.display = 'none'; });
    const closeRewards = () => { if (opening && $('skipChestAnimation').onclick) $('skipChestAnimation').onclick(); if (!opening) $('chestDetailModal').style.display = 'none'; };
    $('closeChestDetailBtn').addEventListener('click', closeRewards);
    $('rewardDoneBtn').addEventListener('click', closeRewards);
    $('chestDetailModal').addEventListener('click', event => { if (event.target === $('chestDetailModal')) closeRewards(); });
    $('rewardInventoryBtn').addEventListener('click', () => { closeRewards(); loadInventory(); });
    $('tankFilters').addEventListener('submit', event => event.preventDefault());
    const changeFilters = () => { currentTank = null; $('tankRecommendation').innerHTML = '<div class="tank-result-placeholder"><span aria-hidden="true">✦</span><div><h4>条件已更新</h4><p>点击“帮我选一辆”，从新的候选范围中抽选。</p></div></div>'; $('spinWheelBtn').textContent = '帮我选一辆'; preview(); };
    $('tankFilters').addEventListener('change', changeFilters);
    $('resetTankFilters').addEventListener('click', () => { $('tankFilters').reset(); changeFilters(); });
    $('spinWheelBtn').addEventListener('click', drawTank);
    $('skipTankAnimation').addEventListener('click', () => finishDraw?.());
    $('excludeTankBtn').addEventListener('click', () => { if (!drawing && currentTank) { excluded.add(currentTank.id); changeFilters(); if (pool().length) drawTank(); } });
    $('restoreExcludedTanks').addEventListener('click', () => { if (!drawing) { excluded.clear(); changeFilters(); } });
    root.addEventListener('resize', () => { if (drawing) finishDraw?.(); else if ($('toolRandomTank').style.display !== 'none') $('tankReel').style.transform = `translateX(${offset(reelIndex)}px)`; });
    document.addEventListener('error', event => { const img = event.target; if (img.tagName !== 'IMG' || !img.closest('#toolChestSim, #toolRandomTank, .game-tool-modal')) return; const fallback = img.classList.contains('game-tank-image') ? 'images/tank-silhouette.svg' : 'images/chests/chest_1.png'; if (img.dataset.fallback) return; img.dataset.fallback = 'true'; img.src = fallback; }, true);
  }
  root.GameTools = { init, loadChests, selectChest, loadInventory, enterRandom: preview, updateBalance, beginBalanceRead, applyBalanceRead };
})(window);
