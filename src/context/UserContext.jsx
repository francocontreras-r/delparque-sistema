import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export const ROLE_PERMISOS = {
  operario: {
    dashboard: true,
    produccion: true, camaras: true, rendimientos: true,
  },
  supervisor: {
    dashboard: true,
    produccion: true, camaras: true, rendimientos: true,
    deposito: true, mermas: true, ordenes: true, recetas: true,
    informes: true, rendimientoOperarios: true,
  },
  admin: {
    dashboard: true,
    produccion: true, camaras: true, rendimientos: true,
    deposito: true, mermas: true, ordenes: true, recetas: true,
    finanzas: true, usuarios: true, informes: true, rendimientoOperarios: true,
    bitacora: true,
  },
}

export const ROLES = ['operario', 'supervisor', 'admin']

const INACTIVIDAD_MS = 2 * 60 * 60 * 1000

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  // Usuario cuyo perfil ya cargamos; evita recargas (y parpadeo de "loading")
  // cuando Supabase refresca el token al volver a la pestaña.
  const loadedUserId = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let timer
    const resetTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        await supabase.auth.signOut()
        window.location.href = '/login'
      }, INACTIVIDAD_MS)
    }
    const eventos = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    eventos.forEach(e => window.addEventListener(e, resetTimer))
    resetTimer()
    return () => {
      clearTimeout(timer)
      eventos.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [session])

  useEffect(() => {
    if (session === undefined) return
    if (!session) { setProfile(null); setProfileLoading(false); loadedUserId.current = null; return }
    // Si ya cargamos el perfil de este usuario, no recargar (token refresh al
    // volver a la pestaña): evita el parpadeo de "loading" que desmontaba la página.
    if (loadedUserId.current === session.user.id) return
    loadedUserId.current = session.user.id
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
