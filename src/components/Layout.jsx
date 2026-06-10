import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LogoDelParque from './LogoDelParque'
import { colors } from '../styles/design-system'
import {
  Factory, Thermometer, Warehouse, TrendingUp, TrendingDown,
  ClipboardList, BookOpen, LogOut, Menu, X,
} from 'lucide-react'

const NAV = [
  { to: '/produccion',   label: 'Producción',   Icon: Factory       },
  { to: '/camaras',      label: 'Cámaras',      Icon: Thermometer   },
  { to: '/deposito',     label: 'Depósito',     Icon: Warehouse     },
  { to: '/rendimientos', label: 'Rendimientos', Icon: TrendingUp    },
  { to: '/mermas',       label: 'Mermas',       Icon: TrendingDown  },
  { to: '/ordenes',      label: 'Órdenes',      Icon: ClipboardList },
  { to: '/recetas',      label: 'Recetas',      Icon: BookOpen      },
]

// ── Clock con actualización cada segundo ──────────────────────────────────────
function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="text-sm tabular-nums hidden sm:block" style={{ color: colors.textMuted }}>
      {now.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' })}
      {' · '}
      {now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
function NavItem({ to, label, Icon, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <NavLink
      to={to}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 select-none"
      style={({ isActive }) => ({
        backgroundColor: isActive ? colors.brand : hovered ? colors.sidebarHover : 'transparent',
        color: isActive ? '#ffffff' : hovered ? '#f1f5f9' : '#9ca3af',
      })}
    >
      <Icon size={16} />
      {label}
    </NavLink>
  )
}

// ── Sidebar content (definido fuera de Layout para evitar remounts) ───────────
function SidebarContent({ onClose, user, onLogout }) {
  const initial = user?.email?.charAt(0).toUpperCase() || 'U'

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: colors.sidebar }}>
      {/* Logo */}
      <div
        className="flex items-center justify-between px-5 py-5 flex-shrink-0"
        style={{ borderBottom: '1px solid #252525' }}
      >
        <div className="flex items-center gap-3">
          <LogoDelParque size={34} />
          <div className="leading-tight">
            <p className="font-bold text-white text-lg leading-none">
              Del <span style={{ color: colors.brand }}>Parque</span>
            </p>
            <p className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: '#4b5563' }}>
              Gestión
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[#2a2a2a] md:hidden"
            style={{ color: '#6b7280' }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p
          className="text-[10px] font-bold uppercase px-3 mb-3"
          style={{ color: '#4b5563', letterSpacing: '0.1em' }}
        >
          Módulos
        </p>
        {NAV.map(n => (
          <NavItem key={n.to} to={n.to} label={n.label} Icon={n.Icon} onClick={onClose} />
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 flex-shrink-0" style={{ borderTop: '1px solid #252525' }}>
        {user && (
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1 rounded-lg">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ backgroundColor: colors.brand }}
            >
              {initial}
            </div>
            <p className="text-xs truncate" style={{ color: '#6b7280' }}>{user.email}</p>
          </div>
        )}
        <button
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
          style={{ color: '#6b7280' }}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = 'rgba(220,38,38,0.15)'
            e.currentTarget.style.color = '#f87171'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = '#6b7280'
          }}
        >
          <LogOut size={15} />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

// ── Layout principal ──────────────────────────────────────────────────────────
export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [user, setUser] = useState(null)
  const location = useLocation()

  const pageTitle = NAV.find(n => location.pathname.startsWith(n.to))?.label || 'Del Parque'
  const initial   = user?.email?.charAt(0).toUpperCase() || 'U'

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: colors.bg }}>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0 shadow-lg">
        <SidebarContent user={user} onLogout={handleLogout} />
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
        <SidebarContent onClose={() => setMobileOpen(false)} user={user} onLogout={handleLogout} />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header
          className="flex items-center justify-between px-6 flex-shrink-0 bg-white"
          style={{ height: 56, borderBottom: `1px solid ${colors.border}` }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-slate-100"
              style={{ color: colors.textSecondary }}
            >
              <Menu size={18} />
            </button>
            <h1 className="text-base font-semibold" style={{ color: colors.textPrimary }}>
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-4">
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
          <Outlet />
        </main>
      </div>
    </div>
  )
}
