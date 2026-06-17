import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import { DollarSign, RefreshCw, Warehouse, Thermometer, Percent, TrendingUp, TrendingDown, Clock } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const TABS = ['Costos', 'Márgenes', 'Resumen']
const PIE_COLORS = [colors.brand, colors.info, colors.success, colors.warning, colors.danger, '#a21caf', '#0e7490']

const TIPO_PRECIOS = {
  Lisa:           { costo_kg: 1200, precio_kg: 2800 },
  'Con Agregado': { costo_kg: 1500, precio_kg: 3200 },
  Agua:           { costo_kg:  900, precio_kg: 2200 },
  Especial:       { costo_kg: 2000, precio_kg: 4500 },
}

const SURFACE = { backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }

const numInputClass = 'w-24 text-right rounded-md border border-[#d1d5db] text-sm px-2 py-1 outline-none focus:ring-2 focus:ring-[#D4521A]/30 focus:border-[#D4521A]'

function pesos(n) { return Math.round(n || 0).toLocaleString('es-AR') }

function margenPct(costo, precio) {
  if (!precio) return 0
  return ((precio - costo) / precio) * 100
}

function margenColor(pct) {
  if (pct > 40) return colors.success
  if (pct >= 20) return colors.warning
  return colors.danger
}

function margenVariant(pct) {
  if (pct > 40) return 'success'
  if (pct >= 20) return 'warning'
  return 'danger'
}

function DiffBadge({ actual, anterior }) {
  if (anterior == null || anterior === actual) return null
  const delta = actual - anterior
  const pct = anterior > 0 ? Math.abs(delta / anterior) * 100 : 0
  const sube = delta > 0
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-1"
      style={{ backgroundColor: sube ? '#fef2f2' : '#f0fdf4', color: sube ? colors.danger : colors.success }}>
      {sube ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {pct.toFixed(0)}%
    </span>
  )
}

function EditableNumber({ value, onCommit }) {
  const [val, setVal] = useState(value ?? 0)
  useEffect(() => { setVal(value ?? 0) }, [value])
  return (
    <input
      type="number" min="0" step="0.01" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => onCommit(val)}
      className={numInputClass}
    />
  )
}

export default function Finanzas() {
  const [tab, setTab] = useState('Costos')
  const [sabores, setSabores] = useState([])
  const [saborIngredientes, setSaborIngredientes] = useState([])
  const [impulsivos, setImpulsivos] = useState([])
  const [impulsivoIngredientes, setImpulsivoIngredientes] = useState([])
  const [insumos, setInsumos] = useState([])
  const [stockCamaras, setStockCamaras] = useState([])
  const [loading, setLoading] = useState(true)
  const [recalculando, setRecalculando] = useState(false)
  const [toast, setToast] = useState(null)
  const [prevSnapshot, setPrevSnapshot] = useState(null)   // { [key]: { costo_total, margen } }
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [
      { data: sab }, { data: sabIng },
      { data: imp }, { data: impIng },
      { data: ins }, { data: cam },
    ] = await Promise.all([
      supabase.from('sabores').select('*').order('nombre'),
      supabase.from('sabor_ingredientes').select('*'),
      supabase.from('impulsivos').select('*').order('nombre'),
      supabase.from('impulsivo_ingredientes').select('*'),
      supabase.from('insumos').select('nombre,costo_unitario,stock_actual'),
      supabase.from('stock_camaras').select('*'),
    ])
    setSabores(sab || [])
    setSaborIngredientes(sabIng || [])
    setImpulsivos(imp || [])
    setImpulsivoIngredientes(impIng || [])
    setInsumos(ins || [])
    setStockCamaras(cam || [])
    setLoading(false)
  }

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const insumoPorNombre = useMemo(() => {
    const m = {}
    insumos.forEach(i => { m[(i.nombre || '').trim().toLowerCase()] = i })
    return m
  }, [insumos])

  const productos = useMemo(() => {
    const a = sabores.map(s => ({
      key: `sabor-${s.id}`, id: s.id, tabla: 'sabores', tipo: 'Helado', nombre: s.nombre,
      costo_materiales: s.costo_materiales || 0,
      mano_de_obra: s.mano_de_obra || 0,
      costo_total: s.costo_total || 0,
      precio_venta: s.precio_venta || 0,
    }))
    const b = impulsivos.map(i => ({
      key: `impulsivo-${i.id}`, id: i.id, tabla: 'impulsivos', tipo: 'Impulsivo/Postre', nombre: i.nombre,
      costo_materiales: i.costo_materiales || 0,
      mano_de_obra: i.mano_de_obra || 0,
      costo_total: i.costo_total || 0,
      precio_venta: i.precio_venta || 0,
    }))
    return [...a, ...b].sort((x, y) => x.nombre.localeCompare(y.nombre))
  }, [sabores, impulsivos])

  async function actualizarCampo(producto, campo, valor) {
    const num = parseFloat(valor) || 0
    const updates = { [campo]: num }
    if (campo === 'mano_de_obra') updates.costo_total = (producto.costo_materiales || 0) + num
    const { error } = await supabase.from(producto.tabla).update(updates).eq('id', producto.id)
    if (error) { toast2(error.message, 'error'); return }
    if (producto.tabla === 'sabores') {
      setSabores(prev => prev.map(s => s.id === producto.id ? { ...s, ...updates } : s))
    } else {
      setImpulsivos(prev => prev.map(i => i.id === producto.id ? { ...i, ...updates } : i))
    }
  }

  function calcCostoIngredientes(ingredientes) {
    return ingredientes.reduce((acc, ing) => {
      const insumo = insumoPorNombre[(ing.insumo_nombre || '').trim().toLowerCase()]
      const costoUnit = insumo?.costo_unitario ?? ing.costo_unitario ?? 0
      return acc + (ing.cantidad || 0) * costoUnit
    }, 0)
  }

  async function recalcularTodos() {
    setRecalculando(true)

    // Snapshot ANTES de recalcular
    const snap = {}
    productos.forEach(p => {
      snap[p.key] = {
        costo_total: p.costo_total,
        margen: margenPct(p.costo_total, p.precio_venta),
      }
    })

    for (const s of sabores) {
      const ingredientes = saborIngredientes.filter(si => si.sabor_id === s.id)
      const costoMat = calcCostoIngredientes(ingredientes)
      const costoTotal = costoMat + (s.mano_de_obra || 0)
      await supabase.from('sabores').update({ costo_materiales: costoMat, costo_total: costoTotal }).eq('id', s.id)
    }
    for (const i of impulsivos) {
      const ingredientes = impulsivoIngredientes.filter(ii => ii.impulsivo_id === i.id)
      const costoMat = calcCostoIngredientes(ingredientes)
      const costoTotal = costoMat + (i.mano_de_obra || 0)
      await supabase.from('impulsivos').update({ costo_materiales: costoMat, costo_total: costoTotal }).eq('id', i.id)
    }

    await cargar()
    setPrevSnapshot(snap)
    setLastUpdated(new Date())
    setRecalculando(false)
    toast2('Costos actualizados desde ingredientes × precios del depósito')
  }

  const margenes = useMemo(() => productos.map(p => ({
    ...p,
    ganancia: (p.precio_venta || 0) - (p.costo_total || 0),
    margen: margenPct(p.costo_total, p.precio_venta),
  })), [productos])

  const top10Margen = useMemo(() => (
    [...margenes].filter(p => p.precio_venta > 0).sort((a, b) => b.margen - a.margen).slice(0, 10)
  ), [margenes])

  const valorDeposito = useMemo(() => (
    insumos.reduce((acc, i) => acc + (i.stock_actual || 0) * (i.costo_unitario || 0), 0)
  ), [insumos])

  const valorCamaras = useMemo(() => (
    stockCamaras.reduce((acc, c) => {
      const costoKg = c.costo_kg ?? TIPO_PRECIOS[c.tipo]?.costo_kg ?? 0
      return acc + (c.kg || 0) * costoKg
    }, 0)
  ), [stockCamaras])

  const margenPromedio = useMemo(() => {
    const conPrecio = margenes.filter(p => p.precio_venta > 0)
    if (conPrecio.length === 0) return 0
    return conPrecio.reduce((a, p) => a + p.margen, 0) / conPrecio.length
  }, [margenes])

  const distribucionCostos = useMemo(() => {
    const totalMP = productos.reduce((a, p) => a + (p.costo_materiales || 0), 0)
    const totalMO = productos.reduce((a, p) => a + (p.mano_de_obra || 0), 0)
    return [
      { name: 'Materia Prima', value: totalMP },
      { name: 'Mano de Obra', value: totalMO },
    ]
  }, [productos])

  const hayDistribucion = distribucionCostos.some(d => d.value > 0)

  const tieneDiff = prevSnapshot != null

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Finanzas</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Costos, márgenes y resumen financiero</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {lastUpdated && (
            <span className="text-xs flex items-center gap-1.5" style={{ color: colors.textMuted }}>
              <Clock size={12} />
              Actualizado: {lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {tab !== 'Resumen' && (
            <Button variant="primary" onClick={recalcularTodos} loading={recalculando}>
              <RefreshCw size={15} /> Actualizar todos los costos
            </Button>
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
      ) : productos.length === 0 ? (
        <EmptyState icon={DollarSign} title="Sin productos cargados"
          subtitle="Agregá sabores e impulsivos con sus recetas desde Recetas para ver costos y márgenes" />
      ) : (
        <>
          {/* ── Tab Costos ── */}
          {tab === 'Costos' && (
            <div>
              {tieneDiff && (
                <div className="mb-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                  style={{ backgroundColor: '#f0fdf4', border: `1px solid #bbf7d0`, color: colors.success }}>
                  <RefreshCw size={11} />
                  Costos recalculados. Los badges <TrendingUp size={11} className="inline" />/<TrendingDown size={11} className="inline" /> muestran variación vs. estado anterior.
                </div>
              )}
              <div className="overflow-hidden" style={SURFACE}>
                <div className="overflow-x-auto">
                  <Table className="min-w-[760px]">
                    <Thead>
                      <Tr>
                        <Th>Producto</Th>
                        <Th>Tipo</Th>
                        <Th>Costo MP ($)</Th>
                        <Th>Mano de obra ($)</Th>
                        <Th>Costo total ($)</Th>
                        <Th>Precio venta ($)</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {productos.map(p => {
                        const prev = prevSnapshot?.[p.key]
                        return (
                          <Tr key={p.key}>
                            <Td className="font-medium">{p.nombre}</Td>
                            <Td><Badge variant="neutral">{p.tipo}</Badge></Td>
                            <Td className="text-right">
                              ${pesos(p.costo_materiales)}
                              {tieneDiff && <DiffBadge actual={p.costo_materiales} anterior={prev?.costo_total != null ? prev.costo_total - (p.mano_de_obra || 0) : null} />}
                            </Td>
                            <Td className="text-right">
                              <EditableNumber value={p.mano_de_obra} onCommit={v => actualizarCampo(p, 'mano_de_obra', v)} />
                            </Td>
                            <Td className="text-right font-semibold">
                              ${pesos(p.costo_total)}
                              {tieneDiff && <DiffBadge actual={p.costo_total} anterior={prev?.costo_total} />}
                            </Td>
                            <Td className="text-right">
                              <EditableNumber value={p.precio_venta} onCommit={v => actualizarCampo(p, 'precio_venta', v)} />
                            </Td>
                          </Tr>
                        )
                      })}
                    </Tbody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab Márgenes ── */}
          {tab === 'Márgenes' && (
            <div className="space-y-4">
              {tieneDiff && (
                <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                  style={{ backgroundColor: '#fef2f2', border: `1px solid #fecaca`, color: colors.danger }}>
                  Las filas en rojo indican que el margen bajó más de 5% respecto a la última actualización.
                </div>
              )}
              <div className="overflow-hidden" style={SURFACE}>
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <Thead>
                      <Tr>
                        <Th>Producto</Th>
                        <Th>Tipo</Th>
                        <Th>Costo total ($)</Th>
                        <Th>Precio venta ($)</Th>
                        <Th>Ganancia ($)</Th>
                        <Th>Margen %</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {margenes.map(p => {
                        const prevMargen = prevSnapshot?.[p.key]?.margen
                        const margenDrop = prevMargen != null ? p.margen - prevMargen : 0
                        const alertaRojo = tieneDiff && margenDrop < -5
                        return (
                          <Tr key={p.key} style={{ backgroundColor: alertaRojo ? '#fef2f2' : 'transparent' }}>
                            <Td className="font-medium">
                              {alertaRojo && <span className="mr-1.5 text-xs" style={{ color: colors.danger }}>▼</span>}
                              {p.nombre}
                            </Td>
                            <Td><Badge variant="neutral">{p.tipo}</Badge></Td>
                            <Td className="text-right">
                              ${pesos(p.costo_total)}
                              {tieneDiff && <DiffBadge actual={p.costo_total} anterior={prevSnapshot?.[p.key]?.costo_total} />}
                            </Td>
                            <Td className="text-right">${pesos(p.precio_venta)}</Td>
                            <Td className="text-right font-semibold" style={{ color: p.ganancia >= 0 ? colors.success : colors.danger }}>
                              ${pesos(p.ganancia)}
                            </Td>
                            <Td>
                              <div className="flex items-center gap-1.5">
                                {p.precio_venta > 0
                                  ? <Badge variant={margenVariant(p.margen)}>{p.margen.toFixed(1)}%</Badge>
                                  : <Badge variant="neutral">—</Badge>}
                                {tieneDiff && prevMargen != null && margenDrop !== 0 && (
                                  <span className="text-[10px] font-semibold" style={{ color: margenDrop > 0 ? colors.success : colors.danger }}>
                                    {margenDrop > 0 ? '↑' : '↓'}{Math.abs(margenDrop).toFixed(1)}pp
                                  </span>
                                )}
                              </div>
                            </Td>
                          </Tr>
                        )
                      })}
                    </Tbody>
                  </Table>
                </div>
              </div>

              {top10Margen.length > 0 && (
                <div className="p-4" style={SURFACE}>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: colors.textPrimary }}>Top 10 productos por margen</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={top10Margen}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                      <XAxis dataKey="nombre" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={80} />
                      <YAxis tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip formatter={v => `${Number(v).toFixed(1)}%`} />
                      <Bar dataKey="margen" radius={[4, 4, 0, 0]}>
                        {top10Margen.map((p, i) => <Cell key={i} fill={margenColor(p.margen)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* ── Tab Resumen ── */}
          {tab === 'Resumen' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KpiCard label="Valor stock depósito" value={`$${pesos(valorDeposito)}`} icon={Warehouse} color={colors.brand} />
                <KpiCard label="Valor stock cámaras" value={`$${pesos(valorCamaras)}`} icon={Thermometer} color={colors.info} />
                <KpiCard label="Margen promedio" value={`${margenPromedio.toFixed(1)}%`} icon={Percent}
                  color={margenColor(margenPromedio)} />
              </div>

              <div className="p-4" style={SURFACE}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: colors.textPrimary }}>Distribución de costos (Materia Prima vs. Mano de Obra)</h3>
                {hayDistribucion ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={distribucionCostos} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                        {distribucionCostos.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={v => `$${pesos(v)}`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState icon={TrendingUp} title="Sin datos de costos"
                    subtitle="Cargá ingredientes y mano de obra en la pestaña Costos para ver la distribución" />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
