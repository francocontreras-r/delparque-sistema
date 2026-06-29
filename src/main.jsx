import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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
