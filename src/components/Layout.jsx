import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  Factory,
  Thermometer,
  Warehouse,
  TrendingUp,
  TrendingDown,
  ClipboardList,
  BookOpen,
  LogOut,
  Menu,
  X,
} from 'lucide-react'

const NAV = [
  { to: '/produccion',    label: 'Producción',   Icon: Factory },
  { to: '/camaras',       label: 'Cámaras',      Icon: Thermometer },
  { to: '/deposito',      label: 'Depósito',     Icon: Warehouse },
  { to: '/rendimientos',  label: 'Rendimientos', Icon: TrendingUp },
  { to: '/mermas',        label: 'Mermas',       Icon: TrendingDown },
  { to: '/ordenes',       label: 'Órdenes',      Icon: ClipboardList },
  { to: '/recetas',       label: 'Recetas',      Icon: BookOpen },
]

const ORANGE = '#D4521A'

function SidebarContent({ onClose }) {
  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-800 text-base leading-none">
            Del <span style={{ color: ORANGE }}>Parque</span>
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 md:hidden">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'text-white'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`
            }
            style={({ isActive }) => isActive ? { backgroundColor: ORANGE } : {}}
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={17} />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-gray-100 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-56 bg-white border-r border-gray-100 flex flex-col transform transition-transform duration-200 md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent onClose={() => setMobileOpen(false)} />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-gray-500 hover:text-gray-700"
          >
            <Menu size={22} />
          </button>
          <span className="font-bold text-gray-800 text-sm leading-none">
            Del <span style={{ color: ORANGE }}>Parque</span>
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
