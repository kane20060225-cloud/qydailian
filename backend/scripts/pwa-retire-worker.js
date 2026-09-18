'use strict';
// Keep this at /service-worker.js after rollback so offline clients can retire later.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith('qy-pwa-')).map(name => caches.delete(name)));
        await self.clients.claim();
        await self.registration.unregister();
    })());
});
// No fetch handler, credentials, reload, navigation or business retries.
