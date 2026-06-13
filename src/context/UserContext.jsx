import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export const ROLE_PERMISOS = {
  operario: {
    produccion: true, camaras: true, rendimientos: true,
  },
  supervisor: {
    produccion: true, camaras: true, rendimientos: true,
    deposito: true, mermas: true, ordenes: true, recetas: true,
    informes: true, rendimientoOperarios: true,
  },
  admin: {
    produccion: true, camaras: true, rendimientos: true,
    deposito: true, mermas: true, ordenes: true, recetas: true,
    finanzas: true, usuarios: true, informes: true, rendimientoOperarios: true,
  },
}

export const ROLES = ['operario', 'supervisor', 'admin']

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return
    if (!session) { setProfile(null); setProfileLoading(false); return }
    setProfileLoading(true)
    supabase.from('user_profiles').select('*').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => { setProfile(data); setProfileLoading(false) })
  }, [session])

  const rol = profile?.rol || 'operario'
  const permisos = { ...(ROLE_PERMISOS[rol] || ROLE_PERMISOS.operario), ...(profile?.permisos || {}) }
  const isAdmin = rol === 'admin'

  const value = {
    session,
    user: session?.user || null,
    profile,
    rol,
    permisos,
    isAdmin,
    loading: session === undefined || (!!session && profileLoading),
    tienePermiso: (modulo) => !!permisos[modulo],
    refrescarPerfil: () => {
      if (!session) return
      setProfileLoading(true)
      supabase.from('user_profiles').select('*').eq('id', session.user.id).maybeSingle()
        .then(({ data }) => { setProfile(data); setProfileLoading(false) })
    },
  }

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser debe usarse dentro de UserProvider')
  return ctx
}
