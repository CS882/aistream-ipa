/**
 * 最小 PWA Service Worker：只缓存同源静态壳资源。
 * 明确不缓存任何跨域请求（影视内容源不得被离线缓存或误当静态资源）。
 */
const CACHE = 'aistream-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

// network-first：补齐数据源配置后，已安装 PWA 也必须拿到最新的 datasource.js，
// 不能被旧缓存锁死；离线时才回退缓存。
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 内容源请求一律直连，不拦截
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return cached || Response.error();
      }
    })
  );
});
