import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useUser } from '../context/UserContext'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
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
import { Warehouse, ArrowUp, ArrowDown, Search, Printer, FileDown, DollarSign, ClipboardCheck, AlertTriangle, TrendingUp, BarChart2, ChevronRight, Plus, Trash2 } from 'lucide-react'
const logoUrl = '/logo_delparque.png'

const SURFACE = { backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }

const TABS         = ['Movimientos', 'Stock', 'Trazabilidad', 'Informes', 'Control Semanal']
const DESTINOS     = ['Bases', 'Sabores', 'Postres', 'Impulsivos', 'Escocés', 'Bombones']
const PRESENTACIONES = ['Balde', 'Bolsa', 'Lata', 'Caja', 'Botella', 'Bidón', 'Pomo']
const UNIDADES     = ['u', 'kg', 'L']

const CATS_MAT_PRIMAS = new Set(['LÁCTEOS', 'AZÚCARES', 'CHOCOLATES', 'PASTAS', 'FRUTAS', 'VARIEGATOS', 'OTROS', 'NUEVO', 'General'])
const CATS_FILTRO_BASE = ['TODOS', 'BOLSAS', 'CUCURUCHOS', 'LIMPIEZA', 'REVENTA', 'TERMICOS']
const TODAS_LAS_CATS = ['BOLSAS', 'CUCURUCHOS', 'LIMPIEZA', 'REVENTA', 'TERMICOS', 'LÁCTEOS', 'AZÚCARES', 'CHOCOLATES', 'PASTAS', 'FRUTAS', 'VARIEGATOS', 'OTROS']

function motivosPorCategoria(categoria) {
  if (categoria === 'REVENTA') return ['Venta a cliente', 'Venta por mayor', 'Venta', 'Muestra', 'Baja por daño', 'Ajuste de inventario']
  return ['Uso en producción', 'Venta', 'Merma', 'Vencimiento', 'Devolución', 'Ajuste de inventario', 'Baja']
}
const MOTIVOS_INGRESO_DEPOSITO = ['Normal', 'Ajuste de inventario', 'Devolución de proveedor']
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
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

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
          ? (esMP ? (f.destino === 'N/A' ? 'Bases' : f.destino) : 'N/A')
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
    if (!esIngreso && !form.motivo) { setLocalError('Falta seleccionar el motivo'); return }
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
              <Input label="Proveedor *" type="text" value={form.proveedor} onChange={e => upd('proveedor', e.target.value)} />
              <Select label="Tipo de ingreso" value={form.motivo} onChange={e => upd('motivo', e.target.value)}>
                <option value="">Normal</option>
                {MOTIVOS_INGRESO_DEPOSITO.slice(1).map(m => <option key={m}>{m}</option>)}
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
                {/* Destino — solo para Materias Primas */}
                {esMatPrima ? (
                  <Select label="Destino *" value={form.destino} onChange={e => upd('destino', e.target.value)}>
                    {DESTINOS.map(d => <option key={d}>{d}</option>)}
                  </Select>
                ) : (
                  <div />
                )}
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

function ModalEditarInsumo({ insumo, onClose, onSubmit, saving, isAdmin, categorias = TODAS_LAS_CATS }) {
  const [form, setForm] = useState({
    stock_actual: insumo.stock_actual ?? '',
    stock_minimo: insumo.stock_minimo ?? '',
    stock_maximo: insumo.stock_maximo ?? '',
    costo_unitario: insumo.costo_unitario ?? '',
    categoria: insumo.categoria || 'OTROS',
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
        <div>
          <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Categoría</label>
          <select value={form.categoria} onChange={e => upd('categoria', e.target.value)}
            className="w-full rounded-lg border border-[#334155] text-sm text-[#F1F5F9] bg-[#0F172A] outline-none px-3 py-2 focus:ring-2 focus:ring-[#D4521A]/25 focus:border-[#D4521A]">
            {categorias.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
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
    <Modal open onClose={onClose} title={`${tipo === 'ingreso' ? '↑ Ingresos' : '↓ Egresos'} — ${producto}`} maxWidth="max-w-4xl">
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
                  <Td className="text-xs">{m.proveedor || m.destino || '—'}</Td>
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
    <Modal open onClose={onClose} title={`Evolución de consumo — ${insumo.nombre}`} maxWidth="max-w-2xl">
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
    <Modal open onClose={onClose} title={`Movimientos en cámara — ${producto}`} maxWidth="max-w-3xl">
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
    <Modal open onClose={onClose} title={titulo} maxWidth="max-w-md">
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

  // Control Semanal — nuevo
  const [periodoCS, setPeriodoCS]           = useState('semana_actual')
  const [periodoCSDesde, setPeriodoCSDesde] = useState('')
  const [periodoCSHasta, setPeriodoCSHasta] = useState('')
  const [modalMovsDet, setModalMovsDet]     = useState(null)
  const [modalEvolCS, setModalEvolCS]       = useState(null)
  const [generandoPDFstock, setGenerandoPDFstock] = useState(false)
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
  const [generandoPDFcamara, setGenerandoPDFcamara] = useState(false)
  const tablaDepositoRef = useRef(null)

  const { isAdmin, profile } = useUser()
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
    const [{ data: i }, { data: o }, { data: sc }, { data: ct }, { data: mc }] = await Promise.all([
      supabase.from('insumos').select('*').order('nombre'),
      supabase.from('operarios').select('*').order('nombre'),
      supabase.from('stock_camaras').select('*').order('nombre'),
      supabase.from('conteos_stock').select('*').order('fecha', { ascending: false }).limit(500),
      supabase.from('movimientos_camara').select('id,sabor_nombre,producto_nombre,tipo,kg,baldes,lote,operario_nombre,tipo_producto,motivo,created_at,fecha').order('id', { ascending: false }).limit(300),
    ])
    setInsumos(i || [])
    setOperarios(o || [])
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
      proveedor: modal === 'ingreso' ? form.proveedor : null,
      controlo: form.controlo,
      destino: modal === 'egreso' ? form.destino : null,
      operario_recibe: modal === 'egreso' ? form.operario_recibe : null,
      observaciones: form.observaciones || null,
      peso_por_unidad: pesoPorUnidad || null,
      peso_total: pesoTotal || null,
      nro_remito: form.nro_remito?.trim() || null,
      motivo: form.motivo || null,
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
        .select('id, stock_actual, nombre, peso_por_unidad')
        .eq('nombre', nombreProducto)
        .maybeSingle()
      console.log('Insumo encontrado (exacto):', found)
      insumoMatch = found
    }

    // 3. Si sigue sin encontrarse: búsqueda parcial
    if (!insumoMatch) {
      const { data: found } = await supabase
        .from('insumos')
        .select('id, stock_actual, nombre, peso_por_unidad')
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
    const payload = {
      stock_actual: parseFloat(form.stock_actual) || 0,
      stock_minimo: parseFloat(form.stock_minimo) || 0,
      stock_maximo: parseFloat(form.stock_maximo) || 0,
      categoria: form.categoria || 'OTROS',
    }
    if (isAdmin) payload.costo_unitario = parseFloat(form.costo_unitario) || 0
    setSavingInsumo(true)
    const { error } = await supabase.from('insumos').update(payload).eq('id', editInsumo.id)
    setSavingInsumo(false)
    if (error) { toast2(error.message, 'error'); return }
    const { data: todos } = await supabase.from('insumos').select('*').order('nombre')
    if (todos) setInsumos(todos)
    toast2('Insumo actualizado')
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
    return result
  }, [insumos, busqueda, filtroCategoria])

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
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pw = doc.internal.pageSize.getWidth()
      const HS = { fillColor: [212, 82, 26], textColor: 255 }
      const ST = { fontSize: 8, cellPadding: 2 }
      const hoy = new Date().toLocaleString('es-AR')

      // PÁGINA 1 — Portada
      try { const ld = await toDataURL(logoUrl); doc.addImage(ld, 'PNG', (pw - 50) / 2, 35, 50, 18) } catch {}
      doc.setFontSize(22); doc.setTextColor(17, 24, 39)
      doc.text('INFORME DE STOCK DE CÁMARAS', pw / 2, 80, { align: 'center' })
      doc.setDrawColor(212, 82, 26); doc.setLineWidth(1); doc.line(30, 86, pw - 30, 86)
      doc.setFontSize(12); doc.setTextColor(100, 100, 100)
      doc.text(`Fecha de emisión: ${hoy}`, pw / 2, 96, { align: 'center' })
      doc.setFontSize(7.5); doc.setTextColor(212, 82, 26)
      doc.text('Confidencial — Del Parque', pw / 2, 106, { align: 'center' })

      // PÁGINA 2 — Tabla completa
      doc.addPage()
      doc.setFontSize(14); doc.setTextColor(17, 24, 39)
      doc.text('Stock de productos en cámara', 14, 16)
      doc.setDrawColor(212, 82, 26); doc.setLineWidth(0.5); doc.line(14, 19, pw - 14, 19)

      const sorted = [...stockCamaras].sort((a, b) => {
        const o = { AGOTADO: 0, BAJO: 1, OK: 2 }
        return (o[estadoCamara(a)] ?? 2) - (o[estadoCamara(b)] ?? 2) || (a.nombre || '').localeCompare(b.nombre || '')
      })

      autoTable(doc, {
        startY: 24,
        head: [['PRODUCTO', 'TIPO', 'KG', 'BALDES', 'LOTE', 'ÚLTIMA ELABORACIÓN', 'OPERARIO', 'ESTADO']],
        body: sorted.map(c => [
          c.nombre || '—',
          c.tipo_producto || '—',
          (c.kg || 0).toFixed(1),
          String(c.baldes || 0),
          c.lote || '—',
          c.ultima_actualizacion ? new Date(c.ultima_actualizacion).toLocaleString('es-AR') : '—',
          c.operario_nombre || '—',
          estadoCamara(c),
        ]),
        styles: { ...ST, fontSize: 7.5 }, headStyles: HS,
        didParseCell(data) {
          if (data.section !== 'body') return
          const c = sorted[data.row.index]
          if (!c) return
          const est = estadoCamara(c)
          if (est === 'AGOTADO') data.cell.styles.fillColor = [254, 226, 226]
          else if (est === 'BAJO')   data.cell.styles.fillColor = [254, 249, 195]
        },
      })

      // Totales al pie
      const finalY = (doc.lastAutoTable?.finalY || 24) + 8
      doc.setFontSize(9); doc.setTextColor(70, 70, 70)
      doc.text(`Total: ${sorted.length} productos · ${kpisCamara.agotados} agotados · ${kpisCamara.bajos} en bajo stock · ${kpisCamara.totalKg.toFixed(1)} kg totales`, 14, finalY)

      // ÚLTIMA PÁGINA — Firmas
      doc.addPage()
      doc.setFontSize(14); doc.setTextColor(17, 24, 39); doc.text('Conformidad y Firmas', 14, 20)
      doc.setDrawColor(212, 82, 26); doc.setLineWidth(0.8); doc.line(14, 24, pw - 14, 24)
      doc.setFontSize(9); doc.setTextColor(100, 100, 100)
      doc.text(doc.splitTextToSize(`Informe generado automáticamente el ${hoy}.`, pw - 28), 14, 34)
      let yF = 60
      ;['Responsable de Cámaras', 'Supervisor', 'Gerente'].forEach(rol => {
        doc.setDrawColor(100, 100, 100); doc.setLineWidth(0.3); doc.line(14, yF, 80, yF)
        doc.setFontSize(8); doc.setTextColor(100, 100, 100)
        doc.text(rol, 14, yF + 5); doc.text('Nombre: ___________________________', 14, yF + 11)
        yF += 30
      })

      doc.save(`stock_camaras_${new Date().toISOString().split('T')[0]}.pdf`)
    } finally {
      setGenerandoPDFcamara(false)
    }
  }

  async function generarPDFStock() {
    setGenerandoPDFstock(true)
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pw = doc.internal.pageSize.getWidth()
      const HS = { fillColor: [212, 82, 26], textColor: 255 }
      const ST = { fontSize: 8, cellPadding: 2 }
      const periodoLabel = `${fmtFecha(rangoCS.desde)} – ${fmtFecha(rangoCS.hasta)}`

      // PÁGINA 1 — Portada
      try { const ld = await toDataURL(logoUrl); doc.addImage(ld, 'PNG', (pw - 50) / 2, 35, 50, 18) } catch {}
      doc.setFontSize(22); doc.setTextColor(17, 24, 39)
      doc.text('INFORME DE CONTROL DE STOCK', pw / 2, 80, { align: 'center' })
      doc.setDrawColor(212, 82, 26); doc.setLineWidth(1)
      doc.line(30, 86, pw - 30, 86)
      doc.setFontSize(12); doc.setTextColor(100, 100, 100)
      doc.text(`Período: ${periodoLabel}`, pw / 2, 96, { align: 'center' })
      doc.setFontSize(9)
      doc.text(`Fecha de emisión: ${new Date().toLocaleString('es-AR')}`, pw / 2, 104, { align: 'center' })
      doc.setFontSize(7.5); doc.setTextColor(212, 82, 26)
      doc.text('Confidencial — Del Parque', pw / 2, 114, { align: 'center' })

      // PÁGINA 2 — Resumen ejecutivo
      doc.addPage()
      doc.setFontSize(14); doc.setTextColor(17, 24, 39)
      doc.text('Resumen ejecutivo', 14, 16)
      doc.setDrawColor(212, 82, 26); doc.setLineWidth(0.5); doc.line(14, 19, pw - 14, 19)

      const totalInsumos = controlSemanal.length
      const criticos = controlSemanal.filter(r => r.estado === 'CRÍTICO').length
      const atencion = controlSemanal.filter(r => r.estado === 'ATENCIÓN').length
      const conDiff   = controlSemanal.filter(r => r.pctDiferencia > 3).length
      const totalIng  = controlSemanal.reduce((a, r) => a + r.ingresosKg, 0)
      const totalEgr  = controlSemanal.reduce((a, r) => a + r.egresosKg, 0)

      autoTable(doc, {
        startY: 24,
        body: [
          ['Total insumos analizados', String(totalInsumos), 'En estado crítico (< 3 días)', String(criticos)],
          ['En estado de atención (< 7 días)', String(atencion), 'Diferencias de inventario (> 3%)', String(conDiff)],
        ],
        styles: { ...ST, fontSize: 9 },
        columnStyles: { 0: { textColor: [100, 100, 100] }, 1: { fontStyle: 'bold', textColor: [17, 24, 39] }, 2: { textColor: [100, 100, 100] }, 3: { fontStyle: 'bold', textColor: [17, 24, 39] } },
        theme: 'grid',
      })

      let y = doc.lastAutoTable.finalY + 10
      doc.setFontSize(11); doc.setTextColor(17, 24, 39)
      doc.text('Análisis automático', 14, y); y += 6

      const criticosList = controlSemanal.filter(r => r.estado === 'CRÍTICO').map(r => r.nombre).join(', ')
      const mayorDiff = [...controlSemanal].filter(r => r.pctDiferencia > 3).sort((a, b) => b.pctDiferencia - a.pctDiferencia)[0]
      const reposicion = controlSemanal.filter(r => r.diasStock < 7 && r.consumoPromDiario > 0).map(r => r.nombre)

      const parrafos = [
        `Durante el período ${periodoLabel}, se registraron ingresos por ${totalIng.toFixed(1)} uds/kg y egresos por ${totalEgr.toFixed(1)} uds/kg en el depósito.`,
        criticos > 0
          ? `Se detectaron ${criticos} producto${criticos === 1 ? '' : 's'} con stock crítico: ${criticosList}.`
          : 'No se detectaron productos con stock crítico en este período.',
        mayorDiff
          ? `${conDiff} producto${conDiff === 1 ? '' : 's'} presenta${conDiff === 1 ? '' : 'n'} diferencias entre el stock del sistema y el conteo físico. El mayor: ${mayorDiff.nombre} con ${Math.abs(mayorDiff.diferencia).toFixed(2)} ${mayorDiff.unidad} (${mayorDiff.pctDiferencia.toFixed(1)}%).`
          : 'No se detectaron diferencias significativas de inventario.',
        reposicion.length > 0 ? `Se recomienda reponer: ${reposicion.join(', ')}.` : null,
      ].filter(Boolean)

      doc.setFontSize(9); doc.setTextColor(70, 70, 70)
      parrafos.forEach(p => {
        const wrapped = doc.splitTextToSize(`• ${p}`, pw - 28)
        doc.text(wrapped, 14, y)
        y += wrapped.length * 5 + 2
      })

      // PÁGINA 3 — Tabla completa de stock
      doc.addPage()
      doc.setFontSize(14); doc.setTextColor(17, 24, 39)
      doc.text('Tabla completa de stock', 14, 16)
      doc.setDrawColor(212, 82, 26); doc.setLineWidth(0.5); doc.line(14, 19, pw - 14, 19)

      const bodyTabla = [
        ...controlSemanal.map(r => [
          r.nombre,
          `${r.stockInicial.toFixed(1)} ${r.unidad || ''}`.trim(),
          r.ingresosKg.toFixed(1), r.egresosKg.toFixed(1), r.stockSistema.toFixed(1),
          r.conteoFisico !== null ? r.conteoFisico.toFixed(1) : '—',
          r.diferencia !== null ? `${r.diferencia > 0 ? '+' : ''}${r.diferencia.toFixed(2)}` : '—',
          r.diasStock === Infinity ? '♾' : r.diasStock.toFixed(0),
          r.estado,
        ]),
        ['TOTAL', '', controlSemanal.reduce((a, r) => a + r.ingresosKg, 0).toFixed(1),
          controlSemanal.reduce((a, r) => a + r.egresosKg, 0).toFixed(1),
          controlSemanal.reduce((a, r) => a + r.stockSistema, 0).toFixed(1), '', '', '', ''],
      ]

      autoTable(doc, {
        startY: 24,
        head: [['PRODUCTO', 'ST.INICIAL', 'INGRESOS', 'EGRESOS', 'ST.SISTEMA', 'C.FÍSICO', 'DIFERENCIA', 'DÍAS', 'ESTADO']],
        body: bodyTabla,
        styles: { ...ST, fontSize: 7 }, headStyles: HS,
        didParseCell(data) {
          if (data.section !== 'body') return
          const row = controlSemanal[data.row.index]
          if (!row) return
          if (row.estado === 'CRÍTICO') data.cell.styles.fillColor = [254, 226, 226]
          else if (row.estado === 'ATENCIÓN') data.cell.styles.fillColor = [254, 249, 195]
        },
      })

      // PÁGINA 4 — Faltantes y sobrantes
      doc.addPage()
      doc.setFontSize(14); doc.setTextColor(17, 24, 39)
      doc.text('Análisis de faltantes y sobrantes', 14, 16)
      doc.setDrawColor(212, 82, 26); doc.setLineWidth(0.5); doc.line(14, 19, pw - 14, 19)

      const faltantes = controlSemanal.filter(r => r.diferencia !== null && r.diferencia < 0)
      const sobrantes = controlSemanal.filter(r => r.diferencia !== null && r.diferencia > 0)

      doc.setFontSize(11); doc.setTextColor(17, 24, 39); doc.text('A — Faltantes', 14, 26)
      if (faltantes.length === 0) {
        doc.setFontSize(9); doc.setTextColor(100, 100, 100); doc.text('Sin faltantes detectados.', 14, 33)
      } else {
        autoTable(doc, {
          startY: 30,
          head: [['PRODUCTO', 'ST. SISTEMA', 'CONTEO FÍS.', 'FALTANTE', '%', 'CAUSA PROBABLE']],
          body: faltantes.map(r => {
            const causa = r.pctDiferencia < 3 ? 'Dentro del margen normal (±3%)'
              : r.pctDiferencia > 10 ? 'Posible error de registro o merma no registrada'
              : r.egresosKg > r.ingresosKg * 2 ? 'Alto consumo en el período'
              : r.ingresosKg === 0 ? 'Sin reposición reciente'
              : 'Consumo normal, requiere revisión'
            return [r.nombre, `${r.stockSistema.toFixed(2)}`, `${r.conteoFisico.toFixed(2)}`,
              `${Math.abs(r.diferencia).toFixed(2)}`, `${r.pctDiferencia.toFixed(1)}%`, causa]
          }),
          styles: { ...ST, fontSize: 7 },
          headStyles: { fillColor: [220, 38, 38], textColor: 255 },
        })
      }

      const yB = (doc.lastAutoTable?.finalY || 38) + 10
      doc.setFontSize(11); doc.setTextColor(17, 24, 39); doc.text('B — Sobrantes', 14, yB)
      if (sobrantes.length === 0) {
        doc.setFontSize(9); doc.setTextColor(100, 100, 100); doc.text('Sin sobrantes detectados.', 14, yB + 7)
      } else {
        autoTable(doc, {
          startY: yB + 4,
          head: [['PRODUCTO', 'ST. SISTEMA', 'CONTEO FÍS.', 'SOBRANTE', '%', 'CAUSA PROBABLE']],
          body: sobrantes.map(r => {
            const causa = r.pctDiferencia > 20 ? 'Posible ingreso no registrado en el sistema'
              : r.ingresosKg > 0 && r.egresosKg === 0 ? 'Ingreso reciente sin consumo'
              : 'Sobrante dentro del margen, verificar'
            return [r.nombre, `${r.stockSistema.toFixed(2)}`, `${r.conteoFisico.toFixed(2)}`,
              `${r.diferencia.toFixed(2)}`, `${r.pctDiferencia.toFixed(1)}%`, causa]
          }),
          styles: { ...ST, fontSize: 7 },
          headStyles: { fillColor: [22, 163, 74], textColor: 255 },
        })
      }

      // PÁGINA 5 — Recomendaciones de reposición
      doc.addPage()
      doc.setFontSize(14); doc.setTextColor(17, 24, 39)
      doc.text('Recomendaciones de reposición', 14, 16)
      doc.setDrawColor(212, 82, 26); doc.setLineWidth(0.5); doc.line(14, 19, pw - 14, 19)

      const recomendaciones = controlSemanal
        .filter(r => r.consumoPromDiario > 0 && r.diasStock < 14)
        .sort((a, b) => a.diasStock - b.diasStock)

      if (recomendaciones.length === 0) {
        doc.setFontSize(9); doc.setTextColor(100, 100, 100)
        doc.text('No hay productos que requieran reposición inmediata.', 14, 26)
      } else {
        autoTable(doc, {
          startY: 24,
          head: [['URGENCIA', 'PRODUCTO', 'STOCK ACTUAL', 'CONSUMO/DÍA', 'DÍAS REST.', 'CANT. SUGERIDA']],
          body: recomendaciones.map(r => [
            r.diasStock < 3 ? 'URGENTE' : 'PRONTO',
            r.nombre,
            `${r.stockSistema.toFixed(1)} ${r.unidad || ''}`.trim(),
            `${r.consumoPromDiario.toFixed(1)} ${r.unidad || ''}/día`.trim(),
            r.diasStock === Infinity ? '♾' : `${r.diasStock.toFixed(0)} días`,
            `${(r.consumoPromDiario * 14).toFixed(1)} ${r.unidad || ''}`.trim(),
          ]),
          styles: { ...ST, fontSize: 8 }, headStyles: HS,
          didParseCell(data) {
            if (data.section !== 'body') return
            if (recomendaciones[data.row.index]?.diasStock < 3)
              data.cell.styles.fillColor = [254, 226, 226]
          },
        })
      }

      // ÚLTIMA PÁGINA — Firmas
      doc.addPage()
      doc.setFontSize(14); doc.setTextColor(17, 24, 39); doc.text('Conformidad y Firmas', 14, 20)
      doc.setDrawColor(212, 82, 26); doc.setLineWidth(0.8); doc.line(14, 24, pw - 14, 24)
      doc.setFontSize(9); doc.setTextColor(100, 100, 100)
      const ft = `El presente informe de control de stock corresponde al período ${periodoLabel} y fue generado automáticamente el ${new Date().toLocaleString('es-AR')}.`
      doc.text(doc.splitTextToSize(ft, pw - 28), 14, 34)
      let yF = 60
      ;['Responsable de Depósito', 'Supervisor', 'Gerente'].forEach(rol => {
        doc.setDrawColor(100, 100, 100); doc.setLineWidth(0.3); doc.line(14, yF, 80, yF)
        doc.setFontSize(8); doc.setTextColor(100, 100, 100)
        doc.text(rol, 14, yF + 5)
        doc.text('Nombre y apellido: ___________________________', 14, yF + 11)
        yF += 30
      })

      doc.save(`control_stock_${new Date().toISOString().split('T')[0]}.pdf`)
    } finally {
      setGenerandoPDFstock(false)
    }
  }

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
                            <p className="text-sm font-medium truncate" style={{ color: colors.textPrimary }}>{ins.nombre}</p>
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
            <div className="space-y-5">

              {/* ── Toggle Depósito / Cámaras ─── */}
              <div className="flex gap-2 flex-wrap">
                {[
                  { key: 'deposito', label: '📦 Depósito (Insumos)' },
                  { key: 'camara',   label: '🧊 Cámaras (Productos elaborados)' },
                ].map(s => (
                  <button key={s.key} onClick={() => setSeccionCS(s.key)}
                    className="px-4 py-2 rounded-full text-sm font-semibold transition-all border"
                    style={{
                      backgroundColor: seccionCS === s.key ? colors.brand : 'transparent',
                      borderColor: seccionCS === s.key ? colors.brand : colors.border,
                      color: seccionCS === s.key ? 'white' : colors.textSecondary,
                    }}>
                    {s.label}
                  </button>
                ))}
              </div>

              {/* ══════════════ SECCIÓN DEPÓSITO ══════════════ */}
              {seccionCS === 'deposito' && (<>

              {/* ── Selector de período ─── */}
              <div className="p-3 flex flex-wrap items-center gap-3 justify-between" style={SURFACE}>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { key: 'semana_actual', label: 'Esta semana' },
                    { key: 'semana_pasada', label: 'Semana pasada' },
                    { key: 'mes_actual', label: 'Este mes' },
                    { key: 'personalizado', label: 'Personalizado' },
                  ].map(p => (
                    <button key={p.key} onClick={() => setPeriodoCS(p.key)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all border"
                      style={{
                        backgroundColor: periodoCS === p.key ? colors.brand : 'transparent',
                        borderColor: periodoCS === p.key ? colors.brand : colors.border,
                        color: periodoCS === p.key ? 'white' : colors.textSecondary,
                      }}>
                      {p.label}
                    </button>
                  ))}
                </div>
                {periodoCS === 'personalizado' && (
                  <div className="flex gap-2 items-center">
                    <Input type="date" value={periodoCSDesde} onChange={e => setPeriodoCSDesde(e.target.value)} />
                    <span className="text-xs" style={{ color: colors.textMuted }}>–</span>
                    <Input type="date" value={periodoCSHasta} onChange={e => setPeriodoCSHasta(e.target.value)} />
                  </div>
                )}
                {periodoCS !== 'personalizado' && (
                  <p className="text-xs" style={{ color: colors.textMuted }}>
                    {fmtFecha(rangoCS.desde)} – {fmtFecha(rangoCS.hasta)}
                  </p>
                )}
              </div>

              {/* ── KPIs clickeables ─── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard label="Insumos analizados" value={controlSemanal.length} icon={Warehouse} color={colors.brand}
                  onClick={() => { setFiltroTablaCS(null); setTimeout(() => tablaDepositoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} />
                <KpiCard label="Stock crítico" value={controlSemanal.filter(r => r.estado === 'CRÍTICO').length}
                  icon={AlertTriangle} color={colors.danger}
                  onClick={() => { setFiltroTablaCS(f => f === 'critico' ? null : 'critico'); setTimeout(() => tablaDepositoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} />
                <KpiCard label="Requieren atención" value={controlSemanal.filter(r => r.estado === 'ATENCIÓN').length}
                  icon={TrendingUp} color={colors.warning}
                  onClick={() => { setFiltroTablaCS(f => f === 'atencion' ? null : 'atencion'); setTimeout(() => tablaDepositoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} />
                <KpiCard label="Diferencias inventario" value={controlSemanal.filter(r => r.pctDiferencia > 3).length}
                  icon={BarChart2} color={colors.info}
                  onClick={() => { setFiltroTablaCS(f => f === 'diferencia' ? null : 'diferencia'); setTimeout(() => tablaDepositoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} />
              </div>

              {/* ── Panel de alertas ─── */}
              {alertasCS.length > 0 && (
                <div className="p-4 space-y-2" style={SURFACE}>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: colors.textPrimary }}>Alertas inteligentes</h3>
                  {alertasCS.map((a, idx) => (
                    <div key={idx} className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
                      style={{
                        backgroundColor: a.tipo === 'critico' ? 'rgba(239,68,68,0.12)' : a.tipo === 'reposicion' ? 'rgba(245,158,11,0.12)' : a.tipo === 'diferencia' ? 'rgba(96,165,250,0.12)' : colors.surface,
                        border: `1px solid ${a.tipo === 'critico' ? 'rgba(239,68,68,0.25)' : a.tipo === 'reposicion' ? 'rgba(245,158,11,0.25)' : a.tipo === 'diferencia' ? 'rgba(96,165,250,0.25)' : colors.border}`,
                      }}>
                      <span className="text-base leading-none mt-0.5">
                        {a.tipo === 'critico' ? '🔴' : a.tipo === 'reposicion' ? '🟡' : a.tipo === 'diferencia' ? '⚠️' : '🕐'}
                      </span>
                      <span style={{ color: a.tipo === 'critico' ? colors.danger : a.tipo === 'reposicion' ? colors.warning : a.tipo === 'diferencia' ? colors.info : colors.textSecondary }}>
                        {a.tipo === 'critico' && <><strong>STOCK CRÍTICO — {a.producto}:</strong> quedan {a.diasStock.toFixed(1)} días con consumo de {a.consumo.toFixed(1)} {a.unidad}/día.</>}
                        {a.tipo === 'reposicion' && <><strong>REPOSICIÓN SUGERIDA — {a.producto}:</strong> {a.diasStock.toFixed(1)} días de stock. Sugerido: {a.cantSugerida.toFixed(1)} {a.unidad} (2 semanas).</>}
                        {a.tipo === 'diferencia' && <><strong>DIFERENCIA DE INVENTARIO — {a.producto}:</strong> {a.diferencia > 0 ? '+' : ''}{a.diferencia.toFixed(2)} {a.unidad} ({a.pct.toFixed(1)}%).</>}
                        {a.tipo === 'sin_movimiento' && <><strong>SIN MOVIMIENTO — {a.producto}:</strong> hace {a.dias} días sin movimientos.</>}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Filtro por categoría ─── */}
              <div className="flex gap-1.5 flex-wrap items-center">
                <span className="text-xs font-medium" style={{ color: colors.textMuted }}>Categoría:</span>
                {CATS_FILTRO_BASE.map(cat => (
                  <button key={cat} onClick={() => setFiltroCSCategoria(cat)}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition-all border"
                    style={{
                      backgroundColor: filtroCSCategoria === cat ? colors.brand : 'transparent',
                      borderColor: filtroCSCategoria === cat ? colors.brand : colors.border,
                      color: filtroCSCategoria === cat ? 'white' : colors.textSecondary,
                    }}>
                    {cat}
                  </button>
                ))}
              </div>

              {/* ── Tabla principal (con filtro activo) ─── */}
              <div ref={tablaDepositoRef} className="overflow-hidden" style={SURFACE}>
                <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Control de stock — Depósito</span>
                    {filtroCSCategoria !== 'TODOS' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ backgroundColor: '#eff6ff', color: colors.info }}>
                        {filtroCSCategoria}
                        <button onClick={() => setFiltroCSCategoria('TODOS')} className="ml-1 font-bold hover:opacity-70">✕</button>
                      </span>
                    )}
                    {filtroTablaCS && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
                        style={{ backgroundColor: filtroTablaCS === 'critico' ? 'rgba(239,68,68,0.12)' : filtroTablaCS === 'atencion' ? 'rgba(245,158,11,0.12)' : 'rgba(96,165,250,0.12)', color: filtroTablaCS === 'critico' ? colors.danger : filtroTablaCS === 'atencion' ? colors.warning : colors.info }}>
                        {filtroTablaCS === 'critico' ? '🔴 Solo críticos' : filtroTablaCS === 'atencion' ? '🟡 Críticos + Atención' : '⚠️ Con diferencias'}
                        <button onClick={() => setFiltroTablaCS(null)} className="ml-1 font-bold hover:opacity-70">✕</button>
                      </span>
                    )}
                    <span className="text-xs" style={{ color: colors.textMuted }}>
                      {controlSemanalFiltrado.length} de {controlSemanal.length} insumos
                    </span>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setModalConteo('deposito')}>
                    <ClipboardCheck size={13} /> Registrar conteo
                  </Button>
                </div>
                {controlSemanalFiltrado.length === 0 ? (
                  <EmptyState icon={Warehouse} title={filtroTablaCS ? 'Sin insumos con ese estado' : 'Sin insumos cargados'} />
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[1100px]">
                      <Thead>
                        <Tr>
                          <Th>PRODUCTO</Th><Th>ST. INICIAL</Th><Th>INGRESOS</Th><Th>EGRESOS</Th>
                          <Th>BALANCE</Th><Th>ST. SISTEMA</Th><Th>CONTEO FÍSICO</Th>
                          <Th>DIFERENCIA</Th><Th>DÍAS DE STOCK</Th><Th>ESTADO</Th>
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
                                <button className="font-medium text-left hover:underline flex items-center gap-1"
                                  style={{ color: colors.brand }}
                                  onClick={() => setModalEvolCS(r)}>
                                  {r.nombre}
                                  <BarChart2 size={12} style={{ color: colors.textMuted }} />
                                </button>
                              </Td>
                              <Td className="text-right text-xs" style={{ color: colors.textMuted }}>
                                {r.stockInicial.toFixed(1)} {r.unidad}
                              </Td>
                              <Td className="text-right">
                                {r.ingresosKg > 0 ? (
                                  <button className="font-semibold hover:underline" style={{ color: colors.success }}
                                    onClick={() => setModalMovsDet({ tipo: 'ingreso', producto: r.nombre, movs: r.ingresosMovs })}>
                                    +{r.ingresosKg.toFixed(1)} {r.unidad}
                                  </button>
                                ) : <span style={{ color: colors.textMuted }}>—</span>}
                              </Td>
                              <Td className="text-right">
                                {r.egresosKg > 0 ? (
                                  <button className="font-semibold hover:underline" style={{ color: colors.danger }}
                                    onClick={() => setModalMovsDet({ tipo: 'egreso', producto: r.nombre, movs: r.egresosMovs })}>
                                    -{r.egresosKg.toFixed(1)} {r.unidad}
                                  </button>
                                ) : <span style={{ color: colors.textMuted }}>—</span>}
                              </Td>
                              <Td className="text-right text-xs font-semibold"
                                style={{ color: r.balance > 0 ? colors.success : r.balance < 0 ? colors.danger : colors.textMuted }}>
                                {r.balance > 0 ? '+' : ''}{r.balance.toFixed(1)} {r.unidad}
                              </Td>
                              <Td className="text-right font-semibold">{r.stockSistema.toFixed(1)} {r.unidad}</Td>
                              <Td className="text-right text-xs" style={{ color: colors.textSecondary }}>
                                {r.conteoFisico !== null ? `${r.conteoFisico.toFixed(1)} ${r.unidad}` : '—'}
                              </Td>
                              <Td className="text-right font-semibold"
                                style={{ color: diffBig ? colors.danger : r.diferencia !== null ? colors.textSecondary : colors.textMuted }}>
                                {r.diferencia !== null ? (
                                  <span className="inline-flex items-center gap-1">
                                    {r.diferencia > 0 ? '+' : ''}{r.diferencia.toFixed(2)} {r.unidad}
                                    {diffBig && <AlertTriangle size={12} />}
                                    {diffBig && <span className="text-[10px]">({r.pctDiferencia.toFixed(1)}%)</span>}
                                  </span>
                                ) : '—'}
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

              {/* ── Comparación semana vs semana ─── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[{ key: 'deposito', label: 'Depósito' }, { key: 'camara', label: 'Cámaras' }].map(({ key, label }) => {
                  const comp = comparacionSemanal[key]
                  const actual = comp.actual?.[1] || 0
                  const anterior = comp.anterior?.[1]
                  const mejora = anterior > 0 ? ((anterior - actual) / anterior) * 100 : null
                  return (
                    <div key={key} className="p-4" style={SURFACE}>
                      <h3 className="text-sm font-semibold mb-2" style={{ color: colors.textPrimary }}>{label} — diferencia vs. semana anterior</h3>
                      <div className="flex gap-6">
                        <div>
                          <p className="text-xs" style={{ color: colors.textMuted }}>Esta semana</p>
                          <p className="text-xl font-bold" style={{ color: colors.textPrimary }}>{actual.toFixed(2)} {key === 'camara' ? 'kg' : 'u'}</p>
                        </div>
                        {anterior !== undefined && <div>
                          <p className="text-xs" style={{ color: colors.textMuted }}>Semana anterior</p>
                          <p className="text-xl font-bold" style={{ color: colors.textMuted }}>{anterior.toFixed(2)} {key === 'camara' ? 'kg' : 'u'}</p>
                        </div>}
                      </div>
                      {mejora !== null && <p className="text-xs mt-2 font-semibold" style={{ color: mejora >= 0 ? colors.success : colors.danger }}>{mejora >= 0 ? `↓ Mejoró ${mejora.toFixed(0)}%` : `↑ Empeoró ${Math.abs(mejora).toFixed(0)}%`} vs. semana anterior</p>}
                      {!comp.actual && <p className="text-xs mt-2" style={{ color: colors.textMuted }}>Sin conteos aún</p>}
                    </div>
                  )
                })}
              </div>

              {/* ── Botón PDF depósito ─── */}
              <div className="flex justify-end">
                <Button variant="primary" onClick={generarPDFStock} loading={generandoPDFstock} disabled={generandoPDFstock || (periodoCS === 'personalizado' && (!periodoCSDesde || !periodoCSHasta))}>
                  <FileDown size={15} /> Generar Informe PDF de Stock
                </Button>
              </div>

              </>)} {/* fin seccionCS === 'deposito' */}

              {/* ══════════════ SECCIÓN CÁMARAS ══════════════ */}
              {seccionCS === 'camara' && (<>

              {/* KPIs cámaras */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard label="Total en cámara" value={kpisCamara.total} icon={Warehouse} color={colors.brand} />
                <KpiCard label="Agotados" value={kpisCamara.agotados} icon={AlertTriangle} color={colors.danger} />
                <KpiCard label="Stock bajo (≤ 3 baldes)" value={kpisCamara.bajos} icon={TrendingUp} color={colors.warning} />
                <KpiCard label="KG totales en cámara" value={`${kpisCamara.totalKg.toFixed(1)} kg`} icon={BarChart2} color={colors.info} />
              </div>

              {/* Tabla cámaras */}
              <div className="overflow-hidden" style={SURFACE}>
                <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Productos en cámara</span>
                  <Button variant="secondary" size="sm" onClick={() => setModalConteo('camara')}>
                    <ClipboardCheck size={13} /> Registrar conteo
                  </Button>
                </div>
                {stockCamaras.length === 0 ? (
                  <EmptyState icon={Warehouse} title="Sin productos en cámaras" />
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[900px]">
                      <Thead>
                        <Tr>
                          <Th>PRODUCTO</Th><Th>TIPO</Th><Th>STOCK KG</Th><Th>BALDES/U.</Th>
                          <Th>ING. PER.</Th><Th>EGR. PER.</Th><Th>LOTE</Th><Th>ESTADO</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {[...stockCamaras].sort((a, b) => {
                          const o = { AGOTADO: 0, BAJO: 1, OK: 2 }
                          return (o[estadoCamara(a)] ?? 2) - (o[estadoCamara(b)] ?? 2) || (a.nombre || '').localeCompare(b.nombre || '')
                        }).map(c => {
                          const est = estadoCamara(c)
                          const rowBg = est === 'AGOTADO' ? 'rgba(239,68,68,0.08)' : est === 'BAJO' ? 'rgba(245,158,11,0.08)' : 'transparent'
                          const esImpC = (c.tipo_producto || '') === 'impulsivo'
                          const statsRow = statsCamaraCS[(c.nombre || '').trim().toLowerCase()] || {}
                          const movsProd = movsCamara.filter(m => {
                            const sn = (m.sabor_nombre || m.producto_nombre || '').trim().toLowerCase()
                            return sn === (c.nombre || '').trim().toLowerCase()
                          })
                          return (
                            <Tr key={c.id} style={{ backgroundColor: rowBg }}>
                              <Td>
                                <button className="font-medium text-left hover:underline" style={{ color: colors.brand }}
                                  onClick={() => setModalMovsCamara({ producto: c.nombre, movs: movsProd })}>
                                  {c.nombre}
                                </button>
                              </Td>
                              <Td>
                                <Badge variant={c.tipo_producto === 'helado' ? 'info' : c.tipo_producto === 'impulsivo' ? 'warning' : 'neutral'}>
                                  {c.tipo_producto ? c.tipo_producto.charAt(0).toUpperCase() + c.tipo_producto.slice(1) : '—'}
                                </Badge>
                              </Td>
                              <Td className="text-right font-semibold">{esImpC ? '—' : `${(c.kg || 0).toFixed(1)} kg`}</Td>
                              <Td className="text-right">{c.baldes || 0}{esImpC ? ' u.' : ' bal.'}</Td>
                              <Td className="text-right text-xs" style={{ color: colors.success }}>
                                {esImpC
                                  ? (statsRow.ingresosU || 0) > 0 ? `+${statsRow.ingresosU} u.` : '—'
                                  : (statsRow.ingresosKg || 0) > 0 ? `+${(statsRow.ingresosKg).toFixed(1)} kg` : '—'}
                              </Td>
                              <Td className="text-right text-xs" style={{ color: colors.danger }}>
                                {esImpC
                                  ? (statsRow.egresosU || 0) > 0 ? `-${statsRow.egresosU} u.` : '—'
                                  : (statsRow.egresosKg || 0) > 0 ? `-${(statsRow.egresosKg).toFixed(1)} kg` : '—'}
                              </Td>
                              <Td>
                                {c.lote
                                  ? <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(212,82,26,0.15)', color: colors.brand }}>{c.lote}</span>
                                  : <span style={{ color: colors.textMuted }}>—</span>}
                              </Td>
                              <Td>
                                <Badge variant={est === 'AGOTADO' ? 'danger' : est === 'BAJO' ? 'warning' : 'success'}>
                                  {est === 'AGOTADO' ? '🔴 AGOTADO' : est === 'BAJO' ? '🟡 BAJO' : '🟢 OK'}
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

              {/* Botón PDF cámaras */}
              <div className="flex justify-end">
                <Button variant="primary" onClick={generarPDFCamaras} loading={generandoPDFcamara} disabled={generandoPDFcamara}>
                  <FileDown size={15} /> Generar PDF Cámaras
                </Button>
              </div>

              </>)} {/* fin seccionCS === 'camara' */}

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
    </div>
  )
}
