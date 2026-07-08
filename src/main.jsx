import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Raleway (tipografía de texto general del manual de marca), self-hosted para
// que funcione offline en la PWA — sin CDN externo. Pesos usados en la app.
import '@fontsource/raleway/400.css'
import '@fontsource/raleway/500.css'
import '@fontsource/raleway/600.css'
import '@fontsource/raleway/700.css'
import '@fontsource/raleway/800.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('sw-update-available', { detail: newWorker }))
          }
        })
      })

      // No recargamos automáticamente al cambiar de service worker: eso
      // interrumpía al usuario y borraba lo que estaba haciendo. La versión
      // nueva se aplica sola en la próxima recarga (network-first sirve lo último).

      setInterval(() => reg.update(), 60000)

    } catch (err) {
      console.error('SW registration failed:', err)
    }
  })
}
