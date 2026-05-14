// IETEB Financeiro — Service Worker
//
// Estratégia conservadora para evitar cache "preso" em versões antigas:
//  - Network-first para HTML/JS/CSS do próprio app (sempre tenta atualizar
//    e cai no cache só se offline). O cache-buster ?v= ajuda a pegar
//    versões novas.
//  - Cache-first para assets estáticos (imagens, fontes externas).
//  - Network-only para Firestore/Auth (não cacheia dados de banco).
//  - Cache-first PERMANENTE para o motor + modelos do Tesseract
//    (~5-15MB, não mudam entre versões do app, vivem em CACHE_OCR
//    que NÃO é limpo na ativação). Permite OCR offline depois da
//    primeira vez que o usuário leu um comprovante online.
//
// Para invalidar cache antigo, basta bumpar CACHE_VERSION abaixo.
//
// Atenção: por design, NÃO cacheamos requisições POST/PUT/DELETE.
// Apenas GETs entram em cache.

const CACHE_VERSION = 'ieteb-v8-20260514';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_RUNTIME = `${CACHE_VERSION}-runtime`;
// Cache PERSISTENTE (não rotaciona com versão) — Tesseract weights
// são pesados e não mudam frequentemente. Ficam aqui pra sobreviver
// entre deploys do app, garantindo OCR offline.
const CACHE_OCR = 'ieteb-ocr-v1';

// App shell — pré-carregado no install para o app abrir offline
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/images/logo-ieteb-moderno.jpg',
];

// Hosts e padrões do motor + modelos OCR (Tesseract.js + tessdata)
const OCR_HOSTS = ['tessdata.projectnaptha.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];
const OCR_PATH_PATTERNS = [
  /tesseract/i, // tesseract.min.js, tesseract-core, worker, etc.
  /\.traineddata(\.gz)?$/i, // modelo de idioma do tessdata
  /pdf\.(min\.)?js/i, // pdf.js / pdf.worker (também pesado, useful pra PDF offline)
];

function isOcrAsset(url) {
  if (!OCR_HOSTS.includes(url.hostname)) return false;
  return OCR_PATH_PATTERNS.some((re) => re.test(url.pathname) || re.test(url.search || ''));
}

// ── Install: pré-cache do app shell ───────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then((cache) =>
        cache.addAll(APP_SHELL).catch(() => {
          /* falhas individuais não impedem install */
        })
      )
      .then(() => self.skipWaiting())
  );
});

// ── Activate: limpa caches antigos ────────────────────────────────────
// IMPORTANTE: CACHE_OCR é preservado pra não invalidar weights pesados.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION) && k !== CACHE_OCR)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: roteia por estratégia ──────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só GET é cacheável
  if (req.method !== 'GET') return;

  // OCR engine + weights → cache permanente (cache-first agressivo)
  if (isOcrAsset(url)) {
    event.respondWith(cacheFirstPersistent(req));
    return;
  }

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

  // Cross-origin (CDN — fonts, jspdf, chart, xlsx, ...):
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

// Cache-first agressivo PERSISTENTE — só consulta a rede no primeiro
// request. Usado pra Tesseract weights (não mudam, e a rede deles é
// lenta/limitada). Sobrevive a bumps do CACHE_VERSION.
async function cacheFirstPersistent(req) {
  const cache = await caches.open(CACHE_OCR);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    // Só cacheia respostas válidas (200 ou opaque). Opaque (204/0)
    // ainda funciona em runtime.
    if (fresh && (fresh.ok || fresh.type === 'opaque')) {
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (e) {
    // Sem rede E sem cache — falha mesmo. App lida graciosamente
    // (toast "Não foi possível ler o comprovante").
    throw e;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_RUNTIME);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  return cached || networkPromise || fetch(req);
}

// ── Comunicação com a página (skipWaiting via postMessage) ────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
