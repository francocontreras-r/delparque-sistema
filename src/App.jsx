import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
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

// Spinner inline para no crear dependencia circular
function PageSpinner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', minHeight: 200,
    }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
        className="animate-spin" style={{ color: '#D4521A' }}>
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
        className="animate-spin" style={{ color: '#D4521A' }}>
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
function ModuloRoute({ modulo, children }) {
  const { tienePermiso, loading } = useUser()
  if (loading) return <PageSpinner />
  return tienePermiso(modulo) ? children : <Navigate to="/produccion" replace />
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
          <Route path="camaras"      element={<ModuloRoute modulo="camaras"><Suspense fallback={<PageSpinner />}><Camaras /></Suspense></ModuloRoute>} />
          <Route path="deposito"     element={<ModuloRoute modulo="deposito"><Suspense fallback={<PageSpinner />}><Deposito /></Suspense></ModuloRoute>} />
          <Route path="mermas"       element={<ModuloRoute modulo="mermas"><Suspense fallback={<PageSpinner />}><Mermas /></Suspense></ModuloRoute>} />
          <Route path="ordenes"      element={<ModuloRoute modulo="ordenes"><Suspense fallback={<PageSpinner />}><Ordenes /></Suspense></ModuloRoute>} />
          <Route path="recetas"      element={<ModuloRoute modulo="recetas"><Suspense fallback={<PageSpinner />}><Recetas /></Suspense></ModuloRoute>} />
          <Route path="finanzas"     element={<AdminRoute><Suspense fallback={<PageSpinner />}><Finanzas /></Suspense></AdminRoute>} />
          <Route path="informes"     element={<InformesRoute><Suspense fallback={<PageSpinner />}><Informes /></Suspense></InformesRoute>} />
          <Route path="rendimiento-operarios" element={<RendimientoOperariosRoute><Suspense fallback={<PageSpinner />}><InformeOperarios /></Suspense></RendimientoOperariosRoute>} />
          <Route path="bitacora"     element={<AdminRoute><Suspense fallback={<PageSpinner />}><Bitacora /></Suspense></AdminRoute>} />
          <Route path="usuarios"     element={<AdminRoute><Suspense fallback={<PageSpinner />}><Usuarios /></Suspense></AdminRoute>} />
          <Route path="*"            element={<Navigate to="/produccion" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <UserProvider>
      <AppRoutes />
    </UserProvider>
  )
}
