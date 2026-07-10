// ==================== 工具函数 ====================
function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// ==================== 配置 ====================
const API_BASE = '/api';

const projectDetails = {
    silver: { name:'银币', a:{desc:'有紫狗牌有高级银币/百万',price:8.8}, b:{desc:'无紫狗牌有高级银币/百万',price:12.8}, c:{desc:'无紫狗牌无高级银币/百万',price:14.8} },
    exp: { name:'单车经验', a:{desc:'有紫狗牌有高级经验/万',price:3.8}, b:{desc:'无紫狗牌有高级经验/万',price:5.8}, c:{desc:'无紫狗牌无高级经验/万',price:6.8} },
    winrate: { name:'胜率', a:{desc:'70%胜率/10场',price:19.8}, b:{desc:'75%胜率/10场',price:24.8}, c:{desc:'80%胜率/10场',price:34.8} },
    average: { name:'场均', a:{desc:'3000场均/10场',price:19.8}, b:{desc:'3300场均/10场',price:28.8}, c:{desc:'3500场均/10场',price:37.8} },
    mmedal: { name:'M章', a:{desc:'1个M章',price:29.8}, b:{desc:'3个M章',price:57.8}, c:{desc:'5个M章',price:138.8} },
    rings: { name:'三环', a:{desc:'一环',price:68.8}, b:{desc:'二环',price:158.8}, c:{desc:'三环',price:248.8} },
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
    { name: 'T-54 原型',       weight: 5 },
    { name: '狮式',            weight: 4 },
    { name: 'AMX 30B',        weight: 3 },
    { name: 'IS-6 无畏',       weight: 2 },
    { name: '黑豹 88',         weight: 2 },
    { name: 'M60',             weight: 2 },
    { name: 'Strv 81',         weight: 1 },
    { name: '菲利斯',           weight: 10 }
];
const rareTotalWeight = rarePool.reduce((s, i) => s + i.weight, 0);

const tankList = [
    "T-54", "鼠式", "IS-7", "AMX 50B", "M48 Patton", "E-100", "T110E5", "FV215b", "T-62A", "Leopard 1",
    "Bat.-Chat. 25t", "STB-1", "Object 140", "60TP", "Kranvagn", "Progetto M40/65", "TVP T50/51", "AMX 30B",
    "WZ-132-1", "T-100 LT", "Sheridan", "Rhm. Pzw.", "Grille 15", "FV4005", "Strv K", "Foch 155", "斯柯达T27",
    "T95E6", "Super Conqueror ", "TRV", "Obj. 263", "FV215b 183", "穆拉特工程", "Type 5 Heavy", "T110E3",
    "Jagdpanzer E 100", "T110E4", "BadgerFV217", "Object 268", "WZ-113G FT", "T57 Heavy", "埃里希概念车",
    "VK 72.01(K)", "ChieftainMK6", "752工程", "Carro 45T", "Rinoceronte", "Vz.55", "Minotauro", "Ho-Ri III",
    "GSOR", "Lion", "BZ-75", "M-VI-Y", "菲利斯", "AC阿特拉斯", "野牛C45", "CS-63", "Object 430U", "K-91",
    "T-22 medium", "E 50 M", "Panzer 58", "121B", "122 TM", "56TP", "斯柯达T56", "埃米尔1951", "AMX 30原", "T77",
    "JPanther II", "Object268/4", "德古拉", "Smasher", "Rammer", "T-34-85 Rudy", "WZ-113", "WZ-121", "Type 71",
    "NC70B", "BZT-70", "260工程", "114SP2", "ISU-130", "T-34-3", "T-44-100", "XM66F", "M6A2E1", "T34", "AMX CDC",
    "FCM 50 t", "Strv 81", "WZ-111 5A", "116F3", "KPZ70", "SU-130PM", "TS-5", "WZ-120-1G FT", "IS-6", "Object 252U"
];
while (tankList.length < 100) tankList.push("随机坦克" + (tankList.length + 1));

const leagueData = [
    { id: 1, title: '🏆 2026夏季联赛报名开启', time: '2026-07-01', summary: '夏季联赛正式启动，报名截止7月15日。', content: '2026夏季联赛现已开放报名...' },
    { id: 2, title: '⚔️ 上周精彩比赛回顾', time: '2026-06-28', summary: 'TOP战队3:2险胜黑马队伍。', content: '上周末的焦点战中...' },
    { id: 3, title: '📊 战队积分榜更新', time: '2026-06-25', summary: '最新积分排名：情谊战队暂居榜首。', content: '经过五轮比赛...' },
    { id: 4, title: '🎙️ 选手专访：Hansza的坦克心得', time: '2026-06-20', summary: '银牌打手Hansza分享IS-7使用技巧。', content: '我们采访了...' },
    { id: 5, title: '📢 赛事规则调整通知', time: '2026-06-15', summary: '本赛季起禁止使用某型号坦克参赛。', content: '根据玩家反馈...' },
    { id: 6, title: '🎉 联赛竞猜活动上线', time: '2026-06-10', summary: '参与竞猜赢取专属头像和金币奖励。', content: '为增加赛事互动...' }
];

// ==================== DOM 元素引用 ====================
const mainMenu = document.getElementById('mainMenu');
const sections = {
    boost: document.getElementById('sectionBoost'),
    tools: document.getElementById('sectionTools'),
    news: document.getElementById('sectionNews'),
    announcement: document.getElementById('sectionAnnouncement'),
    league: document.getElementById('sectionLeague'),
    // 全屏页面
    profile: document.getElementById('sectionProfile'),
    admin: document.getElementById('sectionAdmin'),
    booster: document.getElementById('sectionBooster'),
    leagueAdmin: document.getElementById('sectionLeagueAdmin')
};

// 代练相关
const projectRadios = document.querySelectorAll('input[name="project"]');
const detailRadios = document.querySelectorAll('input[name="detail"]');
const detailDescA = document.getElementById('detailDescA');
const detailDescB = document.getElementById('detailDescB');
const detailDescC = document.getElementById('detailDescC');
const detailPriceA = document.getElementById('detailPriceA');
const detailPriceB = document.getElementById('detailPriceB');
const detailPriceC = document.getElementById('detailPriceC');
const qtyInput = document.getElementById('quantityInput');
const qtyMinus = document.getElementById('qtyMinus');
const qtyPlus = document.getElementById('qtyPlus');
const urgentCheck = document.getElementById('urgentCheckbox');
const urgentRow = document.getElementById('urgentRow');
const basePriceDisplay = document.getElementById('basePriceDisplay');
const qtyMultDisplay = document.getElementById('qtyMultiplierDisplay');
const playerMultDisplay = document.getElementById('playerMultiplierDisplay');
const totalPriceDisplay = document.getElementById('totalPriceDisplay');
const copyBtn = document.getElementById('copyBtn');
const copyFeedback = document.getElementById('copyFeedback');

// 计算器
const calcTypeRadios = document.querySelectorAll('input[name="calcType"]');
const calcUnit = document.getElementById('calcLabelUnit');
const calcTargetL = document.getElementById('calcTargetLabel');
const calcExpL = document.getElementById('calcExpectedLabel');
const calcResult = document.getElementById('calcResult');

// 用户相关
const openRegisterBtn = document.getElementById('openRegisterBtn');
const openLoginBtn = document.getElementById('openLoginBtn');
const registerModal = document.getElementById('registerModal');
const closeRegisterBtn = document.getElementById('closeRegisterBtn');
const registerForm = document.getElementById('registerForm');
const regError = document.getElementById('regError');
const toLoginLink = document.getElementById('toLoginLink');

const loginModal = document.getElementById('loginModal');
const closeLoginBtn = document.getElementById('closeLoginBtn');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const toRegisterLink = document.getElementById('toRegisterLink');

const userMenu = document.getElementById('userMenu');
const userMenuBtn = document.getElementById('userMenuBtn');
const userDropdown = document.getElementById('userDropdown');
const displayUsername = document.getElementById('displayUsername');
const logoutBtn = document.getElementById('logoutBtn');

// 定制需求
const customRequestCard = document.getElementById('customRequestCard');
const customRequestModal = document.getElementById('customRequestModal');
const closeCustomRequestBtn = document.getElementById('closeCustomRequestBtn');
const customRequestForm = document.getElementById('customRequestForm');
const customRequestError = document.getElementById('customRequestError');

// 导航按钮
const profileBtn = document.getElementById('profileBtn');
const adminPanelBtn = document.getElementById('adminPanelBtn');
const boosterPanelBtn = document.getElementById('boosterPanelBtn');
const leagueAdminBtn = document.getElementById('leagueAdminBtn');

// ==================== 初始化 ====================
function init() {
    updateDetailCards();
    refreshPrice();
    generatePlayers();
    checkLoginStatus();
    bindUpdateRole();
    initChestSimulator();
    initToolSubMenu();
    initWheel();
    renderLeagueCards();
}

// ==================== 板块切换（包括全屏页面） ====================
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
// 导航按钮切换
profileBtn.addEventListener('click', () => showSection('profile'));
adminPanelBtn.addEventListener('click', () => showSection('admin'));
boosterPanelBtn.addEventListener('click', () => showSection('booster'));
leagueAdminBtn.addEventListener('click', () => showSection('leagueAdmin'));

function showSection(target) {
    if (target === 'mainMenu') {
        mainMenu.style.display = 'flex';
        Object.values(sections).forEach(sec => sec.style.display = 'none');
        return;
    }
    mainMenu.style.display = 'none';
    Object.values(sections).forEach(sec => sec.style.display = 'none');
    if (sections[target]) {
        sections[target].style.display = 'block';
        // 加载对应页面数据
        if (target === 'profile') {
            loadProfile();
            loadOrders();
        } else if (target === 'admin') {
            loadAdminOrders();
        } else if (target === 'booster') {
            loadHallOrders();
        } else if (target === 'leagueAdmin') {
            loadLeagueConfig();
        } else if (target === 'league') {
            document.getElementById('leagueStandingsView').style.display = 'block';
            document.getElementById('leagueNewsView').style.display = 'none';
            document.querySelector('.league-tab[data-league-view="standings"]').classList.add('active');
            document.querySelector('.league-tab[data-league-view="news"]').classList.remove('active');
            loadLeagueStandings();
        }
        // 重置独立工具面板（修复黑屏）
        if (target === 'tools') {
            document.getElementById('toolCalculator').style.display = 'block';
            document.getElementById('toolChestSim').style.display = 'none';
            document.getElementById('toolRandomTank').style.display = 'none';
            document.querySelectorAll('.tool-tab').forEach(t => t.classList.remove('active'));
            const calcTab = document.querySelector('.tool-tab[data-tool="calculator"]');
            if (calcTab) calcTab.classList.add('active');
        }
    }
}

// ==================== 打手卡片生成 ====================
function generatePlayers() {
    const grid = document.getElementById('playerGrid');
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
function getQty() { let qty = parseInt(qtyInput.value, 10); if (isNaN(qty) || qty < 1) qty = 1; if (qty > 99) qty = 99; return qty; }
function getPlayerRate() {
    const checked = document.querySelector('input[name="player"]:checked');
    if (!checked) return 1.0;
    const found = playerData.find(p => p.key === checked.value);
    return found ? found.rate : 1.0;
}
function isUrgent() { return urgentCheck.checked; }

function updateDetailCards() {
    const p = projectDetails[getSelectedProject()];
    detailDescA.textContent = p.a.desc;
    detailDescB.textContent = p.b.desc;
    detailDescC.textContent = p.c.desc;
    detailPriceA.textContent = `¥${p.a.price}`;
    detailPriceB.textContent = `¥${p.b.price}`;
    detailPriceC.textContent = `¥${p.c.price}`;
}
function calcTotal() { const base = projectDetails[getSelectedProject()][getSelectedDetail()].price; return base * getQty() * getPlayerRate() * (isUrgent() ? 1.1 : 1); }
function refreshPrice() {
    const base = projectDetails[getSelectedProject()][getSelectedDetail()].price;
    basePriceDisplay.textContent = `¥${base.toFixed(2)}`;
    qtyMultDisplay.textContent = `×${getQty()}`;
    playerMultDisplay.textContent = `×${getPlayerRate().toFixed(2)}`;
    totalPriceDisplay.textContent = `¥${calcTotal().toFixed(2)}`;
    urgentRow.style.display = isUrgent() ? 'flex' : 'none';
}
projectRadios.forEach(r => r.addEventListener('change', () => { updateDetailCards(); refreshPrice(); }));
detailRadios.forEach(r => r.addEventListener('change', refreshPrice));
qtyMinus.addEventListener('click', () => { if (getQty() > 1) { qtyInput.value = getQty() - 1; refreshPrice(); } });
qtyPlus.addEventListener('click', () => { if (getQty() < 99) { qtyInput.value = getQty() + 1; refreshPrice(); } });
qtyInput.addEventListener('input', () => { qtyInput.value = getQty(); refreshPrice(); });
urgentCheck.addEventListener('change', refreshPrice);
document.addEventListener('change', e => { if (e.target.name === 'player') refreshPrice(); });

// 复制订单
copyBtn.addEventListener('click', async () => {
    const p = projectDetails[getSelectedProject()];
    const detailKey = getSelectedDetail();
    const playerChecked = document.querySelector('input[name="player"]:checked');
    const playerInfo = playerData.find(pd => pd.key === playerChecked?.value) || { name:'未知', rate:getPlayerRate() };
    const remark = document.getElementById('remarkInput')?.value.trim() || '';
    const remarkLine = remark ? `\n📝 备注：${remark}` : '';
    const token = localStorage.getItem('token');
    const currentUsername = localStorage.getItem('username');
    const userLine = (token && currentUsername) ? `\n👤 下单用户：${currentUsername}` : '';
    const order = `【WOTB情谊代练订单】\n🎯 项目：${p.name}\n📋 详情：方案${detailKey.toUpperCase()} - ${p[detailKey].desc}\n🔢 数量：${getQty()}\n👤 打手：${playerInfo.name} (${playerInfo.rate}x)\n⚡ 加急：${isUrgent()?'是':'否'}\n💰 总价：¥${calcTotal().toFixed(2)}\n📅 下单时间：${new Date().toLocaleString()}${remarkLine}${userLine}\n---\n如需帮助请联系客服`;
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
document.querySelectorAll('.contact-copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const text = btn.dataset.copy;
        const orig = btn.textContent;
        btn.textContent = '✅ 已复制';
        setTimeout(() => btn.textContent = orig, 1500);
        // 优先尝试现代 API
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                showToast('✅ 已复制到剪贴板');
                return;
            } catch (err) {}
        }
        // 传统降级方案
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
            document.execCommand('copy');
            showToast('✅ 已复制到剪贴板');
        } catch (err) {
            showToast('❌ 复制失败，请手动复制');
        }
        document.body.removeChild(textarea);
    });
});

// ==================== 计算器 ====================
calcTypeRadios.forEach(r => r.addEventListener('change', () => {
    const type = r.value;
    calcUnit.textContent = type === 'winrate' ? '胜率' : '场均伤害';
    calcTargetL.textContent = type === 'winrate' ? '胜率' : '场均伤害';
    calcExpL.textContent = type === 'winrate' ? '胜率' : '场均伤害';
    calcResult.style.display = 'none';
}));
document.getElementById('calcBtn').addEventListener('click', () => {
    const type = document.querySelector('input[name="calcType"]:checked').value;
    const cur = parseFloat(document.getElementById('currentValue').value);
    const battles = parseInt(document.getElementById('currentBattles').value);
    const target = parseFloat(document.getElementById('targetValue').value);
    const exp = parseFloat(document.getElementById('expectedValue').value);
    const calcResultDiv = document.getElementById('calcResult');
    const calcResultText = document.getElementById('calcResultText');
    const copyCalcBtn = document.getElementById('copyCalcResultBtn');
    if (isNaN(cur) || isNaN(battles) || isNaN(target) || isNaN(exp) || battles < 1) { calcResultText.innerHTML = '❌ 请填写完整有效数值'; copyCalcBtn.style.display='none'; calcResultDiv.style.display='block'; return; }
    if (exp <= target) { calcResultText.innerHTML = '⚠️ 预期值必须高于目标值，否则无法达成'; copyCalcBtn.style.display='none'; calcResultDiv.style.display='block'; return; }
    const needed = (target - cur) * battles / (exp - target);
    if (needed <= 0) { calcResultText.innerHTML = '✅ 当前数据已达标，无需再打'; copyCalcBtn.style.display='none'; calcResultDiv.style.display='block'; return; }
    const round = Math.ceil(needed);
    calcResultText.innerHTML = `🎯 还需要 <strong>${round}</strong> 场<br><small>精确计算 ${needed.toFixed(2)} 场，向上取整</small>`;
    copyCalcBtn.style.display='inline-block'; calcResultDiv.style.display='block';
    copyCalcBtn.onclick = async () => {
        const typeText = type === 'winrate' ? '胜率' : '场均伤害';
        const unit = type === 'winrate' ? '%' : '';
        const fullText = `【坦克世界闪击战 - 自助计算】\n类型：${typeText}\n当前数据：${cur}${unit}（场次 ${battles}）\n目标数据：${target}${unit}\n预期每场：${exp}${unit}\n计算结果：需要再打 ${round} 场（精确计算 ${needed.toFixed(2)} 场）`;
        try { await navigator.clipboard.writeText(fullText); showToast('✅ 完整结果已复制'); } catch (err) { showToast('❌ 复制失败'); }
    };
});

// ==================== 新闻 ====================
const newsData = [
    { title:'🎉 夏季联赛预告', time:'2026-06-29', content:'2026夏季联赛即将开始，代练业务同步支持各类教学。' },
    { title:'⚡ 周末优惠活动', time:'2026-06-29', content:'本周六日全场下单优惠10%，代练价格大幅下降，欢迎下单！' },
    { title:'🛡️ 账号安全提醒', time:'2026-06-29', content:'近期出现第三方虚假代练，请认准本站唯一客服联系方式，谨防上当。' }
];
document.getElementById('newsContainer').innerHTML = newsData.map(n => `<div class="news-item"><div class="news-title">${n.title}</div><div class="news-time">${n.time}</div><div class="news-content">${n.content}</div></div>`).join('');

// ==================== 用户登录状态管理 ====================
function checkLoginStatus() {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');
    if (token && username) {
        openRegisterBtn.style.display = 'none';
        openLoginBtn.style.display = 'none';
        userMenu.style.display = 'block';
        displayUsername.textContent = username;
    } else {
        openRegisterBtn.style.display = 'inline-block';
        openLoginBtn.style.display = 'inline-block';
        userMenu.style.display = 'none';
    }
    adminPanelBtn.style.display = (role === 'admin') ? 'block' : 'none';
    boosterPanelBtn.style.display = (role === 'booster' || role === 'admin') ? 'block' : 'none';
    leagueAdminBtn.style.display = (role === 'admin') ? 'block' : 'none';
}
logoutBtn.addEventListener('click', () => { localStorage.removeItem('token'); localStorage.removeItem('username'); localStorage.removeItem('role'); checkLoginStatus(); userDropdown.style.display = 'none'; showToast('👋 已退出登录'); });
userMenuBtn.addEventListener('click', (e) => { e.stopPropagation(); userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block'; });
document.addEventListener('click', () => { userDropdown.style.display = 'none'; });

// ==================== 注册/登录弹窗 ====================
openRegisterBtn.addEventListener('click', () => { registerModal.style.display = 'flex'; });
closeRegisterBtn.addEventListener('click', () => { registerModal.style.display = 'none'; regError.textContent = ''; });
registerModal.addEventListener('click', (e) => { if (e.target === registerModal) { registerModal.style.display = 'none'; regError.textContent = ''; } });
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const referral = document.getElementById('regReferral').value.trim();
    if (!username || !password) { regError.textContent = '用户名和密码必填'; return; }
    if (password.length < 6) { regError.textContent = '密码至少6位'; return; }
    try {
        const res = await fetch(`${API_BASE}/auth/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password, email, phone, referralCode: referral }) });
        const data = await res.json();
        if (res.ok) { showToast('✅ 注册成功！请登录'); registerModal.style.display = 'none'; registerForm.reset(); regError.textContent = ''; }
        else { regError.textContent = data.error || '注册失败'; }
    } catch (err) { regError.textContent = '网络错误，请检查后端是否启动'; }
});
toLoginLink.addEventListener('click', (e) => { e.preventDefault(); registerModal.style.display = 'none'; loginModal.style.display = 'flex'; });
toRegisterLink.addEventListener('click', (e) => { e.preventDefault(); loginModal.style.display = 'none'; registerModal.style.display = 'flex'; });
openLoginBtn.addEventListener('click', () => { loginModal.style.display = 'flex'; });
closeLoginBtn.addEventListener('click', () => { loginModal.style.display = 'none'; loginError.textContent = ''; });
loginModal.addEventListener('click', (e) => { if (e.target === loginModal) { loginModal.style.display = 'none'; loginError.textContent = ''; } });
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!username || !password) { loginError.textContent = '用户名和密码不能为空'; return; }
    try {
        const res = await fetch(`${API_BASE}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
        const data = await res.json();
        if (res.ok && data.success) {
            localStorage.setItem('token', data.token); localStorage.setItem('username', data.user.username); localStorage.setItem('role', data.user.role);
            localStorage.setItem('boosterIdentity', data.user.booster_identity || 'standard');
            checkLoginStatus(); loginModal.style.display = 'none'; loginError.textContent = ''; showToast('✅ 登录成功！');
        } else { loginError.textContent = data.error || '登录失败'; }
    } catch (err) { loginError.textContent = '网络错误'; }
});

// ==================== 个人中心 ====================
async function loadProfile() {
    const token = localStorage.getItem('token');
    const info = document.getElementById('profileInfo');
    if (!token) { info.innerHTML = '<p style="color:var(--red)">请先登录</p>'; return; }
    try {
        const res = await fetch(`${API_BASE}/user/profile`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('获取失败');
        const user = await res.json();
        info.innerHTML = `
            <p><span>用户名：</span><span>${user.username}</span></p>
            <p><span>邮箱：</span><span>${user.email || '未填写'}</span></p>
            <p><span>手机：</span><span>${user.phone || '未填写'}</span></p>
            <p><span>余额：</span><span>¥${user.balance}</span></p>
            <p><span>信誉分：</span><span>${user.reputation}</span></p>
            <p><span>推荐码：</span><span>${user.referral_code}</span></p>
            <p><span>打手身份：</span><span>${user.booster_identity || 'standard'}</span></p>
            <p><span>打手积分：</span><span>${user.booster_points || 0}</span></p>
            <p><span>注册时间：</span><span>${new Date(user.created_at).toLocaleString()}</span></p>
        `;
    } catch (err) { info.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}
async function loadOrders() {
    const list = document.getElementById('orderList');
    if (!list) return;
    const token = localStorage.getItem('token');
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

// ==================== 提交订单（含 player_type） ====================
const submitOrderBtn = document.getElementById('submitOrderBtn');
submitOrderBtn.addEventListener('click', async () => {
    const token = localStorage.getItem('token');
    if (!token) { showToast('❌ 请先登录后再提交订单'); return; }
    const project = getSelectedProject(); const detail = getSelectedDetail(); const qty = getQty();
    const playerChecked = document.querySelector('input[name="player"]:checked');
    const playerInfo = playerData.find(p => p.key === (playerChecked?.value || 'standard')) || { name:'标准打手', rate:1.0, identity:'standard' };
    const urgent = isUrgent(); const total = calcTotal(); const base = projectDetails[project][detail].price;
    const remark = document.getElementById('remarkInput')?.value.trim() || '';
    const gameUid = document.getElementById('gameUid').value.trim();
    const gameAccount = document.getElementById('gameAccount').value.trim();
    const gamePassword = document.getElementById('gamePassword').value.trim();
    const clientTypeEl = document.querySelector('input[name="clientType"]:checked');
    const clientType = clientTypeEl ? clientTypeEl.value : 'Android';
    const playerType = playerChecked ? playerChecked.value : 'standard';
    const body = {
        project: projectDetails[project].name,
        detail: `${detail.toUpperCase()} - ${projectDetails[project][detail].desc}`,
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
        player_type: playerType
    };
    try {
        const res = await fetch(`${API_BASE}/orders`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify(body) });
        const data = await res.json();
        if (res.ok) showToast(`✅ 订单提交成功！订单号：${data.order_no}`);
        else showToast('❌ ' + (data.error || '提交失败'));
    } catch (err) { showToast('❌ 网络错误'); }
});

// ==================== 管理面板（全屏版） ====================
const statusFilter = document.getElementById('statusFilter');
const refreshOrdersBtn = document.getElementById('refreshOrdersBtn');
const adminOrderList = document.getElementById('adminOrderList');

async function loadAdminOrders() {
    const token = localStorage.getItem('token'); if (!token) return;
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
    const statusOptions = ['pending', 'playing', 'done'];
    const statusText = { pending: '待接单', playing: '代练中', done: '已完成' };
    const paymentStatusMap = { unpaid: '未支付', pending: '待确认', paid: '已支付' };
    if (orders.length === 0) { adminOrderList.innerHTML = '<p>暂无订单</p>'; return; }
    let html = '<table><tr><th>订单号</th><th>用户</th><th>项目</th><th>数量</th><th>客户端</th><th>要求打手</th><th>金额</th><th>状态</th><th>支付</th><th>操作</th><th>时间</th></tr>';
    orders.forEach(o => {
        const identityMap = { gold:'金牌', silver:'银牌', standard:'标准', budget:'特惠' };
        html += `<tr>
            <td>${o.order_no}</td><td>${o.username}</td><td>${o.project} - ${o.detail}</td><td>${o.quantity}</td><td>${o.client_type||'Android'}</td><td>${identityMap[o.required_identity]||'标准'}</td><td>¥${o.total_price}</td>
            <td><span class="order-status status-${o.status}">${statusText[o.status]||o.status}</span></td>
            <td><span class="payment-status payment-${o.payment_status}">${paymentStatusMap[o.payment_status]||'未知'}</span></td>
            <td>
                <select class="status-select" data-order="${o.order_no}" onchange="updateOrderStatus(this)">
                    ${statusOptions.map(s => `<option value="${s}" ${s===o.status?'selected':''}>${statusText[s]}</option>`).join('')}
                </select>
                ${o.payment_status === 'pending' ? `<button class="confirm-payment-btn" data-order="${o.order_no}">确认收款</button>` : ''}
                ${o.payment_screenshot ? ` <a href="/uploads/${o.payment_screenshot}" target="_blank" style="font-size:0.7rem;">截图</a>` : ''}
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
    const orderNo = selectEl.dataset.order; const newStatus = selectEl.value; const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/orders/${orderNo}`, { method:'PUT', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ status: newStatus }) });
        const data = await res.json();
        if (res.ok) showToast('✅ 状态更新成功'); else { showToast('❌ ' + (data.error||'更新失败')); loadAdminOrders(); }
    } catch (err) { showToast('❌ 网络错误'); loadAdminOrders(); }
};
document.addEventListener('click', async (e) => {
    const token = localStorage.getItem('token'); if (!token) return;
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
});
statusFilter.addEventListener('change', loadAdminOrders);
refreshOrdersBtn.addEventListener('click', loadAdminOrders);

// 管理面板标签切换
document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.admintab;
        document.getElementById('adminOrdersSection').style.display = target === 'orders' ? 'block' : 'none';
        document.getElementById('adminCustomSection').style.display = target === 'custom' ? 'block' : 'none';
        document.getElementById('adminBoostersSection').style.display = target === 'boosters' ? 'block' : 'none';
        document.getElementById('adminRolesSection').style.display = target === 'roles' ? 'block' : 'none';
        if (target === 'custom') loadAdminCustomRequests();
        else if (target === 'boosters') loadAdminBoosters();
        else if (target === 'roles') loadUserList();
    });
});
async function loadUserList() {
    const token = localStorage.getItem('token'); const select = document.getElementById('userSelect'); if (!select) return;
    try {
        const res = await fetch(`${API_BASE}/admin/users`, { headers:{'Authorization':`Bearer ${token}`} });
        if (!res.ok) throw new Error('获取失败');
        const users = await res.json();
        select.innerHTML = '<option value="">-- 选择用户 --</option>' + users.map(u => `<option value="${u.id}">${u.username} (${u.role})</option>`).join('');
    } catch (err) { select.innerHTML = '<option value="">加载失败</option>'; }
}
function bindUpdateRole() {
    const btn = document.getElementById('updateRoleBtn'); if (!btn) return;
    btn.addEventListener('click', async () => {
        const token = localStorage.getItem('token');
        const userId = document.getElementById('userSelect').value;
        const role = document.getElementById('roleSelect').value;
        const msgEl = document.getElementById('roleUpdateMsg');
        if (!userId) { msgEl.textContent = '请先选择一个用户'; return; }
        try {
            const res = await fetch(`${API_BASE}/admin/users/${userId}/role`, { method:'PUT', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ role }) });
            const data = await res.json();
            if (res.ok) { msgEl.textContent = '✅ ' + data.message; loadUserList(); }
            else msgEl.textContent = '❌ ' + (data.error||'操作失败');
        } catch (err) { msgEl.textContent = '❌ 网络错误'; }
    });
}
async function loadAdminCustomRequests() {
    const token = localStorage.getItem('token'); const list = document.getElementById('adminCustomList');
    try {
        const res = await fetch(`${API_BASE}/admin/custom-requests`, { headers:{'Authorization':`Bearer ${token}`} });
        const requests = await res.json();
        if (!requests.length) { list.innerHTML = '<p>暂无定制需求</p>'; return; }
        let html = '<table><tr><th>时间</th><th>用户</th><th>客户端</th><th>类型</th><th>详情</th><th>联系方式</th><th>预算</th><th>可联系时间</th><th>备注</th></tr>';
        requests.forEach(r => {
            html += `<tr><td>${new Date(r.created_at).toLocaleString()}</td><td>${r.username}</td><td>${r.client_type}</td><td>${r.request_type}</td><td>${r.description}</td><td>${r.contact}</td><td>${r.budget||'-'}</td><td>${r.available_time||'-'}</td><td>${r.remark||'-'}</td></tr>`;
        });
        html += '</table>';
        list.innerHTML = html;
    } catch (err) { list.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}
async function loadAdminBoosters() {
    const token = localStorage.getItem('token');
    const list = document.getElementById('adminBoostersList');
    try {
        const res = await fetch(`${API_BASE}/admin/boosters`, { headers: { 'Authorization': `Bearer ${token}` } });
        const boosters = await res.json();
        if (!boosters.length) { list.innerHTML = '<p>暂无打手</p>'; return; }
        let html = '<table><tr><th>用户名</th><th>身份组</th><th>积分</th><th>操作</th></tr>';
        boosters.forEach(b => {
            html += `<tr>
                <td>${b.username}</td>
                <td>${b.booster_identity}</td>
                <td>${b.booster_points}</td>
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
    const token = localStorage.getItem('token');
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

// 订单详情与复制
async function showOrderDetail(orderNo) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_BASE}/orders/${orderNo}/detail`, { headers:{'Authorization':`Bearer ${token}`} });
        if (!res.ok) throw new Error('无权或加载失败');
        const order = await res.json();
        const identityMap = { gold:'金牌', silver:'银牌', standard:'标准', budget:'特惠' };
        const html = `
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
        document.getElementById('orderDetailContent').innerHTML = html;
        document.getElementById('orderDetailModal').style.display = 'flex';
    } catch (err) { showToast('❌ ' + (err.message || '加载详情失败')); }
}
async function copyOrderDetail(orderNo) {
    const token = localStorage.getItem('token');
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
document.getElementById('closeOrderDetailBtn').addEventListener('click', () => { document.getElementById('orderDetailModal').style.display = 'none'; });
document.getElementById('orderDetailModal').addEventListener('click', (e) => { if (e.target === document.getElementById('orderDetailModal')) document.getElementById('orderDetailModal').style.display = 'none'; });

// ==================== 支付凭证上传 ====================
let currentOrderNo = '';
const paymentModal = document.getElementById('paymentModal');
const closePaymentBtn = document.getElementById('closePaymentBtn');
const paymentFile = document.getElementById('paymentFile');
const pasteArea = document.getElementById('pasteArea');
const previewImage = document.getElementById('previewImage');
const submitPaymentBtn = document.getElementById('submitPaymentBtn');
const paymentError = document.getElementById('paymentError');
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('upload-payment-btn')) {
        currentOrderNo = e.target.dataset.order;
        paymentModal.style.display = 'flex'; paymentError.textContent = ''; previewImage.style.display = 'none'; paymentFile.value = ''; pasteArea.innerText = '';
    }
});
closePaymentBtn.addEventListener('click', () => paymentModal.style.display = 'none');
paymentModal.addEventListener('click', (e) => { if (e.target === paymentModal) paymentModal.style.display = 'none'; });
paymentFile.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = (ev) => { previewImage.src = ev.target.result; previewImage.style.display = 'block'; };
    reader.readAsDataURL(file);
});
pasteArea.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (let item of items) {
        if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile(); const reader = new FileReader();
            reader.onload = (ev) => { previewImage.src = ev.target.result; previewImage.style.display = 'block'; };
            reader.readAsDataURL(blob); e.preventDefault();
        }
    }
});
submitPaymentBtn.addEventListener('click', async () => {
    const token = localStorage.getItem('token'); if (!token) { paymentError.textContent = '请先登录'; return; }
    if (!currentOrderNo) { paymentError.textContent = '订单号异常'; return; }
    const screenshot = previewImage.src;
    if (!screenshot || screenshot === window.location.href) { paymentError.textContent = '请先选择或粘贴截图'; return; }
    try {
        const res = await fetch(`${API_BASE}/orders/${currentOrderNo}/payment`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ screenshot }) });
        const data = await res.json();
        if (res.ok) { showToast('✅ 支付凭证已提交'); paymentModal.style.display = 'none'; if (document.getElementById('sectionProfile').style.display === 'block') await loadOrders(); }
        else paymentError.textContent = data.error || '提交失败';
    } catch (err) { paymentError.textContent = '网络错误'; }
});

// ==================== 打手面板（全屏版） ====================
document.querySelectorAll('.booster-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.booster-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.querySelectorAll('.booster-tab-content').forEach(c => c.style.display = 'none');
        document.getElementById(target).style.display = 'block';
        if (target === 'booster-hall') loadHallOrders();
        else if (target === 'booster-my') loadMyBoosterOrders();
        else if (target === 'booster-earnings') loadEarnings();
    });
});
async function loadHallOrders() {
    const token = localStorage.getItem('token');
    const list = document.getElementById('hallOrderList');
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
    const token = localStorage.getItem('token'); const list = document.getElementById('myBoosterOrderList');
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
    const token = localStorage.getItem('token'); const display = document.getElementById('earningsDisplay');
    try {
        const res = await fetch(`${API_BASE}/booster/earnings`, { headers:{'Authorization':`Bearer ${token}`} });
        const data = await res.json();
        display.innerHTML = `<p>累计收益：<strong>¥${data.earnings}</strong></p>`;
    } catch (err) { display.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}

// ==================== 开箱模拟器 ====================
let currentChestId = null;
function getTickets() { return parseInt(localStorage.getItem('tickets') || '0'); }
function setTickets(num) { localStorage.setItem('tickets', num); updateTicketDisplay(); }
function updateTicketDisplay() { const el = document.getElementById('ticketBalance'); if (el) el.textContent = getTickets(); }
function getTodayStr() { return new Date().toISOString().slice(0,10); }
function getLastCheckin() { return localStorage.getItem('lastCheckinDate'); }
function doCheckin() {
    const today = getTodayStr();
    if (getLastCheckin() === today) { showToast('⏰ 今日已签到，明天再来吧'); return; }
    setTickets(getTickets() + 1000);
    localStorage.setItem('lastCheckinDate', today);
    showToast('✅ 签到成功！获得1000军需券');
}
function doRecharge() { setTickets(getTickets() + 1000); showToast('💰 充值成功！获得1000军需券'); }
function renderChests() {
    const grid = document.getElementById('chestGrid'); if (!grid) return;
    grid.innerHTML = '';
    chestsConfig.forEach(chest => {
        const div = document.createElement('div'); div.className = 'chest-item';
        div.innerHTML = `<img src="${chest.image}" alt="${chest.name}" onerror="this.src='images/chests/placeholder.png';"><div class="chest-name">${chest.name}</div><div class="chest-price">🪙 ${chest.price} <span class="chest-currency">军需券</span></div>`;
        div.addEventListener('click', () => openChestDetail(chest)); grid.appendChild(div);
    });
}
function openChestDetail(chest) {
    currentChestId = chest.id;
    document.getElementById('chestDetailTitle').textContent = chest.name;
    document.getElementById('chestDetailImg').src = chest.image;
    document.getElementById('chestDetailDesc').textContent = chest.desc;
    document.getElementById('chestPriceDisplay').textContent = chest.price;
    const probContainer = document.getElementById('chestDetailProb');
    let html = '<div class="prob-list"><div><strong>类别</strong><strong>概率</strong></div>';
    normalPool.forEach(item => { const p = (item.weight / normalTotalWeight * 95).toFixed(2); html += `<div><span class="prob-label">${item.name}</span><span class="prob-value">${p}%</span></div>`; });
    rarePool.forEach(item => { const p = (item.weight / rareTotalWeight * 5).toFixed(2); html += `<div><span class="prob-label">${item.name}</span><span class="prob-value">${p}%</span></div>`; });
    html += '</div>'; probContainer.innerHTML = html;
    document.getElementById('chestBuyMsg').style.display = 'none';
    document.getElementById('chestDetailModal').style.display = 'flex';
}
document.getElementById('closeChestDetailBtn').addEventListener('click', () => { document.getElementById('chestDetailModal').style.display = 'none'; });
document.getElementById('chestDetailModal').addEventListener('click', (e) => { if (e.target === document.getElementById('chestDetailModal')) document.getElementById('chestDetailModal').style.display = 'none'; });
document.getElementById('buyChestBtn').addEventListener('click', () => {
    if (!currentChestId) return;
    const chest = chestsConfig.find(c => c.id === currentChestId); if (!chest) return;
    if (getTickets() < chest.price) { document.getElementById('chestBuyMsg').textContent = '❌ 军需券不足'; document.getElementById('chestBuyMsg').style.display = 'block'; return; }
    setTickets(getTickets() - chest.price);
    const rand = Math.random() * 100;
    const reward = rand < 5 ? drawFromPool(rarePool, rareTotalWeight) : drawFromPool(normalPool, normalTotalWeight);
    showToast(`🎉 打开 ${chest.name} 获得：${reward.name}`);
    document.getElementById('chestDetailModal').style.display = 'none';
});
function drawFromPool(pool, totalWeight) { let r = Math.random() * totalWeight; for (let item of pool) { r -= item.weight; if (r <= 0) return item; } return pool[0]; }
document.getElementById('checkinBtn').addEventListener('click', doCheckin);
document.getElementById('rechargeBtn').addEventListener('click', doRecharge);
function initChestSimulator() { updateTicketDisplay(); renderChests(); }

// ==================== 独立工具子菜单 ====================
function initToolSubMenu() {
    const tabs = document.querySelectorAll('.tool-tab');
    const panels = { calculator: document.getElementById('toolCalculator'), chestsim: document.getElementById('toolChestSim'), randomtank: document.getElementById('toolRandomTank') };
    tabs.forEach(tab => { tab.addEventListener('click', () => { tabs.forEach(t => t.classList.remove('active')); tab.classList.add('active'); const tool = tab.dataset.tab; Object.values(panels).forEach(p => p.style.display = 'none'); if (panels[tool]) { panels[tool].style.display = 'block'; if (tool === 'randomtank') { setTimeout(() => { wheelCanvas = document.getElementById('wheelCanvas'); if (wheelCanvas) { wheelCanvas.width = wheelCanvas.offsetWidth || 400; wheelCanvas.height = wheelCanvas.offsetHeight || 400; wheelCtx = wheelCanvas.getContext('2d'); drawWheel(wheelAngle); } }, 100); } } }); });
}

// ==================== 转盘 ====================
let wheelAngle = 0, spinning = false, wheelCanvas, wheelCtx;
function initWheel() {
    wheelCanvas = document.getElementById('wheelCanvas');
    if (!wheelCanvas) return;
    if (wheelCanvas.offsetWidth > 0 && wheelCanvas.offsetHeight > 0) {
        wheelCanvas.width = wheelCanvas.offsetWidth;
        wheelCanvas.height = wheelCanvas.offsetHeight;
    } else {
        wheelCanvas.width = 400;
        wheelCanvas.height = 400;
    }
    wheelCtx = wheelCanvas.getContext('2d');
    drawWheel(0);
}
function drawWheel(rotation = 0) {
    if (!wheelCtx) return;
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
    if (spinning) return; spinning = true;
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
            document.getElementById('wheelResult').textContent = `🎉 抽中：${tankList[finalSlice]}`;
            spinning = false;
        }
    }
    requestAnimationFrame(animate);
}
document.getElementById('spinWheelBtn')?.addEventListener('click', spinWheel);
document.getElementById('wheelCanvas')?.addEventListener('click', spinWheel);

// ==================== 定制化需求 ====================
customRequestCard.addEventListener('click', () => { customRequestModal.style.display = 'flex'; });
closeCustomRequestBtn.addEventListener('click', () => customRequestModal.style.display = 'none');
customRequestModal.addEventListener('click', (e) => { if (e.target === customRequestModal) customRequestModal.style.display = 'none'; });
customRequestForm.addEventListener('submit', async (e) => {
    e.preventDefault(); const token = localStorage.getItem('token'); if (!token) { customRequestError.textContent = '请先登录'; return; }
    const client_type = document.getElementById('customClientType').value;
    const request_type = document.getElementById('customRequestType').value.trim();
    const description = document.getElementById('customDescription').value.trim();
    const contact = document.getElementById('customContact').value.trim();
    const budget = document.getElementById('customBudget').value.trim();
    const available_time = document.getElementById('customAvailableTime').value.trim();
    const remark = document.getElementById('customRemark').value.trim();
    if (!client_type || !request_type || !description || !contact) { customRequestError.textContent = '请填写所有必填项'; return; }
    try {
        const res = await fetch(`${API_BASE}/custom-request`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ client_type, request_type, description, contact, budget, available_time, remark }) });
        const data = await res.json();
        if (res.ok) { showToast('✅ 定制需求已提交'); customRequestModal.style.display = 'none'; customRequestForm.reset(); customRequestError.textContent = ''; }
        else customRequestError.textContent = data.error || '提交失败';
    } catch (err) { customRequestError.textContent = '网络错误'; }
});

// ==================== 联赛相关 ====================
function renderLeagueCards() {
    const grid = document.getElementById('leagueNewsGrid'); if (!grid) return;
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
    document.getElementById('leagueDetailTitle').textContent = item.title;
    document.getElementById('leagueDetailTime').textContent = `发布时间：${item.time}`;
    document.getElementById('leagueDetailContent').textContent = item.content;
    document.getElementById('leagueDetailModal').style.display = 'flex';
}
document.getElementById('closeLeagueDetailBtn').addEventListener('click', () => { document.getElementById('leagueDetailModal').style.display = 'none'; });
document.getElementById('leagueDetailModal').addEventListener('click', (e) => { if (e.target === document.getElementById('leagueDetailModal')) document.getElementById('leagueDetailModal').style.display = 'none'; });

document.querySelectorAll('.league-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.league-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (tab.dataset.leagueView === 'standings') {
            document.getElementById('leagueStandingsView').style.display = 'block';
            document.getElementById('leagueNewsView').style.display = 'none';
            loadLeagueStandings();
        } else {
            document.getElementById('leagueNewsView').style.display = 'block';
            document.getElementById('leagueStandingsView').style.display = 'none';
        }
    });
});
async function loadLeagueStandings() {
    const container = document.getElementById('leagueStandingsContainer');
    container.innerHTML = '加载中...';
    const token = localStorage.getItem('token');
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

// ==================== 联赛管理后台（全屏版） ====================
document.querySelectorAll('.league-admin-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.league-admin-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const panel = btn.dataset.panel;
        document.querySelectorAll('.league-panel').forEach(p => p.style.display = 'none');
        const targetPanel = panel === 'league-config' ? 'leagueConfigPanel' : (panel === 'league-teams' ? 'leagueTeamsPanel' : 'leagueScoresPanel');
        document.getElementById(targetPanel).style.display = 'block';
        if (panel === 'league-config') loadLeagueConfig();
        else if (panel === 'league-teams') loadLeagueTeams();
        else if (panel === 'league-scores') loadLeagueScoresPanel();
    });
});

let selectedSeasonId = null;

async function loadLeagueConfig() {
    const panel = document.getElementById('leagueConfigPanel');
    panel.innerHTML = '加载中...';
    const token = localStorage.getItem('token');
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
    const token = localStorage.getItem('token');
    const rulesSection = document.getElementById('rulesSection');
    if (!rulesSection) return;
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
    const token = localStorage.getItem('token');
    const rules = [];
    for (let r = 1; r <= 5; r++) {
        for (let d = 1; d <= 2; d++) {
            for (let pos = 1; pos <= 4; pos++) {
                const el = document.getElementById(`rule_${r}_${d}_${pos}`);
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
    const token = localStorage.getItem('token');
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
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/leagues/${id}`, { method:'DELETE', headers:{'Authorization':`Bearer ${token}`} });
        const data = await res.json();
        if (res.ok) { showToast('🗑️ 赛季已删除'); loadLeagueConfig(); } else showToast('❌ ' + (data.error||'删除失败'));
    } catch (err) { showToast('❌ 网络错误'); }
};
window.saveLeagueSeason = async function() {
    const name = document.getElementById('seasonName').value.trim();
    if (!name) return showToast('❌ 请输入赛季名称');
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/leagues`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ name }) });
        const data = await res.json();
        if (res.ok) { showToast('✅ 赛季已创建'); loadLeagueConfig(); } else showToast('❌ ' + (data.error||'创建失败'));
    } catch (err) { showToast('❌ 网络错误'); }
};

// 队伍表
async function loadLeagueTeams() {
    const panel = document.getElementById('leagueTeamsPanel');
    panel.innerHTML = '加载中...';
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/teams`, { headers: { 'Authorization': `Bearer ${token}` } });
        const teams = await res.json();
        let html = '<h4>队伍列表</h4>';
        if (teams.length === 0) {
            html += '<p>暂无队伍，请添加</p>';
        } else {
            html += '<ul>';
            teams.forEach(t => {
                // 修复：队伍名用 span.team-name 包裹，避免换行错位
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
    const name = document.getElementById('newTeamName').value.trim();
    if (!name) return showToast('❌ 请输入队伍名');
    const token = localStorage.getItem('token');
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
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/teams`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body: JSON.stringify({ id, name: newName }) });
        const data = await res.json();
        if (res.ok) { showToast('✅ 队伍已更新'); loadLeagueTeams(); }
        else showToast('❌ ' + (data.error||'更新失败'));
    } catch (err) { showToast('❌ 网络错误'); }
};
window.deleteTeam = async function(id) {
    if (!confirm('确定删除该队伍吗？')) return;
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/teams/${id}`, { method:'DELETE', headers:{'Authorization':`Bearer ${token}`} });
        const data = await res.json();
        if (res.ok) { showToast('🗑️ 队伍已删除'); loadLeagueTeams(); }
        else showToast('❌ ' + (data.error||'删除失败'));
    } catch (err) { showToast('❌ 网络错误'); }
};

// 成绩表
async function loadLeagueScoresPanel() {
    const panel = document.getElementById('leagueScoresPanel');
    panel.innerHTML = '加载中...';
    const token = localStorage.getItem('token');
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
    const seasonId = document.getElementById('scoreSeason').value;
    const round = document.getElementById('scoreRound').value;
    const day = document.getElementById('scoreDay').value;
    const token = localStorage.getItem('token');
    const formDiv = document.getElementById('scoreForm');
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
    const token = localStorage.getItem('token');
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

// ==================== 启动 ====================
init();