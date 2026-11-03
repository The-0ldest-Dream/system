const CACHE = 'system-v1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/main.css',
  './js/app.js','./js/system.js','./js/stats.js','./js/quests.js',
  './js/routines.js','./js/logs.js','./js/charts.js','./js/tree.js',
  './js/audio.js','./js/storage.js','./js/ui.js',
  './assets/icons/icon-192.png','./assets/icons/icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});