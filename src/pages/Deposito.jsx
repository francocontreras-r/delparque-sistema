import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useUser } from '../context/UserContext'
import { deduplicarOperarios } from '../lib/operarios'
import { normalizarNombre } from '../lib/texto'
import { costearProduccion } from '../lib/costeoProduccion'
import { registrarCambioCosto } from '../lib/historialCostos'
import { registrarConteoStock, cargarConteosPeriodo, resumenSemanal, nuevoCiclo, cargarConteosCiclo, cargarCiclos } from '../lib/conteos'
import { generarComprobanteConteo } from '../lib/comprobanteConteo'
import { calcularPlanCompras, pendienteDeOrden } from '../lib/mrp'
import { POSTRES } from '../lib/postres'
import { clasificarVencimiento, esAlertaVencimiento, labelDias } from '../lib/vencimientos'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
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
import { Warehouse, ArrowUp, ArrowDown, Search, Printer, FileDown, DollarSign, ClipboardCheck, AlertTriangle, TrendingUp, BarChart2, ChevronRight, Plus, Trash2, Clock } from 'lucide-react'
const logoUrl = '/logo-byn.png'
import {
  getEstiloInforme, dibujarPortada, dibujarEncabezado, dibujarPie,
  dibujarKpi, dibujarKpiCard, dibujarSeccion, dibujarFirmas,
  PDF_CONTENT_Y, PDF_PIE_H, PDF_NEGRO, PDF_GRIS_OSC, PDF_BLANCO,
  PDF_SEM_NEG, PDF_SEM_CRIT, PDF_SEM_OK, LOGO_PDF,
} from '../lib/pdfEstilos'

const SURFACE = { backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }

const TABS         = ['Movimientos', 'Stock', 'Trazabilidad', 'Informes', 'Control Semanal', 'Plan de compras']
const DESTINOS     = ['Bases', 'Sabores', 'Postres', 'Impulsivos', 'Escocés', 'Bombones', 'Panadería', 'Uso interno', 'Venta', 'Otro']
const PRESENTACIONES = ['Balde', 'Bolsa', 'Lata', 'Caja', 'Botella', 'Bidón', 'Pomo', 'Pote', 'Sin Presentación']
const UNIDADES     = ['u', 'kg', 'L']

const CATS_MAT_PRIMAS = new Set(['LÁCTEOS', 'AZÚCARES', 'CHOCOLATES', 'PASTAS', 'FRUTAS', 'VARIEGATOS', 'OTROS', 'NUEVO', 'General'])
const CATS_FILTRO_BASE = ['TODOS', 'BOLSAS', 'CUCURUCHOS', 'LIMPIEZA', 'REVENTA', 'TERMICOS']
const TODAS_LAS_CATS = ['BOLSAS', 'CUCURUCHOS', 'LIMPIEZA', 'REVENTA', 'TERMICOS', 'LÁCTEOS', 'AZÚCARES', 'CHOCOLATES', 'PASTAS', 'FRUTAS', 'VARIEGATOS', 'OTROS']

function motivosPorCategoria(categoria) {
  if (categoria === 'REVENTA') return ['Venta', 'Muestra', 'Baja por daño', 'Ajuste de inventario']
  return ['Uso en producción', 'Venta', 'Merma', 'Vencimiento', 'Devolución', 'Ajuste de inventario', 'Baja']
}
const MOTIVOS_INGRESO_DEPOSITO = ['Compra a proveedor', 'Sobrante de producción', 'Devolución', 'Ajuste de inventario', 'Transferencia']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const SEM = { verde: colors.success, amarillo: colors.warning, rojo: colors.danger, gris: colors.textMuted }

const textareaClass = 'w-full rounded-lg border border-[#334155] text-sm text-[#F1F5F9] placeholder:text-[#64748B] bg-[#0F172A] outline-none transition-colors duration-150 px-3 py-2 resize-none focus:ring-2 focus:ring-[#D4521A]/25 focus:border-[#D4521A]'

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

// Usa created_at (o fecha como fallback) para mostrar fecha y hora sin malformatar.
function formatFechaMov(mov) {
  const ts = mov.created_at || mov.fecha
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs'
}

function formatFecha(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + ' hs'
}

function formatCantidad(m) {
  const cant = Number(m.cantidad) || 0
  const unidad = m.unidad || 'u'
  const pesoTotal = Number(m.peso_total) || 0
  if (pesoTotal > 0) return `${cant} u / ${pesoTotal.toFixed(1)} kg`
  if (unidad === 'kg') return `${cant} kg`
  if (unidad === 'L') return `${cant} L`
  return `${cant} u`
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

function ModalMovimiento({ tipo, onClose, onSubmit, saving, insumos, operarios, onCrearInsumo, creandoInsumo, movimientos, categorias = TODAS_LAS_CATS }) {
  const esIngreso = tipo === 'ingreso'
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    producto_nombre: '', marca: '', presentacion: 'Balde',
    cantidad: '', unidad: 'u', lote: '', fecha_vencimiento: '',
    proveedor: '', controlo: '', destino: 'Bases', operario_recibe: '',
    observaciones: '',
    peso_por_unidad: '',
    precio_unitario: '',
    nro_remito: '',
    motivo: '',
    categoria_nueva: 'OTROS',
  })
  const [showResumen, setShowResumen] = useState(false)
  const [showMarcaAC, setShowMarcaAC] = useState(false)
  const [localError, setLocalError] = useState('')
  const [proveedores, setProveedores] = useState([])
  const [mostrarNuevoProveedor, setMostrarNuevoProveedor] = useState(false)
  const [nuevoProveedorNombre, setNuevoProveedorNombre] = useState('')
  const [guardandoProveedor, setGuardandoProveedor] = useState(false)
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!esIngreso) return
    supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setProveedores(data || []))
  }, [esIngreso])

  async function handleGuardarNuevoProveedor() {
    const nombre = nuevoProveedorNombre.trim()
    if (!nombre) return
    setGuardandoProveedor(true)
    const { data, error } = await supabase.from('proveedores')
      .insert({ nombre, activo: true }).select('id, nombre').single()
    setGuardandoProveedor(false)
    if (!error && data) {
      setProveedores(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      upd('proveedor', data.nombre)
      setNuevoProveedorNombre('')
      setMostrarNuevoProveedor(false)
    }
  }

  function handleClose() {
    const dirty = form.producto_nombre.trim() !== '' || form.cantidad !== ''
    if (dirty && !window.confirm('¿Seguro que querés cancelar? Se perderán los datos cargados.')) return
    onClose()
  }

  const insumoSel = useMemo(() =>
    insumos.find(i => (i.nombre || '').trim().toLowerCase() === form.producto_nombre.trim().toLowerCase()),
    [form.producto_nombre, insumos]
  )

  // Pre-cargar peso_por_unidad y ajustar destino/motivo cuando cambia el producto seleccionado
  useEffect(() => {
    if (!insumoSel) return
    setForm(f => {
      const esMP = CATS_MAT_PRIMAS.has(insumoSel.categoria)
      return {
        ...f,
        peso_por_unidad: insumoSel.peso_por_unidad > 0 && !f.peso_por_unidad
          ? insumoSel.peso_por_unidad : f.peso_por_unidad,
        destino: !esIngreso
          ? (f.destino && f.destino !== 'N/A' ? f.destino : 'Bases')
          : f.destino,
        motivo: '',
      }
    })
  }, [insumoSel?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const catInsumo = insumoSel?.categoria || ''
  const esMatPrima = CATS_MAT_PRIMAS.has(catInsumo)
  const motivosDisponibles = motivosPorCategoria(catInsumo)

  const marcasSugeridas = useMemo(() => {
    if (!form.producto_nombre.trim()) return []
    const norm = form.producto_nombre.trim().toLowerCase()
    const set = new Set()
    ;(movimientos || []).forEach(m => {
      if ((m.producto_nombre || '').trim().toLowerCase() === norm && m.marca) set.add(m.marca)
    })
    const q = form.marca.trim().toLowerCase()
    return Array.from(set).filter(b => !q || b.toLowerCase().includes(q)).slice(0, 5)
  }, [form.producto_nombre, form.marca, movimientos])

  const cantidad = parseFloat(form.cantidad) || 0
  const pesoPorUnidad = parseFloat(form.peso_por_unidad) || 0
  const pesoTotal = form.unidad === 'u' && pesoPorUnidad > 0 ? cantidad * pesoPorUnidad : 0
  const precioUnitario = parseFloat(form.precio_unitario) || 0

  const nombreProducto = form.producto_nombre.trim()
  const existeInsumo = insumos.some(i => (i.nombre || '').trim().toLowerCase() === nombreProducto.toLowerCase())
  const mostrarAgregarInsumo = esIngreso && nombreProducto !== '' && !existeInsumo

  const stockInfo = insumoSel
    ? `Stock actual: ${insumoSel.stock_actual ?? 0} ${insumoSel.unidad || 'u'}${
        insumoSel.unidad === 'u' && (insumoSel.peso_por_unidad || 0) > 0
          ? ` / ${((insumoSel.stock_actual || 0) * insumoSel.peso_por_unidad).toFixed(1)} kg`
          : ''
      }`
    : null

  const precioAnterior = insumoSel?.costo_unitario > 0 ? insumoSel.costo_unitario : null

  function handleClickRegistrar() {
    if (!form.producto_nombre.trim()) { setLocalError('Falta seleccionar el producto'); return }
    if (!(parseFloat(form.cantidad) > 0)) { setLocalError('La cantidad debe ser mayor a 0'); return }
    if (!form.marca.trim()) { setLocalError('Falta la marca'); return }
    if (esIngreso && !form.motivo) { setLocalError('El motivo es obligatorio'); return }
    if (!esIngreso && !form.motivo) { setLocalError('Falta seleccionar el motivo'); return }
    if (!esIngreso && !form.destino) { setLocalError('El destino es obligatorio'); return }
    setLocalError('')
    setShowResumen(true)
  }

  const footerResumen = (
    <>
      <Button variant="secondary" onClick={() => setShowResumen(false)} disabled={saving} className="flex-1">
        ← Volver
      </Button>
      <Button variant={esIngreso ? 'success' : 'danger'}
        onClick={() => onSubmit({ ...form, _pesoTotal: pesoTotal })}
        loading={saving} className="flex-1">
        {saving ? 'Guardando…' : '✓ Confirmar registro'}
      </Button>
    </>
  )

  const footerForm = (
    <>
      <Button variant="secondary" onClick={handleClose} disabled={saving} className="flex-1">
        Cancelar
      </Button>
      <Button variant={esIngreso ? 'success' : 'danger'} onClick={handleClickRegistrar} className="flex-1">
        Revisar y registrar →
      </Button>
    </>
  )

  return (
    <Modal open onClose={handleClose}
      title={esIngreso ? '↑ Registrar Ingreso' : '↓ Registrar Egreso'}
      maxWidth="max-w-md"
      disableBackdropClose
      footer={showResumen ? footerResumen : footerForm}
    >
      {showResumen ? (
        /* ── PANTALLA DE RESUMEN ── */
        <div className="space-y-4">
          <p className="text-sm font-semibold" style={{ color: colors.textSecondary }}>
            Revisá el resumen antes de confirmar:
          </p>
          <div className="rounded-xl p-4 space-y-2.5" style={{ backgroundColor: 'rgba(212,82,26,0.1)', border: `1px solid ${colors.brand}40` }}>
            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
              {esIngreso ? '↑ Ingreso:' : '↓ Egreso:'} {form.cantidad} {form.presentacion.toLowerCase()}{parseFloat(form.cantidad) !== 1 ? 's' : ''} de <b>{form.producto_nombre}</b>
              {form.marca ? ` (${form.marca})` : ''}
            </p>
            {pesoTotal > 0 && (
              <p className="text-sm" style={{ color: colors.brand }}>
                Peso total: <b>{pesoTotal.toFixed(2)} kg</b>
                <span className="text-xs ml-1" style={{ color: colors.textMuted }}>({form.cantidad} × {pesoPorUnidad} kg/u)</span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: colors.textMuted }}>
              {form.lote && <p>Lote: <b>{form.lote}</b></p>}
              {form.fecha_vencimiento && <p>Vence: <b>{fmtFecha(form.fecha_vencimiento)}</b></p>}
              {esIngreso && form.proveedor && <p>Proveedor: <b>{form.proveedor}</b></p>}
              {esIngreso && form.nro_remito && <p>Remito N°: <b>{form.nro_remito}</b></p>}
              {!esIngreso && form.destino && form.destino !== 'N/A' && <p>Destino: <b>{form.destino}</b></p>}
              {!esIngreso && form.motivo && <p>Motivo: <b>{form.motivo}</b></p>}
              {form.controlo && <p>Controló: <b>{form.controlo}</b></p>}
            </div>
            {precioUnitario > 0 && (
              <p className="text-xs font-semibold pt-1" style={{ borderTop: `1px solid ${colors.brand}40`, color: colors.brand }}>
                Precio: ${pesos(precioUnitario)}/u
                {cantidad > 0 && ` = $${pesos(precioUnitario * cantidad)} total`}
              </p>
            )}
          </div>
          <p className="text-xs text-center" style={{ color: colors.textMuted }}>
            Al confirmar se registra el movimiento y se actualiza el stock.
          </p>
        </div>
      ) : (
        /* ── FORMULARIO ── */
        <div className="space-y-3">
          <Input label="Fecha *" type="date" value={form.fecha} onChange={e => upd('fecha', e.target.value)} />

          {/* Producto */}
          {esIngreso ? (
            <div>
              <Input label="Producto *" type="text" list="insumos-datalist" value={form.producto_nombre}
                onChange={e => { upd('producto_nombre', e.target.value); upd('peso_por_unidad', '') }}
                placeholder="Buscar o escribir un producto nuevo…" />
              <datalist id="insumos-datalist">
                {insumos.map(i => <option key={i.id} value={i.nombre} />)}
              </datalist>
              {stockInfo && (
                <p className="text-xs mt-1 font-medium" style={{ color: colors.success }}>{stockInfo}</p>
              )}
              {mostrarAgregarInsumo && (
                <div className="mt-1.5 p-2.5 space-y-2" style={{ backgroundColor: colors.warningBg, border: `1px solid ${colors.warning}40`, borderRadius: radius.md }}>
                  <p className="text-xs" style={{ color: colors.warning }}>"{nombreProducto}" no está en la lista. Elegí la categoría:</p>
                  <div className="flex items-center gap-2">
                    <select value={form.categoria_nueva} onChange={e => upd('categoria_nueva', e.target.value)}
                      className="flex-1 rounded-md border text-xs px-2 py-1.5 outline-none"
                      style={{ borderColor: colors.border, color: colors.textPrimary }}>
                      {categorias.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <Button variant="ghost" size="sm" loading={creandoInsumo}
                      onClick={() => onCrearInsumo(nombreProducto, form.categoria_nueva)}>
                      + Agregar insumo
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <Select label="Producto *" value={form.producto_nombre}
                onChange={e => { upd('producto_nombre', e.target.value); upd('peso_por_unidad', '') }}>
                <option value="">— Seleccionar insumo —</option>
                {insumos.map(i => <option key={i.id} value={i.nombre}>{i.nombre}</option>)}
              </Select>
              {stockInfo && (
                <p className="text-xs mt-1 font-medium" style={{ color: colors.success }}>{stockInfo}</p>
              )}
            </div>
          )}

          {/* Marca con autocomplete */}
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <Input label="Marca *" type="text" value={form.marca}
                onChange={e => { upd('marca', e.target.value); setShowMarcaAC(true) }}
                onFocus={() => setShowMarcaAC(true)}
                onBlur={() => setTimeout(() => setShowMarcaAC(false), 150)}
              />
              {showMarcaAC && marcasSugeridas.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-20 rounded-lg border shadow-lg overflow-hidden"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                  {marcasSugeridas.map(b => (
                    <button key={b} onMouseDown={() => { upd('marca', b); setShowMarcaAC(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[#334155] border-b last:border-0 transition-colors"
                      style={{ borderColor: colors.border, color: colors.textPrimary }}>
                      {b}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Select label="Presentación *" value={form.presentacion} onChange={e => upd('presentacion', e.target.value)}>
              {PRESENTACIONES.map(p => <option key={p}>{p}</option>)}
            </Select>
          </div>

          {/* Cantidad + Unidad */}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Cantidad *" type="number" min="0.01" step="0.01"
              value={form.cantidad} onChange={e => upd('cantidad', e.target.value)} />
            <Select label="Unidad *" value={form.unidad} onChange={e => upd('unidad', e.target.value)}>
              {UNIDADES.map(u => <option key={u}>{u}</option>)}
            </Select>
          </div>

          {/* Peso por unidad — solo cuando unidad='u' */}
          {form.unidad === 'u' && (
            <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)' }}>
              <Input label="Peso por unidad (kg) — opcional" type="number" min="0" step="0.001"
                value={form.peso_por_unidad}
                onChange={e => upd('peso_por_unidad', e.target.value)}
                placeholder="ej: 4.6"
              />
              {pesoTotal > 0 && (
                <p className="text-sm font-semibold" style={{ color: colors.info }}>
                  Peso total: {pesoTotal.toFixed(2)} kg
                  <span className="text-xs font-normal ml-1.5" style={{ color: colors.info }}>
                    ({form.cantidad} u × {pesoPorUnidad} kg)
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Lote + Vencimiento */}
          <div className="grid grid-cols-2 gap-3">
            <Input label="N° de Lote *" type="text" value={form.lote} onChange={e => upd('lote', e.target.value)} />
            <Input label="Vencimiento *" type="date" value={form.fecha_vencimiento} onChange={e => upd('fecha_vencimiento', e.target.value)} />
          </div>

          <Select label="Controló *" value={form.controlo} onChange={e => upd('controlo', e.target.value)}>
            <option value="">— Seleccionar —</option>
            {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
          </Select>

          {esIngreso ? (
            <div className="space-y-3">
              {!mostrarNuevoProveedor ? (
                <Select label="Proveedor *" value={form.proveedor} onChange={e => {
                  if (e.target.value === '__nuevo__') { setMostrarNuevoProveedor(true) }
                  else upd('proveedor', e.target.value)
                }}>
                  <option value="">— Seleccionar proveedor —</option>
                  {proveedores.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                  <option value="__nuevo__">＋ Agregar nuevo proveedor</option>
                </Select>
              ) : (
                <div className="space-y-2">
                  <Input label="Nombre del nuevo proveedor *" value={nuevoProveedorNombre}
                    onChange={e => setNuevoProveedorNombre(e.target.value)}
                    placeholder="Nombre del proveedor" />
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => { setMostrarNuevoProveedor(false); setNuevoProveedorNombre('') }}>
                      Cancelar
                    </Button>
                    <Button variant="primary" className="flex-1" onClick={handleGuardarNuevoProveedor} loading={guardandoProveedor} disabled={!nuevoProveedorNombre.trim()}>
                      Guardar proveedor
                    </Button>
                  </div>
                </div>
              )}
              <Select label="Tipo de ingreso *" value={form.motivo} onChange={e => upd('motivo', e.target.value)}>
                <option value="">— Seleccionar motivo —</option>
                {MOTIVOS_INGRESO_DEPOSITO.map(m => <option key={m} value={m}>{m}</option>)}
              </Select>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Motivo — siempre visible en egreso */}
              <Select label="Motivo *" value={form.motivo} onChange={e => upd('motivo', e.target.value)}>
                <option value="">— Seleccionar motivo —</option>
                {motivosDisponibles.map(m => <option key={m}>{m}</option>)}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Destino *" value={form.destino} onChange={e => upd('destino', e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {DESTINOS.map(d => <option key={d}>{d}</option>)}
                </Select>
                <Select label="Retira / Solicita *" value={form.operario_recibe} onChange={e => upd('operario_recibe', e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
                </Select>
              </div>
            </div>
          )}

          {/* Campos opcionales para ingreso */}
          {esIngreso && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input label="N° de remito" type="text" value={form.nro_remito}
                  onChange={e => upd('nro_remito', e.target.value)} placeholder="opcional" />
              </div>
              <div>
                <Input label="Precio unitario ($)" type="number" min="0" step="0.01"
                  value={form.precio_unitario}
                  onChange={e => upd('precio_unitario', e.target.value)} placeholder="opcional" />
                {precioAnterior != null && !form.precio_unitario && (
                  <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
                    Precio anterior: ${pesos(precioAnterior)}/u
                  </p>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Observaciones</label>
            <textarea value={form.observaciones} onChange={e => upd('observaciones', e.target.value)}
              rows={2} className={textareaClass} />
          </div>

          {localError && (
            <p className="text-xs font-semibold text-center py-1.5 rounded-lg"
              style={{ backgroundColor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', color: colors.danger }}>
              {localError}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}

function ModalEditarInsumo({ insumo, onClose, onSubmit, saving, isAdmin, categorias }) {
  const [form, setForm] = useState({
    nombre: insumo.nombre || '',
    unidad: insumo.unidad || 'u',
    categoria: insumo.categoria || '',
    stock_actual: insumo.stock_actual ?? '',
    stock_minimo: insumo.stock_minimo ?? '',
    stock_maximo: insumo.stock_maximo ?? '',
    costo_unitario: insumo.costo_unitario ?? '',
  })
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal open title={`Editar: ${insumo.nombre}`} onClose={onClose} disableBackdropClose={true}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Nombre — solo admin puede editar */}
        {isAdmin ? (
          <Input label="Nombre" value={form.nombre}
            onChange={e => upd('nombre', e.target.value.toUpperCase())} />
        ) : (
          <Input label="Nombre" value={insumo.nombre} disabled />
        )}

        {/* Categoría */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>Categoría</label>
          <select value={form.categoria} onChange={e => upd('categoria', e.target.value)}
            style={{ width: '100%', background: '#0f172a', border: '1px solid #334155',
                     color: '#f1f5f9', padding: '8px 12px', borderRadius: '6px' }}>
            {(categorias || TODAS_LAS_CATS).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Unidad — solo admin puede editar */}
        {isAdmin ? (
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}>Unidad</label>
            <select value={form.unidad} onChange={e => upd('unidad', e.target.value)}
              style={{ width: '100%', background: '#0f172a', border: '1px solid #334155',
                       color: '#f1f5f9', padding: '8px 12px', borderRadius: '6px' }}>
              {['kg', 'L', 'u'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        ) : (
          <Input label="Unidad" value={insumo.unidad || 'u'} disabled />
        )}

        <Input label={`Stock actual (${form.unidad || 'u'})`} type="number" min="0" step="0.01"
          value={form.stock_actual} onChange={e => upd('stock_actual', e.target.value)} />
        <Input label={`Stock mínimo (${form.unidad || 'u'})`} type="number" min="0" step="0.01"
          value={form.stock_minimo} onChange={e => upd('stock_minimo', e.target.value)} />
        <Input label={`Stock máximo (${form.unidad || 'u'})`} type="number" min="0" step="0.01"
          value={form.stock_maximo} onChange={e => upd('stock_maximo', e.target.value)} />

        {isAdmin && (
          <Input label="Costo unitario ($)" type="number" min="0" step="0.01"
            value={form.costo_unitario} onChange={e => upd('costo_unitario', e.target.value)} />
        )}

        <button onClick={() => onSubmit(form)} disabled={saving}
          style={{ padding: '10px', background: '#D4521A', color: 'white', border: 'none',
                   borderRadius: '6px', cursor: 'pointer', fontWeight: '600', marginTop: '8px' }}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
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
              className="w-24 rounded-lg border border-[#334155] text-sm text-[#F1F5F9] bg-[#0F172A] text-right px-2 py-1.5 outline-none focus:ring-2 focus:ring-[#D4521A]/25 focus:border-[#D4521A]"
            />
          </div>
        ))}
      </div>
    </Modal>
  )
}

function ModalMovsDetalle({ tipo, producto, movs, onClose }) {
  return (
    <Modal open onClose={onClose} title={`${tipo === 'ingreso' ? '↑ Ingresos' : '↓ Egresos'} — ${producto}`} maxWidth="max-w-4xl" disableBackdropClose={false}>
      {movs.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: colors.textMuted }}>Sin movimientos en el período</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <Thead>
              <Tr>
                <Th>Fecha/Hora</Th><Th>Tipo</Th><Th>Cantidad</Th><Th>Unidad</Th>
                <Th>Proveedor/Destino</Th><Th>Lote</Th><Th>Vencimiento</Th>
                <Th>Controló</Th><Th>Operario</Th>
              </Tr>
            </Thead>
            <Tbody>
              {movs.map(m => (
                <Tr key={m.id}>
                  <Td className="text-xs whitespace-nowrap">{fmtFechaHora(m.created_at || m.fecha)}</Td>
                  <Td><Badge variant={m.tipo === 'ingreso' ? 'success' : 'danger'}>{m.tipo === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}</Badge></Td>
                  <Td className="text-right font-bold">{m.cantidad}</Td>
                  <Td>{m.unidad || '—'}</Td>
                  <Td className="text-xs">
                    {m.tipo === 'ingreso'
                      ? (m.proveedor && m.proveedor !== 'N/A' ? m.proveedor : '—')
                      : (m.destino  && m.destino  !== 'N/A' ? m.destino  : '—')}
                  </Td>
                  <Td className="text-xs">{m.lote || '—'}</Td>
                  <Td className="text-xs whitespace-nowrap">{m.fecha_vencimiento || '—'}</Td>
                  <Td className="text-xs">{m.controlo || '—'}</Td>
                  <Td className="text-xs">{m.operario_recibe || '—'}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </Modal>
  )
}

function ModalEvolucionCS({ insumo, movimientos: allMovs, onClose }) {
  const data = useMemo(() => {
    const nombre = (insumo.nombre || '').trim().toLowerCase()
    const movsProducto = allMovs.filter(m => (m.producto_nombre || '').trim().toLowerCase() === nombre)
    const hoy = new Date()
    return Array.from({ length: 8 }, (_, i) => {
      const fin = new Date(hoy)
      fin.setDate(hoy.getDate() - i * 7)
      const ini = new Date(fin)
      ini.setDate(fin.getDate() - 6)
      const desdeStr = ini.toISOString().split('T')[0]
      const hastaStr = fin.toISOString().split('T')[0]
      const movsSem = movsProducto.filter(m => m.fecha >= desdeStr && m.fecha <= hastaStr)
      return {
        semana: `S${8 - i}`,
        consumo: Number(movsSem.filter(m => m.tipo === 'egreso').reduce((a, m) => a + (Number(m.cantidad) || 0), 0).toFixed(1)),
        ingreso: Number(movsSem.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + (Number(m.cantidad) || 0), 0).toFixed(1)),
      }
    }).reverse()
  }, [insumo, allMovs])

  const stockMin = insumo.stock_minimo || 0
  const unidad = insumo.unidad || 'kg'
  const consumos = data.map(d => d.consumo)
  const tendenciaBajista = consumos.length >= 3 &&
    consumos[consumos.length - 1] < consumos[consumos.length - 2] &&
    consumos[consumos.length - 2] < consumos[consumos.length - 3]

  return (
    <Modal open onClose={onClose} title={`Evolución de consumo — ${insumo.nombre}`} maxWidth="max-w-2xl" disableBackdropClose={false}>
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs" style={{ color: colors.textMuted }}>Consumo e ingresos por semana — últimas 8 semanas</p>
          {tendenciaBajista && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', color: colors.danger }}>
              📉 Tendencia descendente
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
            <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit={` ${unidad}`} />
            <Tooltip formatter={(v, name) => [`${v} ${unidad}`, name]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend verticalAlign="top" />
            {stockMin > 0 && (
              <ReferenceLine y={stockMin} stroke="#ef4444" strokeDasharray="5 5"
                label={{ value: `Mín ${stockMin} ${unidad}`, position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }} />
            )}
            <Line type="monotone" dataKey="consumo" stroke="#D4521A" strokeWidth={2.5} name="Consumo semanal"
              dot={{ r: 4, fill: '#D4521A' }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="ingreso" stroke="#3B82F6" strokeWidth={2} name="Ingresos"
              dot={{ r: 4, fill: '#3B82F6' }} strokeDasharray={tendenciaBajista ? undefined : undefined} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="p-3 rounded-lg text-center" style={{ backgroundColor: colors.bg }}>
            <p className="text-xs" style={{ color: colors.textMuted }}>Stock actual</p>
            <p className="text-lg font-bold" style={{ color: colors.textPrimary }}>{(insumo.stock_actual || 0).toFixed(1)} {unidad}</p>
          </div>
          <div className="p-3 rounded-lg text-center" style={{ backgroundColor: colors.bg }}>
            <p className="text-xs" style={{ color: colors.textMuted }}>Stock mínimo</p>
            <p className="text-lg font-bold" style={{ color: stockMin > 0 ? colors.warning : colors.textMuted }}>{stockMin} {unidad}</p>
          </div>
          <div className="p-3 rounded-lg text-center" style={{ backgroundColor: colors.bg }}>
            <p className="text-xs" style={{ color: colors.textMuted }}>Categoría</p>
            <p className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>{insumo.categoria || '—'}</p>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function ModalMovsCamaraDetalle({ producto, movs, onClose }) {
  const cols = ['FECHA/HORA', 'TIPO', 'KG', 'BALDES', 'LOTE', 'OPERARIO', 'TIPO PROD.', 'MOTIVO']
  return (
    <Modal open onClose={onClose} title={`Movimientos en cámara — ${producto}`} maxWidth="max-w-3xl" disableBackdropClose={false}>
      {movs.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: colors.textMuted }}>Sin movimientos registrados para este producto.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <Thead>
              <Tr>{cols.map(c => <Th key={c}>{c}</Th>)}</Tr>
            </Thead>
            <Tbody>
              {movs.map(m => (
                <Tr key={m.id}>
                  <Td className="text-xs whitespace-nowrap">{fmtFechaHora(m.fecha || m.created_at)}</Td>
                  <Td>
                    <Badge variant={m.tipo === 'ingreso' ? 'success' : m.tipo === 'egreso' ? 'danger' : 'neutral'}>
                      {m.tipo ? m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1) : '—'}
                    </Badge>
                  </Td>
                  <Td className="text-right font-semibold">{m.kg != null ? `${Number(m.kg).toFixed(1)} kg` : '—'}</Td>
                  <Td className="text-right">{m.baldes ?? '—'}</Td>
                  <Td>{m.lote
                    ? <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: '#fff7ed', color: '#c2410c' }}>{m.lote}</span>
                    : <span style={{ color: colors.textMuted }}>—</span>}
                  </Td>
                  <Td className="text-xs">{m.operario_nombre || '—'}</Td>
                  <Td className="text-xs capitalize">{m.tipo_producto || '—'}</Td>
                  <Td className="text-xs max-w-[160px] truncate">{m.motivo || '—'}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </Modal>
  )
}

function ModalNuevoInsumo({ onClose, onSubmit, saving, categorias = TODAS_LAS_CATS }) {
  const [form, setForm] = useState({
    nombre: '', categoria: 'OTROS', unidad: 'u',
    stock_actual: '0', stock_minimo: '0', stock_maximo: '0',
    costo_unitario: '0', peso_por_unidad: '',
  })
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const [err, setErr] = useState('')

  function handleGuardar() {
    if (!form.nombre.trim()) { setErr('El nombre es requerido'); return }
    setErr('')
    onSubmit(form)
  }

  return (
    <Modal open onClose={onClose} title="＋ Nuevo producto" maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1">Cancelar</Button>
          <Button variant="primary" onClick={handleGuardar} loading={saving} className="flex-1">
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }>
      <div className="space-y-3">
        <Input label="Nombre *" value={form.nombre} onChange={e => upd('nombre', e.target.value)} placeholder="Nombre del producto" />
        <div>
          <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Categoría</label>
          <select value={form.categoria} onChange={e => upd('categoria', e.target.value)}
            className="w-full rounded-lg border border-[#334155] text-sm text-[#F1F5F9] bg-[#0F172A] outline-none px-3 py-2 focus:ring-2 focus:ring-[#D4521A]/25 focus:border-[#D4521A]">
            {categorias.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <Select label="Unidad" value={form.unidad} onChange={e => upd('unidad', e.target.value)}>
          {UNIDADES.map(u => <option key={u}>{u}</option>)}
        </Select>
        <div className="grid grid-cols-3 gap-2">
          <Input label="Stock actual" type="number" min="0" step="0.01" value={form.stock_actual} onChange={e => upd('stock_actual', e.target.value)} />
          <Input label="Mínimo" type="number" min="0" step="0.01" value={form.stock_minimo} onChange={e => upd('stock_minimo', e.target.value)} />
          <Input label="Máximo" type="number" min="0" step="0.01" value={form.stock_maximo} onChange={e => upd('stock_maximo', e.target.value)} />
        </div>
        <Input label="Costo unitario ($)" type="number" min="0" step="0.01" value={form.costo_unitario} onChange={e => upd('costo_unitario', e.target.value)} />
        <Input label="Peso por unidad (kg) — opcional" type="number" min="0" step="0.001" value={form.peso_por_unidad} onChange={e => upd('peso_por_unidad', e.target.value)} placeholder="ej: 4.6" />
        {err && (
          <p className="text-xs font-semibold text-center py-1.5 rounded-lg"
            style={{ backgroundColor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', color: colors.danger }}>
            {err}
          </p>
        )}
      </div>
    </Modal>
  )
}

function ModalDetMovimiento({ mov, onClose }) {
  if (!mov) return null
  const esIngreso = mov.tipo === 'ingreso'
  const titulo = `${esIngreso ? 'INGRESO' : 'EGRESO'} — ${mov.producto_nombre || ''}`
  const campo = (label, valor) => valor ? (
    <div className="flex justify-between gap-2 py-1.5" style={{ borderBottom: `1px solid ${colors.border}` }}>
      <span className="text-xs flex-shrink-0" style={{ color: colors.textMuted }}>{label}</span>
      <span className="text-xs font-medium text-right" style={{ color: colors.textPrimary }}>{valor}</span>
    </div>
  ) : null
  return (
    <Modal open onClose={onClose} title={titulo} maxWidth="max-w-md" disableBackdropClose={false}>
      <div className="divide-y" style={{ borderColor: colors.border }}>
        {campo('Fecha y hora', formatFecha(mov.created_at))}
        {campo('Producto', mov.producto_nombre)}
        {campo('Marca', mov.marca)}
        {campo('Presentación', mov.presentacion)}
        {campo('Cantidad', formatCantidad(mov))}
        {(Number(mov.peso_total) > 0) && campo('Peso total', `${Number(mov.peso_total).toFixed(1)} kg`)}
        {campo('Lote', mov.lote)}
        {campo('Vencimiento', mov.fecha_vencimiento ? fmtFecha(mov.fecha_vencimiento) : null)}
        {esIngreso && campo('Proveedor', mov.proveedor)}
        {!esIngreso && campo('Destino', mov.destino)}
        {campo('Recibió / Solicitó', mov.operario_recibe)}
        {campo('Controló', mov.controlo)}
        {campo('N° Remito', mov.nro_remito)}
        {campo('Motivo', mov.motivo)}
        {campo('Observaciones', mov.observaciones)}
        {campo('Registrado por', mov.usuario_email)}
      </div>
    </Modal>
  )
}

// ── Modal para aprobar conteo con motivos obligatorios ────────────────────────
const MOTIVOS_AJUSTE = [
  'Error de conteo anterior', 'Merma no registrada', 'Ingreso no registrado',
  'Egreso no registrado', 'Vencimiento y descarte', 'Rotura o derrame',
  'Ajuste de inventario',
]
function ModalAprobarConteo({ productos, onClose, onConfirm, saving }) {
  const [motivos, setMotivos] = useState(() => Object.fromEntries(productos.map(p => [p.nombre, ''])))
  const completo = productos.every(p => motivos[p.nombre])
  return (
    <Modal open onClose={onClose} title="Aprobar conteo — Ajustes de inventario" maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1">Cancelar</Button>
          <Button variant="primary" onClick={() => onConfirm(motivos)} disabled={!completo} loading={saving} className="flex-1">
            Confirmar y aprobar
          </Button>
        </>
      }>
      <div className="space-y-3">
        <p className="text-xs" style={{ color: colors.textMuted }}>
          Ingresá el motivo para cada diferencia detectada. Esto generará un ajuste en el stock.
        </p>
        {productos.map(p => (
          <div key={p.nombre} className="p-3 rounded-lg space-y-2" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: colors.textPrimary }}>{p.nombre}</span>
              <span className="text-xs font-bold" style={{ color: p.diferencia > 0 ? colors.success : colors.danger }}>
                {p.diferencia > 0 ? '+' : ''}{p.diferencia.toFixed(2)} {p.unidad}
              </span>
            </div>
            <Select value={motivos[p.nombre]} onChange={e => setMotivos(m => ({ ...m, [p.nombre]: e.target.value }))}>
              <option value="">— Motivo obligatorio —</option>
              {MOTIVOS_AJUSTE.map(m => <option key={m} value={m}>{m}</option>)}
            </Select>
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
  // Datos de recetas + ingresos a cámara para el costeo de MP a producción (backflush)
  const [recetasCosteo, setRecetasCosteo] = useState({ camaraIngresos: [], sabores: [], saborIngredientes: [], bases: [], baseIngredientes: [], impulsivos: [], impulsivoIngredientes: [] })
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)
  const [modal, setModal]         = useState(null)
  const [saving, setSaving]       = useState(false)
  const [filtroTipo, setFiltroTipo]     = useState('Todos')
  const [busqueda, setBusqueda]         = useState('')
  const [filtroMes, setFiltroMes]       = useState(0)
  const [filtroAnio, setFiltroAnio]     = useState(0)
  const [filtroDestino, setFiltroDestino] = useState('Todos')
  const [informeVista, setInformeVista] = useState('egresos')
  const [informeMes, setInformeMes]     = useState(0)
  const [informeAnio, setInformeAnio]   = useState(0)
  const [editInsumo, setEditInsumo]     = useState(null)
  const [savingInsumo, setSavingInsumo] = useState(false)
  const [creandoInsumo, setCreandoInsumo] = useState(false)
  const [stockCamaras, setStockCamaras] = useState([])
  const [conteos, setConteos]           = useState([])
  const [modalConteo, setModalConteo]   = useState(null)
  const [savingConteo, setSavingConteo] = useState(false)

  // Control Semanal — nuevo
  const [periodoCS, setPeriodoCS]           = useState('semana_actual')
  const [periodoCSDesde, setPeriodoCSDesde] = useState('')
  const [periodoCSHasta, setPeriodoCSHasta] = useState('')
  const [modalMovsDet, setModalMovsDet]     = useState(null)
  const [modalEvolCS, setModalEvolCS]       = useState(null)
  const [generandoPDFstock, setGenerandoPDFstock] = useState(false)
  const [generandoPDFValuacion, setGenerandoPDFValuacion] = useState(false)
  const [generandoPDFInforme, setGenerandoPDFInforme] = useState(false)
  const [filtroMovDesde, setFiltroMovDesde] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]
  })
  const [filtroMovHasta, setFiltroMovHasta] = useState(() => new Date().toISOString().split('T')[0])
  const [filtroCategoria, setFiltroCategoria] = useState('TODOS')
  const [seccionCS, setSeccionCS]           = useState('deposito')
  const [filtroTablaCS, setFiltroTablaCS]   = useState(null) // null | 'critico' | 'atencion' | 'diferencia'
  const [filtroCSCategoria, setFiltroCSCategoria] = useState('TODOS')
  const [movsCamara, setMovsCamara]         = useState([])
  const [modalMovsCamara, setModalMovsCamara] = useState(null) // { producto }
  const [modalDetMov, setModalDetMov]       = useState(null)
  const [modalNuevoInsumo, setModalNuevoInsumo] = useState(false)
  const [savingNuevoInsumo, setSavingNuevoInsumo] = useState(false)
  const [vencimientosIngresos, setVencimientosIngresos] = useState([])
  const [filtroVencimiento, setFiltroVencimiento] = useState(false)
  const [generandoPDFcamara, setGenerandoPDFcamara] = useState(false)
  const tablaDepositoRef  = useRef(null)
  const chartRefConteo    = useRef(null)

  // ── Conteo formal semanal ──────────────────────────────────────────────────
  const [conteoEstado, setConteoEstado]         = useState('SIN_INICIAR') // SIN_INICIAR | EN_PROCESO | COMPLETADO | APROBADO
  const [conteoResponsable, setConteoResponsable] = useState('')
  const [conteoFilasDepo, setConteoFilasDepo]   = useState([]) // [{id,nombre,categoria,unidad,stockSistema,costo_unitario,stockFisico}]
  const [conteoFilasCam, setConteoFilasCam]     = useState([]) // [{id,nombre,tipo,stockKg,stockBaldes,fisKg,fisBaldes}]
  const [modalAjustes, setModalAjustes]         = useState(false)
  const [generandoPDFconteo, setGenerandoPDFconteo] = useState(false)
  const [conteoCiego, setConteoCiego]           = useState(true) // no muestra el stock del sistema → no se "dibuja"
  const [conteoCicloId, setConteoCicloId]       = useState(null) // ciclo del conteo en curso (para no duplicar al aprobar)
  const [generandoComprob, setGenerandoComprob] = useState(false)
  const [modalHistorial, setModalHistorial]     = useState(false)
  const [ciclosHistorial, setCiclosHistorial]   = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [reimprimiendo, setReimprimiendo]       = useState(null) // clave del ciclo que se está reimprimiendo
  // ── Mini-MRP / Plan de compras ──────────────────────────────────────────────
  const [ordenesAbiertas, setOrdenesAbiertas]   = useState([])
  const [planItems, setPlanItems]               = useState([]) // [{nombre, tipo_producto, cantidad}]
  const [planNuevo, setPlanNuevo]               = useState({ nombre: '', cantidad: '' })
  const [generandoPDFcompras, setGenerandoPDFcompras] = useState(false)
  const [proveedorPorInsumo, setProveedorPorInsumo] = useState({}) // normNombre → último proveedor
  const [generandoInformeSem, setGenerandoInformeSem] = useState(false)

  const { isAdmin, profile, user } = useUser()
  const showVal = isAdmin

  useEffect(() => { cargar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading) cargarMovimientosFiltrados(filtroMovDesde, filtroMovHasta)
  }, [filtroMovDesde, filtroMovHasta]) // eslint-disable-line react-hooks/exhaustive-deps

  async function cargarMovimientosFiltrados(desde, hasta) {
    const { data: m } = await supabase.from('movimientos_deposito').select('*')
      .gte('created_at', desde + 'T00:00:00')
      .lte('created_at', hasta + 'T23:59:59')
      .order('created_at', { ascending: false })
      .limit(1000)
    setMovimientos(m || [])
  }

  async function cargar() {
    const [{ data: i }, { data: o }, { data: sc }, { data: ct }, { data: mc }, { data: ord }] = await Promise.all([
      supabase.from('insumos').select('*').order('nombre'),
      supabase.from('operarios').select('*').order('nombre'),
      supabase.from('stock_camaras').select('*').order('nombre'),
      supabase.from('conteos_stock').select('*').order('fecha', { ascending: false }).limit(500),
      supabase.from('movimientos_camara').select('id,sabor_nombre,producto_nombre,tipo,kg,baldes,lote,operario_nombre,tipo_producto,motivo,created_at,fecha').order('id', { ascending: false }).limit(300),
      supabase.from('ordenes_produccion').select('*').in('estado', ['pendiente', 'en_proceso']).order('fecha_produccion', { ascending: true }),
    ])
    setOrdenesAbiertas(ord || [])
    // Vencimientos: todos los ingresos con fecha_vencimiento, para badges en Stock
    const { data: vencData } = await supabase.from('movimientos_deposito')
      .select('producto_nombre,lote,fecha_vencimiento,created_at')
      .eq('tipo', 'ingreso').not('fecha_vencimiento', 'is', null)
      .order('created_at', { ascending: false }).limit(500)
    setVencimientosIngresos(vencData || [])

    // Último proveedor por insumo (para agrupar el plan de compras)
    const { data: provData } = await supabase.from('movimientos_deposito')
      .select('producto_nombre,proveedor,created_at').eq('tipo', 'ingreso')
      .not('proveedor', 'is', null).order('created_at', { ascending: false }).limit(3000)
    const provMap = {}
    ;(provData || []).forEach(m => {
      const k = normalizarNombre(m.producto_nombre || '')
      if (k && !provMap[k] && m.proveedor) provMap[k] = m.proveedor
    })
    setProveedorPorInsumo(provMap)

    // Recetas + ingresos a cámara para el costeo de MP a producción (backflush)
    const [{ data: camIn }, { data: sab }, { data: sabIng }, { data: bas }, { data: basIng }, { data: imp }, { data: impIng }] = await Promise.all([
      supabase.from('movimientos_camara').select('producto_nombre,sabor_nombre,tipo_producto,kg,baldes,motivo,fecha').eq('tipo', 'ingreso').order('fecha', { ascending: false }).limit(3000),
      supabase.from('sabores').select('id,nombre,litros_base,base_nombre'),
      supabase.from('sabor_ingredientes').select('sabor_id,insumo_nombre,cantidad,unidad'),
      supabase.from('bases').select('id,nombre,litros_batch'),
      supabase.from('base_ingredientes').select('base_id,insumo_nombre,cantidad,unidad'),
      supabase.from('impulsivos').select('id,nombre'),
      supabase.from('impulsivo_ingredientes').select('impulsivo_id,insumo_nombre,cantidad,unidad'),
    ])
    setRecetasCosteo({
      camaraIngresos: camIn || [], sabores: sab || [], saborIngredientes: sabIng || [],
      bases: bas || [], baseIngredientes: basIng || [], impulsivos: imp || [], impulsivoIngredientes: impIng || [],
    })

    setInsumos(i || [])
    setOperarios(deduplicarOperarios(o))
    setStockCamaras(sc || [])
    setConteos(ct || [])
    setMovsCamara(mc || [])
    await cargarMovimientosFiltrados(filtroMovDesde, filtroMovHasta)
    setLoading(false)
  }

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Mapa nombre→ clasificación de vencimiento más próxima
  const vencimientoPorProducto = useMemo(() => {
    const map = {}
    vencimientosIngresos.forEach(m => {
      const key = (m.producto_nombre || '').trim().toLowerCase()
      if (!map[key] || m.created_at > map[key].created_at) map[key] = m
    })
    const result = {}
    Object.entries(map).forEach(([key, m]) => {
      result[key] = { ...m, clasif: clasificarVencimiento(m.fecha_vencimiento) }
    })
    return result
  }, [vencimientosIngresos])

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
  // destino no es requerido siempre (solo para materias primas); operario_recibe sí
  const CAMPOS_EGRESO = [...CAMPOS_COMUNES, ['operario_recibe', 'quién retira/solicita']]

  async function handleSubmit(form) {
    const campos = modal === 'ingreso' ? CAMPOS_INGRESO : CAMPOS_EGRESO
    for (const [campo, etiqueta] of campos) {
      if (!form[campo] || String(form[campo]).trim() === '') {
        toast2(`Falta completar: ${etiqueta}`, 'error'); return
      }
    }
    console.log('Guardando movimiento:', {
      tipo: modal,
      destino: form.destino,
      proveedor: form.proveedor,
      producto_nombre: form.producto_nombre,
    })
    if (!(parseFloat(form.cantidad) > 0)) {
      toast2('La cantidad debe ser mayor a 0', 'error'); return
    }
    setSaving(true)
    const pesoPorUnidad = parseFloat(form.peso_por_unidad) || 0
    const pesoTotal = form._pesoTotal || (form.unidad === 'u' && pesoPorUnidad > 0
      ? parseFloat(form.cantidad) * pesoPorUnidad : 0)
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
      proveedor: modal === 'ingreso' ? (form.proveedor?.trim() || null) : null,
      controlo: (form.controlo || '').toUpperCase() || null,
      destino: modal === 'egreso'
        ? (form.destino && form.destino !== 'N/A' ? form.destino : null)
        : null,
      operario_recibe: modal === 'egreso' ? ((form.operario_recibe || '').toUpperCase() || null) : null,
      observaciones: form.observaciones || null,
      peso_por_unidad: pesoPorUnidad || null,
      peso_total: pesoTotal || null,
      nro_remito: form.nro_remito?.trim() || null,
      motivo: form.motivo || null,
      usuario_email: user?.email || null,
    }
    const { error } = await supabase.from('movimientos_deposito').insert(payload)
    if (error) { setSaving(false); toast2(error.message, 'error'); return }

    // ── Actualizar stock_actual del insumo (ingreso y egreso) ──────────────────
    const nombreProducto = form.producto_nombre.trim()
    const delta = pesoTotal > 0 ? pesoTotal : parseFloat(form.cantidad)
    const signo = modal === 'ingreso' ? 1 : -1

    console.log('Actualizando stock insumo:', nombreProducto, 'cantidad:', delta, 'tipo:', modal)

    // 1. Búsqueda exacta en caché local
    let insumoMatch = insumos.find(i =>
      (i.nombre || '').trim().toLowerCase() === nombreProducto.toLowerCase()
    )

    // 2. Si no está en caché: búsqueda exacta en Supabase (case-insensitive)
    if (!insumoMatch) {
      const { data: found } = await supabase
        .from('insumos')
        .select('id, stock_actual, nombre, peso_por_unidad, costo_unitario')
        .eq('nombre', nombreProducto)
        .maybeSingle()
      console.log('Insumo encontrado (exacto):', found)
      insumoMatch = found
    }

    // 3. Si sigue sin encontrarse: búsqueda parcial
    if (!insumoMatch) {
      const { data: found } = await supabase
        .from('insumos')
        .select('id, stock_actual, nombre, peso_por_unidad, costo_unitario')
        .ilike('nombre', `%${nombreProducto}%`)
        .limit(1)
        .maybeSingle()
      console.log('Insumo encontrado (parcial):', found)
      insumoMatch = found
    }

    if (insumoMatch) {
      const nuevoStock = Math.max(0, (insumoMatch.stock_actual || 0) + signo * delta)
      const updates = { stock_actual: nuevoStock }
      if (modal === 'ingreso') {
        const precioUnitario = parseFloat(form.precio_unitario) || 0
        if (precioUnitario > 0) updates.costo_unitario = precioUnitario
        if (pesoPorUnidad > 0 && pesoPorUnidad !== (insumoMatch.peso_por_unidad || 0)) {
          updates.peso_por_unidad = pesoPorUnidad
        }
      }
      const { error: stockErr } = await supabase.from('insumos').update(updates).eq('id', insumoMatch.id)
      if (stockErr) {
        console.error('Error actualizando stock:', stockErr)
      } else {
        setInsumos(prev => prev.map(i => i.id === insumoMatch.id ? { ...i, ...updates } : i))
        // Historial de costos: si la compra cambió el costo unitario, lo registramos.
        if (modal === 'ingreso' && updates.costo_unitario > 0) {
          registrarCambioCosto({
            tipo: 'insumo', itemNombre: insumoMatch.nombre,
            costoAnterior: insumoMatch.costo_unitario, costoNuevo: updates.costo_unitario,
            origen: 'compra',
          })
        }
      }
    } else {
      console.warn('Insumo no encontrado para actualizar stock:', nombreProducto)
      toast2(`Movimiento registrado. No se encontró "${nombreProducto}" en insumos para actualizar el stock.`, 'warn')
    }

    setSaving(false)
    if (insumoMatch) toast2(modal === 'ingreso' ? 'Ingreso registrado' : 'Egreso registrado')
    setModal(null)
    cargar()
  }

  async function crearInsumoNuevo(nombre, categoria = 'OTROS') {
    console.log('Creando insumo:', { nombre, categoria })
    setCreandoInsumo(true)
    const { data, error } = await supabase.from('insumos')
      .insert({ nombre, categoria, unidad: 'u', stock_actual: 0, stock_minimo: 0, costo_unitario: 0 })
      .select()
      .single()
    console.log('Resultado INSERT:', data, error)
    setCreandoInsumo(false)
    if (error) { toast2(error.message, 'error'); return }
    const { data: todos } = await supabase.from('insumos').select('*').order('nombre')
    if (todos) setInsumos(todos)
    toast2(`Producto "${nombre}" agregado al stock`)
  }

  async function crearInsumoAdmin(form) {
    setSavingNuevoInsumo(true)
    const { data, error } = await supabase.from('insumos').insert({
      nombre: form.nombre.trim(),
      categoria: form.categoria,
      unidad: form.unidad,
      stock_actual: parseFloat(form.stock_actual) || 0,
      stock_minimo: parseFloat(form.stock_minimo) || 0,
      stock_maximo: parseFloat(form.stock_maximo) || 0,
      costo_unitario: parseFloat(form.costo_unitario) || 0,
      peso_por_unidad: parseFloat(form.peso_por_unidad) || null,
    }).select().single()
    setSavingNuevoInsumo(false)
    if (error) { toast2(error.message, 'error'); return }
    const { data: todos } = await supabase.from('insumos').select('*').order('nombre')
    if (todos) setInsumos(todos)
    toast2(`Producto "${data.nombre}" creado`)
    setModalNuevoInsumo(false)
  }

  async function eliminarInsumo(ins) {
    const ok = window.confirm(`¿Eliminar "${ins.nombre}"? Esta acción no se puede deshacer.`)
    if (!ok) return
    const { count } = await supabase.from('movimientos_deposito')
      .select('id', { count: 'exact', head: true })
      .eq('producto_nombre', ins.nombre)
    if (count > 0) {
      toast2(`No se puede eliminar: tiene ${count} movimiento${count === 1 ? '' : 's'} registrado${count === 1 ? '' : 's'}`, 'error')
      return
    }
    const { error } = await supabase.from('insumos').delete().eq('id', ins.id)
    if (error) { toast2(error.message, 'error'); return }
    setInsumos(prev => prev.filter(i => i.id !== ins.id))
    toast2(`"${ins.nombre}" eliminado`)
  }

  async function guardarInsumo(form) {
    if (!editInsumo) return
    const nombreAntiguo = editInsumo.nombre
    const nombreNuevo = form.nombre.toUpperCase()

    setSavingInsumo(true)
    const { error } = await supabase.from('insumos').update({
      nombre: nombreNuevo,
      unidad: form.unidad,
      categoria: form.categoria,
      stock_actual: Number(form.stock_actual) || 0,
      stock_minimo: Number(form.stock_minimo) || 0,
      stock_maximo: Number(form.stock_maximo) || 0,
      costo_unitario: Number(form.costo_unitario) || 0,
    }).eq('id', editInsumo.id)
    if (error) { setSavingInsumo(false); toast2(error.message, 'error'); return }

    // Historial: si la edición cambió el costo unitario, lo registramos.
    const costoNuevo = Number(form.costo_unitario) || 0
    if (costoNuevo > 0 && costoNuevo !== (Number(editInsumo.costo_unitario) || 0)) {
      registrarCambioCosto({
        tipo: 'insumo', itemNombre: nombreNuevo,
        costoAnterior: editInsumo.costo_unitario, costoNuevo,
        origen: 'edicion_manual',
      })
    }

    if (nombreNuevo !== nombreAntiguo) {
      await supabase.from('movimientos_deposito')
        .update({ producto_nombre: nombreNuevo })
        .eq('producto_nombre', nombreAntiguo)
      toast2('Producto renombrado y actualizado en movimientos')
      await cargarMovimientosFiltrados(filtroMovDesde, filtroMovHasta)
    } else {
      toast2('Insumo actualizado')
    }

    setSavingInsumo(false)
    const { data: todos } = await supabase.from('insumos').select('*').order('nombre')
    if (todos) setInsumos(todos)
    setEditInsumo(null)
  }

  const movsFiltrados = useMemo(() => (
    filtroTipo === 'Todos' ? movimientos : movimientos.filter(m => m.tipo === filtroTipo)
  ), [movimientos, filtroTipo])

  const pillsCategorias = useMemo(() => {
    const extra = [...new Set(insumos.map(i => i.categoria).filter(
      c => c && !new Set(CATS_FILTRO_BASE).has(c) && c !== 'NUEVO' && c !== 'General'
    ))].sort()
    return [...CATS_FILTRO_BASE, ...extra]
  }, [insumos])

  const categoriasSelect = useMemo(() => {
    const fijasSet = new Set(TODAS_LAS_CATS)
    const extras = [...new Set(insumos.map(i => i.categoria).filter(
      c => c && !fijasSet.has(c) && c !== 'NUEVO' && c !== 'General'
    ))].sort()
    return [...TODAS_LAS_CATS, ...extras]
  }, [insumos])

  const insumosFiltrados = useMemo(() => {
    let result = busqueda
      ? insumos.filter(i => i.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
      : insumos
    if (filtroCategoria !== 'TODOS') {
      result = result.filter(i => i.categoria === filtroCategoria)
    }
    if (filtroVencimiento) {
      result = result.filter(i => {
        const venc = vencimientoPorProducto[(i.nombre || '').trim().toLowerCase()]
        return venc && esAlertaVencimiento(venc.clasif)
      })
    }
    return result
  }, [insumos, busqueda, filtroCategoria, filtroVencimiento, vencimientoPorProducto])

  const sumatoriaCategoria = useMemo(() => {
    if (filtroCategoria === 'TODOS') return null
    const total = insumosFiltrados.length
    const conStock = insumosFiltrados.filter(i => (i.stock_actual || 0) > 0).length
    const sinStock = insumosFiltrados.filter(i => (i.stock_actual || 0) === 0).length
    const totalUnidades = insumosFiltrados.reduce((a, i) => a + (i.stock_actual || 0), 0)
    const valorTotal = insumosFiltrados.reduce((a, i) => a + (i.stock_actual || 0) * (i.costo_unitario || 0), 0)
    const unidadesLabel = [...new Set(insumosFiltrados.map(i => i.unidad).filter(Boolean))].join('/')
    return { total, conStock, sinStock, totalUnidades, valorTotal, unidadesLabel: unidadesLabel || 'u' }
  }, [insumosFiltrados, filtroCategoria])

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

  // ── Conteo formal ─────────────────────────────────────────────────────────
  function iniciarConteo() {
    if (!conteoResponsable) { toast2('Seleccioná un responsable antes de iniciar', 'error'); return }
    setConteoFilasDepo(insumos.map(i => ({
      id: i.id, nombre: i.nombre, categoria: i.categoria || 'General',
      unidad: i.unidad || 'u', stockSistema: i.stock_actual || 0,
      costo_unitario: i.costo_unitario || 0, stockFisico: '',
    })))
    setConteoFilasCam([]) // la cámara se cuenta en su propio módulo (evita duplicar)
    setConteoCicloId(null)
    setConteoEstado('EN_PROCESO')
    toast2('Conteo iniciado — ingresá los stocks físicos')
  }

  async function guardarConteoFormal() {
    setSavingConteo(true)
    const tipo = seccionCS
    const modo = conteoCiego ? 'ciego' : 'normal'
    // Valorizamos el impacto de cada diferencia (diferencia × costo unitario).
    const filas = tipo === 'deposito'
      ? conteoFilasDepo.filter(f => f.stockFisico !== '').map(f => {
          const dif = parseFloat(f.stockFisico) - f.stockSistema
          return {
            producto_nombre: f.nombre, stock_sistema: f.stockSistema,
            stock_fisico: parseFloat(f.stockFisico),
            valor_impacto: dif * (Number(f.costo_unitario) || 0),
          }
        })
      : conteoFilasCam.filter(c => c.fisKg !== '' || c.fisBaldes !== '').map(c => ({
          producto_nombre: c.nombre, stock_sistema: c.stockKg,
          stock_fisico: parseFloat(c.fisKg) || c.stockKg,
          valor_impacto: null,
        }))
    if (filas.length === 0) { setSavingConteo(false); toast2('Sin datos de conteo para guardar', 'error'); return }
    const ciclo = nuevoCiclo()
    const r = await registrarConteoStock({ area: tipo, filas, responsable: conteoResponsable, modo, cicloId: ciclo })
    setSavingConteo(false)
    if (!r.ok) { toast2('No se pudo guardar el conteo', 'error'); return }
    setConteoCicloId(ciclo)
    setConteoEstado('COMPLETADO')
    toast2(`Conteo guardado — ${filas.length} producto${filas.length !== 1 ? 's' : ''} registrado${filas.length !== 1 ? 's' : ''}`)
  }

  async function aprobarConteoFormal(motivos) {
    setSavingConteo(true)
    try {
      const fecha = new Date().toISOString().split('T')[0]
      const filasDepo = conteoFilasDepo.filter(f => {
        const fis = parseFloat(f.stockFisico)
        return !isNaN(fis) && fis !== f.stockSistema
      })
      const filasCAM = conteoFilasCam.filter(c => {
        const fk = parseFloat(c.fisKg)
        return !isNaN(fk) && fk !== c.stockKg
      })
      for (const f of filasDepo) {
        const fis = parseFloat(f.stockFisico)
        const diff = fis - f.stockSistema
        const motivo = motivos[f.nombre] || 'Ajuste de inventario'
        await supabase.from('insumos').update({ stock_actual: fis }).eq('id', f.id)
        await supabase.from('movimientos_deposito').insert({
          tipo: diff > 0 ? 'ingreso' : 'egreso',
          fecha, producto_nombre: f.nombre,
          cantidad: Math.abs(diff), unidad: f.unidad,
          motivo: 'Ajuste de inventario', observaciones: motivo,
          controlo: (conteoResponsable || '').toUpperCase() || null,
          marca: 'AJUSTE', presentacion: 'Sin Presentación', lote: `CONTEO-${fecha}`,
          fecha_vencimiento: null, usuario_email: user?.email || null,
        })
      }
      for (const c of filasCAM) {
        const fk = parseFloat(c.fisKg)
        const fb = c.fisBaldes !== '' ? parseInt(c.fisBaldes, 10) : c.stockBaldes
        await supabase.from('stock_camaras').update({ kg: fk, baldes: fb }).eq('id', c.id)
      }
      // ACTUALIZAMOS (no insertamos) las filas ya guardadas con los motivos
      // aprobados, para no duplicar el conteo en conteos_stock. El informe lee
      // de acá. Si faltan las columnas nuevas, el update simplemente no aplica.
      if (conteoCicloId && filasDepo.length > 0) {
        for (const f of filasDepo) {
          const fis = parseFloat(f.stockFisico)
          await supabase.from('conteos_stock').update({
            motivo: motivos[f.nombre] || 'Ajuste de inventario',
            valor_impacto: (fis - f.stockSistema) * (Number(f.costo_unitario) || 0),
          }).eq('ciclo_id', conteoCicloId).eq('producto_nombre', f.nombre)
        }
      }
      const total = filasDepo.length + filasCAM.length
      setConteoEstado('APROBADO')
      setModalAjustes(false)
      toast2(`Conteo aprobado — ${total} ajuste${total !== 1 ? 's' : ''} realizado${total !== 1 ? 's' : ''}`)
      cargar()
    } catch (err) {
      toast2(err.message, 'error')
    } finally {
      setSavingConteo(false)
    }
  }

  // ── Comprobante de conteo (del ciclo en curso) ──────────────────────────────
  // Genera el PDF del conteo puntual: contados, faltantes y sobrantes con su
  // motivo y su costo. Lee las filas ya guardadas en conteos_stock (misma fuente
  // que se reimprime desde el Historial), así el comprobante es idéntico siempre.
  async function generarComprobanteActual() {
    if (!conteoCicloId) { toast2('Guardá el conteo antes de emitir el comprobante', 'error'); return }
    setGenerandoComprob(true)
    try {
      const rows = await cargarConteosCiclo(conteoCicloId)
      if (!rows.length) { toast2('No se encontraron datos de este conteo', 'error'); return }
      const fecha = new Date().toISOString().split('T')[0]
      generarComprobanteConteo({ rows, area: 'deposito', fecha, responsable: conteoResponsable })
        .save(`comprobante_conteo_deposito_${fecha}.pdf`)
      toast2('Comprobante generado')
    } catch (err) {
      toast2(err.message || 'No se pudo generar el comprobante', 'error')
    } finally {
      setGenerandoComprob(false)
    }
  }

  // ── Historial de conteos ────────────────────────────────────────────────────
  // Lista los conteos pasados (depósito y cámara) del período elegido. Cada uno
  // se puede reimprimir: el comprobante se regenera desde conteos_stock, así que
  // aunque el PDF no se guarde como archivo, el conteo queda para consultar.
  async function abrirHistorial() {
    setModalHistorial(true)
    setCargandoHistorial(true)
    try {
      const lista = await cargarCiclos({ desde: rangoCS.desde, hasta: rangoCS.hasta })
      setCiclosHistorial(lista)
    } catch { setCiclosHistorial([]) }
    finally { setCargandoHistorial(false) }
  }

  async function reimprimirComprobante(ciclo) {
    if (!ciclo.ciclo_id) { toast2('Este conteo es anterior al historial y no se puede reimprimir', 'error'); return }
    setReimprimiendo(ciclo.clave)
    try {
      const rows = await cargarConteosCiclo(ciclo.ciclo_id)
      if (!rows.length) { toast2('No se encontraron datos de este conteo', 'error'); return }
      generarComprobanteConteo({ rows, area: ciclo.area, fecha: ciclo.fecha, responsable: ciclo.responsable })
        .save(`comprobante_conteo_${ciclo.area}_${ciclo.fecha}.pdf`)
    } catch (err) {
      toast2(err.message || 'No se pudo reimprimir', 'error')
    } finally {
      setReimprimiendo(null)
    }
  }

  // ── Informe semanal consolidado (depósito + cámara) ─────────────────────────
  // Lee la fuente de verdad (conteos_stock) del período elegido, deduplica por
  // área+producto (última versión) y arma el PDF: faltó / sobró / porqués / $.
  async function generarInformeSemanalConteo() {
    setGenerandoInformeSem(true)
    try {
      const rows = await cargarConteosPeriodo({ desde: rangoCS.desde, hasta: rangoCS.hasta })
      const R = resumenSemanal(rows)

      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pw  = doc.internal.pageSize.getWidth()
      const ph  = doc.internal.pageSize.getHeight()
      const hoy = new Date().toLocaleString('es-AR')
      const MOD = 'DEPÓSITO'
      const TIT = 'CONTROL SEMANAL DE STOCK'
      const EST = getEstiloInforme()
      const peri = `${fmtFecha(rangoCS.desde)} – ${fmtFecha(rangoCS.hasta)}`
      const areaLbl = a => a === 'camara' ? 'Cámara' : 'Depósito'
      const fmtDif = r => `${(Number(r.diferencia) || 0) > 0 ? '+' : ''}${(Number(r.diferencia) || 0).toFixed(2)}`
      const fmtVal = r => r.valor_impacto == null ? '—' : `$${pesos(Math.abs(Number(r.valor_impacto)))}`

      // P1 — Portada
      dibujarPortada(doc, pw, ph, MOD, TIT, peri, hoy)

      // P2 — Resumen ejecutivo
      doc.addPage()
      dibujarEncabezado(doc, pw, MOD, TIT, hoy)
      let y = PDF_CONTENT_Y
      y = dibujarSeccion(doc, pw, 'Resumen de la semana', y)
      const cont = R.porArea
      const resumenTxt =
        `En el período ${peri.toLowerCase()} se contaron ${R.totalContados} productos ` +
        `(${cont.deposito.contados} en depósito, ${cont.camara.contados} en cámara). ` +
        `Se detectaron ${R.faltantes.length} faltante${R.faltantes.length !== 1 ? 's' : ''} y ` +
        `${R.sobrantes.length} sobrante${R.sobrantes.length !== 1 ? 's' : ''}. ` +
        `Impacto valorizado en depósito: faltante $${pesos(R.valorFaltante)}, sobrante $${pesos(R.valorSobrante)} ` +
        `(neto ${R.impactoNeto >= 0 ? '+' : '-'}$${pesos(Math.abs(R.impactoNeto))}). ` +
        `Las pérdidas de cámara quedan valorizadas en Mermas.`
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...PDF_NEGRO)
      const lines = doc.splitTextToSize(resumenTxt, pw - 28)
      doc.text(lines, 14, y + 2)
      y += lines.length * 5 + 8

      if (R.totalContados === 0) {
        doc.setTextColor(...PDF_GRIS_OSC)
        doc.text('No hay conteos registrados en el período. Realizá un conteo en Depósito o Cámara para generar el informe.', 14, y + 4)
        dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
        doc.save(`control_stock_${rangoCS.desde}_a_${rangoCS.hasta}.pdf`)
        setGenerandoInformeSem(false)
        return
      }
      dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)

      // P3 — Faltantes (lo que faltó, con el porqué)
      const drawTabla = (titulo, filas, headColor) => {
        doc.addPage()
        dibujarEncabezado(doc, pw, MOD, TIT, hoy)
        autoTable(doc, {
          ...EST,
          startY: PDF_CONTENT_Y,
          head: [['ÁREA', 'PRODUCTO', 'SISTEMA', 'FÍSICO', 'DIF.', 'VALOR', 'RESPONSABLE', 'MOTIVO']],
          headStyles: { ...(EST.headStyles || {}), fillColor: headColor },
          body: filas.map(r => [
            areaLbl(r.tipo), r.producto_nombre,
            (Number(r.stock_sistema) || 0).toFixed(2), (Number(r.stock_fisico) || 0).toFixed(2),
            fmtDif(r), fmtVal(r), r.responsable || '—', r.motivo || '—',
          ]),
          columnStyles: { 7: { cellWidth: 42 } },
          didDrawPage: () => {
            dibujarEncabezado(doc, pw, MOD, TIT, hoy)
            dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
          },
        })
        let yy = (doc.lastAutoTable?.finalY || PDF_CONTENT_Y) + 4
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_NEGRO)
        doc.text(titulo, 14, yy)
      }

      if (R.faltantes.length > 0) drawTabla(`Total faltante valorizado (depósito): $${pesos(R.valorFaltante)}`, R.faltantes, PDF_SEM_CRIT)
      if (R.sobrantes.length > 0) drawTabla(`Total sobrante valorizado (depósito): $${pesos(R.valorSobrante)}`, R.sobrantes, PDF_SEM_OK)

      doc.save(`control_stock_${rangoCS.desde}_a_${rangoCS.hasta}.pdf`)
    } catch (err) {
      toast2(err.message || 'No se pudo generar el informe', 'error')
    } finally {
      setGenerandoInformeSem(false)
    }
  }

  // ── Plan de compras: acciones ───────────────────────────────────────────────
  // A) Sembrar el plan desde las órdenes abiertas (lo que falta producir).
  function cargarPlanDesdeOrdenes() {
    const acc = {}
    ordenesAbiertas.forEach(o => {
      const p = pendienteDeOrden(o)
      if (!p.nombre || !(p.cantidad > 0)) return
      const k = `${p.tipo_producto}:${normalizarNombre(p.nombre)}`
      if (!acc[k]) acc[k] = { nombre: (p.nombre || '').toUpperCase(), tipo_producto: p.tipo_producto, cantidad: 0 }
      acc[k].cantidad += p.cantidad
    })
    const items = Object.values(acc)
    setPlanItems(items)
    if (items.length === 0) toast2('No hay órdenes abiertas con cantidad pendiente', 'warn')
    else toast2(`Plan cargado desde ${items.length} producto${items.length !== 1 ? 's' : ''} de órdenes abiertas`)
  }

  // B) Agregar un producto a mano.
  function agregarItemPlan() {
    const prod = catalogoProductos.find(p => p.nombre === planNuevo.nombre)
    const cant = parseFloat(planNuevo.cantidad)
    if (!prod) { toast2('Elegí un producto', 'error'); return }
    if (!(cant > 0)) { toast2('Ingresá una cantidad', 'error'); return }
    setPlanItems(prev => {
      const k = `${prod.tipo_producto}:${normalizarNombre(prod.nombre)}`
      const idx = prev.findIndex(it => `${it.tipo_producto}:${normalizarNombre(it.nombre)}` === k)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = { ...next[idx], cantidad: (Number(next[idx].cantidad) || 0) + cant }; return next
      }
      return [...prev, { nombre: prod.nombre, tipo_producto: prod.tipo_producto, cantidad: cant }]
    })
    setPlanNuevo({ nombre: '', cantidad: '' })
  }

  const setCantidadPlan = (idx, val) => setPlanItems(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: val } : it))
  const quitarItemPlan  = (idx) => setPlanItems(prev => prev.filter((_, i) => i !== idx))

  async function generarPDFCompras() {
    setGenerandoPDFcompras(true)
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pw = doc.internal.pageSize.getWidth()
      const ph = doc.internal.pageSize.getHeight()
      const hoy = new Date().toLocaleString('es-AR')
      const MOD = 'DEPÓSITO'
      const TIT = 'PLAN DE COMPRAS'
      const EST = getEstiloInforme()
      dibujarPortada(doc, pw, ph, MOD, TIT, null, hoy)

      doc.addPage()
      dibujarEncabezado(doc, pw, MOD, TIT, hoy)
      let y = PDF_CONTENT_Y
      y = dibujarSeccion(doc, pw, 'Qué comprar (materia prima que no alcanza para el plan)', y)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...PDF_NEGRO)
      doc.text(`Total estimado a comprar: $${pesos(planCompras.totalCompra)}`, 14, y + 2)
      y += 8

      planCompras.grupos.forEach(g => {
        autoTable(doc, {
          ...EST, startY: y,
          head: [[`PROVEEDOR: ${g.proveedor}`, 'NECESITA', 'HAY', 'COMPRAR', 'COSTO $']],
          body: g.items.map(i => [
            i.nombre, `${i.necesario.toFixed(2)} ${i.unidad}`, `${i.disponible.toFixed(2)} ${i.unidad}`,
            `${i.faltante.toFixed(2)} ${i.unidad}`, i.sinCosto ? 's/costo' : `$${pesos(i.costoCompra)}`,
          ]),
          foot: [['', '', '', 'Subtotal', `$${pesos(g.total)}`]],
          didDrawPage: () => { dibujarEncabezado(doc, pw, MOD, TIT, hoy); dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber) },
        })
        y = (doc.lastAutoTable?.finalY || y) + 6
      })
      if (planCompras.aComprar.length === 0) {
        doc.setTextColor(...PDF_GRIS_OSC)
        doc.text('El stock actual cubre todo el plan. No hay que comprar nada.', 14, y + 4)
      }
      dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
      doc.save(`plan_compras_${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (err) {
      toast2(err.message || 'No se pudo generar el plan', 'error')
    } finally {
      setGenerandoPDFcompras(false)
    }
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

  // ── Mini-MRP: catálogo de productos y cálculo del plan de compras ───────────
  // Catálogo para agregar a mano (sabores = helado, impulsivos y postres = unidad).
  const catalogoProductos = useMemo(() => {
    const helados = (recetasCosteo.sabores || []).map(s => ({ nombre: (s.nombre || '').toUpperCase(), tipo_producto: 'helado', grupo: 'HELADOS' }))
    const imps = (recetasCosteo.impulsivos || []).map(i => ({ nombre: (i.nombre || '').toUpperCase(), tipo_producto: 'impulsivo', grupo: 'IMPULSIVOS' }))
    const postres = POSTRES.map(p => ({ nombre: (p.nombre || '').toUpperCase(), tipo_producto: 'postre', grupo: 'POSTRES' }))
    const vistos = new Set()
    return [...helados, ...imps, ...postres].filter(p => {
      const k = `${p.tipo_producto}:${normalizarNombre(p.nombre)}`
      if (vistos.has(k)) return false; vistos.add(k); return true
    }).sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nombre.localeCompare(b.nombre))
  }, [recetasCosteo])

  const planCompras = useMemo(() => calcularPlanCompras({
    planItems,
    ctx: { ...recetasCosteo, insumos },
    ultimoProveedor: proveedorPorInsumo,
  }), [planItems, recetasCosteo, insumos, proveedorPorInsumo])

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

  // ── Informe ejecutivo de egresos (valorizado en $) ────────────────────────
  const egresosEjecutivo = useMemo(() => {
    // Costo por insumo, matcheando por nombre normalizado (ignora tildes/espacios,
    // como el resto del sistema) para no perder valor por diferencias de nombre.
    const costo = {}
    insumos.forEach(i => { costo[normalizarNombre(i.nombre)] = i.costo_unitario || 0 })
    const valorDe = m => (Number(m.cantidad) || 0) * (costo[normalizarNombre(m.producto_nombre)] || 0)
    const sinCosto = m => !(costo[normalizarNombre(m.producto_nombre)] > 0)
    const esAjuste = m => /ajuste de inventario/i.test(m.motivo || '') || /ajuste de inventario/i.test(m.observaciones || '')
    const egr = movsInforme.filter(m => m.tipo === 'egreso')
    const totalVal = egr.reduce((a, m) => a + valorDe(m), 0)

    const PROD = new Set(['Bases', 'Sabores', 'Postres', 'Impulsivos', 'Escocés', 'Bombones', 'Panadería'])
    // Los ajustes de inventario se separan: no son ni venta ni consumo claro, y
    // suelen esconder consumo de producción no registrado.
    const bucketDe = m => esAjuste(m) ? 'Ajuste' : PROD.has(m.destino) ? 'Producción' : (m.destino === 'Venta' ? 'Venta' : (m.destino === 'Uso interno' ? 'Uso interno' : 'Otro'))
    const BUCKETS = [
      { k: 'Producción', color: colors.success }, { k: 'Venta', color: colors.info },
      { k: 'Ajuste', color: '#a78bfa' }, { k: 'Uso interno', color: colors.warning }, { k: 'Otro', color: colors.danger },
    ]
    const bd = {}
    egr.forEach(m => { const b = bucketDe(m); if (!bd[b]) bd[b] = { n: 0, val: 0 }; bd[b].n++; bd[b].val += valorDe(m) })
    const prodVal = bd['Producción']?.val || 0
    const pctProd = totalVal > 0 ? Math.round(prodVal / totalVal * 100) : 0
    const noProdVal = (bd['Uso interno']?.val || 0) + (bd['Otro']?.val || 0)
    const destinos = BUCKETS.filter(b => bd[b.k]).map(b => ({ ...b, ...bd[b.k], pct: totalVal > 0 ? Math.round(bd[b.k].val / totalVal * 100) : 0 }))

    const pp = {}
    egr.forEach(m => { const k = m.producto_nombre || '—'; if (!pp[k]) pp[k] = { nombre: k, cant: 0, val: 0, dest: {} }; pp[k].cant += Number(m.cantidad) || 0; pp[k].val += valorDe(m); pp[k].dest[m.destino || '—'] = (pp[k].dest[m.destino || '—'] || 0) + 1 })
    const topProd = Object.values(pp).sort((a, b) => b.val - a.val).slice(0, 8)
      .map(p => ({ ...p, destPpal: Object.entries(p.dest).sort((a, b) => b[1] - a[1])[0]?.[0] || '—' }))

    const pr = {}
    egr.forEach(m => { const k = m.operario_recibe || 'Sin asignar'; if (!pr[k]) pr[k] = { k, n: 0, val: 0 }; pr[k].n++; pr[k].val += valorDe(m) })
    const topRet = Object.values(pr).sort((a, b) => b.val - a.val)

    const aOtro = egr.filter(m => m.destino === 'Otro')
    const aAjuste = egr.filter(esAjuste)
    const aSinCosto = egr.filter(sinCosto)
    // Productos distintos sin costo (lo que el usuario tiene que cargar/corregir)
    const sinCostoProd = [...new Set(aSinCosto.map(m => m.producto_nombre || '—'))].sort()

    const valorDeItems = arr => arr.map(m => ({
      fecha: m.fecha || (m.created_at || '').slice(0, 10), producto: m.producto_nombre || '—',
      cant: `${m.cantidad ?? ''} ${m.unidad || ''}`.trim(), retira: m.operario_recibe || '—', val: valorDe(m),
    }))

    return {
      egr, totalVal, pctProd, noProdVal, destinos, topProd, topRet,
      alertas: {
        otro: { n: aOtro.length, val: aOtro.reduce((a, m) => a + valorDe(m), 0), items: valorDeItems(aOtro) },
        ajuste: { n: aAjuste.length, val: aAjuste.reduce((a, m) => a + valorDe(m), 0), items: valorDeItems(aAjuste) },
        sinCosto: { n: aSinCosto.length, productos: sinCostoProd },
      },
    }
  }, [movsInforme, insumos])

  // ── MP a producción CALCULADA por receta (backflush desde cámara) ─────────
  const costeoProd = useMemo(() => {
    const movs = (recetasCosteo.camaraIngresos || []).filter(m => {
      const mt = (m.motivo || '').toLowerCase()
      if (mt === 'transferencia' || mt === 'devolución' || mt === 'devolucion' || mt.includes('ajuste')) return false
      return dentroDePeriodo(m.fecha, informeMes, informeAnio)
    })
    return { ...costearProduccion(movs, { ...recetasCosteo, insumos }), nMovs: movs.length }
  }, [recetasCosteo, insumos, informeMes, informeAnio]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Distribución REAL: producción = MP calculada por receta (no lo registrado) ─
  // El consumo de producción se toma del backflush (real); el resto son egresos
  // registrados no productivos. Los ajustes y el egreso registrado a producción
  // se omiten acá porque ya están contenidos en el cálculo por receta.
  const egresosReal = useMemo(() => {
    const get = k => egresosEjecutivo.destinos.find(d => d.k === k)?.val || 0
    const buckets = [
      { k: 'Producción (calculada)', val: costeoProd.total, color: colors.success },
      { k: 'Venta', val: get('Venta'), color: colors.info },
      { k: 'Uso interno', val: get('Uso interno'), color: colors.warning },
      { k: 'Otro', val: get('Otro'), color: colors.danger },
    ].filter(b => b.val > 0)
    const total = buckets.reduce((a, b) => a + b.val, 0)
    const noProd = get('Venta') * 0 + (get('Uso interno') + get('Otro'))
    return {
      buckets: buckets.map(b => ({ ...b, pct: total > 0 ? Math.round(b.val / total * 100) : 0 })),
      total, noProd, pctProd: total > 0 ? Math.round(costeoProd.total / total * 100) : 0,
      incompleto: (costeoProd.sinReceta.length > 0 || costeoProd.sinCosto.length > 0),
    }
  }, [egresosEjecutivo, costeoProd])

  // ── Control Semanal — cálculos ────────────────────────────────────────────
  const rangoCS = useMemo(() => {
    const hoy = new Date()
    const hoyStr = hoy.toISOString().split('T')[0]
    if (periodoCS === 'semana_actual') {
      const lunes = new Date(hoy)
      lunes.setDate(hoy.getDate() - (hoy.getDay() + 6) % 7)
      return { desde: lunes.toISOString().split('T')[0], hasta: hoyStr }
    }
    if (periodoCS === 'semana_pasada') {
      const lunesEsta = new Date(hoy)
      lunesEsta.setDate(hoy.getDate() - (hoy.getDay() + 6) % 7)
      const lunesAnt = new Date(lunesEsta)
      lunesAnt.setDate(lunesEsta.getDate() - 7)
      const domAnt = new Date(lunesAnt)
      domAnt.setDate(lunesAnt.getDate() + 6)
      return { desde: lunesAnt.toISOString().split('T')[0], hasta: domAnt.toISOString().split('T')[0] }
    }
    if (periodoCS === 'mes_actual') {
      const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      return { desde: primero.toISOString().split('T')[0], hasta: hoyStr }
    }
    return { desde: periodoCSDesde || hoyStr, hasta: periodoCSHasta || hoyStr }
  }, [periodoCS, periodoCSDesde, periodoCSHasta])

  const controlSemanal = useMemo(() => {
    if (!rangoCS.desde || !rangoCS.hasta) return []
    const hoy = new Date()
    const hace28 = new Date(hoy); hace28.setDate(hoy.getDate() - 28)
    const hace28Str = hace28.toISOString().split('T')[0]

    return insumos.map(ins => {
      const nombre = (ins.nombre || '').trim().toLowerCase()
      const movsProducto = movimientos.filter(m =>
        (m.producto_nombre || '').trim().toLowerCase() === nombre
      )
      const movsPeriodo = movsProducto.filter(m =>
        m.fecha >= rangoCS.desde && m.fecha <= rangoCS.hasta
      )
      const ingresosMovs = movsPeriodo.filter(m => m.tipo === 'ingreso')
      const egresosMovs  = movsPeriodo.filter(m => m.tipo === 'egreso')
      const ingresosKg = ingresosMovs.reduce((a, m) => a + (Number(m.cantidad) || 0), 0)
      const egresosKg  = egresosMovs.reduce((a, m) => a + (Number(m.cantidad) || 0), 0)
      const balance    = ingresosKg - egresosKg
      const stockSistema  = ins.stock_actual || 0
      const stockInicial  = stockSistema - balance

      const conteo = ultimosConteos[`deposito::${nombre}`]
      const conteoFisico = conteo ? Number(conteo.stock_fisico) : null
      const diferencia   = conteoFisico !== null ? conteoFisico - stockSistema : null
      const pctDiferencia = conteoFisico !== null && stockSistema > 0
        ? (Math.abs(diferencia) / stockSistema) * 100 : 0

      const egresoRecientes = movsProducto.filter(m => m.tipo === 'egreso' && m.fecha >= hace28Str)
      const totalEgresoReciente = egresoRecientes.reduce((a, m) => a + (Number(m.cantidad) || 0), 0)
      const consumoPromDiario = totalEgresoReciente / 28
      const diasStock = consumoPromDiario > 0 ? stockSistema / consumoPromDiario : Infinity

      const ultimoMovFecha = [...movsProducto].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0]?.fecha || null
      const diasSinMov = ultimoMovFecha ? Math.floor((hoy - new Date(ultimoMovFecha)) / 86400000) : 999

      const estado = diasStock < 3 ? 'CRÍTICO' : diasStock < 7 ? 'ATENCIÓN' : 'OK'

      return {
        ...ins, ingresosKg, egresosKg, balance, stockSistema, stockInicial,
        conteoFisico, diferencia, pctDiferencia, consumoPromDiario,
        diasStock, diasSinMov, ingresosMovs, egresosMovs, estado,
      }
    }).sort((a, b) => {
      const o = { CRÍTICO: 0, ATENCIÓN: 1, OK: 2 }
      return (o[a.estado] ?? 2) - (o[b.estado] ?? 2) || (a.nombre || '').localeCompare(b.nombre || '')
    })
  }, [insumos, movimientos, ultimosConteos, rangoCS])

  const semanaLabel = useMemo(() => {
    if (!rangoCS.desde || !rangoCS.hasta) return 'Semana actual'
    const d = new Date(rangoCS.desde + 'T12:00:00')
    const h = new Date(rangoCS.hasta + 'T12:00:00')
    const M = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
    if (d.getMonth() === h.getMonth() && d.getFullYear() === h.getFullYear())
      return `Semana del ${d.getDate()} al ${h.getDate()} de ${M[h.getMonth()]} ${h.getFullYear()}`
    return `Semana del ${d.getDate()} de ${M[d.getMonth()]} al ${h.getDate()} de ${M[h.getMonth()]} ${h.getFullYear()}`
  }, [rangoCS])

  const alertasCS = useMemo(() => {
    const al = []
    controlSemanal.forEach(r => {
      if (r.diasStock < 3 && r.consumoPromDiario > 0)
        al.push({ tipo: 'critico', producto: r.nombre, diasStock: r.diasStock, consumo: r.consumoPromDiario, unidad: r.unidad || 'kg' })
      else if (r.diasStock < 7 && r.consumoPromDiario > 0)
        al.push({ tipo: 'reposicion', producto: r.nombre, diasStock: r.diasStock, cantSugerida: r.consumoPromDiario * 7 * 2, unidad: r.unidad || 'kg' })
      if (r.conteoFisico !== null && r.pctDiferencia > 3)
        al.push({ tipo: 'diferencia', producto: r.nombre, diferencia: r.diferencia, pct: r.pctDiferencia, unidad: r.unidad || 'kg' })
      if (r.diasSinMov > 30)
        al.push({ tipo: 'sin_movimiento', producto: r.nombre, dias: r.diasSinMov })
    })
    return al
  }, [controlSemanal])

  const controlSemanalFiltrado = useMemo(() => {
    let result = controlSemanal
    if (filtroCSCategoria !== 'TODOS') {
      result = result.filter(r => r.categoria === filtroCSCategoria)
    }
    if (!filtroTablaCS) return result
    if (filtroTablaCS === 'critico')    return result.filter(r => r.estado === 'CRÍTICO')
    if (filtroTablaCS === 'atencion')   return result.filter(r => r.estado === 'CRÍTICO' || r.estado === 'ATENCIÓN')
    if (filtroTablaCS === 'diferencia') return result.filter(r => r.pctDiferencia > 3)
    return result
  }, [controlSemanal, filtroTablaCS])

  // KPIs de cámaras
  const kpisCamara = useMemo(() => ({
    total:    stockCamaras.length,
    agotados: stockCamaras.filter(c => (c.kg || 0) === 0).length,
    bajos:    stockCamaras.filter(c => (c.kg || 0) > 0 && (c.baldes || 0) <= 3).length,
    totalKg:  stockCamaras.reduce((a, c) => a + (c.kg || 0), 0),
    totalU:   stockCamaras.filter(c => (c.tipo_producto || '') === 'impulsivo').reduce((a, c) => a + (c.baldes || 0), 0),
    totalBaldes: stockCamaras.filter(c => (c.tipo_producto || '') !== 'impulsivo').reduce((a, c) => a + (c.baldes || 0), 0),
  }), [stockCamaras])

  // Movimientos de cámara agrupados por producto para el período de CS
  const statsCamaraCS = useMemo(() => {
    if (!rangoCS.desde || !rangoCS.hasta) return {}
    const filtrados = movsCamara.filter(m => {
      const fecha = (m.created_at || '').slice(0, 10) || m.fecha || ''
      return fecha >= rangoCS.desde && fecha <= rangoCS.hasta
    })
    const byNombre = {}
    filtrados.forEach(m => {
      const nom = (m.sabor_nombre || m.producto_nombre || '').trim().toLowerCase()
      if (!nom) return
      if (!byNombre[nom]) byNombre[nom] = { ingresosKg: 0, egresosKg: 0, ingresosU: 0, egresosU: 0 }
      if (m.tipo === 'ingreso') {
        byNombre[nom].ingresosKg += m.kg || 0
        byNombre[nom].ingresosU  += m.baldes || 0
      } else {
        byNombre[nom].egresosKg  += m.kg || 0
        byNombre[nom].egresosU   += m.baldes || 0
      }
    })
    return byNombre
  }, [movsCamara, rangoCS])

  function estadoCamara(c) {
    if ((c.kg || 0) === 0) return 'AGOTADO'
    if ((c.baldes || 0) <= 3) return 'BAJO'
    return 'OK'
  }

  async function generarPDFCamaras() {
    setGenerandoPDFcamara(true)
    try {
      const doc  = new jsPDF({ unit: 'mm', format: 'a4' })
      const pw   = doc.internal.pageSize.getWidth()
      const ph   = doc.internal.pageSize.getHeight()
      const hoy  = new Date().toLocaleString('es-AR')
      const MOD  = 'DEPÓSITO'
      const TIT  = 'STOCK DE CÁMARAS'
      const EST  = getEstiloInforme()

      // P1 — Portada
      dibujarPortada(doc, pw, ph, MOD, TIT, null, hoy)

      // P2 — Tabla de stock
      doc.addPage()
      const sorted = [...stockCamaras].sort((a, b) => {
        const o = { AGOTADO: 0, BAJO: 1, OK: 2 }
        return (o[estadoCamara(a)] ?? 2) - (o[estadoCamara(b)] ?? 2) || (a.nombre || '').localeCompare(b.nombre || '')
      })
      autoTable(doc, {
        ...EST,
        startY: PDF_CONTENT_Y,
        head: [['PRODUCTO', 'TIPO', 'KG', 'BALDES', 'LOTE', 'ÚLTIMA ELABORACIÓN', 'OPERARIO', 'ESTADO']],
        body: sorted.map(c => [
          c.nombre || '—', c.tipo_producto || '—', (c.kg || 0).toFixed(1),
          String(c.baldes || 0), c.lote || '—',
          c.ultima_actualizacion ? new Date(c.ultima_actualizacion).toLocaleString('es-AR') : '—',
          c.operario_nombre || '—', estadoCamara(c),
        ]),
        didParseCell(data) {
          if (data.section !== 'body') return
          const c = sorted[data.row.index]
          if (!c) return
          const est = estadoCamara(c)
          if (est === 'AGOTADO') data.cell.styles.fillColor = [238, 210, 210]
          else if (est === 'BAJO') data.cell.styles.fillColor = [238, 232, 210]
        },
        didDrawPage: () => {
          dibujarEncabezado(doc, pw, MOD, TIT, hoy)
          dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
        },
      })
      const resY = (doc.lastAutoTable?.finalY || PDF_CONTENT_Y) + 5
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...PDF_GRIS_OSC)
      doc.text(
        `Total: ${sorted.length} productos · ${kpisCamara.agotados} agotados · ${kpisCamara.bajos} en bajo stock · ${kpisCamara.totalKg.toFixed(1)} kg`,
        14, resY
      )

      // Firmas (al final del contenido; salta de hoja solo si no entran)
      dibujarFirmas(doc, pw, ph, resY, MOD, hoy, ['Responsable de Cámaras', 'Supervisor', 'Gerente'])

      doc.save(`stock_camaras_${new Date().toISOString().split('T')[0]}.pdf`)
    } finally {
      setGenerandoPDFcamara(false)
    }
  }

  async function generarPDFConteoSemanal() {
    setGenerandoPDFconteo(true)
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const W = doc.internal.pageSize.getWidth()
      const H = doc.internal.pageSize.getHeight()
      const N  = [212, 82, 26]   // naranja
      const OS = [15, 23, 42]    // oscuro bg
      const ME = [30, 41, 59]    // medio bg
      const TX = [241, 245, 249] // texto claro
      const HS = { fillColor: N, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 }
      const BS = { fillColor: ME, textColor: TX, fontSize: 8 }
      const AS = { fillColor: OS }
      const LI = { lineColor: [51,65,85], lineWidth: 0.1 }
      const hoyStr = new Date().toLocaleDateString('es-AR')
      const secLbl = seccionCS === 'deposito' ? 'DEPÓSITO' : 'CÁMARAS'
      const filasDep = conteoFilasDepo
      const filasCam = conteoFilasCam

      function fondoOscuro() {
        doc.setFillColor(...OS); doc.rect(0, 0, W, H, 'F')
        doc.setFillColor(...N); doc.rect(0, 0, W, 3, 'F')
      }

      // ── P1 PORTADA ───────────────────────────────────────────────────────
      fondoOscuro()
      try { doc.addImage(LOGO_PDF, 'PNG', (W - 64) / 2, 32, 64, 16) } catch {}
      doc.setFillColor(...N); doc.rect(0, H / 2 - 1, W, 2, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(255, 255, 255)
      doc.text('CONTROL DE STOCK SEMANAL', W / 2, H / 2 - 15, { align: 'center' })
      doc.setFontSize(13); doc.setTextColor(...N)
      doc.text(secLbl, W / 2, H / 2 - 5, { align: 'center' })
      doc.setFontSize(10); doc.setTextColor(...TX)
      doc.text(semanaLabel, W / 2, H / 2 + 12, { align: 'center' })
      if (conteoResponsable) doc.text(`Responsable: ${conteoResponsable}`, W / 2, H / 2 + 22, { align: 'center' })
      doc.text(`Fecha de emisión: ${hoyStr}`, W / 2, H / 2 + 32, { align: 'center' })
      doc.setFontSize(10); doc.setTextColor(...N)
      doc.text(`Estado: ${conteoEstado}`, W / 2, H / 2 + 42, { align: 'center' })
      doc.setFontSize(8); doc.setTextColor(100, 116, 139)
      doc.text('CONFIDENCIAL — USO INTERNO', W / 2, H - 14, { align: 'center' })

      // ── P2 RESUMEN EJECUTIVO ──────────────────────────────────────────────
      doc.addPage(); fondoOscuro()
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(255, 255, 255)
      doc.text('RESUMEN EJECUTIVO', 14, 14)

      const contados = seccionCS === 'deposito'
        ? filasDep.filter(f => f.stockFisico !== '').length
        : filasCam.filter(c => c.fisKg !== '').length
      const conDiff = seccionCS === 'deposito'
        ? filasDep.filter(f => { const v = parseFloat(f.stockFisico); return !isNaN(v) && v !== f.stockSistema }).length
        : filasCam.filter(c => { const v = parseFloat(c.fisKg); return !isNaN(v) && v !== c.stockKg }).length
      const sinDiff = contados - conDiff
      const totalProd = seccionCS === 'deposito' ? filasDep.length : filasCam.length
      const impactoUSD = seccionCS === 'deposito'
        ? filasDep.reduce((a, f) => {
            const v = parseFloat(f.stockFisico)
            if (isNaN(v) || v === f.stockSistema) return a
            return a + Math.abs(v - f.stockSistema) * (f.costo_unitario || 0)
          }, 0)
        : 0

      // KPI boxes
      const kpiW = (W - 28 - 9) / 4
      const kpiH = 26; const kpiY = 20
      ;[
        ['TOTAL PRODUCTOS', totalProd],
        ['SIN DIFERENCIAS', sinDiff],
        ['CON DIFERENCIAS', conDiff],
        ['IMPACTO EST.', impactoUSD > 0 ? `$${pesos(impactoUSD)}` : '—'],
      ].forEach(([lbl, val], i) => {
        const x = 14 + i * (kpiW + 3)
        doc.setFillColor(...ME); doc.rect(x, kpiY, kpiW, kpiH, 'F')
        doc.setFillColor(...N); doc.rect(x, kpiY, kpiW, 1.5, 'F')
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(148, 163, 184)
        doc.text(lbl, x + kpiW / 2, kpiY + 7, { align: 'center' })
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255)
        doc.text(String(val), x + kpiW / 2, kpiY + 19, { align: 'center' })
      })

      // Párrafo automático
      let y2 = kpiY + kpiH + 10
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...TX)
      const parr = `Durante ${semanaLabel.toLowerCase()}, se realizó el control de stock de ${totalProd} productos en ${seccionCS === 'deposito' ? 'el depósito' : 'las cámaras'}. Se contaron ${contados} productos, detectándose ${conDiff} diferencia${conDiff !== 1 ? 's' : ''} respecto al stock del sistema${impactoUSD > 0 ? `, con un impacto estimado de $${pesos(impactoUSD)}` : ''}. Responsable: ${conteoResponsable || 'N/A'}.`
      const pLines = doc.splitTextToSize(parr, W - 28)
      doc.text(pLines, 14, y2); y2 += pLines.length * 5 + 10

      // Top 5 diferencias — tabla + gráfico
      const top5 = [...filasDep]
        .map(f => ({ ...f, diff: parseFloat(f.stockFisico) - f.stockSistema }))
        .filter(f => !isNaN(f.diff) && f.diff !== 0)
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
        .slice(0, 5)
      if (conDiff > 0 && seccionCS === 'deposito') {
        // Gráfico NATIVO de barras (reemplaza la captura de pantalla)
        if (top5.length > 0) {
          if (y2 + top5.length * 8 + 14 > H - 20) { doc.addPage(); fondoOscuro(); y2 = PDF_CONTENT_Y }
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(200, 210, 225)
          doc.text('Top diferencias de stock (valor absoluto)', 14, y2); y2 += 5
          const maxV = Math.max(...top5.map(f => Math.abs(f.diff)), 1), bx = 60, bw = W - 14 - bx - 32
          top5.forEach((f, i) => {
            const by = y2 + i * 8
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(215, 222, 235)
            doc.text((f.nombre || '').length > 22 ? f.nombre.slice(0, 21) + '…' : (f.nombre || ''), 14, by + 3.5)
            doc.setFillColor(51, 65, 85); doc.roundedRect(bx, by, bw, 4.5, 0.8, 0.8, 'F')
            doc.setFillColor(...(f.diff < 0 ? [239, 68, 68] : [34, 197, 94])); doc.roundedRect(bx, by, Math.max(1, bw * (Math.abs(f.diff) / maxV)), 4.5, 0.8, 0.8, 'F')
            doc.setTextColor(215, 222, 235); doc.text(`${f.diff > 0 ? '+' : ''}${f.diff.toFixed(1)} ${f.unidad}`, bx + bw + 2, by + 3.5)
          })
          y2 += top5.length * 8 + 10
        }

        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...N)
        doc.text('TOP DIFERENCIAS', 14, y2); y2 += 4
        autoTable(doc, {
          startY: y2, headStyles: HS, bodyStyles: BS, alternateRowStyles: AS, styles: LI,
          margin: { left: 14, right: 14 },
          head: [['PRODUCTO', 'SISTEMA', 'FÍSICO', 'DIFERENCIA', '%']],
          body: top5.map(f => {
            const pct = f.stockSistema > 0 ? (Math.abs(f.diff) / f.stockSistema * 100).toFixed(1) : '—'
            return [f.nombre, `${f.stockSistema.toFixed(2)} ${f.unidad}`, `${parseFloat(f.stockFisico).toFixed(2)} ${f.unidad}`,
              `${f.diff > 0 ? '+' : ''}${f.diff.toFixed(2)} ${f.unidad}`, typeof pct === 'string' ? pct : `${pct}%`]
          }),
        })
      }

      // ── P3 DETALLE DEPÓSITO ───────────────────────────────────────────────
      if (filasDep.length > 0) {
        doc.addPage(); fondoOscuro()
        doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(255, 255, 255)
        doc.text('CONTROL DE STOCK — DEPÓSITO', 14, 14)
        autoTable(doc, {
          startY: 20, headStyles: HS, bodyStyles: BS, alternateRowStyles: AS,
          styles: { ...LI, fontSize: 7.5 }, margin: { left: 12, right: 12, top: 20, bottom: 15 },
          head: [['PRODUCTO', 'CAT.', 'UNIDAD', 'STOCK SISTEMA', 'STOCK FÍSICO', 'DIFERENCIA', 'ESTADO']],
          body: filasDep.map(f => {
            const fis = parseFloat(f.stockFisico)
            const hasFis = !isNaN(fis)
            const diff = hasFis ? fis - f.stockSistema : null
            const pct = diff !== null && f.stockSistema > 0 ? Math.abs(diff / f.stockSistema) * 100 : 0
            const estado = !hasFis ? 'PENDIENTE' : diff === 0 ? 'OK' : pct > 5 ? 'DIF. CRÍTICA' : 'DIF. MENOR'
            return [f.nombre, f.categoria, f.unidad, f.stockSistema.toFixed(2),
              hasFis ? fis.toFixed(2) : '—',
              diff !== null ? `${diff > 0 ? '+' : ''}${diff.toFixed(2)}` : '—',
              estado]
          }),
          didParseCell(data) {
            if (data.section !== 'body') return
            const f = filasDep[data.row.index]; if (!f) return
            const fis = parseFloat(f.stockFisico)
            if (isNaN(fis) || fis === f.stockSistema) return
            const pct = f.stockSistema > 0 ? Math.abs((fis - f.stockSistema) / f.stockSistema) * 100 : 100
            data.cell.styles.fillColor = pct > 5 ? [100, 20, 20] : [100, 70, 10]
            data.cell.styles.textColor = TX
          },
          didDrawPage() { fondoOscuro() },
        })
      }

      // ── P4 DETALLE CÁMARAS ────────────────────────────────────────────────
      if (filasCam.length > 0) {
        doc.addPage(); fondoOscuro()
        doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(255, 255, 255)
        doc.text('CONTROL DE STOCK — CÁMARAS', 14, 14)
        const grupos = [
          { tipo: 'helado',    label: 'HELADOS',     cols: ['SABOR','SIS. BAL.','SIS. KG','FÍS. BAL.','FÍS. KG','DIF. KG','ESTADO'] },
          { tipo: 'impulsivo', label: 'IMPULSIVOS',  cols: ['PRODUCTO','SIS. UNID.','FÍS. UNID.','DIFERENCIA','ESTADO'] },
          { tipo: 'postre',    label: 'POSTRES',     cols: ['PRODUCTO','SIS. UNID.','SIS. KG','FÍS. UNID.','FÍS. KG','DIF.','ESTADO'] },
        ]
        let yC = 20
        for (const g of grupos) {
          const items = filasCam.filter(c => c.tipo === g.tipo)
          if (!items.length) continue
          if (yC > H - 60) { doc.addPage(); fondoOscuro(); yC = 14 }
          doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...N)
          doc.text(g.label, 14, yC + 5); yC += 8
          autoTable(doc, {
            startY: yC, headStyles: HS, bodyStyles: BS, alternateRowStyles: AS,
            styles: { ...LI, fontSize: 7 }, margin: { left: 12, right: 12 },
            head: [g.cols],
            body: items.map(c => {
              const fk = parseFloat(c.fisKg); const fb = parseInt(c.fisBaldes, 10)
              const hasFk = !isNaN(fk); const hasFb = !isNaN(fb)
              const dkg = hasFk ? fk - c.stockKg : null
              const dbl = hasFb ? fb - c.stockBaldes : null
              const estado = !hasFk && !hasFb ? 'PENDIENTE' : (dkg === 0 && dbl === 0) ? 'OK' : 'DIFERENCIA'
              if (g.tipo === 'helado') return [c.nombre, String(c.stockBaldes), `${c.stockKg.toFixed(1)} kg`,
                hasFb ? String(fb) : '—', hasFk ? `${fk.toFixed(1)} kg` : '—',
                dkg !== null ? `${dkg > 0 ? '+' : ''}${dkg.toFixed(1)} kg` : '—', estado]
              if (g.tipo === 'impulsivo') return [c.nombre, String(c.stockBaldes),
                hasFb ? String(fb) : '—', dbl !== null ? `${dbl > 0 ? '+' : ''}${dbl}` : '—', estado]
              return [c.nombre, String(c.stockBaldes), `${c.stockKg.toFixed(1)} kg`,
                hasFb ? String(fb) : '—', hasFk ? `${fk.toFixed(1)} kg` : '—',
                dkg !== null ? `${dkg > 0 ? '+' : ''}${dkg.toFixed(1)}` : '—', estado]
            }),
            didParseCell(data) {
              if (data.section !== 'body') return
              const c = items[data.row.index]; if (!c) return
              const fk = parseFloat(c.fisKg)
              if (!isNaN(fk) && fk !== c.stockKg) {
                data.cell.styles.fillColor = [100, 20, 20]; data.cell.styles.textColor = TX
              }
            },
            didDrawPage() { fondoOscuro() },
          })
          yC = (doc.lastAutoTable?.finalY || yC) + 10
        }
      }

      // ── P5 AJUSTES REALIZADOS (solo si APROBADO) ──────────────────────────
      const ajustesRealizados = filasDep.filter(f => {
        const fis = parseFloat(f.stockFisico)
        return !isNaN(fis) && fis !== f.stockSistema && conteoEstado === 'APROBADO'
      })
      if (ajustesRealizados.length > 0) {
        doc.addPage(); fondoOscuro()
        doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(255, 255, 255)
        doc.text('AJUSTES REALIZADOS', 14, 14)
        autoTable(doc, {
          startY: 20, headStyles: HS, bodyStyles: BS, alternateRowStyles: AS,
          styles: { ...LI, fontSize: 7.5 }, margin: { left: 12, right: 12 },
          head: [['PRODUCTO', 'STOCK ANT.', 'STOCK NUEVO', 'DIFERENCIA', 'APROBADO POR']],
          body: ajustesRealizados.map(f => {
            const fis = parseFloat(f.stockFisico)
            const diff = fis - f.stockSistema
            return [f.nombre, `${f.stockSistema.toFixed(2)} ${f.unidad}`,
              `${fis.toFixed(2)} ${f.unidad}`,
              `${diff > 0 ? '+' : ''}${diff.toFixed(2)} ${f.unidad}`,
              conteoResponsable || '—']
          }),
          didDrawPage() { fondoOscuro() },
        })
      }

      // ── ÚLTIMA PÁGINA FIRMAS ──────────────────────────────────────────────
      doc.addPage(); fondoOscuro()
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(255, 255, 255)
      doc.text('CONFORMIDAD Y FIRMAS', W / 2, 40, { align: 'center' })
      ;['Responsable del conteo', 'Supervisor de producción', 'Gerencia'].forEach((f, i) => {
        const x = [22, W / 2 - 28, W - 82][i]
        doc.setDrawColor(...N); doc.setLineWidth(0.8)
        doc.line(x, H * 0.55, x + 56, H * 0.55)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(148, 163, 184)
        doc.text(f, x + 28, H * 0.55 + 8, { align: 'center' })
        doc.setFontSize(7); doc.text('Fecha: ___/___/___', x, H * 0.55 + 16)
      })

      doc.save(`conteo_${seccionCS}_${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (err) {
      toast2('Error al generar PDF: ' + err.message, 'error')
    } finally {
      setGenerandoPDFconteo(false)
    }
  }


  // ── Informe de VALUACIÓN de stock de depósito (profesional, B&N) ────────────
  async function generarPDFValuacion() {
    setGenerandoPDFValuacion(true)
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pw = doc.internal.pageSize.getWidth()
      const ph = doc.internal.pageSize.getHeight()
      const hoy = new Date().toLocaleString('es-AR')
      const MOD = 'DEPÓSITO', TIT = 'VALUACIÓN DE STOCK'
      const N = [20, 20, 20]
      const money = n => `$${(Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      const num = n => (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })
      const encab = () => dibujarEncabezado(doc, pw, MOD, TIT, hoy)
      const BW_HEAD = { fillColor: [35, 35, 35], textColor: [255, 255, 255], halign: 'center', fontStyle: 'bold', lineWidth: 0.1, lineColor: [180, 180, 180] }
      const BW_BODY = { textColor: [25, 25, 25], halign: 'center', lineWidth: 0.1, lineColor: [210, 210, 210] }
      const tabla = (opts) => autoTable(doc, {
        headStyles: BW_HEAD, bodyStyles: BW_BODY, alternateRowStyles: { fillColor: [244, 244, 244] }, footStyles: BW_HEAD,
        styles: { fontSize: 7.5, cellPadding: 1.8, halign: 'center', valign: 'middle' },
        margin: { top: PDF_CONTENT_Y, left: 14, right: 14 }, didDrawPage: encab, ...opts,
      })

      // Datos
      const items = [...insumos].map(i => ({
        nombre: i.nombre || '—', categoria: i.categoria || 'SIN CATEGORÍA', unidad: i.unidad || 'u',
        stock: Number(i.stock_actual) || 0, min: Number(i.stock_minimo) || 0, max: Number(i.stock_maximo) || 0,
        costo: Number(i.costo_unitario) || 0,
      })).map(i => ({ ...i, valor: i.stock * i.costo, bajo: i.min > 0 && i.stock < i.min, sinCosto: i.costo <= 0 }))
      const valorTotal = items.reduce((a, i) => a + i.valor, 0)
      const bajoMin = items.filter(i => i.bajo).length
      const sinCosto = items.filter(i => i.sinCosto).length
      const cats = {}
      items.forEach(i => { (cats[i.categoria] || (cats[i.categoria] = { items: 0, valor: 0 })); cats[i.categoria].items++; cats[i.categoria].valor += i.valor })
      const catList = Object.entries(cats).map(([k, v]) => ({ categoria: k, ...v })).sort((a, b) => b.valor - a.valor)

      // P1 — Portada
      dibujarPortada(doc, pw, ph, MOD, 'Informe de Valuación de Stock', 'Materia prima e insumos', hoy)

      // P2 — Resumen ejecutivo
      doc.addPage(); encab()
      let y = PDF_CONTENT_Y
      y = dibujarSeccion(doc, pw, 'Resumen ejecutivo', y)
      const kw = (pw - 28 - 6) / 4
      dibujarKpi(doc, 14,            y, kw, 20, 'Artículos', String(items.length))
      dibujarKpi(doc, 14 + (kw+2),   y, kw, 20, 'Categorías', String(catList.length))
      dibujarKpi(doc, 14 + (kw+2)*2, y, kw, 20, 'Bajo mínimo', String(bajoMin))
      dibujarKpi(doc, 14 + (kw+2)*3, y, kw, 20, 'Sin costo', String(sinCosto))
      y += 28
      // Valuación total destacada
      doc.setFillColor(35, 35, 35); doc.roundedRect(14, y, pw - 28, 16, 2, 2, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255)
      doc.text('VALUACIÓN TOTAL DEL DEPÓSITO', 20, y + 6.5)
      doc.setFontSize(14); doc.text(money(valorTotal), pw - 20, y + 10, { align: 'right' })
      y += 24

      // Barra: valuación por categoría (grayscale, B&N)
      y = dibujarSeccion(doc, pw, 'Valuación por categoría', y)
      const top = catList.slice(0, 8)
      const maxV = Math.max(...top.map(c => c.valor), 1)
      const barX = 52, barW = pw - 14 - barX - 40
      top.forEach((c, i) => {
        const by = y + i * 8
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...N)
        doc.text(c.categoria.length > 18 ? c.categoria.slice(0, 17) + '…' : c.categoria, 14, by + 3.5)
        doc.setFillColor(225, 225, 225); doc.roundedRect(barX, by, barW, 4.5, 0.8, 0.8, 'F')
        doc.setFillColor(60, 60, 60); doc.roundedRect(barX, by, Math.max(1, barW * (c.valor / maxV)), 4.5, 0.8, 0.8, 'F')
        doc.setTextColor(...N); doc.text(money(c.valor), barX + barW + 2, by + 3.5)
      })
      y += top.length * 8 + 6

      // Tabla resumen por categoría
      if (y + 30 > ph - 20) { doc.addPage(); encab(); y = PDF_CONTENT_Y }
      y = dibujarSeccion(doc, pw, 'Resumen por categoría', y)
      tabla({
        startY: y,
        head: [['CATEGORÍA', 'ARTÍCULOS', 'VALUACIÓN', '% DEL TOTAL']],
        body: catList.map(c => [c.categoria, String(c.items), money(c.valor), `${valorTotal > 0 ? (c.valor / valorTotal * 100).toFixed(1) : '0'}%`]),
        foot: [['TOTAL', String(items.length), money(valorTotal), '100%']],
      })
      y = doc.lastAutoTable.finalY + 8

      // Detalle completo por artículo (ordenado por categoría y nombre)
      if (y + 30 > ph - 20) { doc.addPage(); encab(); y = PDF_CONTENT_Y }
      y = dibujarSeccion(doc, pw, 'Detalle por artículo', y)
      const det = [...items].sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre))
      tabla({
        startY: y,
        head: [['PRODUCTO', 'CATEGORÍA', 'UN.', 'STOCK', 'MÍN', 'MÁX', 'COSTO UNIT', 'VALUACIÓN', 'ESTADO']],
        body: det.map(i => [
          i.nombre, i.categoria, i.unidad, num(i.stock), num(i.min), num(i.max),
          i.sinCosto ? 's/costo' : money(i.costo), money(i.valor),
          i.sinCosto ? 'sin costo' : i.bajo ? 'BAJO MÍN.' : i.stock <= 0 ? 'sin stock' : 'OK',
        ]),
        foot: [['', '', '', '', '', '', 'TOTAL', money(valorTotal), '']],
        columnStyles: { 0: { halign: 'left' } },
        didParseCell: (d) => {
          if (d.section !== 'body') return
          const r = det[d.row.index]; if (!r) return
          if (r.bajo && d.column.index === 8) { d.cell.styles.textColor = [190, 30, 30]; d.cell.styles.fontStyle = 'bold' }
        },
      })
      y = doc.lastAutoTable.finalY + 8

      // Firmas
      if (y + 24 > ph - 20) { doc.addPage(); encab(); y = PDF_CONTENT_Y }
      dibujarFirmas(doc, pw, ph, y, MOD, hoy, ['Responsable Depósito', 'Administración'])
      const totalPag = doc.internal.getNumberOfPages()
      for (let p = 2; p <= totalPag; p++) { doc.setPage(p); dibujarPie(doc, pw, ph, p) }
      doc.save(`valuacion-deposito-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (err) {
      toast2(err.message || 'No se pudo generar la valuación', 'error')
    } finally {
      setGenerandoPDFValuacion(false)
    }
  }

  async function generarPDFStock() {
    setGenerandoPDFstock(true)
    try {
      const doc  = new jsPDF({ unit: 'mm', format: 'a4' })
      const pw   = doc.internal.pageSize.getWidth()
      const ph   = doc.internal.pageSize.getHeight()
      const hoy  = new Date().toLocaleString('es-AR')
      const peri = `${fmtFecha(rangoCS.desde)} – ${fmtFecha(rangoCS.hasta)}`
      const MOD  = 'DEPÓSITO'
      const EST  = getEstiloInforme()

      const totalInsumos = controlSemanal.length
      const criticos     = controlSemanal.filter(r => r.estado === 'CRÍTICO').length
      const atencion     = controlSemanal.filter(r => r.estado === 'ATENCIÓN').length
      const conDiff      = controlSemanal.filter(r => r.pctDiferencia > 3).length
      const totalIng     = controlSemanal.reduce((a, r) => a + r.ingresosKg, 0)
      const totalEgr     = controlSemanal.reduce((a, r) => a + r.egresosKg, 0)

      // P1 — Portada
      dibujarPortada(doc, pw, ph, MOD, 'CONTROL DE STOCK', peri, hoy)

      // P2 — Resumen ejecutivo
      doc.addPage()
      dibujarEncabezado(doc, pw, MOD, 'RESUMEN EJECUTIVO', hoy)
      dibujarPie(doc, pw, ph, 2)
      const kpiW = (pw - 28 - 6) / 4
      ;[
        ['Total insumos', totalInsumos],
        ['Estado crítico', criticos],
        ['En atención', atencion],
        ['Diferencias > 3%', conDiff],
      ].forEach(([lbl, val], i) => dibujarKpi(doc, 14 + i * (kpiW + 2), PDF_CONTENT_Y, kpiW, 20, lbl, val))

      // Gráfico NATIVO: reposición — días de stock de los más urgentes
      let y2 = PDF_CONTENT_Y + 28
      const urgentes = [...controlSemanal].filter(r => r.consumoPromDiario > 0 && r.diasStock >= 0 && r.diasStock < 60)
        .sort((a, b) => a.diasStock - b.diasStock).slice(0, 8)
      if (urgentes.length) {
        y2 = dibujarSeccion(doc, pw, 'Reposición — días de stock restante', y2)
        const maxV = Math.max(...urgentes.map(r => r.diasStock), 1), bx = 62, bw = pw - 14 - bx - 30
        urgentes.forEach((r, i) => {
          const by = y2 + i * 8
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...PDF_NEGRO)
          doc.text((r.nombre || '').length > 26 ? r.nombre.slice(0, 25) + '…' : (r.nombre || ''), 14, by + 3.5)
          doc.setFillColor(230, 230, 230); doc.roundedRect(bx, by, bw, 4.5, 0.8, 0.8, 'F')
          const col = r.diasStock < 3 ? [190, 30, 30] : r.diasStock < 7 ? [210, 140, 20] : [90, 90, 90]
          doc.setFillColor(...col); doc.roundedRect(bx, by, Math.max(1, bw * (r.diasStock / maxV)), 4.5, 0.8, 0.8, 'F')
          doc.setTextColor(...PDF_NEGRO); doc.text(`${r.diasStock.toFixed(0)} días`, bx + bw + 2, by + 3.5)
        })
        y2 += urgentes.length * 8 + 10
      }
      y2 = dibujarSeccion(doc, pw, 'Análisis del período', y2)
      const criticosList = controlSemanal.filter(r => r.estado === 'CRÍTICO').map(r => r.nombre).join(', ')
      const mayorDiff    = [...controlSemanal].filter(r => r.pctDiferencia > 3).sort((a, b) => b.pctDiferencia - a.pctDiferencia)[0]
      const reposicion   = controlSemanal.filter(r => r.diasStock < 7 && r.consumoPromDiario > 0).map(r => r.nombre)
      const parrafos     = [
        `Período ${peri}: ingresos ${totalIng.toFixed(1)} uds/kg · egresos ${totalEgr.toFixed(1)} uds/kg.`,
        criticos > 0 ? `${criticos} producto${criticos === 1 ? '' : 's'} con stock crítico: ${criticosList}.` : 'Sin stock crítico en el período.',
        mayorDiff ? `${conDiff} producto${conDiff === 1 ? '' : 's'} con diferencia de inventario. Mayor: ${mayorDiff.nombre} (${mayorDiff.pctDiferencia.toFixed(1)}%).` : 'Sin diferencias significativas de inventario.',
        reposicion.length > 0 ? `Reposición recomendada: ${reposicion.join(', ')}.` : null,
      ].filter(Boolean)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(50, 50, 50)
      parrafos.forEach(p => {
        const wrapped = doc.splitTextToSize(`• ${p}`, pw - 28)
        doc.text(wrapped, 14, y2); y2 += wrapped.length * 5 + 2
      })

      // P3 — Tabla completa
      doc.addPage()
      const bodyTabla = [
        ...controlSemanal.map(r => [
          r.nombre, `${r.stockInicial.toFixed(1)} ${r.unidad || ''}`.trim(),
          r.ingresosKg.toFixed(1), r.egresosKg.toFixed(1), r.stockSistema.toFixed(1),
          r.conteoFisico !== null ? r.conteoFisico.toFixed(1) : '—',
          r.diferencia !== null ? `${r.diferencia > 0 ? '+' : ''}${r.diferencia.toFixed(2)}` : '—',
          r.diasStock === Infinity ? '♾' : r.diasStock.toFixed(0), r.estado,
        ]),
        ['TOTAL', '',
          controlSemanal.reduce((a, r) => a + r.ingresosKg, 0).toFixed(1),
          controlSemanal.reduce((a, r) => a + r.egresosKg, 0).toFixed(1),
          controlSemanal.reduce((a, r) => a + r.stockSistema, 0).toFixed(1),
          '', '', '', ''],
      ]
      autoTable(doc, {
        ...EST, styles: { ...EST.styles, fontSize: 7 },
        startY: PDF_CONTENT_Y,
        head: [['PRODUCTO', 'ST.INICIAL', 'INGRESOS', 'EGRESOS', 'ST.SISTEMA', 'C.FÍSICO', 'DIF.', 'DÍAS', 'ESTADO']],
        body: bodyTabla,
        didParseCell(data) {
          if (data.section !== 'body') return
          const row = controlSemanal[data.row.index]
          if (!row) return
          if (row.estado === 'CRÍTICO') data.cell.styles.fillColor = [238, 210, 210]
          else if (row.estado === 'ATENCIÓN') data.cell.styles.fillColor = [238, 232, 210]
        },
        didDrawPage: () => {
          dibujarEncabezado(doc, pw, MOD, 'TABLA DE STOCK', hoy)
          dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
        },
      })

      // P4 — Análisis de inventario
      const faltantes = controlSemanal.filter(r => r.diferencia !== null && r.diferencia < 0)
      const sobrantes = controlSemanal.filter(r => r.diferencia !== null && r.diferencia > 0)
      doc.addPage()
      dibujarEncabezado(doc, pw, MOD, 'ANÁLISIS DE INVENTARIO', hoy)
      dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
      let yInv = dibujarSeccion(doc, pw, 'A — Faltantes', PDF_CONTENT_Y)
      if (faltantes.length === 0) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...PDF_GRIS_OSC)
        doc.text('Sin faltantes detectados.', 14, yInv); yInv += 10
      } else {
        autoTable(doc, {
          ...EST, styles: { ...EST.styles, fontSize: 7 }, startY: yInv,
          head: [['PRODUCTO', 'ST. SISTEMA', 'CONTEO FÍS.', 'FALTANTE', '%', 'CAUSA PROBABLE']],
          body: faltantes.map(r => {
            const causa = r.pctDiferencia < 3 ? 'Dentro del margen normal'
              : r.pctDiferencia > 10 ? 'Posible error de registro o merma'
              : r.egresosKg > r.ingresosKg * 2 ? 'Alto consumo en el período'
              : r.ingresosKg === 0 ? 'Sin reposición reciente'
              : 'Requiere revisión'
            return [r.nombre, r.stockSistema.toFixed(2), r.conteoFisico.toFixed(2),
              Math.abs(r.diferencia).toFixed(2), `${r.pctDiferencia.toFixed(1)}%`, causa]
          }),
          didDrawPage: () => {
            dibujarEncabezado(doc, pw, MOD, 'ANÁLISIS DE INVENTARIO', hoy)
            dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
          },
        })
        yInv = doc.lastAutoTable.finalY + 8
      }
      yInv = dibujarSeccion(doc, pw, 'B — Sobrantes', yInv)
      if (sobrantes.length === 0) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...PDF_GRIS_OSC)
        doc.text('Sin sobrantes detectados.', 14, yInv)
      } else {
        autoTable(doc, {
          ...EST, styles: { ...EST.styles, fontSize: 7 }, startY: yInv,
          head: [['PRODUCTO', 'ST. SISTEMA', 'CONTEO FÍS.', 'SOBRANTE', '%', 'CAUSA PROBABLE']],
          body: sobrantes.map(r => {
            const causa = r.pctDiferencia > 20 ? 'Posible ingreso no registrado'
              : r.ingresosKg > 0 && r.egresosKg === 0 ? 'Ingreso reciente sin consumo'
              : 'Verificar'
            return [r.nombre, r.stockSistema.toFixed(2), r.conteoFisico.toFixed(2),
              r.diferencia.toFixed(2), `${r.pctDiferencia.toFixed(1)}%`, causa]
          }),
          didDrawPage: () => {
            dibujarEncabezado(doc, pw, MOD, 'ANÁLISIS DE INVENTARIO', hoy)
            dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
          },
        })
      }

      // P5 — Recomendaciones de reposición
      const recomendaciones = controlSemanal
        .filter(r => r.consumoPromDiario > 0 && r.diasStock < 14)
        .sort((a, b) => a.diasStock - b.diasStock)
      doc.addPage()
      autoTable(doc, {
        ...EST, startY: PDF_CONTENT_Y,
        head: [['URGENCIA', 'PRODUCTO', 'STOCK ACTUAL', 'CONSUMO/DÍA', 'DÍAS REST.', 'CANT. SUGERIDA']],
        body: recomendaciones.length === 0
          ? [['—', 'Sin productos que requieran reposición inmediata', '', '', '', '']]
          : recomendaciones.map(r => [
              r.diasStock < 3 ? 'URGENTE' : 'PRONTO',
              r.nombre,
              `${r.stockSistema.toFixed(1)} ${r.unidad || ''}`.trim(),
              `${r.consumoPromDiario.toFixed(1)}/día`,
              r.diasStock === Infinity ? '♾' : `${r.diasStock.toFixed(0)} días`,
              `${(r.consumoPromDiario * 14).toFixed(1)} ${r.unidad || ''}`.trim(),
            ]),
        didParseCell(data) {
          if (data.section !== 'body') return
          if (recomendaciones[data.row.index]?.diasStock < 3)
            data.cell.styles.fillColor = [238, 210, 210]
        },
        didDrawPage: () => {
          dibujarEncabezado(doc, pw, MOD, 'RECOMENDACIONES DE REPOSICIÓN', hoy)
          dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
        },
      })

      // Firmas (al final del contenido; salta de hoja solo si no entran)
      dibujarFirmas(doc, pw, ph, doc.lastAutoTable?.finalY, MOD, hoy, ['Responsable de Depósito', 'Supervisor', 'Gerente'])

      doc.save(`control_stock_${new Date().toISOString().split('T')[0]}.pdf`)
    } finally {
      setGenerandoPDFstock(false)
    }
  }

  function imprimirTrazabilidad() {
    const w = window.open('', '_blank')
    const filas = egresos.map(e => `
      <tr>
        <td>${formatFechaMov(e)}</td><td>${e.producto_nombre || ''}</td><td>${e.marca || ''}</td>
        <td>${e.presentacion || ''}</td><td class="r">${e.cantidad || ''}</td>
        <td>${e.lote || ''}</td><td>${e.fecha_vencimiento || ''}</td>
        <td>${e.controlo || ''}</td><td>${e.observaciones || ''}</td>
        <td>${e.destino || ''}</td>
      </tr>`).join('')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Trazabilidad — Del Parque</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:10px;padding:20px}
      .banner{background:#141414;color:#fff;padding:5px 14px;font-size:8px;font-weight:700;letter-spacing:.5px;display:flex;justify-content:space-between;margin:-20px -20px 14px}
      .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:8px;border-bottom:2px solid #141414;margin-bottom:12px}
      .logo-img{height:26px;display:block}
      .title{font-size:12px;font-weight:700;color:#141414}
      .sub{font-size:8px;color:#666;margin-top:2px}
      table{width:100%;border-collapse:collapse}
      th{background:#141414;color:#fff;font-size:7.5px;font-weight:700;text-transform:uppercase;padding:5px 6px;text-align:left}
      td{padding:4px 6px;border-bottom:1px solid #e8e8e8;font-size:8.5px}
      tr:nth-child(even) td{background:#f5f5f5}
      .r{text-align:right}
      .firmas{display:flex;gap:24px;margin-top:40px}
      .firma{flex:1;border-top:1.5px solid #141414;padding-top:6px;font-size:8px;color:#555}
      @media print{body{padding:0}.banner{margin:0 0 12px}}
    </style></head><body>
    <div class="banner"><span>DEPÓSITO</span><span>DEL PARQUE</span></div>
    <div class="header">
      <img src="${logoUrl}" class="logo-img" alt="Del Parque" />
      <div style="text-align:right">
        <div class="title">TRAZABILIDAD — EGRESO DE MATERIALES</div>
        <div class="sub">${new Date().toLocaleDateString('es-AR')}</div>
      </div>
    </div>
    <table>
      <thead><tr>
        <th>Fecha</th><th>Producto</th><th>Marca</th><th>Presentación</th><th class="r">Cant.</th>
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
    const pw  = doc.internal.pageSize.getWidth()
    const ph  = doc.internal.pageSize.getHeight()
    const hoy = new Date().toLocaleString('es-AR')
    const MOD = 'DEPÓSITO'
    const TIT = 'TRAZABILIDAD — EGRESOS'
    const EST = getEstiloInforme()

    // Costo por producto para valorizar el egreso en $
    const costo = {}
    insumos.forEach(i => { costo[(i.nombre || '').trim().toLowerCase()] = i.costo_unitario || 0 })
    const valorDe = e => (Number(e.cantidad) || 0) * (costo[(e.producto_nombre || '').trim().toLowerCase()] || 0)

    autoTable(doc, {
      ...EST, styles: { ...EST.styles, fontSize: 7 },
      startY: PDF_CONTENT_Y,
      head: [['Fecha', 'Producto', 'Marca', 'Cant.', 'Lote', 'Retira', 'Controló', 'Observ.', 'Destino', 'Valor $']],
      body: egresos.map(e => [
        formatFechaMov(e), e.producto_nombre || '', e.marca || '',
        `${e.cantidad ?? ''} ${e.unidad || ''}`.trim(), e.lote || '', e.operario_recibe || '',
        e.controlo || '', e.observaciones || '', e.destino || '', `$${pesos(valorDe(e))}`,
      ]),
      columnStyles: { 9: { halign: 'right' } },
      didDrawPage: () => {
        dibujarEncabezado(doc, pw, MOD, TIT, hoy)
        dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
      },
    })

    // Firmas al pie si hay espacio
    const finalY = (doc.lastAutoTable?.finalY || PDF_CONTENT_Y) + 10
    if (finalY < ph - 30) {
      const gap = (pw - 28) / 3
      ;['Responsable de Depósito', 'Jefe de Producción', 'Gerencia / Calidad'].forEach((label, i) => {
        const x = 14 + i * gap
        doc.setDrawColor(...PDF_NEGRO); doc.setLineWidth(0.3)
        doc.line(x, finalY + 6, x + gap - 8, finalY + 6)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(80, 80, 80)
        doc.text(label, x, finalY + 11)
      })
    }

    doc.save(`trazabilidad_delparque_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  function _periodoLabel() {
    if (informeMes === 0 && informeAnio === 0) return 'Todo el período'
    if (informeMes === 0) return String(informeAnio)
    if (informeAnio === 0) return MESES[informeMes - 1]
    return `${MESES[informeMes - 1]} ${informeAnio}`
  }

  async function exportarInformePDF() {
    setGenerandoPDFInforme(true)
    try {
      if (informeVista === 'proveedores') await _pdfProveedores()
      else if (informeVista === 'destinos') await _pdfDestinos()
      else if (informeVista === 'egresos') await _pdfEgresosEjecutivo()
      else await _pdfOperarios()
    } finally {
      setGenerandoPDFInforme(false)
    }
  }

  async function _pdfProveedores() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pw  = doc.internal.pageSize.getWidth()
    const ph  = doc.internal.pageSize.getHeight()
    const hoy = new Date().toLocaleString('es-AR')
    const periodo = _periodoLabel()
    const MOD = 'DEPÓSITO'
    const EST = getEstiloInforme()

    const totalIngresos = comprasPorProveedor.reduce((a, g) => a + g.items.length, 0)
    const totalUnidades = comprasPorProveedor.reduce((a, g) => a + g.total, 0)
    const productoCounts = {}
    movsInforme.filter(m => m.tipo === 'ingreso').forEach(m => {
      const k = m.producto_nombre || 'Sin nombre'
      productoCounts[k] = (productoCounts[k] || 0) + (Number(m.cantidad) || 0)
    })
    const masComprado = Object.entries(productoCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'

    // P1 — Portada
    dibujarPortada(doc, pw, ph, MOD, 'COMPRAS POR PROVEEDOR', periodo, hoy)

    // P2 — Resumen ejecutivo
    doc.addPage()
    dibujarEncabezado(doc, pw, MOD, 'RESUMEN EJECUTIVO', hoy)
    dibujarPie(doc, pw, ph, 2)
    const kpiW = (pw - 28 - 4) / 2
    dibujarKpi(doc, 14, PDF_CONTENT_Y, kpiW, 20, 'Total ingresos', totalIngresos)
    dibujarKpi(doc, 14 + kpiW + 4, PDF_CONTENT_Y, kpiW, 20, 'Proveedores activos', comprasPorProveedor.length)
    let y2 = PDF_CONTENT_Y + 28
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(50, 50, 50)
    const p1Prov = `Durante el período ${periodo}, se registraron ${totalIngresos} ingreso${totalIngresos !== 1 ? 's' : ''} de ${comprasPorProveedor.length} proveedor${comprasPorProveedor.length !== 1 ? 'es' : ''}, totalizando ${totalUnidades.toLocaleString('es-AR', { maximumFractionDigits: 2 })} uds/kg. Producto más comprado: ${masComprado}.`
    doc.text(doc.splitTextToSize(`• ${p1Prov}`, pw - 28), 14, y2)

    // P3+ — Detalle por proveedor
    for (const grupo of comprasPorProveedor) {
      doc.addPage()
      autoTable(doc, {
        ...EST, startY: PDF_CONTENT_Y,
        head: [['FECHA', 'PRODUCTO', 'CANTIDAD', 'UNIDAD', 'LOTE', 'VENCIMIENTO']],
        body: grupo.items.map(m => [
          formatFecha(m.created_at), m.producto_nombre || '—',
          String(m.cantidad ?? '—'), m.unidad || '—', m.lote || '—',
          m.fecha_vencimiento ? fmtFecha(m.fecha_vencimiento) : '—',
        ]),
        foot: [[{ content: `SUBTOTAL: ${grupo.items.length} ingresos · ${grupo.total.toFixed(2)} uds/kg`, colSpan: 6, styles: { ...EST.footStyles, halign: 'right' } }]],
        didDrawPage: () => {
          dibujarEncabezado(doc, pw, MOD, `PROVEEDOR: ${grupo.proveedor}`, hoy)
          dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
        },
      })
    }

    // Firmas (al final del contenido; salta de hoja solo si no entran)
    dibujarFirmas(doc, pw, ph, doc.lastAutoTable?.finalY, MOD, hoy, ['Responsable de Compras', 'Gerencia', 'Fecha'])
    doc.save(`compras_proveedor_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  async function _pdfDestinos() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pw  = doc.internal.pageSize.getWidth()
    const ph  = doc.internal.pageSize.getHeight()
    const hoy = new Date().toLocaleString('es-AR')
    const periodo = _periodoLabel()
    const MOD = 'DEPÓSITO'
    const EST = getEstiloInforme()

    const totalEgresos  = destinoMercaderia.reduce((a, g) => a + g.items.length, 0)
    const totalUnidades = destinoMercaderia.reduce((a, g) => a + g.total, 0)

    // P1 — Portada
    dibujarPortada(doc, pw, ph, MOD, 'DESTINO DE MERCADERÍA', periodo, hoy)

    // P2 — Resumen
    doc.addPage()
    dibujarEncabezado(doc, pw, MOD, 'RESUMEN EJECUTIVO', hoy)
    dibujarPie(doc, pw, ph, 2)
    const kpiW = (pw - 28 - 4) / 2
    dibujarKpi(doc, 14, PDF_CONTENT_Y, kpiW, 20, 'Total egresos', totalEgresos)
    dibujarKpi(doc, 14 + kpiW + 4, PDF_CONTENT_Y, kpiW, 20, 'Destinos distintos', destinoMercaderia.length)
    let y2d = PDF_CONTENT_Y + 28
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(50, 50, 50)
    const p1Dest = `Durante el período ${periodo}, se registraron ${totalEgresos} egreso${totalEgresos !== 1 ? 's' : ''} en ${destinoMercaderia.length} destino${destinoMercaderia.length !== 1 ? 's' : ''}, totalizando ${totalUnidades.toLocaleString('es-AR', { maximumFractionDigits: 2 })} uds/kg.`
    doc.text(doc.splitTextToSize(`• ${p1Dest}`, pw - 28), 14, y2d)

    // P3+ — Detalle por destino
    for (const grupo of destinoMercaderia) {
      doc.addPage()
      autoTable(doc, {
        ...EST, startY: PDF_CONTENT_Y,
        head: [['FECHA', 'PRODUCTO', 'CANTIDAD', 'LOTE', 'RECIBIÓ']],
        body: grupo.items.map(m => [
          formatFecha(m.created_at), m.producto_nombre || '—',
          formatCantidad(m), m.lote || '—', m.operario_recibe || '—',
        ]),
        foot: [[{ content: `SUBTOTAL: ${grupo.items.length} egresos · ${grupo.total.toFixed(2)} uds/kg`, colSpan: 5, styles: { ...EST.footStyles, halign: 'right' } }]],
        didDrawPage: () => {
          dibujarEncabezado(doc, pw, MOD, `DESTINO: ${grupo.destino}`, hoy)
          dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
        },
      })
    }

    // Firmas (al final del contenido; salta de hoja solo si no entran)
    dibujarFirmas(doc, pw, ph, doc.lastAutoTable?.finalY, MOD, hoy, ['Responsable de Depósito', 'Gerencia', 'Fecha'])
    doc.save(`destino_mercaderia_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  // ── Informe Ejecutivo de Egresos (para presentar a los dueños) ──────────────
  async function _pdfEgresosEjecutivo() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pw = doc.internal.pageSize.getWidth()
    const ph = doc.internal.pageSize.getHeight()
    const hoy = new Date().toLocaleString('es-AR')
    const periodo = _periodoLabel()
    const MOD = 'DEPÓSITO'
    const EST = getEstiloInforme()
    const didDP = tit => () => { dibujarEncabezado(doc, pw, MOD, tit, hoy); dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber) }

    // Costo por producto (match por nombre normalizado: ignora tildes/espacios)
    const costo = {}
    insumos.forEach(i => { costo[normalizarNombre(i.nombre)] = i.costo_unitario || 0 })
    const valorDe = m => (Number(m.cantidad) || 0) * (costo[normalizarNombre(m.producto_nombre)] || 0)
    const sinCosto = m => !(costo[normalizarNombre(m.producto_nombre)] > 0)
    const esAjuste = m => /ajuste de inventario/i.test(m.motivo || '') || /ajuste de inventario/i.test(m.observaciones || '')

    const egr = movsInforme.filter(m => m.tipo === 'egreso')

    const PROD = new Set(['Bases', 'Sabores', 'Postres', 'Impulsivos', 'Escocés', 'Bombones', 'Panadería'])
    const bucketDe = m => esAjuste(m) ? 'Ajuste' : PROD.has(m.destino) ? 'Producción' : (m.destino === 'Venta' ? 'Venta' : (m.destino === 'Uso interno' ? 'Uso interno' : 'Otro'))
    const bd = {}
    egr.forEach(m => { const b = bucketDe(m); if (!bd[b]) bd[b] = { n: 0, val: 0 }; bd[b].n++; bd[b].val += valorDe(m) })

    const pp = {}
    egr.forEach(m => { const k = m.producto_nombre || '—'; if (!pp[k]) pp[k] = { nombre: k, cant: 0, val: 0, dest: {} }; pp[k].cant += Number(m.cantidad) || 0; pp[k].val += valorDe(m); pp[k].dest[m.destino || '—'] = (pp[k].dest[m.destino || '—'] || 0) + 1 })
    const topProd = Object.values(pp).sort((a, b) => b.val - a.val).slice(0, 10)

    const pr = {}
    egr.forEach(m => { const k = m.operario_recibe || 'Sin asignar'; if (!pr[k]) pr[k] = { k, n: 0, val: 0 }; pr[k].n++; pr[k].val += valorDe(m) })
    const topRet = Object.values(pr).sort((a, b) => b.val - a.val)

    const aOtro = egr.filter(m => m.destino === 'Otro')
    const aAjuste = egr.filter(esAjuste)
    const aSinCosto = egr.filter(sinCosto)
    const sinCostoProd = [...new Set(aSinCosto.map(m => m.producto_nombre || '—'))].sort()

    // Portada
    dibujarPortada(doc, pw, ph, MOD, 'Informe Ejecutivo de Egresos', periodo, hoy)

    // Distribución REAL: producción = MP calculada por receta (no lo registrado)
    const regGet = k => bd[k]?.val || 0
    const realBuckets = [
      { k: 'Producción (calculada por receta)', val: costeoProd.total, col: PDF_SEM_OK },
      { k: 'Venta', val: regGet('Venta'), col: [59, 130, 246] },
      { k: 'Uso interno', val: regGet('Uso interno'), col: PDF_SEM_CRIT },
      { k: 'Otro', val: regGet('Otro'), col: PDF_SEM_NEG },
    ].filter(b => b.val > 0)
    const realTotal = realBuckets.reduce((a, b) => a + b.val, 0)
    const realPctProd = realTotal > 0 ? Math.round(costeoProd.total / realTotal * 100) : 0
    const realNoProd = regGet('Uso interno') + regGet('Otro')

    // Resumen
    doc.addPage(); didDP('Resumen Ejecutivo')()
    const cards = [
      ['Total a costo (real)', `$${pesos(realTotal)}`, PDF_SEM_NEG],
      ['Producción (receta)', `$${pesos(costeoProd.total)}`, PDF_SEM_OK],
      ['% Productivo', `${realPctProd}%`, PDF_SEM_OK],
      ['No productivo', `$${pesos(realNoProd)}`, PDF_SEM_CRIT],
    ]
    const gap = 4, cw = (pw - 28 - gap * 3) / 4, ch = 22, cy = PDF_CONTENT_Y - 2
    cards.forEach((c, i) => dibujarKpiCard(doc, 14 + i * (cw + gap), cy, cw, ch, c[0], c[1], c[2]))
    let y = cy + ch + 9

    if (costeoProd.sinReceta.length || costeoProd.sinCosto.length) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...PDF_SEM_CRIT)
      doc.text('La produccion esta INCOMPLETA: hay productos sin receta / insumos sin costo (ver pagina de MP). El costo real es mayor.', 14, y)
      y += 6
    }

    y = dibujarSeccion(doc, pw, 'A dónde se fue la plata (producción por receta + egresos registrados)', y)
    const totB = realTotal || 1
    let bx = 14; const bw = pw - 28, bh = 7
    realBuckets.forEach(b => { const w = b.val / totB * bw; if (w <= 0) return; doc.setFillColor(...b.col); doc.rect(bx, y, w, bh, 'F'); if (w > 8) { doc.setTextColor(...PDF_BLANCO); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.text(`${Math.round(b.val / totB * 100)}%`, bx + w / 2, y + bh / 2 + 1.4, { align: 'center' }) } bx += w })
    y += bh + 5
    autoTable(doc, { ...EST, startY: y, head: [['Categoría', 'Valor $', '% del total']], body: realBuckets.map(b => [b.k, `$${pesos(b.val)}`, `${Math.round((b.val / totB) * 100)}%`]), columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } }, didDrawPage: didDP('Resumen Ejecutivo') })
    y = doc.lastAutoTable.finalY + 8

    if (y > ph - 60) { doc.addPage(); didDP('Resumen Ejecutivo')(); y = PDF_CONTENT_Y }
    y = dibujarSeccion(doc, pw, 'Top productos por valor egresado', y)
    autoTable(doc, { ...EST, startY: y, head: [['Producto', 'Cantidad', 'Destino principal', 'Valor $']], body: topProd.map(p => { const dp = Object.entries(p.dest).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'; return [p.nombre, p.cant.toLocaleString('es-AR', { maximumFractionDigits: 1 }), dp, `$${pesos(p.val)}`] }), columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' } }, didDrawPage: didDP('Resumen Ejecutivo') })
    y = doc.lastAutoTable.finalY + 8

    if (y > ph - 50) { doc.addPage(); didDP('Resumen Ejecutivo')(); y = PDF_CONTENT_Y }
    y = dibujarSeccion(doc, pw, 'Quién retira (responsable del egreso)', y)
    autoTable(doc, { ...EST, startY: y, head: [['Retira / Solicita', 'Movimientos', 'Valor $']], body: topRet.map(r => [r.k, String(r.n), `$${pesos(r.val)}`]), columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } }, didDrawPage: didDP('Resumen Ejecutivo') })

    // ── MP a producción calculada por receta (backflush) ──────────────────────
    doc.addPage(); didDP('MP a Producción (calculada)')()
    y = dibujarSeccion(doc, pw, 'Materia prima a producción — calculada por receta', PDF_CONTENT_Y)
    const regProd = bd['Producción']?.val || 0
    dibujarKpiCard(doc, 14, y, (pw - 28 - 4) / 2, 22, 'Calculado por receta (real)', `$${pesos(costeoProd.total)}`, PDF_SEM_OK)
    dibujarKpiCard(doc, 14 + (pw - 28 - 4) / 2 + 4, y, (pw - 28 - 4) / 2, 22, 'Registrado como egreso', `$${pesos(regProd)}`, PDF_SEM_CRIT)
    y += 22 + 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(70, 70, 70)
    const metodo = `Calculado desde ${costeoProd.nMovs} ingresos a cámara del período: se explota cada producto a su materia prima (incluida la base de cada sabor, prorrateada por el rinde del batch) y se costea a valores actuales. Refleja la MP realmente consumida en producción, más allá de lo que se registró a mano como egreso.`
    doc.splitTextToSize(metodo, pw - 28).forEach((l, i) => doc.text(l, 14, y + i * 4)); y += doc.splitTextToSize(metodo, pw - 28).length * 4 + 6
    y = dibujarSeccion(doc, pw, 'Detalle por insumo (consumo del período)', y)
    autoTable(doc, {
      ...EST, styles: { ...EST.styles, fontSize: 7 }, startY: y,
      head: [['Insumo', 'Cantidad', 'Valor $']],
      body: costeoProd.porInsumo.map(p => [p.nombre, p.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 }), `$${pesos(p.valor)}`]),
      foot: [['TOTAL', '', `$${pesos(costeoProd.total)}`]],
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      footStyles: { fillColor: PDF_NEGRO, textColor: PDF_BLANCO, fontStyle: 'bold' },
      didDrawPage: didDP('MP a Producción (calculada)'),
    })
    y = doc.lastAutoTable.finalY + 6
    if (costeoProd.sinReceta.length || costeoProd.sinCosto.length) {
      if (y > ph - PDF_PIE_H - 20) { doc.addPage(); didDP('MP a Producción (calculada)')(); y = PDF_CONTENT_Y }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...PDF_SEM_CRIT)
      if (costeoProd.sinReceta.length) { const t = doc.splitTextToSize(`Sin receta (no costeados): ${costeoProd.sinReceta.join(', ')}`, pw - 28); t.forEach((l, i) => doc.text(l, 14, y + i * 3.6)); y += t.length * 3.6 + 2 }
      if (costeoProd.sinCosto.length) { const t = doc.splitTextToSize(`Insumos sin costo cargado (valen $0): ${costeoProd.sinCosto.join(', ')}`, pw - 28); t.forEach((l, i) => { if (y > ph - PDF_PIE_H - 6) { doc.addPage(); didDP('MP a Producción (calculada)')(); y = PDF_CONTENT_Y } doc.text(l, 14, y); y += 3.6 }) }
    }

    // Alertas
    doc.addPage(); didDP('Alertas de Control')()
    y = dibujarSeccion(doc, pw, 'Alertas de control', PDF_CONTENT_Y)
    const tint = c => [Math.round(c[0] + (255 - c[0]) * 0.86), Math.round(c[1] + (255 - c[1]) * 0.86), Math.round(c[2] + (255 - c[2]) * 0.86)]
    const alerta = (col, titulo, detalle) => {
      if (y > ph - 24) { doc.addPage(); didDP('Alertas de Control')(); y = PDF_CONTENT_Y }
      doc.setFillColor(...tint(col)); doc.setDrawColor(...col); doc.setLineWidth(0.3); doc.rect(14, y, pw - 28, 11, 'FD')
      doc.setFillColor(...col); doc.rect(14, y, 1.6, 11, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...col); doc.text(titulo, 18, y + 4.6)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(70, 70, 70); doc.text(doc.splitTextToSize(detalle, pw - 36)[0] || '', 18, y + 8.6)
      y += 14
    }
    // Tabla de detalle (con fecha) debajo de una alerta
    const tablaAlerta = items => {
      autoTable(doc, {
        ...EST, styles: { ...EST.styles, fontSize: 7 }, startY: y,
        head: [['Fecha', 'Producto', 'Cant.', 'Retira', 'Valor $']],
        body: items.map(m => [formatFechaMov(m), m.producto_nombre || '—', `${m.cantidad ?? ''} ${m.unidad || ''}`.trim(), m.operario_recibe || '—', `$${pesos(valorDe(m))}`]),
        columnStyles: { 2: { halign: 'right' }, 4: { halign: 'right' } }, didDrawPage: didDP('Alertas de Control'),
      })
      y = (doc.lastAutoTable?.finalY || y) + 6
    }
    if (aOtro.length) {
      alerta(PDF_SEM_NEG, `${aOtro.length} egreso(s) a destino "Otro"  —  $${pesos(aOtro.reduce((a, m) => a + valorDe(m), 0))}`, 'Egresos sin destino productivo claro. Detalle por fecha:')
      tablaAlerta(aOtro)
    }
    if (aAjuste.length) {
      alerta(PDF_SEM_CRIT, `${aAjuste.length} ajuste(s) de inventario  —  $${pesos(aAjuste.reduce((a, m) => a + valorDe(m), 0))}`, 'Pueden esconder consumo de producción no registrado o faltantes. Detalle por fecha:')
      tablaAlerta(aAjuste)
    }
    if (aSinCosto.length) {
      alerta(PDF_SEM_CRIT, `${aSinCosto.length} egreso(s) SIN costo cargado`, 'Se valorizan como $0 y bajan el total real. Cargá el costo de estos productos:')
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(70, 70, 70)
      const txt = doc.splitTextToSize(sinCostoProd.join(' · '), pw - 32)
      txt.forEach(line => {
        if (y > ph - PDF_PIE_H - 6) { doc.addPage(); didDP('Alertas de Control')(); y = PDF_CONTENT_Y }
        doc.text(line, 16, y); y += 4
      })
      y += 4
    }
    if (!aOtro.length && !aAjuste.length && !aSinCosto.length) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_SEM_OK)
      doc.text('Sin alertas en el período: todos los egresos tienen destino productivo y costo cargado.', 14, y + 4)
    }

    // Detalle
    doc.addPage(); didDP('Detalle de Egresos')()
    autoTable(doc, { ...EST, styles: { ...EST.styles, fontSize: 7 }, startY: PDF_CONTENT_Y, head: [['Fecha', 'Producto', 'Cant.', 'Retira', 'Destino', 'Valor $']], body: egr.map(m => [formatFechaMov(m), m.producto_nombre || '—', `${m.cantidad ?? ''} ${m.unidad || ''}`.trim(), m.operario_recibe || '—', m.destino || '—', `$${pesos(valorDe(m))}`]), columnStyles: { 2: { halign: 'right' }, 5: { halign: 'right' } }, didDrawPage: didDP('Detalle de Egresos') })

    dibujarFirmas(doc, pw, ph, doc.lastAutoTable?.finalY, MOD, hoy, ['Responsable de Depósito', 'Gerencia'])
    doc.save(`egresos_ejecutivo_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  async function _pdfOperarios() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pw  = doc.internal.pageSize.getWidth()
    const ph  = doc.internal.pageSize.getHeight()
    const hoy = new Date().toLocaleString('es-AR')
    const periodo = _periodoLabel()
    const MOD = 'DEPÓSITO'
    const EST = getEstiloInforme()

    const totalRetiros  = entregasPorOperario.reduce((a, g) => a + g.items.length, 0)
    const totalUnidades = entregasPorOperario.reduce((a, g) => a + g.total, 0)

    // P1 — Portada
    dibujarPortada(doc, pw, ph, MOD, 'ENTREGAS POR OPERARIO', periodo, hoy)

    // P2 — Ranking
    doc.addPage()
    autoTable(doc, {
      ...EST, startY: PDF_CONTENT_Y,
      head: [['#', 'OPERARIO', 'N° RETIROS', 'TOTAL UDS/KG', '% DEL TOTAL']],
      body: entregasPorOperario.map((g, i) => [
        String(i + 1), g.operario, String(g.items.length),
        g.total.toLocaleString('es-AR', { maximumFractionDigits: 2 }),
        totalUnidades > 0 ? `${((g.total / totalUnidades) * 100).toFixed(1)}%` : '—',
      ]),
      foot: [[{ content: `TOTAL: ${totalRetiros} retiros · ${totalUnidades.toFixed(2)} uds/kg`, colSpan: 5, styles: { ...EST.footStyles, halign: 'right' } }]],
      didDrawPage: () => {
        dibujarEncabezado(doc, pw, MOD, 'RANKING DE OPERARIOS', hoy)
        dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
      },
    })
    const rankY = doc.lastAutoTable.finalY + 7
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(50, 50, 50)
    const p1Op = `Durante el período ${periodo}, ${entregasPorOperario.length} operario${entregasPorOperario.length !== 1 ? 's' : ''} realizaron ${totalRetiros} retiro${totalRetiros !== 1 ? 's' : ''}, totalizando ${totalUnidades.toLocaleString('es-AR', { maximumFractionDigits: 2 })} uds/kg.`
    doc.text(doc.splitTextToSize(`• ${p1Op}`, pw - 28), 14, rankY)

    // P3+ — Detalle por operario
    for (const grupo of entregasPorOperario) {
      doc.addPage()
      autoTable(doc, {
        ...EST, startY: PDF_CONTENT_Y,
        head: [['FECHA', 'PRODUCTO', 'CANTIDAD', 'DESTINO', 'MOTIVO']],
        body: grupo.items.map(m => [
          formatFecha(m.created_at), m.producto_nombre || '—',
          formatCantidad(m), m.destino || '—', m.motivo || '—',
        ]),
        foot: [[{ content: `SUBTOTAL: ${grupo.items.length} retiros · ${grupo.total.toFixed(2)} uds/kg`, colSpan: 5, styles: { ...EST.footStyles, halign: 'right' } }]],
        didDrawPage: () => {
          dibujarEncabezado(doc, pw, MOD, `OPERARIO: ${grupo.operario}`, hoy)
          dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
        },
      })
    }

    // Firmas (al final del contenido; salta de hoja solo si no entran)
    dibujarFirmas(doc, pw, ph, doc.lastAutoTable?.finalY, MOD, hoy, ['Responsable de Depósito', 'Gerencia', 'Fecha'])
    doc.save(`entregas_operario_${new Date().toISOString().split('T')[0]}.pdf`)
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
          {tab === 'Stock' && (
            <Button variant="primary" onClick={generarPDFValuacion} loading={generandoPDFValuacion}>
              <FileDown size={15} /> Valuación PDF
            </Button>
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
              {/* Filtro tipo */}
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
              {/* Filtro por fecha */}
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}>
                <div className="flex gap-1.5">
                  {[
                    { label: 'Hoy', fn: () => { const h = new Date().toISOString().split('T')[0]; setFiltroMovDesde(h); setFiltroMovHasta(h) } },
                    { label: 'Esta semana', fn: () => { const h = new Date().toISOString().split('T')[0]; const d = new Date(); d.setDate(d.getDate()-7); setFiltroMovDesde(d.toISOString().split('T')[0]); setFiltroMovHasta(h) } },
                    { label: 'Este mes', fn: () => { const n = new Date(); const desde = new Date(n.getFullYear(), n.getMonth(), 1).toISOString().split('T')[0]; setFiltroMovDesde(desde); setFiltroMovHasta(n.toISOString().split('T')[0]) } },
                  ].map(btn => (
                    <button key={btn.label} onClick={btn.fn}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border hover:border-brand"
                      style={{ borderColor: colors.border, color: colors.textSecondary, backgroundColor: colors.surface }}>
                      {btn.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  <span className="text-xs" style={{ color: colors.textMuted }}>Desde</span>
                  <input type="date" value={filtroMovDesde} onChange={e => setFiltroMovDesde(e.target.value)}
                    className="text-xs rounded-lg border px-2 py-1.5 outline-none focus:ring-2 focus:ring-[#D4521A]/30"
                    style={{ borderColor: colors.border }} />
                  <span className="text-xs" style={{ color: colors.textMuted }}>Hasta</span>
                  <input type="date" value={filtroMovHasta} onChange={e => setFiltroMovHasta(e.target.value)}
                    className="text-xs rounded-lg border px-2 py-1.5 outline-none focus:ring-2 focus:ring-[#D4521A]/30"
                    style={{ borderColor: colors.border }} />
                </div>
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
                        <Tr key={m.id} onClick={() => setModalDetMov(m)} style={{ cursor: 'pointer' }}>
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
                          <Td>
                            <p className="font-medium" style={{ color: colors.textPrimary }}>{m.producto_nombre}</p>
                            {m.observaciones && (
                              <p className="text-[10px] italic mt-0.5" style={{ color: colors.textMuted }}>{m.observaciones}</p>
                            )}
                            {m.usuario_email && (
                              <p className="text-[10px] mt-0.5" style={{ color: colors.textMuted }}>por {m.usuario_email}</p>
                            )}
                          </Td>
                          <Td className="text-xs" style={{ color: colors.textMuted }}>{[m.marca, m.lote].filter(Boolean).join(' · ') || '—'}</Td>
                          <Td className="font-bold whitespace-nowrap">{m.cantidad} {m.unidad}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>
                            {m.tipo === 'ingreso'
                              ? (m.proveedor && m.proveedor !== 'N/A' ? m.proveedor : '—')
                              : (m.destino && m.destino !== 'N/A' ? m.destino : '—')}
                          </Td>
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
              {/* Pills de categoría (dinámicas) */}
              <div className="flex gap-1.5 flex-wrap">
                {pillsCategorias.map(cat => (
                  <button key={cat} onClick={() => setFiltroCategoria(cat)}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition-all border"
                    style={{
                      backgroundColor: filtroCategoria === cat ? colors.brand : 'transparent',
                      borderColor: filtroCategoria === cat ? colors.brand : colors.border,
                      color: filtroCategoria === cat ? 'white' : colors.textSecondary,
                    }}>
                    {cat}
                  </button>
                ))}
              </div>

              {/* Panel sumatoria por categoría */}
              {sumatoriaCategoria && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl"
                  style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa' }}>
                  <div className="text-center">
                    <p className="text-xs" style={{ color: colors.textMuted }}>Total productos</p>
                    <p className="text-lg font-bold" style={{ color: colors.textPrimary }}>{sumatoriaCategoria.total}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs" style={{ color: colors.textMuted }}>Unidades en stock</p>
                    <p className="text-lg font-bold" style={{ color: colors.brand }}>
                      {sumatoriaCategoria.totalUnidades.toLocaleString('es-AR')}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs" style={{ color: colors.textMuted }}>Sin stock</p>
                    <p className="text-lg font-bold" style={{ color: colors.danger }}>{sumatoriaCategoria.sinStock}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs" style={{ color: colors.textMuted }}>Con stock</p>
                    <p className="text-lg font-bold" style={{ color: colors.success }}>{sumatoriaCategoria.conStock}</p>
                  </div>
                  {showVal && sumatoriaCategoria.valorTotal > 0 && (
                    <div className="col-span-2 sm:col-span-4 text-center pt-1" style={{ borderTop: '1px solid #fed7aa' }}>
                      <p className="text-xs" style={{ color: colors.textMuted }}>Valor total en stock</p>
                      <p className="text-xl font-bold" style={{ color: colors.brand }}>${pesos(sumatoriaCategoria.valorTotal)}</p>
                    </div>
                  )}
                </div>
              )}
              {/* KPI vencimientos */}
              {(() => {
                const cnt = insumos.filter(i => {
                  const v = vencimientoPorProducto[(i.nombre || '').trim().toLowerCase()]
                  return v && esAlertaVencimiento(v.clasif)
                }).length
                return cnt > 0 ? (
                  <button
                    onClick={() => setFiltroVencimiento(f => !f)}
                    className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                    style={{
                      backgroundColor: filtroVencimiento ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
                      border: `1px solid ${filtroVencimiento ? '#ef4444' : 'rgba(239,68,68,0.3)'}`,
                      color: '#ef4444',
                    }}>
                    <AlertTriangle size={15} />
                    ⚠️ {cnt} producto{cnt !== 1 ? 's' : ''} con vencimiento próximo
                    {filtroVencimiento && <span className="ml-auto text-xs">✕ quitar filtro</span>}
                  </button>
                ) : null
              })()}

              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar insumo…" icon={Search} />
                </div>
                {isAdmin && (
                  <Button variant="primary" size="sm" onClick={() => setModalNuevoInsumo(true)}>
                    <Plus size={14} /> Nuevo producto
                  </Button>
                )}
              </div>
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
                          onClick={() => setEditInsumo(ins)}
                          style={{
                            borderBottom: idx === items.length - 1 ? 'none' : `1px solid ${colors.border}`,
                            cursor: 'pointer',
                          }}
                          onMouseEnter={isAdmin ? e => e.currentTarget.style.backgroundColor = colors.bg : undefined}
                          onMouseLeave={isAdmin ? e => e.currentTarget.style.backgroundColor = 'transparent' : undefined}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-medium truncate" style={{ color: colors.textPrimary }}>{ins.nombre}</p>
                              {(() => {
                                const v = vencimientoPorProducto[(ins.nombre || '').trim().toLowerCase()]
                                if (!v || !esAlertaVencimiento(v.clasif)) return null
                                return (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: `${v.clasif.color}20`, color: v.clasif.color }}>
                                    {v.clasif.estado === 'vencido' ? '🔴 VENCIDO' : '⚠️ VENCE PRONTO'}
                                  </span>
                                )
                              })()}
                            </div>
                            <p className="text-xs" style={{ color: colors.textMuted }}>
                              {ins.stock_actual ?? '—'} {ins.unidad}
                              {ins.unidad === 'u' && (ins.peso_por_unidad || 0) > 0
                                ? ` / ${((ins.stock_actual || 0) * ins.peso_por_unidad).toFixed(1)} kg`
                                : ''}
                            </p>
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
                          {isAdmin && (
                            <button
                              onClick={e => { e.stopPropagation(); eliminarInsumo(ins) }}
                              title="Eliminar producto"
                              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[rgba(239,68,68,0.12)] transition-colors flex-shrink-0"
                              style={{ color: colors.danger }}>
                              <Trash2 size={14} />
                            </button>
                          )}
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
                      {egresos.map(e => {
                        const claVenc = clasificarVencimiento(e.fecha_vencimiento)
                        const rowBg = claVenc?.estado === 'vencido' ? 'rgba(239,68,68,0.07)' : claVenc?.estado === 'pronto' || claVenc?.estado === 'hoy_manana' ? 'rgba(245,158,11,0.07)' : 'transparent'
                        return (
                        <Tr key={e.id} style={{ backgroundColor: rowBg }}>
                          <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>
                            {formatFechaMov(e)}
                          </Td>
                          <Td className="text-xs font-medium">{e.producto_nombre}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{e.marca || '—'}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{e.presentacion || '—'}</Td>
                          <Td className="text-xs font-bold text-right">{e.cantidad}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{e.lote || '—'}</Td>
                          <Td className="text-xs whitespace-nowrap">
                            <span style={{ color: claVenc?.estado === 'vencido' ? '#ef4444' : claVenc?.estado === 'pronto' || claVenc?.estado === 'hoy_manana' ? '#f59e0b' : colors.textSecondary }}>
                              {e.fecha_vencimiento || '—'}
                            </span>
                            {claVenc && esAlertaVencimiento(claVenc) && (
                              <p className="text-[9px] font-bold mt-0.5" style={{ color: claVenc.color }}>
                                {labelDias(claVenc.dias)}
                              </p>
                            )}
                          </Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{e.controlo || '—'}</Td>
                          <Td className="text-xs max-w-[100px] truncate" style={{ color: colors.textMuted }}>{e.observaciones || '—'}</Td>
                          <Td>
                            {e.destino && e.destino !== 'N/A'
                              ? <Badge variant="info">{e.destino}</Badge>
                              : <span style={{ color: colors.textMuted }}>—</span>}
                          </Td>
                        </Tr>
                        )
                      })}
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
                    { key: 'egresos', label: 'Egresos (ejecutivo)' },
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
                <div className="ml-auto flex gap-2 items-center flex-wrap">
                  <Button variant="secondary" size="sm" onClick={exportarInformePDF} loading={generandoPDFInforme}>
                    <FileDown size={14} /> Exportar PDF
                  </Button>
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

              {informeVista === 'egresos' && (
                egresosEjecutivo.egr.length === 0 ? (
                  <EmptyState icon={Warehouse} title="Sin egresos en este período" />
                ) : (
                  <div className="space-y-4">
                    {/* KPIs — producción tomada del cálculo por receta (real) */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <KpiCard label="Total a costo (real)" value={`$${pesos(egresosReal.total)}`} icon={DollarSign} color={colors.danger} sub="producción + otros egresos" />
                      <KpiCard label="Producción (por receta)" value={`$${pesos(costeoProd.total)}`} icon={TrendingUp} color={colors.success} sub={egresosReal.incompleto ? '⚠ faltan recetas' : 'MP real consumida'} />
                      <KpiCard label="% Productivo" value={`${egresosReal.pctProd}%`} icon={BarChart2} color={colors.success} sub="sobre el total real" />
                      <KpiCard label="No productivo" value={`$${pesos(egresosReal.noProd)}`} icon={AlertTriangle} color={colors.warning} sub="uso interno + otro" />
                    </div>

                    {egresosReal.incompleto && (
                      <div className="p-3 rounded-lg text-sm" style={{ background: `${colors.warning}1A`, border: `1px solid ${colors.warning}`, color: colors.text }}>
                        <b style={{ color: colors.warning }}>⚠ El monto de producción está incompleto.</b> Hay productos sin receta o insumos sin costo (ver detalle abajo). El costo real de producción es <b>mayor</b> al mostrado — cargá esas recetas/costos antes de presentarlo.
                      </div>
                    )}

                    {/* MP a producción calculada por receta (backflush) */}
                    <div className="p-4 rounded-lg" style={{ background: `${colors.success}12`, border: `1px solid ${colors.success}` }}>
                      <div className="flex items-start justify-between flex-wrap gap-3">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.success }}>Materia prima a producción — calculada por receta</div>
                          <div className="text-2xl font-extrabold mt-1" style={{ color: colors.text }}>${pesos(costeoProd.total)}</div>
                          <div className="text-xs mt-1" style={{ color: colors.textSecondary }}>Calculado desde {costeoProd.nMovs} ingresos a cámara del período: se explotan las recetas a materia prima (incluida la base de cada sabor) y se costea a valores actuales. Es la MP real consumida en producción, más allá de lo registrado a mano.</div>
                        </div>
                        {(() => { const reg = egresosEjecutivo.destinos.find(d => d.k === 'Producción')?.val || 0; return (
                          <div className="text-right flex-shrink-0">
                            <div className="text-[10px] uppercase" style={{ color: colors.textMuted }}>Registrado como egreso</div>
                            <div className="text-lg font-bold" style={{ color: colors.warning }}>${pesos(reg)}</div>
                            <div className="text-[10px]" style={{ color: colors.textMuted }}>{costeoProd.total > 0 ? `${Math.round(reg / costeoProd.total * 100)}% del calculado` : ''}</div>
                          </div>
                        ) })()}
                      </div>
                      {costeoProd.porInsumo.length > 0 && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                            <thead><tr style={{ color: colors.textMuted }}>
                              <th className="text-left font-semibold py-1 pr-3">Insumo (top consumo)</th>
                              <th className="text-right font-semibold py-1 pr-3">Cantidad</th>
                              <th className="text-right font-semibold py-1">Valor $</th>
                            </tr></thead>
                            <tbody>
                              {costeoProd.porInsumo.slice(0, 10).map((p, i) => (
                                <tr key={i} style={{ borderTop: `1px solid ${colors.border}`, color: colors.text }}>
                                  <td className="py-1 pr-3">{p.nombre}</td>
                                  <td className="py-1 pr-3 text-right whitespace-nowrap">{p.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</td>
                                  <td className="py-1 text-right whitespace-nowrap">${pesos(p.valor)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {(costeoProd.sinReceta.length > 0 || costeoProd.sinCosto.length > 0) && (
                        <div className="text-[11px] mt-2 space-y-0.5" style={{ color: colors.warning }}>
                          {costeoProd.sinReceta.length > 0 && <div>⚠ Sin receta (no costeados): {costeoProd.sinReceta.join(' · ')}</div>}
                          {costeoProd.sinCosto.length > 0 && <div>⚠ Insumos sin costo cargado: {costeoProd.sinCosto.slice(0, 15).join(' · ')}{costeoProd.sinCosto.length > 15 ? ` … (+${costeoProd.sinCosto.length - 15})` : ''}</div>}
                        </div>
                      )}
                    </div>

                    {/* Egresos por destino */}
                    <div className="p-4" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                      <div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: colors.textSecondary }}>A dónde se fue la plata (producción por receta + egresos registrados)</div>
                      <div className="flex w-full h-6 rounded overflow-hidden mb-3">
                        {egresosReal.buckets.map(d => (
                          d.pct > 0 ? <div key={d.k} title={`${d.k}: $${pesos(d.val)}`} className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${d.pct}%`, backgroundColor: d.color }}>{d.pct >= 7 ? `${d.pct}%` : ''}</div> : null
                        ))}
                      </div>
                      <div className="space-y-1.5">
                        {egresosReal.buckets.map(d => (
                          <div key={d.k} className="flex items-center text-sm">
                            <span className="inline-block w-3 h-3 rounded-sm mr-2 flex-shrink-0" style={{ backgroundColor: d.color }} />
                            <span className="flex-1" style={{ color: colors.text }}>{d.k}</span>
                            <span className="font-bold" style={{ color: colors.text }}>${pesos(d.val)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Alertas de control */}
                    {(egresosEjecutivo.alertas.otro.n > 0 || egresosEjecutivo.alertas.ajuste.n > 0 || egresosEjecutivo.alertas.sinCosto.n > 0) && (
                      <div className="space-y-2">
                        {[
                          { key: 'otro', c: colors.danger, titulo: `${egresosEjecutivo.alertas.otro.n} egreso(s) a destino "Otro" — $${pesos(egresosEjecutivo.alertas.otro.val)}`, nota: 'Egresos sin destino productivo claro.', data: egresosEjecutivo.alertas.otro },
                          { key: 'ajuste', c: colors.warning, titulo: `${egresosEjecutivo.alertas.ajuste.n} ajuste(s) de inventario — $${pesos(egresosEjecutivo.alertas.ajuste.val)}`, nota: 'Pueden ocultar consumo de producción no registrado o faltantes. Revisar cada uno.', data: egresosEjecutivo.alertas.ajuste },
                        ].filter(a => a.data.n > 0).map(a => (
                          <div key={a.key} className="p-3 rounded-lg" style={{ backgroundColor: `${a.c}1A`, border: `1px solid ${a.c}` }}>
                            <div className="flex items-start gap-2">
                              <AlertTriangle size={16} style={{ color: a.c }} className="mt-0.5 flex-shrink-0" />
                              <div className="text-sm">
                                <b style={{ color: a.c }}>{a.titulo}.</b>{' '}
                                <span style={{ color: colors.textSecondary }}>{a.nota}</span>
                              </div>
                            </div>
                            <div className="mt-2 overflow-x-auto">
                              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ color: colors.textMuted }}>
                                    <th className="text-left font-semibold py-1 pr-3">Fecha</th>
                                    <th className="text-left font-semibold py-1 pr-3">Producto</th>
                                    <th className="text-right font-semibold py-1 pr-3">Cant.</th>
                                    <th className="text-left font-semibold py-1 pr-3">Retira</th>
                                    <th className="text-right font-semibold py-1">Valor $</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {a.data.items.slice(0, 12).map((it, i) => (
                                    <tr key={i} style={{ borderTop: `1px solid ${colors.border}`, color: colors.text }}>
                                      <td className="py-1 pr-3 whitespace-nowrap">{formatFecha(it.fecha)}</td>
                                      <td className="py-1 pr-3">{it.producto}</td>
                                      <td className="py-1 pr-3 text-right whitespace-nowrap">{it.cant}</td>
                                      <td className="py-1 pr-3">{it.retira}</td>
                                      <td className="py-1 text-right whitespace-nowrap">${pesos(it.val)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {a.data.items.length > 12 && <div className="text-[11px] mt-1" style={{ color: colors.textMuted }}>… y {a.data.items.length - 12} más (ver PDF)</div>}
                            </div>
                          </div>
                        ))}
                        {egresosEjecutivo.alertas.sinCosto.n > 0 && (
                          <div className="p-3 rounded-lg" style={{ backgroundColor: `${colors.warning}1A`, border: `1px solid ${colors.warning}` }}>
                            <div className="flex items-start gap-2">
                              <AlertTriangle size={16} style={{ color: colors.warning }} className="mt-0.5 flex-shrink-0" />
                              <div className="text-sm">
                                <b style={{ color: colors.warning }}>{egresosEjecutivo.alertas.sinCosto.n} egreso(s) sin costo cargado.</b>{' '}
                                <span style={{ color: colors.textSecondary }}>Se valorizan como $0 y bajan el total real. Cargá el costo de estos productos en Stock:</span>
                              </div>
                            </div>
                            <div className="mt-1.5 text-xs" style={{ color: colors.text }}>{egresosEjecutivo.alertas.sinCosto.productos.join(' · ')}</div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid lg:grid-cols-2 gap-4">
                      {/* Top productos */}
                      <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                        <div className="px-4 py-2.5" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Top productos por valor egresado</span>
                        </div>
                        <Table>
                          <Thead><Tr><Th>Producto</Th><Th>Destino</Th><Th>Valor $</Th></Tr></Thead>
                          <Tbody>
                            {egresosEjecutivo.topProd.map(p => (
                              <Tr key={p.nombre}>
                                <Td className="font-medium">{p.nombre}</Td>
                                <Td><Badge variant="info">{p.destPpal}</Badge></Td>
                                <Td className="font-bold text-right">${pesos(p.val)}</Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </div>

                      {/* Quién retira */}
                      <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                        <div className="px-4 py-2.5" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Quién retira (responsable del egreso)</span>
                        </div>
                        <Table>
                          <Thead><Tr><Th>Retira / Solicita</Th><Th>Mov.</Th><Th>Valor $</Th></Tr></Thead>
                          <Tbody>
                            {egresosEjecutivo.topRet.map(r => (
                              <Tr key={r.k}>
                                <Td className="font-medium">{r.k}</Td>
                                <Td className="text-right">{r.n}</Td>
                                <Td className="font-bold text-right">${pesos(r.val)}</Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </div>
                    </div>
                  </div>
                )
              )}

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
                            <Tr><Th>Producto</Th><Th>Cantidad</Th><Th>Fecha y hora</Th><Th>Lote</Th></Tr>
                          </Thead>
                          <Tbody>
                            {grupo.items.map(m => (
                              <Tr key={m.id} onClick={() => setModalDetMov(m)} style={{ cursor: 'pointer' }}>
                                <Td className="font-medium">{m.producto_nombre}</Td>
                                <Td className="font-bold">{formatCantidad(m)}</Td>
                                <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{formatFecha(m.created_at)}</Td>
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
                            <Tr><Th>Producto</Th><Th>Cantidad</Th><Th>Fecha y hora</Th><Th>Recibió</Th></Tr>
                          </Thead>
                          <Tbody>
                            {grupo.items.map(m => (
                              <Tr key={m.id} onClick={() => setModalDetMov(m)} style={{ cursor: 'pointer' }}>
                                <Td className="font-medium">{m.producto_nombre}</Td>
                                <Td className="font-bold">{formatCantidad(m)}</Td>
                                <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{formatFecha(m.created_at)}</Td>
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
                            <Tr><Th>Producto</Th><Th>Cantidad</Th><Th>Fecha y hora</Th><Th>Destino</Th></Tr>
                          </Thead>
                          <Tbody>
                            {grupo.items.map(m => (
                              <Tr key={m.id} onClick={() => setModalDetMov(m)} style={{ cursor: 'pointer' }}>
                                <Td className="font-medium">{m.producto_nombre}</Td>
                                <Td className="font-bold">{formatCantidad(m)}</Td>
                                <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{formatFecha(m.created_at)}</Td>
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
            <div className="space-y-4">

              {/* Un solo lugar por área: acá se cuenta el DEPÓSITO; la cámara se
                  cuenta en su propio módulo (Cámaras → "Conteo físico"). Ambos
                  alimentan el mismo informe semanal. */}
              <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: `1px solid ${colors.border}`, color: colors.textSecondary }}>
                <span>📦</span>
                <span>Control de <b style={{ color: colors.textPrimary }}>Depósito</b>. La cámara se cuenta en el módulo <b style={{ color: colors.textPrimary }}>Cámaras → "Conteo físico"</b>; los dos aparecen juntos en el <b style={{ color: colors.textPrimary }}>Informe semanal</b>.</span>
              </div>

              {/* ══ SECCIÓN 1 — Estado del conteo ══════════════════════════════ */}
              <div className="p-4 rounded-xl space-y-3" style={SURFACE}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{semanaLabel}</p>
                    <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: conteoEstado === 'APROBADO' ? 'rgba(34,197,94,0.15)' : conteoEstado === 'COMPLETADO' ? 'rgba(59,130,246,0.15)' : conteoEstado === 'EN_PROCESO' ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.15)',
                        color: conteoEstado === 'APROBADO' ? colors.success : conteoEstado === 'COMPLETADO' ? colors.info : conteoEstado === 'EN_PROCESO' ? colors.warning : colors.textMuted,
                      }}>
                      {conteoEstado === 'SIN_INICIAR' ? '○ SIN INICIAR' : conteoEstado === 'EN_PROCESO' ? '● EN PROCESO' : conteoEstado === 'COMPLETADO' ? '✓ COMPLETADO' : '✓ APROBADO'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={conteoResponsable} onChange={e => setConteoResponsable(e.target.value)}
                      disabled={conteoEstado === 'APROBADO'}>
                      <option value="">— Responsable —</option>
                      {operariosUnicos.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
                    </Select>
                    {conteoEstado !== 'APROBADO' && (
                      isAdmin ? (
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: colors.textSecondary }}>
                          <input type="checkbox" checked={conteoCiego} onChange={e => setConteoCiego(e.target.checked)} />
                          🙈 A ciegas
                        </label>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs" style={{ color: colors.textMuted }}>🙈 A ciegas</span>
                      )
                    )}
                    {conteoEstado === 'SIN_INICIAR' && (
                      <Button variant="primary" size="sm" onClick={iniciarConteo}>
                        <ClipboardCheck size={13} /> Iniciar conteo
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={generarInformeSemanalConteo} loading={generandoInformeSem}>
                      <FileDown size={13} /> Informe semanal
                    </Button>
                    <Button variant="secondary" size="sm" onClick={abrirHistorial}>
                      <ClipboardCheck size={13} /> Historial
                    </Button>
                    {(conteoEstado === 'COMPLETADO' || conteoEstado === 'APROBADO') && conteoCicloId && (
                      <Button variant="secondary" size="sm" onClick={generarComprobanteActual} loading={generandoComprob}>
                        <FileDown size={13} /> Comprobante
                      </Button>
                    )}
                    {conteoEstado === 'EN_PROCESO' && (
                      <Button variant="success" size="sm" onClick={guardarConteoFormal} loading={savingConteo}>
                        Guardar conteo
                      </Button>
                    )}
                    {conteoEstado === 'COMPLETADO' && isAdmin && (
                      <Button variant="primary" size="sm" onClick={() => setModalAjustes(true)}>
                        ✓ Aprobar y cerrar
                      </Button>
                    )}
                    {conteoEstado !== 'SIN_INICIAR' && (
                      <Button variant="secondary" size="sm" onClick={generarPDFConteoSemanal} loading={generandoPDFconteo}>
                        <FileDown size={13} /> PDF de este conteo
                      </Button>
                    )}
                    {conteoEstado !== 'SIN_INICIAR' && conteoEstado !== 'APROBADO' && (
                      <button onClick={() => { setConteoEstado('SIN_INICIAR'); setConteoFilasDepo([]); setConteoFilasCam([]) }}
                        className="text-xs px-2 py-1 rounded-md transition-colors"
                        style={{ color: colors.textMuted, backgroundColor: 'transparent' }}>
                        ✕ Cancelar
                      </button>
                    )}
                  </div>
                </div>
                {/* Selector de período */}
                <div className="flex gap-1.5 flex-wrap items-center pt-1" style={{ borderTop: `1px solid ${colors.border}` }}>
                  <span className="text-xs" style={{ color: colors.textMuted }}>Período de análisis:</span>
                  {[
                    { key: 'semana_actual', label: 'Esta semana' },
                    { key: 'semana_pasada', label: 'Semana pasada' },
                    { key: 'mes_actual', label: 'Este mes' },
                    { key: 'personalizado', label: 'Personalizado' },
                  ].map(p => (
                    <button key={p.key} onClick={() => setPeriodoCS(p.key)}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all border"
                      style={{
                        backgroundColor: periodoCS === p.key ? colors.brand : 'transparent',
                        borderColor: periodoCS === p.key ? colors.brand : colors.border,
                        color: periodoCS === p.key ? 'white' : colors.textSecondary,
                      }}>
                      {p.label}
                    </button>
                  ))}
                  {periodoCS === 'personalizado' && (
                    <div className="flex gap-1.5 items-center">
                      <Input type="date" value={periodoCSDesde} onChange={e => setPeriodoCSDesde(e.target.value)} />
                      <span className="text-xs" style={{ color: colors.textMuted }}>–</span>
                      <Input type="date" value={periodoCSHasta} onChange={e => setPeriodoCSHasta(e.target.value)} />
                    </div>
                  )}
                </div>
              </div>

              {/* ══ SECCIÓN 3 — KPIs resumen ════════════════════════════════════ */}
              {conteoEstado !== 'SIN_INICIAR' && (() => {
                const filas = seccionCS === 'deposito' ? conteoFilasDepo : conteoFilasCam
                const contados = seccionCS === 'deposito'
                  ? filas.filter(f => f.stockFisico !== '').length
                  : filas.filter(c => c.fisKg !== '').length
                const conDif = seccionCS === 'deposito'
                  ? filas.filter(f => { const v = parseFloat(f.stockFisico); return !isNaN(v) && v !== f.stockSistema }).length
                  : filas.filter(c => { const v = parseFloat(c.fisKg); return !isNaN(v) && v !== c.stockKg }).length
                const impacto = seccionCS === 'deposito'
                  ? filas.reduce((a, f) => { const v = parseFloat(f.stockFisico); return isNaN(v) || v === f.stockSistema ? a : a + Math.abs(v - f.stockSistema) * (f.costo_unitario || 0) }, 0)
                  : 0
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiCard label="Productos totales" value={filas.length} icon={Warehouse} color={colors.brand} />
                    <KpiCard label="Contados" value={`${contados} / ${filas.length}`} icon={ClipboardCheck} color={colors.info} />
                    <KpiCard label="Sin diferencias" value={contados - conDif} icon={ChevronRight} color={colors.success} />
                    <KpiCard label="Con diferencias" value={conDif} icon={AlertTriangle} color={conDif > 0 ? colors.danger : colors.success}
                      sub={impacto > 0 ? `$${pesos(impacto)} est.` : undefined} />
                  </div>
                )
              })()}

              {/* ══ SECCIÓN 2 — Tabla de conteo ═════════════════════════════════ */}
              {conteoEstado !== 'SIN_INICIAR' && seccionCS === 'deposito' && (
                <div className="overflow-hidden" style={SURFACE}>
                  <div className="px-4 py-2.5" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                      Conteo de stock — Depósito · {conteoFilasDepo.length} productos
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[700px]">
                      <Thead>
                        <Tr>
                          <Th>PRODUCTO</Th><Th>CATEGORÍA</Th><Th>UNIDAD</Th>
                          <Th>STOCK SISTEMA</Th><Th>STOCK FÍSICO</Th><Th>DIFERENCIA</Th><Th>ESTADO</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {conteoFilasDepo.map((f, idx) => {
                          const fis = parseFloat(f.stockFisico)
                          const hasFis = !isNaN(fis)
                          const diff = hasFis ? fis - f.stockSistema : null
                          const pct = diff !== null && f.stockSistema > 0 ? Math.abs(diff / f.stockSistema) * 100 : 0
                          const estColor = !hasFis ? colors.textMuted : diff === 0 ? colors.success : pct > 5 ? colors.danger : colors.warning
                          const estLabel = !hasFis ? '—' : diff === 0 ? '✓ OK' : pct > 5 ? '⚠ CRÍTICA' : '△ MENOR'
                          // A ciegas: no revelamos sistema/diferencia/estado hasta aprobar.
                          const oculto = conteoCiego && conteoEstado !== 'APROBADO'
                          const rowBg = !oculto && hasFis && diff !== 0 ? (pct > 5 ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.07)') : 'transparent'
                          return (
                            <Tr key={f.id} style={{ backgroundColor: rowBg }}>
                              <Td className="font-medium text-sm" style={{ color: colors.textPrimary }}>{f.nombre}</Td>
                              <Td className="text-xs" style={{ color: colors.textMuted }}>{f.categoria}</Td>
                              <Td className="text-xs">{f.unidad}</Td>
                              <Td className="text-right font-semibold" style={{ color: oculto ? colors.textMuted : colors.textPrimary }}>
                                {oculto ? '•••' : f.stockSistema.toFixed(2)}
                              </Td>
                              <Td className="text-right">
                                {conteoEstado === 'APROBADO' ? (
                                  <span className="font-semibold" style={{ color: colors.textPrimary }}>{hasFis ? fis.toFixed(2) : '—'}</span>
                                ) : (
                                  <input type="number" step="0.01" min="0"
                                    value={f.stockFisico}
                                    onChange={e => setConteoFilasDepo(prev => prev.map((r, i) => i === idx ? { ...r, stockFisico: e.target.value } : r))}
                                    placeholder={oculto ? '—' : f.stockSistema.toFixed(2)}
                                    className="w-24 text-right rounded-md border px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-[#D4521A]/25 focus:border-[#D4521A]"
                                    style={{ borderColor: colors.border, backgroundColor: colors.bg, color: colors.textPrimary }}
                                  />
                                )}
                              </Td>
                              <Td className="text-right font-semibold"
                                style={{ color: oculto || diff === null ? colors.textMuted : diff === 0 ? colors.success : pct > 5 ? colors.danger : colors.warning }}>
                                {oculto ? '·' : diff !== null ? `${diff > 0 ? '+' : ''}${diff.toFixed(2)}` : '—'}
                              </Td>
                              <Td>
                                <span className="text-xs font-semibold" style={{ color: oculto ? colors.textMuted : estColor }}>{oculto ? '·' : estLabel}</span>
                              </Td>
                            </Tr>
                          )
                        })}
                      </Tbody>
                    </Table>
                  </div>
                </div>
              )}

              {conteoEstado !== 'SIN_INICIAR' && seccionCS === 'camara' && (
                <div className="overflow-hidden" style={SURFACE}>
                  <div className="px-4 py-2.5" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                      Conteo de stock — Cámaras · {conteoFilasCam.length} productos
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[800px]">
                      <Thead>
                        <Tr>
                          <Th>PRODUCTO</Th><Th>TIPO</Th>
                          <Th>SIS. BALDES/U</Th><Th>SIS. KG</Th>
                          <Th>FÍS. BALDES/U</Th><Th>FÍS. KG</Th>
                          <Th>DIF.</Th><Th>ESTADO</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {conteoFilasCam.map((c, idx) => {
                          const fk = parseFloat(c.fisKg); const fb = parseInt(c.fisBaldes, 10)
                          const hasFk = !isNaN(fk); const hasFb = !isNaN(fb)
                          const dkg = hasFk ? fk - c.stockKg : null
                          const dbl = hasFb ? fb - c.stockBaldes : null
                          const tieneDiff = (dkg !== null && dkg !== 0) || (dbl !== null && dbl !== 0)
                          const rowBg = tieneDiff ? 'rgba(245,158,11,0.07)' : 'transparent'
                          const estado = !hasFk && !hasFb ? '—' : !tieneDiff ? '✓ OK' : '△ DIF.'
                          const estColor = !hasFk && !hasFb ? colors.textMuted : !tieneDiff ? colors.success : colors.warning
                          const esImp = c.tipo === 'impulsivo'
                          return (
                            <Tr key={c.id} style={{ backgroundColor: rowBg }}>
                              <Td className="font-medium text-sm" style={{ color: colors.textPrimary }}>{c.nombre}</Td>
                              <Td><Badge variant={c.tipo === 'helado' ? 'info' : c.tipo === 'impulsivo' ? 'warning' : 'neutral'}>
                                {c.tipo}
                              </Badge></Td>
                              <Td className="text-right font-semibold">{c.stockBaldes}</Td>
                              <Td className="text-right text-xs" style={{ color: colors.textMuted }}>
                                {esImp ? '—' : `${c.stockKg.toFixed(1)} kg`}
                              </Td>
                              <Td className="text-right">
                                {conteoEstado === 'APROBADO' ? (hasFb ? String(fb) : '—') : (
                                  <input type="number" step="1" min="0" value={c.fisBaldes}
                                    onChange={e => setConteoFilasCam(prev => prev.map((r, i) => i === idx ? { ...r, fisBaldes: e.target.value } : r))}
                                    placeholder={String(c.stockBaldes)}
                                    className="w-20 text-right rounded-md border px-2 py-1 text-sm outline-none"
                                    style={{ borderColor: colors.border, backgroundColor: colors.bg, color: colors.textPrimary }}
                                  />
                                )}
                              </Td>
                              <Td className="text-right">
                                {esImp ? '—' : conteoEstado === 'APROBADO' ? (hasFk ? `${fk.toFixed(1)} kg` : '—') : (
                                  <input type="number" step="0.1" min="0" value={c.fisKg}
                                    onChange={e => setConteoFilasCam(prev => prev.map((r, i) => i === idx ? { ...r, fisKg: e.target.value } : r))}
                                    placeholder={`${c.stockKg.toFixed(1)}`}
                                    className="w-24 text-right rounded-md border px-2 py-1 text-sm outline-none"
                                    style={{ borderColor: colors.border, backgroundColor: colors.bg, color: colors.textPrimary }}
                                  />
                                )}
                              </Td>
                              <Td className="text-right text-xs font-semibold" style={{ color: tieneDiff ? colors.warning : colors.textMuted }}>
                                {dkg !== null ? `${dkg > 0 ? '+' : ''}${dkg.toFixed(1)} kg` : '—'}
                              </Td>
                              <Td><span className="text-xs font-semibold" style={{ color: estColor }}>{estado}</span></Td>
                            </Tr>
                          )
                        })}
                      </Tbody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Tabla de análisis (solo si SIN_INICIAR) */}
              {conteoEstado === 'SIN_INICIAR' && seccionCS === 'deposito' && (
                <div ref={tablaDepositoRef} className="overflow-hidden" style={SURFACE}>
                  <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Análisis de stock — {semanaLabel}</span>
                      <span className="text-xs" style={{ color: colors.textMuted }}>{controlSemanalFiltrado.length} de {controlSemanal.length} insumos</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <div className="flex gap-1.5 flex-wrap">
                        {CATS_FILTRO_BASE.map(cat => (
                          <button key={cat} onClick={() => setFiltroCSCategoria(cat)}
                            className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all border"
                            style={{ backgroundColor: filtroCSCategoria === cat ? colors.brand : 'transparent', borderColor: filtroCSCategoria === cat ? colors.brand : colors.border, color: filtroCSCategoria === cat ? 'white' : colors.textSecondary }}>
                            {cat}
                          </button>
                        ))}
                      </div>
                      <Button variant="secondary" size="sm" onClick={generarPDFStock} loading={generandoPDFstock}>
                        <FileDown size={13} /> PDF análisis
                      </Button>
                    </div>
                  </div>
                  {controlSemanalFiltrado.length === 0 ? (
                    <EmptyState icon={Warehouse} title="Sin insumos cargados" />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="min-w-[900px]">
                        <Thead>
                          <Tr>
                            <Th>PRODUCTO</Th><Th>ST. SISTEMA</Th><Th>INGRESOS</Th><Th>EGRESOS</Th>
                            <Th>CONTEO FÍSICO</Th><Th>DIFERENCIA</Th><Th>DÍAS DE STOCK</Th><Th>ESTADO</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {controlSemanalFiltrado.map(r => {
                            const rowBg = r.estado === 'CRÍTICO' ? 'rgba(239,68,68,0.08)' : r.estado === 'ATENCIÓN' ? 'rgba(245,158,11,0.08)' : 'transparent'
                            const diffBig = r.conteoFisico !== null && r.pctDiferencia > 3
                            const diasColor = r.diasStock < 3 ? colors.danger : r.diasStock < 7 ? colors.warning : r.diasStock === Infinity ? colors.textMuted : colors.success
                            return (
                              <Tr key={r.id} style={{ backgroundColor: rowBg }}>
                                <Td>
                                  <button className="font-medium text-left hover:underline flex items-center gap-1" style={{ color: colors.brand }} onClick={() => setModalEvolCS(r)}>
                                    {r.nombre} <BarChart2 size={11} style={{ color: colors.textMuted }} />
                                  </button>
                                </Td>
                                <Td className="text-right font-semibold">{r.stockSistema.toFixed(1)} {r.unidad}</Td>
                                <Td className="text-right text-xs" style={{ color: colors.success }}>
                                  {r.ingresosKg > 0 ? <button className="hover:underline" onClick={() => setModalMovsDet({ tipo: 'ingreso', producto: r.nombre, movs: r.ingresosMovs })}>+{r.ingresosKg.toFixed(1)}</button> : '—'}
                                </Td>
                                <Td className="text-right text-xs" style={{ color: colors.danger }}>
                                  {r.egresosKg > 0 ? <button className="hover:underline" onClick={() => setModalMovsDet({ tipo: 'egreso', producto: r.nombre, movs: r.egresosMovs })}>-{r.egresosKg.toFixed(1)}</button> : '—'}
                                </Td>
                                <Td className="text-right text-xs" style={{ color: colors.textSecondary }}>
                                  {r.conteoFisico !== null ? `${r.conteoFisico.toFixed(1)} ${r.unidad}` : '—'}
                                </Td>
                                <Td className="text-right font-semibold"
                                  style={{ color: diffBig ? colors.danger : r.diferencia !== null ? colors.textSecondary : colors.textMuted }}>
                                  {r.diferencia !== null ? `${r.diferencia > 0 ? '+' : ''}${r.diferencia.toFixed(2)} ${r.unidad}${diffBig ? ` (${r.pctDiferencia.toFixed(1)}%)` : ''}` : '—'}
                                </Td>
                                <Td className="text-right font-bold" style={{ color: diasColor }}>
                                  {r.diasStock === Infinity ? '♾' : `${r.diasStock.toFixed(0)} días`}
                                </Td>
                                <Td>
                                  <Badge variant={r.estado === 'CRÍTICO' ? 'danger' : r.estado === 'ATENCIÓN' ? 'warning' : 'success'}>
                                    {r.estado === 'CRÍTICO' ? '🔴 CRÍTICO' : r.estado === 'ATENCIÓN' ? '🟡 ATENCIÓN' : '🟢 OK'}
                                  </Badge>
                                </Td>
                              </Tr>
                            )
                          })}
                        </Tbody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              {conteoEstado === 'SIN_INICIAR' && seccionCS === 'camara' && (
                <div className="overflow-hidden" style={SURFACE}>
                  <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Vista de cámaras</span>
                    <Button variant="secondary" size="sm" onClick={generarPDFCamaras} loading={generandoPDFcamara}>
                      <FileDown size={13} /> PDF cámaras
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
                    <KpiCard label="Total en cámara" value={kpisCamara.total} icon={Warehouse} color={colors.brand} />
                    <KpiCard label="Agotados" value={kpisCamara.agotados} icon={AlertTriangle} color={colors.danger} />
                    <KpiCard label="Stock bajo (≤ 3)" value={kpisCamara.bajos} icon={TrendingUp} color={colors.warning} />
                    <KpiCard label="KG totales" value={`${kpisCamara.totalKg.toFixed(1)} kg`} icon={BarChart2} color={colors.info} />
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ═══════════════════════════ PLAN DE COMPRAS ═══════════════════════ */}
          {tab === 'Plan de compras' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: `1px solid ${colors.border}`, color: colors.textSecondary }}>
                <span>🧮</span>
                <span>Cargá lo que vas a producir (desde las órdenes abiertas y/o a mano). El sistema explota las recetas, mira el stock y te dice <b style={{ color: colors.textPrimary }}>qué comprar</b>, agrupado por proveedor.</span>
              </div>

              {/* Producción planificada */}
              <div className="overflow-hidden" style={SURFACE}>
                <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>📋 Producción planificada</span>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={cargarPlanDesdeOrdenes}>
                      <ClipboardCheck size={13} /> Traer órdenes abiertas ({ordenesAbiertas.length})
                    </Button>
                    {planItems.length > 0 && (
                      <button onClick={() => setPlanItems([])} className="text-xs px-2 py-1 rounded-md" style={{ color: colors.textMuted }}>✕ Vaciar</button>
                    )}
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {/* Agregar a mano */}
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex-1 min-w-[180px]">
                      <Select label="Producto" value={planNuevo.nombre} onChange={e => setPlanNuevo(p => ({ ...p, nombre: e.target.value }))}>
                        <option value="">— Elegir producto —</option>
                        {['HELADOS', 'IMPULSIVOS', 'POSTRES'].map(g => (
                          <optgroup key={g} label={g}>
                            {catalogoProductos.filter(p => p.grupo === g).map(p => <option key={`${p.grupo}-${p.nombre}`} value={p.nombre}>{p.nombre}</option>)}
                          </optgroup>
                        ))}
                      </Select>
                    </div>
                    <div className="w-28">
                      <Input label="Cantidad" type="number" min="0" value={planNuevo.cantidad}
                        onChange={e => setPlanNuevo(p => ({ ...p, cantidad: e.target.value }))} placeholder="kg / u" />
                    </div>
                    <Button variant="primary" size="sm" onClick={agregarItemPlan}><Plus size={13} /> Agregar</Button>
                  </div>

                  {planItems.length === 0 ? (
                    <p className="text-xs" style={{ color: colors.textMuted }}>Todavía no cargaste nada. Traé las órdenes abiertas o agregá productos a mano.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="min-w-[520px]">
                        <Thead><Tr><Th>Producto</Th><Th>Tipo</Th><Th className="text-right">Cantidad</Th><Th></Th></Tr></Thead>
                        <Tbody>
                          {planItems.map((it, idx) => (
                            <Tr key={`${it.tipo_producto}-${it.nombre}-${idx}`}>
                              <Td className="font-medium">{it.nombre}</Td>
                              <Td className="text-xs" style={{ color: colors.textMuted }}>{it.tipo_producto === 'helado' ? '🧊 helado (kg)' : it.tipo_producto === 'postre' ? '🍰 postre (u)' : '📦 impulsivo (u)'}</Td>
                              <Td className="text-right">
                                <input type="number" min="0" value={it.cantidad}
                                  onChange={e => setCantidadPlan(idx, e.target.value)}
                                  className="w-24 text-right rounded-md border px-2 py-1 text-sm outline-none"
                                  style={{ borderColor: colors.border, backgroundColor: colors.bg, color: colors.textPrimary }} />
                              </Td>
                              <Td className="text-right"><button onClick={() => quitarItemPlan(idx)} style={{ color: colors.danger }}><Trash2 size={14} /></button></Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>

              {/* KPIs + resultado */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <KpiCard label="Ítems a comprar" value={planCompras.aComprar.length} icon={ClipboardCheck} color={colors.brand} />
                <KpiCard label="Total estimado" value={`$${pesos(planCompras.totalCompra)}`} icon={DollarSign} color={colors.danger} />
                <KpiCard label="Ya cubiertos" value={planCompras.cubiertos.length} icon={TrendingUp} color={colors.success} />
              </div>

              {planCompras.sinReceta.length > 0 && (
                <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>Sin receta (no se pueden explotar, no entran al cálculo): {planCompras.sinReceta.join(', ')}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>🛒 Qué comprar</span>
                <Button variant="secondary" size="sm" onClick={generarPDFCompras} loading={generandoPDFcompras} disabled={planCompras.aComprar.length === 0}>
                  <FileDown size={13} /> PDF
                </Button>
              </div>

              {planCompras.aComprar.length === 0 ? (
                <EmptyState icon={ClipboardCheck} title={planItems.length === 0 ? 'Cargá el plan para ver qué comprar' : 'El stock cubre todo el plan'}
                  subtitle={planItems.length === 0 ? 'Traé órdenes abiertas o agregá productos.' : 'No hace falta comprar materia prima para esta producción.'} />
              ) : (
                planCompras.grupos.map(g => (
                  <div key={g.proveedor} className="overflow-hidden" style={SURFACE}>
                    <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>🏭 {g.proveedor}</span>
                      <span className="text-xs font-bold" style={{ color: colors.danger }}>${pesos(g.total)}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <Table className="min-w-[600px]">
                        <Thead><Tr><Th>Insumo</Th><Th className="text-right">Necesita</Th><Th className="text-right">Hay</Th><Th className="text-right">Comprar</Th><Th className="text-right">Costo $</Th></Tr></Thead>
                        <Tbody>
                          {g.items.map(i => (
                            <Tr key={i.nombre}>
                              <Td className="font-medium">{i.nombre}</Td>
                              <Td className="text-right text-xs">{i.necesario.toFixed(2)} {i.unidad}</Td>
                              <Td className="text-right text-xs" style={{ color: colors.textMuted }}>{i.disponible.toFixed(2)} {i.unidad}</Td>
                              <Td className="text-right font-semibold" style={{ color: colors.danger }}>{i.faltante.toFixed(2)} {i.unidad}</Td>
                              <Td className="text-right">{i.sinCosto ? <span className="text-xs" style={{ color: colors.warning }}>s/costo</span> : `$${pesos(i.costoCompra)}`}</Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </div>
                  </div>
                ))
              )}
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
          movimientos={movimientos}
          categorias={categoriasSelect}
        />
      )}

      {editInsumo && (
        <ModalEditarInsumo
          insumo={editInsumo}
          onClose={() => setEditInsumo(null)}
          onSubmit={guardarInsumo}
          saving={savingInsumo}
          isAdmin={isAdmin}
          categorias={categoriasSelect}
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

      {modalMovsDet && (
        <ModalMovsDetalle
          tipo={modalMovsDet.tipo}
          producto={modalMovsDet.producto}
          movs={modalMovsDet.movs}
          onClose={() => setModalMovsDet(null)}
        />
      )}

      {modalEvolCS && (
        <ModalEvolucionCS
          insumo={modalEvolCS}
          movimientos={movimientos}
          onClose={() => setModalEvolCS(null)}
        />
      )}

      {modalMovsCamara && (
        <ModalMovsCamaraDetalle
          producto={modalMovsCamara.producto}
          movs={modalMovsCamara.movs}
          onClose={() => setModalMovsCamara(null)}
        />
      )}

      {modalDetMov && (
        <ModalDetMovimiento
          mov={modalDetMov}
          onClose={() => setModalDetMov(null)}
        />
      )}

      {modalNuevoInsumo && (
        <ModalNuevoInsumo
          onClose={() => setModalNuevoInsumo(false)}
          onSubmit={crearInsumoAdmin}
          saving={savingNuevoInsumo}
          categorias={categoriasSelect}
        />
      )}

      {modalAjustes && (() => {
        const prods = conteoFilasDepo.filter(f => {
          const v = parseFloat(f.stockFisico)
          return !isNaN(v) && v !== f.stockSistema
        }).map(f => ({ nombre: f.nombre, unidad: f.unidad, diferencia: parseFloat(f.stockFisico) - f.stockSistema }))
        return prods.length === 0 ? (
          (() => { aprobarConteoFormal({}); return null })()
        ) : (
          <ModalAprobarConteo
            productos={prods}
            onClose={() => setModalAjustes(false)}
            onConfirm={aprobarConteoFormal}
            saving={savingConteo}
          />
        )
      })()}

      {modalHistorial && (
        <Modal open onClose={() => setModalHistorial(false)} title="Historial de conteos" maxWidth="max-w-3xl" disableBackdropClose={false}>
          <div className="space-y-3">
            <p className="text-xs" style={{ color: colors.textMuted }}>
              Conteos de <b style={{ color: colors.textSecondary }}>depósito y cámara</b> del período seleccionado ({fmtFecha(rangoCS.desde)} – {fmtFecha(rangoCS.hasta)}). El comprobante se regenera con los datos guardados — podés reimprimirlo cuando quieras.
            </p>
            {cargandoHistorial ? (
              <p className="text-sm py-6 text-center" style={{ color: colors.textMuted }}>Cargando…</p>
            ) : ciclosHistorial.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: colors.textMuted }}>No hay conteos registrados en este período.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[640px]">
                  <Thead>
                    <Tr>
                      <Th>FECHA</Th><Th>ÁREA</Th><Th>RESPONSABLE</Th><Th>PRODUCTOS</Th>
                      <Th>FALTANTES</Th><Th>SOBRANTES</Th><Th>FALTANTE $</Th><Th></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {ciclosHistorial.map(c => (
                      <Tr key={c.clave}>
                        <Td className="text-xs whitespace-nowrap">{fmtFecha(c.fecha)}</Td>
                        <Td className="text-xs">
                          <span className="px-2 py-0.5 rounded-full font-semibold"
                            style={{ backgroundColor: c.area === 'camara' ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.12)', color: c.area === 'camara' ? colors.info : colors.success }}>
                            {c.area === 'camara' ? 'Cámara' : 'Depósito'}
                          </span>
                          {c.modo === 'ciego' && <span className="ml-1" title="A ciegas">🙈</span>}
                        </Td>
                        <Td className="text-xs" style={{ color: colors.textSecondary }}>{c.responsable || '—'}</Td>
                        <Td className="text-right text-xs">{c.n}</Td>
                        <Td className="text-right text-xs font-semibold" style={{ color: c.faltantes > 0 ? colors.danger : colors.textMuted }}>{c.faltantes}</Td>
                        <Td className="text-right text-xs font-semibold" style={{ color: c.sobrantes > 0 ? colors.warning : colors.textMuted }}>{c.sobrantes}</Td>
                        <Td className="text-right text-xs" style={{ color: c.valorFaltante > 0 ? colors.danger : colors.textMuted }}>{c.valorFaltante > 0 ? `$${pesos(c.valorFaltante)}` : '—'}</Td>
                        <Td className="text-right">
                          <Button variant="secondary" size="sm" onClick={() => reimprimirComprobante(c)} loading={reimprimiendo === c.clave} disabled={!c.ciclo_id}>
                            <FileDown size={12} /> Comprobante
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Gráfico oculto top diferencias Control Semanal — captura PDF */}
      {(() => {
        const top5Chart = conteoFilasDepo
          .map(f => ({ nombre: f.nombre, diff: parseFloat(f.stockFisico) - f.stockSistema }))
          .filter(f => !isNaN(f.diff) && f.diff !== 0)
          .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
          .slice(0, 5)
          .map(f => ({ nombre: f.nombre.length > 14 ? f.nombre.slice(0, 14) + '…' : f.nombre, diff: Number(f.diff.toFixed(2)) }))
        return (
          <div ref={chartRefConteo} style={{ position: 'fixed', left: '-9999px', top: 0, width: '760px', height: '240px', background: '#1e293b', padding: '16px 20px', zIndex: -1, borderRadius: '8px' }}>
            <BarChart width={720} height={208} data={top5Chart} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 10 }} />
              <YAxis type="category" dataKey="nombre" stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 10 }} width={110} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }} />
              <Bar dataKey="diff" fill="#D4521A" radius={[0, 4, 4, 0]} />
            </BarChart>
          </div>
        )
      })()}
    </div>
  )
}
