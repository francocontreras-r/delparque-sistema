// ─────────────────────────────────────────────────────────────────────────────
// Service Worker — Del Parque
// IMPORTANTE: subí SW_VERSION en cada release que necesite invalidar caché.
// El navegador solo reinstala el SW si el BYTE de este archivo cambia; por eso
// la versión va en una constante (no en Date.now(), que es igual en cada build).
// ─────────────────────────────────────────────────────────────────────────────
const SW_VERSION = 'v105-2026-07-11';
const CACHE_NAME = 'delparque-' + SW_VERSION;
const STATIC_EXTENSIONS = ['.js', '.css', '.woff2', '.woff', '.ttf'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
    // No forzamos navigate/reload: la versión nueva se sirve en la próxima
    // recarga natural (network-first), sin interrumpir lo que el usuario hace.
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Nunca interceptar estas requests
  if (url.hostname.includes('supabase.co')) return;
  if (e.request.method !== 'GET') return;

  // Solo gestionar assets estáticos (el HTML siempre va directo a la red)
  const isStatic = STATIC_EXTENSIONS.some(ext => url.pathname.endsWith(ext));
  if (!isStatic) return;

  // NETWORK-FIRST: siempre intentamos traer la versión más nueva del servidor.
  // La caché es solo un respaldo para uso offline. Así el código nunca queda viejo.
  e.respondWith(
    fetch(e.request).then(response => {
      if (response && response.status === 200 && response.type !== 'opaque') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return response;
    }).catch(() => caches.match(e.request))
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
