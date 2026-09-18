'use strict';

// Bump this version when changing the worker/offline page or replacing icon files.
const CACHE_PREFIX = 'qy-pwa-';
const CACHE_VERSION = 'qy-pwa-v1';
const OFFLINE_URL = '/offline.html';
// Explicit public, immutable-content paths only. Never include uploads or API data.
const STATIC_PATHS = new Set([
    '/style.css', '/light-theme.css', '/dark-theme.css', '/theme-components.css',
    '/ui-foundation.css', '/esports-surfaces.css', '/customer-workflow.css',
    '/order-center.css', '/order-notifications.css', '/booster-availability.css',
    '/service-content.css', '/profile-dashboard.css', '/booster-workbench.css',
    '/customer-support.css', '/community-pages.css', '/game-tools.css', '/pwa.css',
    '/script.js', '/ui-runtime.js', '/rental-client.js', '/rental-discovery.js',
    '/order-center.js', '/order-notifications.js', '/booster-availability.js',
    '/boost-checkout.js', '/boost-completion.js', '/service-defaults.js',
    '/service-content.js', '/profile-dashboard.js', '/booster-workbench.js',
    '/customer-support.js', '/user-permissions.js', '/tank-catalog.js',
    '/game-tools.js', '/theme-preference.js', '/pwa.js',
    '/bg.webp', '/velnora-coin.png', '/favicon.ico', '/favicon-16.png', '/favicon-32.png',
    '/apple-touch-icon.png', '/images/tactical-grid.svg',
    '/icons/pwa-192.png', '/icons/pwa-512.png',
    '/icons/pwa-maskable-192.png', '/icons/pwa-maskable-512.png'
]);

function publicRequest(input) {
    return new Request(input, { credentials: 'omit', cache: 'no-store' });
}
function cacheable(response, pathname) {
    if (response.status !== 200 || response.type !== 'basic' || response.redirected) return false;
    if (/no-store|private/i.test(response.headers.get('Cache-Control') || '') || /\*/.test(response.headers.get('Vary') || '')) return false;
    const type = response.headers.get('Content-Type') || '';
    if (pathname === OFFLINE_URL) return /text\/html/i.test(type);
    if (/\.css$/.test(pathname)) return /text\/css/i.test(type);
    if (/\.js$/.test(pathname)) return /(?:javascript|ecmascript)/i.test(type);
    return /^image\//i.test(type);
}

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const response = await fetch(publicRequest(OFFLINE_URL));
        if (!cacheable(response, OFFLINE_URL)) throw new Error('PWA offline page unavailable');
        const cache = await caches.open(CACHE_VERSION);
        await cache.put(OFFLINE_URL, response);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_VERSION).map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

async function networkFirstStatic(request, event, pathname) {
    let response;
    try { response = await fetch(publicRequest(request)); }
    catch (error) {
        try {
            const cache = await caches.open(CACHE_VERSION);
            const cached = await cache.match(request); // Exact query/version; never ignoreSearch.
            if (cached) return cached;
        } catch (_) { /* Storage failure must not hide the original network error. */ }
        throw error;
    }
    if (cacheable(response, pathname)) {
        const copy = response.clone();
        event.waitUntil((async () => {
            const cache = await caches.open(CACHE_VERSION);
            await cache.put(request, copy);
            // Keep the current version of each path; avoid unbounded query-string caches.
            const keys = await cache.keys();
            await Promise.all(keys.filter(key => new URL(key.url).pathname === pathname && key.url !== request.url).map(key => cache.delete(key)));
        })().catch(() => { /* Cache quota/private mode must not break a valid response. */ }));
    }
    // HTTP errors (including 401, 403, 404, 500) must remain visible, never stale success.
    return response;
}

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin ||
        request.headers.has('Authorization') || request.headers.has('Range')) return;
    // API, payment, admin, uploads and all unknown routes are untouched network requests.
    if (request.mode === 'navigate') {
        if ((url.pathname !== '/' && url.pathname !== '/index.html') || url.search) return;
        event.respondWith(fetch(request).catch(async () => {
            let offline;
            try {
                const cache = await caches.open(CACHE_VERSION);
                offline = await cache.match(OFFLINE_URL);
            } catch (_) { /* Provide a readable fallback even if browser storage is unavailable. */ }
            return offline || new Response('QY Blitz 暂时离线，请联网后重试。', {
                status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }));
        return;
    }
    if (!STATIC_PATHS.has(url.pathname)) return;
    // Only the site's existing static version parameter is accepted for caching.
    const entries = Array.from(url.searchParams.entries());
    if (entries.length && (entries.length !== 1 || entries[0][0] !== 'v' || !/^[a-zA-Z0-9._-]{1,80}$/.test(entries[0][1]))) return;
    event.respondWith(networkFirstStatic(request, event, url.pathname));
});
