import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Layout from './components/Layout'
import Produccion from './pages/Produccion'
import Camaras from './pages/Camaras'
import Deposito from './pages/Deposito'
import Rendimientos from './pages/Rendimientos'
import Mermas from './pages/Mermas'
import Ordenes from './pages/Ordenes'
import Recetas from './pages/Recetas'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return null

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
          <Route path="*"            element={<Navigate to="/produccion" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
