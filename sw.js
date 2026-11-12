/* Pocket Gridiron: service worker.
   Network first, cache as a fallback: when there is a connection you always get the newest build, and when there
   is none the last one you loaded still plays. Nothing is ever served from the cache while the network answers,
   so a new push to the site can never be hidden by an old copy. */
const CACHE = 'pocket-gridiron-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !/^https?:/.test(req.url)) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {       // opaque: the library and the font come from other sites
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || Response.error()))
  );
});
