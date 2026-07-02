// ─────────────────────────────────────────────────────────────────────────────
// Service Worker — Informe de Cheques (app independiente)
// Cachea el shell para que la app abra y funcione sin conexión.
// Subí SW_VERSION en cada cambio para invalidar la caché vieja.
// ─────────────────────────────────────────────────────────────────────────────
const SW_VERSION = 'cheques-v1';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(SW_VERSION).then(c => c.addAll(SHELL).catch(() => {})));
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

// Al tocar la notificación, enfoca/abre la app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    if (clients.openWindow) return clients.openWindow('./');
  }));
});
