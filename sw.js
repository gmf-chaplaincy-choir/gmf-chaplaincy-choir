/* GMF Chaplaincy Choir — Service Worker v4
   Key fix: index.html is always fetched from network first so new songs
   appear immediately when online. PDFs stay network-first + cached for
   offline. Everything else (fonts, pdf.js) is cache-first for speed.    */

const CACHE = 'gmf-choir-v4';

/* App shell — pre-cached at install for instant offline load */
const SHELL = [
  '/choir-image.jpeg',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Nunito:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

/* Install — pre-cache shell assets (NOT index.html — see fetch handler) */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

/* Activate — delete every old cache so stale index.html is wiped */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* Fetch strategy:
   - index.html / root  → NETWORK FIRST (always get latest song list)
                          fall back to cache only if offline
   - .pdf files         → NETWORK FIRST (latest score) + cache for offline
   - everything else    → CACHE FIRST   (fonts, pdf.js — fast + offline)  */
self.addEventListener('fetch', e => {
  const url = e.request.url;
  const isIndex = url.endsWith('/') ||
                  url.endsWith('/index.html') ||
                  url === self.location.origin + '/';

  /* ── index.html: always network-first ── */
  if (isIndex) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match('/index.html')
                      .then(cached => cached || caches.match('/')))
    );
    return;
  }

  /* ── PDFs: network-first, cache for offline ── */
  if (url.includes('.pdf')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  /* ── Everything else: cache-first, network fallback ── */
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});