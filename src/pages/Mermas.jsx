import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useUser } from '../context/UserContext'
import { deduplicarOperarios } from '../lib/operarios'
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
import { TrendingDown, Plus, DollarSign, User } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const TABS   = ['Por Sabor', 'Por Operario', 'Por Causa', 'Historial']
const CAUSAS = [
  'Derrame accidental', 'Falla de equipo', 'Producto fuera de norma',
  'Vencimiento', 'Error de pesaje', 'Limpieza de línea', 'Otra',
]

function OrigenBadge({ causa }) {
  const c = causa || ''
  if (c.includes('base→sabor'))
    return <Badge variant="info" className="whitespace-nowrap">BASE→SABOR</Badge>
  if (CAUSAS.some(m => c.includes(m)))
    return <Badge variant="neutral">MANUAL</Badge>
  return <Badge variant="success">AUTO</Badge>
}

const TIPO_PRECIOS = {
  Lisa:           { costo_kg: 1200, precio_kg: 2800 },
  'Con Agregado': { costo_kg: 1500, precio_kg: 3200 },
  Agua:           { costo_kg:  900, precio_kg: 2200 },
  Especial:       { costo_kg: 2000, precio_kg: 4500 },
}

const textareaClass = 'w-full rounded-lg border border-[#334155] text-sm text-[#F1F5F9] placeholder:text-[#64748B] bg-[#0F172A] outline-none transition-colors duration-150 px-3 py-2 resize-none focus:ring-2 focus:ring-[#D4521A]/25 focus:border-[#D4521A]'

function pctColor(pct) {
  if (pct < 3)  return colors.success
  if (pct < 8)  return colors.warning
  return colors.danger
}

function pctVariant(pct) {
  if (pct < 3)  return 'success'
  if (pct < 8)  return 'warning'
  return 'danger'
}

function pesos(n) { return Math.round(n || 0).toLocaleString('es-AR') }

// Las mermas automáticas guardan el número de orden en "observaciones" como "Orden <numero>".
function ordenNumero(m) {
  const match = (m.observaciones || '').match(/^Orden (.+)$/)
  return match ? match[1] : '—'
}

function AgrupacionList({ filas }) {
  if (filas.length === 0) return <EmptyState icon={TrendingDown} title="Sin datos" subtitle="Registrá mermas para ver el análisis" />
  return (
    <div className="space-y-2">
      {filas.map(f => (
        <div key={f.nombre} className="p-4 flex items-center gap-3" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: pctColor(f.pct) }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>{f.nombre}</p>
            <p className="text-xs" style={{ color: colors.textMuted }}>{f.cnt} registro{f.cnt !== 1 ? 's' : ''} · {f.teo.toFixed(1)} kg teóricos</p>
          </div>
          <span className="text-sm font-bold flex-shrink-0" style={{ color: colors.danger }}>{f.dif.toFixed(2)} kg</span>
          <Badge variant={pctVariant(f.pct)}>{f.pct.toFixed(1)}%</Badge>
        </div>
      ))}
    </div>
  )
}

export default function Mermas() {
  const { isAdmin, user } = useUser()
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
      supabase.from('stock_camaras').select('id,nombre,tipo,costo_kg').order('nombre'),
      supabase.from('operarios').select('*').order('nombre'),
    ])
    setMermas(m || [])
    setSabores(s || [])
    setOperarios(deduplicarOperarios(o))
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
      operario_nombre: (form.operario_nombre || '').toUpperCase() || null,
      kg_teoricos: t, kg_reales: r, diferencia: dif, porcentaje: pct,
      causa: form.causa, observaciones: form.observaciones || null,
      usuario_email: user?.email || null,
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

  const costoKgPorSabor = useMemo(() => {
    const m = {}
    sabores.forEach(s => {
      const costo = s.costo_kg ?? TIPO_PRECIOS[s.tipo]?.costo_kg ?? 0
      m[(s.nombre || '').trim().toLowerCase()] = costo
    })
    return m
  }, [sabores])

  function costoMerma(m) {
    const costoKg = costoKgPorSabor[(m.sabor_nombre || '').trim().toLowerCase()] || 0
    return (m.diferencia || 0) * costoKg
  }

  const porSabor    = useMemo(() => agrupar(r => r.sabor_nombre),    [mermas])
  const porOperario = useMemo(() => agrupar(r => r.operario_nombre), [mermas])
  const porCausa    = useMemo(() => {
    const m = {}
    mermas.forEach(r => {
      const k = r.causa || 'Sin especificar'
      if (!m[k]) m[k] = { causa: k, dif: 0, costo: 0, cnt: 0 }
      m[k].dif += r.diferencia || 0
      m[k].costo += costoMerma(r)
      m[k].cnt++
    })
    return Object.values(m).sort((a, b) => b.dif - a.dif)
  }, [mermas, costoKgPorSabor])

  const totalDif  = mermas.reduce((a, m) => a + (m.diferencia || 0), 0)
  const totalTeo  = mermas.reduce((a, m) => a + (m.kg_teoricos || 0), 0)
  const pctGlobal = totalTeo > 0 ? (totalDif / totalTeo) * 100 : 0
  const totalCostoMermas = useMemo(() => (
    mermas.reduce((a, m) => a + costoMerma(m), 0)
  ), [mermas, costoKgPorSabor])

  const mermaDelMes = useMemo(() => {
    const ahora = new Date()
    const ym = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
    return mermas.filter(m => (m.fecha || '').startsWith(ym)).reduce((a, m) => a + (m.diferencia || 0), 0)
  }, [mermas])

  const operarioMasMerma = useMemo(() => {
    if (porOperario.length === 0) return null
    return [...porOperario].sort((a, b) => b.dif - a.dif)[0]
  }, [porOperario])

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Mermas</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Tolerancia: &lt;3% verde · 3-8% amarillo · &gt;8% rojo</p>
        </div>
        <Button variant="primary" onClick={() => setModal(true)}>
          <Plus size={15} /> Registrar
        </Button>
      </div>

      <div className={`grid grid-cols-2 sm:grid-cols-3 ${isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3`}>
        <KpiCard label="KG perdidos" value={loading ? '—' : totalDif.toFixed(1)} color={totalDif > 0 ? colors.danger : undefined} icon={TrendingDown} />
        <KpiCard label="KG merma del mes" value={loading ? '—' : mermaDelMes.toFixed(1)} color={mermaDelMes > 0 ? colors.danger : undefined} icon={TrendingDown} />
        <KpiCard label="% global"    value={loading ? '—' : pctGlobal.toFixed(1) + '%'} color={pctColor(pctGlobal)} />
        <KpiCard label="Operario con más merma"
          value={loading ? '—' : (operarioMasMerma?.nombre || '—')}
          sub={operarioMasMerma ? `${operarioMasMerma.dif.toFixed(1)} kg perdidos` : undefined}
          icon={User} />
        {isAdmin && (
          <KpiCard label="Costo total mermas" value={loading ? '—' : `$${pesos(totalCostoMermas)}`} color={colors.danger} icon={DollarSign} />
        )}
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
          {tab === 'Por Sabor'    && <AgrupacionList filas={porSabor} />}
          {tab === 'Por Operario' && <AgrupacionList filas={porOperario} />}

          {tab === 'Por Causa' && (
            porCausa.length === 0
              ? <EmptyState icon={TrendingDown} title="Sin registros" />
              : (
                <div className="space-y-3">
                  <div className="p-4" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={porCausa} margin={{ top: 8, right: 8, left: -16, bottom: 48 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                        <XAxis dataKey="causa" tick={{ fontSize: 10, fill: colors.textMuted }} angle={-30} textAnchor="end" interval={0} height={70} />
                        <YAxis tick={{ fontSize: 11, fill: colors.textMuted }} />
                        <Tooltip
                          contentStyle={{ borderRadius: radius.md, border: `1px solid ${colors.border}`, fontSize: 12 }}
                          formatter={v => [`${Number(v).toFixed(2)} kg`, 'Pérdida']}
                        />
                        <Bar dataKey="dif" radius={[6, 6, 0, 0]}>
                          {porCausa.map((_, i) => <Cell key={i} fill={colors.danger} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>Causa</Th>
                          <Th>Registros</Th>
                          <Th>KG perdidos</Th>
                          <Th>% del total</Th>
                          <Th>Costo total</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {porCausa.map(c => (
                          <Tr key={c.causa}>
                            <Td className="font-medium">{c.causa}</Td>
                            <Td>{c.cnt}</Td>
                            <Td className="font-bold" style={{ color: colors.danger }}>{c.dif.toFixed(2)} kg</Td>
                            <Td>{totalDif > 0 ? ((c.dif / totalDif) * 100).toFixed(1) : '0.0'}%</Td>
                            <Td className="font-semibold" style={{ color: colors.danger }}>${pesos(c.costo)}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </div>
                </div>
              )
          )}

          {tab === 'Historial' && (
            mermas.length === 0
              ? <EmptyState icon={TrendingDown} title="Sin historial" subtitle="Los registros aparecen aquí" />
              : (
                <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <Table className="min-w-[760px]">
                    <Thead>
                      <Tr>
                        <Th>Fecha</Th>
                        <Th>Orden N°</Th>
                        <Th>Producto</Th>
                        <Th>Operario</Th>
                        <Th>Kg Teórico</Th>
                        <Th>Kg Real</Th>
                        <Th>Diferencia</Th>
                        <Th>% Merma</Th>
                        <Th>Costo merma $</Th>
                        <Th>Causa</Th>
                        <Th>Origen</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {mermas.map(m => (
                        <Tr key={m.id}>
                          <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{m.fecha}</Td>
                          <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{ordenNumero(m)}</Td>
                          <Td className="font-medium">{m.sabor_nombre}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{m.operario_nombre || '—'}</Td>
                          <Td className="text-xs text-right" style={{ color: colors.textSecondary }}>{m.kg_teoricos}</Td>
                          <Td className="text-xs text-right" style={{ color: colors.textSecondary }}>{m.kg_reales}</Td>
                          <Td className="font-semibold text-right" style={{ color: colors.danger }}>{(m.diferencia || 0).toFixed(2)}</Td>
                          <Td><Badge variant={pctVariant(m.porcentaje || 0)}>{(m.porcentaje || 0).toFixed(1)}%</Badge></Td>
                          <Td className="font-semibold text-right" style={{ color: colors.danger }}>${pesos(costoMerma(m))}</Td>
                          <Td className="text-xs" style={{ color: colors.textMuted }}>{m.causa}</Td>
                          <Td><OrigenBadge causa={m.causa} /></Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
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
          <>
            <Button variant="secondary" onClick={() => setModal(false)} disabled={saving} className="flex-1">
              Cancelar
            </Button>
            <Button variant="primary" onClick={guardar} loading={saving} className="flex-1">
              {saving ? 'Guardando…' : 'Registrar'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha *" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            <div>
              <Input label="Sabor *" type="text" value={form.sabor_nombre} onChange={e => setForm(f => ({ ...f, sabor_nombre: e.target.value }))}
                list="sabores-list" placeholder="Nombre del sabor" />
              <datalist id="sabores-list">{sabores.map(s => <option key={s.id} value={s.nombre} />)}</datalist>
            </div>
          </div>
          <Select label="Operario" value={form.operario_nombre} onChange={e => setForm(f => ({ ...f, operario_nombre: e.target.value }))}>
            <option value="">— Sin asignar —</option>
            {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="KG Teóricos *" type="number" step="0.01" value={form.kg_teoricos} onChange={e => setForm(f => ({ ...f, kg_teoricos: e.target.value }))} />
            <Input label="KG Reales *" type="number" step="0.01" value={form.kg_reales} onChange={e => setForm(f => ({ ...f, kg_reales: e.target.value }))} />
          </div>
          {diferencia && (
            <div className="flex gap-4 px-4 py-2.5" style={{ backgroundColor: colors.bg, borderRadius: radius.md }}>
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
          <Select label="Causa" value={form.causa} onChange={e => setForm(f => ({ ...f, causa: e.target.value }))}>
            {CAUSAS.map(c => <option key={c}>{c}</option>)}
          </Select>
          <div>
            <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Observaciones</label>
            <textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
              rows={2} className={textareaClass} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
