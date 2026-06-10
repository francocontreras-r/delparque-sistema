import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import { colors, radius, shadow } from '../styles/design-system'
import { Warehouse, ArrowUp, ArrowDown, Search, Printer } from 'lucide-react'

const TABS         = ['Movimientos', 'Stock', 'Trazabilidad']
const DESTINOS     = ['Bases', 'Sabores', 'Postres', 'Impulsivos', 'Escocés', 'Bombones']
const PRESENTACIONES = ['Balde', 'Bolsa', 'Lata', 'Caja', 'Frasco', 'Bidón']
const UNIDADES     = ['kg', 'litros', 'unidades', 'g']
const PERIODOS_TRZ = ['semana', 'mes', 'todo']
const SEM = { verde: colors.success, amarillo: colors.warning, rojo: colors.danger, gris: colors.textMuted }

const fieldStyle = {
  width: '100%',
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  padding: '8px 12px',
  fontSize: 14,
  outline: 'none',
  color: colors.textPrimary,
  backgroundColor: colors.surface,
}

function semaforo(actual, minimo) {
  if (!minimo || minimo <= 0) return 'gris'
  const r = actual / minimo
  if (r >= 1.5) return 'verde'
  if (r >= 0.75) return 'amarillo'
  return 'rojo'
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>{label}{required && ' *'}</label>
      {children}
    </div>
  )
}

function ModalMovimiento({ tipo, onClose, onSubmit, saving, insumos, operarios }) {
  const esIngreso = tipo === 'ingreso'
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    producto_nombre: '', marca: '', presentacion: 'Balde',
    cantidad: '', unidad: 'kg', lote: '', fecha_vencimiento: '',
    proveedor: '', controlo: '', destino: 'Bases', operario_recibe: '',
    observaciones: '',
  })
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal
      open
      onClose={onClose}
      title={esIngreso ? '↑ Registrar Ingreso' : '↓ Registrar Egreso'}
      maxWidth="max-w-md"
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium transition-colors"
            style={{ borderRadius: radius.md, border: `1px solid ${colors.border}`, color: colors.textSecondary, backgroundColor: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.bg }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}>
            Cancelar
          </button>
          <button onClick={() => onSubmit(form)} disabled={saving}
            className="flex-1 py-2.5 text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
            style={{ borderRadius: radius.md, backgroundColor: esIngreso ? colors.success : colors.danger }}>
            {saving && <Spinner size={14} />}
            {saving ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      }
    >
      <div className="p-6 space-y-3">
        <Field label="Fecha" required>
          <input type="date" value={form.fecha} onChange={e => upd('fecha', e.target.value)} style={fieldStyle} />
        </Field>
        <Field label="Producto" required>
          <input type="text" value={form.producto_nombre} onChange={e => upd('producto_nombre', e.target.value)}
            list="insumos-dl" placeholder="Nombre del insumo" style={fieldStyle} />
          <datalist id="insumos-dl">{insumos.map(i => <option key={i.id} value={i.nombre} />)}</datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marca">
            <input type="text" value={form.marca} onChange={e => upd('marca', e.target.value)} style={fieldStyle} />
          </Field>
          <Field label="Presentación">
            <select value={form.presentacion} onChange={e => upd('presentacion', e.target.value)} style={fieldStyle}>
              {PRESENTACIONES.map(p => <option key={p}>{p}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cantidad" required>
            <input type="number" step="0.01" value={form.cantidad} onChange={e => upd('cantidad', e.target.value)} style={fieldStyle} />
          </Field>
          <Field label={esIngreso ? 'Unidad' : 'Destino'}>
            {esIngreso
              ? <select value={form.unidad} onChange={e => upd('unidad', e.target.value)} style={fieldStyle}>
                  {UNIDADES.map(u => <option key={u}>{u}</option>)}
                </select>
              : <select value={form.destino} onChange={e => upd('destino', e.target.value)} style={fieldStyle}>
                  {DESTINOS.map(d => <option key={d}>{d}</option>)}
                </select>
            }
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lote">
            <input type="text" value={form.lote} onChange={e => upd('lote', e.target.value)} style={fieldStyle} />
          </Field>
          <Field label="Vencimiento">
            <input type="date" value={form.fecha_vencimiento} onChange={e => upd('fecha_vencimiento', e.target.value)} style={fieldStyle} />
          </Field>
        </div>
        {esIngreso ? (
          <Field label="Proveedor">
            <input type="text" value={form.proveedor} onChange={e => upd('proveedor', e.target.value)} style={fieldStyle} />
          </Field>
        ) : (
          <Field label="Operario que recibe">
            <select value={form.operario_recibe} onChange={e => upd('operario_recibe', e.target.value)} style={fieldStyle}>
              <option value="">— Seleccionar —</option>
              {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
            </select>
          </Field>
        )}
        <Field label="Controló">
          <input type="text" value={form.controlo} onChange={e => upd('controlo', e.target.value)}
            placeholder={esIngreso ? '' : 'Valle'} style={fieldStyle} />
        </Field>
        <Field label="Observaciones">
          <textarea value={form.observaciones} onChange={e => upd('observaciones', e.target.value)}
            rows={2} style={{ ...fieldStyle, resize: 'none' }} />
        </Field>
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
  const [filtroPeriodo, setFiltroPeriodo] = useState('mes')
  const [filtroDestino, setFiltroDestino] = useState('Todos')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [{ data: m }, { data: i }, { data: o }] = await Promise.all([
      supabase.from('movimientos_deposito').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('insumos').select('*').order('nombre'),
      supabase.from('operarios').select('*').order('nombre'),
    ])
    setMovimientos(m || [])
    setInsumos(i || [])
    setOperarios(o || [])
    setLoading(false)
  }

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleSubmit(form) {
    if (!form.producto_nombre || !form.cantidad) {
      toast2('Completa producto y cantidad', 'error'); return
    }
    setSaving(true)
    const payload = {
      tipo: modal,
      fecha: form.fecha,
      producto_nombre: form.producto_nombre,
      marca: form.marca || null,
      presentacion: form.presentacion,
      cantidad: parseFloat(form.cantidad),
      unidad: form.unidad || 'kg',
      lote: form.lote || null,
      fecha_vencimiento: form.fecha_vencimiento || null,
      proveedor: modal === 'ingreso' ? (form.proveedor || null) : null,
      controlo: form.controlo || null,
      destino: modal === 'egreso' ? form.destino : null,
      operario_recibe: modal === 'egreso' ? (form.operario_recibe || null) : null,
      observaciones: form.observaciones || null,
    }
    const { error } = await supabase.from('movimientos_deposito').insert(payload)
    setSaving(false)
    if (error) { toast2(error.message, 'error'); return }
    toast2(modal === 'ingreso' ? 'Ingreso registrado' : 'Egreso registrado')
    setModal(null)
    cargar()
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

  const egresos = useMemo(() => {
    return movimientos.filter(m => {
      if (m.tipo !== 'egreso') return false
      if (filtroDestino !== 'Todos' && m.destino !== filtroDestino) return false
      if (filtroPeriodo !== 'todo') {
        const dias = filtroPeriodo === 'semana' ? 7 : 30
        const limite = new Date(); limite.setDate(limite.getDate() - dias)
        const fecha = new Date(m.fecha || m.created_at)
        if (fecha < limite) return false
      }
      return true
    })
  }, [movimientos, filtroDestino, filtroPeriodo])

  function imprimirTrazabilidad() {
    const w = window.open('', '_blank')
    const filas = egresos.map(e => `
      <tr>
        <td>${e.fecha || ''}</td><td>${e.producto_nombre || ''}</td><td>${e.marca || ''}</td>
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
      h1{font-size:16px;font-weight:900;margin-bottom:2px}
      .naranja{color:${colors.brand}}
      .sub{font-size:10px;color:#666;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}
      th{background:#f3f4f6;font-size:8px;font-weight:700;text-transform:uppercase;padding:5px 6px;text-align:left;border-bottom:2px solid ${colors.brand}}
      td{padding:4px 6px;border-bottom:1px solid #f3f4f6;font-size:9px}
      .firmas{display:flex;gap:48px;margin-top:48px}
      .firma{flex:1;border-top:1px solid #374151;padding-top:6px;font-size:9px;color:#6b7280}
      @media print{body{padding:0}}
    </style></head><body>
    <h1>Del <span class="naranja">Parque</span></h1>
    <div class="sub">Planilla de Trazabilidad — Egreso de Materiales · ${new Date().toLocaleDateString('es-AR')}</div>
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

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Depósito</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Control de materia prima</p>
        </div>
        <div className="flex gap-2">
          {tab === 'Movimientos' && (
            <>
              <button onClick={() => setModal('ingreso')}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white transition-all"
                style={{ borderRadius: radius.md, backgroundColor: colors.success }}>
                <ArrowUp size={14} /> Ingreso
              </button>
              <button onClick={() => setModal('egreso')}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white transition-all"
                style={{ borderRadius: radius.md, backgroundColor: colors.danger }}>
                <ArrowDown size={14} /> Egreso
              </button>
            </>
          )}
          {tab === 'Trazabilidad' && (
            <button onClick={imprimirTrazabilidad}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors"
              style={{ borderRadius: radius.md, border: `1px solid ${colors.border}`, color: colors.textSecondary, backgroundColor: colors.surface }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.bg }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = colors.surface }}>
              <Printer size={15} /> Imprimir A4
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: colors.bg }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 text-xs font-semibold rounded-lg transition-all"
            style={{
              backgroundColor: tab === t ? colors.surface : 'transparent',
              color: tab === t ? colors.textPrimary : colors.textMuted,
              boxShadow: tab === t ? shadow.sm : 'none',
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
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px]">
                      <thead>
                        <tr style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                          {['Tipo / Fecha', 'Producto', 'Marca · Lote', 'Cantidad', 'Destino / Proveedor'].map(h => (
                            <th key={h} className="py-2.5 px-4 text-left font-semibold uppercase" style={{ fontSize: 10, color: colors.textMuted, letterSpacing: '0.06em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {movsFiltrados.map(m => (
                          <tr key={m.id} style={{ borderBottom: `1px solid ${colors.border}` }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.bg }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '' }}>
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                                style={{ backgroundColor: m.tipo === 'ingreso' ? colors.successBg : colors.dangerBg, color: m.tipo === 'ingreso' ? colors.success : colors.danger }}>
                                {m.tipo === 'ingreso' ? '↑' : '↓'} {m.fecha}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm font-medium" style={{ color: colors.textPrimary }}>{m.producto_nombre}</td>
                            <td className="py-3 px-4 text-xs" style={{ color: colors.textMuted }}>{[m.marca, m.lote].filter(Boolean).join(' · ') || '—'}</td>
                            <td className="py-3 px-4 text-sm font-bold whitespace-nowrap" style={{ color: colors.textPrimary }}>{m.cantidad} {m.unidad}</td>
                            <td className="py-3 px-4 text-xs" style={{ color: colors.textSecondary }}>{m.destino || m.proveedor || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'Stock' && (
            <div className="space-y-4">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textMuted }} />
                <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar insumo…"
                  className="w-full text-sm pl-8 pr-3 py-2 transition"
                  style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, outline: 'none', color: colors.textPrimary, backgroundColor: colors.surface }}
                  onFocus={e => { e.target.style.borderColor = colors.brand }}
                  onBlur={e => { e.target.style.borderColor = colors.border }}
                />
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
                      const niv = semaforo(ins.stock_actual || 0, ins.stock_minimo || 0)
                      const pct = ins.stock_minimo ? Math.min(100, ((ins.stock_actual || 0) / (ins.stock_minimo * 1.5)) * 100) : 50
                      return (
                        <div key={ins.id} className="px-4 py-3 flex items-center gap-3"
                          style={{ borderBottom: idx === items.length - 1 ? 'none' : `1px solid ${colors.border}` }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: colors.textPrimary }}>{ins.nombre}</p>
                            <p className="text-xs" style={{ color: colors.textMuted }}>{ins.stock_actual ?? '—'} {ins.unidad}</p>
                          </div>
                          <div className="w-20 flex flex-col gap-1">
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.bg }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: SEM[niv] }} />
                            </div>
                            <p className="text-[10px] text-right" style={{ color: colors.textMuted }}>mín {ins.stock_minimo ?? '—'}</p>
                          </div>
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
                <div className="flex gap-1.5">
                  {PERIODOS_TRZ.map(p => (
                    <button key={p} onClick={() => setFiltroPeriodo(p)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all duration-150 border"
                      style={{
                        backgroundColor: filtroPeriodo === p ? colors.brand : 'transparent',
                        borderColor: filtroPeriodo === p ? colors.brand : colors.border,
                        color: filtroPeriodo === p ? 'white' : colors.textSecondary,
                      }}>
                      {p === 'semana' ? 'Semana' : p === 'mes' ? 'Mes' : 'Todo'}
                    </button>
                  ))}
                </div>
                <select value={filtroDestino} onChange={e => setFiltroDestino(e.target.value)}
                  className="ml-auto text-xs py-1.5 px-3 transition"
                  style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, outline: 'none', color: colors.textSecondary, backgroundColor: colors.surface }}>
                  <option value="Todos">Todos los destinos</option>
                  {DESTINOS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              {egresos.length === 0 ? (
                <EmptyState icon={Warehouse} title="Sin egresos en este período" />
              ) : (
                <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px]">
                      <thead>
                        <tr style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                          {['Fecha', 'Producto', 'Marca', 'Present.', 'Cant.', 'Lote', 'Venc.', 'Controló', 'Observ.', 'Destino'].map(h => (
                            <th key={h} className="py-2.5 px-3 text-left font-semibold uppercase whitespace-nowrap" style={{ fontSize: 10, color: colors.textMuted, letterSpacing: '0.06em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {egresos.map(e => (
                          <tr key={e.id} style={{ borderBottom: `1px solid ${colors.border}` }}
                            onMouseEnter={ev => { ev.currentTarget.style.backgroundColor = colors.bg }}
                            onMouseLeave={ev => { ev.currentTarget.style.backgroundColor = '' }}>
                            <td className="py-2 px-3 text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{e.fecha}</td>
                            <td className="py-2 px-3 text-xs font-medium" style={{ color: colors.textPrimary }}>{e.producto_nombre}</td>
                            <td className="py-2 px-3 text-xs" style={{ color: colors.textSecondary }}>{e.marca || '—'}</td>
                            <td className="py-2 px-3 text-xs" style={{ color: colors.textSecondary }}>{e.presentacion || '—'}</td>
                            <td className="py-2 px-3 text-xs font-bold text-right" style={{ color: colors.textPrimary }}>{e.cantidad}</td>
                            <td className="py-2 px-3 text-xs" style={{ color: colors.textSecondary }}>{e.lote || '—'}</td>
                            <td className="py-2 px-3 text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{e.fecha_vencimiento || '—'}</td>
                            <td className="py-2 px-3 text-xs" style={{ color: colors.textSecondary }}>{e.controlo || '—'}</td>
                            <td className="py-2 px-3 text-xs max-w-[100px] truncate" style={{ color: colors.textMuted }}>{e.observaciones || '—'}</td>
                            <td className="py-2 px-3">
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${colors.brand}18`, color: colors.brand }}>{e.destino}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
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
          operarios={operarios}
        />
      )}
    </div>
  )
}
