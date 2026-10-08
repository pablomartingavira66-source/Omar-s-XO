/* Ultimate XO service worker
   - pages and scripts: network first (so a new deploy shows up right away), cached copy when offline
   - icons and the rest of this site: cached copy first, refreshed in the background
   - other sites (Firebase, fonts, sounds) are never touched
   Bump VERSION when you want every device to drop its old cache. */
const VERSION = 'xo-v1';
const SHELL = [
  'index.html', 'Login.html', 'Bbb.html', 'Levels.html', 'AiGame.html', 'Tt.html', 'mystery.html',
  'Tot.html', 'Online.html', 'OnAi.html', 'dev.html', 'howtoplay.html', 'auth.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      // one missing file must not break the install
      .then(cache => Promise.all(SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('xo-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // pages and scripts
  if (req.mode === 'navigate' || req.destination === 'script') {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
    );
    return;
  }

  // icons, manifest
  event.respondWith(
    caches.match(req).then(hit => {
      const refresh = fetch(req)
        .then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});
