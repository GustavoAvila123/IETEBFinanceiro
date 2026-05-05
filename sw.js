// IETEB Financeiro — Service Worker
//
// Estratégia conservadora para evitar cache "preso" em versões antigas:
//  - Network-first para HTML/JS/CSS do próprio app (sempre tenta atualizar
//    e cai no cache só se offline). O cache-buster ?v= ajuda a pegar
//    versões novas.
//  - Cache-first para assets estáticos (imagens, fontes externas).
//  - Network-only para Firestore/Auth (não cacheia dados de banco).
//
// Para invalidar cache antigo, basta bumpar CACHE_VERSION abaixo.
//
// Atenção: por design, NÃO cacheamos requisições POST/PUT/DELETE.
// Apenas GETs entram em cache.

const CACHE_VERSION = 'ieteb-v2-20260504';
const CACHE_STATIC  = `${CACHE_VERSION}-static`;
const CACHE_RUNTIME = `${CACHE_VERSION}-runtime`;

// App shell — pré-carregado no install para o app abrir offline
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/images/logo-ieteb-moderno.jpg',
];

// ── Install: pré-cache do app shell ───────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {/* falhas individuais não impedem install */})
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: limpa caches antigos ────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: roteia por estratégia ──────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só GET é cacheável
  if (req.method !== 'GET') return;

  // Network-only para Firestore, Auth e Storage do Firebase
  if (
    url.hostname.endsWith('googleapis.com') ||
    url.hostname.endsWith('firebaseio.com') ||
    url.hostname.endsWith('firebaseapp.com')
  ) {
    return; // deixa o browser tratar normalmente
  }

  // Same-origin: HTML/JS/CSS → network-first; outros → cache-first
  if (url.origin === self.location.origin) {
    const isAppCode = /\.(html|js|css)(?:$|\?)/.test(url.pathname);
    if (isAppCode || url.pathname === '/' || url.pathname === '/index.html') {
      event.respondWith(networkFirst(req));
    } else {
      event.respondWith(cacheFirst(req));
    }
    return;
  }

  // Cross-origin (CDN — fonts, jspdf, tesseract, chart, xlsx, pdfjs):
  // cache-first com revalidação em background
  event.respondWith(staleWhileRevalidate(req));
});

// ── Estratégias ───────────────────────────────────────────────────────

async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_RUNTIME);
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (_) {
    const cached = await caches.match(req);
    if (cached) return cached;
    // App shell como fallback final
    if (req.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    throw _;
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const fresh = await fetch(req);
  if (fresh && fresh.ok) {
    const cache = await caches.open(CACHE_STATIC);
    cache.put(req, fresh.clone()).catch(() => {});
  }
  return fresh;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_RUNTIME);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  return cached || networkPromise || fetch(req);
}

// ── Comunicação com a página (skipWaiting via postMessage) ────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
