import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import Input from '../components/ui/Input'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import {
  TrendingUp, Users, Award, Package, ArrowUp, ArrowDown, Minus, FileDown, Target, Clock,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
const logoUrl = '/logo_delparque.png'

const TABS = ['Resumen General', 'Por Operario', 'Ranking del Equipo', 'Informe PDF']

const PERIODOS = [
  { key: 'semana',    label: 'Semana',    dias: 7  },
  { key: 'mes',       label: 'Mes',       dias: 30 },
  { key: 'trimestre', label: 'Trimestre', dias: 90 },
]

const MEDALLAS = ['🥇', '🥈', '🥉']
const RADAR_COLORS = [colors.brand, colors.info, colors.success, colors.warning, colors.danger, '#7c3aed']

const SURFACE = { backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }

function fmtNum(n, dec = 1) { return Number(n || 0).toFixed(dec) }

function fmtFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

function fmtFechaCorta(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtFechaLarga(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function hoyISO() { return new Date().toISOString().split('T')[0] }

function sumarDias(fechaISO, dias) {
  const d = new Date(fechaISO)
  d.setDate(d.getDate() + dias)
  return d.toISOString().split('T')[0]
}

// Calcula el rango actual y el rango anterior (misma duración, inmediatamente
// anterior) para poder comparar período contra período.
function calcularRangos(periodoKey) {
  const p = PERIODOS.find(p => p.key === periodoKey) || PERIODOS[0]
  const hasta = hoyISO()
  const desde = sumarDias(hasta, -(p.dias - 1))
  const antHasta = sumarDias(desde, -1)
  const antDesde = sumarDias(antHasta, -(p.dias - 1))
  return { desde, hasta, antDesde, antHasta }
}

// pct === null     → sin datos en ningún período
// pct === Infinity → no había datos en el período anterior
function variacionPct(actual, anterior) {
  if (!anterior) return actual === 0 ? null : Infinity
  return ((actual - anterior) / anterior) * 100
}

function nivelRendimiento(pct) {
  if (pct >= 90) return { label: 'Excelente', variant: 'success', color: colors.success }
  if (pct >= 75) return { label: 'Bueno',     variant: 'info',    color: colors.info }
  if (pct >= 60) return { label: 'Regular',   variant: 'warning', color: colors.warning }
  return                 { label: 'Bajo',      variant: 'danger',  color: colors.danger }
}

function TendenciaTag({ diff }) {
  if (diff === null || diff === undefined) return <Badge variant="neutral">Sin datos previos</Badge>
  if (diff > 1) return <Badge variant="success"><ArrowUp size={11} className="inline -mt-0.5 mr-1" />Mejorando ({diff > 0 ? '+' : ''}{diff.toFixed(1)} pts)</Badge>
  if (diff < -1) return <Badge variant="danger"><ArrowDown size={11} className="inline -mt-0.5 mr-1" />Empeorando ({diff.toFixed(1)} pts)</Badge>
  return <Badge variant="neutral"><Minus size={11} className="inline -mt-0.5 mr-1" />Estable</Badge>
}

function TendenciaIcon({ diff }) {
  if (diff === null || diff === undefined) return <Minus size={14} style={{ color: colors.textMuted }} />
  if (diff > 1) return <ArrowUp size={14} style={{ color: colors.success }} />
  if (diff < -1) return <ArrowDown size={14} style={{ color: colors.danger }} />
  return <Minus size={14} style={{ color: colors.textMuted }} />
}

function toDataURL(url) {
  return fetch(url)
    .then(res => res.blob())
    .then(blob => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    }))
}

// Agrupa órdenes completadas por operario y calcula sus promedios de
// rendimiento para el período recibido.
function agruparPorOperario(ordenes) {
  const mapa = {}
  ordenes.forEach(o => {
    const key = o.operario_nombre || 'Sin asignar'
    if (!mapa[key]) mapa[key] = []
    mapa[key].push(o)
  })
  return Object.entries(mapa).map(([nombre, items]) => {
    const n = items.length
    const avgKg = items.reduce((a, o) => a + (o.eficiencia_kg || 0), 0) / n
    const avgTiempo = items.reduce((a, o) => a + (o.eficiencia_tiempo || 0), 0) / n
    const avgRend = items.reduce((a, o) => a + (o.rendimiento_final || 0), 0) / n
    const totalKg = items.reduce((a, o) => a + (o.kg_producido || 0), 0)
    const variance = items.reduce((a, o) => a + Math.pow((o.rendimiento_final || 0) - avgRend, 2), 0) / n
    const stdDev = Math.sqrt(variance)
    return { nombre, items, ordenes: n, avgKg, avgTiempo, avgRend, totalKg, stdDev }
  })
}

export default function InformeOperarios() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('Resumen General')
  const [periodo, setPeriodo] = useState('semana')
  const [loading, setLoading] = useState(true)

  const [operarios, setOperarios] = useState([])
  const [ordenesActual, setOrdenesActual] = useState([])
  const [ordenesAnterior, setOrdenesAnterior] = useState([])
  const [mermasActual, setMermasActual] = useState([])

  const [operarioSel, setOperarioSel] = useState('')
  const [productoComparativaSel, setProductoComparativaSel] = useState('')

  // ── Tab "Informe PDF" ──────────────────────────────────────────────────
  const [pdfModo, setPdfModo] = useState('equipo')
  const [pdfOperario, setPdfOperario] = useState('')
  const [pdfPeriodo, setPdfPeriodo] = useState('mes')
  const [pdfDesde, setPdfDesde] = useState('')
  const [pdfHasta, setPdfHasta] = useState('')
  const [generandoPDF, setGenerandoPDF] = useState(false)

  const rango = useMemo(() => calcularRangos(periodo), [periodo])

  const evolucionSemanal = useMemo(() => {
    const { desde, hasta } = rango
    const days = []
    let cur = new Date(desde)
    const end = new Date(hasta)
    while (cur <= end) { days.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1) }
    const byDay = {}
    ordenesActual.forEach(o => {
      const d = (o.fecha_fin || '').split('T')[0]
      if (!byDay[d]) byDay[d] = { kg: 0, ordenes: 0 }
      byDay[d].kg += o.kg_producido || 0
      byDay[d].ordenes++
    })
    return days.slice(-14).map(d => ({
      fecha: `${d.split('-')[2]}/${d.split('-')[1]}`,
      kg: Number((byDay[d]?.kg || 0).toFixed(1)),
      ordenes: byDay[d]?.ordenes || 0,
    }))
  }, [ordenesActual, rango])

  useEffect(() => { cargar() }, [periodo])

  useEffect(() => {
    if (operarios.length === 0) return
    if (!operarioSel) setOperarioSel(operarios[0].nombre)
    if (!pdfOperario) setPdfOperario(operarios[0].nombre)
  }, [operarios])

  async function cargar() {
    setLoading(true)
    const { desde, hasta, antDesde, antHasta } = rango
    const [{ data: ops }, { data: ordAct }, { data: ordAnt }, { data: merAct }] = await Promise.all([
      supabase.from('operarios').select('*').order('nombre'),
      supabase.from('ordenes_produccion').select('*').eq('estado', 'completada').gte('fecha_fin', desde).lte('fecha_fin', `${hasta}T23:59:59`),
      supabase.from('ordenes_produccion').select('*').eq('estado', 'completada').gte('fecha_fin', antDesde).lte('fecha_fin', `${antHasta}T23:59:59`),
      supabase.from('mermas').select('*').gte('fecha', desde).lte('fecha', hasta),
    ])
    setOperarios(ops || [])
    setOrdenesActual(ordAct || [])
    setOrdenesAnterior(ordAnt || [])
    setMermasActual(merAct || [])
    setLoading(false)
  }

  const porOperarioActual = useMemo(() => (
    agruparPorOperario(ordenesActual).sort((a, b) => b.avgRend - a.avgRend)
  ), [ordenesActual])

  const porOperarioAnterior = useMemo(() => agruparPorOperario(ordenesAnterior), [ordenesAnterior])

  const anteriorPorNombre = useMemo(() => (
    Object.fromEntries(porOperarioAnterior.map(o => [o.nombre, o]))
  ), [porOperarioAnterior])

  // ── TAB 1 — Resumen General ──────────────────────────────────────────────
  const kpisGlobales = useMemo(() => {
    const totalOrdenes = ordenesActual.length
    const rendProm = porOperarioActual.length > 0
      ? porOperarioActual.reduce((a, o) => a + o.avgRend, 0) / porOperarioActual.length
      : 0
    const operarioDestacado = porOperarioActual[0] || null

    const mermaPorProducto = {}
    mermasActual.forEach(m => {
      const nombre = m.sabor_nombre || 'Sin especificar'
      mermaPorProducto[nombre] = (mermaPorProducto[nombre] || 0) + (m.diferencia || 0)
    })
    const top = Object.entries(mermaPorProducto).sort((a, b) => b[1] - a[1])[0]

    return {
      totalOrdenes,
      rendProm,
      operarioDestacado,
      productoMasMerma: top ? { nombre: top[0], kg: top[1] } : null,
    }
  }, [ordenesActual, porOperarioActual, mermasActual])

  const chartResumen = useMemo(() => (
    porOperarioActual.map(o => ({
      nombre: o.nombre,
      'Eficiencia Kg': Number(o.avgKg.toFixed(1)),
      'Eficiencia Tiempo': Number(o.avgTiempo.toFixed(1)),
      'Rendimiento Final': Number(o.avgRend.toFixed(1)),
    }))
  ), [porOperarioActual])

  // ── TAB 2 — Por Operario ──────────────────────────────────────────────────
  const operarioActual = useMemo(() => (
    porOperarioActual.find(o => o.nombre === operarioSel) || null
  ), [porOperarioActual, operarioSel])

  const operarioAnteriorData = anteriorPorNombre[operarioSel]

  const kpisOperario = useMemo(() => {
    if (!operarioActual) return null
    const tendenciaDiff = operarioAnteriorData ? operarioActual.avgRend - operarioAnteriorData.avgRend : null
    return { ...operarioActual, tendenciaDiff }
  }, [operarioActual, operarioAnteriorData])

  const lineChartOperario = useMemo(() => {
    if (!operarioActual) return []
    return [...operarioActual.items]
      .sort((a, b) => new Date(a.fecha_fin) - new Date(b.fecha_fin))
      .map(o => ({
        fecha: fmtFechaCorta(o.fecha_fin),
        'Eficiencia Kg': Number((o.eficiencia_kg || 0).toFixed(1)),
        'Eficiencia Tiempo': Number((o.eficiencia_tiempo || 0).toFixed(1)),
        'Rendimiento Final': Number((o.rendimiento_final || 0).toFixed(1)),
      }))
  }, [operarioActual])

  const historialOperario = useMemo(() => {
    if (!operarioActual) return []
    return [...operarioActual.items].sort((a, b) => new Date(b.fecha_fin) - new Date(a.fecha_fin))
  }, [operarioActual])

  // Comparativa: para cada producto que trabajó el operario, compara su
  // promedio de rendimiento contra el resto del equipo en ese mismo producto.
  const comparativaProductos = useMemo(() => {
    if (!operarioActual) return []
    const productos = [...new Set(operarioActual.items.map(o => o.sabor_nombre || 'Sin especificar'))]
    return productos.map(producto => {
      const porOp = {}
      ordenesActual
        .filter(o => (o.sabor_nombre || 'Sin especificar') === producto)
        .forEach(o => {
          const key = o.operario_nombre || 'Sin asignar'
          if (!porOp[key]) porOp[key] = []
          porOp[key].push(o.rendimiento_final || 0)
        })
      const promedios = Object.entries(porOp)
        .map(([nombre, vals]) => ({ nombre, avg: vals.reduce((a, b) => a + b, 0) / vals.length }))
        .sort((a, b) => b.avg - a.avg)
      const miPromedio = promedios.find(p => p.nombre === operarioSel)?.avg || 0
      const promedioEquipo = promedios.reduce((a, p) => a + p.avg, 0) / promedios.length
      const mejor = promedios[0] || null
      const posicion = promedios.findIndex(p => p.nombre === operarioSel) + 1
      return { producto, miPromedio, promedioEquipo, mejor, posicion, total: promedios.length, promedios }
    }).sort((a, b) => b.miPromedio - a.miPromedio)
  }, [operarioActual, ordenesActual, operarioSel])

  useEffect(() => {
    if (comparativaProductos.length === 0) { setProductoComparativaSel(''); return }
    if (!comparativaProductos.find(p => p.producto === productoComparativaSel)) {
      setProductoComparativaSel(comparativaProductos[0].producto)
    }
  }, [comparativaProductos])

  const rankingProducto = comparativaProductos.find(p => p.producto === productoComparativaSel) || null

  const chartRankingProducto = useMemo(() => (
    rankingProducto ? rankingProducto.promedios.map(p => ({ nombre: p.nombre, rendimiento: Number(p.avg.toFixed(1)) })) : []
  ), [rankingProducto])

  // ── TAB 3 — Ranking del Equipo ───────────────────────────────────────────
  const rankingEquipo = useMemo(() => (
    porOperarioActual.map((o, idx) => {
      const ant = anteriorPorNombre[o.nombre]
      const diff = ant ? o.avgRend - ant.avgRend : null
      return { ...o, pos: idx + 1, diff }
    })
  ), [porOperarioActual, anteriorPorNombre])

  const radarOperarios = useMemo(() => porOperarioActual.slice(0, 6), [porOperarioActual])

  const radarData = useMemo(() => {
    if (radarOperarios.length === 0) return []
    const maxTotalKg = Math.max(1, ...radarOperarios.map(o => o.totalKg))
    const dims = [
      { key: 'Volumen',          calc: o => (o.totalKg / maxTotalKg) * 100 },
      { key: 'Eficiencia Kg',     calc: o => Math.min(150, o.avgKg) },
      { key: 'Eficiencia Tiempo', calc: o => Math.min(150, o.avgTiempo) },
      { key: 'Consistencia',      calc: o => Math.max(0, 100 - Math.min(100, o.stdDev)) },
    ]
    return dims.map(dim => {
      const row = { dimension: dim.key }
      radarOperarios.forEach(o => { row[o.nombre] = Number(dim.calc(o).toFixed(1)) })
      return row
    })
  }, [radarOperarios])

  // ── TAB 4 — Informe PDF exportable ───────────────────────────────────────
  async function generarPDF() {
    setGenerandoPDF(true)
    try {
      let desde, hasta, periodoLabel
      if (pdfPeriodo === 'personalizado') {
        if (!pdfDesde || !pdfHasta) return
        desde = pdfDesde
        hasta = pdfHasta
        periodoLabel = `${fmtFecha(desde)} – ${fmtFecha(hasta)}`
      } else {
        const r = calcularRangos(pdfPeriodo)
        desde = r.desde
        hasta = r.hasta
        periodoLabel = `${PERIODOS.find(p => p.key === pdfPeriodo)?.label} (${fmtFecha(desde)} – ${fmtFecha(hasta)})`
      }

      const dias = Math.round((new Date(hasta) - new Date(desde)) / 86400000) + 1
      const antHasta = sumarDias(desde, -1)
      const antDesde = sumarDias(antHasta, -(dias - 1))

      const [{ data: ordAct }, { data: ordAnt }] = await Promise.all([
        supabase.from('ordenes_produccion').select('*').eq('estado', 'completada').gte('fecha_fin', desde).lte('fecha_fin', `${hasta}T23:59:59`),
        supabase.from('ordenes_produccion').select('*').eq('estado', 'completada').gte('fecha_fin', antDesde).lte('fecha_fin', `${antHasta}T23:59:59`),
      ])

      const porOp = agruparPorOperario(ordAct || []).sort((a, b) => b.avgRend - a.avgRend)
      const porOpAnt = agruparPorOperario(ordAnt || [])

      let operariosReporte = porOp
      if (pdfModo === 'individual') {
        const existente = porOp.find(o => o.nombre === pdfOperario)
        operariosReporte = existente
          ? [existente]
          : [{ nombre: pdfOperario, items: [], ordenes: 0, avgKg: 0, avgTiempo: 0, avgRend: 0, totalKg: 0, stdDev: 0 }]
      }

      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const headStyles = { fillColor: [212, 82, 26], textColor: 255 }
      const styles = { fontSize: 8, cellPadding: 2 }

      // ── PÁGINA 1 — Portada ────────────────────────────────────────────
      try {
        const logoData = await toDataURL(logoUrl)
        doc.addImage(logoData, 'PNG', (pageWidth - 50) / 2, 35, 50, 18)
      } catch {
        // si no se puede cargar el logo, se continúa sin él
      }
      doc.setFontSize(22)
      doc.setTextColor(40, 40, 40)
      doc.text('Informe de Rendimiento', pageWidth / 2, 85, { align: 'center' })
      doc.setFontSize(12)
      doc.setTextColor(100, 100, 100)
      doc.text(pdfModo === 'individual' ? `Operario: ${pdfOperario}` : 'Equipo completo', pageWidth / 2, 96, { align: 'center' })
      doc.text(`Período: ${periodoLabel}`, pageWidth / 2, 104, { align: 'center' })

      // Línea naranja divisoria
      doc.setDrawColor(212, 82, 26)
      doc.setLineWidth(1)
      doc.line(30, 111, pageWidth - 30, 111)

      doc.setFontSize(9)
      doc.setTextColor(140, 140, 140)
      doc.text(`Emitido: ${new Date().toLocaleString('es-AR')}`, pageWidth / 2, 119, { align: 'center' })

      // "CONFIDENCIAL"
      doc.setFontSize(7.5)
      doc.setTextColor(212, 82, 26)
      doc.text('CONFIDENCIAL — USO INTERNO', pageWidth / 2, 127, { align: 'center' })

      // ── PÁGINA 2 — Resumen ejecutivo ───────────────────────────────────
      doc.addPage()
      doc.setFontSize(14)
      doc.setTextColor(40, 40, 40)
      doc.text('Resumen ejecutivo', 14, 16)

      const totalOrdenes = (ordAct || []).length
      const rendPromEquipo = porOp.length > 0 ? porOp.reduce((a, o) => a + o.avgRend, 0) / porOp.length : 0
      const mejor = porOp[0] || null
      const rendPromAnt = porOpAnt.length > 0 ? porOpAnt.reduce((a, o) => a + o.avgRend, 0) / porOpAnt.length : 0
      const variacion = variacionPct(rendPromEquipo, rendPromAnt)

      autoTable(doc, {
        startY: 22,
        head: [['Indicador', 'Valor']],
        body: [
          ['Órdenes completadas', String(totalOrdenes)],
          ['Operarios con producción', String(porOp.length)],
          ['Rendimiento promedio del equipo', `${fmtNum(rendPromEquipo)}%`],
          ['Operario destacado', mejor ? `${mejor.nombre} (${fmtNum(mejor.avgRend)}%)` : '—'],
        ],
        styles, headStyles,
      })

      let y = doc.lastAutoTable.finalY + 10
      doc.setFontSize(11)
      doc.setTextColor(40, 40, 40)
      doc.text('Conclusiones', 14, y)
      y += 6

      const conclusiones = []
      conclusiones.push(`El equipo completó ${totalOrdenes} ${totalOrdenes === 1 ? 'orden' : 'órdenes'} con un rendimiento promedio de ${fmtNum(rendPromEquipo)}%.`)
      if (mejor) {
        conclusiones.push(`El operario con mejor desempeño fue ${mejor.nombre} con ${fmtNum(mejor.avgRend)}%.`)
      } else {
        conclusiones.push('No se registraron operarios con órdenes completadas en este período.')
      }
      if (variacion === null) {
        conclusiones.push('No hay datos suficientes del período anterior para comparar la evolución del equipo.')
      } else if (variacion === Infinity) {
        conclusiones.push('No se registró producción en el período anterior para comparar.')
      } else {
        const palabra = variacion >= 0 ? 'mejora' : 'caída'
        conclusiones.push(`Se detectó una ${palabra} de ${Math.abs(variacion).toFixed(1)}% respecto al período anterior.`)
      }

      doc.setFontSize(9)
      doc.setTextColor(70, 70, 70)
      conclusiones.forEach(linea => {
        const wrapped = doc.splitTextToSize(`• ${linea}`, pageWidth - 28)
        doc.text(wrapped, 14, y)
        y += wrapped.length * 5 + 2
      })

      // ── PÁGINAS 3+ — Detalle por operario ──────────────────────────────
      operariosReporte.forEach(op => {
        doc.addPage()
        const nivel = nivelRendimiento(op.avgRend)

        // "Foto": círculo con la inicial del operario
        const cx = 22, cy = 22, r = 9
        doc.setFillColor(212, 82, 26)
        doc.circle(cx, cy, r, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(14)
        doc.text((op.nombre[0] || '?').toUpperCase(), cx, cy + 1.5, { align: 'center' })

        doc.setFontSize(14)
        doc.setTextColor(40, 40, 40)
        doc.text(op.nombre, cx + r + 6, cy - 1)
        doc.setFontSize(9)
        doc.setTextColor(120, 120, 120)
        doc.text(`Rendimiento: ${fmtNum(op.avgRend)}% — ${nivel.label}`, cx + r + 6, cy + 5)

        let yy = cy + r + 8

        autoTable(doc, {
          startY: yy,
          head: [['Órdenes', 'Eficiencia Kg', 'Eficiencia Tiempo', 'Rendimiento Final']],
          body: [[String(op.ordenes), `${fmtNum(op.avgKg)}%`, `${fmtNum(op.avgTiempo)}%`, `${fmtNum(op.avgRend)}%`]],
          styles, headStyles,
        })
        yy = doc.lastAutoTable.finalY + 8

        doc.setFontSize(11)
        doc.setTextColor(40, 40, 40)
        doc.text('Historial de órdenes', 14, yy)

        const historial = [...op.items].sort((a, b) => new Date(b.fecha_fin) - new Date(a.fecha_fin))
        autoTable(doc, {
          startY: yy + 3,
          head: [['Fecha', 'Producto', 'Kg Obj.', 'Kg Prod.', '% Kg', 'Hs Est.', 'Hs Real', '% Tiempo', 'Rend.']],
          body: historial.length > 0 ? historial.map(o => [
            fmtFechaLarga(o.fecha_fin),
            o.sabor_nombre || '—',
            fmtNum(o.kg_objetivo, 1),
            fmtNum(o.kg_producido, 1),
            `${fmtNum(o.eficiencia_kg)}%`,
            fmtNum(o.horas_estimadas, 1),
            fmtNum(o.horas_reales, 1),
            `${fmtNum(o.eficiencia_tiempo)}%`,
            `${fmtNum(o.rendimiento_final)}%`,
          ]) : [['—', 'Sin órdenes completadas en el período', '', '', '', '', '', '', '']],
          styles: { ...styles, fontSize: 7 },
          headStyles,
        })
      })

      // ── ÚLTIMA PÁGINA — Firmas ────────────────────────────────────────
      doc.addPage()
      doc.setFontSize(14)
      doc.setTextColor(40, 40, 40)
      doc.text('Conformidad y Firmas', 14, 20)
      doc.setDrawColor(212, 82, 26)
      doc.setLineWidth(0.8)
      doc.line(14, 24, pageWidth - 14, 24)

      doc.setFontSize(9)
      doc.setTextColor(100, 100, 100)
      const firmaTxt = `El presente informe corresponde al período ${periodoLabel} y fue generado automáticamente el ${new Date().toLocaleString('es-AR')}.`
      const firmaWrapped = doc.splitTextToSize(firmaTxt, pageWidth - 28)
      doc.text(firmaWrapped, 14, 34)

      const firmantes = ['Responsable de Producción', 'Jefe de Calidad', 'Gerencia General']
      let yF = 60
      firmantes.forEach(rol => {
        doc.setDrawColor(100, 100, 100)
        doc.setLineWidth(0.3)
        doc.line(14, yF, 80, yF)
        doc.setFontSize(8)
        doc.setTextColor(100, 100, 100)
        doc.text(rol, 14, yF + 5)
        doc.text('Nombre y apellido: ___________________________', 14, yF + 11)
        yF += 30
      })

      const sufijo = pdfModo === 'individual' ? (pdfOperario || 'operario').replace(/\s+/g, '_') : 'equipo'
      doc.save(`informe_rendimiento_${sufijo}_${hoyISO()}.pdf`)
    } finally {
      setGenerandoPDF(false)
    }
  }

  const pdfDisabled = generandoPDF
    || (pdfPeriodo === 'personalizado' && (!pdfDesde || !pdfHasta))
    || (pdfModo === 'individual' && !pdfOperario)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Rendimiento de Operarios</h1>
        <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Informe profesional de desempeño del equipo de producción</p>
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

      {tab !== 'Informe PDF' && (
        <div className="p-3 flex flex-wrap gap-3 items-center justify-between" style={SURFACE}>
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
          <p className="text-xs" style={{ color: colors.textMuted }}>
            {fmtFecha(rango.desde)} – {fmtFecha(rango.hasta)} <span className="mx-1">·</span>
            vs. {fmtFecha(rango.antDesde)} – {fmtFecha(rango.antHasta)}
          </p>
        </div>
      )}

      {tab !== 'Informe PDF' && loading ? (
        <div className="flex justify-center py-14"><Spinner size={28} /></div>
      ) : (
        <>
          {/* ── TAB 1 — RESUMEN GENERAL ─────────────────────────────────── */}
          {tab === 'Resumen General' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard label="Órdenes completadas" value={kpisGlobales.totalOrdenes} icon={Package} color={colors.brand}
                  onClick={() => navigate('/ordenes?estado=completada')} />
                <KpiCard label="Rendimiento promedio del equipo" value={`${fmtNum(kpisGlobales.rendProm)}%`}
                  icon={TrendingUp} color={nivelRendimiento(kpisGlobales.rendProm).color}
                  onClick={() => setTab('Ranking del Equipo')} />
                <KpiCard label="Operario destacado" value={kpisGlobales.operarioDestacado?.nombre || '—'}
                  sub={kpisGlobales.operarioDestacado ? `${fmtNum(kpisGlobales.operarioDestacado.avgRend)}% de rendimiento` : undefined}
                  icon={Award} color={colors.success}
                  onClick={() => { if (kpisGlobales.operarioDestacado) { setTab('Por Operario'); setOperarioSel(kpisGlobales.operarioDestacado.nombre) } }} />
                <KpiCard label="Producto con más merma" value={kpisGlobales.productoMasMerma?.nombre || '—'}
                  sub={kpisGlobales.productoMasMerma ? `${fmtNum(kpisGlobales.productoMasMerma.kg)} kg de diferencia` : undefined}
                  icon={Package} color={colors.danger}
                  onClick={() => navigate('/mermas')} />
              </div>

              {chartResumen.length === 0 ? (
                <EmptyState icon={TrendingUp} title="Sin órdenes completadas en este período"
                  subtitle="Las órdenes finalizadas aparecerán acá con su rendimiento" />
              ) : (
                <>
                  <div className="p-4" style={SURFACE}>
                    <h3 className="text-sm font-semibold mb-1" style={{ color: colors.textPrimary }}>Rendimiento del equipo</h3>
                    <p className="text-xs mb-3" style={{ color: colors.textMuted }}>Eficiencia KG · Eficiencia Tiempo · Rendimiento Final por operario</p>
                    <ResponsiveContainer width="100%" height={340}>
                      <BarChart data={chartResumen} margin={{ top: 10, right: 24, left: 0, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                        <XAxis dataKey="nombre" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                        <YAxis tick={{ fontSize: 11 }} domain={[0, 120]} unit="%" />
                        <Tooltip formatter={(v, name) => [`${v}%`, name]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                        <Legend verticalAlign="top" />
                        <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="5 5"
                          label={{ value: 'Meta 80%', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }} />
                        <Bar dataKey="Eficiencia Kg" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Eficiencia Tiempo" fill="#D4521A" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Rendimiento Final" fill="#10B981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="p-4" style={SURFACE}>
                    <h3 className="text-sm font-semibold mb-1" style={{ color: colors.textPrimary }}>Evolución producción</h3>
                    <p className="text-xs mb-3" style={{ color: colors.textMuted }}>KG producidos por día en el período</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={evolucionSemanal} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradKg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#D4521A" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#D4521A" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                        <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} unit=" kg" />
                        <Tooltip
                          formatter={(v, name) => [name === 'kg' ? `${v} kg` : v, name === 'kg' ? 'KG producidos' : 'Órdenes']}
                          contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        />
                        <Area type="monotone" dataKey="kg" stroke="#D4521A" strokeWidth={2.5}
                          fill="url(#gradKg)" dot={{ r: 4, fill: '#D4521A' }} activeDot={{ r: 6 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── TAB 2 — POR OPERARIO ─────────────────────────────────────── */}
          {tab === 'Por Operario' && (
            <>
              <div className="p-3" style={SURFACE}>
                <div className="max-w-xs">
                  <Select label="Operario" value={operarioSel} onChange={e => setOperarioSel(e.target.value)}>
                    {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
                  </Select>
                </div>
              </div>

              {!operarioActual ? (
                <EmptyState icon={Users} title="Sin órdenes completadas"
                  subtitle={`${operarioSel || 'Este operario'} no completó órdenes en el período seleccionado`} />
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiCard label="Órdenes completadas" value={kpisOperario.ordenes} icon={Package} color={colors.brand} />
                    <KpiCard label="Eficiencia Kg promedio" value={`${fmtNum(kpisOperario.avgKg)}%`} icon={Target} color={colors.info} />
                    <KpiCard label="Eficiencia Tiempo promedio" value={`${fmtNum(kpisOperario.avgTiempo)}%`} icon={Clock} color={colors.brand} />
                    <KpiCard label="Rendimiento Final promedio" value={`${fmtNum(kpisOperario.avgRend)}%`}
                      icon={TrendingUp} color={nivelRendimiento(kpisOperario.avgRend).color} />
                  </div>

                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs" style={{ color: colors.textMuted }}>Tendencia vs. período anterior:</span>
                    <TendenciaTag diff={kpisOperario.tendenciaDiff} />
                  </div>

                  {lineChartOperario.length > 0 && (
                    <div className="p-4" style={SURFACE}>
                      <h3 className="text-sm font-semibold mb-1" style={{ color: colors.textPrimary }}>Evolución histórica</h3>
                      <p className="text-xs mb-3" style={{ color: colors.textMuted }}>Rendimiento por orden completada — línea roja = meta 80%</p>
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={lineChartOperario} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                          <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 11 }} domain={[0, 120]} unit="%" />
                          <Tooltip formatter={(v, name) => [`${v}%`, name]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                          <Legend verticalAlign="top" />
                          <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="5 5"
                            label={{ value: 'Meta 80%', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }} />
                          <Line type="monotone" dataKey="Eficiencia Kg" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="Eficiencia Tiempo" stroke="#D4521A" strokeWidth={2} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="Rendimiento Final" stroke="#10B981" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="overflow-hidden" style={SURFACE}>
                    <h3 className="px-4 pt-4 pb-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>Historial de órdenes</h3>
                    <Table className="min-w-[860px]">
                      <Thead>
                        <Tr>
                          <Th>Fecha</Th>
                          <Th>Producto</Th>
                          <Th>Kg Objetivo</Th>
                          <Th>Kg Producido</Th>
                          <Th>% Kg</Th>
                          <Th>Horas Est.</Th>
                          <Th>Horas Reales</Th>
                          <Th>% Tiempo</Th>
                          <Th>Rendimiento</Th>
                          <Th></Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {historialOperario.map(o => {
                          const nivel = nivelRendimiento(o.rendimiento_final || 0)
                          return (
                            <Tr key={o.id}>
                              <Td>{fmtFechaLarga(o.fecha_fin)}</Td>
                              <Td className="font-medium">{o.sabor_nombre || '—'}</Td>
                              <Td className="text-right">{fmtNum(o.kg_objetivo)} kg</Td>
                              <Td className="text-right">{fmtNum(o.kg_producido)} kg</Td>
                              <Td className="text-right">{fmtNum(o.eficiencia_kg)}%</Td>
                              <Td className="text-right">{fmtNum(o.horas_estimadas)} h</Td>
                              <Td className="text-right">{fmtNum(o.horas_reales)} h</Td>
                              <Td className="text-right">{fmtNum(o.eficiencia_tiempo)}%</Td>
                              <Td className="text-right font-semibold">{fmtNum(o.rendimiento_final)}%</Td>
                              <Td><Badge variant={nivel.variant}>{nivel.label}</Badge></Td>
                            </Tr>
                          )
                        })}
                      </Tbody>
                    </Table>
                  </div>

                  <div className="overflow-hidden" style={SURFACE}>
                    <h3 className="px-4 pt-4 pb-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>Comparativa con compañeros</h3>
                    <Table className="min-w-[640px]">
                      <Thead>
                        <Tr>
                          <Th>Producto</Th>
                          <Th>Mi promedio</Th>
                          <Th>Promedio equipo</Th>
                          <Th>Mejor del equipo</Th>
                          <Th>Posición</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {comparativaProductos.map(c => (
                          <Tr key={c.producto}>
                            <Td className="font-medium">{c.producto}</Td>
                            <Td className="text-right font-semibold">{fmtNum(c.miPromedio)}%</Td>
                            <Td className="text-right">{fmtNum(c.promedioEquipo)}%</Td>
                            <Td className="text-right">{c.mejor ? `${fmtNum(c.mejor.avg)}% (${c.mejor.nombre})` : '—'}</Td>
                            <Td>{c.posicion}° de {c.total}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </div>

                  {rankingProducto && (
                    <div className="p-4" style={SURFACE}>
                      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                        <h3 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>
                          Ranking del equipo — {rankingProducto.producto}
                        </h3>
                        <div className="max-w-[220px]">
                          <Select value={productoComparativaSel} onChange={e => setProductoComparativaSel(e.target.value)}>
                            {comparativaProductos.map(c => <option key={c.producto} value={c.producto}>{c.producto}</option>)}
                          </Select>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={Math.max(160, chartRankingProducto.length * 44)}>
                        <BarChart data={chartRankingProducto} layout="vertical" margin={{ left: 8, right: 24 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={100} />
                          <Tooltip formatter={v => [`${v}%`, 'Rendimiento']} />
                          <Bar dataKey="rendimiento" radius={[0, 4, 4, 0]}>
                            {chartRankingProducto.map((entry, idx) => (
                              <Cell key={idx} fill={entry.nombre === operarioSel ? colors.brand : colors.border} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── TAB 3 — RANKING DEL EQUIPO ───────────────────────────────── */}
          {tab === 'Ranking del Equipo' && (
            <>
              {rankingEquipo.length === 0 ? (
                <EmptyState icon={TrendingUp} title="Sin órdenes completadas en este período"
                  subtitle="El ranking del equipo aparecerá acá cuando haya órdenes finalizadas" />
              ) : (
                <>
                  <div className="overflow-hidden" style={SURFACE}>
                    <Table className="min-w-[700px]">
                      <Thead>
                        <Tr>
                          <Th>Pos</Th>
                          <Th>Operario</Th>
                          <Th>Órdenes</Th>
                          <Th>Prom Kg%</Th>
                          <Th>Prom Tiempo%</Th>
                          <Th>Rendimiento</Th>
                          <Th>Tendencia</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {rankingEquipo.map(o => {
                          const rowBg = o.pos === 1
                            ? 'rgba(253,224,71,0.18)'
                            : o.pos === 2
                              ? 'rgba(148,163,184,0.18)'
                              : o.pos === 3
                                ? 'rgba(249,115,22,0.12)'
                                : 'transparent'
                          const nivel = nivelRendimiento(o.avgRend)
                          return (
                            <Tr key={o.nombre} style={{ backgroundColor: rowBg }}>
                              <Td className="font-semibold text-lg">{MEDALLAS[o.pos - 1] || `${o.pos}°`}</Td>
                              <Td className="font-medium">{o.nombre}</Td>
                              <Td className="text-right">{o.ordenes}</Td>
                              <Td className="text-right">{fmtNum(o.avgKg)}%</Td>
                              <Td className="text-right">{fmtNum(o.avgTiempo)}%</Td>
                              <Td>
                                <div className="flex items-center gap-2">
                                  <span className="text-right font-semibold w-12">{fmtNum(o.avgRend)}%</span>
                                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: colors.border, minWidth: 60 }}>
                                    <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, o.avgRend)}%`, backgroundColor: nivel.color }} />
                                  </div>
                                </div>
                              </Td>
                              <Td><TendenciaIcon diff={o.diff} /></Td>
                            </Tr>
                          )
                        })}
                      </Tbody>
                    </Table>
                  </div>

                  <div className="p-4" style={SURFACE}>
                    <h3 className="text-sm font-semibold mb-3" style={{ color: colors.textPrimary }}>Comparativa multidimensional</h3>
                    <ResponsiveContainer width="100%" height={380}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke={colors.border} />
                        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                        <PolarRadiusAxis tick={{ fontSize: 9 }} domain={[0, 150]} />
                        {radarOperarios.map((o, idx) => (
                          <Radar key={o.nombre} name={o.nombre} dataKey={o.nombre}
                            stroke={RADAR_COLORS[idx % RADAR_COLORS.length]}
                            fill={RADAR_COLORS[idx % RADAR_COLORS.length]}
                            fillOpacity={0.15} strokeWidth={2} />
                        ))}
                        <Legend />
                        <Tooltip formatter={v => `${v}%`} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── TAB 4 — INFORME PDF EXPORTABLE ───────────────────────────── */}
          {tab === 'Informe PDF' && (
            <div className="p-4 space-y-4" style={SURFACE}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select label="Alcance" value={pdfModo} onChange={e => setPdfModo(e.target.value)}>
                  <option value="equipo">Equipo completo</option>
                  <option value="individual">Individual</option>
                </Select>
                {pdfModo === 'individual' && (
                  <Select label="Operario" value={pdfOperario} onChange={e => setPdfOperario(e.target.value)}>
                    {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
                  </Select>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select label="Período" value={pdfPeriodo} onChange={e => setPdfPeriodo(e.target.value)}>
                  {PERIODOS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  <option value="personalizado">Personalizado</option>
                </Select>
                {pdfPeriodo === 'personalizado' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="date" label="Desde" value={pdfDesde} onChange={e => setPdfDesde(e.target.value)} />
                    <Input type="date" label="Hasta" value={pdfHasta} onChange={e => setPdfHasta(e.target.value)} />
                  </div>
                )}
              </div>

              <Button variant="primary" onClick={generarPDF} loading={generandoPDF} disabled={pdfDisabled}>
                <FileDown size={15} /> Generar Informe PDF
              </Button>

              <p className="text-xs" style={{ color: colors.textMuted }}>
                El informe incluye portada, resumen ejecutivo con conclusiones automáticas y el detalle de cada
                operario con sus KPIs e historial de órdenes completadas en el período seleccionado.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
