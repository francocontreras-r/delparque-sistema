import { useState, useEffect, useMemo } from 'react'
import { Search, LayoutGrid, List, Printer, ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
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
  Lisa:           { bg: '#eff6ff', color: '#1d4ed8' },
  'Con Agregado': { bg: '#f5f3ff', color: '#6d28d9' },
  Agua:           { bg: '#ecfeff', color: '#0e7490' },
  Especial:       { bg: '#fff7ed', color: '#c2410c' },
  Impulsivo:      { bg: '#fdf4ff', color: '#a21caf' },
  Postre:         { bg: '#fef9c3', color: '#854d0e' },
}
const TIPOS_PRODUCTO = [
  { key: 'helado',    label: 'Helados' },
  { key: 'impulsivo', label: 'Impulsivos' },
  { key: 'postre',    label: 'Postres' },
]
const MOTIVOS_EGRESO = [
  'Venta mostrador', 'Venta mayorista', 'Transferencia',
  'Degustación', 'Merma', 'Consumo interno',
]
const ROLES = ['operario', 'admin']

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

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, padding: '14px', borderLeft: `4px solid ${colors.border}` }}>
      <div className="h-2.5 w-3/4 rounded mb-3" style={{ backgroundColor: '#f1f5f9' }} />
      <div className="h-7 w-1/3 rounded mb-2" style={{ backgroundColor: '#f1f5f9' }} />
      <div className="h-2 w-1/2 rounded" style={{ backgroundColor: '#f1f5f9' }} />
    </div>
  )
}

// ── Tarjeta grilla ────────────────────────────────────────────────────────────

function TarjetaSabor({ item, onClick, showVal }) {
  const e  = estadoSabor(item.baldes)
  const tb = TIPO_BADGE[item.tipo] || { bg: '#f8fafc', color: '#64748b' }
  const precioKg = item.precio_kg || TIPO_PRECIOS[item.tipo]?.precio_kg
  const [hov, setHov] = useState(false)

  return (
    <button
      onClick={() => onClick(item)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="text-left transition-all duration-150 w-full"
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
      <p className="text-xs mb-2" style={{ color: colors.textMuted }}>{item.kg} kg</p>
      {item.lote && (
        <p className="text-[10px] font-mono mb-1.5" style={{ color: colors.textMuted }}>Lote: {item.lote}</p>
      )}
      {showVal && precioKg && item.kg > 0 && (
        <p className="text-xs font-bold mb-1.5" style={{ color: colors.brand }}>
          ${pesos(item.kg * precioKg)}
        </p>
      )}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md inline-block"
          style={{ backgroundColor: tb.bg, color: tb.color }}>
          {item.tipo}
        </span>
        <Badge variant={estadoBadgeVariant(item.baldes)} className="!text-[10px] !px-1.5 !py-0.5">{e.label}</Badge>
      </div>
    </button>
  )
}

// ── Fila tabla lista ──────────────────────────────────────────────────────────

function FilaLista({ item, onClick, showVal }) {
  const e = estadoSabor(item.baldes)
  const precioKg = item.precio_kg || TIPO_PRECIOS[item.tipo]?.precio_kg
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
              <span className="block text-[10px] font-mono" style={{ color: colors.textMuted }}>Lote: {item.lote}</span>
            )}
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <span className="text-base font-bold" style={{ color: e.dot }}>{item.baldes}</span>
      </td>
      <td className="py-3 px-4 text-sm" style={{ color: colors.textMuted }}>{item.kg} kg</td>
      {showVal && (
        <td className="py-3 px-4 text-sm font-semibold" style={{ color: colors.brand }}>
          {precioKg && item.kg > 0 ? `$${pesos(item.kg * precioKg)}` : '—'}
        </td>
      )}
      <td className="py-3 px-4">
        <Badge variant={estadoBadgeVariant(item.baldes)}>{e.label}</Badge>
      </td>
    </tr>
  )
}

// ── Grupo lista ───────────────────────────────────────────────────────────────

function GrupoLista({ tipo, items, onSelect, showVal }) {
  const tb = TIPO_BADGE[tipo] || { bg: '#f8fafc', color: '#64748b' }
  const totalBaldes = items.reduce((a, s) => a + s.baldes, 0)
  const totalKg     = items.reduce((a, s) => a + s.kg, 0)
  return (
    <div className="mb-4 overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: tb.bg, borderBottom: `1px solid ${colors.border}` }}>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: tb.color }}>{tipo}</span>
        <span className="text-xs font-semibold" style={{ color: tb.color }}>{totalBaldes} baldes · {totalKg} kg</span>
      </div>
      <table className="w-full">
        <thead>
          <tr style={{ backgroundColor: '#fafafa', borderBottom: `1px solid ${colors.border}` }}>
            {['Sabor', 'Baldes', 'KG', showVal && 'Valor venta', 'Estado'].filter(Boolean).map(h => (
              <th key={h} className="py-2 px-4 text-left font-semibold uppercase"
                style={{ fontSize: 10, color: colors.textMuted, letterSpacing: '0.07em' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <FilaLista key={item.id} item={item} onClick={onSelect} showVal={showVal} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Modal movimiento ──────────────────────────────────────────────────────────

function ModalMovimiento({ item, onClose, onApply }) {
  const [tipoMov, setTipoMov]       = useState('ingreso')
  const [cantBaldes, setCantBaldes] = useState('')
  const [cantKg, setCantKg]         = useState('')
  const [motivo, setMotivo]         = useState(MOTIVOS_EGRESO[0])
  const [lote, setLote]             = useState(item.lote || '')
  const [saving, setSaving]         = useState(false)
  const [errorMsg, setErrorMsg]     = useState(null)

  const e = estadoSabor(item.baldes)

  async function handleApply() {
    const b = parseInt(cantBaldes)
    const k = parseFloat(cantKg)
    if (!b || b <= 0) return
    setSaving(true)
    setErrorMsg(null)
    const err = await onApply({ id: item.id, tipo: tipoMov, baldes: b, kg: isNaN(k) ? 0 : k, motivo, lote: lote.trim() })
    if (err) { setErrorMsg(err); setSaving(false) }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item.nombre}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1">
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleApply}
            loading={saving}
            disabled={!cantBaldes || parseInt(cantBaldes) <= 0}
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
            <span className="text-xs ml-1.5" style={{ color: colors.textMuted }}>baldes · {item.kg} kg</span>
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
        <div className="flex gap-3">
          <Input label="Baldes" type="number" min="1" value={cantBaldes} disabled={saving}
            onChange={ev => setCantBaldes(ev.target.value)} placeholder="0" />
          <Input label="KG" type="number" min="0" step="0.1" value={cantKg} disabled={saving}
            onChange={ev => setCantKg(ev.target.value)} placeholder="0" />
        </div>

        <Input label="Número de lote" type="text" value={lote} disabled={saving}
          onChange={ev => setLote(ev.target.value)} placeholder="Opcional" />

        {tipoMov === 'egreso' && (
          <Select label="Motivo" value={motivo} onChange={ev => setMotivo(ev.target.value)} disabled={saving}>
            {MOTIVOS_EGRESO.map(m => <option key={m}>{m}</option>)}
          </Select>
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
            </strong> baldes
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

// ── Informe para imprimir ─────────────────────────────────────────────────────

function generarInforme(stock, showVal) {
  const ahora = new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const totalBaldes = stock.reduce((a, s) => a + s.baldes, 0)
  const totalKg     = stock.reduce((a, s) => a + s.kg, 0)
  const costoTotal  = stock.reduce((a, s) => a + s.kg * (s.costo_kg || TIPO_PRECIOS[s.tipo]?.costo_kg || 0), 0)
  const valorVenta  = stock.reduce((a, s) => a + s.kg * (s.precio_kg || TIPO_PRECIOS[s.tipo]?.precio_kg || 0), 0)

  let tablas = ''
  ;['Lisa', 'Con Agregado', 'Agua', 'Especial'].forEach(tipo => {
    const items = stock.filter(s => s.tipo === tipo).sort((a, b) => a.nombre.localeCompare(b.nombre))
    if (!items.length) return
    const stB = items.reduce((a, s) => a + s.baldes, 0)
    const stK = items.reduce((a, s) => a + s.kg, 0)
    const stC = items.reduce((a, s) => a + s.kg * (s.costo_kg || TIPO_PRECIOS[s.tipo]?.costo_kg || 0), 0)
    const stP = items.reduce((a, s) => a + s.kg * (s.precio_kg || TIPO_PRECIOS[s.tipo]?.precio_kg || 0), 0)
    const valHead = showVal ? '<th>Costo</th><th>Valor venta</th>' : ''
    const valFoot = showVal ? `<td class="num"><strong>$${pesos(stC)}</strong></td><td class="num"><strong>$${pesos(stP)}</strong></td>` : ''
    const rows = items.map(s => {
      const ck = s.costo_kg || TIPO_PRECIOS[s.tipo]?.costo_kg
      const pk = s.precio_kg || TIPO_PRECIOS[s.tipo]?.precio_kg
      const vc = showVal ? `<td class="num">${ck ? '$' + pesos(s.kg * ck) : '-'}</td><td class="num">${pk ? '$' + pesos(s.kg * pk) : '-'}</td>` : ''
      return `<tr class="${s.baldes === 0 ? 'agotado' : s.baldes <= 3 ? 'bajo' : ''}">
        <td>${s.nombre}</td><td class="num">${s.baldes}</td><td class="num">${s.kg}</td>${vc}
        <td class="estado">${s.baldes === 0 ? 'AGOTADO' : s.baldes <= 3 ? 'Bajo' : 'OK'}</td></tr>`
    }).join('')
    tablas += `<div class="grupo"><div class="grupo-header">${tipo}</div>
      <table><thead><tr><th>Sabor</th><th>Baldes</th><th>KG</th>${valHead}<th>Estado</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td><strong>Subtotal</strong></td><td class="num"><strong>${stB}</strong></td><td class="num"><strong>${stK}</strong></td>${valFoot}<td></td></tr></tfoot></table></div>`
  })

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe Cámaras - Del Parque</title>
<style>*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:24px}
.header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid ${colors.brand};padding-bottom:12px;margin-bottom:16px}
.logo-img{height:32px;display:block}
.sub{font-size:10px;color:#666;margin-top:4px}.fecha{font-size:10px;color:#444;text-align:right}
.kpis{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap}
.kpi{border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;flex:1;min-width:80px}
.kpi .val{font-size:20px;font-weight:700}.kpi .lbl{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.6px}
.grupo{margin-bottom:18px;break-inside:avoid}
.grupo-header{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;background:#f8fafc;padding:6px 10px;border-radius:4px 4px 0 0;color:#374151;border-bottom:1px solid #e2e8f0}
table{width:100%;border-collapse:collapse}
th{background:#f8fafc;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:6px 10px;text-align:left;color:#64748b;border-bottom:1px solid #e2e8f0}
td{padding:5px 10px;border-bottom:1px solid #f1f5f9}td.num{text-align:right;font-weight:600}
tr.agotado td{color:#dc2626;background:#fef2f2}tr.bajo td{color:#d97706;background:#fffbeb}
tfoot tr td{border-top:1px solid #cbd5e1;background:#f8fafc}
.firmas{display:flex;gap:48px;margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0}
.firma{flex:1;border-top:1px solid #374151;margin-top:32px;padding-top:6px;font-size:9px;color:#64748b}
@media print{body{padding:0}}</style></head><body>
<div class="header">
  <div><img src="${logoUrl}" class="logo-img" alt="Del Parque" /><div class="sub">Informe de Stock — Cámaras</div></div>
  <div class="fecha"><strong>Fecha:</strong> ${ahora}</div>
</div>
<div class="kpis">
  <div class="kpi"><div class="val">${totalBaldes}</div><div class="lbl">Total baldes</div></div>
  <div class="kpi"><div class="val">${totalKg}</div><div class="lbl">Total KG</div></div>
  <div class="kpi"><div class="val">${stock.filter(s => s.baldes > 3).length}</div><div class="lbl">Con stock</div></div>
  <div class="kpi"><div class="val" style="color:#dc2626">${stock.filter(s => s.baldes === 0).length}</div><div class="lbl">Agotados</div></div>
  ${showVal ? `<div class="kpi"><div class="val" style="color:#64748b">$${pesos(costoTotal / 1000)}k</div><div class="lbl">Costo total</div></div><div class="kpi"><div class="val" style="color:${colors.brand}">$${pesos(valorVenta / 1000)}k</div><div class="lbl">Valor venta</div></div>` : ''}
</div>${tablas}
<div class="firmas">
  <div class="firma">Responsable de Cámaras</div>
  <div class="firma">Jefe de Producción</div>
  <div class="firma">Gerencia</div>
</div></body></html>`
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
  const [userRole, setUserRole]         = useState('operario')

  const showVal = userRole === 'admin'

  useEffect(() => {
    async function cargar() {
      const { data, error } = await supabase.from('stock_camaras').select('*').order('tipo', { ascending: true })
      if (error) setErrorCarga(error.message)
      else setStock(data)
      setLoading(false)
    }
    cargar()
    const channel = supabase.channel('stock_camaras_rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stock_camaras' },
        ({ new: updated }) => setStock(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s)))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  function mostrarToast(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const stockTipo = useMemo(() => (
    stock.filter(s => (s.tipo_producto || 'helado') === filtroTipoProducto)
  ), [stock, filtroTipoProducto])

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

  async function aplicarMovimiento({ id, tipo, baldes, kg, lote }) {
    const sabor = stock.find(s => s.id === id)
    if (!sabor) return 'Sabor no encontrado'
    const nuevoBaldes = tipo === 'ingreso' ? sabor.baldes + baldes : Math.max(0, sabor.baldes - baldes)
    const nuevosKg    = tipo === 'ingreso' ? sabor.kg + kg         : Math.max(0, sabor.kg - kg)
    const nuevoLote   = lote || null
    const { error } = await supabase.from('stock_camaras')
      .update({ baldes: nuevoBaldes, kg: nuevosKg, lote: nuevoLote, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return error.message
    setStock(prev => prev.map(s => s.id === id ? { ...s, baldes: nuevoBaldes, kg: nuevosKg, lote: nuevoLote } : s))
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

      {/* Error */}
      {errorCarga && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
          style={{ backgroundColor: colors.dangerBg, color: colors.danger, border: `1px solid ${colors.danger}30` }}>
          <span className="font-semibold">Error al cargar:</span> {errorCarga}
        </div>
      )}

      {/* KPIs */}
      {!errorCarga && (
        <div className={`grid gap-3 ${showVal ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-7' : 'grid-cols-2 sm:grid-cols-5'}`}>
          <KpiCard label="Total baldes" value={loading ? '—' : totalBaldes} />
          <KpiCard label="Total KG"     value={loading ? '—' : `${totalKg} kg`} />
          <KpiCard label="Con stock"    value={loading ? '—' : conStock}    color={colors.success} active={filtroEstado === 'ok'}      onClick={() => setFiltroEstado(prev => prev === 'ok' ? null : 'ok')} />
          <KpiCard label="Poco stock"   value={loading ? '—' : pocoStock}   color={colors.warning} active={filtroEstado === 'poco'}    onClick={() => setFiltroEstado(prev => prev === 'poco' ? null : 'poco')} />
          <KpiCard label="Agotados"     value={loading ? '—' : agotados}    color={colors.danger}  active={filtroEstado === 'agotado'} onClick={() => setFiltroEstado(prev => prev === 'agotado' ? null : 'agotado')} />
          {showVal && (
            <>
              <KpiCard label="Costo total" value={loading ? '—' : `$${pesos(costoTotal / 1000)}k`} color={colors.textSecondary} />
              <KpiCard label="Valor venta" value={loading ? '—' : `$${pesos(valorVenta / 1000)}k`} color={colors.brand} />
            </>
          )}
        </div>
      )}

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
                <TarjetaSabor key={item.id} item={item} onClick={setModalItem} showVal={showVal} />
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
                <GrupoLista key={tipo} tipo={tipo} items={items} onSelect={setModalItem} showVal={showVal} />
              ))}
            </div>
      )}

      {/* Modal */}
      {modalItem && (
        <ModalMovimiento item={modalItem} onClose={() => setModalItem(null)} onApply={aplicarMovimiento} />
      )}
    </div>
  )
}
