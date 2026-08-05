/* 오프라인 지원: 앱 셸은 캐시 우선, words.json은 네트워크 우선 */
const CACHE = 'vocab-v9';
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
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // 새 버전 활성화 시 열려있는 창을 자동 새로고침 → 즉시 최신 반영
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) { try { await c.navigate(c.url); } catch (_) {} }
  })());
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
  // 발음 mp3(같은 출처 audio/*): 캐시 우선 + 최초 재생 시 캐시에 저장 → 오프라인 재생
  if (url.origin === self.location.origin && url.pathname.includes('/audio/')) {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );
    return;
  }
  // 앱 셸: 캐시 우선
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
