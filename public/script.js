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
    silver: { name:'银币', a:{desc:'有紫狗牌有高级银币',price:8.8}, b:{desc:'无紫狗牌有高级银币',price:12.8}, c:{desc:'无紫狗牌无高级银币',price:14.8} },
    exp: { name:'单车经验', a:{desc:'有紫狗牌有高级经验',price:3.8}, b:{desc:'无紫狗牌有高级经验',price:5.8}, c:{desc:'无紫狗牌无高级经验',price:6.8} },
    winrate: { name:'胜率', a:{desc:'70%胜率/10场',price:19.8}, b:{desc:'75%胜率/10场',price:24.8}, c:{desc:'80%胜率/10场',price:34.8} },
    average: { name:'场均', a:{desc:'3000场均/10场',price:19.8}, b:{desc:'3300场均/10场',price:28.8}, c:{desc:'3500场均/10场',price:37.8} },
    mmedal: { name:'M章', a:{desc:'1个M章',price:29.8}, b:{desc:'3个M章',price:57.8}, c:{desc:'5个M章',price:138.8} },
    rings: { name:'三环', a:{desc:'一环',price:68.8}, b:{desc:'二环',price:158.8}, c:{desc:'三环',price:248.8} },
    rating: { name:'评级', a:{desc:'3千到4千/百分',price:11.8}, b:{desc:'4千到5千/百分',price:14.8}, c:{desc:'5千到6千/百分',price:29.8} }
};

const playerData = [
    { key:'jia', name:'情谊', title:'金牌打手', rate:1.2 },
    { key:'yi', name:'大飞', title:'金牌打手', rate:1.2 },
    { key:'bing', name:'Hansza', title:'银牌打手', rate:1.1 },
    { key:'ding', name:'梅花糕', title:'银牌打手', rate:1.1 },
    { key:'wu', name:'日日', title:'银牌打手', rate:1.1 },
    { key:'ji', name:'子夜', title:'男娘打手', rate:1.2 },
    { key:'geng', name:'灵月', title:'银牌打手', rate:1.1 },
    { key:'xin', name:'土豆', title:'铜牌打手', rate:1.0 },
    { key:'ren', name:'谷', title:'铜牌打手', rate:1.0 },
    { key:'gui', name:'小黑子', title:'特惠打手', rate:0.9 }
];

// ==================== 开箱模拟器配置 ====================
const chestsConfig = [
    { id: 1, name: '美国集装箱箱',   price: 198,  image: 'images/chests/chest_1.png', desc: '经典战斗资源补给，开出强力道具。' },
    { id: 2, name: '苏联集装箱',     price: 198,  image: 'images/chests/chest_2.png', desc: '火焰主题，内含稀有坦克碎片。' },
    { id: 3, name: '顶尖捕食者集装箱',     price: 498, image: 'images/chests/chest_3.png', desc: '夜战专属，高概率出全局经验。' },
    { id: 4, name: '超赞集装箱',        price: 288, image: 'images/chests/chest_4.png', desc: '雷电系列，有机会获得高级坦克。' },
    { id: 5, name: '我全都要集装箱',     price: 98, image: 'images/chests/chest_5.png', desc: '冰雪奇缘，内含稀有银币加成。' },
    { id: 6, name: '超大集装箱',       price: 198, image: 'images/chests/chest_6.png', desc: '经典怀旧，出金币概率较高。' },
    { id: 7, name: '重坦集装箱',     price: 88, image: 'images/chests/chest_7.png', desc: '未来科技，有极小概率出绝版坦克。' },
    { id: 8, name: '泰坦集装箱箱',         price: 388, image: 'images/chests/chest_8.png', desc: '专为狂战士打造，必出好东西。' },
    { id: 9, name: '赛季集装箱',     price: 588, image: 'images/chests/chest_9.png', desc: '传奇级别，概率获得稀有指挥官坦克。' }
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
    { name: '菲利斯',           weight: 1 }
];
const rareTotalWeight = rarePool.reduce((s, i) => s + i.weight, 0);

// ==================== 这把玩什么 - 坦克库 ====================
const tankList = [
    "T-54", "鼠式", "IS-7", "AMX 50B", "M48 Patton",
    "E-100", "T110E5", "FV215b", "T-62A", "Leopard 1",
    "Bat.-Chat. 25t", "STB-1", "Object 140", "60TP", "Kranvagn",
    "Progetto M40/65", "TVP T50/51", "AMX 30B", "WZ-132-1", "T-100 LT",
    "Sheridan", "Rhm. Pzw.", "Grille 15", "FV4005", "Strv K",
    "Foch 155", "斯柯达T27", "T95E6", "Super Conqueror ", "TRV",
    "Obj. 263", "FV215b 183", "穆拉特工程", "Type 5 Heavy", "T110E3",
    "Jagdpanzer E 100", "T110E4", "BadgerFV217", "Object 268", "WZ-113G FT",
    "T57 Heavy", "埃里希概念车", "VK 72.01(K)", "ChieftainMK6", "752工程",
    "Carro 45T", "Rinoceronte", "Vz.55", "Minotauro", "Ho-Ri III",
    "GSOR", "Lion", "BZ-75", "M-VI-Y", "菲利斯",
    "AC阿特拉斯", "野牛C45", "CS-63", "Object 430U", "K-91",
    "T-22 medium", "E 50 M", "Panzer 58", "121B", "122 TM",
    "56TP", "斯柯达T56", "埃米尔1951", "AMX 30原", "T77",
    "JPanther II", "Object268/4", "德古拉", "Smasher", "Rammer",
    "T-34-85 Rudy", "WZ-113", "WZ-121", "Type 71", "NC70B",
    "BZT-70", "260工程", "114SP2", "ISU-130", "T-34-3",
    "T-44-100", "XM66F", "M6A2E1", "T34", "AMX CDC",
    "FCM 50 t", "Strv 81", "WZ-111 5A", "116F3", "KPZ70",
    "SU-130PM", "TS-5", "WZ-120-1G FT", "IS-6", "Object 252U"
];
while (tankList.length < 100) {
    tankList.push("随机坦克" + (tankList.length + 1));
}

// ==================== DOM元素引用 ====================
// 板块切换
const mainMenu = document.getElementById('mainMenu');
const sections = {
    boost: document.getElementById('sectionBoost'),
    tools: document.getElementById('sectionTools'),
    news: document.getElementById('sectionNews'),
    announcement: document.getElementById('sectionAnnouncement')
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
}

// ==================== 板块切换 ====================
document.querySelectorAll('.menu-card').forEach(card => {
    card.addEventListener('click', () => {
        const target = card.dataset.target;
        mainMenu.style.display = 'none';
        Object.values(sections).forEach(sec => sec.style.display = 'none');
        if (sections[target]) {
            sections[target].style.display = 'block';
        }
    });
});

document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        Object.values(sections).forEach(sec => sec.style.display = 'none');
        mainMenu.style.display = 'flex';
    });
});

// ==================== 打手列表生成 ====================
function generatePlayers() {
    const grid = document.getElementById('playerGrid');
    if (!grid) return;
    grid.innerHTML = '';
    playerData.forEach((p, idx) => {
        const label = document.createElement('label');
        label.className = 'player-card';
        label.innerHTML = `
            <input type="radio" name="player" value="${p.key}" ${idx===3?'checked':''}>
            <div class="player-inner">
                <span class="player-name">${p.name}</span>
                <span class="player-title">${p.title}</span>
                <span class="player-rate">${p.rate}x</span>
            </div>
        `;
        grid.appendChild(label);
    });
}

// ==================== 代练价格计算 ====================
function getSelectedProject() {
    const checked = document.querySelector('input[name="project"]:checked');
    return checked ? checked.value : 'silver';
}
function getSelectedDetail() {
    const checked = document.querySelector('input[name="detail"]:checked');
    return checked ? checked.value : 'a';
}
function getQty() {
    let qty = parseInt(qtyInput.value, 10);
    if (isNaN(qty) || qty < 1) qty = 1;
    if (qty > 99) qty = 99;
    return qty;
}
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

function calcTotal() {
    const base = projectDetails[getSelectedProject()][getSelectedDetail()].price;
    return base * getQty() * getPlayerRate() * (isUrgent() ? 1.1 : 1);
}

function refreshPrice() {
    const base = projectDetails[getSelectedProject()][getSelectedDetail()].price;
    basePriceDisplay.textContent = `¥${base.toFixed(2)}`;
    qtyMultDisplay.textContent = `×${getQty()}`;
    playerMultDisplay.textContent = `×${getPlayerRate().toFixed(2)}`;
    totalPriceDisplay.textContent = `¥${calcTotal().toFixed(2)}`;
    urgentRow.style.display = isUrgent() ? 'flex' : 'none';
}

// 监听变化
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

    const order = `【WOTB情谊代练订单】
🎯 项目：${p.name}
📋 详情：方案${detailKey.toUpperCase()} - ${p[detailKey].desc}
🔢 数量：${getQty()}
👤 打手：${playerInfo.name} (${playerInfo.rate}x)
⚡ 加急：${isUrgent()?'是':'否'}
💰 总价：¥${calcTotal().toFixed(2)}
📅 下单时间：${new Date().toLocaleString()}${remarkLine}${userLine}
---
如需帮助请联系客服`;

    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(order);
            copyFeedback.classList.add('show');
            setTimeout(() => copyFeedback.classList.remove('show'), 1800);
            showToast('✅ 订单已复制');
            return;
        } catch (err) {}
    }

    const textarea = document.createElement('textarea');
    textarea.value = order;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            copyFeedback.classList.add('show');
            setTimeout(() => copyFeedback.classList.remove('show'), 1800);
            showToast('✅ 订单已复制');
        } else {
            showToast('❌ 复制失败，请手动复制');
        }
    } catch (err) {
        showToast('❌ 复制失败，请手动复制');
    } finally {
        document.body.removeChild(textarea);
    }
});

// 客服复制按钮
document.querySelectorAll('.contact-copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const text = btn.dataset.copy;
        await navigator.clipboard.writeText(text);
        const orig = btn.textContent;
        btn.textContent = '✅ 已复制';
        setTimeout(() => btn.textContent = orig, 1500);
        showToast('✅ 已复制到剪贴板');
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

    if (isNaN(cur) || isNaN(battles) || isNaN(target) || isNaN(exp) || battles < 1) {
        calcResultText.innerHTML = '❌ 请填写完整有效数值';
        copyCalcBtn.style.display = 'none';
        calcResultDiv.style.display = 'block';
        return;
    }
    if (exp <= target) {
        calcResultText.innerHTML = '⚠️ 预期值必须高于目标值，否则无法达成';
        copyCalcBtn.style.display = 'none';
        calcResultDiv.style.display = 'block';
        return;
    }

    const needed = (target - cur) * battles / (exp - target);
    if (needed <= 0) {
        calcResultText.innerHTML = '✅ 当前数据已达标，无需再打';
        copyCalcBtn.style.display = 'none';
        calcResultDiv.style.display = 'block';
        return;
    }

    const round = Math.ceil(needed);
    calcResultText.innerHTML = `🎯 还需要 <strong>${round}</strong> 场<br><small>精确计算 ${needed.toFixed(2)} 场，向上取整</small>`;
    copyCalcBtn.style.display = 'inline-block';
    calcResultDiv.style.display = 'block';

    copyCalcBtn.onclick = async () => {
        const typeText = type === 'winrate' ? '胜率' : '场均伤害';
        const unit = type === 'winrate' ? '%' : '';
        const fullText = `【坦克世界闪击战 - 自助计算】
类型：${typeText}
当前数据：${cur}${unit}（场次 ${battles}）
目标数据：${target}${unit}
预期每场：${exp}${unit}
计算结果：需要再打 ${round} 场（精确计算 ${needed.toFixed(2)} 场）`;
        try {
            await navigator.clipboard.writeText(fullText);
            showToast('✅ 完整结果已复制');
        } catch (err) {
            showToast('❌ 复制失败');
        }
    };
});

// ==================== 新闻 ====================
const newsData = [
    { title:'🎉 夏季联赛预告', time:'2026-06-29', content:'2026夏季联赛即将开始，代练业务同步支持各类教学。' },
    { title:'⚡ 周末优惠活动', time:'2026-06-29', content:'本周六日全场下单优惠10%，代练价格大幅下降，欢迎下单！' },
    { title:'🛡️ 账号安全提醒', time:'2026-06-29', content:'近期出现第三方虚假代练，请认准本站唯一客服联系方式，谨防上当。' }
];
document.getElementById('newsContainer').innerHTML = newsData.map(n => `
    <div class="news-item">
        <div class="news-title">${n.title}</div>
        <div class="news-time">${n.time}</div>
        <div class="news-content">${n.content}</div>
    </div>
`).join('');

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

    const adminBtn = document.getElementById('adminPanelBtn');
    if (adminBtn) {
        adminBtn.style.display = (role === 'admin') ? 'block' : 'none';
    }

    const boosterBtn = document.getElementById('boosterPanelBtn');
    if (boosterBtn) {
        boosterBtn.style.display = (role === 'booster' || role === 'admin') ? 'block' : 'none';
    }
}

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    checkLoginStatus();
    userDropdown.style.display = 'none';
    showToast('👋 已退出登录');
});

userMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block';
});
document.addEventListener('click', () => { userDropdown.style.display = 'none'; });

// ==================== 注册弹窗 ====================
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
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, email, phone, referralCode: referral })
        });
        const data = await res.json();
        if (res.ok) {
            showToast('✅ 注册成功！请登录');
            registerModal.style.display = 'none';
            registerForm.reset();
            regError.textContent = '';
        } else {
            regError.textContent = data.error || '注册失败';
        }
    } catch (err) {
        regError.textContent = '网络错误，请检查后端是否启动';
    }
});

toLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    registerModal.style.display = 'none';
    loginModal.style.display = 'flex';
});
toRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginModal.style.display = 'none';
    registerModal.style.display = 'flex';
});

// ==================== 登录弹窗 ====================
openLoginBtn.addEventListener('click', () => { loginModal.style.display = 'flex'; });
closeLoginBtn.addEventListener('click', () => { loginModal.style.display = 'none'; loginError.textContent = ''; });
loginModal.addEventListener('click', (e) => { if (e.target === loginModal) { loginModal.style.display = 'none'; loginError.textContent = ''; } });

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!username || !password) { loginError.textContent = '用户名和密码不能为空'; return; }
    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.user.username);
            localStorage.setItem('role', data.user.role);
            checkLoginStatus();
            loginModal.style.display = 'none';
            loginError.textContent = '';
            showToast('✅ 登录成功！');
        } else {
            loginError.textContent = data.error || '登录失败，请检查用户名密码';
        }
    } catch (err) {
        loginError.textContent = '网络错误，请检查后端是否启动';
    }
});

// ==================== 个人中心 ====================
const profileBtn = document.getElementById('profileBtn');
const profileModal = document.getElementById('profileModal');
const closeProfileBtn = document.getElementById('closeProfileBtn');
const profileInfo = document.getElementById('profileInfo');

profileBtn.addEventListener('click', async () => {
    profileModal.style.display = 'flex';
    await loadProfile();
    await loadOrders();
});
closeProfileBtn.addEventListener('click', () => { profileModal.style.display = 'none'; });
profileModal.addEventListener('click', (e) => { if (e.target === profileModal) profileModal.style.display = 'none'; });

async function loadProfile() {
    const token = localStorage.getItem('token');
    if (!token) { profileInfo.innerHTML = '<p style="color:var(--red)">请先登录</p>'; return; }
    try {
        const res = await fetch(`${API_BASE}/user/profile`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('获取失败');
        const user = await res.json();
        profileInfo.innerHTML = `
            <p><span>用户名：</span><span>${user.username}</span></p>
            <p><span>邮箱：</span><span>${user.email || '未填写'}</span></p>
            <p><span>手机：</span><span>${user.phone || '未填写'}</span></p>
            <p><span>余额：</span><span>¥${user.balance}</span></p>
            <p><span>信誉分：</span><span>${user.reputation}</span></p>
            <p><span>推荐码：</span><span>${user.referral_code}</span></p>
            <p><span>注册时间：</span><span>${new Date(user.created_at).toLocaleString()}</span></p>
        `;
    } catch (err) {
        profileInfo.innerHTML = '<p style="color:var(--red)">加载失败</p>';
    }
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
        if (!Array.isArray(orders) || orders.length === 0) {
            list.innerHTML = '<p style="color:var(--text-muted)">暂无订单</p>';
            return;
        }
        const statusMap = { pending: '待接单', playing: '代练中', done: '已完成' };
        const paymentStatusMap = { unpaid: '未支付', pending: '待确认', paid: '已支付' };
        let html = '<table class="order-table"><tr><th>订单号</th><th>项目</th><th>金额</th><th>状态</th><th>支付</th><th>操作</th><th>时间</th></tr>';
        orders.forEach(o => {
            let actionHtml = '';
            if (o.payment_status === 'unpaid') {
                actionHtml = `<button class="upload-payment-btn" data-order="${o.order_no}">上传凭证</button>`;
            } else if (o.payment_status === 'paid') {
                actionHtml = '已确认';
            } else {
                actionHtml = '审核中';
            }
            html += `<tr>
                <td>${o.order_no}</td>
                <td>${o.project} - ${o.detail}</td>
                <td>¥${o.total_price}</td>
                <td><span class="order-status status-${o.status}">${statusMap[o.status] || o.status}</span></td>
                <td><span class="payment-status payment-${o.payment_status}">${paymentStatusMap[o.payment_status] || '未知'}</span></td>
                <td>${actionHtml}</td>
                <td>${new Date(o.created_at).toLocaleString()}</td>
            </tr>`;
        });
        html += '</table>';
        list.innerHTML = html;
    } catch (err) {
        console.error('加载订单失败：', err);
        list.innerHTML = '<p style="color:var(--red)">加载失败</p>';
    }
}

// ==================== 提交订单（新增客户端字段） ====================
const submitOrderBtn = document.getElementById('submitOrderBtn');
submitOrderBtn.addEventListener('click', async () => {
    const token = localStorage.getItem('token');
    if (!token) { showToast('❌ 请先登录后再提交订单'); return; }
    const project = getSelectedProject();
    const detail = getSelectedDetail();
    const qty = getQty();
    const playerRate = getPlayerRate();
    const playerChecked = document.querySelector('input[name="player"]:checked');
    const playerKey = playerChecked ? playerChecked.value : 'ding';
    const playerInfo = playerData.find(p => p.key === playerKey) || { name: '未选', rate: playerRate };
    const urgent = isUrgent();
    const total = calcTotal();
    const base = projectDetails[project][detail].price;
    const remark = document.getElementById('remarkInput')?.value.trim() || '';

    // 获取客户端类型
    const clientTypeEl = document.querySelector('input[name="clientType"]:checked');
    const clientType = clientTypeEl ? clientTypeEl.value : 'Android';

    const gameUid = document.getElementById('gameUid').value.trim();
const gameAccount = document.getElementById('gameAccount').value.trim();
const gamePassword = document.getElementById('gamePassword').value.trim();

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
        client_type: clientType
};

    try {
        const res = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`✅ 订单提交成功！订单号：${data.order_no}`);
        } else {
            showToast('❌ ' + (data.error || '提交失败'));
        }
    } catch (err) {
        showToast('❌ 网络错误，请稍后重试');
    }
});

// ==================== 管理面板（修改列：数量、客户端，去除打手；增加详情/复制按钮） ====================
const adminPanelBtn = document.getElementById('adminPanelBtn');
const adminModal = document.getElementById('adminModal');
const closeAdminBtn = document.getElementById('closeAdminBtn');
const statusFilter = document.getElementById('statusFilter');
const refreshOrdersBtn = document.getElementById('refreshOrdersBtn');
const adminOrderList = document.getElementById('adminOrderList');

adminPanelBtn.addEventListener('click', () => {
    adminModal.style.display = 'flex';
    loadAdminOrders();
    loadUserList();
});
closeAdminBtn.addEventListener('click', () => adminModal.style.display = 'none');
adminModal.addEventListener('click', (e) => { if (e.target === adminModal) adminModal.style.display = 'none'; });

async function loadAdminOrders() {
    const token = localStorage.getItem('token');
    if (!token) return;
    const status = statusFilter.value;
    try {
        const res = await fetch(`${API_BASE}/admin/orders`, { headers: { 'Authorization': `Bearer ${token}` } });
        const orders = await res.json();
        if (!Array.isArray(orders)) throw new Error('数据错误');
        const filtered = status ? orders.filter(o => o.status === status) : orders;
        renderAdminOrders(filtered);
    } catch (err) {
        adminOrderList.innerHTML = '<p style="color:var(--red)">加载失败</p>';
    }
}

function renderAdminOrders(orders) {
    const statusOptions = ['pending', 'playing', 'done'];
    const statusText = { pending: '待接单', playing: '代练中', done: '已完成' };
    const paymentStatusMap = { unpaid: '未支付', pending: '待确认', paid: '已支付' };
    if (orders.length === 0) { adminOrderList.innerHTML = '<p>暂无订单</p>'; return; }

    let html = '<table><tr><th>订单号</th><th>用户</th><th>项目</th><th>数量</th><th>客户端</th><th>金额</th><th>状态</th><th>支付</th><th>操作</th><th>时间</th></tr>';
    orders.forEach(o => {
        html += `<tr>
            <td>${o.order_no}</td>
            <td>${o.username}</td>
            <td>${o.project} - ${o.detail}</td>
            <td>${o.quantity}</td>
            <td>${o.client_type || 'Android'}</td>
            <td>¥${o.total_price}</td>
            <td><span class="order-status status-${o.status}">${statusText[o.status] || o.status}</span></td>
            <td><span class="payment-status payment-${o.payment_status}">${paymentStatusMap[o.payment_status] || o.payment_status}</span></td>
            <td>
                <select class="status-select" data-order="${o.order_no}" onchange="updateOrderStatus(this)">
                    ${statusOptions.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${statusText[s]}</option>`).join('')}
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
    const orderNo = selectEl.dataset.order;
    const newStatus = selectEl.value;
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_BASE}/admin/orders/${orderNo}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (res.ok) { showToast('✅ 状态更新成功'); } else { showToast('❌ ' + (data.error || '更新失败')); loadAdminOrders(); }
    } catch (err) { showToast('❌ 网络错误'); loadAdminOrders(); }
};

// ==================== 管理面板与打手面板通用事件委托（详情、复制信息） ====================
document.addEventListener('click', async (e) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // 管理员确认收款
    if (e.target.classList.contains('confirm-payment-btn')) {
        const orderNo = e.target.dataset.order;
        try {
            const res = await fetch(`${API_BASE}/admin/orders/${orderNo}/confirm-payment`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (res.ok) { showToast('✅ 已确认支付'); loadAdminOrders(); } else { showToast('❌ ' + (data.error || '操作失败')); }
        } catch (err) { showToast('❌ 网络错误'); }
    }
    // 放入大厅
    if (e.target.classList.contains('hall-btn')) {
        const orderNo = e.target.dataset.order;
        try {
            const res = await fetch(`${API_BASE}/admin/orders/${orderNo}/hall`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (res.ok) { showToast('✅ 已放入接单大厅'); loadAdminOrders(); } else { showToast('❌ ' + (data.error || '操作失败')); }
        } catch (err) { showToast('❌ 网络错误'); }
    }
    // 删除订单
    if (e.target.classList.contains('delete-order-btn')) {
        const orderNo = e.target.dataset.order;
        if (!confirm(`确定要删除订单 ${orderNo} 吗？`)) return;
        try {
            const res = await fetch(`${API_BASE}/admin/orders/${orderNo}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (res.ok) { showToast('🗑️ 订单已删除'); loadAdminOrders(); } else { showToast('❌ ' + (data.error || '删除失败')); }
        } catch (err) { showToast('❌ 网络错误'); }
    }
    // 订单详情按钮（管理员、打手通用）
    if (e.target.classList.contains('detail-btn')) {
        const orderNo = e.target.dataset.order;
        showOrderDetail(orderNo);
    }
    // 一键复制订单信息（管理员专用）
    if (e.target.classList.contains('copy-order-detail-btn')) {
        const orderNo = e.target.dataset.order;
        copyOrderDetail(orderNo);
    }
    // 打手接单
    if (e.target.classList.contains('take-order-btn')) {
        const orderNo = e.target.dataset.order;
        try {
            const res = await fetch(`${API_BASE}/booster/take/${orderNo}`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (res.ok) { showToast('✅ 接单成功'); loadHallOrders(); } else { showToast('❌ ' + (data.error || '接单失败')); }
        } catch (err) { showToast('❌ 网络错误'); }
    }
    // 打手完成订单
    if (e.target.classList.contains('complete-order-btn')) {
        const orderNo = e.target.dataset.order;
        try {
            const res = await fetch(`${API_BASE}/booster/complete/${orderNo}`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (res.ok) { showToast(`✅ 订单已完成，收益 ¥${data.earnings}`); loadMyBoosterOrders(); } else { showToast('❌ ' + (data.error || '操作失败')); }
        } catch (err) { showToast('❌ 网络错误'); }
    }
});

statusFilter.addEventListener('change', loadAdminOrders);
refreshOrdersBtn.addEventListener('click', loadAdminOrders);

// 用户角色管理
async function loadUserList() {
    const token = localStorage.getItem('token');
    const select = document.getElementById('userSelect');
    if (!select) return;
    try {
        const res = await fetch(`${API_BASE}/admin/users`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('获取失败');
        const users = await res.json();
        select.innerHTML = '<option value="">-- 选择用户 --</option>' +
            users.map(u => `<option value="${u.id}">${u.username} (${u.role})</option>`).join('');
    } catch (err) { select.innerHTML = '<option value="">加载失败</option>'; }
}

function bindUpdateRole() {
    const btn = document.getElementById('updateRoleBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const token = localStorage.getItem('token');
        const userId = document.getElementById('userSelect').value;
        const role = document.getElementById('roleSelect').value;
        const msgEl = document.getElementById('roleUpdateMsg');
        if (!userId) { msgEl.textContent = '请先选择一个用户'; return; }
        try {
            const res = await fetch(`${API_BASE}/admin/users/${userId}/role`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ role })
            });
            const data = await res.json();
            if (res.ok) { msgEl.textContent = '✅ ' + data.message; loadUserList(); }
            else { msgEl.textContent = '❌ ' + (data.error || '操作失败'); }
        } catch (err) { msgEl.textContent = '❌ 网络错误'; }
    });
}

// ==================== 订单详情弹窗与复制 ====================
async function showOrderDetail(orderNo) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_BASE}/orders/${orderNo}/detail`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('无权或加载失败');
        const order = await res.json();
        const html = `
            <p><strong>订单号：</strong>${order.order_no}</p>
            <p><strong>用户：</strong>${order.customer_name || order.user_id}</p>
            <p><strong>项目：</strong>${order.project} - ${order.detail}</p>
            <p><strong>数量：</strong>${order.quantity}</p>
            <p><strong>客户端：</strong>${order.client_type || 'Android'}</p>
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
    } catch (err) {
        showToast('❌ ' + (err.message || '加载详情失败'));
    }
}

async function copyOrderDetail(orderNo) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_BASE}/orders/${orderNo}/detail`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('获取失败');
        const order = await res.json();
        const text = `【订单详情】
订单号：${order.order_no}
用户：${order.customer_name || order.user_id}
项目：${order.project} - ${order.detail}
数量：${order.quantity}
客户端：${order.client_type || 'Android'}
加急：${order.urgent ? '是' : '否'}
总价：¥${order.total_price}
备注：${order.remark || '无'}
游戏账号：${order.game_account || '无'}
游戏密码：${order.game_password || '无'}
游戏UID：${order.game_uid || '无'}
状态：${order.status}
支付状态：${order.payment_status}`;

        if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        showToast('✅ 订单信息已复制');
    } catch (err) {
        showToast('❌ 复制失败');
    }
}

// 关闭订单详情弹窗
document.getElementById('closeOrderDetailBtn').addEventListener('click', () => {
    document.getElementById('orderDetailModal').style.display = 'none';
});
document.getElementById('orderDetailModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('orderDetailModal')) {
        document.getElementById('orderDetailModal').style.display = 'none';
    }
});

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
        paymentModal.style.display = 'flex';
        paymentError.textContent = '';
        previewImage.style.display = 'none';
        paymentFile.value = '';
        pasteArea.innerText = '';
    }
});
closePaymentBtn.addEventListener('click', () => paymentModal.style.display = 'none');
paymentModal.addEventListener('click', (e) => { if (e.target === paymentModal) paymentModal.style.display = 'none'; });

paymentFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { previewImage.src = ev.target.result; previewImage.style.display = 'block'; };
    reader.readAsDataURL(file);
});
pasteArea.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (let item of items) {
        if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = (ev) => { previewImage.src = ev.target.result; previewImage.style.display = 'block'; };
            reader.readAsDataURL(blob);
            e.preventDefault();
        }
    }
});
submitPaymentBtn.addEventListener('click', async () => {
    const token = localStorage.getItem('token');
    if (!token) { paymentError.textContent = '请先登录'; return; }
    if (!currentOrderNo) { paymentError.textContent = '订单号异常'; return; }
    const screenshot = previewImage.src;
    if (!screenshot || screenshot === window.location.href) { paymentError.textContent = '请先选择或粘贴截图'; return; }
    try {
        const res = await fetch(`${API_BASE}/orders/${currentOrderNo}/payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ screenshot })
        });
        const data = await res.json();
        if (res.ok) {
            showToast('✅ 支付凭证已提交');
            paymentModal.style.display = 'none';
            if (profileModal.style.display === 'flex') await loadOrders();
        } else { paymentError.textContent = data.error || '提交失败'; }
    } catch (err) { paymentError.textContent = '网络错误'; }
});

// ==================== 打手面板（修改列：数量、客户端，去除打手列，我的订单增加详情按钮） ====================
const boosterPanelBtn = document.getElementById('boosterPanelBtn');
const boosterModal = document.getElementById('boosterModal');
const closeBoosterBtn = document.getElementById('closeBoosterBtn');

boosterPanelBtn.addEventListener('click', () => { boosterModal.style.display = 'flex'; loadHallOrders(); });
closeBoosterBtn.addEventListener('click', () => boosterModal.style.display = 'none');
boosterModal.addEventListener('click', (e) => { if (e.target === boosterModal) boosterModal.style.display = 'none'; });

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
        const res = await fetch(`${API_BASE}/booster/hall`, { headers: { 'Authorization': `Bearer ${token}` } });
        const orders = await res.json();
        if (!orders.length) { list.innerHTML = '<p>暂无待接订单</p>'; return; }
        let html = '<table><tr><th>订单号</th><th>项目</th><th>数量</th><th>客户端</th><th>预估收益</th><th>操作</th></tr>';
        orders.forEach(o => {
            html += `<tr>
                <td>${o.order_no}</td>
                <td>${o.project} - ${o.detail}</td>
                <td>${o.quantity}</td>
                <td>${o.client_type || '未知'}</td>
                <td>¥${Number(o.earnings).toFixed(2)}</td>
                <td><button class="take-order-btn" data-order="${o.order_no}">接单</button></td>
            </tr>`;
        });
        html += '</table>';
        list.innerHTML = html;
    } catch (err) { list.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}

async function loadMyBoosterOrders() {
    const token = localStorage.getItem('token');
    const list = document.getElementById('myBoosterOrderList');
    try {
        const res = await fetch(`${API_BASE}/booster/my-orders`, { headers: { 'Authorization': `Bearer ${token}` } });
        const orders = await res.json();
        if (!orders.length) { list.innerHTML = '<p>暂无订单</p>'; return; }
        const statusMap = { pending: '待接单', playing: '代练中', done: '已完成' };
        let html = '<table><tr><th>订单号</th><th>项目</th><th>数量</th><th>客户端</th><th>预估收益</th><th>状态</th><th>操作</th></tr>';
        orders.forEach(o => {
            html += `<tr>
                <td>${o.order_no}</td>
                <td>${o.project} - ${o.detail}</td>
                <td>${o.quantity}</td>
                <td>${o.client_type || '未知'}</td>
                <td>¥${Number(o.earnings).toFixed(2)}</td>
                <td>${statusMap[o.status] || o.status}</td>
                <td>
                    ${o.status === 'playing' ? `<button class="complete-order-btn" data-order="${o.order_no}">完成</button>` : ''}
                    ${o.status !== 'pending' ? `<button class="detail-btn" data-order="${o.order_no}">详情</button>` : ''}
                </td>
            </tr>`;
        });
        html += '</table>';
        list.innerHTML = html;
    } catch (err) { list.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}

async function loadEarnings() {
    const token = localStorage.getItem('token');
    const display = document.getElementById('earningsDisplay');
    try {
        const res = await fetch(`${API_BASE}/booster/earnings`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        display.innerHTML = `<p>累计收益：<strong>¥${data.earnings}</strong></p>`;
    } catch (err) { display.innerHTML = '<p style="color:var(--red)">加载失败</p>'; }
}

// ==================== 开箱模拟器逻辑 ====================
let currentChestId = null;

function getTickets() { return parseInt(localStorage.getItem('tickets') || '0'); }
function setTickets(num) { localStorage.setItem('tickets', num); updateTicketDisplay(); }
function updateTicketDisplay() {
    const el = document.getElementById('ticketBalance');
    if (el) el.textContent = getTickets();
}

function getTodayStr() { return new Date().toISOString().slice(0, 10); }
function getLastCheckin() { return localStorage.getItem('lastCheckinDate'); }
function doCheckin() {
    const today = getTodayStr();
    if (getLastCheckin() === today) { showToast('⏰ 今日已签到，明天再来吧'); return; }
    setTickets(getTickets() + 1000);
    localStorage.setItem('lastCheckinDate', today);
    showToast('✅ 签到成功！获得1000军需券');
}
function doRecharge() {
    setTickets(getTickets() + 1000);
    showToast('💰 充值成功！获得1000军需券');
}

function renderChests() {
    const grid = document.getElementById('chestGrid');
    if (!grid) return;
    grid.innerHTML = '';
    chestsConfig.forEach(chest => {
        const div = document.createElement('div');
        div.className = 'chest-item';
        div.innerHTML = `<img src="${chest.image}" alt="${chest.name}" onerror="this.src='images/chests/placeholder.png';">
            <div class="chest-name">${chest.name}</div><div class="chest-price">🪙 ${chest.price} <span class="chest-currency">军需券</span></div>`;
        div.addEventListener('click', () => openChestDetail(chest));
        grid.appendChild(div);
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
    normalPool.forEach(item => {
        const p = (item.weight / normalTotalWeight * 95).toFixed(2);
        html += `<div><span class="prob-label">${item.name}</span><span class="prob-value">${p}%</span></div>`;
    });
    rarePool.forEach(item => {
        const p = (item.weight / rareTotalWeight * 5).toFixed(2);
        html += `<div><span class="prob-label">${item.name}</span><span class="prob-value">${p}%</span></div>`;
    });
    html += '</div>';
    probContainer.innerHTML = html;
    document.getElementById('chestBuyMsg').style.display = 'none';
    document.getElementById('chestDetailModal').style.display = 'flex';
}

document.getElementById('closeChestDetailBtn').addEventListener('click', () => {
    document.getElementById('chestDetailModal').style.display = 'none';
});
document.getElementById('chestDetailModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('chestDetailModal')) document.getElementById('chestDetailModal').style.display = 'none';
});

document.getElementById('buyChestBtn').addEventListener('click', () => {
    if (!currentChestId) return;
    const chest = chestsConfig.find(c => c.id === currentChestId);
    if (!chest) return;
    if (getTickets() < chest.price) {
        document.getElementById('chestBuyMsg').textContent = '❌ 军需券不足';
        document.getElementById('chestBuyMsg').style.display = 'block';
        return;
    }
    setTickets(getTickets() - chest.price);
    const rand = Math.random() * 100;
    const reward = rand < 5 ? drawFromPool(rarePool, rareTotalWeight) : drawFromPool(normalPool, normalTotalWeight);
    showToast(`🎉 打开 ${chest.name} 获得：${reward.name}`);
    document.getElementById('chestDetailModal').style.display = 'none';
});

function drawFromPool(pool, totalWeight) {
    let r = Math.random() * totalWeight;
    for (let item of pool) { r -= item.weight; if (r <= 0) return item; }
    return pool[0];
}

document.getElementById('checkinBtn').addEventListener('click', doCheckin);
document.getElementById('rechargeBtn').addEventListener('click', doRecharge);

function initChestSimulator() { updateTicketDisplay(); renderChests(); }

// ==================== 独立工具子菜单 ====================
function initToolSubMenu() {
    const tabs = document.querySelectorAll('.tool-tab');
    const panels = {
        calculator: document.getElementById('toolCalculator'),
        chestsim: document.getElementById('toolChestSim'),
        randomtank: document.getElementById('toolRandomTank')
    };
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tool = tab.dataset.tool;
            Object.values(panels).forEach(p => p.style.display = 'none');
            if (panels[tool]) panels[tool].style.display = 'block';
        });
    });
}

// ==================== 这把玩什么转盘 ====================
let wheelAngle = 0;
let spinning = false;
let wheelCanvas, wheelCtx;

function initWheel() {
    wheelCanvas = document.getElementById('wheelCanvas');
    if (!wheelCanvas) return;
    wheelCtx = wheelCanvas.getContext('2d');
    drawWheel(0);
}

function drawWheel(rotation = 0) {
    if (!wheelCtx) return;
    const w = wheelCanvas.width;
    const h = wheelCanvas.height;
    const cx = w / 2, cy = h / 2;
    const radius = Math.min(cx, cy) - 5;
    const sliceAngle = (2 * Math.PI) / tankList.length;

    wheelCtx.clearRect(0, 0, w, h);
    for (let i = 0; i < tankList.length; i++) {
        const startAngle = i * sliceAngle + rotation;
        const endAngle = startAngle + sliceAngle;
        wheelCtx.beginPath();
        wheelCtx.moveTo(cx, cy);
        wheelCtx.arc(cx, cy, radius, startAngle, endAngle);
        wheelCtx.closePath();
        wheelCtx.fillStyle = i % 2 === 0 ? '#2a3a50' : '#1e2a3a';
        wheelCtx.fill();
        wheelCtx.strokeStyle = '#0a0f1a';
        wheelCtx.lineWidth = 1;
        wheelCtx.stroke();

        wheelCtx.save();
        wheelCtx.translate(cx, cy);
        wheelCtx.rotate(startAngle + sliceAngle / 2);
        wheelCtx.textAlign = "right";
        wheelCtx.fillStyle = "#e2e8f0";
        wheelCtx.font = "8px sans-serif";
        wheelCtx.fillText(i + 1, radius - 10, 3);
        wheelCtx.restore();
    }

    // 中心圆
    wheelCtx.beginPath();
    wheelCtx.arc(cx, cy, 30, 0, 2 * Math.PI);
    wheelCtx.fillStyle = '#f0a050';
    wheelCtx.fill();
    wheelCtx.strokeStyle = '#0a0f1a';
    wheelCtx.lineWidth = 3;
    wheelCtx.stroke();
    wheelCtx.fillStyle = '#fff';
    wheelCtx.font = "bold 14px sans-serif";
    wheelCtx.textAlign = "center";
    wheelCtx.textBaseline = "middle";
    wheelCtx.fillText("GO", cx, cy);

    // 指针
    wheelCtx.beginPath();
    wheelCtx.moveTo(cx, cy - radius + 8);
    wheelCtx.lineTo(cx - 8, cy - radius - 8);
    wheelCtx.lineTo(cx + 8, cy - radius - 8);
    wheelCtx.closePath();
    wheelCtx.fillStyle = '#e74c3c';
    wheelCtx.fill();
}

function spinWheel() {
    if (spinning) return;
    spinning = true;

    const targetSlice = Math.floor(Math.random() * tankList.length);
    const sliceAngle = (2 * Math.PI) / tankList.length;
    const targetMiddleAngle = targetSlice * sliceAngle + sliceAngle / 2;
    const fullSpins = 5 + Math.floor(Math.random() * 5);
    const targetAngle = fullSpins * 2 * Math.PI + (2 * Math.PI - targetMiddleAngle) + Math.PI / 2;

    const startAngle = wheelAngle;
    const duration = 4000;
    const startTime = performance.now();

    function animate(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        wheelAngle = startAngle + targetAngle * ease;
        drawWheel(wheelAngle);

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            wheelAngle = wheelAngle % (2 * Math.PI);
            const normalizedAngle = (wheelAngle + Math.PI * 2) % (Math.PI * 2);
            const pointerAngle = (2 * Math.PI - normalizedAngle + Math.PI / 2) % (2 * Math.PI);
            const finalSlice = Math.floor(pointerAngle / sliceAngle) % tankList.length;
            document.getElementById('wheelResult').textContent = `🎉 抽中：${tankList[finalSlice]}`;
            spinning = false;
        }
    }
    requestAnimationFrame(animate);
}

document.getElementById('spinWheelBtn')?.addEventListener('click', spinWheel);
document.getElementById('wheelCanvas')?.addEventListener('click', spinWheel);

// 启动
init();