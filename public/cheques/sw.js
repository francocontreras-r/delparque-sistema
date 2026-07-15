// ─────────────────────────────────────────────────────────────────────────────
// Service Worker — Informe de Cheques (app independiente)
// Cachea el shell para que la app abra y funcione sin conexión.
// Subí SW_VERSION en cada cambio para invalidar la caché vieja.
// ─────────────────────────────────────────────────────────────────────────────
const SW_VERSION = 'cheques-v39';
const SHELL = ['./', 'index.html', 'manifest.json', 'logo-ciaf.png', 'vendor/supabase.js', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

// Activamos la versión nueva ENSEGUIDA (skipWaiting). En el PWA de iPhone, el
// esquema de "esperar la confirmación" quedaba trancado; activar directo es lo
// más confiable. La app detecta el cambio y ofrece refrescar.
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(SW_VERSION).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== SW_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // El HTML va siempre a la red primero (así toma la última versión); el resto,
  // network-first con respaldo en caché para uso offline.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const clone = res.clone();
        caches.open(SW_VERSION).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

// Push del servidor: muestra la notificación aunque la app esté cerrada.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: '💳 Cheques', body: e.data ? e.data.text() : '' }; }
  const title = d.title || '💳 Cheques CIAF';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || 'cheques-venc',
    renotify: true,
    data: { url: d.url || './' },
  }));
});

// Al tocar la notificación, enfoca/abre la app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
