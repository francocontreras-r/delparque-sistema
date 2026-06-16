import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useUser } from '../context/UserContext'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Badge from '../components/ui/Badge'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import { Warehouse, ArrowUp, ArrowDown, Search, Printer, FileDown, DollarSign, ClipboardCheck, AlertTriangle } from 'lucide-react'
const logoUrl = '/logo_delparque.png'

const TABS         = ['Movimientos', 'Stock', 'Trazabilidad', 'Informes', 'Control Semanal']
const DESTINOS     = ['Bases', 'Sabores', 'Postres', 'Impulsivos', 'Escocés', 'Bombones']
const PRESENTACIONES = ['Balde', 'Bolsa', 'Lata', 'Caja', 'Botella', 'Bidón', 'Pomo']
const UNIDADES     = ['u', 'kg', 'L']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const SEM = { verde: colors.success, amarillo: colors.warning, rojo: colors.danger, gris: colors.textMuted }

const textareaClass = 'w-full rounded-lg border border-[#d1d5db] text-sm text-[#111827] placeholder:text-[#9ca3af] bg-white outline-none transition-colors duration-150 px-3 py-2 resize-none focus:ring-2 focus:ring-[#D4521A]/30 focus:border-[#D4521A]'

function semaforo(actual, minimo, maximo) {
  const a = Number(actual) || 0
  const min = Number(minimo) || 0
  const max = Number(maximo) || 0
  if (a < min) return 'rojo'
  if (max > 0) return a >= max ? 'verde' : 'amarillo'
  return min > 0 ? 'amarillo' : 'gris'
}

function pctNivel(actual, minimo, maximo) {
  const a = Number(actual) || 0
  const min = Number(minimo) || 0
  const max = Number(maximo) || 0
  if (max > 0) return Math.min(100, (a / max) * 100)
  if (min > 0) return Math.min(100, (a / (min * 1.5)) * 100)
  return 50
}

function pesos(n) { return Math.round(n || 0).toLocaleString('es-AR') }

function fmtFecha(fecha) {
  if (!fecha) return '—'
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y}`
}

function fmtHora(created_at) {
  if (!created_at) return null
  return new Date(created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs'
}

function fmtFechaHora(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Discrepancia > 5% entre lo que dice el sistema y el conteo físico real.
function esDiscrepancia(stockSistema, stockFisico) {
  if (!stockSistema) return (stockFisico || 0) !== 0
  return Math.abs(((stockFisico || 0) - stockSistema) / stockSistema) > 0.05
}

// Clave de semana (año-número de semana) para comparar conteos semana a semana.
function semanaKey(fecha) {
  const d = new Date(fecha)
  const inicioAnio = new Date(d.getFullYear(), 0, 1)
  const dias = Math.floor((d - inicioAnio) / 86400000) + 1
  const semana = Math.ceil((dias + inicioAnio.getDay()) / 7)
  return `${d.getFullYear()}-S${String(semana).padStart(2, '0')}`
}

function toDataURL(url) {
  return fetch(url)
    .then(res => res.blob())
    .then(blob => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    }))
}

function ModalMovimiento({ tipo, onClose, onSubmit, saving, insumos, operarios, onCrearInsumo, creandoInsumo }) {
  const esIngreso = tipo === 'ingreso'
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    producto_nombre: '', marca: '', presentacion: 'Balde',
    cantidad: '', unidad: 'u', lote: '', fecha_vencimiento: '',
    proveedor: '', controlo: '', destino: 'Bases', operario_recibe: '',
    observaciones: '',
  })
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const nombreProducto = form.producto_nombre.trim()
  const existeInsumo = insumos.some(i => (i.nombre || '').trim().toLowerCase() === nombreProducto.toLowerCase())
  const mostrarAgregarInsumo = esIngreso && nombreProducto !== '' && !existeInsumo

  async function agregarInsumo() {
    await onCrearInsumo(nombreProducto)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={esIngreso ? '↑ Registrar Ingreso' : '↓ Registrar Egreso'}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1">
            Cancelar
          </Button>
          <Button variant={esIngreso ? 'success' : 'danger'} onClick={() => onSubmit(form)} loading={saving} className="flex-1">
            {saving ? 'Guardando…' : 'Registrar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Fecha *" type="date" value={form.fecha} onChange={e => upd('fecha', e.target.value)} />
        {esIngreso ? (
          <div>
            <Input label="Producto *" type="text" list="insumos-datalist" value={form.producto_nombre}
              onChange={e => upd('producto_nombre', e.target.value)}
              placeholder="Buscar o escribir un producto nuevo…" />
            <datalist id="insumos-datalist">
              {insumos.map(i => <option key={i.id} value={i.nombre} />)}
            </datalist>
            {mostrarAgregarInsumo && (
              <div className="flex items-center justify-between gap-2 mt-1.5 px-2.5 py-2 text-xs" style={{ backgroundColor: colors.warningBg, border: `1px solid ${colors.warning}40`, borderRadius: radius.md, color: colors.warning }}>
                <span>"{nombreProducto}" no está en la lista de insumos.</span>
                <Button variant="ghost" size="sm" loading={creandoInsumo} onClick={agregarInsumo}>
                  + Agregar como nuevo insumo
                </Button>
              </div>
            )}
          </div>
        ) : (
          <Select label="Producto *" value={form.producto_nombre} onChange={e => upd('producto_nombre', e.target.value)}>
            <option value="">— Seleccionar insumo —</option>
            {insumos.map(i => <option key={i.id} value={i.nombre}>{i.nombre}</option>)}
          </Select>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Marca *" type="text" value={form.marca} onChange={e => upd('marca', e.target.value)} />
          <Select label="Presentación *" value={form.presentacion} onChange={e => upd('presentacion', e.target.value)}>
            {PRESENTACIONES.map(p => <option key={p}>{p}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Cantidad *" type="number" min="0.01" step="0.01" value={form.cantidad} onChange={e => upd('cantidad', e.target.value)} />
          <Select label="Unidad *" value={form.unidad} onChange={e => upd('unidad', e.target.value)}>
            {UNIDADES.map(u => <option key={u}>{u}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="N° de Lote *" type="text" value={form.lote} onChange={e => upd('lote', e.target.value)} />
          <Input label="Vencimiento *" type="date" value={form.fecha_vencimiento} onChange={e => upd('fecha_vencimiento', e.target.value)} />
        </div>
        <Select label="Controló *" value={form.controlo} onChange={e => upd('controlo', e.target.value)}>
          <option value="">— Seleccionar —</option>
          {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
        </Select>
        {esIngreso ? (
          <Input label="Proveedor *" type="text" value={form.proveedor} onChange={e => upd('proveedor', e.target.value)} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Select label="Destino *" value={form.destino} onChange={e => upd('destino', e.target.value)}>
              {DESTINOS.map(d => <option key={d}>{d}</option>)}
            </Select>
            <Select label="Retira / Solicita *" value={form.operario_recibe} onChange={e => upd('operario_recibe', e.target.value)}>
              <option value="">— Seleccionar —</option>
              {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
            </Select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-[#374151] mb-1.5">Observaciones</label>
          <textarea value={form.observaciones} onChange={e => upd('observaciones', e.target.value)}
            rows={2} className={textareaClass} />
        </div>
      </div>
    </Modal>
  )
}

function ModalEditarInsumo({ insumo, onClose, onSubmit, saving, isAdmin }) {
  const [form, setForm] = useState({
    stock_actual: insumo.stock_actual ?? '',
    stock_minimo: insumo.stock_minimo ?? '',
    stock_maximo: insumo.stock_maximo ?? '',
    costo_unitario: insumo.costo_unitario ?? '',
  })
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal
      open
      onClose={onClose}
      title={insumo.nombre}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1">
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => onSubmit(form)} loading={saving} className="flex-1">
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Nombre" value={insumo.nombre} disabled />
        <Input label={`Stock actual (${insumo.unidad || 'u'})`} type="number" min="0" step="0.01"
          value={form.stock_actual} onChange={e => upd('stock_actual', e.target.value)} />
        <Input label={`Stock mínimo (${insumo.unidad || 'u'})`} type="number" min="0" step="0.01"
          value={form.stock_minimo} onChange={e => upd('stock_minimo', e.target.value)} />
        <Input label={`Stock máximo (${insumo.unidad || 'u'})`} type="number" min="0" step="0.01"
          value={form.stock_maximo} onChange={e => upd('stock_maximo', e.target.value)} />
        {isAdmin && (
          <Input label="Costo unitario ($)" type="number" min="0" step="0.01"
            value={form.costo_unitario} onChange={e => upd('costo_unitario', e.target.value)} />
        )}
      </div>
    </Modal>
  )
}

function ModalConteo({ tipo, items, onClose, onSubmit, saving }) {
  const [valores, setValores] = useState(() => Object.fromEntries(items.map(it => [it.nombre, String(it.stockSistema ?? 0)])))
  const upd = (nombre, v) => setValores(s => ({ ...s, [nombre]: v }))

  function guardar() {
    const filas = items.map(it => {
      const stockFisico = parseFloat(valores[it.nombre])
      return {
        producto_nombre: it.nombre,
        stock_sistema: it.stockSistema || 0,
        stock_fisico: Number.isFinite(stockFisico) ? stockFisico : (it.stockSistema || 0),
        unidad: it.unidad,
      }
    })
    onSubmit(filas)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={tipo === 'camara' ? 'Registrar conteo — Cámaras' : 'Registrar conteo semanal — Depósito'}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1">Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={saving} className="flex-1">
            {saving ? 'Guardando…' : 'Guardar conteo'}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-xs mb-2" style={{ color: colors.textMuted }}>
          Ingresá la cantidad física real de cada producto. Por defecto se muestra el stock del sistema.
        </p>
        {items.map(it => (
          <div key={it.nombre} className="flex items-center gap-2">
            <span className="flex-1 text-sm truncate" style={{ color: colors.textPrimary }}>{it.nombre}</span>
            <span className="text-xs w-20 text-right flex-shrink-0" style={{ color: colors.textMuted }}>
              {(it.stockSistema || 0).toFixed(2)} {it.unidad}
            </span>
            <input
              type="number" step="0.01" value={valores[it.nombre]}
              onChange={e => upd(it.nombre, e.target.value)}
              className="w-24 rounded-lg border border-[#d1d5db] text-sm text-right px-2 py-1.5 outline-none focus:ring-2 focus:ring-[#D4521A]/30 focus:border-[#D4521A]"
            />
          </div>
        ))}
      </div>
    </Modal>
  )
}

export default function Deposito() {
  const [tab, setTab]             = useState('Movimientos')
  const [movimientos, setMovimientos] = useState([])
  const [insumos, setInsumos]     = useState([])
  const [operarios, setOperarios] = useState([])
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)
  const [modal, setModal]         = useState(null)
  const [saving, setSaving]       = useState(false)
  const [filtroTipo, setFiltroTipo]     = useState('Todos')
  const [busqueda, setBusqueda]         = useState('')
  const [filtroMes, setFiltroMes]       = useState(0)
  const [filtroAnio, setFiltroAnio]     = useState(0)
  const [filtroDestino, setFiltroDestino] = useState('Todos')
  const [informeVista, setInformeVista] = useState('proveedores')
  const [informeMes, setInformeMes]     = useState(0)
  const [informeAnio, setInformeAnio]   = useState(0)
  const [editInsumo, setEditInsumo]     = useState(null)
  const [savingInsumo, setSavingInsumo] = useState(false)
  const [creandoInsumo, setCreandoInsumo] = useState(false)
  const [stockCamaras, setStockCamaras] = useState([])
  const [conteos, setConteos]           = useState([])
  const [modalConteo, setModalConteo]   = useState(null)
  const [savingConteo, setSavingConteo] = useState(false)

  const { isAdmin, profile } = useUser()
  const showVal = isAdmin

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [{ data: m }, { data: i }, { data: o }, { data: sc }, { data: ct }] = await Promise.all([
      supabase.from('movimientos_deposito').select('*').order('id', { ascending: false }).limit(300),
      supabase.from('insumos').select('*').order('nombre'),
      supabase.from('operarios').select('*').order('nombre'),
      supabase.from('stock_camaras').select('*').order('nombre'),
      supabase.from('conteos_stock').select('*').order('fecha', { ascending: false }).limit(500),
    ])
    setMovimientos(m || [])
    setInsumos(i || [])
    setOperarios(o || [])
    setStockCamaras(sc || [])
    setConteos(ct || [])
    setLoading(false)
  }

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const operariosUnicos = useMemo(() => {
    const vistos = new Set()
    return operarios.filter(o => {
      if (vistos.has(o.nombre)) return false
      vistos.add(o.nombre)
      return true
    })
  }, [operarios])

  const CAMPOS_COMUNES = [
    ['fecha', 'la fecha'],
    ['producto_nombre', 'el producto'],
    ['marca', 'la marca'],
    ['presentacion', 'la presentación'],
    ['cantidad', 'la cantidad'],
    ['unidad', 'la unidad'],
    ['lote', 'el N° de lote'],
    ['fecha_vencimiento', 'la fecha de vencimiento'],
    ['controlo', 'quién controló'],
  ]
  const CAMPOS_INGRESO = [...CAMPOS_COMUNES, ['proveedor', 'el proveedor']]
  const CAMPOS_EGRESO = [...CAMPOS_COMUNES, ['destino', 'el destino'], ['operario_recibe', 'quién retira/solicita']]

  async function handleSubmit(form) {
    const campos = modal === 'ingreso' ? CAMPOS_INGRESO : CAMPOS_EGRESO
    for (const [campo, etiqueta] of campos) {
      if (!form[campo] || String(form[campo]).trim() === '') {
        toast2(`Falta completar: ${etiqueta}`, 'error'); return
      }
    }
    if (!(parseFloat(form.cantidad) > 0)) {
      toast2('La cantidad debe ser mayor a 0', 'error'); return
    }
    setSaving(true)
    const payload = {
      tipo: modal,
      fecha: form.fecha,
      producto_nombre: form.producto_nombre,
      marca: form.marca,
      presentacion: form.presentacion,
      cantidad: parseFloat(form.cantidad),
      unidad: form.unidad,
      lote: form.lote,
      fecha_vencimiento: form.fecha_vencimiento,
      proveedor: modal === 'ingreso' ? form.proveedor : null,
      controlo: form.controlo,
      destino: modal === 'egreso' ? form.destino : null,
      operario_recibe: modal === 'egreso' ? form.operario_recibe : null,
      observaciones: form.observaciones || null,
    }
    const { error } = await supabase.from('movimientos_deposito').insert(payload)
    setSaving(false)
    if (error) { toast2(error.message, 'error'); return }
    toast2(modal === 'ingreso' ? 'Ingreso registrado' : 'Egreso registrado')
    setModal(null)
    cargar()
  }

  async function crearInsumoNuevo(nombre) {
    setCreandoInsumo(true)
    const { data, error } = await supabase.from('insumos')
      .insert({ nombre, categoria: 'NUEVO', unidad: 'kg', stock_actual: 0 })
      .select()
      .single()
    setCreandoInsumo(false)
    if (error) { toast2(error.message, 'error'); return }
    setInsumos(prev => [...prev, data].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')))
    toast2(`Insumo "${nombre}" agregado`)
  }

  async function guardarInsumo(form) {
    if (!editInsumo) return
    const payload = {
      stock_actual: parseFloat(form.stock_actual) || 0,
      stock_minimo: parseFloat(form.stock_minimo) || 0,
      stock_maximo: parseFloat(form.stock_maximo) || 0,
    }
    if (isAdmin) payload.costo_unitario = parseFloat(form.costo_unitario) || 0
    setSavingInsumo(true)
    const { error } = await supabase.from('insumos').update(payload).eq('id', editInsumo.id)
    setSavingInsumo(false)
    if (error) { toast2(error.message, 'error'); return }
    setInsumos(prev => prev.map(i => i.id === editInsumo.id ? { ...i, ...payload } : i))
    toast2('Insumo actualizado')
    setEditInsumo(null)
  }

  const movsFiltrados = useMemo(() => (
    filtroTipo === 'Todos' ? movimientos : movimientos.filter(m => m.tipo === filtroTipo)
  ), [movimientos, filtroTipo])

  const insumosFiltrados = useMemo(() => (
    busqueda ? insumos.filter(i => i.nombre?.toLowerCase().includes(busqueda.toLowerCase())) : insumos
  ), [insumos, busqueda])

  const porCategoria = useMemo(() => {
    const m = {}
    insumosFiltrados.forEach(i => {
      const c = i.categoria || 'General'
      if (!m[c]) m[c] = []
      m[c].push(i)
    })
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]))
  }, [insumosFiltrados])

  const valorTotalDeposito = useMemo(() => (
    insumos.reduce((a, i) => a + (i.stock_actual || 0) * (i.costo_unitario || 0), 0)
  ), [insumos])

  // Último conteo registrado por producto (los conteos vienen ordenados por fecha desc).
  const ultimosConteos = useMemo(() => {
    const m = {}
    conteos.forEach(c => {
      const key = `${c.tipo}::${(c.producto_nombre || '').trim().toLowerCase()}`
      if (!m[key]) m[key] = c
    })
    return m
  }, [conteos])

  // Comparación semana a semana: suma de diferencias absolutas por tipo y semana.
  const comparacionSemanal = useMemo(() => {
    const porTipoSemana = { camara: {}, deposito: {} }
    conteos.forEach(c => {
      if (!porTipoSemana[c.tipo]) return
      const key = semanaKey(c.fecha)
      porTipoSemana[c.tipo][key] = (porTipoSemana[c.tipo][key] || 0) + Math.abs(c.diferencia || 0)
    })
    const resultado = {}
    for (const tipo of ['camara', 'deposito']) {
      const semanas = Object.entries(porTipoSemana[tipo]).sort((a, b) => b[0].localeCompare(a[0]))
      resultado[tipo] = { actual: semanas[0] || null, anterior: semanas[1] || null }
    }
    return resultado
  }, [conteos])

  async function guardarConteo(tipo, filas) {
    setSavingConteo(true)
    const responsable = profile?.nombre || 'Sistema'
    const payload = filas.map(f => ({
      tipo,
      producto_nombre: f.producto_nombre,
      stock_sistema: f.stock_sistema,
      stock_fisico: f.stock_fisico,
      diferencia: f.stock_fisico - f.stock_sistema,
      responsable,
    }))
    const { error } = await supabase.from('conteos_stock').insert(payload)
    setSavingConteo(false)
    if (error) { toast2(error.message, 'error'); return }
    const discrepancias = filas.filter(f => esDiscrepancia(f.stock_sistema, f.stock_fisico))
    if (discrepancias.length > 0) {
      toast2(`Conteo guardado · ⚠️ ${discrepancias.length} producto${discrepancias.length === 1 ? '' : 's'} con diferencia mayor al 5%`, 'error')
    } else {
      toast2('Conteo guardado correctamente')
    }
    setModalConteo(null)
    cargar()
  }

  const aniosDisponibles = useMemo(() => {
    const set = new Set(movimientos.map(m => m.fecha ? Number(m.fecha.split('-')[0]) : null).filter(Boolean))
    set.add(new Date().getFullYear())
    return Array.from(set).sort((a, b) => b - a)
  }, [movimientos])

  function dentroDePeriodo(fecha, mes, anio) {
    if (!fecha) return mes === 0 && anio === 0
    const [a, m] = fecha.split('-').map(Number)
    if (anio !== 0 && a !== anio) return false
    if (mes !== 0 && m !== mes) return false
    return true
  }

  const egresos = useMemo(() => {
    return movimientos.filter(m => {
      if (m.tipo !== 'egreso') return false
      if (filtroDestino !== 'Todos' && m.destino !== filtroDestino) return false
      if (!dentroDePeriodo(m.fecha, filtroMes, filtroAnio)) return false
      return true
    })
  }, [movimientos, filtroDestino, filtroMes, filtroAnio])

  const movsInforme = useMemo(() => (
    movimientos.filter(m => dentroDePeriodo(m.fecha, informeMes, informeAnio))
  ), [movimientos, informeMes, informeAnio])

  const comprasPorProveedor = useMemo(() => {
    const grupos = {}
    movsInforme.filter(m => m.tipo === 'ingreso').forEach(m => {
      const prov = m.proveedor || 'Sin proveedor'
      if (!grupos[prov]) grupos[prov] = { proveedor: prov, items: [], total: 0 }
      grupos[prov].items.push(m)
      grupos[prov].total += Number(m.cantidad) || 0
    })
    return Object.values(grupos).sort((a, b) => a.proveedor.localeCompare(b.proveedor))
  }, [movsInforme])

  const destinoMercaderia = useMemo(() => {
    const grupos = {}
    movsInforme.filter(m => m.tipo === 'egreso').forEach(m => {
      const dest = m.destino || 'Sin destino'
      if (!grupos[dest]) grupos[dest] = { destino: dest, items: [], total: 0 }
      grupos[dest].items.push(m)
      grupos[dest].total += Number(m.cantidad) || 0
    })
    return Object.values(grupos).sort((a, b) => a.destino.localeCompare(b.destino))
  }, [movsInforme])

  const entregasPorOperario = useMemo(() => {
    const grupos = {}
    movsInforme.filter(m => m.tipo === 'egreso').forEach(m => {
      const op = m.operario_recibe || 'Sin asignar'
      if (!grupos[op]) grupos[op] = { operario: op, items: [], total: 0 }
      grupos[op].items.push(m)
      grupos[op].total += Number(m.cantidad) || 0
    })
    return Object.values(grupos).sort((a, b) => b.total - a.total)
  }, [movsInforme])

  function imprimirTrazabilidad() {
    const w = window.open('', '_blank')
    const filas = egresos.map(e => `
      <tr>
        <td>${fmtFecha(e.fecha)}${e.created_at ? ' ' + fmtHora(e.created_at) : ''}</td><td>${e.producto_nombre || ''}</td><td>${e.marca || ''}</td>
        <td>${e.presentacion || ''}</td><td style="text-align:right">${e.cantidad || ''}</td>
        <td>${e.lote || ''}</td><td>${e.fecha_vencimiento || ''}</td>
        <td>${e.controlo || ''}</td><td>${e.observaciones || ''}</td>
        <td>${e.destino || ''}</td>
      </tr>`).join('')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Trazabilidad — Del Parque</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:10px;padding:20px}
      .header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:16px}
      .logo-img{height:32px;display:block}
      .sub{font-size:10px;color:#666}
      table{width:100%;border-collapse:collapse}
      th{background:#f3f4f6;font-size:8px;font-weight:700;text-transform:uppercase;padding:5px 6px;text-align:left;border-bottom:2px solid ${colors.brand}}
      td{padding:4px 6px;border-bottom:1px solid #f3f4f6;font-size:9px}
      .firmas{display:flex;gap:48px;margin-top:48px}
      .firma{flex:1;border-top:1px solid #374151;padding-top:6px;font-size:9px;color:#6b7280}
      @media print{body{padding:0}}
    </style></head><body>
    <div class="header">
      <img src="${logoUrl}" class="logo-img" alt="Del Parque" />
      <div class="sub">Planilla de Trazabilidad — Egreso de Materiales · ${new Date().toLocaleDateString('es-AR')}</div>
    </div>
    <table>
      <thead><tr>
        <th>Fecha</th><th>Producto</th><th>Marca</th><th>Presentación</th><th>Cant.</th>
        <th>Lote</th><th>Venc.</th><th>Controló</th><th>Observ.</th><th>Destino</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="firmas">
      <div class="firma">Responsable de Depósito</div>
      <div class="firma">Jefe de Producción</div>
      <div class="firma">Gerencia / Calidad</div>
    </div>
    </body></html>`)
    w.document.close()
    w.onload = () => w.print()
  }

  async function exportarPDF() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()

    try {
      const logoData = await toDataURL(logoUrl)
      doc.addImage(logoData, 'PNG', 14, 10, 36, 13)
    } catch {
      // si no se puede cargar el logo, se continúa sin él
    }

    doc.setFontSize(11)
    doc.setTextColor(40, 40, 40)
    doc.text('Planilla de Trazabilidad — Egreso de Materiales', pageWidth - 14, 14, { align: 'right' })
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text(`Emitido: ${new Date().toLocaleDateString('es-AR')}`, pageWidth - 14, 19, { align: 'right' })

    autoTable(doc, {
      startY: 28,
      head: [['Fecha', 'Producto', 'Marca', 'Presentación', 'Cant.', 'Lote', 'Venc.', 'Controló', 'Observ.', 'Destino']],
      body: egresos.map(e => [
        fmtFecha(e.fecha) + (e.created_at ? ' ' + fmtHora(e.created_at) : ''), e.producto_nombre || '', e.marca || '', e.presentacion || '',
        `${e.cantidad ?? ''} ${e.unidad || ''}`.trim(), e.lote || '', e.fecha_vencimiento || '',
        e.controlo || '', e.observaciones || '', e.destino || '',
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [212, 82, 26], textColor: 255 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    })

    let finalY = (doc.lastAutoTable?.finalY || 28) + 24
    if (finalY > doc.internal.pageSize.getHeight() - 10) finalY = doc.internal.pageSize.getHeight() - 10

    const firmas = [
      { label: 'Responsable de Depósito', x: 20 },
      { label: 'Jefe de Producción', x: pageWidth / 2 - 28 },
      { label: 'Gerencia / Calidad', x: pageWidth - 80 },
    ]
    doc.setFontSize(8)
    doc.setTextColor(80, 80, 80)
    firmas.forEach(f => {
      doc.line(f.x, finalY - 4, f.x + 60, finalY - 4)
      doc.text(f.label, f.x, finalY)
    })

    doc.save(`trazabilidad_delparque_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Depósito</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Control de materia prima</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'Movimientos' && (
            <>
              <Button variant="success" onClick={() => setModal('ingreso')}>
                <ArrowUp size={14} /> Ingreso
              </Button>
              <Button variant="danger" onClick={() => setModal('egreso')}>
                <ArrowDown size={14} /> Egreso
              </Button>
            </>
          )}
          {tab === 'Trazabilidad' && (
            <>
              <Button variant="secondary" onClick={imprimirTrazabilidad}>
                <Printer size={15} /> Imprimir A4
              </Button>
              <Button variant="secondary" onClick={exportarPDF}>
                <FileDown size={15} /> Exportar PDF
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border"
            style={{
              backgroundColor: tab === t ? colors.brand : 'transparent',
              borderColor: tab === t ? colors.brand : colors.border,
              color: tab === t ? 'white' : colors.textSecondary,
            }}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-14"><Spinner size={28} /></div>
      ) : (
        <>
          {tab === 'Movimientos' && (
            <div className="space-y-3">
              <div className="flex gap-1.5 flex-wrap">
                {['Todos', 'ingreso', 'egreso'].map(t => (
                  <button key={t} onClick={() => setFiltroTipo(t)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all duration-150 border"
                    style={{
                      backgroundColor: filtroTipo === t ? colors.brand : 'transparent',
                      borderColor: filtroTipo === t ? colors.brand : colors.border,
                      color: filtroTipo === t ? 'white' : colors.textSecondary,
                    }}>
                    {t === 'Todos' ? 'Todos' : t === 'ingreso' ? '↑ Ingresos' : '↓ Egresos'}
                  </button>
                ))}
              </div>
              {movsFiltrados.length === 0 ? (
                <EmptyState icon={Warehouse} title="Sin movimientos" subtitle="Registrá ingresos o egresos para comenzar" />
              ) : (
                <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <Table className="min-w-[560px]">
                    <Thead>
                      <Tr>
                        <Th>Tipo / Fecha</Th>
                        <Th>Producto</Th>
                        <Th>Marca · Lote</Th>
                        <Th>Cantidad</Th>
                        <Th>Destino / Proveedor</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {movsFiltrados.map(m => (
                        <Tr key={m.id}>
                          <Td>
                            <Badge variant={m.tipo === 'ingreso' ? 'success' : 'danger'}>
                              {m.tipo === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
                            </Badge>
                            <p className="text-[10px] mt-1" style={{ color: colors.textMuted }}>
                              {m.created_at
                                ? new Date(m.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' hs'
                                : fmtFecha(m.fecha) + ' 00:00 hs'}
                            </p>
                          </Td>
                          <Td className="font-medium">{m.producto_nombre}</Td>
                          <Td className="text-xs" style={{ color: colors.textMuted }}>{[m.marca, m.lote].filter(Boolean).join(' · ') || '—'}</Td>
                          <Td className="font-bold whitespace-nowrap">{m.cantidad} {m.unidad}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{m.destino || m.proveedor || '—'}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {tab === 'Stock' && (
            <div className="space-y-4">
              {showVal && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <KpiCard label="Valor total depósito" value={`$${pesos(valorTotalDeposito)}`} icon={DollarSign} color={colors.brand} />
                </div>
              )}
              <Input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar insumo…" icon={Search} />
              {insumos.length === 0 ? (
                <EmptyState icon={Warehouse} title="Sin insumos cargados" subtitle="Agrega insumos en la tabla 'insumos' de Supabase" />
              ) : porCategoria.map(([cat, items]) => (
                <div key={cat} className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <div className="px-4 py-2.5" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>{cat}</span>
                  </div>
                  <div>
                    {items.map((ins, idx) => {
                      const niv = semaforo(ins.stock_actual || 0, ins.stock_minimo || 0, ins.stock_maximo || 0)
                      const pct = pctNivel(ins.stock_actual || 0, ins.stock_minimo || 0, ins.stock_maximo || 0)
                      return (
                        <div key={ins.id} className="px-4 py-3 flex items-center gap-3"
                          onClick={isAdmin ? () => setEditInsumo(ins) : undefined}
                          style={{
                            borderBottom: idx === items.length - 1 ? 'none' : `1px solid ${colors.border}`,
                            cursor: isAdmin ? 'pointer' : 'default',
                          }}
                          onMouseEnter={isAdmin ? e => e.currentTarget.style.backgroundColor = colors.bg : undefined}
                          onMouseLeave={isAdmin ? e => e.currentTarget.style.backgroundColor = 'transparent' : undefined}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: colors.textPrimary }}>{ins.nombre}</p>
                            <p className="text-xs" style={{ color: colors.textMuted }}>{ins.stock_actual ?? '—'} {ins.unidad}</p>
                          </div>
                          <div className="w-20 flex flex-col gap-1">
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.bg }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: SEM[niv] }} />
                            </div>
                            <p className="text-[10px] text-right" style={{ color: colors.textMuted }}>mín {ins.stock_minimo ?? '—'} · máx {ins.stock_maximo ?? '—'}</p>
                          </div>
                          {showVal && (
                            <div className="text-right flex-shrink-0 w-24">
                              <p className="text-sm font-bold" style={{ color: colors.brand }}>
                                ${pesos((ins.stock_actual || 0) * (ins.costo_unitario || 0))}
                              </p>
                              <p className="text-[10px]" style={{ color: colors.textMuted }}>Valor total</p>
                            </div>
                          )}
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SEM[niv] }} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'Trazabilidad' && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap items-center">
                <div className="w-40">
                  <Select value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))}>
                    <option value={0}>Todos los meses</option>
                    {MESES.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
                  </Select>
                </div>
                <div className="w-28">
                  <Select value={filtroAnio} onChange={e => setFiltroAnio(Number(e.target.value))}>
                    <option value={0}>Todos</option>
                    {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                  </Select>
                </div>
                <div className="ml-auto w-44">
                  <Select value={filtroDestino} onChange={e => setFiltroDestino(e.target.value)}>
                    <option value="Todos">Todos los destinos</option>
                    {DESTINOS.map(d => <option key={d}>{d}</option>)}
                  </Select>
                </div>
              </div>
              {egresos.length === 0 ? (
                <EmptyState icon={Warehouse} title="Sin egresos en este período" />
              ) : (
                <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <Table className="min-w-[820px]">
                    <Thead>
                      <Tr>
                        <Th>Fecha</Th>
                        <Th>Producto</Th>
                        <Th>Marca</Th>
                        <Th>Present.</Th>
                        <Th>Cant.</Th>
                        <Th>Lote</Th>
                        <Th>Venc.</Th>
                        <Th>Controló</Th>
                        <Th>Observ.</Th>
                        <Th>Destino</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {egresos.map(e => (
                        <Tr key={e.id}>
                          <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>
                            {fmtFecha(e.fecha)}
                            {e.created_at && (
                              <p className="text-[10px]" style={{ color: colors.textMuted }}>{fmtHora(e.created_at)}</p>
                            )}
                          </Td>
                          <Td className="text-xs font-medium">{e.producto_nombre}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{e.marca || '—'}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{e.presentacion || '—'}</Td>
                          <Td className="text-xs font-bold text-right">{e.cantidad}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{e.lote || '—'}</Td>
                          <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{e.fecha_vencimiento || '—'}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{e.controlo || '—'}</Td>
                          <Td className="text-xs max-w-[100px] truncate" style={{ color: colors.textMuted }}>{e.observaciones || '—'}</Td>
                          <Td><Badge variant="info">{e.destino}</Badge></Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {tab === 'Informes' && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap items-center">
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { key: 'proveedores', label: 'Compras por proveedor' },
                    { key: 'destinos', label: 'Destino de mercadería' },
                    { key: 'operarios', label: 'Entregas por operario' },
                  ].map(v => (
                    <button key={v.key} onClick={() => setInformeVista(v.key)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border"
                      style={{
                        backgroundColor: informeVista === v.key ? colors.brand : 'transparent',
                        borderColor: informeVista === v.key ? colors.brand : colors.border,
                        color: informeVista === v.key ? 'white' : colors.textSecondary,
                      }}>
                      {v.label}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex gap-2">
                  <div className="w-40">
                    <Select value={informeMes} onChange={e => setInformeMes(Number(e.target.value))}>
                      <option value={0}>Todos los meses</option>
                      {MESES.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
                    </Select>
                  </div>
                  <div className="w-28">
                    <Select value={informeAnio} onChange={e => setInformeAnio(Number(e.target.value))}>
                      <option value={0}>Todos</option>
                      {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                    </Select>
                  </div>
                </div>
              </div>

              {informeVista === 'proveedores' && (
                comprasPorProveedor.length === 0 ? (
                  <EmptyState icon={Warehouse} title="Sin ingresos en este período" />
                ) : (
                  <div className="space-y-3">
                    {comprasPorProveedor.map(grupo => (
                      <div key={grupo.proveedor} className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                        <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>{grupo.proveedor}</span>
                          <Badge variant="success">{grupo.items.length} ingresos · Total: {grupo.total.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</Badge>
                        </div>
                        <Table>
                          <Thead>
                            <Tr><Th>Producto</Th><Th>Cantidad</Th><Th>Fecha</Th><Th>Lote</Th></Tr>
                          </Thead>
                          <Tbody>
                            {grupo.items.map(m => (
                              <Tr key={m.id}>
                                <Td className="font-medium">{m.producto_nombre}</Td>
                                <Td className="font-bold">{m.cantidad} {m.unidad}</Td>
                                <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{m.fecha}</Td>
                                <Td className="text-xs" style={{ color: colors.textSecondary }}>{m.lote || '—'}</Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </div>
                    ))}
                  </div>
                )
              )}

              {informeVista === 'destinos' && (
                destinoMercaderia.length === 0 ? (
                  <EmptyState icon={Warehouse} title="Sin egresos en este período" />
                ) : (
                  <div className="space-y-3">
                    {destinoMercaderia.map(grupo => (
                      <div key={grupo.destino} className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                        <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>{grupo.destino}</span>
                          <Badge variant="info">{grupo.items.length} egresos · Total: {grupo.total.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</Badge>
                        </div>
                        <Table>
                          <Thead>
                            <Tr><Th>Producto</Th><Th>Cantidad</Th><Th>Fecha</Th><Th>Recibió</Th></Tr>
                          </Thead>
                          <Tbody>
                            {grupo.items.map(m => (
                              <Tr key={m.id}>
                                <Td className="font-medium">{m.producto_nombre}</Td>
                                <Td className="font-bold">{m.cantidad} {m.unidad}</Td>
                                <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{m.fecha}</Td>
                                <Td className="text-xs" style={{ color: colors.textSecondary }}>{m.operario_recibe || '—'}</Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </div>
                    ))}
                  </div>
                )
              )}

              {informeVista === 'operarios' && (
                entregasPorOperario.length === 0 ? (
                  <EmptyState icon={Warehouse} title="Sin egresos en este período" />
                ) : (
                  <div className="space-y-3">
                    {entregasPorOperario.map((grupo, idx) => (
                      <div key={grupo.operario} className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                        <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                          <div className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white flex-shrink-0"
                              style={{ backgroundColor: idx === 0 ? colors.brand : colors.textMuted }}>
                              {idx + 1}
                            </span>
                            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>{grupo.operario}</span>
                          </div>
                          <Badge variant="warning">{grupo.items.length} retiros · Total: {grupo.total.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</Badge>
                        </div>
                        <Table>
                          <Thead>
                            <Tr><Th>Producto</Th><Th>Cantidad</Th><Th>Fecha</Th><Th>Destino</Th></Tr>
                          </Thead>
                          <Tbody>
                            {grupo.items.map(m => (
                              <Tr key={m.id}>
                                <Td className="font-medium">{m.producto_nombre}</Td>
                                <Td className="font-bold">{m.cantidad} {m.unidad}</Td>
                                <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{m.fecha}</Td>
                                <Td><Badge variant="info">{m.destino || '—'}</Badge></Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {tab === 'Control Semanal' && (
            <div className="space-y-5">
              {/* Comparación semanal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: 'camara', label: 'Cámaras' },
                  { key: 'deposito', label: 'Depósito' },
                ].map(({ key, label }) => {
                  const comp = comparacionSemanal[key]
                  const actual = comp.actual?.[1] || 0
                  const anterior = comp.anterior?.[1]
                  const mejora = anterior > 0 ? ((anterior - actual) / anterior) * 100 : null
                  return (
                    <div key={key} className="p-4" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                      <h3 className="text-sm font-semibold mb-2" style={{ color: colors.textPrimary }}>{label} — comparación semanal</h3>
                      <div className="flex gap-6">
                        <div>
                          <p className="text-xs" style={{ color: colors.textMuted }}>Diferencia esta semana</p>
                          <p className="text-xl font-bold" style={{ color: colors.textPrimary }}>{actual.toFixed(2)} {key === 'camara' ? 'kg' : 'u'}</p>
                        </div>
                        {anterior !== undefined && (
                          <div>
                            <p className="text-xs" style={{ color: colors.textMuted }}>Semana anterior</p>
                            <p className="text-xl font-bold" style={{ color: colors.textMuted }}>{anterior.toFixed(2)} {key === 'camara' ? 'kg' : 'u'}</p>
                          </div>
                        )}
                      </div>
                      {mejora !== null && (
                        <p className="text-xs mt-2 font-semibold" style={{ color: mejora >= 0 ? colors.success : colors.danger }}>
                          {mejora >= 0 ? `↓ Mejoró ${mejora.toFixed(0)}% vs. la semana anterior` : `↑ Empeoró ${Math.abs(mejora).toFixed(0)}% vs. la semana anterior`}
                        </p>
                      )}
                      {!comp.actual && (
                        <p className="text-xs mt-2" style={{ color: colors.textMuted }}>Todavía no hay conteos registrados</p>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Cámaras */}
              <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Cámaras</span>
                  <Button variant="secondary" size="sm" onClick={() => setModalConteo('camara')}>
                    <ClipboardCheck size={13} /> Registrar conteo
                  </Button>
                </div>
                {stockCamaras.length === 0 ? (
                  <EmptyState icon={Warehouse} title="Sin productos en cámaras" />
                ) : (
                  <Table className="min-w-[760px]">
                    <Thead>
                      <Tr>
                        <Th>Producto</Th>
                        <Th>Stock actual (kg)</Th>
                        <Th>Stock mínimo (kg)</Th>
                        <Th>Estado</Th>
                        <Th>Última actualización</Th>
                        <Th>Conteo físico</Th>
                        <Th>Diferencia</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {stockCamaras.map(c => {
                        const minimoKg = (c.stock_minimo_baldes || 0) * 7
                        const niv = semaforo(c.kg || 0, minimoKg, 0)
                        const conteo = ultimosConteos[`camara::${(c.nombre || '').trim().toLowerCase()}`]
                        const discrepancia = conteo && esDiscrepancia(conteo.stock_sistema, conteo.stock_fisico)
                        return (
                          <Tr key={c.id}>
                            <Td className="font-medium">{c.nombre}</Td>
                            <Td className="text-right">{(c.kg || 0).toFixed(1)}</Td>
                            <Td className="text-right" style={{ color: colors.textMuted }}>{minimoKg.toFixed(1)}</Td>
                            <Td><Badge variant={niv === 'rojo' ? 'danger' : niv === 'amarillo' ? 'warning' : 'success'}>{niv === 'rojo' ? 'Bajo' : niv === 'amarillo' ? 'Atención' : 'OK'}</Badge></Td>
                            <Td className="text-xs whitespace-nowrap" style={{ color: colors.textMuted }}>{fmtFechaHora(c.updated_at)}</Td>
                            <Td className="text-right">{conteo ? `${Number(conteo.stock_fisico).toFixed(1)} kg` : '—'}</Td>
                            <Td className="text-right font-semibold" style={{ color: discrepancia ? colors.danger : colors.textSecondary }}>
                              {conteo ? (
                                <span className="inline-flex items-center gap-1">
                                  {conteo.diferencia > 0 ? '+' : ''}{Number(conteo.diferencia).toFixed(2)} kg
                                  {discrepancia && <AlertTriangle size={12} />}
                                </span>
                              ) : '—'}
                            </Td>
                          </Tr>
                        )
                      })}
                    </Tbody>
                  </Table>
                )}
              </div>

              {/* Depósito */}
              <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Depósito</span>
                  <Button variant="secondary" size="sm" onClick={() => setModalConteo('deposito')}>
                    <ClipboardCheck size={13} /> Registrar conteo semanal
                  </Button>
                </div>
                {insumos.length === 0 ? (
                  <EmptyState icon={Warehouse} title="Sin insumos cargados" />
                ) : (
                  <Table className="min-w-[760px]">
                    <Thead>
                      <Tr>
                        <Th>Producto</Th>
                        <Th>Categoría</Th>
                        <Th>Stock sistema</Th>
                        <Th>Conteo físico</Th>
                        <Th>Diferencia</Th>
                        <Th>Estado</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {insumos.map(i => {
                        const conteo = ultimosConteos[`deposito::${(i.nombre || '').trim().toLowerCase()}`]
                        const discrepancia = conteo && esDiscrepancia(conteo.stock_sistema, conteo.stock_fisico)
                        return (
                          <Tr key={i.id}>
                            <Td className="font-medium">{i.nombre}</Td>
                            <Td className="text-xs" style={{ color: colors.textMuted }}>{i.categoria || '—'}</Td>
                            <Td className="text-right">{(i.stock_actual || 0).toFixed(2)} {i.unidad}</Td>
                            <Td className="text-right">{conteo ? `${Number(conteo.stock_fisico).toFixed(2)} ${i.unidad}` : '—'}</Td>
                            <Td className="text-right font-semibold" style={{ color: discrepancia ? colors.danger : colors.textSecondary }}>
                              {conteo ? `${conteo.diferencia > 0 ? '+' : ''}${Number(conteo.diferencia).toFixed(2)} ${i.unidad}` : '—'}
                            </Td>
                            <Td>
                              {!conteo
                                ? <Badge variant="neutral">Sin conteo</Badge>
                                : discrepancia
                                  ? <Badge variant="danger"><AlertTriangle size={11} className="inline -mt-0.5 mr-1" />Discrepancia &gt;5%</Badge>
                                  : <Badge variant="success">OK</Badge>}
                            </Td>
                          </Tr>
                        )
                      })}
                    </Tbody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {modal && (
        <ModalMovimiento
          tipo={modal}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
          saving={saving}
          insumos={insumos}
          operarios={operariosUnicos}
          onCrearInsumo={crearInsumoNuevo}
          creandoInsumo={creandoInsumo}
        />
      )}

      {editInsumo && (
        <ModalEditarInsumo
          insumo={editInsumo}
          onClose={() => setEditInsumo(null)}
          onSubmit={guardarInsumo}
          saving={savingInsumo}
          isAdmin={isAdmin}
        />
      )}

      {modalConteo && (
        <ModalConteo
          tipo={modalConteo}
          items={modalConteo === 'camara'
            ? stockCamaras.map(c => ({ nombre: c.nombre, stockSistema: c.kg || 0, unidad: 'kg' }))
            : insumos.map(i => ({ nombre: i.nombre, stockSistema: i.stock_actual || 0, unidad: i.unidad || 'kg' }))}
          onClose={() => setModalConteo(null)}
          onSubmit={filas => guardarConteo(modalConteo, filas)}
          saving={savingConteo}
        />
      )}
    </div>
  )
}
