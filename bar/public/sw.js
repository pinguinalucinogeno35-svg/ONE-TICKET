// Service worker: guarda o PDV do bar para funcionar sem internet.
const CACHE = 'one-bar-v1';
const OFFLINE_PATHS = ['/pdv'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const isStatic = url.pathname.startsWith('/_next/static/') || /\.(png|svg|webmanifest|woff2?)$/.test(url.pathname);
  const isOfflinePage = req.mode === 'navigate' && OFFLINE_PATHS.some((p) => url.pathname.startsWith(p));
  if (!isStatic && !isOfflinePage) return;

  if (isStatic) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  event.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req)));
});
