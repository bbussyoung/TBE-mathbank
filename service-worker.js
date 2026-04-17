/**
 * 수학 문제은행 - Service Worker
 * 오프라인에서도 앱이 작동하도록 핵심 리소스를 캐싱합니다.
 */

const CACHE_NAME = 'math-bank-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  './icon-maskable.svg'
];

// 외부 리소스 (구글 폰트, KaTeX) — 가져온 적 있으면 그대로 재사용
const RUNTIME_CACHE = 'math-bank-runtime-v1';

/* ===== 설치: 핵심 파일 미리 캐싱 ===== */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* ===== 활성화: 옛 캐시 정리 ===== */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

/* ===== 페치 전략 =====
 * - 핵심 자산: Cache First (캐시 먼저, 없으면 네트워크)
 * - 폰트 / KaTeX: Stale While Revalidate (캐시 우선 + 백그라운드 업데이트)
 * - 기타: Network First, 실패 시 캐시
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // GET 요청만 처리
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 외부 폰트/CDN 리소스 → Stale While Revalidate
  if (
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com' ||
    url.origin === 'https://cdn.jsdelivr.net'
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 같은 출처 → Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 그 외 → Network First with Cache fallback
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // 네트워크 실패 시 index.html로 폴백 (SPA 라우팅 대응)
    if (request.mode === 'navigate') {
      return caches.match('./index.html');
    }
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}
