import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { UserProvider, useUser } from './context/UserContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import Produccion from './pages/Produccion'
import Camaras from './pages/Camaras'
import Deposito from './pages/Deposito'
import Rendimientos from './pages/Rendimientos'
import Mermas from './pages/Mermas'
import Ordenes from './pages/Ordenes'
import Recetas from './pages/Recetas'
import Finanzas from './pages/Finanzas'
import Usuarios from './pages/Usuarios'
import Informes from './pages/Informes'
import InformeOperarios from './pages/InformeOperarios'

function AdminRoute({ children }) {
  const { isAdmin, loading } = useUser()
  if (loading) return null
  return isAdmin ? children : <Navigate to="/produccion" replace />
}

function InformesRoute({ children }) {
  const { tienePermiso, loading } = useUser()
  if (loading) return null
  return tienePermiso('informes') ? children : <Navigate to="/produccion" replace />
}

function RendimientoOperariosRoute({ children }) {
  const { tienePermiso, loading } = useUser()
  if (loading) return null
  return tienePermiso('rendimientoOperarios') ? children : <Navigate to="/produccion" replace />
}

function AppRoutes() {
  const { session, loading } = useUser()
  if (loading) return null
  if (!session) return <Login />
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/produccion" replace />} />
          <Route path="produccion"   element={<Produccion />} />
          <Route path="camaras"      element={<Camaras />} />
          <Route path="deposito"     element={<Deposito />} />
          <Route path="rendimientos" element={<Rendimientos />} />
          <Route path="mermas"       element={<Mermas />} />
          <Route path="ordenes"      element={<Ordenes />} />
          <Route path="recetas"      element={<Recetas />} />
          <Route path="finanzas"     element={<AdminRoute><Finanzas /></AdminRoute>} />
          <Route path="informes"     element={<InformesRoute><Informes /></InformesRoute>} />
          <Route path="rendimiento-operarios" element={<RendimientoOperariosRoute><InformeOperarios /></RendimientoOperariosRoute>} />
          <Route path="usuarios"     element={<AdminRoute><Usuarios /></AdminRoute>} />
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
