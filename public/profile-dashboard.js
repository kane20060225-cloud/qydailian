(function (global) {
    'use strict';
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
    const count = value => Math.max(0, Number(value) || 0);
    const number = value => count(value).toLocaleString('zh-CN');
    function render(user, credits) {
        const thresholds = [0, 600, 1500, 3000, 6000, 15000];
        const level = Math.min(5, Math.max(0, Math.floor(Number(credits.vip_level) || 0)));
        const earned = count(credits.total_earned_credits);
        const highest = level === 5;
        const remaining = highest ? 0 : Math.max(0, thresholds[level + 1] - earned);
        const progress = highest ? 100 : Math.max(0, Math.min(100, Math.floor((earned - thresholds[level]) / (thresholds[level + 1] - thresholds[level]) * 100)));
        const role = ({admin:'管理员',booster:'打手',user:'玩家'})[user.role] || '玩家';
        const identity = ({gold:'金牌打手',silver:'银牌打手',standard:'标准打手',budget:'特惠打手'})[user.booster_identity] || '标准打手';
        const created = new Date(user.created_at);
        const registered = Number.isNaN(created.getTime()) ? '暂无记录' : created.toLocaleString('zh-CN', {timeZone:'Asia/Shanghai',hour12:false});
        const detail = (label, value) => `<div><dt>${label}</dt><dd>${esc(value || '未填写')}</dd></div>`;
        return `<header class="profile-welcome">
            <div class="profile-identity"><div class="profile-avatar" aria-hidden="true">${esc(Array.from(String(user.username || 'Q'))[0])}</div><div><span class="profile-eyebrow">QY BLITZ / 我的账户</span><h3>${esc(user.username || '玩家')}</h3><div class="profile-badges"><span>${role}</span><span>VIP ${level}</span></div></div></div>
            <button type="button" class="profile-settings" id="profileSettingsBtn">账户设置 <span aria-hidden="true">↗</span></button>
        </header>
        <div class="profile-overview-grid">
            <section class="card profile-points-card" aria-labelledby="profilePointsTitle"><div class="profile-card-heading"><h4 id="profilePointsTitle">Velnora 积分</h4><span>可用余额</span></div>
                <div class="profile-balance"><img src="velnora-coin.png?v=20260917-b24" alt="" width="48" height="48"><strong>${number(credits.qy_credits)}</strong><span>积分</span></div>
                <div class="profile-points-footer"><p>累计获得 <strong>${number(earned)}</strong> 积分</p><button type="button" id="openShopBtn">积分商城 <span aria-hidden="true">→</span></button></div>
            </section>
            <section class="card profile-membership" aria-labelledby="profileMembershipTitle"><div class="profile-card-heading"><h4 id="profileMembershipTitle">会员成长</h4><span class="profile-vip-badge">VIP ${level}</span></div>
                <div class="profile-membership-copy"><strong>${highest ? '已达最高等级' : `向 VIP ${level + 1} 迈进`}</strong><p>${highest ? '感谢你一路同行' : `再累计获得 ${number(remaining)} 积分即可升级`}</p></div>
                <div class="profile-progress" role="progressbar" aria-label="会员升级进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
                <div class="profile-progress-labels"><span>VIP ${level}</span><span>${highest ? '最高等级' : `VIP ${level + 1}`} · ${progress}%</span></div>
            </section>
        </div>
        <div class="profile-details-grid">
            <section class="card profile-details-card" aria-labelledby="profileDetailsTitle"><div class="profile-card-heading"><h4 id="profileDetailsTitle">账户资料</h4><span>个人信息</span></div><dl class="profile-details">${detail('邮箱',user.email)}${detail('手机',user.phone)}${detail('推荐码',user.referral_code)}${detail('注册时间（北京时间）',registered)}</dl></section>
            <section class="card profile-status-card" aria-labelledby="profileStatusTitle"><div class="profile-card-heading"><h4 id="profileStatusTitle">账户身份</h4><span>${role}</span></div><div class="profile-reputation"><strong>${number(user.reputation)}</strong><span>信誉分</span></div>${['booster','admin'].includes(user.role) ? `<dl class="profile-details">${detail('打手身份',identity)}${detail('打手积分',number(user.booster_points))}</dl>` : '<p class="profile-status-note">在下方查看订单进度与处理记录。</p>'}</section>
        </div>`;
    }
    global.ProfileDashboard = {render};
    if (typeof module !== 'undefined' && module.exports) module.exports = {render};
})(typeof window === 'undefined' ? globalThis : window);
