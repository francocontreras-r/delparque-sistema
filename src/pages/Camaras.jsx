import { useState, useEffect, useMemo } from 'react'
import { Search, LayoutGrid, List, Printer, ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '../lib/supabase'

const ORANGE = '#D4521A'

const TIPO_PRECIOS = {
  Lisa:           { costo_kg: 1200, precio_kg: 2800 },
  'Con Agregado': { costo_kg: 1500, precio_kg: 3200 },
  Agua:           { costo_kg:  900, precio_kg: 2200 },
  Especial:       { costo_kg: 2000, precio_kg: 4500 },
}
const TIPOS = ['Todos', 'Lisa', 'Con Agregado', 'Agua', 'Especial']
const TIPO_COLORS = {
  Lisa:           { bg: 'bg-blue-50',   text: 'text-blue-700'   },
  'Con Agregado': { bg: 'bg-purple-50', text: 'text-purple-700' },
  Agua:           { bg: 'bg-cyan-50',   text: 'text-cyan-700'   },
  Especial:       { bg: 'bg-orange-50', text: 'text-orange-700' },
}
const MOTIVOS_EGRESO = [
  'Venta mostrador', 'Venta mayorista', 'Transferencia',
  'Degustacion', 'Merma', 'Consumo interno',
]
const ROLES = ['operario', 'admin']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estado(baldes) {
  if (baldes === 0) return { dot: '#EF4444', textCls: 'text-red-600',    bgCls: 'bg-red-50',    label: 'Agotado' }
  if (baldes <= 3)  return { dot: '#F59E0B', textCls: 'text-yellow-600', bgCls: 'bg-yellow-50', label: 'Bajo'    }
  return                   { dot: '#22C55E', textCls: 'text-green-600',  bgCls: 'bg-green-50',  label: 'OK'      }
}

function pesos(n) {
  return Math.round(n).toLocaleString('es-AR')
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ toast }) {
  if (!toast) return null
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
        toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'
      }`}
    >
      {toast.msg}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-col gap-2 animate-pulse">
      <div className="h-2.5 w-3/4 bg-gray-100 rounded" />
      <div className="h-7 w-1/3 bg-gray-100 rounded" />
      <div className="h-2 w-1/2 bg-gray-100 rounded" />
      <div className="h-4 w-1/2 bg-gray-100 rounded mt-1" />
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function KpiCard({ label, value, color, active, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border p-4 flex flex-col gap-1 transition-all
        ${onClick ? 'cursor-pointer hover:shadow-sm select-none' : ''}`}
      style={{ borderColor: active ? ORANGE : '#f3f4f6', borderWidth: active ? 2 : 1 }}
    >
      <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-bold" style={{ color: color || '#1F2937' }}>{value}</span>
    </div>
  )
}

function TarjetaSabor({ item, onClick, showVal }) {
  const e  = estado(item.baldes)
  const tc = TIPO_COLORS[item.tipo] || { bg: 'bg-gray-50', text: 'text-gray-600' }
  const p  = item.precio_kg ? item : TIPO_PRECIOS[item.tipo]
  const precioKg = item.precio_kg || p?.precio_kg
  return (
    <button
      onClick={() => onClick(item)}
      className="bg-white rounded-xl border border-gray-100 p-3 text-left hover:border-orange-200 hover:shadow-sm transition-all relative flex flex-col gap-1"
    >
      <span className="absolute top-3 right-3 w-2 h-2 rounded-full" style={{ backgroundColor: e.dot }} />
      <span className="text-xs font-semibold text-gray-700 pr-4 leading-tight">{item.nombre}</span>
      <span className={`text-2xl font-bold leading-none ${e.textCls}`}>{item.baldes}</span>
      <span className="text-xs text-gray-400">{item.kg} kg</span>
      {showVal && precioKg && item.kg > 0 && (
        <span className="text-[10px] font-semibold" style={{ color: ORANGE }}>
          ${pesos(item.kg * precioKg)}
        </span>
      )}
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md self-start mt-1 ${tc.bg} ${tc.text}`}>
        {item.tipo}
      </span>
    </button>
  )
}

function FilaLista({ item, onClick, showVal }) {
  const e = estado(item.baldes)
  const precioKg = item.precio_kg || TIPO_PRECIOS[item.tipo]?.precio_kg
  return (
    <tr className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => onClick(item)}>
      <td className="py-2.5 px-4 text-sm font-medium text-gray-700">{item.nombre}</td>
      <td className="py-2.5 px-4">
        <span className={`text-base font-bold ${e.textCls}`}>{item.baldes}</span>
      </td>
      <td className="py-2.5 px-4 text-sm text-gray-400">{item.kg} kg</td>
      {showVal && (
        <td className="py-2.5 px-4 text-sm" style={{ color: ORANGE }}>
          {precioKg && item.kg > 0 ? `$${pesos(item.kg * precioKg)}` : '—'}
        </td>
      )}
      <td className="py-2.5 px-4">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${e.bgCls} ${e.textCls}`}>{e.label}</span>
      </td>
    </tr>
  )
}

function GrupoLista({ tipo, items, onSelect, showVal }) {
  const totalBaldes = items.reduce((a, s) => a + s.baldes, 0)
  const totalKg     = items.reduce((a, s) => a + s.kg, 0)
  const tc = TIPO_COLORS[tipo] || { bg: 'bg-gray-50', text: 'text-gray-600' }
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4">
      <div className={`flex items-center justify-between px-4 py-2.5 ${tc.bg}`}>
        <span className={`text-xs font-bold uppercase tracking-wide ${tc.text}`}>{tipo}</span>
        <span className={`text-xs font-semibold ${tc.text}`}>{totalBaldes} baldes · {totalKg} kg</span>
      </div>
      <table className="w-full">
        {showVal && (
          <thead>
            <tr className="border-b border-gray-100">
              <th className="py-1.5 px-4 text-left text-[10px] text-gray-400 font-semibold uppercase">Sabor</th>
              <th className="py-1.5 px-4 text-left text-[10px] text-gray-400 font-semibold uppercase">Baldes</th>
              <th className="py-1.5 px-4 text-left text-[10px] text-gray-400 font-semibold uppercase">KG</th>
              <th className="py-1.5 px-4 text-left text-[10px] text-gray-400 font-semibold uppercase">Valor venta</th>
              <th className="py-1.5 px-4 text-left text-[10px] text-gray-400 font-semibold uppercase">Estado</th>
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-gray-50">
          {items.map(item => (
            <FilaLista key={item.id} item={item} onClick={onSelect} showVal={showVal} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ModalMovimiento({ item, onClose, onApply }) {
  const [tipoMov, setTipoMov]       = useState('ingreso')
  const [cantBaldes, setCantBaldes] = useState('')
  const [cantKg, setCantKg]         = useState('')
  const [motivo, setMotivo]         = useState(MOTIVOS_EGRESO[0])
  const [saving, setSaving]         = useState(false)
  const [errorMsg, setErrorMsg]     = useState(null)

  async function handleApply() {
    const b = parseInt(cantBaldes)
    const k = parseFloat(cantKg)
    if (!b || b <= 0) return
    setSaving(true)
    setErrorMsg(null)
    const err = await onApply({ id: item.id, tipo: tipoMov, baldes: b, kg: isNaN(k) ? 0 : k, motivo })
    if (err) {
      setErrorMsg(err)
      setSaving(false)
    }
    // Si no hay error el padre cierra el modal
  }

  const e = estado(item.baldes)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-medium">Movimiento</p>
            <p className="font-bold text-gray-800 text-sm">{item.nombre}</p>
          </div>
          <div className="text-right">
            <span className={`text-lg font-bold ${e.textCls}`}>{item.baldes}</span>
            <p className="text-xs text-gray-400">{item.kg} kg en camara</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex rounded-lg bg-gray-100 p-1 gap-1">
            {['ingreso', 'egreso'].map(t => (
              <button
                key={t}
                onClick={() => setTipoMov(t)}
                disabled={saving}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-semibold transition-all ${
                  tipoMov === t
                    ? t === 'ingreso' ? 'bg-green-500 text-white shadow-sm' : 'bg-red-500 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'ingreso' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                {t === 'ingreso' ? 'Ingreso' : 'Egreso'}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Baldes</label>
              <input
                type="number" min="1" value={cantBaldes} disabled={saving}
                onChange={e => setCantBaldes(e.target.value)} placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-orange-400 transition disabled:bg-gray-50"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">KG</label>
              <input
                type="number" min="0" step="0.1" value={cantKg} disabled={saving}
                onChange={e => setCantKg(e.target.value)} placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400 transition disabled:bg-gray-50"
              />
            </div>
          </div>

          {tipoMov === 'egreso' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Motivo</label>
              <select
                value={motivo} onChange={e => setMotivo(e.target.value)} disabled={saving}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400 transition bg-white disabled:bg-gray-50"
              >
                {MOTIVOS_EGRESO.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          )}

          {cantBaldes && parseInt(cantBaldes) > 0 && (
            <div className={`rounded-lg px-3 py-2.5 text-sm font-medium text-center ${
              tipoMov === 'ingreso' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {tipoMov === 'ingreso' ? '↑' : '↓'} {item.baldes} →{' '}
              <strong>
                {tipoMov === 'ingreso'
                  ? item.baldes + parseInt(cantBaldes)
                  : Math.max(0, item.baldes - parseInt(cantBaldes))}
              </strong> baldes
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg px-3 py-2.5 bg-red-50 text-red-700 text-xs font-medium">
              Error: {errorMsg}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 transition disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={handleApply}
            disabled={saving || !cantBaldes || parseInt(cantBaldes) <= 0}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ backgroundColor: ORANGE }}>
            {saving && (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            {saving ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Informe para imprimir ────────────────────────────────────────────────────

function generarInforme(stock, showVal) {
  const ahora = new Date().toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const totalBaldes = stock.reduce((a, s) => a + s.baldes, 0)
  const totalKg     = stock.reduce((a, s) => a + s.kg, 0)
  const costoTotal  = stock.reduce((a, s) => a + s.kg * (s.costo_kg || TIPO_PRECIOS[s.tipo]?.costo_kg || 0), 0)
  const valorVenta  = stock.reduce((a, s) => a + s.kg * (s.precio_kg || TIPO_PRECIOS[s.tipo]?.precio_kg || 0), 0)

  const tiposOrden = ['Lisa', 'Con Agregado', 'Agua', 'Especial']
  let tablas = ''
  tiposOrden.forEach(tipo => {
    const items = stock.filter(s => s.tipo === tipo).sort((a, b) => a.nombre.localeCompare(b.nombre))
    if (!items.length) return
    const stB = items.reduce((a, s) => a + s.baldes, 0)
    const stK = items.reduce((a, s) => a + s.kg, 0)
    const stC = items.reduce((a, s) => a + s.kg * (s.costo_kg || TIPO_PRECIOS[s.tipo]?.costo_kg || 0), 0)
    const stP = items.reduce((a, s) => a + s.kg * (s.precio_kg || TIPO_PRECIOS[s.tipo]?.precio_kg || 0), 0)
    const valHead = showVal ? '<th>Costo</th><th>Valor venta</th>' : ''
    const valFoot = showVal
      ? `<td class="num"><strong>$${pesos(stC)}</strong></td><td class="num"><strong>$${pesos(stP)}</strong></td>`
      : ''
    const rows = items.map(s => {
      const ck = s.costo_kg || TIPO_PRECIOS[s.tipo]?.costo_kg
      const pk = s.precio_kg || TIPO_PRECIOS[s.tipo]?.precio_kg
      const vc = showVal
        ? `<td class="num">${ck ? '$' + pesos(s.kg * ck) : '-'}</td><td class="num">${pk ? '$' + pesos(s.kg * pk) : '-'}</td>`
        : ''
      return `<tr class="${s.baldes === 0 ? 'agotado' : s.baldes <= 3 ? 'bajo' : ''}">
        <td>${s.nombre}</td><td class="num">${s.baldes}</td><td class="num">${s.kg}</td>${vc}
        <td class="estado">${s.baldes === 0 ? 'AGOTADO' : s.baldes <= 3 ? 'Bajo' : 'OK'}</td></tr>`
    }).join('')
    tablas += `<div class="grupo">
      <div class="grupo-header">${tipo}</div>
      <table>
        <thead><tr><th>Sabor</th><th>Baldes</th><th>KG</th>${valHead}<th>Estado</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td><strong>Subtotal</strong></td><td class="num"><strong>${stB}</strong></td><td class="num"><strong>${stK}</strong></td>${valFoot}<td></td></tr></tfoot>
      </table></div>`
  })
  const kpiVal = showVal
    ? `<div class="kpi"><div class="val" style="color:#6b7280">$${pesos(costoTotal / 1000)}k</div><div class="lbl">Costo total</div></div>
       <div class="kpi"><div class="val" style="color:${ORANGE}">$${pesos(valorVenta / 1000)}k</div><div class="lbl">Valor venta</div></div>`
    : ''
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Informe Camaras - Del Parque</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a1a;padding:24px}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${ORANGE};padding-bottom:12px;margin-bottom:16px}
.logo{font-size:22px;font-weight:900;margin-bottom:4px}.logo .a{color:${ORANGE}}
.sub{font-size:11px;color:#666;margin-top:2px}.fecha{text-align:right;font-size:11px;color:#444}
.kpis{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.kpi{border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;flex:1;min-width:90px}
.kpi .val{font-size:20px;font-weight:700}.kpi .lbl{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.5px}
.grupo{margin-bottom:20px;break-inside:avoid}
.grupo-header{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;background:#f3f4f6;padding:6px 10px;border-radius:4px 4px 0 0;color:#374151;border-bottom:1px solid #e5e7eb}
table{width:100%;border-collapse:collapse}
th{background:#f9fafb;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:6px 10px;text-align:right;color:#6b7280;border-bottom:1px solid #e5e7eb}
th:first-child{text-align:left}
td{padding:5px 10px;border-bottom:1px solid #f3f4f6}td.num{text-align:right;font-weight:600}
td.estado{font-size:10px;font-weight:700;text-align:left}
tr.agotado td{color:#dc2626;background:#fef2f2}tr.bajo td{color:#d97706;background:#fffbeb}
tfoot tr td{border-top:1px solid #d1d5db;background:#f9fafb}
.firmas{display:flex;gap:48px;margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb}
.firma{flex:1}.firma .linea{border-top:1px solid #374151;margin-top:32px;padding-top:6px;font-size:10px;color:#6b7280}
@media print{body{padding:0}}
</style></head><body>
<div class="header">
  <div><div class="logo"><span class="a">Del</span> Parque</div><div class="sub">Informe de Stock — Camaras</div></div>
  <div class="fecha"><strong>Fecha:</strong> ${ahora}</div>
</div>
<div class="kpis">
  <div class="kpi"><div class="val">${totalBaldes}</div><div class="lbl">Total baldes</div></div>
  <div class="kpi"><div class="val">${totalKg}</div><div class="lbl">Total KG</div></div>
  <div class="kpi"><div class="val">${stock.filter(s => s.baldes > 0).length}</div><div class="lbl">Con stock</div></div>
  <div class="kpi"><div class="val" style="color:#dc2626">${stock.filter(s => s.baldes === 0).length}</div><div class="lbl">Agotados</div></div>
  ${kpiVal}
</div>${tablas}
<div class="firmas">
  <div class="firma"><div class="linea">Responsable de Camaras</div></div>
  <div class="firma"><div class="linea">Jefe de Produccion</div></div>
  <div class="firma"><div class="linea">Gerencia</div></div>
</div></body></html>`
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Camaras() {
  const [stock, setStock]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [errorCarga, setErrorCarga]     = useState(null)
  const [toast, setToast]               = useState(null)
  const [filtroNombre, setFiltroNombre] = useState('')
  const [filtroTipo, setFiltroTipo]     = useState('Todos')
  const [filtroEstado, setFiltroEstado] = useState(null)
  const [orden, setOrden]               = useState('az')
  const [vista, setVista]               = useState('grilla')
  const [modalItem, setModalItem]       = useState(null)
  const [userRole, setUserRole]         = useState('operario')

  const showVal = userRole === 'admin'

  // ── Carga inicial + tiempo real ──────────────────────────────────────────────
  useEffect(() => {
    async function cargar() {
      const { data, error } = await supabase
        .from('stock_camaras')
        .select('*')
        .order('tipo', { ascending: true })
      if (error) {
        setErrorCarga(error.message)
      } else {
        setStock(data)
      }
      setLoading(false)
    }
    cargar()

    // Tiempo real: actualiza la fila afectada cuando otro usuario modifica stock
    const channel = supabase
      .channel('stock_camaras_rt')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stock_camaras' },
        ({ new: updated }) => {
          setStock(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s))
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  function mostrarToast(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const totalBaldes = stock.reduce((a, s) => a + s.baldes, 0)
  const totalKg     = stock.reduce((a, s) => a + s.kg, 0)
  const conStock    = stock.filter(s => s.baldes > 3).length
  const pocoStock   = stock.filter(s => s.baldes >= 1 && s.baldes <= 3).length
  const agotados    = stock.filter(s => s.baldes === 0).length
  const costoTotal  = showVal ? stock.reduce((a, s) => a + s.kg * (s.costo_kg || TIPO_PRECIOS[s.tipo]?.costo_kg || 0), 0) : 0
  const valorVenta  = showVal ? stock.reduce((a, s) => a + s.kg * (s.precio_kg || TIPO_PRECIOS[s.tipo]?.precio_kg || 0), 0) : 0

  // ── Filtrado ──────────────────────────────────────────────────────────────────
  const filtrado = useMemo(() => {
    let arr = stock.filter(s => {
      const matchN = s.nombre.toLowerCase().includes(filtroNombre.toLowerCase())
      const matchT = filtroTipo === 'Todos' || s.tipo === filtroTipo
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
  }, [stock, filtroNombre, filtroTipo, orden, filtroEstado])

  const agrupado = useMemo(() => (
    ['Lisa', 'Con Agregado', 'Agua', 'Especial']
      .map(tipo => ({ tipo, items: filtrado.filter(s => s.tipo === tipo) }))
      .filter(g => g.items.length > 0)
  ), [filtrado])

  // ── Guardar movimiento ────────────────────────────────────────────────────────
  async function aplicarMovimiento({ id, tipo, baldes, kg }) {
    const sabor = stock.find(s => s.id === id)
    if (!sabor) return 'Sabor no encontrado'

    const nuevoBaldes = tipo === 'ingreso' ? sabor.baldes + baldes : Math.max(0, sabor.baldes - baldes)
    const nuevosKg    = tipo === 'ingreso' ? sabor.kg + kg         : Math.max(0, sabor.kg - kg)

    const { error } = await supabase
      .from('stock_camaras')
      .update({ baldes: nuevoBaldes, kg: nuevosKg, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) return error.message

    setStock(prev => prev.map(s => s.id === id ? { ...s, baldes: nuevoBaldes, kg: nuevosKg } : s))
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

  function toggleEstado(key) {
    setFiltroEstado(prev => prev === key ? null : key)
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Toast */}
      <Toast toast={toast} />

      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Camaras</h1>
          <p className="text-sm text-gray-400">Stock de producto elaborado</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={imprimir}
            disabled={loading || !!errorCarga}
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-40"
          >
            <Printer size={15} /> Imprimir
          </button>
          <div className="flex items-center rounded-lg border border-dashed border-gray-300 overflow-hidden" title="Ver como (dev)">
            {ROLES.map(r => (
              <button key={r} onClick={() => setUserRole(r)}
                className={`px-3 py-1.5 text-xs font-medium transition capitalize ${userRole === r ? 'text-white' : 'text-gray-400 hover:text-gray-600'}`}
                style={userRole === r ? { backgroundColor: ORANGE } : {}}>
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Banner de error de carga */}
      {errorCarga && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <span className="font-semibold">Error al cargar:</span> {errorCarga}
          <button
            className="ml-auto text-xs underline hover:text-red-900"
            onClick={() => { setErrorCarga(null); setLoading(true); window.location.reload() }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* KPIs */}
      {!errorCarga && (
        <div className={`grid gap-3 grid-cols-2 ${showVal ? 'sm:grid-cols-6' : 'sm:grid-cols-4'}`}>
          <KpiCard label="Total baldes" value={loading ? '—' : totalBaldes} />
          <KpiCard label="Total KG"     value={loading ? '—' : `${totalKg} kg`} />
          <KpiCard label="Con stock"  value={loading ? '—' : conStock}  color="#22C55E" active={filtroEstado === 'ok'}      onClick={() => toggleEstado('ok')} />
          <KpiCard label="Poco stock" value={loading ? '—' : pocoStock} color="#F59E0B" active={filtroEstado === 'poco'}    onClick={() => toggleEstado('poco')} />
          <KpiCard label="Agotados"   value={loading ? '—' : agotados}  color="#EF4444" active={filtroEstado === 'agotado'} onClick={() => toggleEstado('agotado')} />
          {showVal && (
            <>
              <KpiCard label="Costo total" value={loading ? '—' : `$${pesos(costoTotal / 1000)}k`} color="#6B7280" />
              <KpiCard label="Valor venta" value={loading ? '—' : `$${pesos(valorVenta / 1000)}k`} color={ORANGE} />
            </>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" value={filtroNombre}
              onChange={e => setFiltroNombre(e.target.value)}
              placeholder="Buscar sabor..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-orange-400 transition"
            />
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setVista('grilla')}
              className={`px-3 py-2 transition ${vista === 'grilla' ? 'text-white' : 'text-gray-400 hover:bg-gray-50'}`}
              style={vista === 'grilla' ? { backgroundColor: ORANGE } : {}} title="Vista grilla">
              <LayoutGrid size={15} />
            </button>
            <button onClick={() => setVista('lista')}
              className={`px-3 py-2 transition border-l border-gray-200 ${vista === 'lista' ? 'text-white' : 'text-gray-400 hover:bg-gray-50'}`}
              style={vista === 'lista' ? { backgroundColor: ORANGE } : {}} title="Vista lista">
              <List size={15} />
            </button>
          </div>
          <button onClick={imprimir} disabled={loading || !!errorCarga}
            className="sm:hidden px-3 py-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 transition disabled:opacity-40">
            <Printer size={15} />
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {TIPOS.map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${filtroTipo === t ? 'text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                style={filtroTipo === t ? { backgroundColor: ORANGE } : {}}>
                {t}
              </button>
            ))}
          </div>
          <select value={orden} onChange={e => setOrden(e.target.value)}
            className="ml-auto text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-orange-400 bg-white text-gray-600">
            <option value="az">A → Z</option>
            <option value="mas">Mas baldes</option>
            <option value="menos">Menos baldes</option>
          </select>
        </div>
      </div>

      {/* Contador */}
      {!loading && !errorCarga && (
        <p className="text-xs text-gray-400 -mt-2">
          {filtrado.length} sabor{filtrado.length !== 1 ? 'es' : ''}
          {filtroTipo !== 'Todos' || filtroNombre || filtroEstado ? ' encontrados' : ' en total'}
          {filtroEstado && (
            <button className="ml-2 underline hover:text-gray-600" onClick={() => setFiltroEstado(null)}>
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
              <div key={i} className="bg-white rounded-xl border border-gray-100 h-24 animate-pulse" />
            ))}</div>
          : <div>
              {agrupado.map(({ tipo, items }) => (
                <GrupoLista key={tipo} tipo={tipo} items={items} onSelect={setModalItem} showVal={showVal} />
              ))}
            </div>
      )}

      {/* Modal */}
      {modalItem && (
        <ModalMovimiento
          item={modalItem}
          onClose={() => setModalItem(null)}
          onApply={aplicarMovimiento}
        />
      )}
    </div>
  )
}
