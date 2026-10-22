// ESS service worker (static-export safe): caches static app assets only.
// Cross-origin requests (weha-framework ERP / mobile auth) are never touched.
const VERSION = 'ess-v1';
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function putCopy(request, response) {
  const cache = await caches.open(VERSION);
  await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API/auth traffic stays on the network

  // Immutable build assets — cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => putCopy(request, res)))
    );
    return;
  }

  // Navigations — network-first with cached app-shell fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => putCopy(request, res))
        .catch(async () => (await caches.match(request)) ?? (await caches.match('/')) ?? Response.error())
    );
    return;
  }

  // Other same-origin assets — stale-while-revalidate
  event.respondWith(
    caches.match(request).then((hit) => {
      const refresh = fetch(request)
        .then((res) => putCopy(request, res))
        .catch(() => undefined);
      return hit || refresh.then((res) => res ?? Response.error());
    })
  );
});
