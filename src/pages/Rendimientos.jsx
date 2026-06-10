import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
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
  if (pct >= 75) return { label: 'EXCELENTE', color: colors.success, bg: colors.successBg }
  if (pct >= 50) return { label: 'BUENO',     color: colors.info,    bg: colors.infoBg    }
  if (pct >= 25) return { label: 'REGULAR',   color: colors.warning, bg: colors.warningBg }
  return               { label: 'BAJO',       color: colors.danger,  bg: colors.dangerBg  }
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
        <select value={filtroOp} onChange={e => setFiltroOp(e.target.value)}
          className="ml-auto text-xs py-1.5 px-3 transition"
          style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, outline: 'none', color: colors.textSecondary, backgroundColor: colors.surface }}>
          {opcionesOps.map(o => <option key={o}>{o}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-14"><Spinner size={28} /></div>
      ) : porOperario.length === 0 ? (
        <EmptyState icon={TrendingUp} title="Sin datos en este período" subtitle="Registrá producciones para ver rendimientos" />
      ) : (
        <>
          {porOperario.length >= 2 && (
            <div className="p-5" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: colors.textMuted }}>Top del período</p>
              <div className="flex gap-4 justify-center flex-wrap">
                {porOperario.slice(0, 3).map((op, i) => (
                  <div key={op.nombre} className="flex flex-col items-center gap-1.5 min-w-[90px]">
                    <span className="text-3xl">{MEDALLAS[i]}</span>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center font-extrabold text-lg" style={{ backgroundColor: `${colors.brand}18`, color: colors.brand }}>
                      {op.nombre.charAt(0)}
                    </div>
                    <p className="text-xs font-semibold text-center leading-tight" style={{ color: colors.textPrimary }}>{op.nombre.split(' ')[0]}</p>
                    <p className="text-sm font-extrabold" style={{ color: colors.brand }}>{op.kg.toFixed(1)} kg</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {porOperario.map((op, i) => {
              const pctVsMejor = (op.kg / maxKg) * 100
              const pctTotal   = totalKg > 0 ? (op.kg / totalKg) * 100 : 0
              const n = nivel(pctVsMejor)
              const topProds = Object.entries(op.prods).sort((a, b) => b[1] - a[1]).slice(0, 3)
              return (
                <div key={op.nombre} className="p-4 space-y-3" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-base" style={{ backgroundColor: `${colors.brand}18`, color: colors.brand }}>
                      {i < 3 ? MEDALLAS[i] : op.nombre.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: colors.textPrimary }}>{op.nombre}</p>
                      <p className="text-xs" style={{ color: colors.textMuted }}>{op.unidades} unidades · {op.kg.toFixed(2)} kg</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: n.bg, color: n.color }}>{n.label}</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: 'vs. mejor', pct: pctVsMejor, color: colors.brand },
                      { label: 'del total', pct: pctTotal,   color: colors.info  },
                    ].map(bar => (
                      <div key={bar.label}>
                        <div className="flex justify-between text-[10px] mb-1" style={{ color: colors.textMuted }}>
                          <span>{bar.label}</span><span>{bar.pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.bg }}>
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${bar.pct}%`, backgroundColor: bar.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {topProds.map(([nombre, cnt]) => (
                      <span key={nombre} className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.bg, color: colors.textSecondary }}>
                        {nombre} ×{cnt}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
