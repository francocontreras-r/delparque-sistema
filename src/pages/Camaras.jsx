import { useState, useEffect, useMemo } from 'react'
import { Search, LayoutGrid, List, Printer, ArrowUp, ArrowDown, FileDown, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { deduplicarOperarios } from '../lib/operarios'
import { useUser } from '../context/UserContext'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { LOGO_HORIZONTAL } from '../assets/logos'
const logoUrl = '/logo_delparque.png'
import { colors, shadow, radius } from '../styles/design-system'
import KpiCard from '../components/ui/KpiCard'
import Toast from '../components/ui/Toast'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Modal from '../components/ui/Modal'

const TIPO_PRECIOS = {
  Lisa:           { costo_kg: 1200, precio_kg: 2800 },
  'Con Agregado': { costo_kg: 1500, precio_kg: 3200 },
  Agua:           { costo_kg:  900, precio_kg: 2200 },
  Especial:       { costo_kg: 2000, precio_kg: 4500 },
}
const TIPOS = ['Todos', 'Lisa', 'Con Agregado', 'Agua', 'Especial']
const TIPO_BADGE = {
  Lisa:           { bg: 'rgba(96,165,250,0.12)',  color: '#60A5FA' },
  'Con Agregado': { bg: 'rgba(139,92,246,0.12)',  color: '#A78BFA' },
  Agua:           { bg: 'rgba(34,211,238,0.12)',  color: '#22D3EE' },
  Especial:       { bg: 'rgba(212,82,26,0.12)',   color: '#D4521A' },
  Impulsivo:      { bg: 'rgba(245,158,11,0.12)',  color: '#F59E0B' },
  Postre:         { bg: 'rgba(250,204,21,0.12)',  color: '#EAB308' },
}
const TIPOS_PRODUCTO = [
  { key: 'helado',    label: 'Helados' },
  { key: 'impulsivo', label: 'Impulsivos' },
  { key: 'postre',    label: 'Postres' },
]
const MOTIVOS_INGRESO_CAMARA = ['Producción', 'Ajuste de inventario', 'Transferencia', 'Devolución']
const MOTIVOS_EGRESO_CAMARA  = ['Venta', 'Ajuste de inventario', 'Merma', 'Transferencia', 'Baja', 'Producción']
const ROLES = ['operario', 'admin']
const CAMARAS_NOMBRES = ['Cámara 1', 'Cámara 2', 'Cámara 3', 'Antecámara', 'Túnel de frío']

// ── Helpers ───────────────────────────────────────────────────────────────────

function estadoSabor(baldes) {
  if (baldes === 0)  return { dot: colors.danger,  label: 'Agotado', accent: '#dc2626' }
  if (baldes <= 3)   return { dot: colors.warning, label: 'Bajo',    accent: '#d97706' }
  return                    { dot: colors.success, label: 'OK',      accent: '#16a34a' }
}

function estadoBadgeVariant(baldes) {
  if (baldes === 0) return 'danger'
  if (baldes <= 3)  return 'warning'
  return 'success'
}

function pesos(n) { return Math.round(n).toLocaleString('es-AR') }

function estadoTemp(grados) {
  if (grados > -15) return { label: '⚠️ TEMPERATURA ALTA', variant: 'danger',  color: '#ef4444' }
  if (grados > -18) return { label: '⚠️ ATENCIÓN',         variant: 'warning', color: '#f59e0b' }
  return                   { label: '✅ OK',                variant: 'success', color: '#22c55e' }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, padding: '14px', borderLeft: `4px solid ${colors.border}` }}>
      <div className="h-2.5 w-3/4 rounded mb-3" style={{ backgroundColor: colors.border }} />
      <div className="h-7 w-1/3 rounded mb-2" style={{ backgroundColor: colors.border }} />
      <div className="h-2 w-1/2 rounded" style={{ backgroundColor: colors.border }} />
    </div>
  )
}

// ── Tarjeta grilla ────────────────────────────────────────────────────────────

function TarjetaSabor({ item, onClick, showVal, onDelete }) {
  const e    = estadoSabor(item.baldes)
  const esImp  = (item.tipo_producto || '') === 'impulsivo'
  const esPost = (item.tipo_producto || '') === 'postre'
  const tb   = esImp
    ? TIPO_BADGE['Impulsivo']
    : esPost
      ? TIPO_BADGE['Postre']
      : (TIPO_BADGE[item.tipo] || { bg: 'rgba(100,116,139,0.12)', color: '#94A3B8' })
  const precioKg = item.precio_kg || TIPO_PRECIOS[item.tipo]?.precio_kg
  const [hov, setHov] = useState(false)

  return (
    <button
      onClick={() => onClick(item)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="text-left transition-all duration-150 w-full relative group"
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        border: `1px solid ${hov ? e.dot + '80' : colors.border}`,
        borderLeft: `4px solid ${e.dot}`,
        padding: '12px 14px',
        boxShadow: hov ? shadow.md : shadow.sm,
      }}
    >
      <div className="flex items-start justify-between gap-1 mb-2">
        <span className="text-xs font-semibold leading-tight pr-1" style={{ color: colors.textPrimary }}>
          {item.nombre}
        </span>
        <div className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: e.dot }} />
      </div>
      <p className="text-2xl font-extrabold leading-none mb-1" style={{ color: e.dot }}>
        {item.baldes}
      </p>
      {esImp
        ? <p className="text-xs mb-2" style={{ color: colors.textMuted }}>unidades</p>
        : esPost
          ? <p className="text-xs mb-2" style={{ color: colors.textMuted }}>unidades · {Number(item.kg).toFixed(1)} kg</p>
          : <p className="text-xs mb-2" style={{ color: colors.textMuted }}>baldes · {Number(item.kg).toFixed(1)} kg</p>}
      {item.lote && (
        <span className="inline-block text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded mb-1.5"
          style={{ backgroundColor: 'rgba(212,82,26,0.15)', color: colors.brand, border: '1px solid rgba(212,82,26,0.3)' }}>
          {item.lote}
        </span>
      )}
      {item.operario_nombre && (
        <p className="text-[10px] mb-1 truncate" style={{ color: colors.textMuted }}>
          👤 {item.operario_nombre}
        </p>
      )}
      {item.ultima_actualizacion && (
        <p className="text-[10px] mb-1.5" style={{ color: colors.textMuted }}>
          {new Date(item.ultima_actualizacion).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
      {showVal && !esImp && !esPost && precioKg && item.kg > 0 && (
        <p className="text-xs font-bold mb-1.5" style={{ color: colors.brand }}>
          ${pesos(item.kg * precioKg)}
        </p>
      )}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md inline-block"
          style={{ backgroundColor: tb.bg, color: tb.color }}>
          {esImp ? 'Impulsivo' : esPost ? 'Postre' : (item.tipo || '—')}
        </span>
        <Badge variant={estadoBadgeVariant(item.baldes)} className="!text-[10px] !px-1.5 !py-0.5">{e.label}</Badge>
      </div>
      {onDelete && (
        <button
          onClick={ev => { ev.stopPropagation(); onDelete(item) }}
          className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
          title="Eliminar">
          <Trash2 size={11} />
        </button>
      )}
    </button>
  )
}

// ── Fila tabla lista ──────────────────────────────────────────────────────────

function FilaLista({ item, onClick, showVal, esImpGrupo, esPostGrupo, onDelete }) {
  const e = estadoSabor(item.baldes)
  const precioKg = item.precio_kg || TIPO_PRECIOS[item.tipo]?.precio_kg
  const esUnidades = esImpGrupo || esPostGrupo
  return (
    <tr
      className="cursor-pointer transition-colors"
      style={{ borderBottom: `1px solid ${colors.border}` }}
      onClick={() => onClick(item)}
      onMouseEnter={e2 => { e2.currentTarget.style.backgroundColor = colors.bg }}
      onMouseLeave={e2 => { e2.currentTarget.style.backgroundColor = '' }}
    >
      <td className="py-3 px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: e.dot }} />
          <div>
            <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>{item.nombre}</span>
            {item.lote && (
              <span className="inline-block text-[10px] font-mono font-semibold px-1 py-px rounded ml-1.5"
                style={{ backgroundColor: 'rgba(212,82,26,0.15)', color: colors.brand, border: '1px solid rgba(212,82,26,0.3)' }}>
                {item.lote}
              </span>
            )}
            {item.operario_nombre && (
              <span className="block text-[10px]" style={{ color: colors.textMuted }}>👤 {item.operario_nombre}</span>
            )}
            {item.ultima_actualizacion && (
              <span className="block text-[10px]" style={{ color: colors.textMuted }}>
                {new Date(item.ultima_actualizacion).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <span className="text-base font-bold" style={{ color: e.dot }}>
          {item.baldes}{esUnidades ? ' u.' : ''}
        </span>
      </td>
      {!esImpGrupo && (
        <td className="py-3 px-4 text-sm" style={{ color: colors.textMuted }}>{Number(item.kg).toFixed(1)} kg</td>
      )}
      {showVal && !esImpGrupo && !esPostGrupo && (
        <td className="py-3 px-4 text-sm font-semibold" style={{ color: colors.brand }}>
          {precioKg && item.kg > 0 ? `$${pesos(item.kg * precioKg)}` : '—'}
        </td>
      )}
      <td className="py-3 px-4">
        <Badge variant={estadoBadgeVariant(item.baldes)}>{e.label}</Badge>
      </td>
      {onDelete && (
        <td className="py-3 px-2">
          <button
            onClick={e => { e.stopPropagation(); onDelete(item) }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[rgba(239,68,68,0.12)] transition-colors"
            style={{ color: '#ef4444' }}
            title="Eliminar">
            <Trash2 size={13} />
          </button>
        </td>
      )}
    </tr>
  )
}

// ── Grupo lista ───────────────────────────────────────────────────────────────

function GrupoLista({ tipo, items, onSelect, showVal, onDelete }) {
  const tb         = TIPO_BADGE[tipo] || { bg: 'rgba(100,116,139,0.12)', color: '#94A3B8' }
  const esImpGrupo  = items[0]?.tipo_producto === 'impulsivo'
  const esPostGrupo = items[0]?.tipo_producto === 'postre'
  const totalBaldes = items.reduce((a, s) => a + s.baldes, 0)
  const totalKg     = items.reduce((a, s) => a + s.kg, 0)
  const headerResumen = esImpGrupo
    ? `${totalBaldes} unidades`
    : esPostGrupo
      ? `${totalBaldes} unidades · ${Number(totalKg).toFixed(1)} kg`
      : `${totalBaldes} baldes · ${Number(totalKg).toFixed(1)} kg`
  const cols = [
    'Sabor',
    (esImpGrupo || esPostGrupo) ? 'Unidades' : 'Baldes',
    !esImpGrupo && 'KG',
    showVal && !esImpGrupo && !esPostGrupo && 'Valor venta',
    'Estado',
  ].filter(Boolean)
  return (
    <div className="mb-4 overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: tb.bg, borderBottom: `1px solid ${colors.border}` }}>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: tb.color }}>{tipo}</span>
        <span className="text-xs font-semibold" style={{ color: tb.color }}>{headerResumen}</span>
      </div>
      <table className="w-full">
        <thead>
          <tr style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
            {cols.map(h => (
              <th key={h} className="py-2 px-4 text-left font-semibold uppercase"
                style={{ fontSize: 10, color: colors.textMuted, letterSpacing: '0.07em' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <FilaLista key={item.id} item={item} onClick={onSelect} showVal={showVal} esImpGrupo={esImpGrupo} esPostGrupo={esPostGrupo} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Modal movimiento ──────────────────────────────────────────────────────────

function ModalMovimiento({ item, onClose, onApply, operariosDisponibles = [], stockImpPost = [] }) {
  const [tipoMov, setTipoMov]       = useState('ingreso')
  const [cantBaldes, setCantBaldes] = useState('')
  const [cantKg, setCantKg]         = useState('')
  const [motivo, setMotivo]         = useState(MOTIVOS_INGRESO_CAMARA[0])
  const [lote, setLote]             = useState(item.lote || '')
  const [saving, setSaving]         = useState(false)
  const [errorMsg, setErrorMsg]     = useState(null)
  const [operarioSolicita, setOperarioSolicita] = useState('')
  const [operarioElabora, setOperarioElabora]   = useState('')
  const [productoElaborado, setProductoElaborado] = useState('')

  const esImp  = (item?.tipo_producto || '') === 'impulsivo'
  const esPost = (item?.tipo_producto || '') === 'postre'
  const e = estadoSabor(item.baldes)

  useEffect(() => {
    setMotivo(tipoMov === 'ingreso' ? MOTIVOS_INGRESO_CAMARA[0] : MOTIVOS_EGRESO_CAMARA[0])
  }, [tipoMov])

  function handleClose() {
    const dirty = cantBaldes !== '' || cantKg !== '' || lote !== (item.lote || '')
    if (dirty && !window.confirm('¿Seguro que querés cancelar? Se perderán los datos cargados.')) return
    onClose()
  }

  async function handleApply() {
    const b = parseInt(cantBaldes)
    const k = parseFloat(cantKg)
    if (!b || b <= 0) { setErrorMsg('La cantidad debe ser mayor a 0'); return }
    if (!motivo) { setErrorMsg('Seleccioná un motivo'); return }
    if (tipoMov === 'ingreso' && motivo === 'Producción' && !operarioElabora) {
      setErrorMsg('Seleccioná el operario que elaboró'); return
    }
    if (tipoMov === 'egreso' && motivo === 'Producción' && !productoElaborado) {
      setErrorMsg('Seleccioná el producto elaborado'); return
    }
    if (tipoMov === 'egreso' && motivo === 'Producción' && !operarioSolicita) {
      setErrorMsg('Seleccioná el operario que solicita'); return
    }
    setSaving(true)
    setErrorMsg(null)
    const motivoFinal = motivo === 'Producción' && productoElaborado
      ? `Producción → ${productoElaborado}`
      : motivo
    const err = await onApply({
      id: item.id, tipo: tipoMov, baldes: b, kg: isNaN(k) ? 0 : k,
      motivo: motivoFinal, lote: lote.trim(),
      operarioNombre: tipoMov === 'ingreso' ? (operarioElabora || null) : (operarioSolicita || null),
      productoElaborado: productoElaborado || null,
    })
    if (err) { setErrorMsg(err); setSaving(false) }
  }

  return (
    <Modal
      open
      onClose={handleClose}
      title={item.nombre}
      maxWidth="max-w-sm"
      disableBackdropClose
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={saving} className="flex-1">
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleApply}
            loading={saving}
            disabled={!cantBaldes || parseInt(cantBaldes) <= 0 || !motivo}
            className="flex-1"
          >
            {saving ? 'Guardando…' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Stock actual */}
        <div className="flex items-center justify-between rounded-lg px-4 py-3" style={{ backgroundColor: colors.bg }}>
          <span className="text-sm" style={{ color: colors.textSecondary }}>Stock actual</span>
          <div className="text-right">
            <span className="text-xl font-extrabold" style={{ color: e.dot }}>{item.baldes}</span>
            <span className="text-xs ml-1.5" style={{ color: colors.textMuted }}>
              {esImp ? 'unidades' : esPost ? `unidades · ${Number(item.kg).toFixed(1)} kg` : `baldes · ${Number(item.kg).toFixed(1)} kg`}
            </span>
          </div>
        </div>

        {/* Toggle ingreso/egreso */}
        <div className="flex gap-1.5 p-1 rounded-lg" style={{ backgroundColor: colors.bg }}>
          {['ingreso', 'egreso'].map(t => (
            <button
              key={t}
              onClick={() => setTipoMov(t)}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-semibold transition-all"
              style={{
                backgroundColor: tipoMov === t ? (t === 'ingreso' ? colors.success : colors.danger) : 'transparent',
                color: tipoMov === t ? 'white' : colors.textMuted,
                boxShadow: tipoMov === t ? shadow.sm : 'none',
              }}
            >
              {t === 'ingreso' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              {t === 'ingreso' ? 'Ingreso' : 'Egreso'}
            </button>
          ))}
        </div>

        {/* Inputs */}
        <div className={esImp ? '' : 'grid grid-cols-2 gap-3'}>
          <Input
            label={esImp ? 'Cantidad (unidades)' : esPost ? 'Cantidad (unidades)' : 'Cantidad (baldes)'}
            type="number" min="1" value={cantBaldes} disabled={saving}
            onChange={ev => setCantBaldes(ev.target.value)} placeholder="0" />
          {!esImp && (
            <Input label="Peso (kg)" type="number" min="0" step="0.1" value={cantKg} disabled={saving}
              onChange={ev => setCantKg(ev.target.value)} placeholder="0" />
          )}
        </div>

        <Input label="Número de lote" type="text" value={lote} disabled={saving}
          onChange={ev => setLote(ev.target.value)} placeholder="Opcional" />

        <Select label="Motivo *" value={motivo} onChange={ev => { setMotivo(ev.target.value); setProductoElaborado(''); setOperarioSolicita(''); setOperarioElabora('') }} disabled={saving}>
          <option value="">— Seleccionar —</option>
          {(tipoMov === 'ingreso' ? MOTIVOS_INGRESO_CAMARA : MOTIVOS_EGRESO_CAMARA).map(m => <option key={m}>{m}</option>)}
        </Select>

        {tipoMov === 'ingreso' && motivo === 'Producción' && (
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(212,82,26,0.06)', border: '1px solid rgba(212,82,26,0.2)' }}>
            <Select label="Operario que elaboró *" value={operarioElabora} onChange={ev => setOperarioElabora(ev.target.value)} disabled={saving}>
              <option value="">— Seleccionar —</option>
              {operariosDisponibles.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
            </Select>
          </div>
        )}

        {tipoMov === 'egreso' && motivo === 'Producción' && (
          <div className="space-y-2 p-3 rounded-lg" style={{ backgroundColor: 'rgba(212,82,26,0.06)', border: '1px solid rgba(212,82,26,0.2)' }}>
            <Select label="Producto elaborado *" value={productoElaborado} onChange={ev => setProductoElaborado(ev.target.value)} disabled={saving}>
              <option value="">— Seleccionar —</option>
              {stockImpPost.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
            </Select>
            <Select label="Operario que solicita *" value={operarioSolicita} onChange={ev => setOperarioSolicita(ev.target.value)} disabled={saving}>
              <option value="">— Seleccionar —</option>
              {operariosDisponibles.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
            </Select>
          </div>
        )}

        {cantBaldes && parseInt(cantBaldes) > 0 && (
          <div className="rounded-lg px-4 py-3 text-sm font-semibold text-center"
            style={{
              backgroundColor: tipoMov === 'ingreso' ? colors.successBg : colors.dangerBg,
              color: tipoMov === 'ingreso' ? colors.success : colors.danger,
            }}>
            {tipoMov === 'ingreso' ? '↑' : '↓'} {item.baldes} →{' '}
            <strong>
              {tipoMov === 'ingreso'
                ? item.baldes + parseInt(cantBaldes)
                : Math.max(0, item.baldes - parseInt(cantBaldes))}
            </strong> {(esImp || esPost) ? 'unidades' : 'baldes'}
          </div>
        )}

        {errorMsg && (
          <div className="rounded-lg px-4 py-2.5 text-xs font-medium"
            style={{ backgroundColor: colors.dangerBg, color: colors.danger }}>
            {errorMsg}
          </div>
        )}
      </div>
    </Modal>
  )
}

function ModalAgregarProducto({ onClose, onSubmit, saving }) {
  const [form, setForm] = useState({
    nombre: '', tipo_producto: 'helado', tipo: 'Lisa', baldes: '0', kg: '0', lote: '',
  })
  const [err, setErr] = useState('')
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const esImp  = form.tipo_producto === 'impulsivo'
  const esPost = form.tipo_producto === 'postre'
  const esHelado = form.tipo_producto === 'helado'

  function handleGuardar() {
    if (!form.nombre.trim()) { setErr('El nombre es requerido'); return }
    setErr('')
    onSubmit(form)
  }

  return (
    <Modal open onClose={onClose} title="＋ Agregar producto a cámara" maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1">Cancelar</Button>
          <Button variant="primary" onClick={handleGuardar} loading={saving} className="flex-1">
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Nombre *" value={form.nombre} onChange={e => upd('nombre', e.target.value)} placeholder="Se guardará en MAYÚSCULAS" />
        <Select label="Tipo de producto *" value={form.tipo_producto} onChange={e => upd('tipo_producto', e.target.value)}>
          <option value="helado">Helado</option>
          <option value="impulsivo">Impulsivo</option>
          <option value="postre">Postre</option>
        </Select>
        {esHelado && (
          <Select label="Tipo elaboración *" value={form.tipo} onChange={e => upd('tipo', e.target.value)}>
            {['Lisa', 'Con Agregado', 'Agua', 'Especial'].map(t => <option key={t}>{t}</option>)}
          </Select>
        )}
        {esHelado && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Stock inicial (baldes)" type="number" min="0"
              value={form.baldes} onChange={e => upd('baldes', e.target.value)} />
            <Input label="Stock inicial (kg)" type="number" min="0" step="0.1"
              value={form.kg} onChange={e => upd('kg', e.target.value)} />
          </div>
        )}
        {esImp && (
          <Input label="Cantidad inicial (unidades)" type="number" min="0"
            value={form.baldes} onChange={e => upd('baldes', e.target.value)} />
        )}
        {esPost && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Cantidad inicial (unidades)" type="number" min="0"
              value={form.baldes} onChange={e => upd('baldes', e.target.value)} />
            <Input label="Peso total (kg)" type="number" min="0" step="0.1"
              value={form.kg} onChange={e => upd('kg', e.target.value)} />
          </div>
        )}
        <Input label="Lote (opcional)" value={form.lote} onChange={e => upd('lote', e.target.value)} placeholder="Opcional" />
        {err && (
          <p className="text-xs text-center py-1.5 rounded-lg"
            style={{ color: colors.danger, backgroundColor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)' }}>
            {err}
          </p>
        )}
      </div>
    </Modal>
  )
}

// ── Informe para imprimir ─────────────────────────────────────────────────────

function generarInforme(stock, showVal) {
  const sorted = items => items.slice().sort((a, b) => a.nombre.localeCompare(b.nombre))

  const helados    = stock.filter(s => !s.tipo_producto || s.tipo_producto === 'helado')
  const impulsivos = stock.filter(s => s.tipo_producto === 'impulsivo')
  const postres    = stock.filter(s => s.tipo_producto === 'postre')

  const totalBaldесHelado   = helados.reduce((a, s) => a + (Number(s.baldes) || 0), 0)
  const totalKgHelado       = helados.reduce((a, s) => a + (Number(s.kg) || 0), 0)
  const totalImpUnidades    = impulsivos.reduce((a, s) => a + (Number(s.baldes) || 0), 0)
  const totalPostreUnidades = postres.reduce((a, s) => a + (Number(s.baldes) || 0), 0)
  const totalPostreKg       = postres.reduce((a, s) => a + (Number(s.kg) || 0), 0)
  const conStockHelado      = helados.filter(s => (Number(s.baldes) || 0) > 0).length
  const agotadosHelado      = helados.filter(s => (Number(s.baldes) || 0) === 0).length

  const estadoColor = v => v === 0 ? '#dc2626' : v <= 3 ? '#d97706' : '#16a34a'
  const estadoLabel = v => v === 0 ? 'AGOTADO' : v <= 3 ? 'BAJO' : 'OK'

  const seccionHelado = (nombre, items) => {
    if (!items.length) return ''
    const sub = items.reduce((a, s) => a + (Number(s.baldes) || 0), 0)
    const subKg = items.reduce((a, s) => a + (Number(s.kg) || 0), 0)
    const filas = sorted(items).map(s => {
      const b = Number(s.baldes) || 0; const kg = Number(s.kg) || 0
      const c = estadoColor(b)
      return `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:8px 12px;color:${c};font-weight:${b === 0 ? 600 : 400}">${s.nombre}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:600">${b}</td>
        <td style="padding:8px 12px;text-align:right">${kg.toFixed(1)}</td>
        <td style="padding:8px 12px;text-align:center;color:${c};font-weight:600">${estadoLabel(b)}</td>
      </tr>`
    }).join('')
    return `<div style="margin-bottom:24px">
      <div style="background:#1e293b;color:white;padding:8px 12px;font-weight:700;font-size:13px;letter-spacing:1px;text-transform:uppercase">
        ${nombre} — ${items.length} sabores | ${sub} baldes | ${subKg.toFixed(1)} kg
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1">
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;width:50%">Sabor</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#64748b;width:15%">Baldes</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#64748b;width:20%">Kg</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#64748b;width:15%">Estado</th>
        </tr></thead>
        <tbody>
          ${filas}
          <tr style="background:#f8fafc;border-top:2px solid #1e293b">
            <td style="padding:8px 12px;font-weight:700;font-size:12px">SUBTOTAL</td>
            <td style="padding:8px 12px;text-align:right;font-weight:700">${sub}</td>
            <td style="padding:8px 12px;text-align:right;font-weight:700">${subKg.toFixed(1)} kg</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>`
  }

  const seccionImpulsivos = () => {
    if (!impulsivos.length) return ''
    const filas = sorted(impulsivos).map(s => {
      const u = Number(s.baldes) || 0; const c = estadoColor(u)
      return `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:8px 12px;color:${c};font-weight:${u === 0 ? 600 : 400}">${s.nombre}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:600">${u}</td>
        <td style="padding:8px 12px;text-align:center;color:${c};font-weight:600">${estadoLabel(u)}</td>
      </tr>`
    }).join('')
    return `<div style="margin-bottom:24px">
      <div style="background:#92400e;color:white;padding:8px 12px;font-weight:700;font-size:13px;letter-spacing:1px;text-transform:uppercase">
        IMPULSIVOS — ${impulsivos.length} productos | ${totalImpUnidades} unidades
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#fef3c7;border-bottom:2px solid #fcd34d">
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#92400e;width:65%">Producto</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#92400e;width:20%">Unidades</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#92400e;width:15%">Estado</th>
        </tr></thead>
        <tbody>
          ${filas}
          <tr style="background:#fef9e7;border-top:2px solid #92400e">
            <td style="padding:8px 12px;font-weight:700;font-size:12px">SUBTOTAL</td>
            <td style="padding:8px 12px;text-align:right;font-weight:700">${totalImpUnidades} unidades</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>`
  }

  const seccionPostres = () => {
    if (!postres.length) return ''
    const filas = sorted(postres).map(s => {
      const u = Number(s.baldes) || 0; const kg = Number(s.kg) || 0; const c = estadoColor(u)
      return `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:8px 12px;color:${c};font-weight:${u === 0 ? 600 : 400}">${s.nombre}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:600">${u}</td>
        <td style="padding:8px 12px;text-align:right">${kg.toFixed(1)}</td>
        <td style="padding:8px 12px;text-align:center;color:${c};font-weight:600">${estadoLabel(u)}</td>
      </tr>`
    }).join('')
    return `<div style="margin-bottom:24px">
      <div style="background:#3b0764;color:white;padding:8px 12px;font-weight:700;font-size:13px;letter-spacing:1px;text-transform:uppercase">
        POSTRES — ${postres.length} productos | ${totalPostreUnidades} unidades | ${totalPostreKg.toFixed(1)} kg
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f3e8ff;border-bottom:2px solid #c4b5fd">
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#3b0764;width:50%">Producto</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#3b0764;width:15%">Unidades</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#3b0764;width:20%">KG</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#3b0764;width:15%">Estado</th>
        </tr></thead>
        <tbody>
          ${filas}
          <tr style="background:#faf5ff;border-top:2px solid #3b0764">
            <td style="padding:8px 12px;font-weight:700;font-size:12px">SUBTOTAL</td>
            <td style="padding:8px 12px;text-align:right;font-weight:700">${totalPostreUnidades} unidades</td>
            <td style="padding:8px 12px;text-align:right;font-weight:700">${totalPostreKg.toFixed(1)} kg</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>`
  }

  const fecha = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hora  = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const kpiCard = (valor, label, color) => `
    <div style="border:1px solid #e2e8f0;border-top:3px solid ${color};border-radius:6px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:${color}">${valor}</div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-top:2px">${label}</div>
    </div>`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Informe Stock Cámaras — Del Parque</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; color:#1e293b; background:white; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display:none; }
    }
  </style>
</head>
<body style="padding:32px;max-width:900px;margin:0 auto">

  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
    <img src="${logoUrl}" style="height:48px;filter:brightness(0)" onerror="this.style.display='none'" alt="Del Parque">
    <div style="text-align:right">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px">Informe de Stock — Cámaras</div>
      <div style="font-size:13px;font-weight:600;color:#1e293b">${fecha}</div>
      <div style="font-size:12px;color:#64748b">Hora de emisión: ${hora}</div>
    </div>
  </div>
  <div style="height:3px;background:linear-gradient(to right,#D4521A,#F97316);margin-bottom:24px;border-radius:2px"></div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px">
    ${kpiCard(totalBaldесHelado, 'Total Baldes', '#3b82f6')}
    ${kpiCard(totalKgHelado.toFixed(1) + ' kg', 'Total KG', '#D4521A')}
    ${kpiCard(conStockHelado, 'Con Stock', '#16a34a')}
    ${kpiCard(agotadosHelado, 'Agotados', '#dc2626')}
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:28px">
    ${kpiCard(totalImpUnidades + ' u.', 'Total Unidades Impulsivos', '#f59e0b')}
    ${kpiCard(totalPostreUnidades + ' u.', 'Total Unidades Postres', '#a855f7')}
    ${kpiCard(totalPostreKg.toFixed(1) + ' kg', 'Total KG Postres', '#7c3aed')}
  </div>

  ${seccionHelado('LISA', helados.filter(s => s.tipo === 'Lisa'))}
  ${seccionHelado('CON AGREGADO', helados.filter(s => s.tipo === 'Con Agregado'))}
  ${seccionHelado('AGUA', helados.filter(s => s.tipo === 'Agua'))}
  ${seccionHelado('ESPECIAL', helados.filter(s => s.tipo === 'Especial'))}
  ${seccionImpulsivos()}
  ${seccionPostres()}

  <div style="background:#1e293b;color:white;padding:14px 16px;border-radius:6px;margin-top:8px">
    <div style="font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">TOTAL GENERAL</div>
    <div style="font-size:14px;font-weight:700;line-height:1.8">
      <div>Helados: ${totalBaldесHelado} baldes — ${totalKgHelado.toFixed(1)} kg</div>
      ${impulsivos.length ? `<div>Impulsivos: ${totalImpUnidades} unidades</div>` : ''}
      ${postres.length ? `<div>Postres: ${totalPostreUnidades} unidades — ${totalPostreKg.toFixed(1)} kg</div>` : ''}
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:48px">
    ${['Responsable de Cámaras', 'Jefe de Producción', 'Gerencia'].map(f => `
    <div style="text-align:center">
      <div style="border-top:1px solid #94a3b8;padding-top:8px;font-size:11px;color:#64748b">${f}</div>
    </div>`).join('')}
  </div>

</body>
</html>`
}

function generarStockActual(stock) {
  const fecha = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const hora  = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const items = stock
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  const totalBaldes = items.reduce((a, s) => a + (Number(s.baldes) || 0), 0)
  const totalKg     = items.reduce((a, s) => a + (Number(s.kg) || 0), 0)
  const conStock    = items.filter(s => (Number(s.baldes) || 0) > 0).length
  const agotados    = items.filter(s => (Number(s.baldes) || 0) === 0).length

  const filas = items.map(s => {
    const baldes = Number(s.baldes) || 0
    const kg     = Number(s.kg) || 0
    return `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:7px 12px">${s.nombre}</td>
      <td style="padding:7px 12px;text-align:center">${s.tipo || '—'}</td>
      <td style="padding:7px 12px;text-align:right;font-weight:600">${baldes}</td>
      <td style="padding:7px 12px;text-align:right">${kg.toFixed(1)}</td>
      <td style="padding:7px 12px;text-align:center">${s.lote || '—'}</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Reporte de Stock Actual — Del Parque</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; color:#1e293b; background:white; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body style="padding:32px;max-width:900px;margin:0 auto">

  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
    <img src="${logoUrl}" style="height:48px;filter:brightness(0)" onerror="this.style.display='none'" alt="Del Parque">
    <div style="text-align:right">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px">Reporte de Stock Actual — Cámaras</div>
      <div style="font-size:13px;font-weight:600;color:#1e293b">${fecha}</div>
      <div style="font-size:12px;color:#64748b">Hora de emisión: ${hora}</div>
    </div>
  </div>
  <div style="height:3px;background:linear-gradient(to right,#D4521A,#F97316);margin-bottom:24px;border-radius:2px"></div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px">
    <div style="border:1px solid #e2e8f0;border-top:3px solid #3b82f6;border-radius:6px;padding:14px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#3b82f6">${totalBaldes}</div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-top:2px">Total Baldes</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:3px solid #D4521A;border-radius:6px;padding:14px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#D4521A">${totalKg.toFixed(1)}</div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-top:2px">Total KG</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:3px solid #16a34a;border-radius:6px;padding:14px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#16a34a">${conStock}</div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-top:2px">Con Stock</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:3px solid #dc2626;border-radius:6px;padding:14px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#dc2626">${agotados}</div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-top:2px">Agotados</div>
    </div>
  </div>

  <div style="margin-bottom:24px">
    <div style="background:#1e293b;color:white;padding:8px 12px;font-weight:700;font-size:13px;letter-spacing:1px;text-transform:uppercase">
      STOCK COMPLETO — ${items.length} productos
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1">
          <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;width:40%">Sabor</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;width:15%">Tipo</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;width:15%">Baldes</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;width:15%">KG</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;width:15%">Lote</th>
        </tr>
      </thead>
      <tbody>
        ${filas}
        <tr style="background:#f8fafc;border-top:2px solid #1e293b">
          <td style="padding:8px 12px;font-weight:700;font-size:12px">TOTAL GENERAL</td>
          <td></td>
          <td style="padding:8px 12px;text-align:right;font-weight:700">${totalBaldes}</td>
          <td style="padding:8px 12px;text-align:right;font-weight:700">${totalKg.toFixed(1)} kg</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:48px;margin-top:48px">
    ${['Responsable de Cámaras · Firma y fecha', 'Control de Stock · Firma y fecha'].map(f => `
    <div style="text-align:center">
      <div style="border-top:1px solid #94a3b8;padding-top:8px;font-size:11px;color:#64748b">${f}</div>
    </div>`).join('')}
  </div>

</body>
</html>`
}

// ── Modal detalle producto ────────────────────────────────────────────────────

function ModalDetalleProducto({ item, onClose, onMovimiento }) {
  const [historial, setHistorial] = useState([])
  const [loadingH, setLoadingH]   = useState(true)
  const [lotes, setLotes]         = useState([])
  const esImp  = (item?.tipo_producto || '') === 'impulsivo'
  const esPost = (item?.tipo_producto || '') === 'postre'
  const e  = estadoSabor(item.baldes)
  const tb = TIPO_BADGE[item.tipo] || { bg: 'rgba(100,116,139,0.12)', color: '#94A3B8' }

  useEffect(() => {
    async function cargar() {
      setLoadingH(true)
      const [{ data: movs }, { data: lotesData }] = await Promise.all([
        supabase
          .from('movimientos_camara')
          .select('id, tipo, kg, baldes, lote, operario_nombre, created_at, fecha, motivo, sabor_nombre, producto_nombre')
          .ilike('sabor_nombre', item.nombre)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('stock_camaras')
          .select('id, nombre, lote, kg, baldes, operario_nombre, ultima_actualizacion')
          .ilike('nombre', item.nombre)
          .gt('baldes', 0)
          .order('ultima_actualizacion', { ascending: false }),
      ])
      setHistorial(movs || [])
      setLotes(lotesData || [])
      setLoadingH(false)
    }
    cargar()
  }, [item.nombre])

  return (
    <Modal open onClose={onClose} title={item.nombre} maxWidth="max-w-lg" disableBackdropClose={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1">Cerrar</Button>
          <Button variant="primary" onClick={() => onMovimiento(item)} className="flex-1">
            <Plus size={14} /> Registrar movimiento
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Detalle */}
        <div className="rounded-lg p-4 space-y-3" style={{ backgroundColor: colors.bg }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ backgroundColor: tb.bg, color: tb.color }}>{item.tipo || item.tipo_producto || '—'}</span>
            <Badge variant={estadoBadgeVariant(item.baldes)}>{e.label}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs mb-0.5" style={{ color: colors.textMuted }}>{(esImp || esPost) ? 'Unidades' : 'Baldes'}</p>
              <p className="text-3xl font-extrabold leading-none" style={{ color: e.dot }}>
                {item.baldes}{(esImp || esPost) ? ' u.' : ''}
              </p>
            </div>
            {!esImp && (
              <div>
                <p className="text-xs mb-0.5" style={{ color: colors.textMuted }}>KG</p>
                <p className="text-xl font-bold" style={{ color: colors.textPrimary }}>{Number(item.kg).toFixed(1)}</p>
              </div>
            )}
          </div>
          {item.lote && (
            <div>
              <p className="text-xs mb-0.5" style={{ color: colors.textMuted }}>Lote</p>
              <span className="inline-block text-xs font-mono font-semibold px-2 py-0.5 rounded"
                style={{ backgroundColor: 'rgba(212,82,26,0.15)', color: colors.brand, border: '1px solid rgba(212,82,26,0.3)' }}>
                {item.lote}
              </span>
            </div>
          )}
          {item.operario_nombre && (
            <div>
              <p className="text-xs mb-0.5" style={{ color: colors.textMuted }}>Elaborado por</p>
              <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>👤 {item.operario_nombre}</p>
            </div>
          )}
          {item.ultima_actualizacion && (
            <div>
              <p className="text-xs mb-0.5" style={{ color: colors.textMuted }}>Última actualización</p>
              <p className="text-xs" style={{ color: colors.textSecondary }}>
                {new Date(item.ultima_actualizacion).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          )}
        </div>

        {/* Lotes en stock */}
        {lotes.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: colors.textMuted }}>Lotes en stock</p>
            <div className="overflow-hidden rounded-lg overflow-x-auto" style={{ border: `1px solid ${colors.border}` }}>
              <table className="w-full min-w-[340px]">
                <thead>
                  <tr style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                    {['LOTE', esImp ? 'UNIDADES' : 'KG', !esImp && 'BALDES', 'OPERARIO', 'FECHA ELAB.'].filter(Boolean).map(h => (
                      <th key={h} className="py-2 px-3 text-left font-semibold uppercase"
                        style={{ fontSize: 9, color: colors.textMuted, letterSpacing: '0.07em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lotes.map(l => (
                    <tr key={l.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td className="py-2 px-3">
                        <span className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: 'rgba(212,82,26,0.15)', color: colors.brand, border: '1px solid rgba(212,82,26,0.3)' }}>
                          {l.lote || '—'}
                        </span>
                      </td>
                      {esImp ? (
                        <td className="py-2 px-3 text-xs font-semibold" style={{ color: colors.textPrimary }}>{l.baldes || 0} u.</td>
                      ) : (
                        <>
                          <td className="py-2 px-3 text-xs font-semibold" style={{ color: colors.textPrimary }}>{(l.kg || 0).toFixed(1)}</td>
                          <td className="py-2 px-3 text-xs">{l.baldes || 0}</td>
                        </>
                      )}
                      <td className="py-2 px-3 text-xs" style={{ color: colors.textSecondary }}>{l.operario_nombre || '—'}</td>
                      <td className="py-2 px-3 text-xs whitespace-nowrap" style={{ color: colors.textMuted }}>
                        {l.ultima_actualizacion ? new Date(l.ultima_actualizacion).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {lotes.length > 1 && (
                  <tfoot>
                    <tr style={{ borderTop: `1px solid ${colors.border}`, backgroundColor: colors.bg }}>
                      <td className="py-2 px-3 text-xs font-bold" style={{ color: colors.textMuted }}>Total</td>
                      {esImp ? (
                        <td className="py-2 px-3 text-xs font-bold" style={{ color: colors.brand }}>
                          {lotes.reduce((a, l) => a + (l.baldes || 0), 0)} u.
                        </td>
                      ) : (
                        <>
                          <td className="py-2 px-3 text-xs font-bold" style={{ color: colors.brand }}>
                            {lotes.reduce((a, l) => a + (l.kg || 0), 0).toFixed(1)} kg
                          </td>
                          <td className="py-2 px-3 text-xs font-bold" style={{ color: colors.brand }}>
                            {lotes.reduce((a, l) => a + (l.baldes || 0), 0)} bal.
                          </td>
                        </>
                      )}
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* Historial */}
        <div>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: colors.textMuted }}>Últimos movimientos</p>
          {loadingH ? (
            <p className="py-4 text-center text-xs" style={{ color: colors.textMuted }}>Cargando…</p>
          ) : historial.length === 0 ? (
            <p className="py-4 text-center text-xs" style={{ color: colors.textMuted }}>Sin movimientos registrados</p>
          ) : (
            <div className="overflow-hidden rounded-lg overflow-x-auto" style={{ border: `1px solid ${colors.border}` }}>
              <table className="w-full min-w-[420px]">
                <thead>
                  <tr style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                    {['Fecha/Hora', 'Tipo', 'KG', 'Baldes', 'Lote', 'Operario'].map(h => (
                      <th key={h} className="py-2 px-3 text-left font-semibold uppercase"
                        style={{ fontSize: 9, color: colors.textMuted, letterSpacing: '0.07em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historial.map(m => (
                    <tr key={m.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td className="py-2 px-3 text-xs whitespace-nowrap" style={{ color: colors.textMuted }}>
                        {m.created_at
                          ? new Date(m.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                          : m.fecha || '—'}
                      </td>
                      <td className="py-2 px-3">
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: m.tipo === 'ingreso' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: m.tipo === 'ingreso' ? '#22C55E' : '#EF4444' }}>
                          {m.tipo === 'ingreso' ? '🟢' : '🔴'} {m.tipo}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-xs font-semibold" style={{ color: colors.brand }}>{(m.kg || 0).toFixed(3)}</td>
                      <td className="py-2 px-3 text-xs">{m.baldes || 0}</td>
                      <td className="py-2 px-3 text-xs font-mono" style={{ color: colors.textMuted }}>{m.lote || '—'}</td>
                      <td className="py-2 px-3 text-xs" style={{ color: colors.textSecondary }}>{m.operario_nombre || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function Camaras() {
  const [stock, setStock]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [errorCarga, setErrorCarga]     = useState(null)
  const [toast, setToast]               = useState(null)
  const [filtroNombre, setFiltroNombre] = useState('')
  const [filtroTipoProducto, setFiltroTipoProducto] = useState('helado')
  const [filtroTipo, setFiltroTipo]     = useState('Todos')
  const [filtroEstado, setFiltroEstado] = useState(null)
  const [orden, setOrden]               = useState('az')
  const [vista, setVista]               = useState('grilla')
  const [modalItem, setModalItem]       = useState(null)
  const [modalDetalle, setModalDetalle] = useState(null)
  const [userRole, setUserRole]         = useState('operario')

  const [tabCamara, setTabCamara]       = useState('stock')
  const [movimientos, setMovimientos]   = useState([])
  const [loadingMovs, setLoadingMovs]   = useState(false)
  const [filtroMovFecha, setFiltroMovFecha] = useState(new Date().toISOString().split('T')[0])
  const [filtroMovTipo, setFiltroMovTipo]   = useState('')

  const [operarios, setOperarios]           = useState([])
  const [temperaturas, setTemperaturas]     = useState([])
  const [loadingTemps, setLoadingTemps]     = useState(false)
  const [savingTemp, setSavingTemp]         = useState(false)
  const [filtroTempCamara, setFiltroTempCamara] = useState('')
  const [filtroTempFecha, setFiltroTempFecha]   = useState(new Date().toISOString().split('T')[0])
  const [tempForm, setTempForm]             = useState({ camara: 'Cámara 1', grados: '', responsable: '', observaciones: '' })

  const { isAdmin } = useUser()
  const showVal = userRole === 'admin'
  const [modalAgregar, setModalAgregar] = useState(false)
  const [savingAgregar, setSavingAgregar] = useState(false)

  useEffect(() => {
    async function cargar() {
      const [{ data, error }, { data: ops }] = await Promise.all([
        supabase.from('stock_camaras').select('*').order('tipo', { ascending: true }),
        supabase.from('operarios').select('id,nombre').eq('activo', true).order('nombre'),
      ])
      if (error) { setErrorCarga(error.message); setLoading(false); return }
      const agrupados = {}
      ;(data || []).forEach(item => {
        const key = item.nombre.trim().toUpperCase()
        if (agrupados[key]) {
          agrupados[key].kg     += item.kg || 0
          agrupados[key].baldes += item.baldes || 0
        } else {
          agrupados[key] = { ...item }
        }
      })
      setStock(Object.values(agrupados))
      setOperarios(deduplicarOperarios(ops))
      setLoading(false)
    }
    cargar()
    const channel = supabase.channel('stock_camaras_rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stock_camaras' }, () => cargar())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    if (tabCamara === 'movimientos') cargarMovimientos()
  }, [tabCamara, filtroMovFecha, filtroMovTipo])

  useEffect(() => {
    if (tabCamara === 'temperaturas') cargarTemperaturas()
  }, [tabCamara, filtroTempCamara, filtroTempFecha]) // eslint-disable-line react-hooks/exhaustive-deps

  async function cargarMovimientos() {
    setLoadingMovs(true)
    let q = supabase.from('movimientos_camara')
      .select('id, sabor_nombre, producto_nombre, tipo, kg, baldes, lote, operario_nombre, tipo_producto, motivo, created_at, fecha')
      .order('created_at', { ascending: false }).limit(500)
    if (filtroMovFecha) q = q.eq('fecha', filtroMovFecha)
    if (filtroMovTipo) q = q.eq('tipo_producto', filtroMovTipo)
    const { data } = await q
    setMovimientos(data || [])
    setLoadingMovs(false)
  }

  async function exportarMovimientosPDF() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    try { doc.addImage(LOGO_HORIZONTAL, 'PNG', 14, 7, 48, 12) } catch {}
    const titulo = `Del Parque — Movimientos de Cámara${filtroMovFecha ? ' ' + filtroMovFecha : ''}`
    doc.setFontSize(12)
    doc.setTextColor(40, 40, 40)
    doc.text(titulo, pageWidth - 14, 14, { align: 'right' })
    const kgIng = movimientos.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + (m.kg || 0), 0)
    const kgEgr = movimientos.filter(m => m.tipo === 'egreso').reduce((a, m) => a + (m.kg || 0), 0)
    autoTable(doc, {
      startY: 20,
      head: [['Hora', 'Producto', 'Tipo', 'KG', 'Baldes', 'Lote', 'Operario', 'Motivo']],
      body: movimientos.map(m => [
        m.created_at ? new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—',
        m.sabor_nombre || m.producto_nombre || '—',
        m.tipo === 'ingreso' ? '↑ Ingreso' : '↓ Egreso',
        (m.kg || 0).toFixed(1),
        m.baldes || 0,
        m.lote || '—',
        m.operario_nombre || '—',
        m.motivo || '—',
      ]),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [212, 82, 26], textColor: 255 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    })
    const finalY = (doc.lastAutoTable?.finalY || 20) + 8
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    doc.text(
      `KG ingresados: ${kgIng.toFixed(1)}  |  KG egresados: ${kgEgr.toFixed(1)}  |  Balance: ${(kgIng - kgEgr).toFixed(1)}`,
      14, finalY
    )
    doc.save(`movimientos_camara_${filtroMovFecha || new Date().toISOString().split('T')[0]}.pdf`)
  }

  function mostrarToast(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function recargarStock() {
    const { data } = await supabase.from('stock_camaras').select('*').order('tipo', { ascending: true })
    if (data) {
      const agrupados = {}
      data.forEach(item => {
        const key = item.nombre.trim().toUpperCase()
        if (agrupados[key]) { agrupados[key].kg += item.kg || 0; agrupados[key].baldes += item.baldes || 0 }
        else agrupados[key] = { ...item }
      })
      setStock(Object.values(agrupados))
    }
  }

  async function agregarProducto(form) {
    setSavingAgregar(true)
    const nombre = form.nombre.trim().toUpperCase()
    const payload = {
      nombre,
      tipo_producto: form.tipo_producto,
      tipo: form.tipo_producto === 'helado' ? (form.tipo || 'Lisa') : 'Con Agregado',
      baldes: parseInt(form.baldes) || 0,
      kg: form.tipo_producto === 'impulsivo' ? 0 : (parseFloat(form.kg) || 0),
      lote: form.lote?.trim() || null,
      operario_nombre: null,
      ultima_actualizacion: new Date().toISOString(),
    }
    console.log('Payload enviado a stock_camaras:', payload)
    const { data, error } = await supabase.from('stock_camaras').insert(payload).select()
    console.log('Error al crear producto en cámara:', error)
    console.log('Resultado INSERT:', data)
    setSavingAgregar(false)
    if (error) { mostrarToast(error.message, 'error'); return }
    mostrarToast(`"${nombre}" agregado a cámaras`)
    setModalAgregar(false)
    recargarStock()
  }

  async function eliminarProducto(item) {
    if (!window.confirm(`¿Eliminar "${item.nombre}" de cámaras?`)) return
    const { count } = await supabase.from('movimientos_camara')
      .select('id', { count: 'exact', head: true })
      .ilike('sabor_nombre', item.nombre)
    if ((count || 0) > 0) {
      const { error } = await supabase.from('stock_camaras').update({ baldes: 0, kg: 0 }).eq('id', item.id)
      if (error) { mostrarToast(error.message, 'error'); return }
      mostrarToast(`"${item.nombre}" puesto en cero (tiene movimientos previos)`)
    } else {
      const { error } = await supabase.from('stock_camaras').delete().eq('id', item.id)
      if (error) { mostrarToast(error.message, 'error'); return }
      mostrarToast(`"${item.nombre}" eliminado`)
    }
    recargarStock()
  }

  async function cargarTemperaturas() {
    setLoadingTemps(true)
    let q = supabase.from('temperaturas_camaras')
      .select('*').order('created_at', { ascending: false }).limit(50)
    if (filtroTempCamara) q = q.eq('camara', filtroTempCamara)
    if (filtroTempFecha) {
      q = q.gte('created_at', filtroTempFecha + 'T00:00:00')
            .lte('created_at', filtroTempFecha + 'T23:59:59')
    }
    const { data } = await q
    setTemperaturas(data || [])
    setLoadingTemps(false)
  }

  async function registrarTemperatura() {
    const grados = parseFloat(tempForm.grados)
    if (isNaN(grados)) { mostrarToast('Ingresá una temperatura válida', 'error'); return }
    if (!tempForm.responsable) { mostrarToast('Seleccioná un responsable', 'error'); return }
    setSavingTemp(true)
    const { error } = await supabase.from('temperaturas_camaras').insert({
      camara: tempForm.camara,
      temperatura: grados,
      responsable: tempForm.responsable,
      observaciones: tempForm.observaciones || null,
    })
    setSavingTemp(false)
    if (error) { mostrarToast(error.message, 'error'); return }
    mostrarToast(`Temperatura ${grados}°C registrada en ${tempForm.camara}`)
    setTempForm(f => ({ ...f, grados: '', observaciones: '' }))
    cargarTemperaturas()
  }

  function exportarTemperaturasPDF() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pw = doc.internal.pageSize.getWidth()
    const fecha = filtroTempFecha || new Date().toISOString().split('T')[0]
    try { doc.addImage(LOGO_HORIZONTAL, 'PNG', 14, 7, 48, 12) } catch {}
    doc.setFontSize(13); doc.setTextColor(40, 40, 40)
    doc.text('Del Parque — Registro de Temperaturas de Cámaras', pw - 14, 14, { align: 'right' })
    doc.setFontSize(8.5); doc.setTextColor(120, 120, 120)
    doc.text(`Período: ${fecha}  ·  Emitido: ${new Date().toLocaleString('es-AR')}`, pw / 2, 20, { align: 'center' })
    doc.text('Planilla para control de Salud Pública', pw / 2, 25, { align: 'center' })
    autoTable(doc, {
      startY: 30,
      head: [['Fecha', 'Hora', 'Cámara', 'Temperatura', 'Estado', 'Responsable', 'Observaciones', 'Firma']],
      body: temperaturas.map(t => {
        const d = new Date(t.created_at)
        const est = estadoTemp(t.temperatura)
        return [
          d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          t.camara,
          `${t.temperatura}°C`,
          est.label.replace('⚠️ ', '').replace('✅ ', ''),
          t.responsable || '—',
          t.observaciones || '',
          '',
        ]
      }),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [212, 82, 26], textColor: 255 },
      columnStyles: { 7: { cellWidth: 22 } },
      didParseCell(data) {
        if (data.section !== 'body' || data.column.index !== 4) return
        const t = temperaturas[data.row.index]
        if (!t) return
        const est = estadoTemp(t.temperatura)
        if (est.variant === 'danger')  data.cell.styles.textColor = [220, 38, 38]
        else if (est.variant === 'warning') data.cell.styles.textColor = [217, 119, 6]
        else data.cell.styles.textColor = [22, 163, 74]
      },
    })
    const finalY = (doc.lastAutoTable?.finalY || 30) + 20
    doc.setFontSize(8); doc.setTextColor(80, 80, 80)
    ;['Responsable de Cámaras · Firma y fecha', 'Supervisor · Firma y fecha', 'Control de Calidad'].forEach((label, i) => {
      const x = 14 + i * 62
      doc.line(x, finalY, x + 54, finalY)
      doc.text(label, x + 27, finalY + 5, { align: 'center' })
    })
    doc.save(`temperaturas_camaras_${fecha}.pdf`)
  }

  const stockTipo = useMemo(() => (
    stock.filter(s => (s.tipo_producto || 'helado') === filtroTipoProducto)
  ), [stock, filtroTipoProducto])

  // KPIs fijos por tipo de producto (sobre todo el stock, no sobre el filtro activo)
  const stockHelados    = useMemo(() => stock.filter(s => !s.tipo_producto || s.tipo_producto === 'helado'), [stock])
  const stockImpulsivos = useMemo(() => stock.filter(s => s.tipo_producto === 'impulsivo'), [stock])
  const stockPostres    = useMemo(() => stock.filter(s => s.tipo_producto === 'postre'), [stock])

  const kpiBaldесHelado   = stockHelados.reduce((a, s) => a + s.baldes, 0)
  const kpiKgHelado       = stockHelados.reduce((a, s) => a + s.kg, 0)
  const kpiImpUnidades    = stockImpulsivos.reduce((a, s) => a + s.baldes, 0)
  const kpiPostreUnidades = stockPostres.reduce((a, s) => a + s.baldes, 0)
  const kpiPostreKg       = stockPostres.reduce((a, s) => a + s.kg, 0)

  const totalBaldes = stockTipo.reduce((a, s) => a + s.baldes, 0)
  const totalKg     = stockTipo.reduce((a, s) => a + s.kg, 0)
  const conStock    = stockTipo.filter(s => s.baldes > 3).length
  const pocoStock   = stockTipo.filter(s => s.baldes >= 1 && s.baldes <= 3).length
  const agotados    = stockTipo.filter(s => s.baldes === 0).length
  const costoTotal  = showVal ? stockTipo.reduce((a, s) => a + s.kg * (s.costo_kg || TIPO_PRECIOS[s.tipo]?.costo_kg || 0), 0) : 0
  const valorVenta  = showVal ? stockTipo.reduce((a, s) => a + s.kg * (s.precio_kg || TIPO_PRECIOS[s.tipo]?.precio_kg || 0), 0) : 0

  const filtrado = useMemo(() => {
    let arr = stockTipo.filter(s => {
      const matchN = s.nombre.toLowerCase().includes(filtroNombre.toLowerCase())
      const matchT = filtroTipoProducto !== 'helado' || filtroTipo === 'Todos' || s.tipo === filtroTipo
      const matchE = !filtroEstado ||
        (filtroEstado === 'ok'      && s.baldes > 3) ||
        (filtroEstado === 'poco'    && s.baldes >= 1 && s.baldes <= 3) ||
        (filtroEstado === 'agotado' && s.baldes === 0)
      return matchN && matchT && matchE
    })
    if (orden === 'az')    arr = [...arr].sort((a, b) => a.nombre.localeCompare(b.nombre))
    if (orden === 'mas')   arr = [...arr].sort((a, b) => b.baldes - a.baldes)
    if (orden === 'menos') arr = [...arr].sort((a, b) => a.baldes - b.baldes)
    return arr
  }, [stockTipo, filtroNombre, filtroTipo, filtroTipoProducto, orden, filtroEstado])

  const agrupado = useMemo(() => {
    if (filtroTipoProducto !== 'helado') {
      const label = TIPOS_PRODUCTO.find(t => t.key === filtroTipoProducto)?.label || 'Productos'
      return filtrado.length > 0 ? [{ tipo: label, items: filtrado }] : []
    }
    return ['Lisa', 'Con Agregado', 'Agua', 'Especial']
      .map(tipo => ({ tipo, items: filtrado.filter(s => s.tipo === tipo) }))
      .filter(g => g.items.length > 0)
  }, [filtrado, filtroTipoProducto])

  async function aplicarMovimiento({ id, tipo, baldes, kg, lote, motivo, operarioNombre, productoElaborado }) {
    const sabor = stock.find(s => s.id === id)
    if (!sabor) return 'Sabor no encontrado'

    const tipoCam = sabor.tipo_producto || 'helado'
    const currentBaldes = Number(sabor.baldes) || 0
    const currentKg     = Number(sabor.kg)     || 0

    if (tipo === 'egreso') {
      const unidadLabel = tipoCam === 'helado' ? 'baldes' : 'unidades'
      if (baldes > currentBaldes) {
        return `Stock insuficiente — hay ${currentBaldes} ${unidadLabel}, querés egresar ${baldes}`
      }
      if (tipoCam !== 'impulsivo' && (kg || 0) > 0 && (kg || 0) > currentKg) {
        return `KG insuficientes — hay ${currentKg.toFixed(1)} kg, querés egresar ${(kg || 0)} kg`
      }
    }

    // Baldes/unidades: aplica a todos los tipos
    const nuevoBaldes = tipo === 'ingreso'
      ? currentBaldes + baldes
      : Math.max(0, currentBaldes - baldes)

    // KG: impulsivos NO se tocan; helados y postres sí
    const nuevosKg = tipoCam === 'impulsivo'
      ? currentKg
      : tipo === 'ingreso'
        ? currentKg + (kg || 0)
        : Math.max(0, currentKg - (kg || 0))

    const nuevoLote = lote || null
    const stockUpdate = { baldes: nuevoBaldes, kg: nuevosKg, lote: nuevoLote, ultima_actualizacion: new Date().toISOString() }
    if (tipo === 'ingreso' && operarioNombre) stockUpdate.operario_nombre = operarioNombre
    const { error } = await supabase.from('stock_camaras').update(stockUpdate).eq('id', id)
    if (error) return error.message
    await supabase.from('movimientos_camara').insert({
      sabor_nombre:    sabor.nombre,
      producto_nombre: sabor.nombre,
      tipo,
      tipo_producto:   tipoCam,
      kg:     tipoCam === 'impulsivo' ? 0 : (kg || 0),
      baldes,
      lote:   nuevoLote,
      operario_nombre: operarioNombre ? operarioNombre.toUpperCase() : null,
      motivo: motivo || null,
      fecha:  new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
    })
    const updated = { ...sabor, baldes: nuevoBaldes, kg: nuevosKg, lote: nuevoLote }
    setStock(prev => prev.map(s => s.id === id ? updated : s))
    setModalDetalle(prev => prev?.id === id ? updated : prev)
    setModalItem(null)
    mostrarToast('Movimiento guardado')
    return null
  }

  function imprimir() {
    const w = window.open('', '_blank')
    w.document.write(generarInforme(stock, showVal))
    w.document.close()
    w.onload = () => w.print()
  }

  function imprimirStockActual() {
    const w = window.open('', '_blank')
    w.document.write(generarStockActual(stock))
    w.document.close()
    w.onload = () => w.print()
  }

  const PILL_BASE = 'px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border'
  const pillStyle = (active, activeColor) => ({
    backgroundColor: active ? activeColor : 'transparent',
    borderColor: active ? activeColor : colors.border,
    color: active ? 'white' : colors.textSecondary,
  })

  return (
    <div className="space-y-5">
      <Toast toast={toast} />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Cámaras</h2>
          <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Stock de producto elaborado · tiempo real</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={imprimir} disabled={loading || !!errorCarga}>
            <Printer size={15} /> Imprimir
          </Button>
          {userRole === 'admin' && (
            <Button variant="secondary" onClick={imprimirStockActual} disabled={loading || !!errorCarga}>
              <FileDown size={15} /> Stock Actual
            </Button>
          )}
          {isAdmin && (
            <Button variant="primary" onClick={() => setModalAgregar(true)} disabled={loading}>
              <Plus size={14} /> Agregar producto
            </Button>
          )}
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px dashed ${colors.border}` }} title="Vista dev">
            {ROLES.map(r => (
              <button key={r} onClick={() => setUserRole(r)}
                className="px-3 py-1.5 text-xs font-medium transition capitalize"
                style={{
                  backgroundColor: userRole === r ? colors.brand : 'transparent',
                  color: userRole === r ? 'white' : colors.textMuted,
                }}>
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        {[{ key: 'stock', label: 'Stock' }, { key: 'movimientos', label: 'Movimientos' }, { key: 'temperaturas', label: '🌡️ Temperaturas' }].map(t => (
          <button key={t.key} onClick={() => setTabCamara(t.key)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border"
            style={{
              backgroundColor: tabCamara === t.key ? colors.brand : 'transparent',
              borderColor: tabCamara === t.key ? colors.brand : colors.border,
              color: tabCamara === t.key ? 'white' : colors.textSecondary,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {errorCarga && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
          style={{ backgroundColor: colors.dangerBg, color: colors.danger, border: `1px solid ${colors.danger}30` }}>
          <span className="font-semibold">Error al cargar:</span> {errorCarga}
        </div>
      )}

      {/* Tab Movimientos */}
      {tabCamara === 'movimientos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2 flex-wrap items-center">
              <input type="date" value={filtroMovFecha} onChange={e => setFiltroMovFecha(e.target.value)}
                className="rounded-lg border text-sm px-3 py-1.5 outline-none focus:ring-2"
                style={{ borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }} />
              <select value={filtroMovTipo} onChange={e => setFiltroMovTipo(e.target.value)}
                className="rounded-lg border text-sm px-3 py-1.5 outline-none"
                style={{ borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }}>
                <option value="">Todos los tipos</option>
                <option value="helado">Helados</option>
                <option value="impulsivo">Impulsivos</option>
                <option value="postre">Postres</option>
              </select>
            </div>
            <button
              onClick={exportarMovimientosPDF}
              disabled={movimientos.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
              style={{ borderColor: colors.border, color: colors.textSecondary, backgroundColor: colors.surface }}
            >
              <FileDown size={14} /> Exportar PDF
            </button>
          </div>
          {loadingMovs ? (
            <div className="flex justify-center py-12"><span className="text-sm" style={{ color: colors.textMuted }}>Cargando…</span></div>
          ) : movimientos.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: colors.textMuted }}>Sin movimientos para esta fecha</div>
          ) : (
            <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px]">
                  <thead>
                    <tr style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                      {['Hora', 'Producto', 'Tipo', 'KG', 'Baldes', 'Lote', 'Operario', 'Motivo'].map(h => (
                        <th key={h} className="py-2.5 px-4 text-left font-semibold uppercase"
                          style={{ fontSize: 10, color: colors.textMuted, letterSpacing: '0.07em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map(m => (
                      <tr key={m.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <td className="py-2.5 px-4 text-xs whitespace-nowrap" style={{ color: colors.textMuted }}>
                          {m.created_at ? new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-sm font-medium" style={{ color: colors.textPrimary }}>{m.sabor_nombre || m.producto_nombre}</td>
                        <td className="py-2.5 px-4">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: m.tipo === 'ingreso' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                              color: m.tipo === 'ingreso' ? '#22C55E' : '#EF4444',
                            }}>
                            {m.tipo === 'ingreso' ? '🟢 Ingreso' : '🔴 Egreso'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-sm text-right font-semibold" style={{ color: colors.brand }}>
                          {(m.kg || 0).toFixed(1)}
                        </td>
                        <td className="py-2.5 px-4 text-sm text-right">{m.baldes || 0}</td>
                        <td className="py-2.5 px-4 text-xs font-mono" style={{ color: colors.textMuted }}>{m.lote || '—'}</td>
                        <td className="py-2.5 px-4 text-xs" style={{ color: colors.textSecondary }}>{m.operario_nombre || '—'}</td>
                        <td className="py-2.5 px-4 text-xs" style={{ color: colors.textMuted }}>{m.motivo || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 flex gap-6 text-xs font-semibold" style={{ borderTop: `1px solid ${colors.border}`, backgroundColor: colors.bg }}>
                <span style={{ color: colors.success }}>
                  KG ingresados: {movimientos.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + (m.kg || 0), 0).toFixed(1)}
                </span>
                <span style={{ color: colors.danger }}>
                  KG egresados: {movimientos.filter(m => m.tipo === 'egreso').reduce((a, m) => a + (m.kg || 0), 0).toFixed(1)}
                </span>
                <span style={{ color: colors.textPrimary }}>
                  Balance: {(movimientos.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + (m.kg || 0), 0) - movimientos.filter(m => m.tipo === 'egreso').reduce((a, m) => a + (m.kg || 0), 0)).toFixed(1)} kg
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPIs */}
      {tabCamara === 'stock' && !errorCarga && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Total Baldes (Helados)" value={loading ? '—' : kpiBaldесHelado} />
            <KpiCard label="Total KG (Helados)" value={loading ? '—' : `${kpiKgHelado.toFixed(1)} kg`} />
            <KpiCard label="Total Unidades (Impulsivos)" value={loading ? '—' : `${kpiImpUnidades} u.`} color={colors.warning} />
            <KpiCard label="Total Unidades (Postres)" value={loading ? '—' : `${kpiPostreUnidades} u. / ${kpiPostreKg.toFixed(1)} kg`} color="#a855f7" />
          </div>
          <div className={`grid gap-3 ${showVal ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3'}`}>
            <KpiCard label="Con stock"  value={loading ? '—' : conStock}  color={colors.success} active={filtroEstado === 'ok'}      onClick={() => setFiltroEstado(prev => prev === 'ok' ? null : 'ok')} />
            <KpiCard label="Poco stock" value={loading ? '—' : pocoStock} color={colors.warning} active={filtroEstado === 'poco'}    onClick={() => setFiltroEstado(prev => prev === 'poco' ? null : 'poco')} />
            <KpiCard label="Agotados"   value={loading ? '—' : agotados}  color={colors.danger}  active={filtroEstado === 'agotado'} onClick={() => setFiltroEstado(prev => prev === 'agotado' ? null : 'agotado')} />
            {showVal && (
              <>
                <KpiCard label="Costo total" value={loading ? '—' : `$${pesos(costoTotal / 1000)}k`} color={colors.textSecondary} />
                <KpiCard label="Valor venta" value={loading ? '—' : `$${pesos(valorVenta / 1000)}k`} color={colors.brand} />
              </>
            )}
          </div>
        </div>
      )}

      {tabCamara === 'stock' && <>

      {/* Resumen por tipo */}
      {!loading && !errorCarga && (() => {
        const porTipo = {}
        stockTipo.forEach(s => { const t = s.tipo || 'Sin tipo'; if (!porTipo[t]) porTipo[t] = { baldes: 0, kg: 0 }; porTipo[t].baldes += s.baldes; porTipo[t].kg += s.kg })
        return Object.keys(porTipo).length > 0 ? (
          <div className="flex gap-2 flex-wrap text-xs px-1">
            {Object.entries(porTipo).map(([tipo, { baldes, kg }]) => (
              <div key={tipo} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.textSecondary }}>
                <span className="text-[10px] uppercase tracking-wide">{tipo}</span>
                <span style={{ color: colors.brand }}>
                  {filtroTipoProducto === 'impulsivo'
                    ? `${baldes} unidades`
                    : filtroTipoProducto === 'postre'
                      ? `${baldes} unidades · ${Number(kg).toFixed(1)} kg`
                      : `${baldes} baldes · ${Number(kg).toFixed(1)} kg`}
                </span>
              </div>
            ))}
          </div>
        ) : null
      })()}

      {/* Filtro tipo de producto */}
      <div className="flex gap-1.5 flex-wrap">
        {TIPOS_PRODUCTO.map(tp => (
          <button key={tp.key} onClick={() => { setFiltroTipoProducto(tp.key); setFiltroTipo('Todos'); setFiltroEstado(null) }}
            className={PILL_BASE}
            style={pillStyle(filtroTipoProducto === tp.key, colors.brand)}>
            {tp.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="space-y-3 p-4 rounded-xl"
        style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input type="text" value={filtroNombre} onChange={e => setFiltroNombre(e.target.value)}
              placeholder="Buscar sabor…" icon={Search} />
          </div>
          <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
            {[{ v: 'grilla', I: LayoutGrid }, { v: 'lista', I: List }].map(({ v, I }) => (
              <button key={v} onClick={() => setVista(v)}
                className="px-3 py-2 transition-colors"
                style={{
                  backgroundColor: vista === v ? colors.brand : colors.surface,
                  color: vista === v ? 'white' : colors.textMuted,
                  borderLeft: v === 'lista' ? `1px solid ${colors.border}` : 'none',
                }}>
                <I size={15} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {filtroTipoProducto === 'helado' && (
            <div className="flex gap-1.5 flex-wrap">
              {TIPOS.map(t => (
                <button key={t} onClick={() => setFiltroTipo(t)}
                  className={PILL_BASE}
                  style={pillStyle(filtroTipo === t, colors.brand)}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <div className="ml-auto w-40">
            <Select value={orden} onChange={e => setOrden(e.target.value)}>
              <option value="az">A → Z</option>
              <option value="mas">Más baldes</option>
              <option value="menos">Menos baldes</option>
            </Select>
          </div>
        </div>
      </div>

      {/* Contador */}
      {!loading && !errorCarga && (
        <p className="text-xs -mt-2" style={{ color: colors.textMuted }}>
          {filtrado.length} sabor{filtrado.length !== 1 ? 'es' : ''}
          {filtroEstado && (
            <button className="ml-2 underline" onClick={() => setFiltroEstado(null)}
              style={{ color: colors.brand }}>
              limpiar filtro
            </button>
          )}
        </p>
      )}

      {/* Grilla */}
      {vista === 'grilla' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
          {loading
            ? Array.from({ length: 18 }).map((_, i) => <SkeletonCard key={i} />)
            : filtrado.map(item => (
                <TarjetaSabor key={item.id} item={item} onClick={setModalDetalle} showVal={showVal} onDelete={isAdmin ? eliminarProducto : undefined} />
              ))
          }
        </div>
      )}

      {/* Lista */}
      {vista === 'lista' && (
        loading
          ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl animate-pulse" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }} />
            ))}</div>
          : <div>
              {agrupado.map(({ tipo, items }) => (
                <GrupoLista key={tipo} tipo={tipo} items={items} onSelect={setModalDetalle} showVal={showVal} onDelete={isAdmin ? eliminarProducto : undefined} />
              ))}
            </div>
      )}

      </>}

      {/* Tab Temperaturas */}
      {tabCamara === 'temperaturas' && (() => {
        const hoy = new Date().toISOString().split('T')[0]
        const tempsHoy = temperaturas.filter(t => (t.created_at || '').startsWith(hoy))
        const promedioHoy = tempsHoy.length > 0
          ? (tempsHoy.reduce((a, t) => a + t.temperatura, 0) / tempsHoy.length).toFixed(1)
          : null
        const alertasHoy = tempsHoy.filter(t => t.temperatura > -15).length
        return (
          <div className="space-y-4">

            {/* Formulario de registro */}
            <div className="p-4 space-y-3 rounded-xl" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
              <h3 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Registrar temperatura</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textMuted }}>Cámara *</label>
                  <select
                    value={tempForm.camara}
                    onChange={e => setTempForm(f => ({ ...f, camara: e.target.value }))}
                    className="w-full rounded-lg border text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-[#D4521A]/25 focus:border-[#D4521A]"
                    style={{ borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bg }}
                  >
                    {CAMARAS_NOMBRES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textMuted }}>Temperatura (°C) *</label>
                  <input
                    type="number" step="0.1" placeholder="ej: -18.5"
                    value={tempForm.grados}
                    onChange={e => setTempForm(f => ({ ...f, grados: e.target.value }))}
                    className="w-full rounded-lg border text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-[#D4521A]/25 focus:border-[#D4521A]"
                    style={{ borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bg }}
                  />
                  {tempForm.grados !== '' && !isNaN(parseFloat(tempForm.grados)) && (() => {
                    const est = estadoTemp(parseFloat(tempForm.grados))
                    return (
                      <p className="text-xs mt-1 font-semibold" style={{ color: est.color }}>
                        {est.label}
                      </p>
                    )
                  })()}
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textMuted }}>Responsable *</label>
                  <select
                    value={tempForm.responsable}
                    onChange={e => setTempForm(f => ({ ...f, responsable: e.target.value }))}
                    className="w-full rounded-lg border text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-[#D4521A]/25 focus:border-[#D4521A]"
                    style={{ borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bg }}
                  >
                    <option value="">— Seleccionar —</option>
                    {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textMuted }}>Observaciones</label>
                  <input
                    type="text" placeholder="Opcional"
                    value={tempForm.observaciones}
                    onChange={e => setTempForm(f => ({ ...f, observaciones: e.target.value }))}
                    className="w-full rounded-lg border text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-[#D4521A]/25 focus:border-[#D4521A]"
                    style={{ borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bg }}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="primary" onClick={registrarTemperatura} loading={savingTemp} disabled={savingTemp}>
                  Registrar temperatura
                </Button>
              </div>
            </div>

            {/* KPIs del día */}
            <div className="grid grid-cols-3 gap-3">
              <KpiCard label="Registros hoy" value={tempsHoy.length} color={colors.brand} />
              <KpiCard label="Temperatura promedio" value={promedioHoy !== null ? `${promedioHoy}°C` : '—'}
                color={promedioHoy !== null ? estadoTemp(parseFloat(promedioHoy)).color : colors.textMuted} />
              <KpiCard label="Alertas del día" value={alertasHoy}
                color={alertasHoy > 0 ? colors.danger : colors.success} />
            </div>

            {/* Filtros + export */}
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex gap-2 flex-wrap">
                <select
                  value={filtroTempCamara}
                  onChange={e => setFiltroTempCamara(e.target.value)}
                  className="rounded-lg border text-sm px-3 py-1.5 outline-none"
                  style={{ borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }}
                >
                  <option value="">Todas las cámaras</option>
                  {CAMARAS_NOMBRES.map(c => <option key={c}>{c}</option>)}
                </select>
                <input
                  type="date" value={filtroTempFecha}
                  onChange={e => setFiltroTempFecha(e.target.value)}
                  className="rounded-lg border text-sm px-3 py-1.5 outline-none"
                  style={{ borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }}
                />
              </div>
              <Button variant="secondary" size="sm" onClick={exportarTemperaturasPDF} disabled={temperaturas.length === 0}>
                <FileDown size={14} /> Exportar PDF (Salud Pública)
              </Button>
            </div>

            {/* Historial */}
            {loadingTemps ? (
              <div className="flex justify-center py-10"><span className="text-sm" style={{ color: colors.textMuted }}>Cargando…</span></div>
            ) : temperaturas.length === 0 ? (
              <div className="py-10 text-center text-sm" style={{ color: colors.textMuted }}>Sin registros para el período seleccionado</div>
            ) : (
              <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px]">
                    <thead>
                      <tr style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                        {['Fecha/Hora', 'Cámara', 'Temperatura', 'Estado', 'Responsable', 'Observaciones'].map(h => (
                          <th key={h} className="py-2.5 px-4 text-left font-semibold uppercase"
                            style={{ fontSize: 10, color: colors.textMuted, letterSpacing: '0.07em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {temperaturas.map((t, idx) => {
                        const est = estadoTemp(t.temperatura)
                        return (
                          <tr key={t.id || idx} style={{ borderBottom: `1px solid ${colors.border}` }}>
                            <td className="py-2.5 px-4 text-xs whitespace-nowrap" style={{ color: colors.textMuted }}>
                              {t.created_at
                                ? new Date(t.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                : '—'}
                            </td>
                            <td className="py-2.5 px-4 text-sm font-medium" style={{ color: colors.textPrimary }}>{t.camara}</td>
                            <td className="py-2.5 px-4 text-sm font-bold" style={{ color: est.color }}>
                              {t.temperatura}°C
                            </td>
                            <td className="py-2.5 px-4">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                                style={{
                                  backgroundColor: est.variant === 'danger' ? 'rgba(239,68,68,0.12)' : est.variant === 'warning' ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)',
                                  color: est.color,
                                }}>
                                {est.label}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-xs" style={{ color: colors.textSecondary }}>{t.responsable || '—'}</td>
                            <td className="py-2.5 px-4 text-xs" style={{ color: colors.textMuted }}>{t.observaciones || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Modal */}
      {modalDetalle && (
        <ModalDetalleProducto
          item={modalDetalle}
          onClose={() => setModalDetalle(null)}
          onMovimiento={item => setModalItem(item)}
        />
      )}
      {modalItem && (
        <ModalMovimiento
          item={modalItem}
          onClose={() => setModalItem(null)}
          onApply={aplicarMovimiento}
          operariosDisponibles={operarios}
          stockImpPost={stock.filter(s => s.tipo_producto === 'impulsivo' || s.tipo_producto === 'postre')}
        />
      )}
      {modalAgregar && (
        <ModalAgregarProducto
          onClose={() => setModalAgregar(false)}
          onSubmit={agregarProducto}
          saving={savingAgregar}
        />
      )}
    </div>
  )
}
