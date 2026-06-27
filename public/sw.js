const CACHE_NAME = 'delparque-' + Date.now();
const STATIC_EXTENSIONS = ['.js', '.css', '.woff2', '.woff', '.ttf'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(['/'])));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
     .then(() => self.clients.matchAll({ type: 'window' }).then(clients => {
       clients.forEach(client => client.navigate(client.url));
     }))
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Nunca interceptar estas requests
  if (url.hostname.includes('supabase.co')) return;
  if (e.request.method !== 'GET') return;

  // Solo cachear assets estáticos
  const isStatic = STATIC_EXTENSIONS.some(ext => url.pathname.endsWith(ext));
  if (!isStatic) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Verificar que la response es válida antes de clonar
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, responseClone));
        return response;
      }).catch(() => cached);
    })
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
