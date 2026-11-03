/* Unique Taha - service worker (offline support + installable app).
   Change VERSION whenever you want every phone to drop its old cache. */
'use strict';
const VERSION = '2026-11-02-1';
const CACHE = 'uniquetaha-' + VERSION;
const CORE = ['/', '/index.html', '/site.webmanifest', '/logo.png', '/favicon.ico',
              '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png',
              '/c130-front.webp', '/c130-side.webp', '/c130-rear34.webp'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => Promise.all(CORE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => null))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k.indexOf('uniquetaha-') === 0 && k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isHome(url) { return url.pathname === '/' || url.pathname === '/index.html'; }

function offlinePage() {
    return new Response(
        '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>آفلاین</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#050102;color:#fff;font-family:Tahoma,sans-serif;text-align:center">' +
        '<div><h1>اینترنت وصل نیست</h1><p>وقتی دوباره وصل شدی، برنامه رو باز کن.</p></div></body></html>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
}

async function handleNavigation(event) {
    const url = new URL(event.request.url);
    const cache = await caches.open(CACHE);
    if (!isHome(url)) {
        try { return await fetch(event.request); }
        catch (e) { return (await cache.match(event.request)) || offlinePage(); }
    }
    // Home page: network first (so updates show up), cached copy when offline or slow.
    const network = fetch('/index.html', { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
        if (res && res.ok && res.type === 'basic') event.waitUntil(cache.put('/index.html', res.clone()));
        return res;
    });
    const cached = (await cache.match('/index.html')) || (await cache.match('/'));
    if (!cached) return network.catch(() => offlinePage());
    return Promise.race([
        network,
        new Promise((resolve) => setTimeout(() => resolve(cached), 3500))
    ]).catch(() => cached);
}

async function staleWhileRevalidate(event) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    const fetching = fetch(event.request).then((res) => {
        if (res && res.ok && res.type === 'basic') event.waitUntil(cache.put(event.request, res.clone()));
        return res;
    }).catch(() => null);
    return cached || (await fetching) || Response.error();
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    // Other sites (Worker, Aparat, ...) and the live status are never touched, so they can never go stale.
    if (url.origin !== self.location.origin) return;
    if (url.pathname === '/live-status.json' || url.pathname === '/sw.js') return;
    if (req.mode === 'navigate') { event.respondWith(handleNavigation(event)); return; }
    event.respondWith(staleWhileRevalidate(event));
});
