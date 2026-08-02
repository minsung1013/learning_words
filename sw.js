/* 오프라인 지원: 앱 셸은 캐시 우선, words.json은 네트워크 우선 */
const CACHE = 'vocab-v2';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('words.json')) {
    // 항상 최신 단어를 받되, 실패 시 캐시 폴백
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put('./words.json', clone));
        return res;
      }).catch(() => caches.match('./words.json'))
    );
    return;
  }
  // 앱 셸: 캐시 우선
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
