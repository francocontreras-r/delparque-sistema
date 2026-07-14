import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useUser, ROLE_PERMISOS, ROLES } from '../context/UserContext'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import { PageHeader } from '../components/PageHeader'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Badge from '../components/ui/Badge'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import { Users, Plus, Check, X as XIcon, KeyRound, Trash2 } from 'lucide-react'

const MODULOS = [
  { key: 'produccion',   label: 'Producción' },
  { key: 'camaras',      label: 'Cámaras' },
  { key: 'deposito',     label: 'Depósito' },
  { key: 'rendimientos', label: 'Rendimientos' },
  { key: 'mermas',       label: 'Mermas' },
  { key: 'ordenes',      label: 'Órdenes' },
  { key: 'vincularBases', label: 'Vincular bases (cámara)' },
  { key: 'recetas',      label: 'Recetas' },
  { key: 'finanzas',     label: 'Finanzas' },
  { key: 'usuarios',     label: 'Usuarios' },
]

function rolVariant(rol) {
  if (rol === 'admin')      return 'danger'
  if (rol === 'supervisor') return 'warning'
  return 'info'
}

export default function Usuarios() {
  const { session } = useUser()
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading]   = useState(true)
  const [toast, setToast]       = useState(null)
  const [modalNuevo, setModalNuevo] = useState(false)
  const [savingNuevo, setSavingNuevo] = useState(false)
  const [formNuevo, setFormNuevo] = useState({ email: '', nombre: '', rol: 'operario' })
  const [credenciales, setCredenciales] = useState(null)
  const [editUser, setEditUser] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [modalEliminar, setModalEliminar] = useState(null) // user object
  const [eliminandoUser, setEliminandoUser] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const { data } = await supabase.from('user_profiles').select('*').order('nombre')
    setUsuarios(data || [])
    setLoading(false)
  }

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function crearUsuario() {
    if (!formNuevo.email || !formNuevo.nombre) {
      toast2('Completá email y nombre', 'error'); return
    }
    setSavingNuevo(true)
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(formNuevo),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el usuario')
      toast2('Usuario creado')
      setModalNuevo(false)
      setCredenciales({ email: formNuevo.email, password: data.tempPassword })
      setFormNuevo({ email: '', nombre: '', rol: 'operario' })
      cargar()
    } catch (e) {
      toast2(e.message, 'error')
    } finally {
      setSavingNuevo(false)
    }
  }

  async function toggleActivo(u) {
    const { error } = await supabase.from('user_profiles').update({ activo: !u.activo }).eq('id', u.id)
    if (error) { toast2(error.message, 'error'); return }
    setUsuarios(prev => prev.map(x => x.id === u.id ? { ...x, activo: !u.activo } : x))
    toast2(u.activo ? 'Usuario desactivado' : 'Usuario activado')
  }

  async function eliminarUsuario() {
    if (!modalEliminar) return
    setEliminandoUser(true)
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'disable', userId: modalEliminar.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el usuario')
      setUsuarios(prev => prev.map(x => x.id === modalEliminar.id ? { ...x, activo: false } : x))
      toast2(`Usuario "${modalEliminar.nombre}" eliminado`)
      setModalEliminar(null)
    } catch (e) {
      toast2(e.message, 'error')
    } finally {
      setEliminandoUser(false)
    }
  }

  async function reactivarUsuario(u) {
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'reactivate', userId: u.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo reactivar el usuario')
      setUsuarios(prev => prev.map(x => x.id === u.id ? { ...x, activo: true } : x))
      toast2(`Usuario "${u.nombre}" reactivado`)
    } catch (e) {
      toast2(e.message, 'error')
    }
  }

  function abrirEdicion(u) {
    const efectivos = { ...(ROLE_PERMISOS[u.rol] || ROLE_PERMISOS.operario), ...(u.permisos || {}) }
    setEditUser({ ...u, permisos: efectivos })
  }

  function cambiarRolEdicion(rol) {
    setEditUser(u => ({ ...u, rol, permisos: { ...(ROLE_PERMISOS[rol] || ROLE_PERMISOS.operario) } }))
  }

  function toggleModuloEdicion(modulo) {
    setEditUser(u => ({ ...u, permisos: { ...u.permisos, [modulo]: !u.permisos[modulo] } }))
  }

  async function guardarEdicion() {
    if (!editUser) return
    setSavingEdit(true)
    const { error } = await supabase.from('user_profiles')
      .update({ nombre: editUser.nombre, rol: editUser.rol, permisos: editUser.permisos })
      .eq('id', editUser.id)
    setSavingEdit(false)
    if (error) { toast2(error.message, 'error'); return }
    toast2('Usuario actualizado')
    setEditUser(null)
    cargar()
  }

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      <PageHeader
        title="Usuarios"
        subtitle="Gestión de cuentas y permisos"
        actions={
          <Button variant="primary" onClick={() => setModalNuevo(true)}>
            <Plus size={15} /> Nuevo usuario
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-14"><Spinner size={28} /></div>
      ) : usuarios.length === 0 ? (
        <EmptyState icon={Users} title="Sin usuarios" subtitle="Creá el primer usuario con el botón de arriba" />
      ) : (
        <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
          <Table className="min-w-[640px]">
            <Thead>
              <Tr>
                <Th>Nombre</Th>
                <Th>Email</Th>
                <Th>Rol</Th>
                <Th>Estado</Th>
                <Th>Acciones</Th>
              </Tr>
            </Thead>
            <Tbody>
              {usuarios.map(u => (
                <Tr key={u.id}>
                  <Td className="font-medium">{u.nombre || '—'}</Td>
                  <Td className="text-xs" style={{ color: colors.textSecondary }}>{u.email}</Td>
                  <Td><Badge variant={rolVariant(u.rol)} className="capitalize">{u.rol}</Badge></Td>
                  <Td>
                    <Badge variant={u.activo ? 'success' : 'neutral'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1.5 flex-wrap">
                      <Button variant="ghost" size="sm" onClick={() => abrirEdicion(u)}>Editar</Button>
                      {u.activo ? (
                        <Button variant="ghost" size="sm" onClick={() => setModalEliminar(u)}
                          style={{ borderColor: colors.danger, color: colors.danger, border: `1px solid ${colors.danger}` }}>
                          <Trash2 size={12} /> Eliminar
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => reactivarUsuario(u)}
                          style={{ borderColor: colors.success, color: colors.success, border: `1px solid ${colors.success}` }}>
                          <Check size={12} /> Reactivar
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {/* Nuevo usuario */}
      <Modal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        title="Nuevo usuario"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalNuevo(false)} disabled={savingNuevo} className="flex-1">
              Cancelar
            </Button>
            <Button variant="primary" onClick={crearUsuario} loading={savingNuevo} className="flex-1">
              {savingNuevo ? 'Creando…' : 'Crear usuario'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Email *" type="email" value={formNuevo.email}
            onChange={e => setFormNuevo(f => ({ ...f, email: e.target.value }))} placeholder="usuario@delparque.com" />
          <Input label="Nombre *" type="text" value={formNuevo.nombre}
            onChange={e => setFormNuevo(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre y apellido" />
          <Select label="Rol *" value={formNuevo.rol} onChange={e => setFormNuevo(f => ({ ...f, rol: e.target.value }))}>
            {ROLES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
          </Select>
          <p className="text-xs" style={{ color: colors.textMuted }}>
            Se genera una contraseña temporal que vas a poder copiar y compartir con el usuario.
          </p>
        </div>
      </Modal>

      {/* Credenciales generadas */}
      <Modal
        open={!!credenciales}
        onClose={() => setCredenciales(null)}
        title="Usuario creado"
        maxWidth="max-w-sm"
        footer={<Button variant="primary" onClick={() => setCredenciales(null)} className="flex-1">Listo</Button>}
      >
        {credenciales && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 px-3 py-3" style={{ backgroundColor: colors.warningBg, border: `1px solid ${colors.warning}40`, borderRadius: radius.md }}>
              <KeyRound size={16} style={{ color: colors.warning }} className="flex-shrink-0 mt-0.5" />
              <p className="text-sm" style={{ color: colors.textPrimary }}>
                Compartí estas credenciales con el usuario. La contraseña no se va a volver a mostrar.
              </p>
            </div>
            <div className="px-4 py-3 space-y-1" style={{ backgroundColor: colors.bg, borderRadius: radius.md }}>
              <p className="text-xs" style={{ color: colors.textMuted }}>Email</p>
              <p className="text-sm font-mono font-semibold" style={{ color: colors.textPrimary }}>{credenciales.email}</p>
            </div>
            <div className="px-4 py-3 space-y-1" style={{ backgroundColor: colors.bg, borderRadius: radius.md }}>
              <p className="text-xs" style={{ color: colors.textMuted }}>Contraseña temporal</p>
              <p className="text-sm font-mono font-semibold" style={{ color: colors.brand }}>{credenciales.password}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmar eliminación */}
      <Modal
        open={!!modalEliminar}
        onClose={() => !eliminandoUser && setModalEliminar(null)}
        title="Eliminar usuario"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalEliminar(null)} disabled={eliminandoUser} className="flex-1">
              Cancelar
            </Button>
            <Button variant="danger" onClick={eliminarUsuario} loading={eliminandoUser} className="flex-1">
              {eliminandoUser ? 'Eliminando…' : 'Sí, eliminar'}
            </Button>
          </>
        }
      >
        {modalEliminar && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-sm font-semibold" style={{ color: colors.danger }}>⚠️ Esta acción no se puede deshacer</p>
              <p className="text-sm mt-1" style={{ color: colors.textPrimary }}>
                ¿Eliminar a <strong>{modalEliminar.nombre}</strong> ({modalEliminar.email})?
              </p>
              <p className="text-xs mt-1.5" style={{ color: colors.textMuted }}>
                El usuario perderá acceso inmediatamente. Los datos históricos se conservan.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Editar usuario */}
      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title="Editar usuario"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditUser(null)} disabled={savingEdit} className="flex-1">
              Cancelar
            </Button>
            <Button variant="primary" onClick={guardarEdicion} loading={savingEdit} className="flex-1">
              {savingEdit ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        }
      >
        {editUser && (
          <div className="space-y-3">
            <Input label="Nombre" type="text" value={editUser.nombre || ''}
              onChange={e => setEditUser(u => ({ ...u, nombre: e.target.value }))} />
            <p className="text-xs" style={{ color: colors.textMuted }}>{editUser.email}</p>
            <Select label="Rol" value={editUser.rol} onChange={e => cambiarRolEdicion(e.target.value)}>
              {ROLES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
            </Select>
            <div>
              <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Permisos</label>
              <div className="grid grid-cols-2 gap-2">
                {MODULOS.map(m => (
                  <label key={m.key} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer"
                    style={{ backgroundColor: colors.bg, borderRadius: radius.md, border: `1px solid ${colors.border}`, color: colors.textSecondary }}>
                    <input type="checkbox" checked={!!editUser.permisos[m.key]} onChange={() => toggleModuloEdicion(m.key)} />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
