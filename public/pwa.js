/* PWA integration is independent of authentication and business requests. */
(() => {
    'use strict';
    const area = document.getElementById('pwaInstallArea');
    const button = document.getElementById('pwaInstallButton');
    const iosHelp = document.getElementById('pwaIosHelp');
    const status = document.getElementById('pwaInstallStatus');
    const standalone = window.matchMedia('(display-mode: standalone)');
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Android/.test(ua);
    let promptEvent = null;
    let installed = false;
    function isStandalone() { return standalone.matches || navigator.standalone === true; }
    function syncInstallControls() {
        const appMode = isStandalone();
        document.documentElement.dataset.displayMode = appMode ? 'standalone' : 'browser';
        if (button) button.hidden = appMode || installed || !promptEvent;
        if (iosHelp) iosHelp.hidden = appMode || installed || !(isIos && isSafari);
        if (area) area.hidden = appMode || installed || (!promptEvent && !(isIos && isSafari));
    }
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
        syncInstallControls();
    });
    button?.addEventListener('click', async () => {
        if (!promptEvent || isStandalone()) return;
        const event = promptEvent;
        promptEvent = null;
        button.disabled = true;
        try {
            await event.prompt();
            const result = await event.userChoice;
            if (result.outcome === 'accepted') installed = true;
        } catch (error) {
            console.warn('[PWA] 安装提示未能打开', error);
            if (status) {
                status.textContent = '请使用浏览器菜单中的“安装应用”或“添加到主屏幕”。';
                status.hidden = false;
            }
        } finally {
            button.disabled = false;
            syncInstallControls();
            if (area && status && !status.hidden && !installed && !isStandalone()) area.hidden = false;
        }
    });

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
