// ==================== 工具函数 ====================
function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// ==================== 安全 localStorage 封装（增强版） ====================
function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        showToast('⚠️ 浏览器存储异常，请检查空间或隐私设置');
        return false;
    }
    // 额外将 token 写入 Cookie，兼容 QQ 等 localStorage 异常的环境
    if (key === 'token') {
        try {
            document.cookie = 'token=' + encodeURIComponent(value) + '; path=/; max-age=' + (7*24*60*60) + '; SameSite=Lax';
        } catch (e2) {}
    }
    return true;
}

function safeGetItem(key, fallback = null) {
    try {
        const val = localStorage.getItem(key);
        if (val !== null) return val;
    } catch (e) {}
    // 如果 localStorage 取不到且是 token，则尝试从 Cookie 读取
    if (key === 'token') {
        const match = document.cookie.match(/(?:^|;\s*)token=([^;]*)/);
        if (match) return decodeURIComponent(match[1]);
    }
    return fallback;
}

// ==================== 快捷获取 DOM 元素 ====================
const getEl = (id) => document.getElementById(id);

// ==================== 积分抵扣相关 ====================
async function loadUserCreditsForBoost() {
  const token = safeGetItem('token');
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/user/credits`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    const el = getEl('availableCredits');
    if (el) el.textContent = data.qy_credits || 0;
  } catch (e) {}
}

function getUseCredits() {
  const input = getEl('useCreditsInput');
  return input ? parseInt(input.value) || 0 : 0;
}

// ==================== 配置 ====================
const API_BASE = '/api';

const projectDetails = {
    silver: { name:'银币', a:{desc:'有紫狗牌有高级银币/百万',price:7.8}, b:{desc:'无紫狗牌有高级银币/百万',price:10.8}, c:{desc:'无紫狗牌无高级银币/百万',price:13.8} },
    exp: { name:'单车经验', a:{desc:'有紫狗牌有高级经验/万',price:3.8}, b:{desc:'无紫狗牌有高级经验/万',price:5.8}, c:{desc:'无紫狗牌无高级经验/万',price:6.8} },
    winrate: { name:'胜率', a:{desc:'70%胜率/10场',price:17.8}, b:{desc:'75%胜率/10场',price:22.8}, c:{desc:'80%胜率/10场',price:32.8} },
    average: { name:'场均', a:{desc:'3000场均/10场',price:19.8}, b:{desc:'3300场均/10场',price:28.8}, c:{desc:'3500场均/10场',price:37.8} },
    mmedal: { name:'M章', a:{desc:'1个M章',price:29.8}, b:{desc:'3个M章',price:57.8}, c:{desc:'5个M章',price:138.8} },
    rings: { name:'三环', a:{desc:'0%到65%',price:59.8}, b:{desc:'65%到85%',price:49.8}, c:{desc:'85%到95%',price:88.8} },
    rating: { name:'评级', a:{desc:'3千到4千/百分',price:11.8}, b:{desc:'4千到5千/百分',price:14.8}, c:{desc:'5千到6千/百分',price:29.8} }
};

const identityWeights = { gold: 4, silver: 3, standard: 2, budget: 1 };
const playerData = [
    { key: 'gold',     name: '金牌打手', rate: 1.2, identity: 'gold' },
    { key: 'silver',   name: '银牌打手', rate: 1.1, identity: 'silver' },
    { key: 'standard', name: '标准打手', rate: 1.0, identity: 'standard' },
    { key: 'budget',   name: '特惠打手', rate: 0.9, identity: 'budget' }
];

const chestsConfig = [
    { id: 1, name: '美国集装箱箱',   price: 198,  image: 'images/chests/chest_1.png', desc: '经典战斗资源补给，开出强力道具。' },
    { id: 2, name: '苏联集装箱',     price: 198,  image: 'images/chests/chest_2.png', desc: '火焰主题，内含稀有坦克碎片。' },
    { id: 3, name: '顶尖捕食者集装箱', price: 498, image: 'images/chests/chest_3.png', desc: '夜战专属，高概率出全局经验。' },
    { id: 4, name: '超赞集装箱',      price: 288, image: 'images/chests/chest_4.png', desc: '雷电系列，有机会获得高级坦克。' },
    { id: 5, name: '我全都要集装箱',   price: 98,  image: 'images/chests/chest_5.png', desc: '冰雪奇缘，内含稀有银币加成。' },
    { id: 6, name: '超大集装箱',      price: 198, image: 'images/chests/chest_6.png', desc: '经典怀旧，出金币概率较高。' },
    { id: 7, name: '重坦集装箱',      price: 88,  image: 'images/chests/chest_7.png', desc: '未来科技，有极小概率出绝版坦克。' },
    { id: 8, name: '泰坦集装箱箱',    price: 388, image: 'images/chests/chest_8.png', desc: '专为狂战士打造，必出好东西。' },
    { id: 9, name: '赛季集装箱',      price: 588, image: 'images/chests/chest_9.png', desc: '传奇级别，概率获得稀有指挥官坦克。' }
];

const normalPool = [
    { name: '银币 x50000',       weight: 30 },
    { name: '银币强化剂 x10',   weight: 20 },
    { name: '战斗经验强化剂 x10', weight: 20 },
    { name: '全局经验强化剂 x10', weight: 15 },
    { name: '金币 x500',        weight: 10 }
];
const normalTotalWeight = normalPool.reduce((s, i) => s + i.weight, 0);

const rarePool = [
    { name: '概念型1B',       weight: 50 },
    { name: '116F3',            weight: 40 },
    { name: 'BZT70',        weight: 30 },
    { name: '五式重战车',       weight: 20 },
    { name: 'F1.0WT',         weight: 20 },
    { name: 'GSOR坦克',             weight: 20 },
    { name: 'SPHT',         weight: 10 },
    { name: '菲利斯',           weight: 10 }
];
const rareTotalWeight = rarePool.reduce((s, i) => s + i.weight, 0);

const tankList = [
    "SPHT", "鼠式", "IS-7", "AMX 50B", "M48巴顿", "E-100", "T110E5", "FV215b", "T-62A", "豹1",
    "Bat.-Chat. 25t", "STB-1", "140工程", "60TP", "起重机", "M40/65", "TVP T50/51", "AMX 30B",
    "WZ-132-1", "T-100 LT", "谢里登", "Rhm. Pzw.", "蟋蟀15", "FV4005", "Strv K", "Foch 155", "斯柯达T27",
    "T95E6", "超级征服者", "TRV", "263工程", "FV215b 183", "穆拉特工程", "Type 5 Heavy", "T110E3",
    "E100歼击车", "T110E4", "獾先生FV217", "268工程", "WZ-113G FT", "T57重型", "埃里希概念车",
    "VK 72.01(K)", "酋长MK6", "752工程", "Carro 45T", "Rinoceronte", "Vz.55", "Minotauro", "Ho-Ri III",
    "GSOR坦克", "CC狮", "BZ-75", "M-VI-Y", "菲利斯", "AC阿特拉斯", "野牛C45", "CS-63", "Object 430U", "K-91",
    "T-22中型", "E 50 M", "Panzer 58", "121B", "122 TM", "56TP", "斯柯达T56", "埃米尔1951", "AMX 30原", "T77",
    "JPanther II", "268/4工程", "德古拉", "粉碎者", "歼灭者", "T-34-85鲁迪", "WZ-113", "WZ-121", "71式",
    "NC70B", "BZT-70", "260工程", "114SP2", "ISU-130", "T-34-3", "T-44-100", "XM66F", "M6A2E1", "T34", "AMX CDC",
    "FCM 50 t", "Strv 81", "WZ-111 5A", "116F3", "KPZ70", "SU-130PM", "TS-5", "WZ-120-1G FT", "IS-6", "252U工程"
];
while (tankList.length < 100) tankList.push("随机坦克" + (tankList.length + 1));


// ==================== 全局 fetch 包装（自动处理401） ====================
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const response = await originalFetch(...args);
  if (response.status === 401) {
    // 清除本地登录状态
    safeSetItem('token', '');
    safeSetItem('username', '');
    safeSetItem('role', '');
    safeSetItem('userId', '');
    checkLoginStatus();
    showToast('登录已过期，请重新登录');
    // 打开登录弹窗（如果存在）
    if (loginModal) loginModal.style.display = 'flex';
  }
  return response;
};



// ==================== DOM 元素引用 (带 null 检查) ====================
const mainMenu = getEl('mainMenu');
const sections = {
    boost: getEl('sectionBoost'),
    tools: getEl('sectionTools'),
    news: getEl('sectionNews'),
    announcement: getEl('sectionAnnouncement'),
    league: getEl('sectionLeague'),
    profile: getEl('sectionProfile'),
    admin: getEl('sectionAdmin'),
    booster: getEl('sectionBooster'),
    leagueAdmin: getEl('sectionLeagueAdmin'),
    qyshop: getEl('sectionQYShop'),
    settings: getEl('sectionSettings'),
    rental: getEl('sectionRental'),
    thirdparty: getEl('sectionThirdParty')
};

// 代练相关
const projectRadios = document.querySelectorAll('input[name="project"]');
const detailRadios = document.querySelectorAll('input[name="detail"]');
const detailDescA = getEl('detailDescA');
const detailDescB = getEl('detailDescB');
const detailDescC = getEl('detailDescC');
const detailPriceA = getEl('detailPriceA');
const detailPriceB = getEl('detailPriceB');
const detailPriceC = getEl('detailPriceC');
const qtyInput = getEl('quantityInput');
const qtyMinus = getEl('qtyMinus');
const qtyPlus = getEl('qtyPlus');
const urgentCheck = getEl('urgentCheckbox');
const urgentRow = getEl('urgentRow');
const basePriceDisplay = getEl('basePriceDisplay');
const qtyMultDisplay = getEl('qtyMultiplierDisplay');
const playerMultDisplay = getEl('playerMultiplierDisplay');
const totalPriceDisplay = getEl('totalPriceDisplay');
const copyBtn = getEl('copyBtn');
const copyFeedback = getEl('copyFeedback');
const submitOrderBtn = getEl('submitOrderBtn');

// 计算器
const calcTypeRadios = document.querySelectorAll('input[name="calcType"]');
const calcUnit = getEl('calcLabelUnit');
const calcTargetL = getEl('calcTargetLabel');
const calcExpL = getEl('calcExpectedLabel');
const calcResultDiv = getEl('calcResult');

// 用户相关
const openRegisterBtn = getEl('openRegisterBtn');
const openLoginBtn = getEl('openLoginBtn');
const registerModal = getEl('registerModal');
const closeRegisterBtn = getEl('closeRegisterBtn');
const registerForm = getEl('registerForm');
const regError = getEl('regError');
const toLoginLink = getEl('toLoginLink');
const loginModal = getEl('loginModal');
const closeLoginBtn = getEl('closeLoginBtn');
const loginForm = getEl('loginForm');
const loginError = getEl('loginError');
const toRegisterLink = getEl('toRegisterLink');
const userMenu = getEl('userMenu');
const userMenuBtn = getEl('userMenuBtn');
const userDropdown = getEl('userDropdown');
const displayUsername = getEl('displayUsername');
const logoutBtn = getEl('logoutBtn');

// 定制需求
const customRequestCard = getEl('customRequestCard');
const customRequestModal = getEl('customRequestModal');
const closeCustomRequestBtn = getEl('closeCustomRequestBtn');
const customRequestForm = getEl('customRequestForm');
const customRequestError = getEl('customRequestError');

// 导航按钮
const profileBtn = getEl('profileBtn');
const adminPanelBtn = getEl('adminPanelBtn');
const boosterPanelBtn = getEl('boosterPanelBtn');
const leagueAdminBtn = getEl('leagueAdminBtn');
const settingsBtn = getEl('settingsBtn');

// ==================== 初始化 ====================
function init() {
    updateDetailCards();
    refreshPrice();
    generatePlayers();
    checkLoginStatus();
    bindUpdateRole();
    initChestSimulator();
    loadGameNews();
    applySavedTheme();
}

// ==================== 板块切换 ====================
document.querySelectorAll('.menu-card').forEach(card => {
    card.addEventListener('click', () => {
        const target = card.dataset.target;
        showSection(target);
    });
});
document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.back;
        showSection(target);
    });
});
if (profileBtn) profileBtn.addEventListener('click', () => showSection('profile'));
if (adminPanelBtn) adminPanelBtn.addEventListener('click', () => showSection('admin'));
if (boosterPanelBtn) boosterPanelBtn.addEventListener('click', () => showSection('booster'));
if (leagueAdminBtn) leagueAdminBtn.addEventListener('click', () => showSection('leagueAdmin'));

function showSection(target) {
    if (mainMenu) mainMenu.style.display = 'none';
    Object.values(sections).forEach(sec => { if (sec) sec.style.display = 'none'; });

    if (target === 'mainMenu') {
        if (mainMenu) mainMenu.style.display = 'flex';
        return;
    }

    const targetSection = sections[target];
    if (!targetSection) return;
    targetSection.style.display = 'block';

    switch (target) {
        case 'profile':
            loadProfile();
            loadOrders();
            break;
        case 'admin':
            loadAdminOrders();
            break;
        case 'booster':
            loadHallOrders();
            break;
        case 'leagueAdmin':
            loadLeagueConfig();
            break;
        case 'league':
            // 原有：默认显示积分榜，隐藏新闻
            const standingsView = getEl('leagueStandingsView');
            const newsView = getEl('leagueNewsView');
            if (standingsView) standingsView.style.display = 'block';
            if (newsView) newsView.style.display = 'none';
            document.querySelectorAll('.league-tab').forEach(t => t.classList.remove('active'));
            const standingsTab = document.querySelector('.league-tab[data-league-view="standings"]');
            if (standingsTab) standingsTab.classList.add('active');
            loadLeagueStandings();
            // 新增：预加载联赛新闻数据（若用户切换到新闻视图时可用）
            loadLeagueNews();
            break;
        case 'tools':
            resetToolsOnEnter();
            break;
        case 'qyshop':
            loadShopItems();
            break;
        case 'settings':
            loadSettingsPanel();
            break;    
        case 'boost':
            loadUserCreditsForBoost();
            break;
        case 'rental':
            // 重置所有 rental 子视图为隐藏
            document.querySelectorAll('.rental-view').forEach(v => v.style.display = 'none');
            // 显示默认视图（租号大厅）
            const hallView = getEl('rentalHallView');
            if (hallView) hallView.style.display = 'block';
            // 高亮第一个选项卡（大厅）
            document.querySelectorAll('.rental-tab').forEach(t => t.classList.remove('active'));
            const defaultTab = document.querySelector('.rental-tab[data-rentaltab="hall"]');
            if (defaultTab) defaultTab.classList.add('active');
            // 加载大厅数据
            loadRentalHall();
            break;
        // 新增：游戏新闻板块
        case 'news':
            loadGameNews();
            break;
        // 新增：站内公告板块
        case 'announcement':
            loadAnnouncement();
            break;
        case 'thirdparty':
            loadThirdPartyOrders();
            // 直接使用本地缓存的角色显示/隐藏添加表单
            (() => {
                const addCard = getEl('tpAddCard');
                if (!addCard) return;
                const role = safeGetItem('role');
                addCard.style.display = (role === 'admin' || role === 'booster') ? 'block' : 'none';
            })();
            break;
    }
}

// ==================== 打手卡片生成 ====================
function generatePlayers() {
    const grid = getEl('playerGrid');
    if (!grid) return;
    grid.innerHTML = '';
    playerData.forEach((p, idx) => {
        const label = document.createElement('label');
        label.className = 'player-card';
        label.innerHTML = `
            <input type="radio" name="player" value="${p.key}" ${idx===2?'checked':''}>
            <div class="player-inner">
                <span class="player-name">${p.name}</span>
                <span class="player-rate">${p.rate}x</span>
            </div>
        `;
        grid.appendChild(label);
    });
}

// ==================== 代练价格计算 ====================
function getSelectedProject() { const checked = document.querySelector('input[name="project"]:checked'); return checked ? checked.value : 'silver'; }
function getSelectedDetail() { const checked = document.querySelector('input[name="detail"]:checked'); return checked ? checked.value : 'a'; }
function getQty() { if (!qtyInput) return 1; let qty = parseInt(qtyInput.value, 10); if (isNaN(qty) || qty < 1) qty = 1; if (qty > 99) qty = 99; return qty; }
function getPlayerRate() {
    const checked = document.querySelector('input[name="player"]:checked');
    if (!checked) return 1.0;
    const found = playerData.find(p => p.key === checked.value);
    return found ? found.rate : 1.0;
}
function isUrgent() { return urgentCheck ? urgentCheck.checked : false; }

function updateDetailCards() {
    const p = projectDetails[getSelectedProject()];
    if (!p) return;
    if (detailDescA) detailDescA.textContent = p.a.desc;
    if (detailDescB) detailDescB.textContent = p.b.desc;
    if (detailDescC) detailDescC.textContent = p.c.desc;
    if (detailPriceA) detailPriceA.textContent = `¥${p.a.price}`;
    if (detailPriceB) detailPriceB.textContent = `¥${p.b.price}`;
    if (detailPriceC) detailPriceC.textContent = `¥${p.c.price}`;
}

function calcTotal() {
    const project = projectDetails[getSelectedProject()];
    if (!project) return 0;
    const detail = project[getSelectedDetail()];
    if (!detail || isNaN(detail.price)) return 0;
    const base = detail.price;
    const subTotal = base * getQty() * getPlayerRate() * (isUrgent() ? 1.1 : 1);
    const creditsDiscount = getUseCredits() / 100;
    return Math.max(0, subTotal - creditsDiscount);
}

function refreshPrice() {
    const project = projectDetails[getSelectedProject()];
    if (!project) return;
    const detail = project[getSelectedDetail()];
    if (!detail) return;
    const base = detail.price;
    if (basePriceDisplay) basePriceDisplay.textContent = `¥${base.toFixed(2)}`;
    if (qtyMultDisplay) qtyMultDisplay.textContent = `×${getQty()}`;
    if (playerMultDisplay) playerMultDisplay.textContent = `×${getPlayerRate().toFixed(2)}`;
    if (totalPriceDisplay) totalPriceDisplay.textContent = `¥${calcTotal().toFixed(2)}`;
    if (urgentRow) urgentRow.style.display = isUrgent() ? 'flex' : 'none';
}
projectRadios.forEach(r => r.addEventListener('change', () => { updateDetailCards(); refreshPrice(); }));
detailRadios.forEach(r => r.addEventListener('change', refreshPrice));
if (qtyMinus) qtyMinus.addEventListener('click', () => { if (getQty() > 1) { qtyInput.value = getQty() - 1; refreshPrice(); } });
if (qtyPlus) qtyPlus.addEventListener('click', () => { if (getQty() < 99) { qtyInput.value = getQty() + 1; refreshPrice(); } });
if (qtyInput) qtyInput.addEventListener('input', () => { qtyInput.value = getQty(); refreshPrice(); });
if (urgentCheck) urgentCheck.addEventListener('change', refreshPrice);
document.addEventListener('change', e => { if (e.target.name === 'player') refreshPrice(); });

// 积分输入监听
const useCreditsInput = getEl('useCreditsInput');
const discountAmountEl = getEl('discountAmount');
if (useCreditsInput) {
    useCreditsInput.addEventListener('input', () => {
        let credits = parseInt(useCreditsInput.value) || 0;
        const maxCredits = parseInt(getEl('availableCredits')?.textContent || 0);
        if (credits > maxCredits) credits = maxCredits;
        useCreditsInput.value = credits;
        if (discountAmountEl) discountAmountEl.textContent = `¥${(credits / 100).toFixed(2)}`;
        refreshPrice();
    });
}

// 复制订单
if (copyBtn) copyBtn.addEventListener('click', async () => {
    const p = projectDetails[getSelectedProject()];
    if (!p) return;
    const detailKey = getSelectedDetail();
    const detailInfo = p[detailKey];
    if (!detailInfo) return;
    const playerChecked = document.querySelector('input[name="player"]:checked');
    const playerInfo = playerData.find(pd => pd.key === playerChecked?.value) || { name:'未知', rate:getPlayerRate() };
    const remark = getEl('remarkInput')?.value.trim() || '';
    const remarkLine = remark ? `\n📝 备注：${remark}` : '';
    const token = safeGetItem('token');
    const currentUsername = safeGetItem('username');
    const userLine = (token && currentUsername) ? `\n👤 下单用户：${currentUsername}` : '';
    const order = `【WOTB情谊代练订单】\n🎯 项目：${p.name}\n📋 详情：方案${detailKey.toUpperCase()} - ${detailInfo.desc}\n🔢 数量：${getQty()}\n👤 打手：${playerInfo.name} (${playerInfo.rate}x)\n⚡ 加急：${isUrgent()?'是':'否'}\n💰 总价：¥${calcTotal().toFixed(2)}\n📅 下单时间：${new Date().toLocaleString()}${remarkLine}${userLine}\n---\n如需帮助请联系客服`;
    if (navigator.clipboard && window.isSecureContext) {
        try { await navigator.clipboard.writeText(order); copyFeedback.classList.add('show'); setTimeout(() => copyFeedback.classList.remove('show'), 1800); showToast('✅ 订单已复制'); return; } catch (err) {}
    }
    const textarea = document.createElement('textarea'); textarea.value = order; textarea.style.position='fixed'; textarea.style.opacity='0'; document.body.appendChild(textarea);
    textarea.focus(); textarea.select();
    try {
        if (document.execCommand('copy')) { copyFeedback.classList.add('show'); setTimeout(() => copyFeedback.classList.remove('show'), 1800); showToast('✅ 订单已复制'); }
        else showToast('❌ 复制失败，请手动复制');
    } catch (err) { showToast('❌ 复制失败，请手动复制'); }
    finally { document.body.removeChild(textarea); }
});

// 联系客服复制
document.querySelectorAll('.contact-copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const text = btn.dataset.copy;
        const orig = btn.textContent;
        btn.textContent = '✅ 已复制';
        setTimeout(() => btn.textContent = orig, 1500);
        if (navigator.clipboard && window.isSecureContext) {
            try { await navigator.clipboard.writeText(text); showToast('✅ 已复制到剪贴板'); return; } catch (err) {}
        }
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try { document.execCommand('copy'); showToast('✅ 已复制到剪贴板'); } catch (err) { showToast('❌ 复制失败，请手动复制'); }
        document.body.removeChild(textarea);
    });
});

// ==================== 计算器 ====================
calcTypeRadios.forEach(r => r.addEventListener('change', () => {
    const type = r.value;
    if (calcUnit) calcUnit.textContent = type === 'winrate' ? '胜率' : '场均伤害';
    if (calcTargetL) calcTargetL.textContent = type === 'winrate' ? '胜率' : '场均伤害';
    if (calcExpL) calcExpL.textContent = type === 'winrate' ? '胜率' : '场均伤害';
    if (calcResultDiv) calcResultDiv.style.display = 'none';
}));
getEl('calcBtn')?.addEventListener('click', () => {
    const type = document.querySelector('input[name="calcType"]:checked')?.value || 'winrate';
    const cur = parseFloat(getEl('currentValue')?.value);
    const battles = parseInt(getEl('currentBattles')?.value);
    const target = parseFloat(getEl('targetValue')?.value);
    const exp = parseFloat(getEl('expectedValue')?.value);
    const resultText = getEl('calcResultText');
    const copyCalcBtn = getEl('copyCalcResultBtn');
    if (!resultText || !calcResultDiv) return;
    if (isNaN(cur) || isNaN(battles) || isNaN(target) || isNaN(exp) || battles < 1) {
        resultText.innerHTML = '❌ 请填写完整有效数值';
        if (copyCalcBtn) copyCalcBtn.style.display = 'none';
        calcResultDiv.style.display = 'block';
        return;
    }
    if (exp <= target) {
        resultText.innerHTML = '⚠️ 预期值必须高于目标值，否则无法达成';
        if (copyCalcBtn) copyCalcBtn.style.display = 'none';
        calcResultDiv.style.display = 'block';
        return;
    }
    const needed = (target - cur) * battles / (exp - target);
    if (needed <= 0) {
        resultText.innerHTML = '✅ 当前数据已达标，无需再打';
        if (copyCalcBtn) copyCalcBtn.style.display = 'none';
        calcResultDiv.style.display = 'block';
        return;
    }
    const round = Math.ceil(needed);
    resultText.innerHTML = `🎯 还需要 <strong>${round}</strong> 场<br><small>精确计算 ${needed.toFixed(2)} 场，向上取整</small>`;
    if (copyCalcBtn) {
        copyCalcBtn.style.display = 'inline-block';
        copyCalcBtn.onclick = async () => {
            const typeText = type === 'winrate' ? '胜率' : '场均伤害';
            const unit = type === 'winrate' ? '%' : '';
            const fullText = `【坦克世界闪击战 - 自助计算】\n类型：${typeText}\n当前数据：${cur}${unit}（场次 ${battles}）\n目标数据：${target}${unit}\n预期每场：${exp}${unit}\n计算结果：需要再打 ${round} 场（精确计算 ${needed.toFixed(2)} 场）`;
            try { await navigator.clipboard.writeText(fullText); showToast('✅ 完整结果已复制'); } catch (err) { showToast('❌ 复制失败'); }
        };
    }
    calcResultDiv.style.display = 'block';
});



// ==================== 用户登录状态管理 ====================
function checkLoginStatus() {
    const token = safeGetItem('token');
    const username = safeGetItem('username');
    const role = safeGetItem('role');
    if (token && username) {
        if (openRegisterBtn) openRegisterBtn.style.display = 'none';
        if (openLoginBtn) openLoginBtn.style.display = 'none';
        if (userMenu) userMenu.style.display = 'block';
        if (displayUsername) displayUsername.textContent = username;
    } else {
        if (openRegisterBtn) openRegisterBtn.style.display = 'inline-block';
        if (openLoginBtn) openLoginBtn.style.display = 'inline-block';
        if (userMenu) userMenu.style.display = 'none';
    }
    if (adminPanelBtn) adminPanelBtn.style.display = (role === 'admin') ? 'block' : 'none';
    if (boosterPanelBtn) boosterPanelBtn.style.display = (role === 'booster' || role === 'admin') ? 'block' : 'none';
    if (leagueAdminBtn) leagueAdminBtn.style.display = (role === 'admin') ? 'block' : 'none';
}
if (logoutBtn) logoutBtn.addEventListener('click', () => {
    safeSetItem('token', ''); safeSetItem('username', ''); safeSetItem('role', '');
    checkLoginStatus();
    if (userDropdown) userDropdown.style.display = 'none';
    showToast('👋 已退出登录');
});
if (userMenuBtn) userMenuBtn.addEventListener('click', (e) => { e.stopPropagation(); if (userDropdown) userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block'; });
// ✅ 新增这一行：阻止下拉菜单内的点击冒泡到 document
if (userDropdown) userDropdown.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => { if (userDropdown) userDropdown.style.display = 'none'; });

// ==================== 注册/登录弹窗 ====================
if (openRegisterBtn) openRegisterBtn.addEventListener('click', () => { if (registerModal) registerModal.style.display = 'flex'; });
if (closeRegisterBtn) closeRegisterBtn.addEventListener('click', () => { if (registerModal) registerModal.style.display = 'none'; if (regError) regError.textContent = ''; });
if (registerModal) registerModal.addEventListener('click', (e) => { if (e.target === registerModal) { registerModal.style.display = 'none'; if (regError) regError.textContent = ''; } });
if (registerForm) registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = getEl('regUsername')?.value.trim();
    const password = getEl('regPassword')?.value;
    const email = getEl('regEmail')?.value.trim();
    const phone = getEl('regPhone')?.value.trim();
    const referral = getEl('regReferral')?.value.trim();
    if (!username || !password) { if (regError) regError.textContent = '用户名和密码必填'; return; }
    if (password.length < 6) { if (regError) regError.textContent = '密码至少6位'; return; }
    try {
        const res = await fetch(`${API_BASE}/auth/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password, email, phone, referralCode: referral }) });
        const data = await res.json();
        if (res.ok) { showToast('✅ 注册成功！请登录'); if (registerModal) registerModal.style.display = 'none'; registerForm.reset(); if (regError) regError.textContent = ''; }
        else { if (regError) regError.textContent = data.error || '注册失败'; }
    } catch (err) { if (regError) regError.textContent = '网络错误，请检查后端是否启动'; }
});
if (toLoginLink) toLoginLink.addEventListener('click', (e) => { e.preventDefault(); if (registerModal) registerModal.style.display = 'none'; if (loginModal) loginModal.style.display = 'flex'; });
if (toRegisterLink) toRegisterLink.addEventListener('click', (e) => { e.preventDefault(); if (loginModal) loginModal.style.display = 'none'; if (registerModal) registerModal.style.display = 'flex'; });
if (openLoginBtn) openLoginBtn.addEventListener('click', () => { if (loginModal) loginModal.style.display = 'flex'; });
if (closeLoginBtn) closeLoginBtn.addEventListener('click', () => { if (loginModal) loginModal.style.display = 'none'; if (loginError) loginError.textContent = ''; });
if (loginModal) loginModal.addEventListener('click', (e) => { if (e.target === loginModal) { loginModal.style.display = 'none'; if (loginError) loginError.textContent = ''; } });
if (loginForm) loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = getEl('loginUsername')?.value.trim();
    const password = getEl('loginPassword')?.value;
    if (!username || !password) { if (loginError) loginError.textContent = '用户名和密码不能为空'; return; }
    try {
        const res = await fetch(`${API_BASE}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
        const data = await res.json();
        if (res.ok && data.success) {
            safeSetItem('token', data.token);
            safeSetItem('username', data.user.username);
            safeSetItem('role', data.user.role);
            safeSetItem('boosterIdentity', data.user.booster_identity || 'standard');
            safeSetItem('userId', data.user.id);
            checkLoginStatus();
            if (loginModal) loginModal.style.display = 'none';
            if (loginError) loginError.textContent = '';
            showToast('✅ 登录成功！');
        } else { if (loginError) loginError.textContent = data.error || '登录失败'; }
    } catch (err) { if (loginError) loginError.textContent = '网络错误'; }
});

// ==================== 个人中心 ====================
async function loadProfile() {
    const info = getEl('profileInfo');
    if (!info) return;
    const token = safeGetItem('token');
    if (!token) { info.innerHTML = '<p style="color:var(--red)">请先登录</p>'; return; }
    try {
        const [userRes, creditRes] = await Promise.all([
            fetch(`${API_BASE}/user/profile`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_BASE}/user/credits`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        const user = await userRes.json();
        const credits = await creditRes.json();

        const vipNames = ['VIP 0', 'VIP 1', 'VIP 2', 'VIP 3', 'VIP 4', 'VIP 5'];
        const vipThresholds = [0, 600, 1500, 3000, 6000, 15000];
        const currentVip = credits.vip_level || 0;
        const totalEarned = credits.total_earned_credits || 0;
        let nextThreshold = vipThresholds[currentVip + 1] || totalEarned;
        let vipProgress = 0;
        if (nextThreshold > 0) {
            const prevThreshold = vipThresholds[currentVip] || 0;
            vipProgress = Math.min(100, Math.floor(((totalEarned - prevThreshold) / (nextThreshold - prevThreshold)) * 100));
        }

        info.innerHTML = `
            <p><span>用户名：</span><span>${user.username}</span></p>
            <p><span>邮箱：</span><span>${user.email || '未填写'}</span></p>
            <p><span>手机：</span><span>${user.phone || '未填写'}</span></p>
            <p><span>QY积分：</span><span><img src="qy-coin.png" style="width:18px;height:18px;vertical-align:middle;margin-right:4px;">${credits.qy_credits} (可用) / ${totalEarned} (累积)</span></p>
            <p><span>VIP等级：</span><span>${vipNames[currentVip]}</span></p>
            <div style="background:#1e2a3a; border-radius:10px; height:10px; margin:8px 0; width:100%;">
                <div style="width:${vipProgress}%; height:100%; background:var(--accent); border-radius:10px;"></div>
            </div>
            <p style="font-size:0.75rem; color:var(--text-muted);">升级还需 ${nextThreshold - totalEarned} 积分</p>
            <p><span>信誉分：</span><span>${user.reputation}</span></p>
            <p><span>推荐码：</span><span>${user.referral_code}</span></p>
            <p><span>打手身份：</span><span>${user.booster_identity || 'standard'}</span></p>
            <p><span>打手积分：</span><span>${user.booster_points || 0}</span></p>
            <p><span>注册时间：</span><span>${new Date(user.created_at).toLocaleString()}</span></p>
            <div style="margin-top:10px;">
                <button class="submit-btn" id="openShopBtn">🎁 积分商城</button>
            </div>
        `;

        getEl('openShopBtn')?.addEventListener('click', () => showSection('qyshop'));
    } catch (err) { info.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}
async function loadOrders() {
    const list = getEl('orderList');
    if (!list) return;
    const token = safeGetItem('token');
    if (!token) { list.innerHTML = '<p style="color:var(--red)">请先登录</p>'; return; }
    try {
        const res = await fetch(`${API_BASE}/user/orders`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('获取失败');
        const orders = await res.json();
        if (!Array.isArray(orders) || orders.length === 0) { list.innerHTML = '<p style="color:var(--text-muted)">暂无订单</p>'; return; }
        const statusMap = { pending: '待接单', playing: '代练中', done: '已完成' };
        const paymentStatusMap = { unpaid: '未支付', pending: '待确认', paid: '已支付' };
        let html = '<table class="order-table"><tr><th>订单号</th><th>项目</th><th>金额</th><th>状态</th><th>支付</th><th>操作</th><th>时间</th></tr>';
        orders.forEach(o => {
            let actionHtml = '';
            if (o.payment_status === 'unpaid') actionHtml = `<button class="upload-payment-btn" data-order="${o.order_no}">上传凭证</button>`;
            else if (o.payment_status === 'paid') actionHtml = '已确认';
            else actionHtml = '审核中';
            html += `<tr><td>${o.order_no}</td><td>${o.project} - ${o.detail}</td><td>¥${o.total_price}</td><td><span class="order-status status-${o.status}">${statusMap[o.status]||o.status}</span></td><td><span class="payment-status payment-${o.payment_status}">${paymentStatusMap[o.payment_status]||'未知'}</span></td><td>${actionHtml}</td><td>${new Date(o.created_at).toLocaleString()}</td></tr>`;
        });
        html += '</table>';
        list.innerHTML = html;
    } catch (err) { list.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}

// ==================== 提交订单 (防重复点击 + 积分抵扣) ====================
if (submitOrderBtn) {
    submitOrderBtn.addEventListener('click', async function() {
        if (this.disabled) return;
        const token = safeGetItem('token');
        if (!token) { showToast('❌ 请先登录后再提交订单'); return; }
        const project = getSelectedProject(); const detail = getSelectedDetail(); const qty = getQty();
        const playerChecked = document.querySelector('input[name="player"]:checked');
        const playerInfo = playerData.find(p => p.key === (playerChecked?.value || 'standard')) || { name:'标准打手', rate:1.0, identity:'standard' };
        const urgent = isUrgent(); const total = calcTotal();
        const projectInfo = projectDetails[project];
        if (!projectInfo) { showToast('❌ 请选择项目'); return; }
        const detailInfo = projectInfo[detail];
        if (!detailInfo) { showToast('❌ 请选择详情'); return; }
        const base = detailInfo.price;
        const remark = getEl('remarkInput')?.value.trim() || '';
        const gameUid = getEl('gameUid')?.value.trim() || '';
        const gameAccount = getEl('gameAccount')?.value.trim() || '';
        const gamePassword = getEl('gamePassword')?.value.trim() || '';
        const clientTypeEl = document.querySelector('input[name="clientType"]:checked');
        const clientType = clientTypeEl ? clientTypeEl.value : 'Android';
        const playerType = playerChecked ? playerChecked.value : 'standard';
        const useCredits = getUseCredits();

        this.disabled = true;
        this.textContent = '⏳ 提交中...';
        try {
            const body = {
                project: projectInfo.name,
                detail: `${detail.toUpperCase()} - ${detailInfo.desc}`,
                quantity: qty,
                player_name: playerInfo.name,
                price: base,
                urgent,
                total_price: total,
                remark,
                game_uid: gameUid || null,
                game_account: gameAccount || null,
                game_password: gamePassword || null,
                client_type: clientType,
                player_type: playerType,
                use_credits: useCredits
            };
            const res = await fetch(`${API_BASE}/orders`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify(body) });
            const data = await res.json();
            if (res.ok) {
               showToast(`✅ 订单提交成功！订单号：${data.order_no}`);
               // 设置当前待支付订单号
               currentOrderNo = data.order_no;
               // 显示支付引导弹窗
               getEl('guideOrderNo').textContent = currentOrderNo;
               getEl('paymentGuideModal').style.display = 'flex';
            } else {
               showToast('❌ ' + (data.error || '提交失败'));
            }
        } catch (err) { showToast('❌ 网络错误'); }
        finally {
            this.disabled = false;
            this.textContent = '🚀 提交订单';
        }
    });
}

// ==================== 管理面板 ====================
const statusFilter = getEl('statusFilter');
const refreshOrdersBtn = getEl('refreshOrdersBtn');
const adminOrderList = getEl('adminOrderList');

async function loadAdminOrders() {
    const token = safeGetItem('token'); if (!token || !adminOrderList) return;
    const status = statusFilter ? statusFilter.value : '';
    try {
        const res = await fetch(`${API_BASE}/admin/orders`, { headers: { 'Authorization': `Bearer ${token}` } });
        const orders = await res.json();
        if (!Array.isArray(orders)) throw new Error('数据错误');
        const filtered = status ? orders.filter(o => o.status === status) : orders;
        renderAdminOrders(filtered);
    } catch (err) { adminOrderList.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}
function renderAdminOrders(orders) {
    if (!adminOrderList) return;
    const statusOptions = ['pending', 'playing', 'done'];
    const statusText = { pending: '待接单', playing: '代练中', done: '已完成' };
    const paymentStatusMap = { unpaid: '未支付', pending: '待确认', paid: '已支付' };
    if (!orders.length) { adminOrderList.innerHTML = '<p>暂无订单</p>'; return; }
    let html = '<table><tr><th>订单号</th><th>用户</th><th>项目</th><th>数量</th><th>客户端</th><th>要求打手</th><th>金额</th><th>状态</th><th>支付</th><th>接单人</th><th>操作</th><th>时间</th></tr>';
    orders.forEach(o => {
        const identityMap = { gold:'金牌', silver:'银牌', standard:'标准', budget:'特惠' };
        const screenshotLink = o.payment_screenshot ? ` <a href="/uploads/${o.payment_screenshot}" target="_blank" style="font-size:0.7rem;">截图</a>` : '';
        html += `<tr>
            <td>${o.order_no}</td><td>${o.customer_name || o.username}</td><td>${o.project} - ${o.detail}</td><td>${o.quantity}</td><td>${o.client_type||'Android'}</td><td>${identityMap[o.required_identity]||'标准'}</td><td>¥${o.total_price}</td>
            <td><span class="order-status status-${o.status}">${statusText[o.status]||o.status}</span></td>
            <td><span class="payment-status payment-${o.payment_status}">${paymentStatusMap[o.payment_status]||'未知'}</span></td>
            <td>${o.booster_name || '—'}</td>
            <td>
                <select class="status-select" data-order="${o.order_no}" onchange="updateOrderStatus(this)">
                    ${statusOptions.map(s => `<option value="${s}" ${s===o.status?'selected':''}>${statusText[s]}</option>`).join('')}
                </select>
                ${o.payment_status === 'pending' ? `<button class="confirm-payment-btn" data-order="${o.order_no}">确认收款</button>` : ''}
                ${screenshotLink}
                ${o.hall_status !== 'open' && o.status === 'pending' ? `<button class="hall-btn" data-order="${o.order_no}">放入大厅</button>` : ''}
                <button class="detail-btn" data-order="${o.order_no}">详情</button>
                <button class="copy-order-detail-btn" data-order="${o.order_no}">复制信息</button>
                <button class="delete-order-btn" data-order="${o.order_no}">删除</button>
            </td>
            <td>${new Date(o.created_at).toLocaleString()}</td>
        </tr>`;
    });
    html += '</table>';
    adminOrderList.innerHTML = html;
}
window.updateOrderStatus = async function(selectEl) {
    const orderNo = selectEl.dataset.order; const newStatus = selectEl.value; const token = safeGetItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/orders/${orderNo}`, { method:'PUT', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ status: newStatus }) });
        const data = await res.json();
        if (res.ok) showToast('✅ 状态更新成功'); else { showToast('❌ ' + (data.error||'更新失败')); loadAdminOrders(); }
    } catch (err) { showToast('❌ 网络错误'); loadAdminOrders(); }
};
document.addEventListener('click', async (e) => {
    const token = safeGetItem('token'); if (!token) return;
    if (e.target.classList.contains('confirm-payment-btn')) {
        const orderNo = e.target.dataset.order;
        try {
            const res = await fetch(`${API_BASE}/admin/orders/${orderNo}/confirm-payment`, { method:'PUT', headers:{'Authorization':`Bearer ${token}`} });
            const data = await res.json();
            if (res.ok) { showToast('✅ 已确认支付'); loadAdminOrders(); } else showToast('❌ ' + (data.error||'操作失败'));
        } catch (err) { showToast('❌ 网络错误'); }
    }
    if (e.target.classList.contains('hall-btn')) {
        const orderNo = e.target.dataset.order;
        try {
            const res = await fetch(`${API_BASE}/admin/orders/${orderNo}/hall`, { method:'PUT', headers:{'Authorization':`Bearer ${token}`} });
            const data = await res.json();
            if (res.ok) { showToast('✅ 已放入接单大厅'); loadAdminOrders(); } else showToast('❌ ' + (data.error||'操作失败'));
        } catch (err) { showToast('❌ 网络错误'); }
    }
    if (e.target.classList.contains('delete-order-btn')) {
        const orderNo = e.target.dataset.order;
        if (!confirm(`确定要删除订单 ${orderNo} 吗？`)) return;
        try {
            const res = await fetch(`${API_BASE}/admin/orders/${orderNo}`, { method:'DELETE', headers:{'Authorization':`Bearer ${token}`} });
            const data = await res.json();
            if (res.ok) { showToast('🗑️ 订单已删除'); loadAdminOrders(); } else showToast('❌ ' + (data.error||'删除失败'));
        } catch (err) { showToast('❌ 网络错误'); }
    }
    if (e.target.classList.contains('detail-btn')) { showOrderDetail(e.target.dataset.order); }
    if (e.target.classList.contains('copy-order-detail-btn')) { copyOrderDetail(e.target.dataset.order); }
    if (e.target.classList.contains('take-order-btn')) {
        const orderNo = e.target.dataset.order;
        try {
            const res = await fetch(`${API_BASE}/booster/take/${orderNo}`, { method:'POST', headers:{'Authorization':`Bearer ${token}`} });
            const data = await res.json();
            if (res.ok) { showToast('✅ 接单成功'); loadHallOrders(); } else showToast('❌ ' + (data.error||'接单失败'));
        } catch (err) { showToast('❌ 网络错误'); }
    }
    if (e.target.classList.contains('complete-order-btn')) {
        const orderNo = e.target.dataset.order;
        try {
            const res = await fetch(`${API_BASE}/booster/complete/${orderNo}`, { method:'POST', headers:{'Authorization':`Bearer ${token}`} });
            const data = await res.json();
            if (res.ok) { showToast(`✅ 订单已完成，收益 ¥${data.earnings}`); loadMyBoosterOrders(); } else showToast('❌ ' + (data.error||'操作失败'));
        } catch (err) { showToast('❌ 网络错误'); }
    }
        // 内容管理子标签切换
    if (e.target.classList.contains('content-mgr-tab')) {
        const type = e.target.dataset.ctype;
        switchContentManagerTab(type);
    }
    // 完成定制需求
if (e.target.classList.contains('complete-custom-btn')) {
  const id = e.target.dataset.id;
  const token = safeGetItem('token');
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/admin/custom-requests/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ status: 'completed' })
    });
    const data = await res.json();
    if (res.ok) { showToast('✅ 已标记为完成'); loadAdminCustomRequests(); }
    else showToast('❌ ' + (data.error || '操作失败'));
  } catch (err) { showToast('❌ 网络错误'); }
}

// 取消定制需求
if (e.target.classList.contains('cancel-custom-btn')) {
  const id = e.target.dataset.id;
  const token = safeGetItem('token');
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/admin/custom-requests/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ status: 'cancelled' })
    });
    const data = await res.json();
    if (res.ok) { showToast('✅ 已取消该需求'); loadAdminCustomRequests(); }
    else showToast('❌ ' + (data.error || '操作失败'));
  } catch (err) { showToast('❌ 网络错误'); }
}

// 删除定制需求
if (e.target.classList.contains('delete-custom-btn')) {
  const id = e.target.dataset.id;
  if (!confirm('确定删除该需求吗？')) return;
  const token = safeGetItem('token');
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/admin/custom-requests/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) { showToast('🗑️ 已删除'); loadAdminCustomRequests(); }
    else showToast('❌ ' + (data.error || '删除失败'));
  } catch (err) { showToast('❌ 网络错误'); }
}


    // 申请完单（三方订单）
    if (e.target.classList.contains('tp-request-complete-btn')) {
        const orderNo = e.target.dataset.order;
        const token = safeGetItem('token');
        try {
            const res = await fetch(`${API_BASE}/third-party-orders/${orderNo}/request-complete`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) { showToast('已申请完单'); loadThirdPartyOrders(); }
            else { const data = await res.json(); showToast('❌ ' + (data.error || '失败')); }
        } catch (err) { showToast('网络错误'); }
    }

    // 标记已支付（三方订单）
    if (e.target.classList.contains('tp-mark-paid-btn')) {
        const orderNo = e.target.dataset.order;
        const token = safeGetItem('token');
        try {
            const res = await fetch(`${API_BASE}/third-party-orders/${orderNo}/mark-paid`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) { showToast('已标记为已支付'); loadThirdPartyOrders(); }
            else { const data = await res.json(); showToast('❌ ' + (data.error || '失败')); }
        } catch (err) { showToast('网络错误'); }
    }



});
if (statusFilter) statusFilter.addEventListener('change', loadAdminOrders);
if (refreshOrdersBtn) refreshOrdersBtn.addEventListener('click', loadAdminOrders);

// ========== 管理面板选项卡切换（修改后） ==========
document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.admintab;

        // 隐藏所有子面板（包括新增的 adminChestSection）
        ['adminOrdersSection', 'adminCustomSection', 'adminBoostersSection', 'adminRolesSection', 'adminContentSection', 'adminShopSection', 'adminChestSection'].forEach(id => {
            const el = getEl(id);
            if (el) el.style.display = 'none';
        });

        // 根据 target 显示对应面板
        if (target === 'orders') {
            const el = getEl('adminOrdersSection');
            if (el) el.style.display = 'block';
            loadAdminOrders();
        } else if (target === 'custom') {
            const el = getEl('adminCustomSection');
            if (el) el.style.display = 'block';
            loadAdminCustomRequests();
        } else if (target === 'boosters') {
            const el = getEl('adminBoostersSection');
            if (el) el.style.display = 'block';
            loadAdminBoosters();
        } else if (target === 'roles') {
            const el = getEl('adminRolesSection');
            if (el) el.style.display = 'block';
            loadUserList();
        } else if (target === 'content') {
            const el = getEl('adminContentSection');
            if (el) el.style.display = 'block';
            document.querySelectorAll('.content-mgr-tab').forEach(t => t.classList.remove('active'));
            const defaultMgrTab = document.querySelector('.content-mgr-tab[data-ctype="announcements"]');
            if (defaultMgrTab) defaultMgrTab.classList.add('active');
            switchContentManagerTab('announcements');
        } else if (target === 'shop') {
            const el = getEl('adminShopSection');
            if (el) el.style.display = 'block';
            if (typeof loadAdminShopItems === 'function') {
                loadAdminShopItems();
            } else {
                console.error('loadAdminShopItems 函数未定义，请检查脚本加载顺序');
            }
        } else if (target === 'chest') {
            const el = getEl('adminChestSection');
            if (el) el.style.display = 'block';
            loadAdminChests();   // 这个函数需要在前面已定义
        }
    });
});
async function loadUserList() {
    const select = getEl('userSelect'); if (!select) return;
    const token = safeGetItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/users`, { headers:{'Authorization':`Bearer ${token}`} });
        if (!res.ok) throw new Error('获取失败');
        const users = await res.json();
        select.innerHTML = '<option value="">-- 选择用户 --</option>' + users.map(u => `<option value="${u.id}">${u.username} (${u.role})</option>`).join('');
    } catch (err) { select.innerHTML = '<option value="">加载失败</option>'; }
}
function bindUpdateRole() {
    const btn = getEl('updateRoleBtn'); if (!btn) return;
    btn.addEventListener('click', async () => {
        const token = safeGetItem('token');
        const userId = getEl('userSelect')?.value;
        const role = getEl('roleSelect')?.value;
        const msgEl = getEl('roleUpdateMsg');
        if (!userId) { if (msgEl) msgEl.textContent = '请先选择一个用户'; return; }
        try {
            const res = await fetch(`${API_BASE}/admin/users/${userId}/role`, { method:'PUT', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ role }) });
            const data = await res.json();
            if (res.ok) { if (msgEl) msgEl.textContent = '✅ ' + data.message; loadUserList(); }
            else { if (msgEl) msgEl.textContent = '❌ ' + (data.error||'操作失败'); }
        } catch (err) { if (msgEl) msgEl.textContent = '❌ 网络错误'; }
    });
}
async function loadAdminCustomRequests() {
  const list = getEl('adminCustomList');
  if (!list) return;
  const token = safeGetItem('token');
  try {
    const res = await fetch(`${API_BASE}/admin/custom-requests`, { headers: { 'Authorization': `Bearer ${token}` } });
    const requests = await res.json();
    if (!requests.length) { list.innerHTML = '<p>暂无定制需求</p>'; return; }

    let html = '<table><tr><th>时间</th><th>用户</th><th>客户端</th><th>类型</th><th>详情</th><th>联系方式</th><th>预算</th><th>状态</th><th>操作</th></tr>';
    requests.forEach(r => {
      const statusText = { pending: '待处理', completed: '已完成', cancelled: '已取消' }[r.status] || r.status;
      html += `<tr>
        <td>${new Date(r.created_at).toLocaleString()}</td>
        <td>${r.username}</td>
        <td>${r.client_type}</td>
        <td>${r.request_type}</td>
        <td>${r.description}</td>
        <td>${r.contact}</td>
        <td>${r.budget || '-'}</td>
        <td><span class="order-status status-${r.status === 'completed' ? 'done' : 'pending'}">${statusText}</span></td>
        <td>
          ${r.status === 'pending' ? `<button class="complete-custom-btn" data-id="${r.id}">完成</button> <button class="cancel-custom-btn" data-id="${r.id}">取消</button>` : ''}
          <button class="delete-custom-btn" data-id="${r.id}">删除</button>
        </td>
      </tr>`;
    });
    html += '</table>';
    list.innerHTML = html;
  } catch (err) { list.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}
async function loadAdminBoosters() {
    const list = getEl('adminBoostersList'); if (!list) return;
    const token = safeGetItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/boosters`, { headers: { 'Authorization': `Bearer ${token}` } });
        const boosters = await res.json();
        if (!boosters.length) { list.innerHTML = '<p>暂无打手</p>'; return; }
        let html = '<table><tr><th>用户名</th><th>身份组</th><th>积分</th><th>当前接单</th><th>操作</th></tr>';
        boosters.forEach(b => {
            html += `<tr>
                <td>${b.username}</td>
                <td>${b.booster_identity}</td>
                <td>${b.booster_points}</td>
                <td>${b.active_orders || 0} 单</td>
                <td>
                    <select class="booster-identity-select" data-userid="${b.id}">
                        <option value="gold" ${b.booster_identity==='gold'?'selected':''}>金牌</option>
                        <option value="silver" ${b.booster_identity==='silver'?'selected':''}>银牌</option>
                        <option value="standard" ${b.booster_identity==='standard'?'selected':''}>标准</option>
                        <option value="budget" ${b.booster_identity==='budget'?'selected':''}>特惠</option>
                    </select>
                    <button onclick="updateBoosterIdentity(${b.id})">更新</button>
                </td>
            </tr>`;
        });
        html += '</table>';
        list.innerHTML = html;
    } catch (err) { list.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}
window.updateBoosterIdentity = async function(userId) {
    const select = document.querySelector(`.booster-identity-select[data-userid="${userId}"]`);
    if (!select) return;
    const identity = select.value;
    const token = safeGetItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/boosters/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ booster_identity: identity })
        });
        const data = await res.json();
        if (res.ok) showToast('✅ 身份已更新');
        else showToast('❌ ' + (data.error||'更新失败'));
    } catch (err) { showToast('❌ 网络错误'); }
};

// 订单详情与复制 (增加防御)
async function showOrderDetail(orderNo) {
    const token = safeGetItem('token');
    const detailContent = getEl('orderDetailContent');
    const detailModal = getEl('orderDetailModal');
    if (!detailContent || !detailModal) return;
    try {
        const res = await fetch(`${API_BASE}/orders/${orderNo}/detail`, { headers:{'Authorization':`Bearer ${token}`} });
        if (!res.ok) throw new Error('无权或加载失败');
        const order = await res.json();
        const identityMap = { gold:'金牌', silver:'银牌', standard:'标准', budget:'特惠' };
        detailContent.innerHTML = `
            <p><strong>订单号：</strong>${order.order_no}</p>
            <p><strong>用户：</strong>${order.customer_name || order.user_id}</p>
            <p><strong>项目：</strong>${order.project} - ${order.detail}</p>
            <p><strong>数量：</strong>${order.quantity}</p>
            <p><strong>客户端：</strong>${order.client_type || 'Android'}</p>
            <p><strong>要求打手：</strong>${identityMap[order.required_identity] || '标准'}</p>
            <p><strong>是否加急：</strong>${order.urgent ? '是' : '否'}</p>
            <p><strong>总价：</strong>¥${order.total_price}</p>
            <p><strong>备注：</strong>${order.remark || '无'}</p>
            <p><strong>游戏账号：</strong>${order.game_account || '无'}</p>
            <p><strong>游戏密码：</strong>${order.game_password || '无'}</p>
            <p><strong>游戏UID：</strong>${order.game_uid || '无'}</p>
            <p><strong>状态：</strong>${order.status}</p>
            <p><strong>支付状态：</strong>${order.payment_status}</p>
        `;
        detailModal.style.display = 'flex';
    } catch (err) { showToast('❌ ' + (err.message || '加载详情失败')); }
}
async function copyOrderDetail(orderNo) {
    const token = safeGetItem('token');
    try {
        const res = await fetch(`${API_BASE}/orders/${orderNo}/detail`, { headers:{'Authorization':`Bearer ${token}`} });
        if (!res.ok) throw new Error('获取失败');
        const order = await res.json();
        const identityMap = { gold:'金牌', silver:'银牌', standard:'标准', budget:'特惠' };
        const text = `【订单详情】\n订单号：${order.order_no}\n用户：${order.customer_name||order.user_id}\n项目：${order.project} - ${order.detail}\n数量：${order.quantity}\n客户端：${order.client_type||'Android'}\n要求打手：${identityMap[order.required_identity]||'标准'}\n加急：${order.urgent?'是':'否'}\n总价：¥${order.total_price}\n备注：${order.remark||'无'}\n游戏账号：${order.game_account||'无'}\n游戏密码：${order.game_password||'无'}\n游戏UID：${order.game_uid||'无'}\n状态：${order.status}\n支付状态：${order.payment_status}`;
        if (navigator.clipboard) await navigator.clipboard.writeText(text);
        else {
            const textarea = document.createElement('textarea'); textarea.value = text; document.body.appendChild(textarea);
            textarea.select(); document.execCommand('copy'); document.body.removeChild(textarea);
        }
        showToast('✅ 订单信息已复制');
    } catch (err) { showToast('❌ 复制失败'); }
}
getEl('closeOrderDetailBtn')?.addEventListener('click', () => { const m = getEl('orderDetailModal'); if (m) m.style.display = 'none'; });
getEl('orderDetailModal')?.addEventListener('click', (e) => { if (e.target === getEl('orderDetailModal')) e.target.style.display = 'none'; });

// ==================== 支付凭证上传 ====================
let currentOrderNo = '';
const paymentModal = getEl('paymentModal');
const paymentError = getEl('paymentError');
const previewImage = getEl('previewImage');
const paymentFile = getEl('paymentFile');
const pasteArea = getEl('pasteArea');
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('upload-payment-btn')) {
        currentOrderNo = e.target.dataset.order;
        if (paymentModal) paymentModal.style.display = 'flex';
        if (paymentError) paymentError.textContent = '';
        if (previewImage) previewImage.style.display = 'none';
        if (paymentFile) paymentFile.value = '';
        if (pasteArea) pasteArea.innerText = '';
    }
});
getEl('closePaymentBtn')?.addEventListener('click', () => { if (paymentModal) paymentModal.style.display = 'none'; });
if (paymentModal) paymentModal.addEventListener('click', (e) => { if (e.target === paymentModal) paymentModal.style.display = 'none'; });
if (paymentFile) paymentFile.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file || !previewImage) return;
    const reader = new FileReader(); reader.onload = (ev) => { previewImage.src = ev.target.result; previewImage.style.display = 'block'; };
    reader.readAsDataURL(file);
});
if (pasteArea) pasteArea.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (let item of items) {
        if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile(); const reader = new FileReader();
            reader.onload = (ev) => { if (previewImage) { previewImage.src = ev.target.result; previewImage.style.display = 'block'; } };
            reader.readAsDataURL(blob); e.preventDefault();
        }
    }
});
getEl('submitPaymentBtn')?.addEventListener('click', async () => {
    const token = safeGetItem('token'); if (!token) { if (paymentError) paymentError.textContent = '请先登录'; return; }
    if (!currentOrderNo) { if (paymentError) paymentError.textContent = '订单号异常'; return; }
    const screenshot = previewImage?.src || '';
    if (!screenshot || screenshot === window.location.href) { if (paymentError) paymentError.textContent = '请先选择或粘贴截图'; return; }
    try {
        const res = await fetch(`${API_BASE}/orders/${currentOrderNo}/payment`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ screenshot }) });
        const data = await res.json();
        if (res.ok) { showToast('✅ 支付凭证已提交'); if (paymentModal) paymentModal.style.display = 'none'; if (sections.profile?.style.display === 'block') await loadOrders(); }
        else { if (paymentError) paymentError.textContent = data.error || '提交失败'; }
    } catch (err) { if (paymentError) paymentError.textContent = '网络错误'; }
});

// ==================== 打手面板 ====================
document.querySelectorAll('.booster-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.booster-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.querySelectorAll('.booster-tab-content').forEach(c => c.style.display = 'none');
        const targetEl = getEl(target);
        if (targetEl) targetEl.style.display = 'block';
        if (target === 'booster-hall') loadHallOrders();
        else if (target === 'booster-my') loadMyBoosterOrders();
        else if (target === 'booster-earnings') loadEarnings();
    });
});
async function loadHallOrders() {
    const token = safeGetItem('token');
    const list = getEl('hallOrderList'); if (!list) return;
    try {
        const profileRes = await fetch(`${API_BASE}/user/profile`, { headers: { 'Authorization': `Bearer ${token}` } });
        const profile = await profileRes.json();
        const myIdentity = profile.booster_identity || 'standard';
        const myWeight = identityWeights[myIdentity] || 0;
        const res = await fetch(`${API_BASE}/booster/hall`, { headers:{'Authorization':`Bearer ${token}`} });
        const orders = await res.json();
        const filtered = orders.filter(o => (identityWeights[o.required_identity]||0) <= myWeight);
        if (!filtered.length) { list.innerHTML = '<p>暂无可接订单</p>'; return; }
        let html = '<table><tr><th>订单号</th><th>项目</th><th>数量</th><th>客户端</th><th>要求</th><th>预估收益</th><th>操作</th></tr>';
        const identityMap = { gold:'金牌', silver:'银牌', standard:'标准', budget:'特惠' };
        filtered.forEach(o => {
            html += `<tr><td>${o.order_no}</td><td>${o.project} - ${o.detail}</td><td>${o.quantity}</td><td>${o.client_type||'未知'}</td><td>${identityMap[o.required_identity]||'标准'}</td><td>¥${Number(o.earnings).toFixed(2)}</td><td><button class="take-order-btn" data-order="${o.order_no}">接单</button></td></tr>`;
        });
        html += '</table>'; list.innerHTML = html;
    } catch (err) { list.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}
async function loadMyBoosterOrders() {
    const token = safeGetItem('token'); const list = getEl('myBoosterOrderList'); if (!list) return;
    try {
        const res = await fetch(`${API_BASE}/booster/my-orders`, { headers:{'Authorization':`Bearer ${token}`} });
        const orders = await res.json();
        if (!orders.length) { list.innerHTML = '<p>暂无订单</p>'; return; }
        const statusMap = { pending: '待接单', playing: '代练中', done: '已完成' };
        let html = '<table><tr><th>订单号</th><th>项目</th><th>数量</th><th>客户端</th><th>预估收益</th><th>状态</th><th>操作</th></tr>';
        orders.forEach(o => {
            html += `<tr><td>${o.order_no}</td><td>${o.project} - ${o.detail}</td><td>${o.quantity}</td><td>${o.client_type||'未知'}</td><td>¥${Number(o.earnings).toFixed(2)}</td><td>${statusMap[o.status]||o.status}</td><td>${o.status==='playing'?`<button class="complete-order-btn" data-order="${o.order_no}">完成</button>`:''}${o.status!=='pending'?`<button class="detail-btn" data-order="${o.order_no}">详情</button>`:''}</td></tr>`;
        });
        html += '</table>'; list.innerHTML = html;
    } catch (err) { list.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}
async function loadEarnings() {
    const token = safeGetItem('token'); const display = getEl('earningsDisplay'); if (!display) return;
    try {
        const res = await fetch(`${API_BASE}/booster/earnings`, { headers:{'Authorization':`Bearer ${token}`} });
        const data = await res.json();
        display.innerHTML = `<p>累计收益：<strong>¥${data.earnings}</strong></p>`;
    } catch (err) { display.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}

// ==================== 开箱模拟器（后端持久化版） ====================

// 获取军需券余额
async function getTickets() {
  const token = safeGetItem('token');
  if (!token) return 0;
  try {
    const res = await fetch(`${API_BASE}/chest/tickets`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    return data.tickets || 0;
  } catch (err) {
    console.error('获取军需券失败:', err);
    return 0;
  }
}

// 更新军需券显示
async function updateTicketDisplay() {
  const el = getEl('ticketBalance');
  if (!el) return;
  const tickets = await getTickets();
  el.textContent = tickets;
}

// 签到
async function doCheckin() {
  const btn = getEl('checkinBtn');
  if (!btn) return;
  // 如果按钮已经禁用，说明今日已签到或正在请求中，直接返回
  if (btn.disabled) return;

  const token = safeGetItem('token');
  if (!token) {
    showToast('请先登录');
    return;
  }

  // 立即禁用按钮，防止重复点击
  btn.disabled = true;
  btn.textContent = '⏳ 签到中...';

  try {
    const res = await fetch(`${API_BASE}/chest/checkin`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message);
      updateTicketDisplay();
      // 签到成功后保持禁用，并显示“今日已签到”
      btn.textContent = '✅ 今日已签到';
      btn.disabled = true;
    } else {
      // 签到失败（如已签到过），恢复按钮
      showToast(data.error || '签到失败');
      btn.textContent = '📅 每日签到 (+1000券)';
      btn.disabled = false;
    }
  } catch (err) {
    showToast('网络错误');
    btn.textContent = '📅 每日签到 (+1000券)';
    btn.disabled = false;
  }
}

// 充值
async function doRecharge() {
  const token = safeGetItem('token');
  if (!token) { showToast('请先登录'); return; }

  try {
    const res = await fetch(`${API_BASE}/chest/recharge`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || '创建支付订单失败');
      return;
    }

    const html = await res.text();
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(html);
      newWindow.document.close();
    } else {
      showToast('请允许弹窗，或使用浏览器直接打开');
    }
  } catch (err) {
    showToast('网络错误');
  }
}

// 渲染箱子列表（从后端加载）
async function renderChests() {
  const grid = getEl('chestGrid');
  if (!grid) return;
  try {
    const res = await fetch(`${API_BASE}/chest/configs`);
    const chests = await res.json();
    grid.innerHTML = '';
    chests.forEach(chest => {
      const div = document.createElement('div');
      div.className = 'chest-item';
      div.innerHTML = `
        <img src="${chest.image}" alt="${chest.name}" onerror="this.src='images/chests/placeholder.png';">
        <div class="chest-name">${chest.name}</div>
        <div class="chest-price">🪙 ${chest.price} <span class="chest-currency">军需券</span></div>
      `;
      div.addEventListener('click', () => openChestDetail(chest.id));
      grid.appendChild(div);
    });
  } catch (err) {
    grid.innerHTML = '<p style="color:var(--red)">加载失败</p>';
  }
}

// 打开箱子详情弹窗（动态显示该箱子独立奖池概率）
async function openChestDetail(chestId) {
  try {
    const res = await fetch(`${API_BASE}/chest/configs`);
    const chests = await res.json();
    const chest = chests.find(c => c.id == chestId);
    if (!chest) return;

    // 设置基本信息
    getEl('chestDetailTitle').textContent = chest.name;
    getEl('chestDetailImg').src = chest.image;
    getEl('chestDetailDesc').textContent = chest.description;
    getEl('chestPriceDisplay').textContent = chest.price;

    // ---- 构建概率显示区 ----
    let probHtml = '<div class="prob-list"><div><strong>奖励类别</strong><strong>概率</strong></div>';

    // 1. 显示稀有物品（总概率5%）
    const rareItems = chest.rare_items || [];
    const rareTotalWeight = rareItems.reduce((sum, item) => sum + item.weight, 0);
    rareItems.forEach(item => {
      const p = rareTotalWeight > 0 ? (item.weight / rareTotalWeight * 5).toFixed(2) : '0';
      probHtml += `<div><span class="prob-label">${item.item_name}</span><span class="prob-value">${p}%</span></div>`;
    });

    // 2. 显示普通奖励（每项独立概率）
    const commonRewards = chest.common_rewards || [];
    commonRewards.forEach(reward => {
      const p = parseFloat(reward.drop_chance).toFixed(2);
      const range = `${reward.min_quantity} - ${reward.max_quantity}`;
      probHtml += `<div><span class="prob-label">${reward.item_name}（数量 ${range}）</span><span class="prob-value">${p}%</span></div>`;
    });

    probHtml += '</div>';
    getEl('chestDetailProb').innerHTML = probHtml;

    // 重置错误提示
    const buyMsg = getEl('chestBuyMsg');
    if (buyMsg) buyMsg.style.display = 'none';

    // 显示弹窗
    getEl('chestDetailModal').style.display = 'flex';

    // 记录当前箱子ID，供开箱按钮使用
    window._currentChestId = chestId;
  } catch (err) {
    console.error('打开箱子详情失败:', err);
    showToast('加载失败');
  }
}
// 开箱按钮点击（购买箱子）
getEl('buyChestBtn')?.addEventListener('click', async () => {
  const chestId = window._currentChestId;
  if (!chestId) return;
  const token = safeGetItem('token');
  if (!token) { showToast('请先登录'); return; }
  try {
    const res = await fetch(`${API_BASE}/chest/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ chestId })
    });
    const data = await res.json();
    if (res.ok) {
      // data.rewards 是数组，例如 [{item_name:'银币', quantity:500000, rarity:'normal'}, ...]
      const rewardText = data.rewards.map(r => `${r.item_name} x${r.quantity}`).join('、');
      showToast(`🎁 获得：${rewardText}`);
      updateTicketDisplay();
      getEl('chestDetailModal').style.display = 'none';
    } else {
      const buyMsg = getEl('chestBuyMsg');
      if (buyMsg) { buyMsg.textContent = data.error || '开箱失败'; buyMsg.style.display = 'block'; }
    }
  } catch (err) {
    showToast('网络错误');
  }
});

// 我的仓库
async function loadInventory() {
  const token = safeGetItem('token');
  if (!token) { showToast('请先登录'); return; }
  try {
    const res = await fetch(`${API_BASE}/chest/inventory`, { headers: { 'Authorization': `Bearer ${token}` } });
    const items = await res.json();
    const list = getEl('inventoryList');
    if (!items.length) {
      list.innerHTML = '<p>仓库是空的，快去开箱吧！</p>';
    } else {
      let html = '<table><tr><th>物品</th><th>类型</th><th>数量</th><th>获得时间</th></tr>';
      items.forEach(item => {
        html += `<tr>
          <td>${item.item_name}</td>
          <td>${item.rarity === 'rare' ? '稀有' : '普通'}</td>
          <td>${item.quantity}</td>
          <td>${new Date(item.obtained_at).toLocaleString()}</td>
        </tr>`;
      });
      html += '</table>';
      list.innerHTML = html;
    }
    getEl('inventoryModal').style.display = 'flex';
  } catch (err) { showToast('加载仓库失败'); }
}

// 绑定按钮事件
getEl('checkinBtn')?.addEventListener('click', doCheckin);
getEl('rechargeBtn')?.addEventListener('click', doRecharge);
getEl('inventoryBtn')?.addEventListener('click', loadInventory);
getEl('closeInventoryBtn')?.addEventListener('click', () => getEl('inventoryModal').style.display = 'none');
getEl('inventoryModal')?.addEventListener('click', (e) => {
  if (e.target === getEl('inventoryModal')) getEl('inventoryModal').style.display = 'none';
});


// 关闭箱子详情弹窗
getEl('closeChestDetailBtn')?.addEventListener('click', () => {
    const m = getEl('chestDetailModal');
    if (m) m.style.display = 'none';
});
getEl('chestDetailModal')?.addEventListener('click', (e) => {
    if (e.target === getEl('chestDetailModal')) e.target.style.display = 'none';
});
// 初始化开箱模拟器
function initChestSimulator() {
  updateTicketDisplay();
  renderChests();
}

// ==================== 独立工具面板控制 ====================
const toolTabs = document.querySelectorAll('.tool-tab');
const toolPanels = {
    calculator: getEl('toolCalculator'),
    chestsim: getEl('toolChestSim'),
    randomtank: getEl('toolRandomTank')
};

function hideAllToolPanels() {
    Object.values(toolPanels).forEach(panel => { if (panel) panel.style.display = 'none'; });
}

function switchTool(toolName) {
    hideAllToolPanels();
    const activePanel = toolPanels[toolName];
    if (!activePanel) return;
    activePanel.style.display = 'block';

    toolTabs.forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tool === toolName) tab.classList.add('active');
    });

    if (toolName === 'chestsim') {
        updateTicketDisplay();
        const chestGrid = getEl('chestGrid');
        if (chestGrid && chestGrid.children.length === 0) renderChests();
    }

    if (toolName === 'randomtank') {
        requestAnimationFrame(() => {
            const canvas = getEl('wheelCanvas');
            if (canvas) {
                canvas.width = canvas.offsetWidth || 400;
                canvas.height = canvas.offsetHeight || 400;
                wheelCtx = canvas.getContext('2d');
                drawWheel(wheelAngle);
            }
        });
    }
}

function resetToolsOnEnter() {
    hideAllToolPanels();
    const calcPanel = toolPanels.calculator;
    if (calcPanel) calcPanel.style.display = 'block';
    toolTabs.forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tool === 'calculator') tab.classList.add('active');
    });
}

toolTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const toolName = tab.dataset.tool;
        if (toolName) switchTool(toolName);
    });
});

// ==================== 转盘逻辑 ====================
let wheelAngle = 0, spinning = false, wheelCanvas = getEl('wheelCanvas'), wheelCtx = wheelCanvas?.getContext('2d') || null;

function drawWheel(rotation = 0) {
    if (!wheelCtx || !wheelCanvas) return;
    const w = wheelCanvas.width, h = wheelCanvas.height, cx = w/2, cy = h/2, radius = Math.min(cx,cy)-5, sliceAngle = (2*Math.PI)/tankList.length;
    wheelCtx.clearRect(0,0,w,h);
    for (let i=0;i<tankList.length;i++) {
        const startAngle = i*sliceAngle+rotation, endAngle = startAngle+sliceAngle;
        wheelCtx.beginPath(); wheelCtx.moveTo(cx,cy); wheelCtx.arc(cx,cy,radius,startAngle,endAngle); wheelCtx.closePath();
        wheelCtx.fillStyle = i%2===0?'#2a3a50':'#1e2a3a'; wheelCtx.fill(); wheelCtx.strokeStyle='#0a0f1a'; wheelCtx.lineWidth=1; wheelCtx.stroke();
        wheelCtx.save(); wheelCtx.translate(cx,cy); wheelCtx.rotate(startAngle+sliceAngle/2); wheelCtx.textAlign='right'; wheelCtx.fillStyle='#e2e8f0'; wheelCtx.font='8px sans-serif'; wheelCtx.fillText(i+1, radius-10, 3); wheelCtx.restore();
    }
    wheelCtx.beginPath(); wheelCtx.arc(cx,cy,30,0,2*Math.PI); wheelCtx.fillStyle='#f0a050'; wheelCtx.fill(); wheelCtx.strokeStyle='#0a0f1a'; wheelCtx.lineWidth=3; wheelCtx.stroke();
    wheelCtx.fillStyle='#fff'; wheelCtx.font='bold 14px sans-serif'; wheelCtx.textAlign='center'; wheelCtx.textBaseline='middle'; wheelCtx.fillText('GO', cx, cy);
    wheelCtx.beginPath(); wheelCtx.moveTo(cx,cy-radius+8); wheelCtx.lineTo(cx-8,cy-radius-8); wheelCtx.lineTo(cx+8,cy-radius-8); wheelCtx.closePath(); wheelCtx.fillStyle='#e74c3c'; wheelCtx.fill();
}
function spinWheel() {
    if (spinning || !wheelCtx || !wheelCanvas) return;
    spinning = true;
    const targetSlice = Math.floor(Math.random() * tankList.length), sliceAngle = (2*Math.PI)/tankList.length;
    const targetMiddleAngle = targetSlice*sliceAngle+sliceAngle/2, fullSpins = 5+Math.floor(Math.random()*5);
    const targetAngle = fullSpins*2*Math.PI + (2*Math.PI-targetMiddleAngle) + Math.PI/2;
    const startAngle = wheelAngle, duration = 4000, startTime = performance.now();
    function animate(now) {
        const elapsed = now - startTime, progress = Math.min(elapsed/duration, 1), ease = 1 - Math.pow(1-progress,3);
        wheelAngle = startAngle + targetAngle * ease; drawWheel(wheelAngle);
        if (progress < 1) requestAnimationFrame(animate);
        else {
            wheelAngle %= (2*Math.PI);
            const normalizedAngle = (wheelAngle+Math.PI*2)%(Math.PI*2), pointerAngle = (2*Math.PI-normalizedAngle+Math.PI/2)%(2*Math.PI);
            const finalSlice = Math.floor(pointerAngle/sliceAngle) % tankList.length;
            const resultEl = getEl('wheelResult'); if (resultEl) resultEl.textContent = `🎉 抽中：${tankList[finalSlice]}`;
            spinning = false;
        }
    }
    requestAnimationFrame(animate);
}
getEl('spinWheelBtn')?.addEventListener('click', spinWheel);
getEl('wheelCanvas')?.addEventListener('click', spinWheel);

// ==================== 定制化需求 ====================
if (customRequestCard) customRequestCard.addEventListener('click', () => { if (customRequestModal) customRequestModal.style.display = 'flex'; });
if (closeCustomRequestBtn) closeCustomRequestBtn.addEventListener('click', () => { if (customRequestModal) customRequestModal.style.display = 'none'; });
if (customRequestModal) customRequestModal.addEventListener('click', (e) => { if (e.target === customRequestModal) customRequestModal.style.display = 'none'; });
if (customRequestForm) customRequestForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const token = safeGetItem('token'); if (!token) { if (customRequestError) customRequestError.textContent = '请先登录'; return; }
    const client_type = getEl('customClientType')?.value;
    const request_type = getEl('customRequestType')?.value.trim();
    const description = getEl('customDescription')?.value.trim();
    const contact = getEl('customContact')?.value.trim();
    const budget = getEl('customBudget')?.value.trim();
    const available_time = getEl('customAvailableTime')?.value.trim();
    const remark = getEl('customRemark')?.value.trim();
    if (!client_type || !request_type || !description || !contact) { if (customRequestError) customRequestError.textContent = '请填写所有必填项'; return; }
    try {
        const res = await fetch(`${API_BASE}/custom-request`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ client_type, request_type, description, contact, budget, available_time, remark }) });
        const data = await res.json();
        if (res.ok) { showToast('✅ 定制需求已提交'); if (customRequestModal) customRequestModal.style.display = 'none'; customRequestForm.reset(); if (customRequestError) customRequestError.textContent = ''; }
        else { if (customRequestError) customRequestError.textContent = data.error || '提交失败'; }
    } catch (err) { if (customRequestError) customRequestError.textContent = '网络错误'; }
});

// ==================== 联赛相关 ====================
function renderLeagueCards() {
    const grid = getEl('leagueNewsGrid'); if (!grid) return;
    grid.innerHTML = leagueData.map(item => `
        <div class="league-news-card" data-league-id="${item.id}">
            <h4>${item.title}</h4>
            <p class="league-card-time">${item.time}</p>
            <p class="league-card-summary">${item.summary}</p>
        </div>
    `).join('');
    document.querySelectorAll('.league-news-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.dataset.leagueId);
            const data = leagueData.find(d => d.id === id);
            if (data) showLeagueDetail(data);
        });
    });
}
function showLeagueDetail(item) {
    item.time = item.time || item.created_at;
    if (getEl('leagueDetailTitle')) getEl('leagueDetailTitle').textContent = item.title;
    if (getEl('leagueDetailTime')) getEl('leagueDetailTime').textContent = `发布时间：${item.time}`;
    if (getEl('leagueDetailContent')) getEl('leagueDetailContent').innerHTML = renderContentWithImages(item.content);
    const modal = getEl('leagueDetailModal'); if (modal) modal.style.display = 'flex';
}
getEl('closeLeagueDetailBtn')?.addEventListener('click', () => { const m = getEl('leagueDetailModal'); if (m) m.style.display = 'none'; });
getEl('leagueDetailModal')?.addEventListener('click', (e) => { if (e.target === getEl('leagueDetailModal')) e.target.style.display = 'none'; });

document.querySelectorAll('.league-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.league-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (tab.dataset.leagueView === 'standings') {
            const sv = getEl('leagueStandingsView'), nv = getEl('leagueNewsView');
            if (sv) sv.style.display = 'block';
            if (nv) nv.style.display = 'none';
            loadLeagueStandings();
        } else {
            const sv = getEl('leagueStandingsView'), nv = getEl('leagueNewsView');
            if (sv) sv.style.display = 'none';
            if (nv) nv.style.display = 'block';
            loadLeagueNews();
        }
    });
});
async function loadLeagueStandings() {
    const container = getEl('leagueStandingsContainer');
    if (!container) return;
    container.innerHTML = '加载中...';
    const token = safeGetItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/leagues`, { headers: { 'Authorization': `Bearer ${token}` } });
        const seasons = await res.json();
        if (!seasons.length) { container.innerHTML = '<p>暂无赛季</p>'; return; }
        const seasonId = seasons[0].id;
        const rankingRes = await fetch(`${API_BASE}/league/${seasonId}/rankings`);
        const data = await rankingRes.json();
        const roundDays = ['R1D1','R1D2','R2D1','R2D2','R3D1','R3D2','R4D1','R4D2','R5D1','R5D2'];
        let html = `<h3>${data.season.name} 积分榜</h3><table><thead><tr><th>排名</th><th>队伍</th><th>积分</th>${roundDays.map(k => `<th>${k}</th>`).join('')}<th>变化</th></tr></thead><tbody>`;
        data.rankings.forEach(t => {
            const change = t.change > 0 ? `↑${t.change}` : t.change < 0 ? `↓${Math.abs(t.change)}` : '—';
            const changeColor = t.change > 0 ? 'var(--green)' : t.change < 0 ? 'var(--red)' : 'var(--text-muted)';
            html += `<tr><td>${t.rank}</td><td>${t.name}</td><td>${t.total}</td>${roundDays.map(k => `<td>${t.rounds[k] || 0}</td>`).join('')}<td style="color:${changeColor}">${change}</td></tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (err) { container.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}

// ==================== 联赛管理后台（完整） ====================
document.querySelectorAll('.league-admin-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.league-admin-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const panel = btn.dataset.panel;
        document.querySelectorAll('.league-panel').forEach(p => p.style.display = 'none');
        const targetPanelId = panel === 'league-config' ? 'leagueConfigPanel' : (panel === 'league-teams' ? 'leagueTeamsPanel' : 'leagueScoresPanel');
        const targetPanel = getEl(targetPanelId);
        if (targetPanel) targetPanel.style.display = 'block';
        if (panel === 'league-config') loadLeagueConfig();
        else if (panel === 'league-teams') loadLeagueTeams();
        else if (panel === 'league-scores') loadLeagueScoresPanel();
    });
});

let selectedSeasonId = null;

async function loadLeagueConfig() {
    const panel = getEl('leagueConfigPanel'); if (!panel) return;
    panel.innerHTML = '加载中...';
    const token = safeGetItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/leagues`, { headers: { 'Authorization': `Bearer ${token}` } });
        const seasons = await res.json();
        let html = '<h4>赛季列表</h4><ul>';
        seasons.forEach(s => {
            html += `<li>${s.name} (R${s.current_round}D${s.current_day}) <button onclick="editLeagueSeason(${s.id})">编辑</button> <button onclick="deleteLeagueSeason(${s.id})">删除</button></li>`;
        });
        html += '</ul><hr><h4>新建赛季</h4><input type="text" id="seasonName" placeholder="赛季名称"><button onclick="saveLeagueSeason()">创建</button>';
        html += '<div id="rulesSection" style="margin-top:16px;"></div>';
        panel.innerHTML = html;
        if (seasons.length > 0) { selectedSeasonId = seasons[0].id; loadRules(selectedSeasonId); }
    } catch (err) { panel.innerHTML = '加载失败'; }
}
async function loadRules(seasonId) {
    const token = safeGetItem('token');
    const rulesSection = getEl('rulesSection'); if (!rulesSection) return;
    rulesSection.innerHTML = '加载规则中...';
    try {
        const res = await fetch(`${API_BASE}/admin/leagues/${seasonId}/rules`, { headers: { 'Authorization': `Bearer ${token}` } });
        const rules = await res.json();
        let html = '<h4>积分规则 (每轮次每天每名次分数)</h4>';
        for (let r = 1; r <= 5; r++) {
            for (let d = 1; d <= 2; d++) {
                html += `<div style="margin-bottom:8px;"><strong>R${r}D${d}</strong>`;
                for (let pos = 1; pos <= 4; pos++) {
                    const existing = rules.find(ru => ru.round_num === r && ru.day_num === d && ru.rank_position === pos);
                    const val = existing ? existing.points : '';
                    html += ` 名次${pos}: <input type="number" id="rule_${r}_${d}_${pos}" value="${val}" style="width:60px;">`;
                }
                html += '</div>';
            }
        }
        html += `<button onclick="saveRules(${seasonId})">保存规则</button>`;
        rulesSection.innerHTML = html;
    } catch (err) { rulesSection.innerHTML = '加载规则失败'; }
}
async function saveRules(seasonId) {
    const token = safeGetItem('token');
    const rules = [];
    for (let r = 1; r <= 5; r++) {
        for (let d = 1; d <= 2; d++) {
            for (let pos = 1; pos <= 4; pos++) {
                const el = getEl(`rule_${r}_${d}_${pos}`);
                if (el && el.value !== '') {
                    rules.push({ round_num: r, day_num: d, rank_position: pos, points: parseInt(el.value) });
                }
            }
        }
    }
    try {
        const res = await fetch(`${API_BASE}/admin/leagues/${seasonId}/rules`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ rules }) });
        const data = await res.json();
        if (res.ok) showToast('✅ 规则已保存'); else showToast('❌ ' + (data.error||'保存失败'));
    } catch (err) { showToast('❌ 网络错误'); }
}
window.editLeagueSeason = async function(id) {
    const token = safeGetItem('token');
    const name = prompt('修改赛季名称');
    if (!name) return;
    const round = prompt('当前轮次 (1-5)');
    const day = prompt('当前天数 (1-2)');
    try {
        const res = await fetch(`${API_BASE}/admin/leagues`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ id, name, current_round: parseInt(round)||1, current_day: parseInt(day)||1 }) });
        const data = await res.json();
        if (res.ok) { showToast('✅ 赛季已更新'); loadLeagueConfig(); } else showToast('❌ ' + (data.error||'更新失败'));
    } catch (err) { showToast('❌ 网络错误'); }
};
window.deleteLeagueSeason = async function(id) {
    if (!confirm('确定删除该赛季吗？')) return;
    const token = safeGetItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/leagues/${id}`, { method:'DELETE', headers:{'Authorization':`Bearer ${token}`} });
        const data = await res.json();
        if (res.ok) { showToast('🗑️ 赛季已删除'); loadLeagueConfig(); } else showToast('❌ ' + (data.error||'删除失败'));
    } catch (err) { showToast('❌ 网络错误'); }
};
window.saveLeagueSeason = async function() {
    const nameEl = getEl('seasonName');
    if (!nameEl) return;
    const name = nameEl.value.trim();
    if (!name) return showToast('❌ 请输入赛季名称');
    const token = safeGetItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/leagues`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ name }) });
        const data = await res.json();
        if (res.ok) { showToast('✅ 赛季已创建'); loadLeagueConfig(); } else showToast('❌ ' + (data.error||'创建失败'));
    } catch (err) { showToast('❌ 网络错误'); }
};

// 队伍表
async function loadLeagueTeams() {
    const panel = getEl('leagueTeamsPanel'); if (!panel) return;
    panel.innerHTML = '加载中...';
    const token = safeGetItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/teams`, { headers: { 'Authorization': `Bearer ${token}` } });
        const teams = await res.json();
        let html = '<h4>队伍列表</h4>';
        if (teams.length === 0) {
            html += '<p>暂无队伍，请添加</p>';
        } else {
            html += '<ul>';
            teams.forEach(t => {
                html += `<li><span class="team-name">${t.name}</span> <button onclick="editTeam(${t.id}, '${t.name.replace(/'/g, "\\'")}')">编辑</button> <button onclick="deleteTeam(${t.id})">删除</button></li>`;
            });
            html += '</ul>';
        }
        html += `<hr><h4>添加队伍</h4>
            <input type="text" id="newTeamName" placeholder="队伍名称" style="margin-right:8px;">
            <button onclick="addTeam()">添加</button>
            <p id="teamMsg" style="margin-top:8px; color:var(--green);"></p>`;
        panel.innerHTML = html;
    } catch (err) { panel.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}
window.addTeam = async function() {
    const nameEl = getEl('newTeamName');
    if (!nameEl) return;
    const name = nameEl.value.trim();
    if (!name) return showToast('❌ 请输入队伍名');
    const token = safeGetItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/teams`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ name }) });
        const data = await res.json();
        if (res.ok) { showToast('✅ 队伍已添加'); loadLeagueTeams(); }
        else showToast('❌ ' + (data.error||'添加失败'));
    } catch (err) { showToast('❌ 网络错误'); }
};
window.editTeam = async function(id, oldName) {
    const newName = prompt('修改队伍名称', oldName);
    if (!newName || newName === oldName) return;
    const token = safeGetItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/teams`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ id, name: newName }) });
        const data = await res.json();
        if (res.ok) { showToast('✅ 队伍已更新'); loadLeagueTeams(); }
        else showToast('❌ ' + (data.error||'更新失败'));
    } catch (err) { showToast('❌ 网络错误'); }
};
window.deleteTeam = async function(id) {
    if (!confirm('确定删除该队伍吗？')) return;
    const token = safeGetItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/teams/${id}`, { method:'DELETE', headers:{'Authorization':`Bearer ${token}`} });
        const data = await res.json();
        if (res.ok) { showToast('🗑️ 队伍已删除'); loadLeagueTeams(); }
        else showToast('❌ ' + (data.error||'删除失败'));
    } catch (err) { showToast('❌ 网络错误'); }
};

// 成绩表
async function loadLeagueScoresPanel() {
    const panel = getEl('leagueScoresPanel'); if (!panel) return;
    panel.innerHTML = '加载中...';
    const token = safeGetItem('token');
    try {
        const seasonsRes = await fetch(`${API_BASE}/admin/leagues`, { headers: { 'Authorization': `Bearer ${token}` } });
        const seasons = await seasonsRes.json();
        if (!seasons.length) { panel.innerHTML = '<p>请先创建赛季</p>'; return; }
        const teamsRes = await fetch(`${API_BASE}/admin/teams`, { headers: { 'Authorization': `Bearer ${token}` } });
        const teams = await teamsRes.json();
        if (!teams.length) { panel.innerHTML = '<p>请先添加队伍</p>'; return; }
        let html = '<h4>录入成绩</h4>';
        html += '<label>赛季：</label><select id="scoreSeason">';
        seasons.forEach(s => html += `<option value="${s.id}">${s.name} (R${s.current_round}D${s.current_day})</option>`);
        html += '</select>';
        html += '<label style="margin-left:10px;">轮次：</label><select id="scoreRound">';
        for (let r=1; r<=5; r++) html += `<option value="${r}">R${r}</option>`;
        html += '</select>';
        html += '<label style="margin-left:10px;">天次：</label><select id="scoreDay">';
        html += '<option value="1">第1天</option><option value="2">第2天</option>';
        html += '</select>';
        html += '<button onclick="loadScoreForm()" style="margin-left:10px;">加载队伍</button>';
        html += '<div id="scoreForm" style="margin-top:16px;"></div>';
        panel.innerHTML = html;
    } catch (err) { panel.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}
window.loadScoreForm = async function() {
    const seasonIdEl = getEl('scoreSeason');
    const roundEl = getEl('scoreRound');
    const dayEl = getEl('scoreDay');
    if (!seasonIdEl || !roundEl || !dayEl) return;
    const seasonId = seasonIdEl.value;
    const round = roundEl.value;
    const day = dayEl.value;
    const token = safeGetItem('token');
    const formDiv = getEl('scoreForm');
    if (!formDiv) return;
    formDiv.innerHTML = '加载队伍...';
    try {
        const scoresRes = await fetch(`${API_BASE}/admin/leagues/${seasonId}/scores/${round}/${day}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const existingScores = await scoresRes.json();
        const scoreMap = {};
        existingScores.forEach(s => scoreMap[s.team_id] = s.rank_position);
        const teamsRes = await fetch(`${API_BASE}/admin/teams`, { headers: { 'Authorization': `Bearer ${token}` } });
        const teams = await teamsRes.json();
        let html = '<table><tr><th>队伍</th><th>名次 (1-4)</th></tr>';
        teams.forEach(t => {
            const currentRank = scoreMap[t.id] || '';
            html += `<tr><td>${t.name}</td><td><input type="number" id="rank_${t.id}" min="1" max="4" value="${currentRank}" style="width:60px;"></td></tr>`;
        });
        html += '</table>';
        html += `<button onclick="submitScores(${seasonId}, ${round}, ${day})" style="margin-top:10px;">提交成绩</button>`;
        formDiv.innerHTML = html;
    } catch (err) { formDiv.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
};
window.submitScores = async function(seasonId, round, day) {
    const token = safeGetItem('token');
    const scores = [];
    const teamInputs = document.querySelectorAll('[id^="rank_"]');
    teamInputs.forEach(input => {
        const teamId = parseInt(input.id.split('_')[1]);
        const rank = parseInt(input.value);
        if (!isNaN(rank) && rank >= 1 && rank <= 4) {
            scores.push({ team_id: teamId, rank_position: rank });
        }
    });
    if (scores.length === 0) return showToast('❌ 请至少填写一个队伍的名次');
    try {
        const res = await fetch(`${API_BASE}/admin/leagues/${seasonId}/scores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ round_num: parseInt(round), day_num: parseInt(day), scores })
        });
        const data = await res.json();
        if (res.ok) { showToast('✅ 成绩已提交'); }
        else showToast('❌ ' + (data.error||'提交失败'));
    } catch (err) { showToast('❌ 网络错误'); }
};

// ==================== 积分商城 ====================
async function loadShopItems() {
  const container = getEl('shopItemsContainer');
  if (!container) return;
  container.innerHTML = '加载中...';
  try {
    const res = await fetch(`${API_BASE}/shop/items`);
    const items = await res.json();
    if (!items.length) {
      container.innerHTML = '<p>暂无商品</p>';
      return;
    }
    let html = '';
    items.forEach(item => {
      html += `
        <div class="card" style="text-align:center;">
          <img src="${item.image || 'qy-coin.png'}" style="width:100px; height:100px; object-fit:contain; margin-bottom:10px;" onerror="this.src='qy-coin.png'">
          <h4>${item.name}</h4>
          <p style="color:var(--text-secondary); font-size:0.9rem;">${item.description || ''}</p>
          <p style="color:#f0c060; font-weight:700;">🪙 ${item.price_credits} 积分</p>
          <button class="submit-btn buy-item-btn" data-itemid="${item.id}" data-name="${item.name}">购买</button>
        </div>
      `;
    });
    container.innerHTML = html;
    document.querySelectorAll('.buy-item-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const itemId = btn.dataset.itemid;
        const itemName = btn.dataset.name;
        if (!confirm(`确定用积分购买 ${itemName} 吗？`)) return;
        const token = safeGetItem('token');
        if (!token) { showToast('请先登录'); return; }
        try {
          const res = await fetch(`${API_BASE}/shop/buy/${itemId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (res.ok) {
            showToast('购买成功！');
            loadShopItems();
          } else {
            showToast(data.error || '购买失败');
          }
        } catch (err) { showToast('网络错误'); }
      });
    });
  } catch (err) { container.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}


// ==================== 设置面板核心 ====================
if (settingsBtn) settingsBtn.addEventListener('click', () => showSection('settings'));

// 加载设置面板主框架
async function loadSettingsPanel() {
    const content = getEl('settingsContent');
    if (!content) return;
    content.innerHTML = '<p>加载中...</p>';
    const token = safeGetItem('token');
    if (!token) { content.innerHTML = '<p style="color:var(--red)">请先登录</p>'; return; }
    try {
        const res = await fetch(`${API_BASE}/user/settings`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('获取设置失败');
        const settings = await res.json();
        window._userSettings = settings;  // 缓存设置供子面板使用
        bindSettingsNav();
        // 默认显示第一个（账号与安全）
        const firstBtn = document.querySelector('.settings-nav-btn');
        if (firstBtn) {
            firstBtn.classList.add('active');
            showSettingSection(firstBtn.dataset.setting);
        }
    } catch (e) {
        content.innerHTML = '<p style="color:var(--red)">加载设置失败</p>';
    }
}

// 绑定左侧导航点击
function bindSettingsNav() {
    const navBtns = document.querySelectorAll('.settings-nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            showSettingSection(btn.dataset.setting);
        });
    });
}

// 根据导航名称显示右侧内容
function showSettingSection(name) {
    switch (name) {
        case 'account-security': renderAccountSecurity(); break;
        case 'appearance': renderAppearance(); break;
        case 'notifications': renderNotifications(); break;
        case 'privacy': renderPrivacy(); break;
        case 'order-defaults': renderOrderDefaults(); break;
        case 'language': renderLanguage(); break;
        case 'messages': loadMessages(); break;
        case 'devices': loadDevices(); break;
    }
}

// ---------- 账号与安全 ----------
function renderAccountSecurity() {
    const content = getEl('settingsContent');
    content.innerHTML = `
        <div class="card"><h4>修改用户名</h4>
            <input type="text" id="newUsername" placeholder="新用户名" class="remark-input" style="margin-bottom:8px;">
            <button id="changeUsernameBtn" class="submit-btn">更新用户名</button>
            <p id="usernameMsg" style="margin-top:4px; font-size:0.85rem;"></p>
        </div>
        <div class="card"><h4>修改密码</h4>
            <input type="password" id="oldPassword" placeholder="原密码" class="remark-input" style="margin-bottom:8px;">
            <input type="password" id="newPassword" placeholder="新密码" class="remark-input" style="margin-bottom:8px;">
            <button id="changePasswordBtn" class="submit-btn">更新密码</button>
            <p id="passwordMsg" style="margin-top:4px; font-size:0.85rem;"></p>
        </div>
        <div class="card"><h4>绑定手机</h4>
            <input type="tel" id="phoneInput" placeholder="手机号" class="remark-input" style="margin-bottom:8px;">
            <button id="changePhoneBtn" class="submit-btn">更新手机</button>
            <p id="phoneMsg" style="margin-top:4px; font-size:0.85rem;"></p>
        </div>
        <div class="card"><h4>绑定邮箱</h4>
            <input type="email" id="emailInput" placeholder="邮箱" class="remark-input" style="margin-bottom:8px;">
            <button id="changeEmailBtn" class="submit-btn">更新邮箱</button>
            <p id="emailMsg" style="margin-top:4px; font-size:0.85rem;"></p>
        </div>`;

    // 绑定修改事件（与之前相同，此处省略具体 fetch 代码，实际使用时请复制之前给出的完整事件绑定）
    bindAccountSecurityEvents();
}

function bindAccountSecurityEvents() {
    getEl('changeUsernameBtn')?.addEventListener('click', async () => {
        const newUsername = getEl('newUsername').value.trim();
        if (!newUsername) return showToast('请输入新用户名');
        const token = safeGetItem('token');
        const res = await fetch(`${API_BASE}/user/change-username`, {
            method: 'PUT', headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ newUsername })
        });
        const data = await res.json();
        getEl('usernameMsg').textContent = data.message || data.error;
        if (res.ok) { safeSetItem('username', newUsername); displayUsername.textContent = newUsername; }
    });

    getEl('changePasswordBtn')?.addEventListener('click', async () => {
        const oldPassword = getEl('oldPassword').value;
        const newPassword = getEl('newPassword').value;
        if (!oldPassword || !newPassword) return showToast('请填写完整');
        const token = safeGetItem('token');
        const res = await fetch(`${API_BASE}/user/change-password`, {
            method: 'PUT', headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ oldPassword, newPassword })
        });
        const data = await res.json();
        getEl('passwordMsg').textContent = data.message || data.error;
        if (res.ok) { getEl('oldPassword').value = ''; getEl('newPassword').value = ''; }
    });

    getEl('changePhoneBtn')?.addEventListener('click', async () => {
        const phone = getEl('phoneInput').value.trim();
        if (!phone) return showToast('请输入手机号');
        const token = safeGetItem('token');
        const res = await fetch(`${API_BASE}/user/change-phone`, {
            method: 'PUT', headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ phone })
        });
        const data = await res.json();
        getEl('phoneMsg').textContent = data.message || data.error;
    });

    getEl('changeEmailBtn')?.addEventListener('click', async () => {
        const email = getEl('emailInput').value.trim();
        if (!email) return showToast('请输入邮箱');
        const token = safeGetItem('token');
        const res = await fetch(`${API_BASE}/user/change-email`, {
            method: 'PUT', headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        getEl('emailMsg').textContent = data.message || data.error;
    });
}

// ---------- 外观（深空黑 / 极昼白） ----------
function renderAppearance() {
    const settings = window._userSettings || {};
    const currentTheme = settings.theme || 'dark';
    const content = getEl('settingsContent');
    content.innerHTML = `
        <div class="card"><h4>站内风格</h4>
            <div style="display:flex; gap:20px; margin-top:12px;">
                <label class="client-option ${currentTheme==='dark'?'active':''}">
                    <input type="radio" name="theme" value="dark" ${currentTheme==='dark'?'checked':''}> 🌑 深空黑
                </label>
                <label class="client-option ${currentTheme==='light'?'active':''}">
                    <input type="radio" name="theme" value="light" ${currentTheme==='light'?'checked':''}> 🌕 极昼白
                </label>
            </div>
            <button id="saveThemeBtn" class="submit-btn" style="margin-top:12px;">保存主题</button>
        </div>`;
    getEl('saveThemeBtn')?.addEventListener('click', async () => {
        const theme = document.querySelector('input[name="theme"]:checked')?.value || 'dark';
        const token = safeGetItem('token');
        await fetch(`${API_BASE}/user/settings`, {
            method: 'PUT', headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ theme })
        });
        applyTheme(theme);
        showToast('主题已切换');
    });
}

function applyTheme(theme) {
    if (theme === 'light') {
        document.body.classList.add('theme-light');
    } else {
        document.body.classList.remove('theme-light');
    }
    safeSetItem('theme', theme);
}

function applySavedTheme() {
    const theme = safeGetItem('theme') || 'dark';
    applyTheme(theme);
    // 可选：从服务器同步
    const token = safeGetItem('token');
    if (token) {
        fetch(`${API_BASE}/user/settings`, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(res => res.json())
            .then(data => { if (data?.theme) applyTheme(data.theme); })
            .catch(() => {});
    }
}

// ---------- 通知与提醒 ----------
function renderNotifications() {
    const settings = window._userSettings || {};
    const content = getEl('settingsContent');
    content.innerHTML = `
        <div class="card"><h4>通知与提醒</h4>
            <label class="urgent-toggle" style="margin-top:12px;">
                <input type="checkbox" id="notifyOrderUpdate" ${settings.notify_order_update ? 'checked' : ''}>
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
                <span class="toggle-label">订单状态更新通知</span>
            </label>
            <label class="urgent-toggle" style="margin-top:12px;">
                <input type="checkbox" id="notifyPromotion" ${settings.notify_promotion ? 'checked' : ''}>
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
                <span class="toggle-label">营销消息</span>
            </label>
            <button id="saveNotifyBtn" class="submit-btn" style="margin-top:12px;">保存</button>
        </div>`;
    getEl('saveNotifyBtn')?.addEventListener('click', async () => {
        const notify_order_update = getEl('notifyOrderUpdate').checked ? 1 : 0;
        const notify_promotion = getEl('notifyPromotion').checked ? 1 : 0;
        const token = safeGetItem('token');
        await fetch(`${API_BASE}/user/settings`, {
            method: 'PUT', headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ notify_order_update, notify_promotion })
        });
        showToast('通知设置已保存');
    });
}

// ---------- 隐私与显示 ----------
function renderPrivacy() {
    const settings = window._userSettings || {};
    const content = getEl('settingsContent');
    content.innerHTML = `
        <div class="card"><h4>隐私与显示</h4>
            <label class="urgent-toggle" style="margin-top:12px;">
                <input type="checkbox" id="showPhone" ${settings.privacy_show_phone_to_booster ? 'checked' : ''}>
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
                <span class="toggle-label">向打手显示我的手机号</span>
            </label>
            <label class="urgent-toggle" style="margin-top:12px;">
                <input type="checkbox" id="showEmail" ${settings.privacy_show_email_to_booster ? 'checked' : ''}>
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
                <span class="toggle-label">向打手显示我的邮箱</span>
            </label>
            <button id="savePrivacyBtn" class="submit-btn" style="margin-top:12px;">保存</button>
        </div>`;
    getEl('savePrivacyBtn')?.addEventListener('click', async () => {
        const privacy_show_phone_to_booster = getEl('showPhone').checked ? 1 : 0;
        const privacy_show_email_to_booster = getEl('showEmail').checked ? 1 : 0;
        const token = safeGetItem('token');
        await fetch(`${API_BASE}/user/settings`, {
            method: 'PUT', headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ privacy_show_phone_to_booster, privacy_show_email_to_booster })
        });
        showToast('隐私设置已保存');
    });
}

// ---------- 订单默认设置 ----------
function renderOrderDefaults() {
    const settings = window._userSettings || {};
    const content = getEl('settingsContent');
    content.innerHTML = `
        <div class="card"><h4>订单默认设置</h4>
            <div class="form-group"><label>默认客户端</label>
                <select id="defaultClientType">
                    <option value="Android" ${settings.default_client_type==='Android'?'selected':''}>Android</option>
                    <option value="iOS" ${settings.default_client_type==='iOS'?'selected':''}>iOS</option>
                </select>
            </div>
            <label class="urgent-toggle" style="margin-top:12px;">
                <input type="checkbox" id="defaultUrgent" ${settings.default_urgent ? 'checked' : ''}>
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
                <span class="toggle-label">默认开启加急</span>
            </label>
            <div class="form-group" style="margin-top:12px;"><label>默认备注模板</label>
                <textarea id="defaultRemarkTemplate" rows="2" class="remark-input">${settings.default_remark_template || ''}</textarea>
            </div>
            <button id="saveOrderDefaultsBtn" class="submit-btn" style="margin-top:12px;">保存</button>
        </div>`;
    getEl('saveOrderDefaultsBtn')?.addEventListener('click', async () => {
        const default_client_type = getEl('defaultClientType').value;
        const default_urgent = getEl('defaultUrgent').checked ? 1 : 0;
        const default_remark_template = getEl('defaultRemarkTemplate').value;
        const token = safeGetItem('token');
        await fetch(`${API_BASE}/user/settings`, {
            method: 'PUT', headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ default_client_type, default_urgent, default_remark_template })
        });
        showToast('订单默认设置已保存');
    });
}

// ---------- 语言 / 地区 ----------
function renderLanguage() {
    const settings = window._userSettings || {};
    const currentLang = settings.language || 'zh';
    const content = getEl('settingsContent');
    content.innerHTML = `
        <div class="card"><h4>语言 / 地区</h4>
            <select id="languageSelect" style="width:200px;">
                <option value="zh" ${currentLang==='zh'?'selected':''}>简体中文</option>
                <option value="en" ${currentLang==='en'?'selected':''}>English</option>
            </select>
            <button id="saveLanguageBtn" class="submit-btn" style="margin-top:12px;">保存</button>
        </div>`;
    getEl('saveLanguageBtn')?.addEventListener('click', async () => {
        const language = getEl('languageSelect').value;
        const token = safeGetItem('token');
        await fetch(`${API_BASE}/user/settings`, {
            method: 'PUT', headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ language })
        });
        showToast('语言设置已保存');
    });
}

// 站内邮箱
async function loadMessages() {
    const content = getEl('settingsContent');
    content.innerHTML = '<p>加载中...</p>';
    const token = safeGetItem('token');
    const res = await fetch(`${API_BASE}/user/messages`, { headers: { 'Authorization': `Bearer ${token}` } });
    const messages = await res.json();
    if (!messages.length) { content.innerHTML = '<p>暂无消息</p>'; return; }
    let html = '<div style="display:flex; justify-content:space-between;"><h4>站内邮箱</h4><button id="markAllReadBtn" class="submit-btn" style="width:auto;">全部已读</button></div>';
    messages.forEach(msg => {
        html += `<div class="card" style="margin-bottom:8px; opacity:${msg.is_read?0.6:1}">
            <strong>${msg.title}</strong> <span style="font-size:0.75rem; color:var(--text-muted)">${new Date(msg.created_at).toLocaleString()}</span>
            <p style="margin-top:4px;">${msg.content}</p>
            ${!msg.is_read ? `<button class="mark-read-btn" data-id="${msg.id}">标记已读</button>` : ''}
        </div>`;
    });
    content.innerHTML = html;
    // 标记已读事件
    document.querySelectorAll('.mark-read-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            await fetch(`${API_BASE}/user/messages/${id}/read`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
            loadMessages();
        });
    });
    getEl('markAllReadBtn')?.addEventListener('click', async () => {
        await fetch(`${API_BASE}/user/messages/read-all`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
        loadMessages();
    });
}

// 登录设备
async function loadDevices() {
    const content = getEl('settingsContent');
    content.innerHTML = '<p>加载中...</p>';
    const token = safeGetItem('token');
    const res = await fetch(`${API_BASE}/user/devices`, { headers: { 'Authorization': `Bearer ${token}` } });
    const devices = await res.json();
    if (!devices.length) { content.innerHTML = '<p>暂无设备记录</p>'; return; }
    let html = '<h4>登录设备</h4>';
    devices.forEach(d => {
        html += `<div class="card" style="margin-bottom:8px;">
            <p><strong>设备：</strong>${d.device_info || '未知'}</p>
            <p><strong>IP：</strong>${d.ip_address}</p>
            <p><strong>时间：</strong>${new Date(d.login_time).toLocaleString()}</p>
        </div>`;
    });
    content.innerHTML = html;
}

// ==================== 账号租借模块 ====================

// 子标签切换
document.querySelectorAll('.rental-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.rental-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.rentaltab;
        document.querySelectorAll('.rental-view').forEach(v => v.style.display = 'none');
        if (target === 'hall') { getEl('rentalHallView').style.display = 'block'; loadRentalHall(); }
        else if (target === 'publish') { getEl('rentalPublishView').style.display = 'block'; }
        else if (target === 'rented') { getEl('rentalRentedView').style.display = 'block'; loadRentedOrders(); }
        else if (target === 'my') { getEl('rentalMyView').style.display = 'block'; loadMyRentalAccounts(); loadMyRentalOrders(); loadRentalEarnings(); }
    });
});

// 加载租号大厅
async function loadRentalHall() {
    const container = getEl('rentalHallList');
    if (!container) return;
    container.innerHTML = '加载中...';
    try {
        const res = await fetch(`${API_BASE}/rental/accounts`);
        const accounts = await res.json();
        if (!accounts.length) { container.innerHTML = '<p>暂无可租账号</p>'; return; }
        let html = '';
        accounts.forEach(acc => {
            const screenshots = acc.screenshots ? JSON.parse(acc.screenshots) : [];
            const imgHtml = screenshots.length ? `<img src="/uploads/${screenshots[0]}" style="width:100%; height:140px; object-fit:cover; border-radius:8px;">` : '';
            html += `
            <div class="rental-account-card" data-id="${acc.id}">
                ${imgHtml}
                <h4>${acc.game_uid || '未知UID'}</h4>
                <p>客户端：${acc.client_type} | 出租方：${acc.owner_name}</p>
                <p>信誉：${acc.owner_reputation} | 身份：${acc.owner_identity || 'standard'}</p>
                <p>时租：¥${acc.hourly_price} / 天租：¥${acc.daily_price}</p>
                <p style="font-size:0.75rem; color:var(--text-muted);">可用时段：${acc.available_time_desc || '无限制'}</p>
                <button class="rental-detail-btn" data-id="${acc.id}">查看详情</button>
            </div>`;
        });
        container.innerHTML = html;
        // 绑定详情按钮
        document.querySelectorAll('.rental-detail-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showRentalAccountDetail(btn.dataset.id);
            });
        });
    } catch (err) {
        container.innerHTML = '<p style="color:var(--red)">加载失败</p>';
    }
}

// 查看账号详情弹窗（含坦克清单和租用表单）
async function showRentalAccountDetail(accountId) {
    const token = safeGetItem('token');
    if (!token) { showToast('请先登录'); return; }
    try {
        const res = await fetch(`${API_BASE}/rental/accounts/${accountId}`);
        const account = await res.json();
        const screenshots = account.screenshots ? JSON.parse(account.screenshots) : [];
        const imgHtml = screenshots.map(s => `<img src="/uploads/${s}" style="max-width:100px; border-radius:6px;">`).join('');
        let html = `
            <p><strong>出租方：</strong>${account.owner_name}（信誉 ${account.owner_reputation}）</p>
            <p><strong>客户端：</strong>${account.client_type}</p>
            <p><strong>游戏UID：</strong>${account.game_uid || '未填写'}</p>
            <p><strong>坦克清单：</strong></p>
            <pre style="white-space:pre-wrap; max-height:200px; overflow-y:auto; background:#0f172a; padding:8px; border-radius:6px;">${account.tank_list || '未填写'}</pre>
            <p><strong>可用时段：</strong>${account.available_time_desc || '无限制'}</p>
            <p><strong>规则：</strong>${account.rules || '无'}</p>
            <p><strong>截图：</strong></p><div style="display:flex; gap:6px; flex-wrap:wrap;">${imgHtml}</div>
            <hr>
            <p><strong>租用</strong></p>
            <div style="display:flex; gap:10px; align-items:center;">
                <select id="rentalType" onchange="updateRentalPrice()">
                    <option value="hour">按时租</option>
                    <option value="day">按天租</option>
                </select>
                <input type="number" id="rentalQuantity" value="1" min="1" step="1" style="width:80px;" onchange="updateRentalPrice()">
                <span>单价：<span id="rentalUnitPrice">0</span>元</span>
            </div>
            <p>总价：<strong id="rentalTotalPrice">0.00</strong> 元</p>
            <p>可用积分抵扣：<input type="number" id="rentalUseCredits" value="0" min="0" step="100" style="width:100px;" onchange="updateRentalPrice()"> <span id="rentalDiscountAmt">¥0.00</span></p>
            <button id="submitRentBtn" class="submit-btn">确认租用</button>
            <p id="rentDetailMsg" style="margin-top:4px; font-size:0.8rem;"></p>
        `;

        // 显示在通用弹窗中（复用 orderDetailModal，但标题改为“账号详情”）
        const modal = getEl('orderDetailModal');
        const content = getEl('orderDetailContent');
        const title = modal.querySelector('h3');
        if (title) title.textContent = '🎮 账号详情';
        content.innerHTML = html;
        modal.style.display = 'flex';

        // 存储当前账号数据用于下单
        window._currentRentalAccount = account;
        updateRentalPrice(); // 首次计算

        // 绑定下单按钮（仅一次）
        const submitBtn = getEl('submitRentBtn');
        if (submitBtn) {
            submitBtn.onclick = async () => {
                const rentalType = getEl('rentalType').value;
                const quantity = parseInt(getEl('rentalQuantity').value) || 1;
                const useCredits = parseInt(getEl('rentalUseCredits').value) || 0;
                try {
                    const res = await fetch(`${API_BASE}/rental/orders`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ account_id: account.id, rental_type: rentalType, quantity, use_credits: useCredits })
                    });
                    const data = await res.json();
                    if (res.ok) {
                        showToast('✅ 租用订单已创建');
                        modal.style.display = 'none';
                    } else {
                        getEl('rentDetailMsg').textContent = data.error || '下单失败';
                    }
                } catch (err) {
                    getEl('rentDetailMsg').textContent = '网络错误';
                }
            };
        }
    } catch (err) {
        showToast('加载详情失败');
    }
}

function updateRentalPrice() {
    const account = window._currentRentalAccount;
    if (!account) return;
    const type = getEl('rentalType')?.value || 'hour';
    const qty = parseInt(getEl('rentalQuantity')?.value) || 1;
    const unitPrice = type === 'hour' ? account.hourly_price : account.daily_price;
    const total = unitPrice * qty;
    const credits = parseInt(getEl('rentalUseCredits')?.value) || 0;
    const discount = Math.min(credits / 100, total);
    const final = total - discount;
    if (getEl('rentalUnitPrice')) getEl('rentalUnitPrice').textContent = unitPrice.toFixed(2);
    if (getEl('rentalTotalPrice')) getEl('rentalTotalPrice').textContent = final.toFixed(2);
    if (getEl('rentalDiscountAmt')) getEl('rentalDiscountAmt').textContent = `¥${discount.toFixed(2)}`;
}

// 关闭订单详情弹窗时重置（复用原有关闭按钮，但避免干扰）
// 原有关闭逻辑已存在，无需额外处理。

// 发布出租：上传截图预览
(function() {
    const fileInput = getEl('rentalScreenshotFile');
    const previewDiv = getEl('rentalScreenshotPreview');
    let uploadedFiles = [];

    if (fileInput) {
        fileInput.addEventListener('change', async () => {
            const files = fileInput.files;
            for (let i = 0; i < Math.min(files.length, 3); i++) {
                const file = files[i];
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const base64 = e.target.result;
                    const token = safeGetItem('token');
                    const res = await fetch(`${API_BASE}/rental/upload-screenshot`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ screenshot: base64 })
                    });
                    const data = await res.json();
                    if (data.filename) {
                        uploadedFiles.push(data.filename);
                        const img = document.createElement('img');
                        img.src = `/uploads/${data.filename}`;
                        img.style = 'width:80px; height:80px; object-fit:cover; border-radius:6px;';
                        previewDiv.appendChild(img);
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // 提交出租申请
    getEl('submitRentalAccountBtn')?.addEventListener('click', async () => {
        const token = safeGetItem('token');
        if (!token) { showToast('请先登录'); return; }
        const body = {
            client_type: getEl('rentalClientType').value,
            game_uid: getEl('rentalGameUid').value.trim(),
            tank_list: getEl('rentalTankList').value.trim(),
            hourly_price: parseFloat(getEl('rentalHourly').value) || 0,
            daily_price: parseFloat(getEl('rentalDaily').value) || 0,
            available_time_desc: getEl('rentalAvailableTime').value.trim(),
            rules: getEl('rentalRules').value.trim(),
            screenshots: uploadedFiles
        };
        try {
            const res = await fetch(`${API_BASE}/rental/accounts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            const msgEl = getEl('rentalPublishMsg');
            if (res.ok) {
                msgEl.textContent = '✅ 申请已提交，等待审核';
                // 清空表单
                getEl('rentalGameUid').value = '';
                getEl('rentalTankList').value = '';
                getEl('rentalHourly').value = '0';
                getEl('rentalDaily').value = '0';
                getEl('rentalAvailableTime').value = '';
                getEl('rentalRules').value = '';
                previewDiv.innerHTML = '';
                uploadedFiles = [];
            } else {
                msgEl.textContent = '❌ ' + (data.error || '提交失败');
            }
        } catch (err) {
            getEl('rentalPublishMsg').textContent = '❌ 网络错误';
        }
    });
})();

// 我的租用订单
async function loadRentedOrders() {
    const container = getEl('rentalRentedList');
    if (!container) return;
    const token = safeGetItem('token');
    if (!token) { container.innerHTML = '<p>请先登录</p>'; return; }
    try {
        const res = await fetch(`${API_BASE}/rental/my-rented`, { headers: { 'Authorization': `Bearer ${token}` } });
        const orders = await res.json();
        if (!orders.length) { container.innerHTML = '<p>暂无租用记录</p>'; return; }
        let html = '<table><tr><th>订单号</th><th>账号</th><th>出租方</th><th>类型</th><th>数量</th><th>金额</th><th>状态</th><th>操作</th></tr>';
        orders.forEach(o => {
            html += `<tr>
                <td>${o.order_no}</td><td>${o.game_uid || '未知'}</td><td>${o.owner_name}</td>
                <td>${o.rental_type}</td><td>${o.quantity}</td><td>¥${o.total_price}</td>
                <td>${o.status}</td>
                <td>${o.status === 'pending' || o.status === 'active' ? `<button class="cancel-rental-btn" data-order="${o.order_no}">取消</button>` : ''}</td>
            </tr>`;
        });
        html += '</table>';
        container.innerHTML = html;
    } catch (err) { container.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}

// 我的出租：账号列表
async function loadMyRentalAccounts() {
    const container = getEl('myRentalAccountsList');
    if (!container) return;
    const token = safeGetItem('token');
    if (!token) { container.innerHTML = '<p>请先登录</p>'; return; }
    try {
        const res = await fetch(`${API_BASE}/rental/my-accounts`, { headers: { 'Authorization': `Bearer ${token}` } });
        const accounts = await res.json();
        if (!accounts.length) { container.innerHTML = '<p>你还没有发布出租账号</p>'; return; }
        let html = '<table><tr><th>UID</th><th>客户端</th><th>时租/天租</th><th>状态</th><th>操作</th></tr>';
        accounts.forEach(a => {
            html += `<tr>
                <td>${a.game_uid || '—'}</td><td>${a.client_type}</td>
                <td>¥${a.hourly_price} / ¥${a.daily_price}</td>
                <td>${a.status}</td>
                <td>
                    ${a.status === 'active' ? `<button class="shelve-btn" data-id="${a.id}" data-status="suspended">下架</button>` : ''}
                    ${a.status === 'suspended' ? `<button class="shelve-btn" data-id="${a.id}" data-status="active">上架</button>` : ''}
                </td>
            </tr>`;
        });
        html += '</table>';
        container.innerHTML = html;
    } catch (err) { container.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}

// 我的出租：订单列表
async function loadMyRentalOrders() {
    const container = getEl('myRentalOrdersList');
    if (!container) return;
    const token = safeGetItem('token');
    try {
        const res = await fetch(`${API_BASE}/rental/my-orders`, { headers: { 'Authorization': `Bearer ${token}` } });
        const orders = await res.json();
        if (!orders.length) { container.innerHTML = '<p>暂无出租订单</p>'; return; }
        let html = '<table><tr><th>订单号</th><th>租客</th><th>类型</th><th>数量</th><th>金额</th><th>状态</th><th>操作</th></tr>';
        orders.forEach(o => {
            html += `<tr>
                <td>${o.order_no}</td><td>${o.renter_name}</td>
                <td>${o.rental_type}</td><td>${o.quantity}</td><td>¥${o.total_price}</td>
                <td>${o.status}</td>
                <td>
                    ${o.status === 'pending' ? `<button class="confirm-rental-btn" data-order="${o.order_no}">确认</button>` : ''}
                    ${o.status === 'active' ? `<button class="complete-rental-btn" data-order="${o.order_no}">完成</button>` : ''}
                    ${o.status === 'pending' || o.status === 'active' ? `<button class="cancel-rental-btn" data-order="${o.order_no}">取消</button>` : ''}
                </td>
            </tr>`;
        });
        html += '</table>';
        container.innerHTML = html;
    } catch (err) { container.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}

async function loadRentalEarnings() {
    const token = safeGetItem('token');
    try {
        const res = await fetch(`${API_BASE}/rental/earnings`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        const el = getEl('rentalEarningsDisplay');
        if (el) el.textContent = data.earnings.toFixed(2);
    } catch (e) {}
}

// 事件委托：租号相关按钮
document.addEventListener('click', async (e) => {
    const token = safeGetItem('token');
    if (!token) return;

    // 上下架账号
    if (e.target.classList.contains('shelve-btn')) {
        const id = e.target.dataset.id;
        const status = e.target.dataset.status;
        try {
            const res = await fetch(`${API_BASE}/rental/accounts/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(status === 'active' ? '已上架' : '已下架');
                loadMyRentalAccounts();
            } else {
                showToast('❌ ' + (data.error || '操作失败'));
            }
        } catch (err) { showToast('网络错误'); }
    }

    // 确认租用
    if (e.target.classList.contains('confirm-rental-btn')) {
        const orderNo = e.target.dataset.order;
        try {
            const res = await fetch(`${API_BASE}/rental/orders/${orderNo}/confirm`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) { showToast('已确认租用'); loadMyRentalOrders(); }
            else { const data = await res.json(); showToast('❌ ' + (data.error || '失败')); }
        } catch (err) { showToast('网络错误'); }
    }

    // 完成租用
    if (e.target.classList.contains('complete-rental-btn')) {
        const orderNo = e.target.dataset.order;
        try {
            const res = await fetch(`${API_BASE}/rental/orders/${orderNo}/complete`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) { showToast('✅ 已完成，收益已计入'); loadMyRentalOrders(); loadRentalEarnings(); }
            else { const data = await res.json(); showToast('❌ ' + (data.error || '失败')); }
        } catch (err) { showToast('网络错误'); }
    }

    // 取消租用（通用）
    if (e.target.classList.contains('cancel-rental-btn')) {
        const orderNo = e.target.dataset.order;
        try {
            const res = await fetch(`${API_BASE}/rental/orders/${orderNo}/cancel`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) { showToast('已取消'); loadRentedOrders(); loadMyRentalOrders(); }
            else { const data = await res.json(); showToast('❌ ' + (data.error || '失败')); }
        } catch (err) { showToast('网络错误'); }
    }
});

// ==================== 动态内容加载（新增） ====================

async function loadAnnouncement() {
  const container = document.querySelector('.announcement-content');
  if (!container) return;
  try {
    const res = await fetch(`${API_BASE}/announcements`);
    const ann = await res.json();
    if (ann && ann.title) {
      container.innerHTML = `
        <h3>${ann.title}</h3>
        <p>${renderContentWithImages(ann.content)}</p>
        <hr style="border-color: var(--border); margin: 20px 0;">
        <h3>💳 收款码</h3>
        <p style="color: var(--text-secondary); margin-bottom: 16px;">请使用微信或支付宝扫描下方二维码付款</p>
        <img src="payment-qr.png" alt="收款码" style="max-width: 260px; border-radius: 12px; border: 2px solid var(--border);">
        <p style="color: var(--text-muted); font-size: 0.8rem; margin-top: 8px;">付款后请截图并联系客服确认</p>
      `;
    }
    // 若数据库无公告则保留原静态内容（无需改动）
  } catch (e) { /* 忽略，保持原有内容 */ }
}

async function loadGameNews() {
  const container = getEl('newsContainer');
  if (!container) return;
  try {
    const res = await fetch(`${API_BASE}/game-news`);
    const news = await res.json();
    if (news && news.length) {
      container.innerHTML = news.map(n => `
        <div class="news-item">
          <div class="news-title">${n.title}</div>
          <div class="news-time">${new Date(n.created_at).toLocaleString()}</div>
          <div class="news-content">${renderContentWithImages(n.content)}</div>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p>暂无新闻</p>';
    }
  } catch (e) { container.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}

async function loadLeagueNews() {
  const grid = getEl('leagueNewsGrid');
  if (!grid) return;
  try {
    const res = await fetch(`${API_BASE}/league-news`);
    const items = await res.json();
    if (items && items.length) {
      grid.innerHTML = items.map(item => `
        <div class="league-news-card" data-league-id="${item.id}">
          <h4>${item.title}</h4>
          <p class="league-card-time">${new Date(item.created_at).toLocaleString()}</p>
          <p class="league-card-summary">${item.summary || ''}</p>
        </div>
      `).join('');
      document.querySelectorAll('.league-news-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = parseInt(card.dataset.leagueId);
          const data = items.find(d => d.id === id);
          if (data) showLeagueDetail(data);
        });
      });
    } else {
      grid.innerHTML = '<p>暂无联赛新闻</p>';
    }
  } catch (e) { grid.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}

// ==================== 内容管理（管理员） ====================

function getEndpointForType(type) {
  const map = {
    'announcements': '/admin/announcements',
    'game-news': '/admin/game-news',
    'league-news': '/admin/league-news'
  };
  return map[type] || '';
}

async function loadContentManager(type) {
  const view = getEl('contentManagerView');
  const token = safeGetItem('token');
  if (!token) { view.innerHTML = '<p>请先登录</p>'; return; }
  const endpoint = getEndpointForType(type);
  if (!endpoint) return;
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const items = await res.json();
    window._contentItems = items;  // 缓存，方便编辑
    view.innerHTML = renderContentEditor(type, items);
    bindContentEditorEvents(type);
  } catch (err) {
    view.innerHTML = '<p style="color:var(--red)">加载失败</p>';
  }
}

function renderContentEditor(type, items) {
  let html = `
    <div style="margin-bottom: 16px;">
      <button class="submit-btn new-content-btn" data-type="${type}" style="width:auto; padding:8px 20px;">+ 新增</button>
    </div>`;
  if (items && items.length) {
    items.forEach(item => {
      html += `
      <div class="content-item-card" data-id="${item.id}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${item.title}</strong>
          <div>
            <button class="edit-content-btn" data-type="${type}" data-id="${item.id}">编辑</button>
            <button class="delete-content-btn" data-type="${type}" data-id="${item.id}">删除</button>
          </div>
        </div>
        <p style="font-size:0.8rem; color: var(--text-muted);">${new Date(item.created_at).toLocaleString()}</p>
        ${item.summary !== undefined ? `<p style="font-size:0.85rem; color: var(--text-secondary);">摘要: ${item.summary || '无'}</p>` : ''}
        <pre style="white-space: pre-wrap; font-family: inherit; margin-top: 8px;">${item.content.substring(0, 100)}...</pre>
      </div>`;
    });
  } else {
    html += '<p>暂无内容</p>';
  }
  return html;
}

function bindContentEditorEvents(type) {
  document.querySelector('.new-content-btn')?.addEventListener('click', () => showContentForm(type, null));

  document.querySelectorAll('.edit-content-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = window._contentItems?.find(i => i.id == id);
      if (item) showContentForm(type, item);
    });
  });

  document.querySelectorAll('.delete-content-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!confirm('确定删除吗？')) return;
      const token = safeGetItem('token');
      const endpoint = getEndpointForType(type);
      try {
        const res = await fetch(`${API_BASE}${endpoint}/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          showToast('已删除');
          loadContentManager(type);
        } else {
          const data = await res.json();
          showToast('❌ ' + (data.error || '删除失败'));
        }
      } catch (err) { showToast('网络错误'); }
    });
  });
}

// -------------------- 新编辑器逻辑 --------------------
let currentEditType = null;
let currentEditItem = null;

function showContentForm(type, item) {
  currentEditType = type;
  currentEditItem = item;
  getEl('contentEditorTitle').textContent = item ? '编辑内容' : '新增内容';
  getEl('contentEditorInputTitle').value = item ? item.title : '';
  getEl('contentEditorTextarea').value = item ? item.content : '';
  getEl('contentEditorError').textContent = '';
  getEl('contentEditorPreview').innerHTML = '';
  getEl('contentEditorModal').style.display = 'flex';
}

// 编辑器初始化（立即执行，因为 script 在 body 底部）
(function initContentEditor() {
  const saveBtn = getEl('contentEditorSaveBtn');
  const closeBtn = getEl('closeContentEditorBtn');
  const modal = getEl('contentEditorModal');
  const uploadBtn = getEl('contentEditorUploadBtn');
  const fileInput = getEl('contentEditorFileInput');
  const textarea = getEl('contentEditorTextarea');
  const preview = getEl('contentEditorPreview');
  const msgEl = getEl('contentEditorUploadMsg');

  if (!saveBtn || !modal) return; // 弹窗还未加载则退出（初次加载时可能无）

  saveBtn.addEventListener('click', async () => {
    const title = getEl('contentEditorInputTitle').value.trim();
    const content = textarea.value.trim();
    const errorEl = getEl('contentEditorError');
    if (!title || !content) {
      errorEl.textContent = '标题和内容不能为空';
      return;
    }
    const token = safeGetItem('token');
    const endpoint = getEndpointForType(currentEditType);
    const body = { title, content };
    if (currentEditItem) body.id = currentEditItem.id;
    if (currentEditType === 'league-news') {
      body.summary = content.replace(/!\[.*?\]\(.*?\)/g, '').replace(/\n/g, ' ').substring(0, 100);
    }
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        showToast(currentEditItem ? '已更新' : '已创建');
        modal.style.display = 'none';
        loadContentManager(currentEditType);
      } else {
        errorEl.textContent = data.error || '保存失败';
      }
    } catch (err) {
      errorEl.textContent = '网络错误';
    }
  });

  closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  uploadBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result;
      const token = safeGetItem('token');
      const res = await fetch(`${API_BASE}/upload-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ image: base64 })
      });
      const data = await res.json();
      if (data.url) {
        const imgMd = `![图片](${data.url})`;
        const start = textarea.selectionStart;
        textarea.value = textarea.value.substring(0, start) + imgMd + textarea.value.substring(textarea.selectionEnd);
        textarea.focus();
        const img = document.createElement('img');
        img.src = data.url;
        img.style = 'width:80px; height:80px; object-fit:cover; border-radius:6px; margin:4px;';
        preview.appendChild(img);
        msgEl.textContent = '图片已插入';
        setTimeout(() => msgEl.textContent = '', 2000);
      } else {
        msgEl.textContent = '上传失败';
      }
    };
    reader.readAsDataURL(file);
  });

  // 支持粘贴图片
  document.addEventListener('paste', async (e) => {
    if (modal.style.display !== 'flex') return;
    const items = e.clipboardData.items;
    for (let item of items) {
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const base64 = ev.target.result;
          const token = safeGetItem('token');
          const res = await fetch(`${API_BASE}/upload-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ image: base64 })
          });
          const data = await res.json();
          if (data.url) {
            const imgMd = `![图片](${data.url})`;
            const start = textarea.selectionStart;
            textarea.value = textarea.value.substring(0, start) + imgMd + textarea.value.substring(textarea.selectionEnd);
            textarea.focus();
          }
        };
        reader.readAsDataURL(blob);
        e.preventDefault();
        break;
      }
    }
  });
})();

// 简单的 Markdown 图片渲染（用于展示）
function renderContentWithImages(text) {
  if (!text) return '';
  let html = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%; border-radius:8px; margin:8px 0;">');
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  html = html.replace(/&lt;img\s/g, '<img ').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function switchContentManagerTab(type) {
  document.querySelectorAll('.content-mgr-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.content-mgr-tab[data-ctype="${type}"]`);
  if (activeTab) activeTab.classList.add('active');
  loadContentManager(type);
}

// ==================== 三方订单模块 ====================

// 菜单按钮点击
document.getElementById('thirdPartyOrdersBtn')?.addEventListener('click', () => showSection('thirdparty'));

// 提交新订单
document.getElementById('tpSubmitBtn')?.addEventListener('click', async () => {
    const token = safeGetItem('token');
    if (!token) { showToast('请先登录'); return; }
    const platform = getEl('tpPlatform').value.trim();
    const content = getEl('tpContent').value.trim();
    const account_info = getEl('tpAccount').value.trim();
    const price = parseFloat(getEl('tpPrice').value);
    const msgEl = getEl('tpMsg');
    if (!content || !account_info || isNaN(price)) {
        msgEl.textContent = '请填写内容、账号和价格';
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/third-party-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ platform, content, account_info, price })
        });
        const data = await res.json();
        if (res.ok) {
            msgEl.textContent = '✅ 订单已提交，等待审核';
            getEl('tpContent').value = '';
            getEl('tpAccount').value = '';
            getEl('tpPrice').value = '';
            loadThirdPartyOrders();
        } else {
            msgEl.textContent = '❌ ' + (data.error || '提交失败');
        }
    } catch (err) {
        msgEl.textContent = '❌ 网络错误';
    }
});

// 加载订单列表
async function loadThirdPartyOrders() {
    const container = getEl('tpOrderList');
    const token = safeGetItem('token');
    if (!token) { container.innerHTML = '<p>请先登录</p>'; return; }
    try {
        const res = await fetch(`${API_BASE}/third-party-orders`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const orders = await res.json();
        const role = safeGetItem('role');
        const userId = safeGetItem('userId');
        if (!orders.length) {
            container.innerHTML = '<p>暂无三方订单</p>';
            return;
        }
        let html = '<table><tr><th>订单号</th><th>平台</th><th>内容</th><th>账号</th><th>价格</th><th>创建者</th><th>状态</th><th>完单</th><th>支付</th><th>操作</th></tr>';
        orders.forEach(o => {
            const statusMap = { pending: '待审核', approved: '已通过', rejected: '已拒绝' };
            let completeCell = '';
            if (o.status === 'approved') {
                if (o.complete_requested) completeCell = '✅ 已申请';
                else if (role === 'admin' || o.creator_id == userId) {
                    completeCell = `<button class="tp-request-complete-btn" data-order="${o.order_no}">申请完单</button>`;
                }
            } else {
                completeCell = '—';
            }

            let payCell = '';
            if (o.payment_status === 'paid') payCell = '✅ 已支付';
            else if (role === 'admin') payCell = `<button class="tp-mark-paid-btn" data-order="${o.order_no}">标记已支付</button>`;
            else payCell = '未支付';

            html += `<tr>
                <td>${o.order_no}</td><td>${o.platform || '其他'}</td><td>${o.content}</td><td>${o.account_info}</td>
                <td>¥${o.price}</td><td>${o.creator_name || '—'}</td>
                <td>${statusMap[o.status] || o.status}</td>
                <td>${completeCell}</td>
                <td>${payCell}</td>
                <td>`;
            if (role === 'admin' && o.status === 'pending') {
                html += `<button class="tp-approve-btn" data-order="${o.order_no}">通过</button>
                         <button class="tp-reject-btn" data-order="${o.order_no}">拒绝</button>`;
            }
            if (role === 'admin' || o.creator_id == userId) {
                html += `<button class="tp-delete-btn" data-order="${o.order_no}">删除</button>`;
            }
            html += `</td></tr>`;
        });
        html += '</table>';
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<p style="color:var(--red)">加载失败</p>';
    }
}

// 事件委托：审核与删除（如果已有全局 click 事件，可将以下逻辑合并进去，以免重复）
document.addEventListener('click', async (e) => {
    const token = safeGetItem('token');
    if (!token) return;

    if (e.target.classList.contains('tp-approve-btn') || e.target.classList.contains('tp-reject-btn')) {
        const orderNo = e.target.dataset.order;
        const status = e.target.classList.contains('tp-approve-btn') ? 'approved' : 'rejected';
        try {
            const res = await fetch(`${API_BASE}/third-party-orders/${orderNo}/review`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status })
            });
            if (res.ok) {
                showToast('已' + (status === 'approved' ? '通过' : '拒绝'));
                loadThirdPartyOrders();
            } else {
                const data = await res.json();
                showToast('❌ ' + (data.error || '操作失败'));
            }
        } catch (err) { showToast('网络错误'); }
    }

    if (e.target.classList.contains('tp-delete-btn')) {
        const orderNo = e.target.dataset.order;
        if (!confirm('确定删除该订单？')) return;
        try {
            const res = await fetch(`${API_BASE}/third-party-orders/${orderNo}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                showToast('已删除');
                loadThirdPartyOrders();
            } else {
                const data = await res.json();
                showToast('❌ ' + (data.error || '删除失败'));
            }
        } catch (err) { showToast('网络错误'); }
    }
});



// 三方订单菜单按钮点击（事件委托，永久有效）
document.addEventListener('click', function(e) {
  if (e.target && e.target.id === 'thirdPartyOrdersBtn') {
    showSection('thirdparty');
  }
});


// ==================== 积分商城管理（管理员） ====================

let editingShopItemId = null;

// 加载商品列表
async function loadAdminShopItems() {
  const container = getEl('adminShopList');
  const token = safeGetItem('token');
  if (!token) { container.innerHTML = '<p>请先登录</p>'; return; }
  try {
    const res = await fetch(`${API_BASE}/admin/shop/items`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const items = await res.json();
    if (!items.length) {
      container.innerHTML = '<p>暂无商品，点击右上角新增</p>';
      return;
    }
    let html = '<table><tr><th>ID</th><th>名称</th><th>价格</th><th>库存</th><th>状态</th><th>操作</th></tr>';
    items.forEach(item => {
      html += `<tr>
        <td>${item.id}</td>
        <td>${item.name}</td>
        <td>${item.price_credits} 积分</td>
        <td>${item.stock === -1 ? '无限' : item.stock}</td>
        <td>${item.is_active ? '✅ 上架' : '⛔ 下架'}</td>
        <td>
          <button class="edit-shop-item-btn" data-id="${item.id}">编辑</button>
          <button class="delete-shop-item-btn" data-id="${item.id}">删除</button>
        </td>
      </tr>`;
    });
    html += '</table>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<p style="color:var(--red)">加载失败</p>';
  }
}

// 打开新增/编辑弹窗
function openShopModal(item = null) {
  editingShopItemId = item ? item.id : null;
  getEl('adminShopModalTitle').textContent = item ? '编辑商品' : '新增商品';
  getEl('shopItemName').value = item ? item.name : '';
  getEl('shopItemDesc').value = item ? (item.description || '') : '';
  getEl('shopItemImage').value = item ? (item.image || '') : '';
  getEl('shopItemPrice').value = item ? item.price_credits : '';
  getEl('shopItemStock').value = item ? (item.stock !== undefined ? item.stock : -1) : -1;
  getEl('shopItemActive').checked = item ? (item.is_active == 1) : true;
  getEl('shopModalError').textContent = '';
  getEl('adminShopModal').style.display = 'flex';
}

// 关闭弹窗事件
getEl('closeShopModalBtn')?.addEventListener('click', () => {
  getEl('adminShopModal').style.display = 'none';
});
getEl('adminShopModal')?.addEventListener('click', (e) => {
  if (e.target === getEl('adminShopModal')) getEl('adminShopModal').style.display = 'none';
});

// 保存商品（新增/更新）
getEl('saveShopItemBtn')?.addEventListener('click', async () => {
  const name = getEl('shopItemName').value.trim();
  const description = getEl('shopItemDesc').value.trim();
  const image = getEl('shopItemImage').value.trim();
  const price_credits = parseInt(getEl('shopItemPrice').value);
  const stock = parseInt(getEl('shopItemStock').value);
  const is_active = getEl('shopItemActive').checked ? 1 : 0;
  const errorEl = getEl('shopModalError');

  if (!name || isNaN(price_credits) || price_credits < 1) {
    errorEl.textContent = '请填写名称和有效的积分价格';
    return;
  }

  const token = safeGetItem('token');
  const body = { name, description, image, price_credits, stock, is_active };
  if (editingShopItemId) body.id = editingShopItemId;

  try {
    const res = await fetch(`${API_BASE}/admin/shop/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      showToast(editingShopItemId ? '商品已更新' : '商品已创建');
      getEl('adminShopModal').style.display = 'none';
      loadAdminShopItems(); // 刷新列表
    } else {
      errorEl.textContent = data.error || '保存失败';
    }
  } catch (err) {
    errorEl.textContent = '网络错误';
  }
});

// 全局事件委托：处理新增、编辑、删除按钮
document.addEventListener('click', async (e) => {
  const token = safeGetItem('token');
  if (!token) return;

  // 新增商品按钮
  if (e.target.id === 'adminShopAddBtn') {
    openShopModal();
  }

  // 编辑按钮
  if (e.target.classList.contains('edit-shop-item-btn')) {
    const id = e.target.dataset.id;
    try {
      const res = await fetch(`${API_BASE}/admin/shop/items`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const items = await res.json();
      const item = items.find(i => i.id == id);
      if (item) openShopModal(item);
    } catch (err) {
      showToast('无法获取商品信息');
    }
  }

  // 删除按钮
  if (e.target.classList.contains('delete-shop-item-btn')) {
    const id = e.target.dataset.id;
    if (!confirm('确定删除该商品吗？')) return;
    try {
      const res = await fetch(`${API_BASE}/admin/shop/items/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('商品已删除');
        loadAdminShopItems();
      } else {
        const data = await res.json();
        showToast('❌ ' + (data.error || '删除失败'));
      }
    } catch (err) {
      showToast('网络错误');
    }
  }
});



// ==================== 开箱配置管理 ====================

let editingChestId = null;

// 加载所有箱子配置列表
async function loadAdminChests() {
    const container = getEl('adminChestList');
    if (!container) return;
    try {
        const res = await fetch(`${API_BASE}/chest/configs`);
        const chests = await res.json();
        if (!chests.length) {
            container.innerHTML = '<p>暂无箱子配置</p>';
            return;
        }
        let html = '<table><tr><th>ID</th><th>名称</th><th>价格</th><th>稀有物品数</th><th>普通奖励数</th><th>操作</th></tr>';
        chests.forEach(chest => {
            // 使用 rare_items 和 common_rewards 字段
            const rareCount = chest.rare_items ? chest.rare_items.length : 0;
            const commonCount = chest.common_rewards ? chest.common_rewards.length : 0;
            html += `<tr>
                <td>${chest.id}</td>
                <td>${chest.name}</td>
                <td>${chest.price}</td>
                <td>${rareCount}</td>
                <td>${commonCount}</td>
                <td><button class="edit-chest-btn" data-id="${chest.id}">编辑</button></td>
            </tr>`;
        });
        html += '</table>';
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<p style="color:var(--red)">加载失败</p>';
    }
}

// 打开编辑弹窗（获取完整配置：基本信息 + 稀有物品 + 普通奖励）
async function openChestEditor(chestId) {
    try {
        const token = safeGetItem('token');
        const res = await fetch(`${API_BASE}/admin/chest/configs/${chestId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const chest = await res.json();
        if (!chest) return;

        editingChestId = chestId;
        getEl('chestEditorTitle').textContent = '编辑箱子 #' + chest.id;
        getEl('chestEditorName').value = chest.name;
        getEl('chestEditorPrice').value = chest.price;
        getEl('chestEditorImage').value = chest.image || '';
        getEl('chestEditorDesc').value = chest.description || '';
        getEl('chestEditorError').textContent = '';

        // 渲染稀有物品编辑区
        const rareItemsEditor = getEl('chestItemsEditor');
        rareItemsEditor.innerHTML = '';
        chest.rare_items.forEach(item => addChestItemRow(item));

        // 渲染普通奖励编辑区
        const commonEditor = getEl('chestCommonRewardsEditor');
        commonEditor.innerHTML = '';
        chest.common_rewards.forEach(reward => addCommonRewardRow(reward));

        getEl('chestEditorModal').style.display = 'flex';
    } catch (err) {
        showToast('加载箱子信息失败');
    }
}

// 添加一行稀有物品编辑
function addChestItemRow(item = {}) {
    const container = getEl('chestItemsEditor');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'chest-item-edit-row';
    row.style.cssText = 'display:flex; gap:8px; margin-bottom:8px; align-items:center;';

    row.innerHTML = `
        <select class="chest-item-rarity" style="width:90px;">
            <option value="rare" selected>稀有</option>
        </select>
        <input type="text" class="chest-item-name" placeholder="物品名称" value="${item.item_name || ''}" style="flex:1;">
        <input type="number" class="chest-item-weight" placeholder="权重" value="${item.weight || ''}" min="1" step="1" style="width:80px;">
        <button type="button" class="remove-chest-item-btn" style="border:1px solid var(--red); color:var(--red); background:transparent; padding:4px 8px; border-radius:4px; cursor:pointer;">删除</button>
    `;
    container.appendChild(row);
}

// 添加一行普通奖励编辑
function addCommonRewardRow(reward = {}) {
    const container = getEl('chestCommonRewardsEditor');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'chest-common-reward-row';
    row.style.cssText = 'display:flex; gap:8px; margin-bottom:8px; align-items:center;';

    row.innerHTML = `
        <input type="text" class="common-reward-name" placeholder="物品名称" value="${reward.item_name || ''}" style="flex:1;">
        <input type="number" class="common-reward-min" placeholder="最小数量" value="${reward.min_quantity || 1}" min="1" step="1" style="width:80px;">
        <input type="number" class="common-reward-max" placeholder="最大数量" value="${reward.max_quantity || 1}" min="1" step="1" style="width:80px;">
        <input type="number" class="common-reward-chance" placeholder="概率%" value="${reward.drop_chance ?? 100}" min="0" max="100" step="1" style="width:80px;">
        <button type="button" class="remove-common-reward-btn" style="border:1px solid var(--red); color:var(--red); background:transparent; padding:4px 8px; border-radius:4px; cursor:pointer;">删除</button>
    `;
    container.appendChild(row);
}

// 事件委托：添加按钮、删除行、编辑按钮
document.addEventListener('click', (e) => {
    // 添加稀有物品
    if (e.target.id === 'addChestItemBtn') {
        addChestItemRow();
    }
    // 添加普通奖励
    if (e.target.id === 'addCommonRewardBtn') {
        addCommonRewardRow();
    }
    // 删除稀有物品行
    if (e.target.classList.contains('remove-chest-item-btn')) {
        e.target.closest('.chest-item-edit-row').remove();
    }
    // 删除普通奖励行
    if (e.target.classList.contains('remove-common-reward-btn')) {
        e.target.closest('.chest-common-reward-row').remove();
    }
    // 打开编辑弹窗
    if (e.target.classList.contains('edit-chest-btn')) {
        openChestEditor(e.target.dataset.id);
    }
});

// 保存配置
getEl('saveChestConfigBtn')?.addEventListener('click', async () => {
    if (!editingChestId) return;
    const token = safeGetItem('token');
    if (!token) { showToast('请先登录'); return; }

    const name = getEl('chestEditorName').value.trim();
    const price = parseInt(getEl('chestEditorPrice').value);
    const image = getEl('chestEditorImage').value.trim();
    const description = getEl('chestEditorDesc').value.trim();

    // 收集稀有物品
    const itemRows = document.querySelectorAll('.chest-item-edit-row');
    const rare_items = [];
    itemRows.forEach(row => {
        const item_name = row.querySelector('.chest-item-name').value.trim();
        const weight = parseInt(row.querySelector('.chest-item-weight').value);
        if (item_name && weight) {
            rare_items.push({ item_name, weight });
        }
    });

    // 收集普通奖励
    const commonRows = document.querySelectorAll('.chest-common-reward-row');
    const common_rewards = [];
    commonRows.forEach(row => {
        const item_name = row.querySelector('.common-reward-name').value.trim();
        const min_quantity = parseInt(row.querySelector('.common-reward-min').value);
        const max_quantity = parseInt(row.querySelector('.common-reward-max').value);
        const drop_chance = parseFloat(row.querySelector('.common-reward-chance').value);
        if (item_name && min_quantity && max_quantity) {
            common_rewards.push({ item_name, min_quantity, max_quantity, drop_chance });
        }
    });

    if (!name || isNaN(price) || rare_items.length === 0) {
        getEl('chestEditorError').textContent = '请填写名称、价格和至少一个稀有物品';
        return;
    }
    if (common_rewards.length === 0) {
        getEl('chestEditorError').textContent = '请至少配置一条普通奖励';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/admin/chest/configs/${editingChestId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name, price, image, description, rare_items, common_rewards })
        });
        const data = await res.json();
        if (res.ok) {
            showToast('✅ 配置已保存');
            getEl('chestEditorModal').style.display = 'none';
            loadAdminChests();
        } else {
            getEl('chestEditorError').textContent = data.error || '保存失败';
        }
    } catch (err) {
        getEl('chestEditorError').textContent = '网络错误';
    }
});

// 关闭编辑弹窗
getEl('closeChestEditorBtn')?.addEventListener('click', () => {
    getEl('chestEditorModal').style.display = 'none';
});
getEl('chestEditorModal')?.addEventListener('click', (e) => {
    if (e.target === getEl('chestEditorModal')) getEl('chestEditorModal').style.display = 'none';
});

// 支付引导弹窗关闭
getEl('closePaymentGuideBtn')?.addEventListener('click', () => {
    getEl('paymentGuideModal').style.display = 'none';
});
getEl('paymentGuideModal')?.addEventListener('click', (e) => {
    if (e.target === getEl('paymentGuideModal')) {
        getEl('paymentGuideModal').style.display = 'none';
    }
});

// 点击“上传凭证”按钮：关闭引导弹窗，打开上传凭证弹窗
getEl('goUploadPaymentBtn')?.addEventListener('click', () => {
    getEl('paymentGuideModal').style.display = 'none';
    // 打开支付凭证上传弹窗（必须已经存在）
    if (paymentModal) {
        paymentModal.style.display = 'flex';
        // 清空预览和错误信息
        if (paymentError) paymentError.textContent = '';
        if (previewImage) previewImage.style.display = 'none';
        if (paymentFile) paymentFile.value = '';
        if (pasteArea) pasteArea.innerText = '';
    }
});


// ==================== 启动 ====================
init();