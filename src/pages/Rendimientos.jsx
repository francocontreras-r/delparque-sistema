import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Badge from '../components/ui/Badge'
import Select from '../components/ui/Select'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import { TrendingUp, Users, Scale, Package } from 'lucide-react'

const PERIODOS = [
  { key: 'hoy',    label: 'Hoy',    dias: 0  },
  { key: 'semana', label: 'Semana', dias: 7  },
  { key: 'mes',    label: 'Mes',    dias: 30 },
]
const MEDALLAS = ['🥇', '🥈', '🥉']

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

export default function Rendimientos() {
  const [periodo, setPeriodo]   = useState('semana')
  const [filtroOp, setFiltroOp] = useState('Todos')
  const [datos, setDatos]       = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { cargar() }, [periodo])

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Rendimientos</h1>
        <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Performance por operario</p>
      </div>

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
    </div>
  )
}
