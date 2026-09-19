/* PWA integration is independent of authentication and business requests. */
(() => {
    'use strict';
    const area = document.getElementById('pwaInstallArea');
    const button = document.getElementById('pwaInstallButton');
    const buttonLabel = document.getElementById('pwaInstallButtonLabel');
    const installTitle = document.getElementById('pwaInstallTitle');
    const installHint = document.getElementById('pwaInstallHint');
    const status = document.getElementById('pwaInstallStatus');
    const guideButton = document.getElementById('pwaGuideButton');
    const guide = document.getElementById('pwaInstallGuide');
    const guideTitle = document.getElementById('pwaGuideTitle');
    const platformBadge = document.getElementById('pwaPlatformBadge');
    const guideIntro = document.getElementById('pwaGuideIntro');
    const guideSteps = document.getElementById('pwaGuideSteps');
    const guideNote = document.getElementById('pwaGuideNote');
    const guideInstallButton = document.getElementById('pwaGuideInstallButton');
    const standalone = window.matchMedia('(display-mode: standalone)');
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Android/.test(ua);
    const isAndroid = /Android/.test(ua);
    const isMac = !isIos && /Macintosh|Mac OS X/.test(ua);
    const isEdge = /Edg\//.test(ua);
    const isChrome = /Chrome|Chromium|CriOS/.test(ua) && !isEdge;
    let promptEvent = null;
    let installed = false;
    function isStandalone() { return standalone.matches || navigator.standalone === true; }
    function directLabel() { return isAndroid || isIos ? '添加到主屏幕' : '安装到桌面'; }
    function guideForDevice() {
        if (isIos) return {
            badge: 'iPhone / iPad', title: '添加到主屏幕',
            intro: isSafari ? 'Safari 可以把本站保存为独立网页 App。' : 'iPhone 和 iPad 需要在 Safari 中完成安装。',
            steps: isSafari ? ['轻点 Safari 工具栏的“分享”按钮', '选择“添加到主屏幕”', '开启“作为网页 App 打开”，然后点“添加”'] : ['打开浏览器的分享菜单', '选择“在 Safari 中打开”', '在 Safari 中点“分享” → “添加到主屏幕”', '开启“作为网页 App 打开”，然后点“添加”'],
            note: '安装后，QY Blitz 图标会出现在主屏幕，可像普通 App 一样打开。'
        };
        if (isMac && isSafari) return {
            badge: 'Mac · Safari', title: '添加到程序坞',
            intro: 'Safari 可以直接把本站保存为 Mac 网页 App。',
            steps: ['点击 Safari 工具栏的“分享”按钮', '选择“添加到程序坞”', '确认名称后点击“添加”'],
            note: '网页 App 会出现在程序坞、Spotlight 和个人应用程序文件夹中。'
        };
        if (isAndroid) return {
            badge: 'Android', title: '添加到主屏幕',
            intro: '支持时请优先点击“立即安装”；没有系统弹窗时可用浏览器菜单。',
            steps: ['打开浏览器右上角菜单', '选择“安装应用”或“添加到主屏幕”', '在系统确认框中点击“安装”或“添加”'],
            note: 'Chrome、Edge 等浏览器的菜单文字可能略有不同。请勿使用无痕模式安装。'
        };
        if (isEdge) return {
            badge: '桌面端 · Edge', title: '安装到桌面',
            intro: '支持时请优先点击“立即安装”；也可以从 Edge 菜单安装。',
            steps: ['打开右上角“…”菜单', '选择“应用”', '选择“将此站点作为应用安装”，然后确认'],
            note: '安装后可从桌面或开始菜单启动，并以独立窗口运行。'
        };
        if (isChrome) return {
            badge: '桌面端 · Chrome', title: '安装到桌面',
            intro: '支持时请优先点击“立即安装”；也可以使用地址栏或 Chrome 菜单。',
            steps: ['点击地址栏右侧的安装图标；若未显示则打开右上角“⋮”菜单', '选择“投放、保存和分享”', '选择“安装 QY Blitz”，然后确认'],
            note: '安装后可从桌面、开始菜单或应用程序中启动。'
        };
        return {
            badge: isMac ? 'Mac 桌面端' : '桌面浏览器', title: '安装到桌面',
            intro: '当前浏览器没有提供网页内的一键安装接口。',
            steps: isMac ? ['推荐使用 Safari 打开本站', '点击 Safari 工具栏的“分享”按钮', '选择“添加到程序坞”并确认'] : ['推荐使用最新版 Chrome 或 Edge 打开本站', '重新点击页面中的“安装到桌面”', '在浏览器安装框中确认'],
            note: '这是浏览器的安全限制，网站不能绕过确认步骤自动创建桌面图标。'
        };
    }
    function renderGuide() {
        if (!guide) return;
        const content = guideForDevice();
        if (guideTitle) guideTitle.textContent = content.title;
        if (platformBadge) platformBadge.textContent = content.badge;
        if (guideIntro) guideIntro.textContent = content.intro;
        if (guideNote) guideNote.textContent = content.note;
        if (guideSteps) {
            guideSteps.replaceChildren(...content.steps.map(step => {
                const item = document.createElement('li');
                item.textContent = step;
                return item;
            }));
        }
    }
    function openGuide() {
        renderGuide();
        if (!guide) return;
        if (typeof guide.showModal === 'function') guide.showModal();
        else guide.setAttribute('open', '');
    }
    function closeGuide() {
        if (!guide) return;
        if (typeof guide.close === 'function') guide.close();
        else guide.removeAttribute('open');
    }
    function syncInstallControls() {
        const appMode = isStandalone();
        document.documentElement.dataset.displayMode = appMode ? 'standalone' : 'browser';
        const hidden = appMode || installed;
        if (area) {
            area.hidden = hidden;
            area.dataset.installReady = String(Boolean(promptEvent));
        }
        if (button) {
            button.hidden = hidden;
            buttonLabel.textContent = promptEvent ? directLabel() : '查看安装方法';
        }
        if (guideButton) guideButton.hidden = hidden || !promptEvent;
        if (guideInstallButton) guideInstallButton.hidden = hidden || !promptEvent;
        if (installTitle) installTitle.textContent = isIos ? '将 QY Blitz 添加到主屏幕' : '将 QY Blitz 放到桌面';
        if (installHint) installHint.textContent = promptEvent
            ? '点击即可打开系统安装框，确认后从桌面直接启动。'
            : (isIos && !isSafari ? '使用 Safari 打开后，可添加为网页 App。' : '查看当前设备的安装步骤，约半分钟完成。');
        if (hidden && guide?.open) closeGuide();
    }
    renderGuide();
    syncInstallControls();
    if (standalone.addEventListener) standalone.addEventListener('change', syncInstallControls);
    else if (standalone.addListener) standalone.addListener(syncInstallControls);
    window.addEventListener('beforeinstallprompt', event => {
        if (isStandalone() || installed || !button) return;
        event.preventDefault();
        promptEvent = event;
        if (status) status.hidden = true;
        syncInstallControls();
    });
    window.addEventListener('appinstalled', () => {
        installed = true;
        promptEvent = null;
        if (status) {
            status.textContent = '安装完成，现在可以从桌面打开 QY Blitz。';
            status.hidden = false;
        }
        syncInstallControls();
    });
    async function requestInstall() {
        if (!promptEvent || isStandalone()) {
            openGuide();
            return;
        }
        const event = promptEvent;
        promptEvent = null;
        button.disabled = true;
        if (guideInstallButton) guideInstallButton.disabled = true;
        try {
            await event.prompt();
            const result = await event.userChoice;
            if (result.outcome === 'accepted') {
                installed = true;
                if (status) {
                    status.textContent = '已确认安装，正在添加到桌面。';
                    status.hidden = false;
                }
                closeGuide();
            } else if (status) {
                status.textContent = '已取消安装；你仍可通过浏览器菜单安装。';
                status.hidden = false;
            }
        } catch (error) {
            console.warn('[PWA] 安装提示未能打开', error);
            if (status) {
                status.textContent = '系统安装框未能打开，请按安装指南操作。';
                status.hidden = false;
            }
            openGuide();
        } finally {
            button.disabled = false;
            if (guideInstallButton) guideInstallButton.disabled = false;
            syncInstallControls();
        }
    }
    button?.addEventListener('click', requestInstall);
    guideInstallButton?.addEventListener('click', requestInstall);
    guideButton?.addEventListener('click', openGuide);
    document.getElementById('pwaGuideClose')?.addEventListener('click', closeGuide);
    document.getElementById('pwaGuideDoneButton')?.addEventListener('click', closeGuide);
    guide?.addEventListener('click', event => { if (event.target === guide) closeGuide(); });

    if (!('serviceWorker' in navigator)) {
        console.info('[PWA] 当前浏览器不支持 Service Worker');
        return;
    }
    if (!window.isSecureContext) {
        console.info('[PWA] Service Worker 需要 HTTPS（本机 localhost 可用于测试）');
        return;
    }
    async function register() {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js', {
                scope: '/', updateViaCache: 'none'
            });
            console.info('[PWA] Service Worker 注册成功，scope:', registration.scope);
            let lastCheck = 0;
            async function checkUpdate() {
                if (document.visibilityState === 'hidden' || !navigator.onLine || Date.now() - lastCheck < 60 * 60 * 1000) return;
                lastCheck = Date.now();
                try { await registration.update(); }
                catch (error) { console.warn('[PWA] 更新检查暂时失败', error); }
            }
            // Activate updates without reloading an order form or interrupting a payment.
            document.addEventListener('visibilitychange', checkUpdate);
            window.addEventListener('online', () => { lastCheck = 0; checkUpdate(); });
            await checkUpdate();
        } catch (error) {
            console.warn('[PWA] Service Worker 注册失败', error);
        }
    }
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
})();
