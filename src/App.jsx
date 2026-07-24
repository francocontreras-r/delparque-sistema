import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, Component, useEffect } from 'react'
import { UserProvider, useUser } from './context/UserContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Produccion from './pages/Produccion'

// Módulos pesados cargados bajo demanda
const Camaras          = lazy(() => import('./pages/Camaras'))
const Deposito         = lazy(() => import('./pages/Deposito'))
const Mermas           = lazy(() => import('./pages/Mermas'))
const Ordenes          = lazy(() => import('./pages/Ordenes'))
const Recetas          = lazy(() => import('./pages/Recetas'))
const Finanzas         = lazy(() => import('./pages/Finanzas'))
const Usuarios         = lazy(() => import('./pages/Usuarios'))
const Informes         = lazy(() => import('./pages/Informes'))
const InformeOperarios = lazy(() => import('./pages/InformeOperarios'))
const Bitacora         = lazy(() => import('./pages/Bitacora'))

// ── Error boundary de ruta ────────────────────────────────────────────────────
// Evita la "pantalla en blanco": si una sección lazy no carga (típico tras un
// deploy nuevo, cuando el chunk viejo ya no existe) recargamos una vez para
// traer la última versión. Para cualquier otro error mostramos una tarjeta de
// recuperación con botón, sin desmontar toda la app.
class RouteErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) {
    const msg = String((error && error.message) || error || '')
    const esChunk = /dynamically imported module|Loading chunk|error loading dynamically|Importing a module script failed|ChunkLoadError|Failed to fetch/i.test(msg)
    if (esChunk && !sessionStorage.getItem('dp_reload')) {
      sessionStorage.setItem('dp_reload', '1')
      window.location.reload()
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 320, gap: 12, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>No pudimos cargar esta sección</div>
          <div style={{ fontSize: 13, color: '#64748b', maxWidth: 380, lineHeight: 1.5 }}>
            Puede ser una actualización reciente del sistema. Recargá para traer la última versión.
          </div>
          <button onClick={() => { sessionStorage.removeItem('dp_reload'); window.location.reload() }}
            style={{ marginTop: 4, background: '#FF4713', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Envuelve una sección lazy con el boundary + Suspense (el boundary va por fuera
// para poder atrapar el rechazo del import dinámico).
function Lazy({ children }) {
  return <RouteErrorBoundary><Suspense fallback={<PageSpinner />}>{children}</Suspense></RouteErrorBoundary>
}

// Spinner inline para no crear dependencia circular
function PageSpinner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', minHeight: 200,
    }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
        className="animate-spin" style={{ color: '#FF4713' }}>
        <circle className="opacity-25" cx="12" cy="12" r="10"
          stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  )
}

// Pantalla de carga inicial (antes de conocer la sesión)
function AppLoading() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', gap: 16,
      backgroundColor: '#0F172A',
    }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
        className="animate-spin" style={{ color: '#FF4713' }}>
        <circle className="opacity-25" cx="12" cy="12" r="10"
          stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p style={{ color: '#64748B', fontSize: 14 }}>Cargando Del Parque…</p>
    </div>
  )
}

function AdminRoute({ children }) {
  const { isAdmin, loading } = useUser()
  if (loading) return <PageSpinner />
  return isAdmin ? children : <Navigate to="/produccion" replace />
}

// Guarda genérica por módulo: cierra el acceso por URL a quien no tiene el
// permiso (el menú ya los oculta, pero la ruta quedaba abierta).
function ModuloRoute({ modulo, oModulo, children }) {
  const { tienePermiso, loading } = useUser()
  if (loading) return <PageSpinner />
  // oModulo: permiso alternativo que también habilita la ruta (ej. quien puede
  // 'vincularBases' entra a Órdenes aunque no tenga el módulo 'ordenes' completo).
  const ok = tienePermiso(modulo) || (oModulo && tienePermiso(oModulo))
  return ok ? children : <Navigate to="/produccion" replace />
}

function InformesRoute({ children }) {
  const { tienePermiso, loading } = useUser()
  if (loading) return <PageSpinner />
  return tienePermiso('informes') ? children : <Navigate to="/produccion" replace />
}

function RendimientoOperariosRoute({ children }) {
  const { tienePermiso, loading } = useUser()
  if (loading) return <PageSpinner />
  return tienePermiso('rendimientoOperarios') ? children : <Navigate to="/produccion" replace />
}

function AppRoutes() {
  const { session, loading } = useUser()
  if (loading) return <AppLoading />
  if (!session) return <Login />
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="produccion"   element={<Produccion />} />
          <Route path="camaras"      element={<ModuloRoute modulo="camaras"><Lazy><Camaras /></Lazy></ModuloRoute>} />
          <Route path="deposito"     element={<ModuloRoute modulo="deposito"><Lazy><Deposito /></Lazy></ModuloRoute>} />
          <Route path="mermas"       element={<ModuloRoute modulo="mermas"><Lazy><Mermas /></Lazy></ModuloRoute>} />
          <Route path="ordenes"      element={<ModuloRoute modulo="ordenes" oModulo="vincularBases"><Lazy><Ordenes /></Lazy></ModuloRoute>} />
          <Route path="recetas"      element={<ModuloRoute modulo="recetas"><Lazy><Recetas /></Lazy></ModuloRoute>} />
          <Route path="finanzas"     element={<AdminRoute><Lazy><Finanzas /></Lazy></AdminRoute>} />
          <Route path="informes"     element={<InformesRoute><Lazy><Informes /></Lazy></InformesRoute>} />
          <Route path="rendimiento-operarios" element={<RendimientoOperariosRoute><Lazy><InformeOperarios /></Lazy></RendimientoOperariosRoute>} />
          <Route path="bitacora"     element={<AdminRoute><Lazy><Bitacora /></Lazy></AdminRoute>} />
          <Route path="usuarios"     element={<AdminRoute><Lazy><Usuarios /></Lazy></AdminRoute>} />
          <Route path="*"            element={<Navigate to="/produccion" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  // Si la app estuvo sana unos segundos, re-armamos el auto-reload para el
  // próximo deploy (así el guardado evita bucles, pero no queda pegado).
  useEffect(() => {
    const t = setTimeout(() => sessionStorage.removeItem('dp_reload'), 5000)
    return () => clearTimeout(t)
  }, [])
  return (
    <UserProvider>
      <AppRoutes />
    </UserProvider>
  )
}
