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
    return true;
}

function safeGetItem(key, fallback = null) {
    try {
        const val = localStorage.getItem(key);
        if (val !== null) return val;
    } catch (e) {}
    return fallback;
}

// 清除旧版本写入的可由脚本读取的 JWT Cookie；不再使用 Cookie 存储令牌。
document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';

// ==================== 快捷获取 DOM 元素 ====================
const getEl = (id) => document.getElementById(id);
UIRuntime.enhanceModals(document);
let authExpiryPrompted = false;

function promptLoginExpired() {
    if (authExpiryPrompted) return;
    authExpiryPrompted = true;
    safeSetItem('token', '');
    safeSetItem('username', '');
    safeSetItem('role', '');
    safeSetItem('userId', '');
    checkLoginStatus();
    showToast('登录已过期，请重新登录后继续刚才的操作');
    const expiredLoginModal = getEl('loginModal');
    if (expiredLoginModal) expiredLoginModal.style.display = 'flex';
}

// ==================== 积分抵扣相关 ====================
async function loadUserCreditsForBoost() {
  const token = safeGetItem('token');
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/user/credits`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    const el = getEl('availableCredits');
    if (el) el.textContent = data.qy_credits || 0;
    refreshPrice();
    BoostCheckout.sync();
  } catch (e) {}
}

function getUseCredits() {
  const input = getEl('useCreditsInput');
  const p=projectDetails[getSelectedProject()],d=p?.[getSelectedDetail()];
  const gross=Math.round((d?.price || 0)*getQty()*getPlayerRate()*(isUrgent()?1.1:1)*100);
  return Math.max(0, Math.min(parseInt(input?.value) || 0, parseInt(getEl('availableCredits')?.textContent) || 0, gross));
}

// ==================== 配置 ====================
const API_BASE = '/api';
const rentalClient = RentalClient.createRentalClient({
    getToken: () => safeGetItem('token'),
    onUnauthorized: promptLoginExpired,
    // Resolve window.fetch at request time so rental requests share login-expiry handling.
    fetchImpl: (...args) => window.fetch(...args)
});

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
  const requestHeaders = new Headers(args[1]?.headers || args[0]?.headers || {});
  if (response.status === 401 && requestHeaders.has('Authorization')) {
    promptLoginExpired();
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
    profile: getEl('sectionProfile'),
    admin: getEl('sectionAdmin'),
    booster: getEl('sectionBooster'),
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
const settingsBtn = getEl('settingsBtn');

// ==================== 初始化 ====================
function initOrderNotifications() {
    OrderNotifications.init({apiBase:API_BASE,getToken:()=>safeGetItem('token'),getRole:()=>safeGetItem('role'),onToast:showToast,onAuthExpired:promptLoginExpired,
      onOpenOrder:n=>{
        if(n.kind==='new_order' && ['booster','admin'].includes(safeGetItem('role'))){showSection('booster');document.querySelector('.booster-tab[data-tab="booster-hall"]')?.click();}
        else if(n.kind==='take_confirmed' && ['booster','admin'].includes(safeGetItem('role'))){showSection('booster');document.querySelector('.booster-tab[data-tab="booster-my"]')?.click();}
        else {showSection('profile');OrderCenter.showDetail({order_type:n.order_type,order_ref:n.order_ref});}
      },
      onOrderUpdate:()=>{const section=document.body.dataset.currentSection;if(section==='profile')OrderCenter.load('user');if(section==='booster'){loadHallOrders();loadMyBoosterOrders();}},
      onPoll:()=>{if(document.body.dataset.currentSection==='booster')loadHallOrders();}});
}
function init() {
    OrderCenter.init({apiBase:API_BASE,getToken:()=>safeGetItem('token'),getRole:()=>safeGetItem('role'),onToast:showToast,
      onDeletionRefresh:()=>{if(document.body.dataset.currentSection==='thirdparty')loadThirdPartyOrders();},onBoostPayment:openBoostPayment,onTicketRefresh:updateTicketDisplay,onOpenOrders:()=>showSection('profile'),
      onBalanceRefresh:()=>{loadUserCreditsForBoost();if(document.body.dataset.currentSection==='profile')loadProfile();},
      onManage:(order,scope)=>{
        focusedRentalOrder=order.order_type==='rental'?order.order_ref:null;
        if(order.order_type==='third_party') {
          showSection('thirdparty');tpCurrentFilter='all';
          getEl('tpFilterTabs').querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'));
          getEl('tpSearchInput').value=order.order_ref;loadThirdPartyOrders();
        } else if(scope==='admin') {
          showSection('admin');document.querySelector('.admin-tab[data-admintab="rental"]')?.click();
        } else {
          showSection('rental');
          const tab=Number(order.related_user_id)===Number(safeGetItem('userId'))?'my':'rented';
          document.querySelector(`.rental-tab[data-rentaltab="${tab}"]`)?.click();
        }
      }});
    initOrderNotifications();
    BoosterAvailability.init({apiBase:API_BASE,getToken:()=>safeGetItem('token'),onToast:showToast,
      onIdentity:userId=>window.updateBoosterIdentity(userId),onSettings:()=>{
        const tab=document.querySelector('.settings-nav-btn[data-setting="notifications"]');
        if(tab)selectPanelNavigation(tab,'.settings-nav-btn');showSection('settings');
      }});
    updateDetailCards();
    refreshPrice();
    generatePlayers();
    BoostCheckout.init({toast:showToast,refresh:()=>{updateDetailCards();refreshPrice();},refreshBalance:loadUserCreditsForBoost,
      payment:orderNo=>{currentOrderNo=orderNo;getEl('guideOrderNo').textContent=orderNo;getEl('paymentGuideModal').style.display='flex';},
      selection:()=>{const p=projectDetails[getSelectedProject()],d=p?.[getSelectedDetail()],player=playerData.find(p=>p.key===document.querySelector('input[name="player"]:checked')?.value);return {valid:!!(p&&d&&player),project:p?.name,detail:d?.desc,player:player?.name,quantity:getQty(),urgent:isUrgent(),credits:getUseCredits(),total:calcTotal()};}});
    RentalDiscovery.init({render:renderRentalHallAccounts});
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
document.querySelectorAll('[data-nav-target]').forEach(btn => {
    btn.addEventListener('click', (event) => {
        if (btn.tagName === 'A' && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
        event.preventDefault();
        showSection(btn.dataset.navTarget);
    });
});
if (profileBtn) profileBtn.addEventListener('click', () => showSection('profile'));
if (adminPanelBtn) adminPanelBtn.addEventListener('click', () => showSection('admin'));
if (boosterPanelBtn) boosterPanelBtn.addEventListener('click', () => showSection('booster'));
getEl('thirdPartyOrdersBtn')?.addEventListener('click', () => showSection('thirdparty'));

let restoringNavigation = false;

function syncNavigation(target) {
    document.querySelectorAll('.site-nav-link, .mobile-nav-btn').forEach(link => {
        const active = link.dataset.navTarget === target;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
}

function saveNavigation() {
    if (restoringNavigation) return;
    const target = document.body.dataset.currentSection || 'mainMenu';
    const tab = target === 'admin' ? document.querySelector('.admin-tab.active')?.dataset.admintab
        : target === 'booster' ? document.querySelector('.booster-tab.active')?.dataset.tab : '';
    const hash = `#${target}${tab ? '/' + tab : ''}`;
    if (window.location.hash !== hash) window.history.pushState(null, '', hash);
}

function restoreNavigation() {
    const [requested, tab] = window.location.hash.slice(1).split('/');
    const role = safeGetItem('role');
    let target = requested || 'mainMenu';
    if (target !== 'mainMenu' && !sections[target]) target = 'mainMenu';
    if (target === 'admin' && (!safeGetItem('token') || role !== 'admin')) target = 'mainMenu';
    if (target === 'booster' && (!safeGetItem('token') || !['admin', 'booster'].includes(role))) target = 'mainMenu';
    restoringNavigation = true;
    try {
        showSection(target);
        const tabs = target === 'admin' ? document.querySelectorAll('.admin-tab')
            : target === 'booster' ? document.querySelectorAll('.booster-tab') : [];
        const selected = Array.from(tabs).find(button => (button.dataset.admintab || button.dataset.tab) === tab);
        if (selected && !selected.classList.contains('active')) selected.click();
    } finally {
        restoringNavigation = false;
    }
}

function layoutNavigation() {
    const header = document.querySelector('.top-bar');
    if (header) document.documentElement.style.setProperty('--site-header-height', `${header.offsetHeight}px`);
    [
        {id: 'adminNavMore', selector: '.admin-tab', attribute: 'admintab', items: ['roles', 'content', 'shop', 'chest'], width: 1400},
        {id: 'settingsNavMore', selector: '.settings-nav-btn', attribute: 'setting', items: ['order-defaults', 'language', 'messages', 'devices'], width: 1400}
    ].forEach(group => {
        const more = getEl(group.id);
        if (!more) return;
        const compact = window.innerWidth > 600 && window.innerWidth < group.width;
        const menu = more.querySelector('.panel-more-menu');
        group.items.forEach(target => {
            const button = document.querySelector(`${group.selector}[data-${group.attribute}="${target}"]`);
            if (!button) return;
            if (compact) menu.appendChild(button);
            else more.before(button);
        });
        more.hidden = !compact;
        if (!compact) more.open = false;
    });
}

function selectPanelNavigation(button, selector) {
    document.querySelectorAll(selector).forEach(item => {
        const active = item === button;
        item.classList.toggle('active', active);
        if (active) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
    });
    const more = button.closest('.panel-more');
    if (more?.open) {
        more.open = false;
        more.querySelector('summary')?.focus({preventScroll: true});
    }
    const nav = button.closest('.panel-nav');
    if (nav && nav.scrollWidth > nav.clientWidth && !more) {
        const bounds = nav.getBoundingClientRect();
        const itemBounds = button.getBoundingClientRect();
        if (itemBounds.left < bounds.left) nav.scrollLeft += itemBounds.left - bounds.left;
        else if (itemBounds.right > bounds.right) nav.scrollLeft += itemBounds.right - bounds.right;
    }
}

function showSection(target) {
    if (target !== 'mainMenu' && !sections[target]) return;
    if(document.body.dataset.currentSection==='booster'&&target!=='booster'){
        if(!BoosterAvailability.canLeave())return;BoosterAvailability.leave();
    }
    if (mainMenu) mainMenu.style.display = 'none';
    Object.values(sections).forEach(sec => { if (sec) sec.style.display = 'none'; });

    if (target === 'mainMenu') {
        if (mainMenu) mainMenu.style.display = 'flex';
        document.body.dataset.currentSection = 'mainMenu';
        syncNavigation('mainMenu');
        saveNavigation();
        if (userDropdown) userDropdown.style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    const targetSection = sections[target];
    if (!targetSection) return;
    targetSection.style.display = 'block';
    document.body.dataset.currentSection = target;
    syncNavigation(target);
    saveNavigation();
    if (userDropdown) userDropdown.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    switch (target) {
        case 'profile':
            loadProfile();
            loadOrders();
            break;
        case 'admin':
            document.querySelector('.admin-tab.active')?.click();
            break;
        case 'booster':
            BoosterAvailability.refresh();
            document.querySelector('.booster-tab.active')?.click();
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
            const defaultTab = document.querySelector('.rental-tab[data-rentaltab="hall"]');
            if (defaultTab) selectPanelNavigation(defaultTab, '.rental-tab');
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
            tpCurrentFilter = 'todo';
            getEl('tpFilterTabs')?.querySelectorAll('button').forEach((button) =>
                button.classList.toggle('active', button.dataset.filter === 'todo'));
            loadThirdPartyOrders();
            // 仅管理员和打手可创建订单
            (() => {
                const addCard = getEl('tpAddCard');
                const toggle = getEl('tpToggleCreateBtn');
                if (!addCard || !toggle) return;
                const role = safeGetItem('role');
                const allowed = role === 'admin' || role === 'booster';
                toggle.style.display = allowed ? '' : 'none';
                addCard.hidden = true;
                toggle.setAttribute('aria-expanded', 'false');
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
    return Math.max(0, Math.round(subTotal * 100) / 100 - creditsDiscount);
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
    window.OrderNotifications?.syncSession();
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
}
if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    const token = safeGetItem('token');
    let revoked = false;
    if (token) {
        try {
            const response = await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            revoked = response.ok;
        } catch (_) {}
    }
    safeSetItem('token', ''); safeSetItem('username', ''); safeSetItem('role', '');
    safeSetItem('userId', '');
    BoostCheckout.resetForLogout();
    checkLoginStatus();
    if (userDropdown) userDropdown.style.display = 'none';
    showToast(revoked ? '👋 已退出所有设备' : '本机已退出；服务器撤销未确认，请检查网络后重新登录');
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
    const twoFactorCode = getEl('loginTwoFactorCode')?.value.trim();
    const recoveryCode = getEl('loginRecoveryCode')?.value.trim();
    if (!username || !password) { if (loginError) loginError.textContent = '用户名和密码不能为空'; return; }
    try {
        const res = await fetch(`${API_BASE}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password, twoFactorCode, recoveryCode }) });
        const data = await res.json();
        if (res.ok && data.success) {
            authExpiryPrompted = false;
            safeSetItem('token', data.token);
            safeSetItem('username', data.user.username);
            safeSetItem('role', data.user.role);
            safeSetItem('boosterIdentity', data.user.booster_identity || 'standard');
            safeSetItem('userId', data.user.id);
            checkLoginStatus();
            loadUserCreditsForBoost();
            if (loginModal) loginModal.style.display = 'none';
            if (loginError) loginError.textContent = '';
            if (getEl('loginTwoFactorCode')) getEl('loginTwoFactorCode').value = '';
            if (getEl('loginRecoveryCode')) getEl('loginRecoveryCode').value = '';
            if (getEl('loginTwoFactorGroup')) getEl('loginTwoFactorGroup').style.display = 'none';
            showToast('✅ 登录成功！');
        } else {
            if (data.requiresTwoFactor && getEl('loginTwoFactorGroup')) {
                getEl('loginTwoFactorGroup').style.display = 'block';
                getEl('loginTwoFactorCode')?.focus();
            }
            if (loginError) loginError.textContent = data.error || '登录失败';
        }
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
    return OrderCenter.load('user');
}

// ==================== 提交订单 (防重复点击 + 积分抵扣) ====================
if (submitOrderBtn) {
    submitOrderBtn.addEventListener('click', async function() {
        if (this.disabled || !BoostCheckout.canSubmit()) return;
        const token = safeGetItem('token');
        if (!token) { showToast('请先登录，服务选项和数量已保存'); getEl('loginModal').style.display='flex'; return; }
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
                total_price: Number((base * qty * playerInfo.rate * (urgent ? 1.1 : 1)).toFixed(2)),
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
               if(Number(data.total_price ?? total)>0)getEl('paymentGuideModal').style.display = 'flex';
               BoostCheckout.success(data, body);
            } else {
               showToast('❌ ' + (data.error || '提交失败'));
            }
        } catch (err) { showToast('提交结果未确认，请先到订单中心查看是否已生成订单，避免重复下单'); }
        finally {
            this.disabled = false;
            this.textContent = '🚀 提交订单';
        }
    });
}

// ==================== 管理面板 ====================
const adminOrderList = getEl('adminOrderList');

function rentalSafeText(value) {
    return UIRuntime.safeText(value);
}

function renderRentalState(container, kind, message, retry) {
    UIRuntime.renderAsyncState(container, {
        kind, message, ...(retry ? { onRetry: retry, retryLabel: '重新加载' } : {})
    });
}

let adminRentalAccountPage = 1;
const rentalAccountScreenshots = RentalClient.screenshotNames;

async function loadAdminRentalAccounts() {
    const container = getEl('adminRentalAccountList');
    const token = safeGetItem('token');
    if (!container || !token) return;
    const status = getEl('adminRentalAccountStatus')?.value || '';
    renderRentalState(container, 'loading', '正在加载出租账号申请…');
    try {
        const { accounts, total } = await rentalClient.getAdminAccounts({
            status, page: adminRentalAccountPage
        });
        if (!accounts.length) {
            renderRentalState(container, 'empty', '当前筛选没有出租账号申请');
        } else {
            const statusText = RentalClient.accountStatusLabels;
            let html = '<table><caption class="sr-only">出租账号审核列表</caption><thead><tr><th scope="col">ID/账号UID</th><th scope="col">出租方</th><th scope="col">客户端</th><th scope="col">时租/天租</th><th scope="col">状态</th><th scope="col">资料</th><th scope="col">操作</th></tr></thead><tbody>';
            accounts.forEach(a => {
                const id = Number(a.id);
                if (!Number.isSafeInteger(id) || id <= 0) return;
                const screenshotLinks = rentalAccountScreenshots(a.screenshots).map((name, index) =>
                    `<a href="/uploads/${encodeURIComponent(name)}" target="_blank" rel="noopener">截图 ${index + 1}</a>`).join(' ');
                html += `<tr>
                    <td data-label="ID/账号UID">${id} / ${rentalSafeText(a.game_uid || '未填写')}</td>
                    <td data-label="出租方">${rentalSafeText(a.owner_name)}</td><td data-label="客户端">${rentalSafeText(a.client_type)}</td>
                    <td data-label="时租/天租">¥${rentalSafeText(a.hourly_price)} / ¥${rentalSafeText(a.daily_price)}</td>
                    <td data-label="状态">${a.deleted_at ? '已删除' : statusText[a.status] || rentalSafeText(a.status)}</td>
                    <td data-label="资料"><details><summary>查看资料</summary>
                        <p>坦克：${rentalSafeText(a.tank_list || '未填写')}</p>
                        <p>时段：${rentalSafeText(a.available_time_desc || '不限')}</p>
                        <p>规则：${rentalSafeText(a.rules || '无')}</p>${screenshotLinks || '无截图'}
                    </details></td>
                    <td data-label="操作" class="table-actions">
                        ${!a.deleted_at && (a.status === 'pending' || a.status === 'suspended') ? `<button class="admin-rental-account-review-btn" data-id="${id}" data-approved="true">${a.status === 'pending' ? '审核通过' : '重新上架'}</button>` : ''}
                        ${!a.deleted_at && (a.status === 'pending' || a.status === 'active') ? `<button class="admin-rental-account-review-btn" data-id="${id}" data-approved="false">${a.status === 'pending' ? '驳回' : '强制下架'}</button>` : ''}
                        <button class="admin-rental-account-archive-btn" data-id="${id}" data-action="${a.deleted_at ? 'restore' : 'archive'}">${a.deleted_at ? '恢复为待审核' : '删除'}</button>
                    </td></tr>`;
            });
            container.innerHTML = html + '</tbody></table>';
        }
        const pages = Math.max(1, Math.ceil(total / 25));
        const info = getEl('adminRentalPageInfo');
        if (info) info.textContent = `第 ${adminRentalAccountPage} / ${pages} 页，共 ${total} 条`;
        const prev = getEl('adminRentalPrevPage');
        const next = getEl('adminRentalNextPage');
        if (prev) prev.disabled = adminRentalAccountPage <= 1;
        if (next) next.disabled = adminRentalAccountPage >= pages;
    } catch (err) {
        renderRentalState(container, 'error', err.message || '申请加载失败', loadAdminRentalAccounts);
    }
}

getEl('adminRentalAccountStatus')?.addEventListener('change', () => {
    adminRentalAccountPage = 1;
    loadAdminRentalAccounts();
});
getEl('refreshAdminRentalAccountsBtn')?.addEventListener('click', loadAdminRentalAccounts);
getEl('adminRentalPrevPage')?.addEventListener('click', () => {
    if (adminRentalAccountPage > 1) adminRentalAccountPage--;
    loadAdminRentalAccounts();
});
getEl('adminRentalNextPage')?.addEventListener('click', () => {
    adminRentalAccountPage++;
    loadAdminRentalAccounts();
});
document.addEventListener('click', async (e) => {
    const button = e.target.closest?.('.admin-rental-account-review-btn');
    if (!button) return;
    const id = Number(button.dataset.id);
    const approved = button.dataset.approved === 'true';
    if (!Number.isSafeInteger(id) || id <= 0) return;
    if (!window.confirm(approved ?
        '已核对账号资料和截图，确定审核通过并在租号大厅上架？' :
        '确定驳回或强制下架这个出租账号？')) return;
    try {
        const data = await rentalClient.reviewAccount(id, approved);
        showToast(data.message || '审核已完成');
        loadAdminRentalAccounts();
    } catch (err) { showToast('❌ ' + (err.message || '审核失败')); }
});

document.addEventListener('click', async (e) => {
    const button = e.target.closest?.('.admin-rental-account-archive-btn');
    if (!button) return;
    const id = Number(button.dataset.id);
    const action = button.dataset.action;
    const token = safeGetItem('token');
    if (!token || !Number.isSafeInteger(id) || id <= 0 || !['archive', 'restore'].includes(action)) return;
    if (!window.confirm(action === 'archive' ?
        '确定删除展示此账号？历史租单会保留；若仍有进行中租单，系统会拒绝删除。' :
        '确定恢复此账号为待审核？恢复后仍须重新审核才能上架。')) return;
    try {
        const data = await rentalClient.changeAccountArchive(id, action, { admin: true });
        showToast(data.message || '操作已完成');
        loadAdminRentalAccounts();
    } catch (err) { showToast('❌ ' + (err.message || '操作失败')); }
});

async function loadAdminRentalOrders() {
    const container = getEl('adminRentalOrderList');
    const token = safeGetItem('token');
    if (!container || !token) return;
    renderRentalState(container, 'loading', '正在加载租号订单…');
    try {
        const res = await fetch(`${API_BASE}/admin/rental/orders`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const orders = await res.json();
        if (!res.ok || !Array.isArray(orders)) throw new Error(orders?.error || '加载失败');
        if (!orders.length) { renderRentalState(container, 'empty', '暂无租号订单'); return; }
        let html = '<table><caption class="sr-only">租号付款与结算订单</caption><thead><tr><th scope="col">订单</th><th scope="col">双方</th><th scope="col">现金/积分</th><th scope="col">处理进度</th><th scope="col">凭证</th><th scope="col">操作</th></tr></thead><tbody>';
        orders.forEach(o => {
            const no = rentalSafeText(o.order_no);
            const screenshot = o.evidence_filename && /^rental_\d+_\d+\.(?:png|jpe?g)$/.test(o.evidence_filename) ?
                `<a href="/uploads/${encodeURIComponent(o.evidence_filename)}" target="_blank" rel="noopener">查看截图</a>` : '无';
            html += `<tr><td data-label="订单">${no}</td><td data-label="双方">${rentalSafeText(o.renter_name)} → ${rentalSafeText(o.owner_name)}</td>
                <td data-label="现金/积分">¥${rentalSafeText(o.total_price)} / ${rentalSafeText(o.credits_used)} 积分</td>
                <td data-label="处理进度">${UIRuntime.rentalTimelineHtml(o)}</td>
                <td data-label="凭证">${screenshot}；${rentalSafeText(o.evidence_status || '未提交')}；预期 ¥${rentalSafeText(o.expected_amount || 0)}
                    ${o.payment_reference ? `；收款编号 ${rentalSafeText(o.payment_reference)}` : ''}
                    ${o.refund_reference ? `；退款编号 ${rentalSafeText(o.refund_reference)}` : ''}</td>
                <td data-label="操作" class="table-actions">
                    ${o.status === 'pending' && o.payment_status === 'submitted' ? `<button class="admin-rental-review-btn" data-order="${no}" data-approved="true">核实收款</button><button class="admin-rental-review-btn" data-order="${no}" data-approved="false">驳回凭证</button>` : ''}
                    ${(o.status === 'pending' || o.status === 'active') && o.payment_status === 'paid' ? `<button class="admin-rental-refund-btn" data-order="${no}" data-amount="${rentalSafeText(o.total_price)}">核实退款并取消</button>` : ''}
                    ${o.status === 'active' && o.disputed_at && o.owner_complete_requested_at && !o.resolved_at ? `<button class="admin-rental-resolve-btn" data-order="${no}">裁决完成</button>` : ''}
                </td></tr>`;
        });
        container.innerHTML = html + '</tbody></table>';
        focusRentalOrder(container);
    } catch (err) {
        renderRentalState(container, 'error', err.message || '租号订单加载失败', loadAdminRentalOrders);
    }
}

getEl('refreshAdminRentalBtn')?.addEventListener('click', loadAdminRentalOrders);
document.addEventListener('click', async (e) => {
    const button = e.target.closest?.('.admin-rental-review-btn, .admin-rental-refund-btn, .admin-rental-resolve-btn');
    if (!button) return;
    const token = safeGetItem('token');
    const orderNo = button.dataset.order;
    if (!token || !orderNo) return;
    let endpoint;
    let body;
    if (button.classList.contains('admin-rental-review-btn')) {
        const approved = button.dataset.approved === 'true';
        const reference = approved ? window.prompt('先核对实际入账，再填写收款交易/核对编号：') : null;
        if (approved && !reference) return;
        if (!window.confirm(approved ? '已逐笔核实实际收款，确定通过？' : '确定驳回付款凭证？')) return;
        endpoint = 'review-payment';
        const reason = approved ? null : window.prompt('请说明驳回原因，用户将据此补充凭证：');
        if (!approved && !reason?.trim()) return;
        body = { approved, payment_reference: reference, reason };
    } else if (button.classList.contains('admin-rental-refund-btn')) {
        const amount = Number(button.dataset.amount);
        const reference = window.prompt(amount === 0 ?
            '无现金应退：填写人工核对编号后取消并退积分：' :
            `先在收款渠道确认已全额退款 ¥${amount.toFixed(2)}，再填写退款交易编号：`);
        if (!reference || !window.confirm('已核实退款或无现金应退，确定取消并退还抵扣积分？')) return;
        endpoint = 'confirm-refund';
        body = { refunded_amount: amount, refund_reference: reference };
    } else {
        const reference = window.prompt('先核实双方争议，再填写处理凭据编号：');
        if (!reference || !window.confirm('确定裁决已完成并计入出租方收益？')) return;
        endpoint = 'resolve-dispute';
        body = { decision: 'completed', resolution_reference: reference };
    }
    try {
        const res = await fetch(`${API_BASE}/admin/rental/orders/${encodeURIComponent(orderNo)}/${endpoint}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` }, body: JSON.stringify(body)
        });
        const data = await res.json();
        showToast(res.ok ? '租号订单已处理' : '❌ ' + (data.error || '处理失败'));
        if (res.ok) loadAdminRentalOrders();
    } catch { showToast('网络错误'); }
});

async function loadAdminOrders() {
    return OrderCenter.load('admin');
}
document.addEventListener('click', async (e) => {
    const token = safeGetItem('token'); if (!token) return;
    if (e.target.classList.contains('detail-btn')) { showOrderDetail(e.target.dataset.order); }
    if (e.target.classList.contains('copy-order-detail-btn')) { copyOrderDetail(e.target.dataset.order); }
    if (e.target.classList.contains('take-order-btn')) {
        const orderNo = e.target.dataset.order;
        try {
            const availability=await BoosterAvailability.prepareTake();if(!availability)return;
            const res = await fetch(`${API_BASE}/booster/take/${orderNo}`, { method:'POST', headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(availability) });
            const data = await res.json();
            if (res.ok) { showToast('✅ 接单成功'); loadHallOrders();BoosterAvailability.refresh(); } else showToast('❌ ' + (data.error||'接单失败'));
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

});

// ========== 管理面板选项卡切换（修改后） ==========
document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => {
            t.classList.remove('active');
            t.removeAttribute('aria-current');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-current', 'page');
        tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const more = getEl('adminNavMore');
        if (more) more.open = false;
        if (document.body.dataset.currentSection === 'admin') saveNavigation();
        const target = tab.dataset.admintab;

        // 隐藏所有子面板（包括新增的 adminChestSection）
        ['adminOrdersSection', 'adminRentalSection', 'adminCustomSection', 'adminBoostersSection', 'adminRolesSection', 'adminContentSection', 'adminShopSection', 'adminChestSection'].forEach(id => {
            const el = getEl(id);
            if (el) el.style.display = 'none';
        });

        // 根据 target 显示对应面板
        if (target === 'orders') {
            const el = getEl('adminOrdersSection');
            if (el) el.style.display = 'block';
            loadAdminOrders();
        } else if (target === 'rental') {
            const el = getEl('adminRentalSection');
            if (el) el.style.display = 'block';
            loadAdminRentalAccounts();
            loadAdminRentalOrders();
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
async function loadAdminBoosters() { return BoosterAvailability.loadAdmin(); }
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
function openBoostPayment(orderNo) {
    currentOrderNo = orderNo;
    if (paymentModal) paymentModal.style.display = 'flex';
    if (paymentError) paymentError.textContent = '';
    if (previewImage) previewImage.style.display = 'none';
    if (paymentFile) paymentFile.value = '';
    if (pasteArea) pasteArea.innerText = '';
}
document.addEventListener('click', e => {
    if (e.target.classList.contains('upload-payment-btn')) openBoostPayment(e.target.dataset.order);
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
        document.querySelectorAll('.booster-tab').forEach(t => {
            t.classList.remove('active');
            t.removeAttribute('aria-current');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-current', 'page');
        if (document.body.dataset.currentSection === 'booster') saveNavigation();
        const target = tab.dataset.tab;
        document.querySelectorAll('.booster-tab-content').forEach(c => c.style.display = 'none');
        const targetEl = getEl(target);
        if (targetEl) targetEl.style.display = 'block';
        if (target === 'booster-hall') loadHallOrders();
        else if (target === 'booster-my') loadMyBoosterOrders();
        else if (target === 'booster-earnings') loadEarnings();
        else if (target === 'booster-availability') BoosterAvailability.showSchedule();
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
  return OrderCenter.createRecharge();
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

    const selectedTab = Array.from(toolTabs).find(tab => tab.dataset.tool === toolName);
    if (selectedTab) selectPanelNavigation(selectedTab, '.tool-tab');

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
    const calculatorTab = Array.from(toolTabs).find(tab => tab.dataset.tool === 'calculator');
    if (calculatorTab) selectPanelNavigation(calculatorTab, '.tool-tab');
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
let settingsLoadVersion = 0;
async function loadSettingsPanel() {
    const version = ++settingsLoadVersion;
    const content = getEl('settingsContent');
    if (!content) return;
    content.innerHTML = '<p>加载中...</p>';
    const token = safeGetItem('token');
    if (!token) { content.innerHTML = '<p style="color:var(--red)">请先登录</p>'; return; }
    try {
        const res = await fetch(`${API_BASE}/user/settings`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('获取设置失败');
        const settings = await res.json();
        if (version !== settingsLoadVersion || document.body.dataset.currentSection !== 'settings') return;
        window._userSettings = settings;  // 缓存设置供子面板使用
        bindSettingsNav();
        const selectedBtn = document.querySelector('.settings-nav-btn.active') || document.querySelector('.settings-nav-btn');
        if (selectedBtn) {
            selectPanelNavigation(selectedBtn, '.settings-nav-btn');
            showSettingSection(selectedBtn.dataset.setting);
        }
    } catch (e) {
        if (version !== settingsLoadVersion || document.body.dataset.currentSection !== 'settings') return;
        content.innerHTML = '<p style="color:var(--red)">加载设置失败</p>';
    }
}

// 设置导航只绑定一次，重新进入页面时保留当前选项
function bindSettingsNav() {
    const navBtns = document.querySelectorAll('.settings-nav-btn');
    navBtns.forEach(btn => {
        if (btn.dataset.settingsBound) return;
        btn.dataset.settingsBound = 'true';
        btn.addEventListener('click', () => {
            selectPanelNavigation(btn, '.settings-nav-btn');
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
    const factorEnabled = Boolean(window._userSettings?.two_factor_enabled);
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
        </div>
        <div class="card"><h4>身份验证器二次认证</h4>
            <p id="twoFactorStatus">${factorEnabled ? '已启用。登录时需要身份验证器的 6 位验证码。' : '未启用。可使用支持 TOTP 的身份验证器绑定。'}</p>
            <input type="password" id="twoFactorPassword" placeholder="当前登录密码" class="remark-input" autocomplete="current-password" style="margin-bottom:8px;">
            ${factorEnabled ? '' : '<button id="twoFactorSetupBtn" class="submit-btn">开始绑定</button>'}
            <div id="twoFactorSetupDetails" style="display:none">
                <p>在身份验证器中手动输入以下密钥；请勿转发或截图。</p>
                <code id="twoFactorSecret"></code>
            </div>
            <input type="text" id="twoFactorCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="身份验证器 6 位验证码" class="remark-input" style="margin:8px 0;">
            ${factorEnabled ? '<input type="text" id="twoFactorRecoveryInput" autocomplete="off" placeholder="或输入一次性恢复码" class="remark-input" style="margin-bottom:8px;">' : ''}
            <button id="twoFactorConfirmBtn" class="submit-btn" style="display:none">确认启用</button>
            ${factorEnabled ? '<button id="twoFactorDisableBtn" class="submit-btn">关闭二次认证</button>' : ''}
            <pre id="twoFactorRecoveryCodes" style="display:none;white-space:pre-wrap"></pre>
            <p id="twoFactorMessage"></p>
        </div>`;

    // 绑定修改事件（与之前相同，此处省略具体 fetch 代码，实际使用时请复制之前给出的完整事件绑定）
    bindAccountSecurityEvents();
    bindTwoFactorEvents();
}

function bindTwoFactorEvents() {
    let setupToken = null;
    const message = getEl('twoFactorMessage');
    const request = async (route, body) => {
        const response = await fetch(`${API_BASE}/auth/two-factor/${route}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${safeGetItem('token')}` },
            body: JSON.stringify(body)
        });
        return { response, data: await response.json() };
    };
    getEl('twoFactorSetupBtn')?.addEventListener('click', async () => {
        try {
            const { response, data } = await request('setup', { password: getEl('twoFactorPassword').value });
            if (!response.ok) { message.textContent = data.error || '绑定失败'; return; }
            setupToken = data.setupToken;
            getEl('twoFactorSecret').textContent = data.secret;
            getEl('twoFactorSetupDetails').style.display = 'block';
            getEl('twoFactorConfirmBtn').style.display = 'block';
            message.textContent = '输入身份验证器当前显示的验证码完成绑定。';
        } catch { message.textContent = '网络错误，请重试'; }
    });
    getEl('twoFactorConfirmBtn')?.addEventListener('click', async () => {
        try {
            const { response, data } = await request('confirm', { setupToken, code: getEl('twoFactorCode').value.trim() });
            message.textContent = data.message || data.error || '绑定失败';
            if (response.ok) {
                setupToken = null;
                if (data.token) safeSetItem('token', data.token);
                window._userSettings.two_factor_enabled = 1;
                renderAccountSecurity();
                getEl('twoFactorMessage').textContent = data.message;
                const codes = getEl('twoFactorRecoveryCodes');
                codes.textContent = `请立即离线保存以下一次性恢复码。它们只显示这一次；每个只能使用一次。\n${data.recoveryCodes.join('\n')}`;
                codes.style.display = 'block';
            }
        } catch { message.textContent = '网络错误，请重试'; }
    });
    getEl('twoFactorDisableBtn')?.addEventListener('click', async () => {
        try {
            const { response, data } = await request('disable', {
                password: getEl('twoFactorPassword').value,
                code: getEl('twoFactorCode').value.trim(),
                recoveryCode: getEl('twoFactorRecoveryInput').value.trim()
            });
            message.textContent = data.message || data.error || '关闭失败';
            if (response.ok) {
                if (data.token) safeSetItem('token', data.token);
                window._userSettings.two_factor_enabled = 0;
                renderAccountSecurity();
                getEl('twoFactorMessage').textContent = data.message;
            }
        } catch { message.textContent = '网络错误，请重试'; }
    });
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
        if (res.ok) {
            if (data.token) safeSetItem('token', data.token);
            getEl('oldPassword').value = '';
            getEl('newPassword').value = '';
        }
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
        </div><div id="wecomUserSettings"></div>${safeGetItem('role')==='admin'?'<div id="wecomAdminSettings"></div>':''}`;
    OrderNotifications.attachSettings();
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
    const content = getEl('settingsContent');
    content.innerHTML = `
        <div class="card"><h4>语言 / 地区</h4>
            <p>当前仅提供简体中文。英文界面尚未完整实现，因此暂不显示不可用的切换入口。</p>
        </div>`;
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
        selectPanelNavigation(tab, '.rental-tab');
        const target = tab.dataset.rentaltab;
        document.querySelectorAll('.rental-view').forEach(v => v.style.display = 'none');
        if (target === 'hall') { getEl('rentalHallView').style.display = 'block'; loadRentalHall(); }
        else if (target === 'publish') { getEl('rentalPublishView').style.display = 'block'; }
        else if (target === 'rented') { getEl('rentalRentedView').style.display = 'block'; loadRentedOrders(); }
        else if (target === 'my') { getEl('rentalMyView').style.display = 'block'; loadMyRentalAccounts(); loadMyRentalDeletedAccounts(); loadMyRentalOrders(); loadRentalEarnings(); }
    });
});

// 加载租号大厅
async function loadRentalHall(force = false) {
    const container = getEl('rentalHallList');
    if (!container) return;
    renderRentalState(container, 'loading', '正在加载可租账号…');
    try {
        const accounts = await rentalClient.getHall({ force });
        RentalDiscovery.setAccounts(accounts);
    } catch (err) {
        renderRentalState(container, 'error', err.message || '可租账号加载失败', () => loadRentalHall(true));
    }
}
function renderRentalHallAccounts(accounts, total) {
    const container=getEl('rentalHallList');
        if (!accounts.length) { renderRentalState(container, 'empty', total ? '没有符合筛选的账号，请调整条件' : '暂无可租账号，请稍后再来'); return; }
        let html = '';
        accounts.forEach(acc => {
            const id = Number(acc.id);
            if (!Number.isSafeInteger(id) || id <= 0) return;
            const screenshots = RentalClient.screenshotNames(acc.screenshots);
            const imgHtml = screenshots.length ? `<img src="/uploads/${encodeURIComponent(screenshots[0])}" alt="账号截图" style="width:100%; height:140px; object-fit:cover; border-radius:8px;">` : '';
            html += `
            <div class="rental-account-card" data-id="${id}">
                ${imgHtml}
                <h4>账号 ${rentalSafeText(acc.game_uid || id)}</h4><span class="rental-rentable">${acc.availability_status==='rented'?'租用中 · 暂不可租':acc.availability_status==='reserved'?'已有订单待交接 · 暂不可租':'可申请租用 · 出租方确认后起算'}</span><p class="rental-tanks">代表坦克：${rentalSafeText((acc.tank_list || '未填写').split(/[\n,，/、]+/).map(s=>s.trim()).filter(Boolean).slice(0,3).join(' / '))}</p>
                <p>客户端：${rentalSafeText(acc.client_type)} | 出租方：${rentalSafeText(acc.owner_name)}</p>
                <p>信誉：${rentalSafeText(acc.owner_reputation)} | 身份：${rentalSafeText(acc.owner_identity || 'standard')}</p>
                <p>¥${Number(acc.hourly_price).toFixed(2)} / 小时 · ¥${Number(acc.daily_price).toFixed(2)} / 天</p>
                <p style="font-size:0.75rem; color:var(--text-muted);">可用时段：${rentalSafeText(acc.available_time_desc || '无限制')}</p>
                <p>主要限制：${rentalSafeText(acc.rules || '出租方未填写，请租用前确认')}</p>
                <button class="rental-detail-btn" data-id="${id}">查看详情</button>
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
}
getEl('refreshRentalHallBtn')?.addEventListener('click', () => loadRentalHall(true));

// 查看账号详情弹窗（含坦克清单和租用表单）
async function showRentalAccountDetail(accountId) {
    const token = safeGetItem('token');
    if (!token) { showToast('请先登录'); return; }
    try {
        const account = await rentalClient.getAccount(accountId);
        const screenshots = RentalClient.screenshotNames(account.screenshots);
        const imgHtml = screenshots.map(s => `<img src="/uploads/${encodeURIComponent(s)}" alt="账号截图" style="max-width:100px; border-radius:6px;">`).join('');
        let html = `
            <p><strong>出租方：</strong>${rentalSafeText(account.owner_name)}（信誉 ${rentalSafeText(account.owner_reputation)}）</p>
            <p><strong>客户端：</strong>${rentalSafeText(account.client_type)}</p>
            <p><strong>游戏UID：</strong>${rentalSafeText(account.game_uid || '未填写')}</p>
            <p><strong>坦克清单：</strong></p>
            <pre style="white-space:pre-wrap; max-height:200px; overflow-y:auto; background:#0f172a; padding:8px; border-radius:6px;">${rentalSafeText(account.tank_list || '未填写')}</pre>
            <p><strong>可用时段：</strong>${rentalSafeText(account.available_time_desc || '无限制')}</p>
            <p><strong>规则：</strong>${rentalSafeText(account.rules || '无')}</p>
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
            <p>总价：<strong id="rentalTotalPrice">0.00</strong> 元</p><p id="rentalPeriod" role="status"></p><p class="quantity-hint">预估从现在起租，实际以出租方确认租用的时间起算；此处不构成预约。</p>
            <p>可用积分抵扣：<input type="number" id="rentalUseCredits" value="0" min="0" step="100" style="width:100px;" onchange="updateRentalPrice()"> <span id="rentalDiscountAmt">¥0.00</span></p>
            <button id="submitRentBtn" class="submit-btn" ${account.availability_status && account.availability_status!=='available'?'disabled':''}>${account.availability_status && account.availability_status!=='available'?'已有租单，暂不可租':'确认租用'}</button>
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
    const qty = Math.max(1, Math.min(999, parseInt(getEl('rentalQuantity')?.value) || 1));
    if(getEl('rentalQuantity')) getEl('rentalQuantity').value=qty;
    const start=new Date(),end=new Date(start.getTime()+qty*(type==='day'?24:1)*3600000);
    if(getEl('rentalPeriod'))getEl('rentalPeriod').textContent='预计租期：'+start.toLocaleString('zh-CN')+' 至 '+end.toLocaleString('zh-CN')+'（'+qty+(type==='day'?'天':'小时')+'）';
    const unitPrice = Number(type === 'hour' ? account.hourly_price : account.daily_price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return;
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
    const queueDiv = getEl('rentalUploadQueue');
    const submitButton = getEl('submitRentalAccountBtn');
    let uploadEntries = [];

    function syncUploadControls() {
        if (submitButton) submitButton.disabled = uploadEntries.some(entry => entry.status === 'uploading');
    }

    function createUploadRow(entry) {
        const row = document.createElement('div');
        row.className = 'upload-item';
        const name = document.createElement('span');
        name.className = 'upload-item-name';
        name.textContent = entry.file.name || '剪贴板截图';
        const progress = document.createElement('progress');
        progress.max = 100;
        progress.value = 0;
        progress.setAttribute('aria-label', `${name.textContent} 上传进度`);
        const status = document.createElement('span');
        status.className = 'upload-item-status';
        status.textContent = '等待上传';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'upload-retry-btn';
        retry.textContent = '重试';
        retry.hidden = true;
        retry.addEventListener('click', () => uploadEntry(entry));
        row.append(name, progress, status, retry);
        queueDiv?.appendChild(row);
        entry.row = row;
        entry.progress = progress;
        entry.statusText = status;
        entry.retry = retry;
    }

    async function uploadEntry(entry) {
        entry.status = 'uploading';
        entry.retry.hidden = true;
        entry.progress.value = 0;
        entry.statusText.textContent = '上传中 0%';
        syncUploadControls();
        try {
            entry.filename = await rentalClient.uploadScreenshot(entry.file, {
                onProgress(percent) {
                    entry.progress.value = percent;
                    entry.statusText.textContent = `上传中 ${percent}%`;
                }
            });
            entry.status = 'done';
            entry.statusText.textContent = '上传完成';
            const img = document.createElement('img');
            img.src = `/uploads/${encodeURIComponent(entry.filename)}`;
            img.alt = `已上传账号截图：${entry.file.name || '截图'}`;
            previewDiv?.appendChild(img);
        } catch (err) {
            entry.status = 'failed';
            entry.statusText.textContent = err.message || '上传失败';
            entry.retry.hidden = false;
        } finally {
            syncUploadControls();
        }
    }

    function queueFiles(files) {
        const available = Math.max(0, 3 - uploadEntries.length);
        const selected = Array.from(files || []).slice(0, available);
        if (!selected.length) {
            if (files?.length) showToast('最多只能上传 3 张截图');
            return;
        }
        if (files.length > available) showToast('最多只能上传 3 张截图，多余文件未上传');
        selected.forEach(file => {
            const entry = { file, filename: '', status: 'queued' };
            uploadEntries.push(entry);
            createUploadRow(entry);
            uploadEntry(entry);
        });
        fileInput.value = '';
    }

    if (fileInput) {
        fileInput.addEventListener('change', () => queueFiles(fileInput.files));
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
            screenshots: uploadEntries.filter(entry => entry.status === 'done').map(entry => entry.filename)
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
                queueDiv?.replaceChildren();
                uploadEntries = [];
                syncUploadControls();
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
    if (!token) { renderRentalState(container, 'empty', '请先登录后查看租用记录'); return; }
    renderRentalState(container, 'loading', '正在加载租用记录…');
    try {
        const res = await fetch(`${API_BASE}/rental/my-rented`, { headers: { 'Authorization': `Bearer ${token}` } });
        const orders = await res.json();
        if (!res.ok || !Array.isArray(orders)) throw new Error(orders?.error || '租用记录加载失败');
        if (!orders.length) { renderRentalState(container, 'empty', '暂无租用记录'); return; }
        let html = '<div class="table-scroll"><table class="responsive-table"><caption class="sr-only">我的租用订单</caption><thead><tr><th scope="col">订单号</th><th scope="col">账号</th><th scope="col">出租方</th><th scope="col">类型/数量</th><th scope="col">金额</th><th scope="col">处理进度</th><th scope="col">操作</th></tr></thead><tbody>';
        orders.forEach(o => {
            const canCancel = (o.status === 'pending' || o.status === 'active') &&
                (o.payment_status === 'unpaid' || o.payment_status === 'rejected') &&
                !o.disputed_at && !o.owner_complete_requested_at;
            const canSubmitEvidence = o.status === 'pending' && Number(o.total_price) > 0 &&
                (o.payment_status === 'unpaid' || o.payment_status === 'rejected');
            html += `<tr>
                <td data-label="订单号">${rentalSafeText(o.order_no)}</td><td data-label="账号">${rentalSafeText(o.game_uid || '未知')}</td><td data-label="出租方">${rentalSafeText(o.owner_name)}</td>
                <td data-label="类型/数量">${rentalSafeText(o.rental_type)} × ${rentalSafeText(o.quantity)}</td><td data-label="金额">¥${rentalSafeText(o.total_price)}</td>
                <td data-label="处理进度">${UIRuntime.rentalTimelineHtml(o)}</td>
                <td data-label="操作" class="table-actions">
                    ${canSubmitEvidence ? `<button class="rental-pay-evidence-btn" data-order="${o.order_no}">上传付款截图</button>` : ''}
                    ${o.status === 'active' && o.owner_complete_requested_at && !o.disputed_at ? `<button class="rental-confirm-completion-btn" data-order="${o.order_no}">确认完成</button>` : ''}
                    ${o.status === 'active' && o.payment_status === 'paid' && !o.disputed_at ? `<button class="rental-dispute-btn" data-order="${o.order_no}">发起争议</button>` : ''}
                    ${canCancel ? `<button class="cancel-rental-btn" data-order="${o.order_no}">取消</button>` : ''}
                </td>
            </tr>`;
        });
        html += '</tbody></table></div>';
        container.innerHTML = html;
        focusRentalOrder(container);
    } catch (err) { renderRentalState(container, 'error', err.message || '租用记录加载失败', loadRentedOrders); }
}

// 我的出租：账号列表
async function loadMyRentalAccounts(deleted = false) {
    const container = getEl(deleted ? 'myRentalDeletedList' : 'myRentalAccountsList');
    if (!container) return;
    const token = safeGetItem('token');
    if (!token) { renderRentalState(container, 'empty', '请先登录后管理出租账号'); return; }
    renderRentalState(container, 'loading', deleted ? '正在加载已删除账号…' : '正在加载出租账号…');
    try {
        const accounts = await rentalClient.getMyAccounts({ deleted });
        if (!accounts.length) { renderRentalState(container, 'empty', deleted ? '没有已删除账号' : '你还没有发布出租账号'); return; }
        let html = (deleted ? '<p>恢复后进入待审核，不会自动上架。</p>' :
            '<p>待审核账号不会在租号大厅展示；仅管理员可通过“管理面板 → 租号审核”上架。</p>') +
            '<div class="table-scroll"><table class="responsive-table"><caption class="sr-only">我的出租账号</caption><thead><tr><th scope="col">UID</th><th scope="col">客户端</th><th scope="col">时租/天租</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>';
        accounts.forEach(a => {
            const id = Number(a.id);
            if (!Number.isSafeInteger(id) || id <= 0) return;
            html += `<tr>
                <td data-label="UID">${rentalSafeText(a.game_uid || '—')}</td><td data-label="客户端">${rentalSafeText(a.client_type)}</td>
                <td data-label="时租/天租">¥${rentalSafeText(a.hourly_price)} / ¥${rentalSafeText(a.daily_price)}</td>
                <td data-label="状态">${deleted ? '已删除' : a.status === 'pending' ? '待管理员审核' : a.status === 'active' ? '已上架' : '已下架/未通过'}</td>
                <td data-label="操作" class="table-actions">
                    ${deleted ? `<button class="rental-account-archive-btn" data-id="${id}" data-action="restore">恢复为待审核</button>` : `
                        ${a.status === 'active' ? `<button class="shelve-btn" data-id="${id}" data-status="suspended">下架</button>` : ''}
                        ${a.status === 'suspended' ? `<button class="shelve-btn" data-id="${id}" data-status="pending">申请重新审核</button>` : ''}
                        ${a.status === 'pending' ? '等待审核' : ''}
                        <button class="rental-account-archive-btn" data-id="${id}" data-action="archive">删除</button>`}
                </td>
            </tr>`;
        });
        html += '</tbody></table></div>';
        container.innerHTML = html;
    } catch (err) {
        renderRentalState(container, 'error', err.message || '出租账号加载失败', () => loadMyRentalAccounts(deleted));
    }
}

function loadMyRentalDeletedAccounts() { return loadMyRentalAccounts(true); }
getEl('refreshDeletedRentalAccountsBtn')?.addEventListener('click', loadMyRentalDeletedAccounts);

// 我的出租：订单列表
let focusedRentalOrder=null;
function focusRentalOrder(container) {
    if(!focusedRentalOrder)return;
    const row=Array.from(container.querySelectorAll('tr')).find(r=>r.firstElementChild?.textContent.trim()===focusedRentalOrder);
    if(row){row.classList.add('oc-focused-order');row.scrollIntoView({block:'center',behavior:'smooth'});focusedRentalOrder=null;setTimeout(()=>row.classList.remove('oc-focused-order'),3000);}
}
async function loadMyRentalOrders() {
    const container = getEl('myRentalOrdersList');
    if (!container) return;
    const token = safeGetItem('token');
    if (!token) { renderRentalState(container, 'empty', '请先登录后查看出租订单'); return; }
    renderRentalState(container, 'loading', '正在加载出租订单…');
    try {
        const res = await fetch(`${API_BASE}/rental/my-orders`, { headers: { 'Authorization': `Bearer ${token}` } });
        const orders = await res.json();
        if (!res.ok || !Array.isArray(orders)) throw new Error(orders?.error || '出租订单加载失败');
        if (!orders.length) { renderRentalState(container, 'empty', '暂无出租订单'); return; }
        let html = '<div class="table-scroll"><table class="responsive-table"><caption class="sr-only">我的出租订单</caption><thead><tr><th scope="col">订单号</th><th scope="col">租客</th><th scope="col">类型/数量</th><th scope="col">金额</th><th scope="col">处理进度</th><th scope="col">操作</th></tr></thead><tbody>';
        orders.forEach(o => {
            html += `<tr>
                <td data-label="订单号">${rentalSafeText(o.order_no)}</td><td data-label="租客">${rentalSafeText(o.renter_name)}</td>
                <td data-label="类型/数量">${rentalSafeText(o.rental_type)} × ${rentalSafeText(o.quantity)}</td><td data-label="金额">¥${rentalSafeText(o.total_price)}</td>
                <td data-label="处理进度">${UIRuntime.rentalTimelineHtml(o)}</td>
                <td data-label="操作" class="table-actions">
                    ${o.status === 'pending' && o.payment_status === 'paid' && !o.disputed_at ? `<button class="confirm-rental-btn" data-order="${o.order_no}">确认租用</button>` : ''}
                    ${o.status === 'active' && o.payment_status === 'paid' && !o.disputed_at && !o.owner_complete_requested_at ? `<button class="complete-rental-btn" data-order="${o.order_no}">申请完成</button>` : ''}
                    ${o.status === 'active' && o.payment_status === 'paid' && !o.disputed_at ? `<button class="rental-dispute-btn" data-order="${o.order_no}">发起争议</button>` : ''}
                    ${(o.payment_status === 'unpaid' || o.payment_status === 'rejected') && (o.status === 'pending' || o.status === 'active') ? `<button class="cancel-rental-btn" data-order="${o.order_no}">取消</button>` : ''}
                </td>
            </tr>`;
        });
        html += '</tbody></table></div>';
        container.innerHTML = html;
        focusRentalOrder(container);
    } catch (err) { renderRentalState(container, 'error', err.message || '出租订单加载失败', loadMyRentalOrders); }
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

    const archiveButton = e.target.closest?.('.rental-account-archive-btn');
    if (archiveButton) {
        const id = Number(archiveButton.dataset.id);
        const action = archiveButton.dataset.action;
        if (!Number.isSafeInteger(id) || id <= 0 || !['archive', 'restore'].includes(action)) return;
        if (!window.confirm(action === 'archive' ?
            '确定删除展示这个出租账号？历史租单保留，有进行中租单时系统会拒绝。' :
            '确定恢复为待审核？管理员重新通过后才能上架。')) return;
        try {
            const data = await rentalClient.changeAccountArchive(id, action);
            showToast(data.message || '操作已完成');
            loadMyRentalAccounts(); loadMyRentalDeletedAccounts();
        } catch (err) { showToast('❌ ' + (err.message || '操作失败')); }
        return;
    }

    // 上下架账号
    if (e.target.classList.contains('shelve-btn')) {
        const id = e.target.dataset.id;
        const status = e.target.dataset.status;
        try {
            await rentalClient.changeAccountStatus(id, status);
            showToast(status === 'pending' ? '已申请重新审核，等待管理员处理' : '已下架');
            loadMyRentalAccounts();
        } catch (err) { showToast('❌ ' + (err.message || '操作失败')); }
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
            if (res.ok) { showToast('已申请完成，等待租用方确认；收益尚未计入'); loadMyRentalOrders(); }
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

    if (e.target.classList.contains('rental-confirm-completion-btn') ||
        e.target.classList.contains('rental-dispute-btn')) {
        const orderNo = e.target.dataset.order;
        const dispute = e.target.classList.contains('rental-dispute-btn');
        if (dispute && !window.confirm('发起争议后需由管理员处理，确定继续吗？')) return;
        const reason = dispute ? window.prompt('请填写争议原因与需要核对的交接问题：') : null;
        if (dispute && !reason?.trim()) return;
        try {
            const res = await fetch(`${API_BASE}/rental/orders/${encodeURIComponent(orderNo)}/${dispute ? 'dispute' : 'confirm-completion'}`, {
                method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type':'application/json' },
                body: JSON.stringify(dispute ? { reason } : {})
            });
            const data = await res.json();
            showToast(res.ok ? (dispute ? '争议已登记' : '已确认完成，出租收益已计入') : '❌ ' + (data.error || '操作失败'));
            if (res.ok) { loadRentedOrders(); loadMyRentalOrders(); loadRentalEarnings(); }
        } catch { showToast('网络错误'); }
    }

    if (e.target.classList.contains('rental-pay-evidence-btn')) {
        const orderNo = e.target.dataset.order;
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/png,image/jpeg';
        fileInput.onchange = async () => {
            const file = fileInput.files?.[0];
            if (!file || file.size > 5 * 1024 * 1024) { showToast('请选择不超过 5MB 的付款截图'); return; }
            try {
                const screenshot = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
                const uploaded = await fetch(`${API_BASE}/rental/upload-screenshot`, {
                    method: 'POST', headers, body: JSON.stringify({ screenshot })
                });
                const uploadData = await uploaded.json();
                if (!uploaded.ok || !uploadData.filename) throw new Error(uploadData.error || '截图上传失败');
                const attached = await fetch(`${API_BASE}/rental/orders/${encodeURIComponent(orderNo)}/payment-evidence`, {
                    method: 'POST', headers, body: JSON.stringify({ filename: uploadData.filename })
                });
                const data = await attached.json();
                if (!attached.ok) throw new Error(data.error || '凭证关联失败');
                showToast('付款截图已提交，等待管理员核实实际收款');
                loadRentedOrders();
            } catch (err) { showToast('❌ ' + (err.message || '网络错误')); }
        };
        fileInput.click();
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


// ==================== 内容管理（管理员） ====================

function getEndpointForType(type) {
  const map = {
    'announcements': '/admin/announcements',
    'game-news': '/admin/game-news'
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
let tpOrders = [];
let tpCurrentFilter = 'todo';
let tpPendingAction = null;

const tpStageLabels = {
  pending: '待审核', in_progress: '进行中', awaiting_acceptance: '待验收',
  completed: '已完成', rejected: '已驳回', unknown: '状态异常'
};
const tpEventLabels = {
  created: '创建订单', approved: '审核通过', rejected: '审核驳回', resubmitted: '修改重提',
  completion_requested: '申请验收', completion_returned: '验收退回',
  payment_confirmed: '收款已核实', completed: '验收通过'
};

function tpFormatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false });
}

function tpMaskAccount(value) {
  const text = String(value || '');
  if (text.length <= 4) return '****';
  return `${text.slice(0, 2)}${'*'.repeat(Math.min(6, text.length - 4))}${text.slice(-2)}`;
}

function tpIsTodo(order, role) {
  if (role === 'admin') {
    return order.workflow_stage === 'pending' || order.workflow_stage === 'awaiting_acceptance' ||
      (order.workflow_stage === 'in_progress' && order.payment_status !== 'paid');
  }
  return order.workflow_stage === 'rejected' || order.workflow_stage === 'in_progress';
}

function tpOrderMatches(order) {
  const role = safeGetItem('role');
  const filterMatch = tpCurrentFilter === 'all' ||
    (tpCurrentFilter === 'todo' ? tpIsTodo(order, role) : order.workflow_stage === tpCurrentFilter);
  const keyword = (getEl('tpSearchInput')?.value || '').trim().toLowerCase();
  if (!filterMatch || !keyword) return filterMatch;
  return [order.order_no, order.external_order_no, order.platform, order.creator_name, order.content]
    .some((value) => String(value || '').toLowerCase().includes(keyword));
}

function tpCardActions(order) {
  const role = safeGetItem('role');
  const userId = safeGetItem('userId');
  const own = String(order.creator_id) === String(userId);
  let primary = '';
  let secondary = '';
  if (role === 'admin' && order.workflow_stage === 'pending') {
    primary = `<button class="submit-btn tp-card-primary" data-tp-action="approve">通过审核</button>`;
    secondary = `<button class="tp-secondary-btn" data-tp-action="reject">驳回</button>`;
  } else if (order.workflow_stage === 'rejected' && (own || role === 'admin')) {
    primary = `<button class="submit-btn tp-card-primary" data-tp-action="resubmit">修改并重提</button>`;
  } else if (order.workflow_stage === 'in_progress' && role === 'admin') {
    primary = order.payment_status !== 'paid'
      ? `<button class="submit-btn tp-card-primary" data-tp-action="pay">核实收款</button>`
      : `<button class="submit-btn tp-card-primary" data-tp-action="complete">申请验收</button>`;
    if (own && order.payment_status !== 'paid') secondary = `<button class="tp-secondary-btn" data-tp-action="complete">申请验收</button>`;
  } else if (order.workflow_stage === 'in_progress' && own) {
    primary = `<button class="submit-btn tp-card-primary" data-tp-action="complete">申请验收</button>`;
  } else if (role === 'admin' && order.workflow_stage === 'awaiting_acceptance') {
    if (order.payment_status === 'paid') {
      primary = `<button class="submit-btn tp-card-primary" data-tp-action="finalize">验收通过</button>`;
    } else {
      primary = `<button class="submit-btn tp-card-primary" data-tp-action="pay">核实收款</button>`;
    }
    secondary = `<button class="tp-secondary-btn" data-tp-action="return">退回修改</button>`;
  }
  return `${primary}${secondary}<button class="tp-text-btn" data-tp-action="deletion">${role==='admin'?'删除 / 审核删除':'申请删除'}</button><button class="tp-text-btn" data-tp-action="detail">查看详情</button>`;
}

function renderThirdPartyOrders() {
  const container = getEl('tpOrderList');
  if (!container) return;
  const role = safeGetItem('role');
  const visible = tpOrders.filter(tpOrderMatches);
  const todoCount = tpOrders.filter((order) => tpIsTodo(order, role)).length;
  if (getEl('tpTodoCount')) getEl('tpTodoCount').textContent = todoCount;
  if (getEl('tpOrderSummary')) {
    getEl('tpOrderSummary').innerHTML = `<strong>${visible.length}</strong> 个结果 · 共 ${tpOrders.length} 个订单`;
  }
  if (!visible.length) {
    container.innerHTML = `<div class="tp-empty"><span>✓</span><h4>当前没有需要处理的订单</h4><p>切换筛选或搜索其他订单。</p></div>`;
    return;
  }
  container.innerHTML = visible.map((order) => {
    const stage = order.workflow_stage || 'unknown';
    const deadline = order.expected_at ? `<span>预计 ${rentalSafeText(tpFormatDate(order.expected_at))}</span>` : '';
    const alert = stage === 'rejected' && order.rejection_reason
      ? `<div class="tp-order-alert"><strong>驳回原因</strong>${rentalSafeText(order.rejection_reason)}</div>`
      : (order.completion_return_reason && stage === 'in_progress'
        ? `<div class="tp-order-alert"><strong>退回原因</strong>${rentalSafeText(order.completion_return_reason)}</div>` : '');
    return `<article class="tp-order-card" data-order="${rentalSafeText(order.order_no)}">
      <div class="tp-order-card-top">
        <div><span class="tp-server">${rentalSafeText(order.platform || '其他服务器')}</span>
          <button class="tp-order-no" data-tp-action="detail">${rentalSafeText(order.order_no)}</button></div>
        <span class="tp-stage tp-stage-${stage}">${tpStageLabels[stage] || '未知'}</span>
      </div>
      <h4>${rentalSafeText(order.content)}</h4>
      <div class="tp-order-meta">
        <span>¥${Number(order.price).toFixed(2)}</span><span>${rentalSafeText(order.creator_name || '—')}</span>
        <span>账号 ${rentalSafeText(tpMaskAccount(order.account_info))}</span>${deadline}
      </div>
      ${alert}
      <div class="tp-order-progress" aria-label="订单进度">
        <span class="done">已录入</span><span class="${stage !== 'pending' && stage !== 'rejected' ? 'done' : ''}">已审核</span>
        <span class="${['awaiting_acceptance','completed'].includes(stage) ? 'done' : ''}">已交付</span>
        <span class="${stage === 'completed' ? 'done' : ''}">已完成</span>
      </div>
      <div class="tp-payment-row"><span>收款</span><strong class="${order.payment_status === 'paid' ? 'paid' : ''}">${order.payment_status === 'paid' ? '已核实' : '待核实'}</strong></div>
      <div class="tp-order-actions">${tpCardActions(order)}</div>
    </article>`;
  }).join('');
}

async function loadThirdPartyOrders() {
  const container = getEl('tpOrderList');
  const token = safeGetItem('token');
  if (!container || !token) { if (container) container.innerHTML = '<p>请先登录</p>'; return; }
  container.innerHTML = '<div class="tp-loading">正在读取订单…</div>';
  try {
    const res = await fetch(`${API_BASE}/third-party-orders`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '加载失败');
    tpOrders = data;
    renderThirdPartyOrders();
  } catch (err) {
    container.innerHTML = `<div class="tp-empty"><h4>加载失败</h4><p>${rentalSafeText(err.message)}</p><button class="tp-secondary-btn" id="tpRetryBtn">重新加载</button></div>`;
  }
}

function tpOrderForm(order = {}) {
  const platforms = ['安卓官服', 'iOS官服', '亚服', '安卓渠道服', '其他服务器'];
  const localDate = order.expected_at ? new Date(order.expected_at).toISOString().slice(0, 16) : '';
  return `<div class="tp-form-grid">
    <div class="form-group"><label>游戏服务器</label><select id="tpModalPlatform">${platforms.map((item) => `<option ${item === order.platform ? 'selected' : ''}>${item}</option>`).join('')}</select></div>
    <div class="form-group"><label>外部订单号</label><input id="tpModalExternal" maxlength="80" value="${rentalSafeText(order.external_order_no || '')}"></div>
    <div class="form-group tp-form-wide"><label>代练内容</label><textarea id="tpModalContent" rows="3" maxlength="2000">${rentalSafeText(order.content || '')}</textarea></div>
    <div class="form-group"><label>账号信息</label><input id="tpModalAccount" maxlength="200" value="${rentalSafeText(order.account_info || '')}"></div>
    <div class="form-group"><label>订单金额（元）</label><input id="tpModalPrice" type="number" min="0.01" max="999999.99" step="0.01" value="${rentalSafeText(order.price || '')}"></div>
    <div class="form-group"><label>预计完成时间</label><input id="tpModalExpected" type="datetime-local" value="${localDate}"></div>
  </div>`;
}

async function tpShowDetail(order) {
  const modal = getEl('tpActionModal');
  getEl('tpActionEyebrow').textContent = order.order_no;
  getEl('tpActionTitle').textContent = '订单详情';
  getEl('tpActionConfirmBtn').style.display = 'none';
  getEl('tpActionCancelBtn').textContent = '关闭';
  getEl('tpActionBody').innerHTML = `<div class="tp-detail-grid">
    <div><span>游戏服务器</span><strong>${rentalSafeText(order.platform)}</strong></div>
    <div><span>当前阶段</span><strong>${tpStageLabels[order.workflow_stage] || '未知'}</strong></div>
    <div><span>订单金额</span><strong>¥${Number(order.price).toFixed(2)}</strong></div>
    <div><span>创建者</span><strong>${rentalSafeText(order.creator_name || '—')}</strong></div>
    <div><span>外部订单号</span><strong>${rentalSafeText(order.external_order_no || '—')}</strong></div>
    <div><span>预计完成</span><strong>${rentalSafeText(tpFormatDate(order.expected_at))}</strong></div>
    <div class="wide"><span>代练内容</span><strong>${rentalSafeText(order.content)}</strong></div>
    <div class="wide"><span>账号信息</span><strong>${rentalSafeText(order.account_info)}</strong></div>
    <div><span>收款状态</span><strong>${order.payment_status === 'paid' ? '已核实' : '待核实'}</strong></div>
    <div><span>收款凭证</span><strong>${rentalSafeText(order.payment_reference || '—')}</strong></div>
    ${order.completion_note ? `<div class="wide"><span>完单说明</span><strong>${rentalSafeText(order.completion_note)}</strong></div>` : ''}
  </div><div class="tp-timeline"><h4>操作记录</h4><div id="tpEventList">正在加载…</div></div>`;
  modal.style.display = 'flex';
  try {
    const res = await fetch(`${API_BASE}/third-party-orders/${encodeURIComponent(order.order_no)}/events`, { headers: { Authorization: `Bearer ${safeGetItem('token')}` } });
    const events = await res.json();
    getEl('tpEventList').innerHTML = res.ok && events.length ? events.map((event) => `<div class="tp-event"><i></i><div><strong>${tpEventLabels[event.event_type] || rentalSafeText(event.event_type)}</strong><p>${rentalSafeText(event.actor_name || '系统')} · ${rentalSafeText(tpFormatDate(event.created_at))}</p>${event.note ? `<small>${rentalSafeText(event.note)}</small>` : ''}</div></div>`).join('') : '<p>暂无操作记录</p>';
  } catch { getEl('tpEventList').innerHTML = '<p>操作记录加载失败</p>'; }
}

function tpOpenAction(action, order) {
  if (action === 'detail') { tpShowDetail(order); return; }
  const config = {
    approve: ['审核订单', '确认通过后，订单将进入履约阶段。', '通过审核'],
    reject: ['驳回订单', '<div class="form-group"><label>驳回原因</label><textarea id="tpActionReason" rows="3" maxlength="500" placeholder="说明需要修改的内容"></textarea></div>', '确认驳回'],
    resubmit: ['修改并重新提交', tpOrderForm(order), '重新提交'],
    complete: ['申请验收', '<div class="form-group"><label>完单说明</label><textarea id="tpCompletionNote" rows="4" maxlength="1000" placeholder="说明完成内容、结果和需要管理员核对的信息"></textarea></div>', '提交验收'],
    pay: ['核实收款', '<div class="tp-form-grid"><div class="form-group"><label>收款渠道</label><select id="tpPaymentChannel"><option>支付宝</option><option>微信支付</option><option>银行卡</option><option>其他</option></select></div><div class="form-group"><label>交易单号</label><input id="tpPaymentReference" maxlength="80" placeholder="填写支付平台交易号"></div></div>', '确认已收款'],
    return: ['退回验收', '<div class="form-group"><label>退回原因</label><textarea id="tpActionReason" rows="3" maxlength="500" placeholder="说明需要补充或修改的内容"></textarea></div>', '确认退回'],
    finalize: ['验收通过', '确认履约内容无误。完成后订单将锁定，并保留操作记录。', '确认完成']
  }[action];
  if (!config) return;
  tpPendingAction = { action, order };
  getEl('tpActionEyebrow').textContent = order.order_no;
  getEl('tpActionTitle').textContent = config[0];
  getEl('tpActionBody').innerHTML = typeof config[1] === 'string' && config[1].startsWith('<') ? config[1] : `<p class="tp-confirm-copy">${config[1]}</p>`;
  getEl('tpActionError').textContent = '';
  getEl('tpActionConfirmBtn').textContent = config[2];
  getEl('tpActionConfirmBtn').style.display = '';
  getEl('tpActionCancelBtn').textContent = '取消';
  getEl('tpActionModal').style.display = 'flex';
}

function tpCloseAction() {
  getEl('tpActionModal').style.display = 'none';
  tpPendingAction = null;
}

async function tpSubmitAction() {
  if (!tpPendingAction) return;
  const { action, order } = tpPendingAction;
  const routes = {
    approve: ['review', { status: 'approved' }],
    reject: ['review', { status: 'rejected', reason: getEl('tpActionReason')?.value.trim() }],
    resubmit: ['resubmit', {
      platform: getEl('tpModalPlatform')?.value, external_order_no: getEl('tpModalExternal')?.value.trim(),
      content: getEl('tpModalContent')?.value.trim(), account_info: getEl('tpModalAccount')?.value.trim(),
      price: getEl('tpModalPrice')?.value, expected_at: getEl('tpModalExpected')?.value
    }],
    complete: ['request-complete', { completion_note: getEl('tpCompletionNote')?.value.trim() }],
    pay: ['mark-paid', { payment_channel: getEl('tpPaymentChannel')?.value, payment_reference: getEl('tpPaymentReference')?.value.trim() }],
    return: ['return-completion', { reason: getEl('tpActionReason')?.value.trim() }],
    finalize: ['finalize', {}]
  };
  const [route, body] = routes[action];
  const button = getEl('tpActionConfirmBtn');
  button.disabled = true;
  getEl('tpActionError').textContent = '';
  try {
    const res = await fetch(`${API_BASE}/third-party-orders/${encodeURIComponent(order.order_no)}/${route}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${safeGetItem('token')}` },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '操作失败');
    tpCloseAction();
    showToast('操作已完成');
    await loadThirdPartyOrders();
  } catch (err) { getEl('tpActionError').textContent = err.message; }
  finally { button.disabled = false; }
}

getEl('tpToggleCreateBtn')?.addEventListener('click', () => {
  const card = getEl('tpAddCard');
  card.hidden = !card.hidden;
  getEl('tpToggleCreateBtn').setAttribute('aria-expanded', String(!card.hidden));
  if (!card.hidden) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
getEl('tpCloseCreateBtn')?.addEventListener('click', () => { getEl('tpAddCard').hidden = true; });
getEl('tpFilterTabs')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  tpCurrentFilter = button.dataset.filter;
  getEl('tpFilterTabs').querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
  renderThirdPartyOrders();
});
getEl('tpSearchInput')?.addEventListener('input', renderThirdPartyOrders);
getEl('tpOrderList')?.addEventListener('click', (event) => {
  if (event.target.id === 'tpRetryBtn') { loadThirdPartyOrders(); return; }
  const actionButton = event.target.closest('[data-tp-action]');
  const card = event.target.closest('[data-order]');
  if (!actionButton || !card) return;
  const order = tpOrders.find((item) => item.order_no === card.dataset.order);
  if (order && actionButton.dataset.tpAction==='deletion'){OrderCenter.showDetail({order_type:'third_party',order_ref:order.order_no},safeGetItem('role')==='admin'?'admin':'user');return;}
  if (order) tpOpenAction(actionButton.dataset.tpAction, order);
});
getEl('tpActionCloseBtn')?.addEventListener('click', tpCloseAction);
getEl('tpActionCancelBtn')?.addEventListener('click', tpCloseAction);
getEl('tpActionConfirmBtn')?.addEventListener('click', tpSubmitAction);
getEl('tpActionModal')?.addEventListener('click', (event) => { if (event.target.id === 'tpActionModal') tpCloseAction(); });

getEl('tpSubmitBtn')?.addEventListener('click', async () => {
  const msgEl = getEl('tpMsg');
  const button = getEl('tpSubmitBtn');
  const body = {
    platform: getEl('tpPlatform').value, external_order_no: getEl('tpExternalOrderNo').value.trim(),
    content: getEl('tpContent').value.trim(), account_info: getEl('tpAccount').value.trim(),
    price: getEl('tpPrice').value, expected_at: getEl('tpExpectedAt').value
  };
  button.disabled = true;
  msgEl.textContent = '';
  try {
    const res = await fetch(`${API_BASE}/third-party-orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${safeGetItem('token')}` },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '提交失败');
    ['tpExternalOrderNo','tpContent','tpAccount','tpPrice','tpExpectedAt'].forEach((id) => { getEl(id).value = ''; });
    msgEl.textContent = `订单 ${data.order_no} 已提交审核`;
    await loadThirdPartyOrders();
  } catch (err) { msgEl.textContent = err.message; }
  finally { button.disabled = false; }
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
window.addEventListener('popstate', restoreNavigation);
window.addEventListener('resize', layoutNavigation);
layoutNavigation();
if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
        const header = document.querySelector('.top-bar');
        document.documentElement.style.setProperty('--site-header-height', `${header.offsetHeight}px`);
    }).observe(document.querySelector('.top-bar'));
}
if (window.location.hash) restoreNavigation();
else syncNavigation('mainMenu');
