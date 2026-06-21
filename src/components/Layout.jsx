import { useState, useEffect, Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useUser } from '../context/UserContext'
import { clasificarVencimiento, esAlertaVencimiento } from '../lib/vencimientos'
import { LOGO_ISOTIPO } from '../assets/logos'

import { colors } from '../styles/design-system'
import {
  LayoutDashboard, Factory, Thermometer, Warehouse, TrendingUp, TrendingDown,
  ClipboardList, BookOpen, LogOut, Menu, X, DollarSign, Users, Download, FileText,
} from 'lucide-react'

const NAV = [
  { to: '/',             label: 'Inicio',       Icon: LayoutDashboard, modulo: 'dashboard'  },
  { to: '/produccion',   label: 'Producción',   Icon: Factory,       modulo: 'produccion'   },
  { to: '/camaras',      label: 'Cámaras',      Icon: Thermometer,   modulo: 'camaras'      },
  { to: '/deposito',     label: 'Depósito',     Icon: Warehouse,     modulo: 'deposito'     },
  { to: '/mermas',       label: 'Mermas',       Icon: TrendingDown,  modulo: 'mermas'       },
  { to: '/ordenes',      label: 'Órdenes',      Icon: ClipboardList, modulo: 'ordenes'      },
  { to: '/recetas',      label: 'Recetas',      Icon: BookOpen,      modulo: 'recetas'      },
  { to: '/finanzas',     label: 'Finanzas',     Icon: DollarSign,    modulo: 'finanzas'     },
  { to: '/informes',     label: 'Informes',     Icon: FileText,      modulo: 'informes'     },
  { to: '/rendimiento-operarios', label: 'Rendimiento', Icon: TrendingUp, modulo: 'rendimientoOperarios' },
  { to: '/usuarios',     label: 'Usuarios',     Icon: Users,         modulo: 'usuarios'     },
]

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
function SidebarContent({ onClose, user, onLogout, navItems, depositoBadge }) {
  const initial = user?.email?.charAt(0).toUpperCase() || 'U'
  const username = user?.email?.split('@')[0] || 'Usuario'

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: colors.sidebar }}>
      {/* Logo */}
      <div
        className="flex items-center justify-between px-5 py-5 flex-shrink-0"
        style={{ borderBottom: `1px solid ${colors.sidebarHover}` }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src={LOGO_ISOTIPO} style={{ height: '32px', width: '32px', objectFit: 'contain' }} alt="Del Parque" />
          <span style={{ color: '#D4521A', fontFamily: 'Georgia, serif', fontSize: '16px', fontWeight: 'bold' }}>Del Parque</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[#334155] md:hidden"
            style={{ color: colors.textMuted }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
        {navItems.map(n => (
          <NavItem key={n.to} to={n.to} label={n.label} Icon={n.Icon} onClick={onClose}
            badge={n.modulo === 'deposito' ? depositoBadge : 0} />
        ))}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 flex-shrink-0" style={{ borderTop: `1px solid ${colors.sidebarHover}` }}>
        {user && (
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ backgroundColor: colors.brand }}
            >
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate capitalize">{username}</p>
              <p className="text-xs truncate" style={{ color: colors.textMuted }}>{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 text-[#64748B] hover:bg-[#334155] hover:text-[#F1F5F9]"
        >
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
    waitingWorker.postMessage('skipWaiting')
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
  const { user, tienePermiso } = useUser()
  const location = useLocation()

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

  const navItems = NAV.filter(n => tienePermiso(n.modulo))
  const pageTitle = NAV.find(n => n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to))?.label || 'Del Parque'
  const initial   = user?.email?.charAt(0).toUpperCase() || 'U'

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: colors.bg }}>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0 shadow-lg">
        <SidebarContent user={user} onLogout={handleLogout} navItems={navItems} depositoBadge={depositoBadge} />
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
        <SidebarContent onClose={() => setMobileOpen(false)} user={user} onLogout={handleLogout} navItems={navItems} depositoBadge={depositoBadge} />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header
          className="flex items-center justify-between px-6 flex-shrink-0"
          style={{ height: 48, backgroundColor: colors.surface, borderBottom: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[#334155]"
              style={{ color: colors.textSecondary }}
            >
              <Menu size={18} />
            </button>
            <h1 className="text-lg font-semibold" style={{ color: colors.textPrimary }}>
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden sm:block" style={{ fontFamily: 'Georgia, serif', fontSize: '16px', fontWeight: 'bold', color: '#D4521A', letterSpacing: '1px' }}>
              Del Parque
            </span>
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
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="animate-spin" style={{ color: '#D4521A' }}>
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
    </div>
  )
}
