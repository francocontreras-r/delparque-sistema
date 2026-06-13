import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Badge from '../components/ui/Badge'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import { Package, Scale, Users, ClipboardCheck, ListChecks } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { progresoColor, calcularHorasReales, ESTADO_EN_PROCESO } from '../lib/ordenes'

const PIE_COLORS = [colors.brand, colors.info, colors.success, colors.warning, colors.danger, '#a21caf', '#0e7490']
const REFRESH_MS = 30000
const SURFACE = { backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }

function hoyISO() { return new Date().toISOString().split('T')[0] }
function fmtNum(n, dec = 1) { return Number(n || 0).toFixed(dec) }

function formatDuracion(horas) {
  if (!horas || horas <= 0) return '0 min'
  const totalMin = Math.round(horas * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

export default function Rendimientos() {
  const navigate = useNavigate()
  const [produccionesDia, setProduccionesDia] = useState([])
  const [categoriaPorCodigo, setCategoriaPorCodigo] = useState({})
  const [ordenesDia, setOrdenesDia] = useState([])
  const [ordenesActivas, setOrdenesActivas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cargar()
    const id = setInterval(cargar, REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  async function cargar() {
    const hoy = hoyISO()
    const [{ data: prods }, { data: productosProd }, { data: ords }, { data: activas }] = await Promise.all([
      supabase.from('producciones').select('*').eq('fecha', hoy).order('created_at', { ascending: false }),
      supabase.from('productos_produccion').select('codigo,categoria'),
      supabase.from('ordenes_produccion').select('*').eq('fecha_produccion', hoy),
      supabase.from('ordenes_produccion').select('*').eq('estado', ESTADO_EN_PROCESO).order('fecha_inicio', { ascending: true }),
    ])
    setProduccionesDia(prods || [])
    setCategoriaPorCodigo(Object.fromEntries((productosProd || []).map(p => [p.codigo, p.categoria || 'OTRO'])))
    setOrdenesDia((ords || []).filter(o => o.estado !== 'cancelada'))
    setOrdenesActivas(activas || [])
    setLoading(false)
  }

  const kpis = useMemo(() => {
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Rendimientos</h1>
        <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Panorama de producción de hoy</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-14"><Spinner size={28} /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Total unidades" value={kpis.unidades} icon={Package} />
            <KpiCard label="Total KG" value={fmtNum(kpis.kg)} icon={Scale} />
            <KpiCard label="Operarios activos" value={kpis.operariosActivos} icon={Users} color={colors.brand} />
            <KpiCard label="Órdenes completadas" value={kpis.ordenesCompletadas} icon={ClipboardCheck} color={colors.success}
              onClick={() => navigate('/ordenes?estado=completada')} />
          </div>

          {produccionesDia.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="p-4" style={SURFACE}>
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

              <div className="p-4" style={SURFACE}>
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

          <div className="overflow-hidden" style={SURFACE}>
            <h3 className="px-4 pt-4 pb-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>Producción en tiempo real</h3>
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

          <div className="overflow-hidden" style={SURFACE}>
            <h3 className="px-4 pt-4 pb-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>
              Órdenes activas {ordenesActivas.length > 0 && `(${ordenesActivas.length})`}
            </h3>
            {ordenesActivas.length === 0 ? (
              <EmptyState icon={ListChecks} title="Sin órdenes en proceso" subtitle="Las órdenes que se inicien aparecerán acá con su progreso" />
            ) : (
              <div className="px-4 pb-4 space-y-3">
                {ordenesActivas.map(o => {
                  const tieneObjetivo = (o.kg_objetivo || 0) > 0
                  const pct = Math.min(100, o.porcentaje_completitud || 0)
                  const horasTranscurridas = o.fecha_inicio ? calcularHorasReales(o.fecha_inicio, new Date().toISOString()) : 0
                  return (
                    <div key={o.id} className="p-3" style={{ backgroundColor: colors.bg, borderRadius: radius.md, border: `1px solid ${colors.border}` }}>
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>{o.sabor_nombre || `Orden ${o.numero}`}</p>
                          <p className="text-xs" style={{ color: colors.textMuted }}>{o.operario_nombre || 'Sin asignar'} · Orden {o.numero}</p>
                        </div>
                        <Badge variant="info">En curso: {formatDuracion(horasTranscurridas)}</Badge>
                      </div>
                      {tieneObjetivo ? (
                        <>
                          <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: colors.surface }}>
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: progresoColor(pct, colors) }} />
                          </div>
                          <div className="flex items-center justify-between text-xs mt-1" style={{ color: colors.textMuted }}>
                            <span>{fmtNum(o.kg_producido)} / {fmtNum(o.kg_objetivo)} kg</span>
                            <span style={{ color: progresoColor(pct, colors), fontWeight: 700 }}>{pct.toFixed(0)}%</span>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs" style={{ color: colors.textMuted }}>Sin objetivo de kg definido</p>
                      )}
                      {o.horas_estimadas > 0 && (
                        <p className="text-xs mt-1.5" style={{ color: colors.textMuted }}>Tiempo estimado: {formatDuracion(o.horas_estimadas)}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
