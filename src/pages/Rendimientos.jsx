import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Badge from '../components/ui/Badge'
import Select from '../components/ui/Select'
import Input from '../components/ui/Input'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import { TrendingUp, Users, Scale, Package, ClipboardCheck, Calendar, Target, Clock } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const TABS = ['Rendimientos', 'Productividad', 'Informe del Día']

// Días de referencia para considerar que una orden se completó "a tiempo".
const DIAS_ESPERADOS = 2

const PERIODOS = [
  { key: 'hoy',    label: 'Hoy',    dias: 0  },
  { key: 'semana', label: 'Semana', dias: 7  },
  { key: 'mes',    label: 'Mes',    dias: 30 },
]
const MEDALLAS = ['🥇', '🥈', '🥉']
const PIE_COLORS = [colors.brand, colors.info, colors.success, colors.warning, colors.danger, '#a21caf', '#0e7490']
const ESTADO_PCT = { completada: 100, en_proceso: 50, pendiente: 0 }

function desdeHace(dias) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString().split('T')[0]
}

function nivel(pct) {
  if (pct >= 75) return { label: 'EXCELENTE', variant: 'success', color: colors.success }
  if (pct >= 50) return { label: 'BUENO',     variant: 'info',    color: colors.info }
  if (pct >= 25) return { label: 'REGULAR',   variant: 'warning', color: colors.warning }
  return               { label: 'BAJO',       variant: 'danger',  color: colors.danger }
}

function pctOrden(estado) {
  return ESTADO_PCT[estado] ?? 0
}

function semaforoPct(pct) {
  if (pct >= 80) return { color: colors.success, bg: colors.successBg }
  if (pct >= 50) return { color: colors.warning, bg: colors.warningBg }
  return { color: colors.danger, bg: colors.dangerBg }
}

function nivelDesempeno(pct) {
  if (pct >= 80) return { label: 'EXCELENTE', variant: 'success', color: colors.success }
  if (pct >= 60) return { label: 'BUENO',     variant: 'info',    color: colors.info }
  if (pct >= 40) return { label: 'REGULAR',   variant: 'warning', color: colors.warning }
  return               { label: 'BAJO',       variant: 'danger',  color: colors.danger }
}

function nivelProductividad(pct) {
  if (pct >= 90) return { label: 'EXCELENTE', variant: 'success', color: colors.success }
  if (pct >= 70) return { label: 'BUENO',     variant: 'info',    color: colors.info }
  if (pct >= 50) return { label: 'REGULAR',   variant: 'warning', color: colors.warning }
  return               { label: 'BAJO',       variant: 'danger',  color: colors.danger }
}

function diffDias(inicio, fin) {
  const a = new Date(inicio)
  const b = new Date(fin)
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)))
}

export default function Rendimientos() {
  const [tab, setTab]           = useState('Rendimientos')
  const [periodo, setPeriodo]   = useState('semana')
  const [filtroOp, setFiltroOp] = useState('Todos')
  const [datos, setDatos]       = useState([])
  const [loading, setLoading]   = useState(true)

  const [fechaInforme, setFechaInforme]         = useState(new Date().toISOString().split('T')[0])
  const [produccionesDia, setProduccionesDia]   = useState([])
  const [categoriaPorCodigo, setCategoriaPorCodigo] = useState({})
  const [ordenesDia, setOrdenesDia]             = useState([])
  const [loadingInforme, setLoadingInforme]     = useState(true)

  const [ordenesProd, setOrdenesProd]   = useState([])
  const [loadingProd, setLoadingProd]   = useState(true)

  useEffect(() => { cargar() }, [periodo])
  useEffect(() => { cargarInforme() }, [fechaInforme])
  useEffect(() => { cargarProductividad() }, [])

  async function cargarProductividad() {
    setLoadingProd(true)
    const { data } = await supabase.from('ordenes_produccion').select('*').neq('estado', 'cancelada')
    setOrdenesProd(data || [])
    setLoadingProd(false)
  }

  async function cargar() {
    setLoading(true)
    const p = PERIODOS.find(p => p.key === periodo)
    let q = supabase.from('producciones').select('*').order('fecha', { ascending: false })
    if (p.dias > 0) q = q.gte('fecha', desdeHace(p.dias))
    else q = q.eq('fecha', new Date().toISOString().split('T')[0])
    const { data } = await q
    setDatos(data || [])
    setLoading(false)
  }

  async function cargarInforme() {
    setLoadingInforme(true)
    const [{ data: prods }, { data: productosProd }, { data: ords }] = await Promise.all([
      supabase.from('producciones').select('*').eq('fecha', fechaInforme).order('created_at', { ascending: true }),
      supabase.from('productos_produccion').select('codigo,categoria'),
      supabase.from('ordenes_produccion').select('*').eq('fecha_produccion', fechaInforme),
    ])
    setProduccionesDia(prods || [])
    setCategoriaPorCodigo(Object.fromEntries((productosProd || []).map(p => [p.codigo, p.categoria || 'OTRO'])))
    setOrdenesDia((ords || []).filter(o => o.estado !== 'cancelada'))
    setLoadingInforme(false)
  }

  const opcionesOps = useMemo(() => {
    const set = new Set(datos.map(d => d.operario_nombre).filter(Boolean))
    return ['Todos', ...Array.from(set).sort()]
  }, [datos])

  const filtrado = useMemo(() => (
    filtroOp === 'Todos' ? datos : datos.filter(d => d.operario_nombre === filtroOp)
  ), [datos, filtroOp])

  const porOperario = useMemo(() => {
    const mapa = {}
    filtrado.forEach(r => {
      const op = r.operario_nombre || 'Sin asignar'
      if (!mapa[op]) mapa[op] = { nombre: op, unidades: 0, kg: 0, prods: {} }
      mapa[op].unidades++
      mapa[op].kg += r.peso_kg || 0
      mapa[op].prods[r.producto_nombre] = (mapa[op].prods[r.producto_nombre] || 0) + 1
    })
    return Object.values(mapa).sort((a, b) => b.kg - a.kg)
  }, [filtrado])

  const maxKg   = porOperario[0]?.kg || 1
  const totalKg = porOperario.reduce((a, o) => a + o.kg, 0)
  const podio   = porOperario.slice(0, 3)
  const resto   = porOperario.slice(3)

  const kpiInforme = useMemo(() => {
    const unidades = produccionesDia.length
    const kg = produccionesDia.reduce((a, r) => a + (r.peso_kg || 0), 0)
    const operariosActivos = new Set(produccionesDia.map(r => r.operario_nombre).filter(Boolean)).size
    const ordenesCompletadas = ordenesDia.filter(o => o.estado === 'completada').length
    return { unidades, kg, operariosActivos, ordenesCompletadas }
  }, [produccionesDia, ordenesDia])

  const porOperarioKg = useMemo(() => {
    const mapa = {}
    produccionesDia.forEach(r => {
      const op = r.operario_nombre || 'Sin asignar'
      mapa[op] = (mapa[op] || 0) + (r.peso_kg || 0)
    })
    return Object.entries(mapa)
      .map(([nombre, kg]) => ({ nombre, kg: Number(kg.toFixed(2)) }))
      .sort((a, b) => b.kg - a.kg)
  }, [produccionesDia])

  const porTipoProducto = useMemo(() => {
    const mapa = {}
    produccionesDia.forEach(r => {
      const tipo = categoriaPorCodigo[r.producto_codigo] || 'OTRO'
      mapa[tipo] = (mapa[tipo] || 0) + 1
    })
    return Object.entries(mapa).map(([name, value]) => ({ name, value }))
  }, [produccionesDia, categoriaPorCodigo])

  const informePorOperario = useMemo(() => {
    const nombres = new Set()
    produccionesDia.forEach(r => { if (r.operario_nombre) nombres.add(r.operario_nombre) })
    ordenesDia.forEach(o => { if (o.operario_nombre) nombres.add(o.operario_nombre) })

    return Array.from(nombres).map(nombre => {
      const prods = produccionesDia.filter(r => r.operario_nombre === nombre)
      const ordenes = ordenesDia.filter(o => o.operario_nombre === nombre)
      const kg = prods.reduce((a, r) => a + (r.peso_kg || 0), 0)
      const unidades = prods.length
      const finalizadas = ordenes.filter(o => o.estado === 'completada').length
      const totales = ordenes.length
      const pct = totales === 0 ? 100 : (finalizadas / totales) * 100
      return { nombre, kg, unidades, finalizadas, totales, pct }
    }).sort((a, b) => b.kg - a.kg)
  }, [produccionesDia, ordenesDia])

  const evaluacion = useMemo(() => {
    if (ordenesDia.length === 0) return { global: null, porOperario: [] }
    const global = ordenesDia.reduce((a, o) => a + pctOrden(o.estado), 0) / ordenesDia.length
    const mapa = {}
    ordenesDia.forEach(o => {
      const op = o.operario_nombre || 'Sin asignar'
      if (!mapa[op]) mapa[op] = { nombre: op, total: 0, suma: 0 }
      mapa[op].total++
      mapa[op].suma += pctOrden(o.estado)
    })
    const porOp = Object.values(mapa)
      .map(o => ({ nombre: o.nombre, pct: o.suma / o.total }))
      .sort((a, b) => b.pct - a.pct)
    return { global, porOperario: porOp }
  }, [ordenesDia])

  const productividad = useMemo(() => {
    const mapa = {}
    ordenesProd.forEach(o => {
      const op = o.operario_nombre || 'Sin asignar'
      if (!mapa[op]) mapa[op] = { nombre: op, asignadas: 0, completadas: 0, kgPedido: 0, kgProducido: 0, dias: [] }
      mapa[op].asignadas++
      if (o.estado === 'completada') mapa[op].completadas++
      mapa[op].kgPedido += o.kg_objetivo || 0
      mapa[op].kgProducido += o.kg_producido || 0
      if (o.fecha_inicio && o.fecha_fin) mapa[op].dias.push(diffDias(o.fecha_inicio, o.fecha_fin))
    })
    return Object.values(mapa).map(o => {
      const pctCumplimiento = o.kgPedido > 0 ? (o.kgProducido / o.kgPedido) * 100 : 0
      const tiempoPromedio = o.dias.length > 0 ? o.dias.reduce((a, b) => a + b, 0) / o.dias.length : null
      const factorTiempo = tiempoPromedio ? Math.min(1, DIAS_ESPERADOS / tiempoPromedio) : 1
      const pctAjustado = Math.min(100, pctCumplimiento * factorTiempo)
      return { ...o, pctCumplimiento, tiempoPromedio, pctAjustado }
    }).sort((a, b) => b.pctAjustado - a.pctAjustado)
  }, [ordenesProd])

  const productividadKpis = useMemo(() => {
    const conPedido = productividad.filter(o => o.kgPedido > 0)
    const cumplimientoProm = conPedido.length > 0
      ? conPedido.reduce((a, o) => a + o.pctCumplimiento, 0) / conPedido.length : 0
    const ajustadoProm = conPedido.length > 0
      ? conPedido.reduce((a, o) => a + o.pctAjustado, 0) / conPedido.length : 0
    const totalAsignadas  = productividad.reduce((a, o) => a + o.asignadas, 0)
    const totalCompletadas = productividad.reduce((a, o) => a + o.completadas, 0)
    return { cumplimientoProm, ajustadoProm, totalAsignadas, totalCompletadas }
  }, [productividad])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Rendimientos</h1>
        <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Performance por operario</p>
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

      {tab === 'Rendimientos' && (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Total unidades"    value={loading ? '—' : filtrado.length}    icon={Package} />
        <KpiCard label="Total KG"          value={loading ? '—' : totalKg.toFixed(1)} icon={Scale} />
        <KpiCard label="Operarios activos" value={loading ? '—' : porOperario.length} icon={Users} color={colors.brand} />
      </div>

      <div className="p-3 flex flex-wrap gap-2 items-center" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
        <div className="flex gap-1.5">
          {PERIODOS.map(p => (
            <button key={p.key} onClick={() => setPeriodo(p.key)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border"
              style={{
                backgroundColor: periodo === p.key ? colors.brand : 'transparent',
                borderColor: periodo === p.key ? colors.brand : colors.border,
                color: periodo === p.key ? 'white' : colors.textSecondary,
              }}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="ml-auto w-48">
          <Select value={filtroOp} onChange={e => setFiltroOp(e.target.value)}>
            {opcionesOps.map(o => <option key={o}>{o}</option>)}
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-14"><Spinner size={28} /></div>
      ) : porOperario.length === 0 ? (
        <EmptyState icon={TrendingUp} title="Sin datos en este período" subtitle="Registrá producciones para ver rendimientos" />
      ) : (
        <>
          {/* Podio top 3 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {podio.map((op, i) => {
              const pctVsMejor = (op.kg / maxKg) * 100
              const n = nivel(pctVsMejor)
              const topProds = Object.entries(op.prods).sort((a, b) => b[1] - a[1]).slice(0, 2)
              return (
                <div key={op.nombre} className="p-5 text-center flex flex-col items-center"
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: radius.lg,
                    border: i === 0 ? `2px solid ${colors.brand}` : `1px solid ${colors.border}`,
                    boxShadow: i === 0 ? `0 0 0 3px ${colors.brand}1a, ${shadow.sm}` : shadow.sm,
                  }}>
                  <span className="text-4xl mb-2">{MEDALLAS[i]}</span>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center font-extrabold text-xl mb-2"
                    style={{ backgroundColor: `${colors.brand}18`, color: colors.brand }}>
                    {op.nombre.charAt(0)}
                  </div>
                  <p className="font-bold text-sm" style={{ color: colors.textPrimary }}>{op.nombre}</p>
                  <p className="text-2xl font-extrabold mt-1" style={{ color: colors.brand }}>{op.kg.toFixed(1)} kg</p>
                  <p className="text-xs mb-2" style={{ color: colors.textMuted }}>{op.unidades} unidades</p>
                  <Badge variant={n.variant}>{n.label}</Badge>
                  <div className="h-1.5 w-full rounded-full overflow-hidden mt-3" style={{ backgroundColor: colors.bg }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctVsMejor}%`, backgroundColor: n.color }} />
                  </div>
                  {topProds.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap justify-center mt-3">
                      {topProds.map(([nombre, cnt]) => (
                        <span key={nombre} className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.bg, color: colors.textSecondary }}>
                          {nombre} ×{cnt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Resto en tabla */}
          {resto.length > 0 && (
            <div style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm, overflow: 'hidden' }}>
              <Table>
                <Thead>
                  <Tr>
                    <Th>#</Th>
                    <Th>Operario</Th>
                    <Th>Unidades</Th>
                    <Th>KG</Th>
                    <Th>vs. mejor</Th>
                    <Th>Nivel</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {resto.map((op, idx) => {
                    const pctVsMejor = (op.kg / maxKg) * 100
                    const n = nivel(pctVsMejor)
                    return (
                      <Tr key={op.nombre}>
                        <Td className="font-semibold" style={{ color: colors.textMuted }}>{idx + 4}</Td>
                        <Td className="font-medium">{op.nombre}</Td>
                        <Td>{op.unidades}</Td>
                        <Td>{op.kg.toFixed(2)} kg</Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 rounded-full overflow-hidden" style={{ backgroundColor: colors.bg }}>
                              <div className="h-full rounded-full" style={{ width: `${pctVsMejor}%`, backgroundColor: n.color }} />
                            </div>
                            <span className="text-xs" style={{ color: colors.textMuted }}>{pctVsMejor.toFixed(0)}%</span>
                          </div>
                        </Td>
                        <Td><Badge variant={n.variant}>{n.label}</Badge></Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            </div>
          )}
        </>
      )}
      </>
      )}

      {tab === 'Productividad' && (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Órdenes completadas" value={loadingProd ? '—' : `${productividadKpis.totalCompletadas}/${productividadKpis.totalAsignadas}`} icon={ClipboardCheck} color={colors.brand} />
          <KpiCard label="% cumplimiento prom." value={loadingProd ? '—' : `${productividadKpis.cumplimientoProm.toFixed(0)}%`} icon={Target} color={semaforoPct(productividadKpis.cumplimientoProm).color} />
          <KpiCard label="% ajustado prom." value={loadingProd ? '—' : `${productividadKpis.ajustadoProm.toFixed(0)}%`} icon={Clock} color={nivelProductividad(productividadKpis.ajustadoProm).color} />
          <KpiCard label="Operarios evaluados" value={loadingProd ? '—' : productividad.length} icon={Users} />
        </div>

        {loadingProd ? (
          <div className="flex justify-center py-14"><Spinner size={28} /></div>
        ) : productividad.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Sin órdenes registradas" subtitle="Creá órdenes de producción para ver la productividad por operario" />
        ) : (
          <div style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm, overflow: 'hidden' }}>
            <Table className="min-w-[820px]">
              <Thead>
                <Tr>
                  <Th>Operario</Th>
                  <Th>Órdenes (compl./asign.)</Th>
                  <Th>Kg pedidos</Th>
                  <Th>Kg producidos</Th>
                  <Th>% Cumplimiento</Th>
                  <Th>Tiempo prom.</Th>
                  <Th>% Ajustado</Th>
                  <Th>Nivel</Th>
                </Tr>
              </Thead>
              <Tbody>
                {productividad.map(op => {
                  const n = nivelProductividad(op.pctAjustado)
                  return (
                    <Tr key={op.nombre}>
                      <Td className="font-medium">{op.nombre}</Td>
                      <Td>{op.completadas}/{op.asignadas}</Td>
                      <Td className="text-right">{op.kgPedido.toFixed(1)} kg</Td>
                      <Td className="text-right">{op.kgProducido.toFixed(1)} kg</Td>
                      <Td>
                        <span style={{ color: semaforoPct(op.pctCumplimiento).color, fontWeight: 700 }}>
                          {op.pctCumplimiento.toFixed(0)}%
                        </span>
                      </Td>
                      <Td className="text-xs" style={{ color: colors.textMuted }}>
                        {op.tiempoPromedio !== null ? `${op.tiempoPromedio.toFixed(1)} días` : '—'}
                      </Td>
                      <Td>
                        <span style={{ color: n.color, fontWeight: 700 }}>
                          {op.pctAjustado.toFixed(0)}%
                        </span>
                      </Td>
                      <Td><Badge variant={n.variant}>{n.label}</Badge></Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
          </div>
        )}
      </>
      )}

      {tab === 'Informe del Día' && (
      <>
        <div className="p-3 flex flex-wrap gap-2 items-center" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
          <Calendar size={16} style={{ color: colors.textMuted }} />
          <div className="w-44">
            <Input type="date" value={fechaInforme} onChange={e => setFechaInforme(e.target.value)} />
          </div>
        </div>

        {loadingInforme ? (
          <div className="flex justify-center py-14"><Spinner size={28} /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Total unidades"      value={kpiInforme.unidades}          icon={Package} />
              <KpiCard label="Total KG"            value={kpiInforme.kg.toFixed(1)}      icon={Scale} />
              <KpiCard label="Operarios activos"   value={kpiInforme.operariosActivos}  icon={Users} color={colors.brand} />
              <KpiCard label="Órdenes completadas" value={kpiInforme.ordenesCompletadas} icon={ClipboardCheck} color={colors.success} />
            </div>

            {produccionesDia.length === 0 ? (
              <EmptyState icon={Package} title="Sin producción registrada" subtitle="No hay registros de producción para la fecha seleccionada" />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="p-4" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: colors.textPrimary }}>Producción por operario (kg)</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={porOperarioKg}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                      <XAxis dataKey="nombre" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="kg" fill={colors.brand} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="p-4" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: colors.textPrimary }}>Distribución por tipo de producto</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={porTipoProducto} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                        {porTipoProducto.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm, overflow: 'hidden' }}>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Operario</Th>
                    <Th>Producto</Th>
                    <Th>Cantidad</Th>
                    <Th>KG</Th>
                    <Th>Hora</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {produccionesDia.length === 0 ? (
                    <Tr><Td colSpan={5} className="text-center" style={{ color: colors.textMuted }}>Sin registros</Td></Tr>
                  ) : produccionesDia.map(r => (
                    <Tr key={r.id}>
                      <Td className="font-medium">{r.operario_nombre || '—'}</Td>
                      <Td>{r.producto_nombre}</Td>
                      <Td>1</Td>
                      <Td>{r.peso_kg} kg</Td>
                      <Td>{new Date(r.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>

            <div className="p-5" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: colors.textPrimary }}>Desempeño por operario</h3>
              {informePorOperario.length === 0 ? (
                <p className="text-sm" style={{ color: colors.textMuted }}>Sin actividad registrada para esta fecha</p>
              ) : (
                <>
                  {evaluacion.global !== null && (
                    <div className="flex items-center gap-3 mb-4">
                      <div className="text-3xl font-extrabold" style={{ color: semaforoPct(evaluacion.global).color }}>
                        {evaluacion.global.toFixed(0)}%
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Cumplimiento global del día</p>
                        <p className="text-xs" style={{ color: colors.textMuted }}>{ordenesDia.length} orden{ordenesDia.length !== 1 ? 'es' : ''}</p>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {informePorOperario.map(op => {
                      const n = nivelDesempeno(op.pct)
                      return (
                        <div key={op.nombre} className="p-4 flex flex-col gap-3"
                          style={{ backgroundColor: colors.bg, borderRadius: radius.md, border: `1px solid ${colors.border}` }}>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0"
                              style={{ backgroundColor: `${colors.brand}18`, color: colors.brand }}>
                              {op.nombre.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-sm truncate" style={{ color: colors.textPrimary }}>{op.nombre}</p>
                              <p className="text-xs" style={{ color: colors.textMuted }}>{op.kg.toFixed(2)} kg · {op.unidades} unidad{op.unidades !== 1 ? 'es' : ''}</p>
                            </div>
                            <Badge variant={n.variant}>{n.label}</Badge>
                          </div>
                          <div>
                            <div className="flex items-center justify-between text-xs mb-1" style={{ color: colors.textMuted }}>
                              <span>{op.totales === 0 ? 'Sin órdenes asignadas' : `Órdenes: ${op.finalizadas}/${op.totales} finalizadas`}</span>
                              <span style={{ color: n.color, fontWeight: 700 }}>{op.pct.toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: colors.surface }}>
                              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${op.pct}%`, backgroundColor: n.color }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </>
      )}
    </div>
  )
}
