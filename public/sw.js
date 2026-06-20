const CACHE_NAME = 'delparque-v4'
const STATIC_EXTENSIONS = ['.js', '.css', '.png', '.ico', '.woff2', '.woff', '.svg', '.webp']

self.addEventListener('install', e => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(['/'])))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Nunca interceptar llamadas a Supabase ni a APIs externas
  if (url.hostname.includes('supabase.co')) return
  if (url.hostname.includes('supabase.io')) return
  if (url.pathname.includes('/api/')) return
  if (e.request.method !== 'GET') return

  // Solo cachear assets estáticos por extensión
  const isStatic = STATIC_EXTENSIONS.some(ext => url.pathname.endsWith(ext))
  if (!isStatic) return

  e.respondWith(
    caches.match(e.request).then(cached => {
      // Fetch con timeout de 5 segundos
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const fetchPromise = fetch(e.request, { signal: controller.signal })
        .then(response => {
          clearTimeout(timeout)
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, response.clone()))
          }
          return response
        })
        .catch(() => {
          clearTimeout(timeout)
          return cached // Si falla el fetch, servir desde cache
        })

      // Si hay cache, servir inmediatamente y actualizar en background
      return cached || fetchPromise
    })
  )
})

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting()
})
