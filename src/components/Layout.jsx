import { useState, useEffect, Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useUser } from '../context/UserContext'
import { clasificarVencimiento, esAlertaVencimiento } from '../lib/vencimientos'
import { LOGO_ISOTIPO } from '../assets/logos'

import { colors } from '../styles/design-system'
import Modal from './ui/Modal'
import Button from './ui/Button'
import {
  LayoutDashboard, Factory, Thermometer, Warehouse, TrendingUp, TrendingDown,
  ClipboardList, BookOpen, LogOut, Menu, X, DollarSign, Users, Download, FileText,
  Package, History,
} from 'lucide-react'

const NAV_GRUPOS = [
  {
    grupo: 'PRODUCCIÓN',
    items: [
      { to: '/',           label: 'Inicio',      Icon: LayoutDashboard, modulo: 'dashboard'  },
      { to: '/produccion', label: 'Producción',  Icon: Factory,         modulo: 'produccion' },
      { to: '/ordenes',    label: 'Órdenes',     Icon: ClipboardList,   modulo: 'ordenes', oModulo: 'vincularBases' },
    ],
  },
  {
    grupo: 'INVENTARIO',
    items: [
      { to: '/camaras',  label: 'Cámaras',  Icon: Thermometer, modulo: 'camaras'  },
      { to: '/deposito', label: 'Depósito', Icon: Warehouse,   modulo: 'deposito' },
    ],
  },
  {
    grupo: 'ANÁLISIS',
    items: [
      { to: '/informes',              label: 'Informes',    Icon: FileText,    modulo: 'informes'              },
      { to: '/rendimiento-operarios', label: 'Rendimiento', Icon: TrendingUp,  modulo: 'rendimientoOperarios'  },
      { to: '/mermas',                label: 'Mermas',      Icon: TrendingDown, modulo: 'mermas'                },
      { to: '/finanzas',              label: 'Finanzas',    Icon: DollarSign,  modulo: 'finanzas'              },
    ],
  },
  {
    grupo: 'CONFIGURACIÓN',
    items: [
      { to: '/recetas',  label: 'Recetas',  Icon: BookOpen, modulo: 'recetas'  },
      { to: '/bitacora', label: 'Bitácora', Icon: History,  modulo: 'bitacora' },
      { to: '/usuarios', label: 'Usuarios', Icon: Users,    modulo: 'usuarios' },
    ],
  },
]

const NAV = NAV_GRUPOS.flatMap(g => g.items)

// ── Reloj HH:MM, actualizado cada minuto ──────────────────────────────────────
function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="text-sm font-medium tabular-nums hidden sm:block" style={{ color: colors.textSecondary }}>
      {now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
    </span>
  )
}

// ── Indicador de conexión Supabase ────────────────────────────────────────────
function StatusDot() {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    async function ping() {
      const { error } = await supabase.from('stock_camaras').select('id').limit(1)
      setOnline(!error)
    }
    ping()
    const id = setInterval(ping, 30000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="flex items-center gap-1.5" title={online ? 'Conectado a Supabase' : 'Sin conexión'}>
      <div
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: online ? colors.success : colors.danger }}
      />
      <span className="text-xs hidden md:block" style={{ color: colors.textMuted }}>
        {online ? 'Conectado' : 'Sin conexión'}
      </span>
    </div>
  )
}

// ── Nav item con hover controlado ─────────────────────────────────────────────
function NavItem({ to, label, Icon, onClick, badge }) {
  const [hovered, setHovered] = useState(false)
  return (
    <NavLink
      to={to}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-3 mx-2 rounded-lg text-sm font-medium transition-all duration-150 select-none"
      style={({ isActive }) => ({
        padding: '10px 16px',
        backgroundColor: isActive ? colors.sidebarActive : hovered ? colors.sidebarHover : 'transparent',
        color: isActive || hovered ? '#ffffff' : colors.textMuted,
      })}
    >
      <Icon size={16} />
      {label}
      {badge > 0 && (
        <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: '#ef4444', color: 'white' }}>
          {badge}
        </span>
      )}
    </NavLink>
  )
}

// ── Sidebar content (definido fuera de Layout para evitar remounts) ───────────
function SidebarContent({ onClose, user, profile, rol, onLogout, navItems, depositoBadge, camarasBadge }) {
  const initial  = (profile?.nombre || user?.email || 'U').charAt(0).toUpperCase()
  const username = profile?.nombre || user?.email?.split('@')[0] || 'Usuario'
  const rolLabel = rol === 'admin' ? 'ADMIN' : rol === 'supervisor' ? 'SUPERVISOR' : 'OPERARIO'
  const rolColor = rol === 'admin' ? '#FF4713' : rol === 'supervisor' ? '#3b82f6' : '#64748b'

  // Filtrar grupos a solo los items con permiso
  const gruposFiltrados = NAV_GRUPOS.map(g => ({
    ...g,
    items: g.items.filter(item => navItems.some(n => n.to === item.to)),
  })).filter(g => g.items.length > 0)

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: colors.sidebar }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
        style={{ borderBottom: `2px solid #FF4713` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
          <img src={LOGO_ISOTIPO} style={{ height: '34px', width: '34px', objectFit: 'contain' }} alt="Del Parque" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {/* Logotipo de marca SOLO TEXTO (fuente Reklame). El wordmark completo
                incluye su propia gota → junto al isotipo circular se duplicaba. */}
            <img src="/logo-wordmark-text-white.png" alt="Del Parque" style={{ height: '18px', objectFit: 'contain', display: 'block' }} />
            <div style={{ color: colors.textMuted, fontSize: '9px', letterSpacing: '0.7px', textTransform: 'uppercase' }}>Sistema de Producción</div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[#334155] md:hidden"
            style={{ color: colors.textMuted }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav por grupos */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {gruposFiltrados.map(({ grupo, items }) => (
          <div key={grupo} className="mb-1">
            <div className="px-5 py-1.5" style={{ fontSize: '9px', fontWeight: '700', color: '#475569', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              {grupo}
            </div>
            {items.map(n => (
              <NavItem key={n.to} to={n.to} label={n.label} Icon={n.Icon} onClick={onClose}
                badge={n.modulo === 'deposito' ? depositoBadge : n.modulo === 'camaras' ? camarasBadge : 0} />
            ))}
          </div>
        ))}
      </nav>

      {/* Footer con usuario */}
      <div className="px-3 py-3 flex-shrink-0" style={{ borderTop: `1px solid ${colors.sidebarHover}` }}>
        {user && (
          <div className="flex items-center gap-2.5 mb-2.5 px-2 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
              style={{ backgroundColor: colors.brand }}>
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{username}</p>
              <span style={{ background: rolColor + '22', color: rolColor, fontSize: '9px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', letterSpacing: '0.5px' }}>
                {rolLabel}
              </span>
            </div>
          </div>
        )}
        <button onClick={onLogout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 text-[#64748B] hover:bg-[#334155] hover:text-[#F1F5F9]">
          <LogOut size={15} />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

// ── Banner de instalación PWA ─────────────────────────────────────────────────
function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function onBeforeInstall(e) {
      e.preventDefault()
      setDeferredPrompt(e)
      setVisible(true)
    }
    function onInstalled() {
      setVisible(false)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!visible) return null

  async function instalar() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setVisible(false)
  }

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg"
      style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-white font-extrabold text-sm"
        style={{ backgroundColor: colors.brand }}
      >
        DP
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Instalar Del Parque</p>
        <p className="text-xs" style={{ color: colors.textMuted }}>Accedé más rápido desde tu pantalla de inicio</p>
      </div>
      <button
        onClick={instalar}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0"
        style={{ backgroundColor: colors.brand }}
      >
        <Download size={14} />
        Instalar
      </button>
      <button
        onClick={() => setVisible(false)}
        className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 hover:bg-[#334155]"
        style={{ color: colors.textMuted }}
      >
        <X size={14} />
      </button>
    </div>
  )
}

// ── Banner de nueva versión disponible ────────────────────────────────────────
function UpdateBanner() {
  const [waitingWorker, setWaitingWorker] = useState(null)

  useEffect(() => {
    function onUpdate(e) {
      setWaitingWorker(e.detail)
    }
    window.addEventListener('sw-update-available', onUpdate)
    return () => window.removeEventListener('sw-update-available', onUpdate)
  }, [])

  if (!waitingWorker) return null

  function actualizar() {
    waitingWorker?.postMessage('skipWaiting')
    window.location.reload()  // recarga controlada por el usuario, cuando él quiere
  }

  return (
    <div
      className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg"
      style={{ backgroundColor: colors.sidebar, border: `1px solid ${colors.sidebarHover}` }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">Nueva versión disponible</p>
      </div>
      <button
        onClick={actualizar}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0"
        style={{ backgroundColor: colors.brand }}
      >
        Actualizar
      </button>
    </div>
  )
}

// ── Layout principal ──────────────────────────────────────────────────────────
export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [depositoBadge, setDepositoBadge] = useState(0)
  const [camarasBadge, setCamarasBadge] = useState(0)
  const [confirmCerrar, setConfirmCerrar] = useState(false)
  const { user, profile, rol, tienePermiso } = useUser()
  const location = useLocation()

  // ESC global: si no hay ningún modal abierto (los modales frenan el ESC en
  // captura), ofrece cerrar el sistema con una confirmación.
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') setConfirmCerrar(true) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    async function checkVencimientos() {
      const { data } = await supabase.from('movimientos_deposito')
        .select('producto_nombre,fecha_vencimiento,created_at')
        .eq('tipo', 'ingreso').not('fecha_vencimiento', 'is', null)
        .order('created_at', { ascending: false }).limit(500)
      if (!data) return
      // Dedup por producto, tomar más reciente, contar alertas
      const map = {}
      data.forEach(m => {
        const key = (m.producto_nombre || '').trim().toLowerCase()
        if (!map[key] || m.created_at > map[key].created_at) map[key] = m
      })
      const cnt = Object.values(map).filter(m => esAlertaVencimiento(clasificarVencimiento(m.fecha_vencimiento))).length
      setDepositoBadge(cnt)
    }
    checkVencimientos()
    const id = setInterval(checkVencimientos, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    async function checkCamaras() {
      const { data } = await supabase.from('stock_camaras').select('baldes').eq('baldes', 0)
      setCamarasBadge((data || []).length)
    }
    checkCamaras()
    const id = setInterval(checkCamaras, 3 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const navItems = NAV.filter(n => tienePermiso(n.modulo) || (n.oModulo && tienePermiso(n.oModulo)))
  // Ubicación actual (grupo + página) para el breadcrumb del header. La barra
  // superior muestra "dónde estás"; el título grande vive en cada página.
  const navMatch = (() => {
    for (const g of NAV_GRUPOS) {
      for (const it of g.items) {
        const activo = it.to === '/' ? location.pathname === '/' : location.pathname.startsWith(it.to)
        if (activo) return { grupo: g.grupo, label: it.label }
      }
    }
    return null
  })()
  const grupoActual = navMatch ? navMatch.grupo.charAt(0) + navMatch.grupo.slice(1).toLowerCase() : ''
  const pageTitle   = navMatch?.label || 'Del Parque'
  const initial     = user?.email?.charAt(0).toUpperCase() || 'U'

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: colors.bg }}>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0 shadow-lg">
        <SidebarContent user={user} profile={profile} rol={rol} onLogout={handleLogout} navItems={navItems} depositoBadge={depositoBadge} camarasBadge={camarasBadge} />
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-50 w-60 flex flex-col md:hidden shadow-xl"
        style={{ transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 220ms ease' }}
      >
        <SidebarContent onClose={() => setMobileOpen(false)} user={user} profile={profile} rol={rol} onLogout={handleLogout} navItems={navItems} depositoBadge={depositoBadge} camarasBadge={camarasBadge} />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header
          className="flex items-center justify-between px-6 flex-shrink-0"
          style={{ height: 48, backgroundColor: colors.surface, borderBottom: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[#334155]"
              style={{ color: colors.textSecondary }}
            >
              <Menu size={18} />
            </button>
            {/* Breadcrumb: ubicación, no un segundo título. El nombre grande de la
                página lo pone cada página; acá solo damos contexto de dónde estás. */}
            <nav aria-label="Ubicación" className="flex items-center gap-2 text-sm min-w-0">
              {grupoActual && (
                <>
                  <span className="hidden sm:inline truncate" style={{ color: colors.textMuted }}>{grupoActual}</span>
                  <span className="hidden sm:inline" style={{ color: colors.border }}>/</span>
                </>
              )}
              <span className="font-semibold truncate" style={{ color: colors.textPrimary }}>{pageTitle}</span>
            </nav>
          </div>

          <div className="flex items-center gap-4 flex-shrink-0">
            <Clock />
            <StatusDot />
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
              style={{ backgroundColor: colors.brand }}
            >
              {initial}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 240 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="animate-spin" style={{ color: '#FF4713' }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          }>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <InstallBanner />
      <UpdateBanner />

      {/* Cerrar sistema (ESC) */}
      <Modal
        open={confirmCerrar}
        onClose={() => setConfirmCerrar(false)}
        title="Cerrar sistema"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCerrar(false)} className="flex-1">
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => { setConfirmCerrar(false); handleLogout() }} className="flex-1">
              <LogOut size={15} /> Cerrar sistema
            </Button>
          </>
        }
      >
        <p style={{ color: colors.textSecondary }}>
          ¿Está seguro que desea cerrar el sistema? Se cerrará tu sesión y volverás a la pantalla de inicio.
        </p>
      </Modal>
    </div>
  )
}
