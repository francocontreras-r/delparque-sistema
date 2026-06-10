import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Modal from '../components/ui/Modal'
import { colors, radius, shadow } from '../styles/design-system'
import { TrendingDown, Plus } from 'lucide-react'

const TABS   = ['Por Sabor', 'Por Operario', 'Por Causa', 'Historial']
const CAUSAS = [
  'Derrame accidental', 'Falla de equipo', 'Producto fuera de norma',
  'Vencimiento', 'Error de pesaje', 'Limpieza de línea', 'Otra',
]

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

function pctColor(pct) {
  if (pct < 3)  return colors.success
  if (pct < 8)  return colors.warning
  return colors.danger
}

function PctBadge({ pct }) {
  const c = pctColor(pct)
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: `${c}18`, color: c }}>
      {pct.toFixed(1)}%
    </span>
  )
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>{label}{required && ' *'}</label>
      {children}
    </div>
  )
}

function AgrupacionList({ filas }) {
  if (filas.length === 0) return <EmptyState icon={TrendingDown} title="Sin datos" subtitle="Registrá mermas para ver el análisis" />
  return (
    <div className="space-y-2">
      {filas.map(f => (
        <div key={f.nombre} className="p-4 flex items-center gap-4" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>{f.nombre}</p>
            <p className="text-xs" style={{ color: colors.textMuted }}>{f.cnt} registro{f.cnt !== 1 ? 's' : ''} · {f.teo.toFixed(1)} kg teóricos</p>
          </div>
          <span className="text-sm font-bold" style={{ color: colors.danger }}>{f.dif.toFixed(2)} kg</span>
          <PctBadge pct={f.pct} />
        </div>
      ))}
    </div>
  )
}

export default function Mermas() {
  const [tab, setTab]             = useState('Por Sabor')
  const [mermas, setMermas]       = useState([])
  const [sabores, setSabores]     = useState([])
  const [operarios, setOperarios] = useState([])
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)
  const [modal, setModal]         = useState(false)
  const [saving, setSaving]       = useState(false)
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    sabor_nombre: '', operario_nombre: '',
    kg_teoricos: '', kg_reales: '',
    causa: CAUSAS[0], observaciones: '',
  })

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [{ data: m }, { data: s }, { data: o }] = await Promise.all([
      supabase.from('mermas').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('stock_camaras').select('id,nombre').order('nombre'),
      supabase.from('operarios').select('*').order('nombre'),
    ])
    setMermas(m || [])
    setSabores(s || [])
    setOperarios(o || [])
    setLoading(false)
  }

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const diferencia = useMemo(() => {
    const t = parseFloat(form.kg_teoricos) || 0
    const r = parseFloat(form.kg_reales) || 0
    return t > 0 ? { dif: t - r, pct: ((t - r) / t) * 100 } : null
  }, [form.kg_teoricos, form.kg_reales])

  async function guardar() {
    if (!form.sabor_nombre || !form.kg_teoricos || !form.kg_reales) {
      toast2('Completa los campos obligatorios', 'error'); return
    }
    setSaving(true)
    const t = parseFloat(form.kg_teoricos)
    const r = parseFloat(form.kg_reales)
    const dif = t - r
    const pct = t > 0 ? (dif / t) * 100 : 0
    const { error } = await supabase.from('mermas').insert({
      fecha: form.fecha, sabor_nombre: form.sabor_nombre,
      operario_nombre: form.operario_nombre || null,
      kg_teoricos: t, kg_reales: r, diferencia: dif, porcentaje: pct,
      causa: form.causa, observaciones: form.observaciones || null,
    })
    setSaving(false)
    if (error) { toast2(error.message, 'error'); return }
    toast2('Merma registrada')
    setModal(false)
    setForm(f => ({ ...f, sabor_nombre: '', kg_teoricos: '', kg_reales: '', observaciones: '' }))
    cargar()
  }

  function agrupar(keyFn) {
    const m = {}
    mermas.forEach(r => {
      const k = keyFn(r) || 'Sin especificar'
      if (!m[k]) m[k] = { nombre: k, dif: 0, teo: 0, cnt: 0 }
      m[k].dif += r.diferencia || 0
      m[k].teo += r.kg_teoricos || 0
      m[k].cnt++
    })
    return Object.values(m).map(s => ({ ...s, pct: s.teo > 0 ? (s.dif / s.teo) * 100 : 0 })).sort((a, b) => b.pct - a.pct)
  }

  const porSabor    = useMemo(() => agrupar(r => r.sabor_nombre),    [mermas])
  const porOperario = useMemo(() => agrupar(r => r.operario_nombre), [mermas])
  const porCausa    = useMemo(() => {
    const m = {}
    mermas.forEach(r => {
      const k = r.causa || 'Sin especificar'
      if (!m[k]) m[k] = { causa: k, dif: 0, cnt: 0 }
      m[k].dif += r.diferencia || 0
      m[k].cnt++
    })
    return Object.values(m).sort((a, b) => b.dif - a.dif)
  }, [mermas])

  const totalDif  = mermas.reduce((a, m) => a + (m.diferencia || 0), 0)
  const totalTeo  = mermas.reduce((a, m) => a + (m.kg_teoricos || 0), 0)
  const pctGlobal = totalTeo > 0 ? (totalDif / totalTeo) * 100 : 0

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Mermas</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Tolerancia: &lt;3% verde · 3-8% amarillo · &gt;8% rojo</p>
        </div>
        <button onClick={() => setModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white transition-all"
          style={{ borderRadius: radius.md, backgroundColor: colors.brand }}>
          <Plus size={15} /> Registrar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="KG perdidos" value={loading ? '—' : totalDif.toFixed(1)} color={totalDif > 0 ? colors.danger : undefined} icon={TrendingDown} />
        <KpiCard label="% global"    value={loading ? '—' : pctGlobal.toFixed(1) + '%'} color={pctColor(pctGlobal)} />
        <KpiCard label="Registros"   value={loading ? '—' : mermas.length} />
      </div>

      <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: colors.bg }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 text-xs font-semibold rounded-lg transition-all leading-tight"
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
          {tab === 'Por Sabor'    && <AgrupacionList filas={porSabor} />}
          {tab === 'Por Operario' && <AgrupacionList filas={porOperario} />}

          {tab === 'Por Causa' && (
            porCausa.length === 0
              ? <EmptyState icon={TrendingDown} title="Sin registros" />
              : <div className="space-y-2">
                  {porCausa.map(c => (
                    <div key={c.causa} className="p-4 flex items-center gap-4" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                      <div className="flex-1">
                        <p className="text-sm font-semibold" style={{ color: colors.textPrimary }}>{c.causa}</p>
                        <p className="text-xs" style={{ color: colors.textMuted }}>{c.cnt} registro{c.cnt !== 1 ? 's' : ''}</p>
                      </div>
                      <span className="text-sm font-bold" style={{ color: colors.danger }}>{c.dif.toFixed(2)} kg</span>
                    </div>
                  ))}
                </div>
          )}

          {tab === 'Historial' && (
            mermas.length === 0
              ? <EmptyState icon={TrendingDown} title="Sin historial" subtitle="Los registros aparecen aquí" />
              : (
                <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px]">
                      <thead>
                        <tr style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                          {['Fecha', 'Sabor', 'Operario', 'KG teórico', 'KG real', 'Diferencia', '%', 'Causa'].map(h => (
                            <th key={h} className="py-2.5 px-3 text-left font-semibold uppercase" style={{ fontSize: 10, color: colors.textMuted, letterSpacing: '0.06em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mermas.map(m => (
                          <tr key={m.id} style={{ borderBottom: `1px solid ${colors.border}` }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.bg }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '' }}>
                            <td className="py-2.5 px-3 text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{m.fecha}</td>
                            <td className="py-2.5 px-3 text-xs font-medium" style={{ color: colors.textPrimary }}>{m.sabor_nombre}</td>
                            <td className="py-2.5 px-3 text-xs" style={{ color: colors.textSecondary }}>{m.operario_nombre || '—'}</td>
                            <td className="py-2.5 px-3 text-xs text-right" style={{ color: colors.textSecondary }}>{m.kg_teoricos}</td>
                            <td className="py-2.5 px-3 text-xs text-right" style={{ color: colors.textSecondary }}>{m.kg_reales}</td>
                            <td className="py-2.5 px-3 text-xs font-semibold text-right" style={{ color: colors.danger }}>{(m.diferencia || 0).toFixed(2)}</td>
                            <td className="py-2.5 px-3"><PctBadge pct={m.porcentaje || 0} /></td>
                            <td className="py-2.5 px-3 text-xs" style={{ color: colors.textMuted }}>{m.causa}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
          )}
        </>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Registrar Merma"
        maxWidth="max-w-md"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setModal(false)} disabled={saving}
              className="flex-1 py-2.5 text-sm font-medium transition-colors"
              style={{ borderRadius: radius.md, border: `1px solid ${colors.border}`, color: colors.textSecondary, backgroundColor: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.bg }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}>
              Cancelar
            </button>
            <button onClick={guardar} disabled={saving}
              className="flex-1 py-2.5 text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
              style={{ borderRadius: radius.md, backgroundColor: colors.brand }}>
              {saving && <Spinner size={14} />}
              {saving ? 'Guardando…' : 'Registrar'}
            </button>
          </div>
        }
      >
        <div className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha" required>
              <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} style={fieldStyle} />
            </Field>
            <Field label="Sabor" required>
              <input type="text" value={form.sabor_nombre} onChange={e => setForm(f => ({ ...f, sabor_nombre: e.target.value }))}
                list="sabores-list" placeholder="Nombre del sabor" style={fieldStyle} />
              <datalist id="sabores-list">{sabores.map(s => <option key={s.id} value={s.nombre} />)}</datalist>
            </Field>
          </div>
          <Field label="Operario">
            <select value={form.operario_nombre} onChange={e => setForm(f => ({ ...f, operario_nombre: e.target.value }))} style={fieldStyle}>
              <option value="">— Sin asignar —</option>
              {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="KG Teóricos" required>
              <input type="number" step="0.01" value={form.kg_teoricos} onChange={e => setForm(f => ({ ...f, kg_teoricos: e.target.value }))} style={fieldStyle} />
            </Field>
            <Field label="KG Reales" required>
              <input type="number" step="0.01" value={form.kg_reales} onChange={e => setForm(f => ({ ...f, kg_reales: e.target.value }))} style={fieldStyle} />
            </Field>
          </div>
          {diferencia && (
            <div className="flex gap-4 rounded-lg px-4 py-2.5" style={{ backgroundColor: colors.bg, borderRadius: radius.md }}>
              <div className="text-center flex-1">
                <p className="text-xs" style={{ color: colors.textMuted }}>Diferencia</p>
                <p className="text-sm font-bold" style={{ color: colors.danger }}>{diferencia.dif.toFixed(2)} kg</p>
              </div>
              <div className="text-center flex-1">
                <p className="text-xs" style={{ color: colors.textMuted }}>Porcentaje</p>
                <p className="text-sm font-bold" style={{ color: pctColor(diferencia.pct) }}>{diferencia.pct.toFixed(1)}%</p>
              </div>
            </div>
          )}
          <Field label="Causa">
            <select value={form.causa} onChange={e => setForm(f => ({ ...f, causa: e.target.value }))} style={fieldStyle}>
              {CAUSAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Observaciones">
            <textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
              rows={2} style={{ ...fieldStyle, resize: 'none' }} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
