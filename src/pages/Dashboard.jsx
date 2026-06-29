import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useUser } from '../context/UserContext'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Badge from '../components/ui/Badge'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import { progresoColor, calcularHorasReales } from '../lib/ordenes'
import { clasificarVencimiento, esAlertaVencimiento, labelDias } from '../lib/vencimientos'
import {
  Factory, ClipboardList, Warehouse, Thermometer, Package,
  ArrowUp, ArrowDown, PlayCircle, CheckCircle2, Activity, AlertTriangle,
  Plus, FileText, TrendingUp, TrendingDown,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const REFRESH_MS = 60000
const SURFACE = { backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }
const TIPO_BADGE = {
  Lisa:           { bg: 'rgba(96,165,250,0.12)',  color: '#60A5FA' },
  'Con Agregado': { bg: 'rgba(167,139,250,0.12)', color: '#A78BFA' },
  Agua:           { bg: 'rgba(34,211,238,0.12)',  color: '#22D3EE' },
  Especial:       { bg: 'rgba(212,82,26,0.12)',   color: '#D4521A' },
}
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function hoyISO() { return toISODate(new Date()) }
function sumarDias(fechaISO, dias) {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + dias)
  return toISODate(date)
}
function lunesDeSemana(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const dia = date.getDay() // 0 = domingo
  date.setDate(date.getDate() + (dia === 0 ? -6 : 1 - dia))
  return toISODate(date)
}
function fmtNum(n, dec = 1) { return Number(n || 0).toFixed(dec) }
function fmtHora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}
function formatDuracion(horas) {
  if (!horas || horas <= 0) return '0 min'
  const totalMin = Math.round(horas * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}
function saludo() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}
function turnoActual() {
  const h = new Date().getHours()
  if (h >= 6  && h < 14) return { label: 'Turno Mañana',  color: '#f59e0b', emoji: '🌅' }
  if (h >= 14 && h < 22) return { label: 'Turno Tarde',   color: '#D4521A', emoji: '🌇' }
  return                         { label: 'Turno Noche',   color: '#6366f1', emoji: '🌙' }
}
function fechaLarga() {
  const s = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { profile, user } = useUser()
  const [loading, setLoading] = useState(true)
  const [producciones, setProducciones] = useState([])
  const [ordenesActivas, setOrdenesActivas] = useState([])
  const [ordenesPendientes, setOrdenesPendientes] = useState([])
  const [ordenesCompletadasHoy, setOrdenesCompletadasHoy] = useState([])
  const [insumos, setInsumos] = useState([])
  const [camaras, setCamaras] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [stockBases, setStockBases] = useState([])
  const [vencimientosData, setVencimientosData] = useState([])

  const hoy = hoyISO()

  useEffect(() => {
    cargar()
    const id = setInterval(cargar, REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  async function cargar() {
    const hoy = hoyISO()
    const mañana = sumarDias(hoy, 1)
    const inicioSemana = lunesDeSemana(hoy)
    const finSemana = sumarDias(inicioSemana, 6)

    const [
      { data: prods },
      { data: activas },
      { data: pendientes },
      { data: completadasHoy },
      { data: ins },
      { data: stockCamaras },
      { data: movsHoy },
      { data: basesDisp },
      { data: vencData },
    ] = await Promise.all([
      supabase.from('producciones').select('*').gte('fecha', inicioSemana).lte('fecha', finSemana),
      supabase.from('ordenes_produccion').select('*').eq('estado', 'en_proceso').order('fecha_inicio', { ascending: true }),
      supabase.from('ordenes_produccion').select('*').eq('estado', 'pendiente'),
      supabase.from('ordenes_produccion').select('*').eq('estado', 'completada').gte('fecha_fin', hoy).lt('fecha_fin', mañana),
      supabase.from('insumos').select('*'),
      supabase.from('stock_camaras').select('*'),
      supabase.from('movimientos_deposito').select('*').eq('fecha', hoy).order('created_at', { ascending: false }),
      supabase.from('stock_bases').select('*').gte('kg_disponible', 0).order('fecha', { ascending: false }),
      supabase.from('movimientos_deposito').select('producto_nombre,lote,fecha_vencimiento,created_at').eq('tipo', 'ingreso').not('fecha_vencimiento', 'is', null).order('created_at', { ascending: false }).limit(500),
    ])

    setProducciones(prods || [])
    setOrdenesActivas(activas || [])
    setOrdenesPendientes(pendientes || [])
    setOrdenesCompletadasHoy(completadasHoy || [])
    setInsumos(ins || [])
    setCamaras(stockCamaras || [])
    setMovimientos(movsHoy || [])
    setStockBases(basesDisp || [])
    setVencimientosData(vencData || [])
    setLoading(false)
  }

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kgHoy = useMemo(() => (
    producciones.filter(p => p.fecha === hoy).reduce((a, p) => a + (p.peso_kg || 0), 0)
  ), [producciones, hoy])

  const kgAyer = useMemo(() => {
    const ayer = sumarDias(hoy, -1)
    return producciones.filter(p => p.fecha === ayer).reduce((a, p) => a + (p.peso_kg || 0), 0)
  }, [producciones, hoy])

  // Tendencia de producción vs ayer: null si ayer no hubo datos
  const trendProd = useMemo(() => {
    if (kgAyer <= 0) return null
    return ((kgHoy - kgAyer) / kgAyer) * 100
  }, [kgHoy, kgAyer])

  const registrosHoy = useMemo(() => producciones.filter(p => p.fecha === hoy).length, [producciones, hoy])

  const insumosCriticos = useMemo(() => insumos.filter(i => (i.stock_actual || 0) === 0), [insumos])
  const insumosBajos = useMemo(() => (
    insumos.filter(i => (i.stock_actual || 0) > 0 && (i.stock_actual || 0) < (i.stock_minimo || 0))
  ), [insumos])
  const insumosBajoMinimo = useMemo(() => (
    insumos.filter(i => (i.stock_actual || 0) < (i.stock_minimo || 0))
  ), [insumos])

  const camarasHelados = useMemo(() => camaras.filter(c => (c.tipo_producto || 'helado') === 'helado'), [camaras])
  const camarasPocoStock = useMemo(() => camarasHelados.filter(c => (c.baldes || 0) <= 3), [camarasHelados])

  const ordenesPendientesViejas = useMemo(() => {
    const hoyMs = new Date(hoy + 'T00:00:00').getTime()
    return ordenesPendientes.filter(o => {
      if (!o.fecha_produccion) return false
      const fechaMs = new Date(o.fecha_produccion + 'T00:00:00').getTime()
      return (hoyMs - fechaMs) / 86400000 > 1
    })
  }, [ordenesPendientes, hoy])

  // ── Alertas ────────────────────────────────────────────────────────────────
  const camarasAgotadas = useMemo(() => camaras.filter(c => (c.baldes || 0) === 0), [camaras])

  const alertas = useMemo(() => {
    const list = []
    if (camarasAgotadas.length > 0) {
      const nombres = camarasAgotadas.slice(0, 3).map(c => c.nombre).join(', ')
      const extra = camarasAgotadas.length > 3 ? ` y ${camarasAgotadas.length - 3} más` : ''
      list.push({
        emoji: '🔴', variant: 'danger', titulo: 'Stock agotado en cámaras',
        detalle: `Sin stock: ${nombres}${extra}`,
        count: camarasAgotadas.length, to: '/camaras',
      })
    }
    if (insumosCriticos.length > 0) {
      const nombres = insumosCriticos.slice(0, 3).map(i => i.nombre).join(', ')
      const extra = insumosCriticos.length > 3 ? ` y ${insumosCriticos.length - 3} más` : ''
      list.push({
        emoji: '🔴', variant: 'danger', titulo: 'Stock crítico',
        detalle: `Sin stock: ${nombres}${extra}`,
        count: insumosCriticos.length, to: '/deposito',
      })
    }
    if (insumosBajos.length > 0) {
      const nombres = insumosBajos.slice(0, 3).map(i => i.nombre).join(', ')
      const extra = insumosBajos.length > 3 ? ` y ${insumosBajos.length - 3} más` : ''
      list.push({
        emoji: '🟡', variant: 'warning', titulo: 'Stock bajo',
        detalle: `Por debajo del mínimo: ${nombres}${extra}`,
        count: insumosBajos.length, to: '/deposito',
      })
    }
    if (ordenesPendientesViejas.length > 0) {
      const nums = ordenesPendientesViejas.slice(0, 3).map(o => `#${o.numero}`).join(', ')
      const extra = ordenesPendientesViejas.length > 3 ? ` y ${ordenesPendientesViejas.length - 3} más` : ''
      list.push({
        emoji: '🔵', variant: 'info', titulo: 'Órdenes sin iniciar',
        detalle: `Programadas hace más de 1 día: ${nums}${extra}`,
        count: ordenesPendientesViejas.length, to: '/ordenes',
      })
    }
    return list
  }, [insumosCriticos, insumosBajos, ordenesPendientesViejas])

  // Vencimientos: agrupar por producto+lote, tomar el más reciente, filtrar alertas
  const vencimientosAlerta = useMemo(() => {
    const map = {}
    vencimientosData.forEach(m => {
      const key = `${(m.producto_nombre || '').trim().toLowerCase()}||${(m.lote || '').trim()}`
      if (!map[key] || m.created_at > map[key].created_at) map[key] = m
    })
    return Object.values(map)
      .map(m => ({ ...m, clasif: clasificarVencimiento(m.fecha_vencimiento) }))
      .filter(m => esAlertaVencimiento(m.clasif))
      .sort((a, b) => a.clasif.dias - b.clasif.dias)
  }, [vencimientosData])

  const totalAlertas = alertas.reduce((a, al) => a + al.count, 0)
  const peorVariante = alertas.some(a => a.variant === 'danger') ? 'danger'
    : alertas.some(a => a.variant === 'warning') ? 'warning' : 'info'

  // ── Producción de la semana ───────────────────────────────────────────────
  const produccionSemana = useMemo(() => {
    const inicio = lunesDeSemana(hoy)
    return DIAS.map((dia, i) => {
      const fecha = sumarDias(inicio, i)
      const kg = producciones.filter(p => p.fecha === fecha).reduce((a, p) => a + (p.peso_kg || 0), 0)
      const [, m, d] = fecha.split('-')
      return { dia, fechaLabel: `${dia} ${d}/${m}`, kg: Number(kg.toFixed(2)) }
    })
  }, [producciones, hoy])

  // ── Top productos en cámara ───────────────────────────────────────────────
  const topCamaras = useMemo(() => (
    [...camarasHelados].sort((a, b) => (b.kg || 0) - (a.kg || 0)).slice(0, 5)
  ), [camarasHelados])

  // ── Actividad reciente ────────────────────────────────────────────────────
  const actividad = useMemo(() => {
    const items = []
    producciones.filter(p => p.fecha === hoy).forEach(p => {
      items.push({
        hora: p.created_at, icon: Package, color: colors.brand,
        desc: `${fmtNum(p.peso_kg)} kg · ${p.producto_nombre}`, operario: p.operario_nombre,
      })
    })
    movimientos.forEach(m => {
      const ingreso = m.tipo === 'ingreso'
      items.push({
        hora: m.created_at, icon: ingreso ? ArrowDown : ArrowUp, color: ingreso ? colors.success : colors.warning,
        desc: `${ingreso ? 'Ingreso' : 'Egreso'}: ${m.cantidad} ${m.unidad} de ${m.producto_nombre}`,
        operario: m.controlo || m.operario_recibe,
      })
    })
    ordenesActivas.filter(o => (o.fecha_inicio || '').slice(0, 10) === hoy).forEach(o => {
      items.push({
        hora: o.fecha_inicio, icon: PlayCircle, color: colors.info,
        desc: `Orden ${o.numero} iniciada · ${o.sabor_nombre || o.tipo_producto || ''}`, operario: o.operario_nombre,
      })
    })
    ordenesCompletadasHoy.forEach(o => {
      items.push({
        hora: o.fecha_fin, icon: CheckCircle2, color: colors.success,
        desc: `Orden ${o.numero} completada · ${o.sabor_nombre || o.tipo_producto || ''}`, operario: o.operario_nombre,
      })
    })
    return items.filter(it => it.hora).sort((a, b) => new Date(b.hora) - new Date(a.hora)).slice(0, 10)
  }, [producciones, movimientos, ordenesActivas, ordenesCompletadasHoy, hoy])

  const nombre = profile?.nombre || user?.email?.split('@')[0] || 'equipo'

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div
        className="flex items-center justify-between gap-5 flex-wrap"
        style={{ borderRadius: 18, padding: '20px 22px', border: `1px solid ${colors.border}`, background: `linear-gradient(120deg, ${colors.brand}26, ${colors.surface} 62%)` }}
      >
        <div>
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>{saludo()}, {nombre} 👋</h1>
          <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
            <span className="text-sm" style={{ color: colors.textSecondary }}>{fechaLarga()}</span>
            {(() => { const t = turnoActual(); return (
              <span style={{ background: t.color + '26', color: t.color, fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '12px', flexShrink: 0 }}>
                {t.emoji} {t.label}
              </span>
            )})()}
          </div>
          {!loading && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span style={{ background: colors.success + '1f', color: colors.success, fontSize: '12px', fontWeight: '700', padding: '5px 12px', borderRadius: '10px' }}>● Fábrica operativa</span>
              {totalAlertas > 0 && (() => {
                const col = peorVariante === 'danger' ? colors.danger : peorVariante === 'warning' ? colors.warning : colors.info
                return (
                  <span onClick={() => navigate(alertas[0]?.to || '/deposito')} className="cursor-pointer"
                    style={{ background: col + '1f', color: col, fontSize: '12px', fontWeight: '700', padding: '5px 12px', borderRadius: '10px' }}>
                    ⚠ {totalAlertas} alerta{totalAlertas !== 1 ? 's' : ''}
                  </span>
                )
              })()}
            </div>
          )}
        </div>
        {!loading && (
          <div className="text-right">
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: colors.textSecondary }}>Producción de hoy</div>
            <div style={{ fontSize: '42px', fontWeight: 900, lineHeight: 1, color: colors.textPrimary, marginTop: 4 }}>
              {fmtNum(kgHoy)} <span style={{ fontSize: '20px', color: colors.textMuted }}>kg</span>
            </div>
            <div className="mt-1.5 text-sm font-bold flex items-center justify-end gap-2 flex-wrap">
              {trendProd != null ? (
                <span style={{ color: trendProd >= 0 ? colors.success : colors.danger }} className="inline-flex items-center gap-1">
                  {trendProd >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{Math.abs(trendProd).toFixed(0)}% vs ayer
                </span>
              ) : <span style={{ color: colors.textMuted }}>sin datos de ayer</span>}
              <span style={{ color: colors.textMuted, fontWeight: 500 }}>· {registrosHoy} reg.</span>
            </div>
          </div>
        )}
      </div>

      {/* Acciones rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Plus,         label: 'Nueva orden',          to: '/ordenes' },
          { icon: Factory,      label: 'Registrar producción', to: '/produccion' },
          { icon: Warehouse,    label: 'Depósito',             to: '/deposito' },
          { icon: FileText,     label: 'Informes',             to: '/informes' },
        ].map(a => (
          <button key={a.to} onClick={() => navigate(a.to)}
            className="flex items-center gap-2.5 px-4 py-3 transition-colors hover:bg-[#334155]/40"
            style={SURFACE}>
            <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: colors.brand + '1f' }}>
              <a.icon size={17} style={{ color: colors.brand }} />
            </span>
            <span className="text-sm font-semibold text-left" style={{ color: colors.textPrimary }}>{a.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-14"><Spinner size={28} /></div>
      ) : (
        <>
          {/* Sección 1: KPIs del día */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard
              label="Producción hoy" value={`${fmtNum(kgHoy)} kg`}
              sub={`${producciones.filter(p => p.fecha === hoy).length} registro(s)`}
              icon={Factory} color={colors.brand}
              onClick={() => navigate('/produccion')}
            />
            <KpiCard
              label="Órdenes activas" value={ordenesActivas.length}
              sub={ordenesActivas.length > 0 ? 'en proceso' : 'sin órdenes en curso'}
              icon={ClipboardList} color={colors.info}
              onClick={() => navigate('/ordenes')}
            />
            <KpiCard
              label="Stock crítico" value={insumosBajoMinimo.length}
              sub={insumosBajoMinimo.length > 0 ? 'insumos bajo el mínimo' : 'todo OK'}
              icon={Warehouse} color={insumosBajoMinimo.length > 0 ? colors.danger : colors.success}
              onClick={() => navigate('/deposito')}
            />
            <KpiCard
              label="Cámaras — poco stock" value={camarasPocoStock.length}
              sub={camarasPocoStock.length > 0 ? 'sabores con ≤3 baldes' : 'todo OK'}
              icon={Thermometer} color={camarasPocoStock.length > 0 ? colors.warning : colors.success}
              onClick={() => navigate('/camaras')}
            />
          </div>

          {/* Sección 2 y 3: Órdenes activas + Alertas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="overflow-hidden" style={SURFACE}>
              <h3 className="px-4 pt-4 pb-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>
                Órdenes activas {ordenesActivas.length > 0 && `(${ordenesActivas.length})`}
              </h3>
              {ordenesActivas.length === 0 ? (
                <EmptyState icon={ClipboardList} title="Sin órdenes en proceso" subtitle="Las órdenes que se inicien aparecerán acá con su progreso" />
              ) : (
                <div className="px-4 pb-4 space-y-3">
                  {ordenesActivas.map(o => {
                    const pct = Math.min(100, o.porcentaje_completitud || 0)
                    const tieneObjetivo = (o.kg_objetivo || 0) > 0
                    const horas = o.fecha_inicio ? calcularHorasReales(o.fecha_inicio, new Date().toISOString()) : 0
                    return (
                      <div
                        key={o.id}
                        onClick={() => navigate('/ordenes')}
                        className="p-3 cursor-pointer transition-colors hover:bg-[#334155]/50"
                        style={{ backgroundColor: colors.bg, borderRadius: radius.md, border: `1px solid ${colors.border}` }}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>
                              Orden {o.numero} · {o.sabor_nombre || o.tipo_producto || ''}
                            </p>
                            <p className="text-xs" style={{ color: colors.textMuted }}>{o.operario_nombre || 'Sin asignar'}</p>
                          </div>
                          <Badge variant="info">{formatDuracion(horas)}</Badge>
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
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="overflow-hidden" style={SURFACE}>
              <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                <h3 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Alertas</h3>
                {totalAlertas > 0 && <Badge variant={peorVariante}>{totalAlertas}</Badge>}
              </div>
              {alertas.length === 0 ? (
                <div className="px-4 pb-4">
                  <p className="text-sm font-medium" style={{ color: colors.success }}>✅ Todo en orden</p>
                </div>
              ) : (
                <div className="px-4 pb-4 space-y-2">
                  {alertas.map((a, i) => (
                    <div
                      key={i}
                      onClick={() => navigate(a.to)}
                      className="flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-[#334155]/50"
                      style={{ backgroundColor: colors.bg, borderRadius: radius.md, border: `1px solid ${colors.border}` }}
                    >
                      <span className="text-lg flex-shrink-0">{a.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: colors.textPrimary }}>{a.titulo}</p>
                        <p className="text-xs truncate" style={{ color: colors.textMuted }}>{a.detalle}</p>
                      </div>
                      <Badge variant={a.variant}>{a.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sección 3b: Vencimientos */}
          <div className="overflow-hidden" style={SURFACE}>
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>⚠️ Vencimientos</h3>
              {vencimientosAlerta.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#ef4444', color: 'white' }}>
                  {vencimientosAlerta.length}
                </span>
              )}
            </div>
            {vencimientosAlerta.length === 0 ? (
              <div className="px-4 pb-4">
                <p className="text-sm font-medium" style={{ color: colors.success }}>✅ Sin vencimientos próximos</p>
              </div>
            ) : (
              <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {vencimientosAlerta.map((m, i) => (
                  <div key={i} className="p-3 rounded-lg" style={{ backgroundColor: colors.bg, border: `1px solid ${m.clasif.color}30` }}>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${m.clasif.color}20`, color: m.clasif.color }}>
                        {m.clasif.label}
                      </span>
                    </div>
                    <p className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>{m.producto_nombre}</p>
                    {m.lote && <p className="text-xs font-mono mt-0.5" style={{ color: colors.textMuted }}>Lote: {m.lote}</p>}
                    <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                      Vence: {m.fecha_vencimiento?.slice(0, 10)?.split('-').reverse().join('/')}
                    </p>
                    <p className="text-xs font-semibold mt-0.5" style={{ color: m.clasif.color }}>
                      {labelDias(m.clasif.dias)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sección 4 y 5: Producción de la semana + Top productos en cámara */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="p-4" style={SURFACE}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: colors.textPrimary }}>Producción de la semana</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={produccionSemana}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                  <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(v) => [`${fmtNum(v)} kg`, 'Producción']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fechaLabel || ''}
                  />
                  <Bar dataKey="kg" fill={colors.brand} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-hidden" style={SURFACE}>
              <h3 className="px-4 pt-4 pb-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>Top productos en cámara</h3>
              {topCamaras.length === 0 ? (
                <EmptyState icon={Thermometer} title="Sin stock en cámaras" />
              ) : (
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Producto</Th>
                      <Th>Tipo</Th>
                      <Th className="text-right">Kg</Th>
                      <Th className="text-right">Baldes</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {topCamaras.map(c => {
                      const tb = TIPO_BADGE[c.tipo] || { bg: '#f8fafc', color: '#64748b' }
                      return (
                        <Tr key={c.id}>
                          <Td className="font-medium">{c.nombre}</Td>
                          <Td>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: tb.bg, color: tb.color }}>
                              {c.tipo}
                            </span>
                          </Td>
                          <Td className="text-right">{fmtNum(c.kg)}</Td>
                          <Td className="text-right">{c.baldes}</Td>
                        </Tr>
                      )
                    })}
                  </Tbody>
                </Table>
              )}
            </div>
          </div>

          {/* Sección 5b: Bases disponibles para elaborar */}
          {stockBases.length > 0 && (
            <div className="overflow-hidden" style={SURFACE}>
              <h3 className="px-4 pt-4 pb-3 text-sm font-semibold" style={{ color: colors.textPrimary }}>
                Bases disponibles para elaborar
              </h3>
              <div className="px-4 pb-4 space-y-3">
                {stockBases.map(b => {
                  const pct = b.kg_original > 0 ? (b.kg_disponible / b.kg_original) * 100 : 100
                  const agotada = b.kg_disponible === 0
                  const bajo = !agotada && pct < 20
                  const barColor = agotada ? colors.danger : bajo ? colors.warning : colors.success
                  return (
                    <div key={b.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium" style={{ color: agotada ? colors.danger : colors.textPrimary }}>{b.base_nombre}</span>
                        <div className="flex items-center gap-2">
                          {agotada && <Badge variant="danger">🔴 Base agotada</Badge>}
                          {bajo    && <Badge variant="warning">⚠ Poco stock</Badge>}
                          <span className="text-sm font-bold" style={{ color: agotada ? colors.danger : bajo ? colors.warning : colors.brand }}>
                            {fmtNum(b.kg_disponible)} kg
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: colors.border }}>
                        <div className="h-full rounded-full transition-all" style={{
                          width: agotada ? '100%' : `${Math.min(100, pct)}%`,
                          backgroundColor: barColor,
                          opacity: agotada ? 0.3 : 1,
                        }} />
                      </div>
                      <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
                        {fmtNum(b.kg_disponible)} / {fmtNum(b.kg_original)} kg · {agotada ? '0' : pct.toFixed(0)}% disponible
                        {b.operario_nombre ? ` · ${b.operario_nombre}` : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Sección 6: Actividad reciente */}
          <div className="overflow-hidden" style={SURFACE}>
            <h3 className="px-4 pt-4 pb-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>Actividad reciente</h3>
            {actividad.length === 0 ? (
              <EmptyState icon={Activity} title="Sin actividad registrada hoy" />
            ) : (
              <div className="px-4 pb-2">
                {actividad.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5" style={{ borderBottom: i < actividad.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${a.color}18` }}>
                      <a.icon size={14} style={{ color: a.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: colors.textPrimary }}>{a.desc}</p>
                      {a.operario && <p className="text-xs" style={{ color: colors.textMuted }}>{a.operario}</p>}
                    </div>
                    <span className="text-xs flex-shrink-0" style={{ color: colors.textMuted }}>{fmtHora(a.hora)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
