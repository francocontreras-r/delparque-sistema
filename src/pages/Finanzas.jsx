import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import {
  DollarSign, RefreshCw, Warehouse, Thermometer, Percent,
  TrendingUp, TrendingDown, Clock, FileDown, AlertTriangle,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
  PieChart, Pie, Legend,
} from 'recharts'

// ── Constantes ─────────────────────────────────────────────────────────────────
const TABS = ['Costos', 'Márgenes', 'Resumen']

const TIPO_PRECIOS = {
  Lisa:           { costo_kg: 1200 },
  'Con Agregado': { costo_kg: 1500 },
  Agua:           { costo_kg:  900 },
  Especial:       { costo_kg: 2000 },
}

const SURFACE = { backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }

const numInputClass = 'w-24 text-right rounded-md border border-[#d1d5db] text-sm px-2 py-1 outline-none focus:ring-2 focus:ring-[#D4521A]/30 focus:border-[#D4521A]'

// ── Helpers ────────────────────────────────────────────────────────────────────
function pesos(n) { return Math.round(n || 0).toLocaleString('es-AR') }

function margenPct(costo, precio) {
  if (!precio) return 0
  return ((precio - costo) / precio) * 100
}

function nivelMargen(pct) {
  if (pct < 0)   return { nivel: 'negativo',  emoji: '🔴', label: 'NEGATIVO',  barColor: '#EF4444', rowBg: 'rgba(239,68,68,0.08)',   badgeVariant: 'danger',  descCorta: 'Pérdida' }
  if (pct < 15)  return { nivel: 'critico',   emoji: '🟠', label: 'CRÍTICO',   barColor: '#f97316', rowBg: 'rgba(249,115,22,0.08)',  badgeVariant: 'warning', descCorta: 'Crítico' }
  if (pct < 30)  return { nivel: 'bajo',      emoji: '🟡', label: 'BAJO',      barColor: '#eab308', rowBg: 'rgba(245,158,11,0.08)',  badgeVariant: 'warning', descCorta: 'Bajo' }
  if (pct <= 50) return { nivel: 'saludable', emoji: '🟢', label: 'SALUDABLE', barColor: '#22C55E', rowBg: 'transparent',            badgeVariant: 'success', descCorta: 'Saludable' }
  return          { nivel: 'excelente', emoji: '💚', label: 'EXCELENTE', barColor: '#16a34a', rowBg: 'rgba(34,197,94,0.08)',   badgeVariant: 'success', descCorta: 'Excelente' }
}

// ── Sub-componentes ────────────────────────────────────────────────────────────
function DiffBadge({ actual, anterior }) {
  if (anterior == null || Math.abs(actual - anterior) < 0.01) return null
  const delta = actual - anterior
  const pct = anterior > 0 ? Math.abs(delta / anterior) * 100 : 0
  const sube = delta > 0
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-1"
      style={{ backgroundColor: sube ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)', color: sube ? colors.danger : colors.success }}>
      {sube ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {pct.toFixed(0)}%
    </span>
  )
}

function EditableNumber({ value, onCommit }) {
  const [val, setVal] = useState(value ?? 0)
  useEffect(() => { setVal(value ?? 0) }, [value])
  return (
    <input type="number" min="0" step="0.01" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => onCommit(val)}
      className={numInputClass} />
  )
}

function TooltipMargen({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const nv = nivelMargen(p.margen)
  return (
    <div className="px-3 py-2.5 rounded-xl text-xs shadow-xl" style={{ backgroundColor: 'white', border: `1px solid ${colors.border}`, minWidth: 200 }}>
      <p className="font-bold mb-1.5" style={{ color: colors.textPrimary }}>{p.nombre}</p>
      <p style={{ color: colors.textMuted }}>Precio venta: <b style={{ color: colors.textPrimary }}>${pesos(p.precio_venta)}</b></p>
      <p style={{ color: colors.textMuted }}>Costo total:  <b style={{ color: colors.textPrimary }}>${pesos(p.costo_total)}</b></p>
      <p style={{ color: p.ganancia >= 0 ? colors.success : colors.danger }} className="font-semibold">
        Ganancia: ${pesos(p.ganancia)} ({p.margen.toFixed(1)}%)
      </p>
      <span className="mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded-full font-bold"
        style={{ backgroundColor: nv.rowBg || '#f8fafc', color: nv.barColor }}>
        {nv.emoji} {nv.label}
      </span>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function Finanzas() {
  const [tab, setTab]               = useState('Costos')
  const [sabores, setSabores]       = useState([])
  const [saborIngredientes, setSaborIngredientes] = useState([])
  const [impulsivos, setImpulsivos] = useState([])
  const [impulsivoIngredientes, setImpulsivoIngredientes] = useState([])
  const [bases, setBases]           = useState([])
  const [insumos, setInsumos]       = useState([])
  const [stockCamaras, setStockCamaras] = useState([])
  const [loading, setLoading]       = useState(true)
  const [recalculando, setRecalculando] = useState(false)
  const [generandoPDF, setGenerandoPDF] = useState(false)
  const [toast, setToast]           = useState(null)
  const [prevSnapshot, setPrevSnapshot] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [sortDir, setSortDir]       = useState('desc')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [
      { data: sab }, { data: sabIng },
      { data: imp }, { data: impIng },
      { data: bas },
      { data: ins }, { data: cam },
    ] = await Promise.all([
      supabase.from('sabores').select('*').order('nombre'),
      supabase.from('sabor_ingredientes').select('*'),
      supabase.from('impulsivos').select('*').order('nombre'),
      supabase.from('impulsivo_ingredientes').select('*'),
      supabase.from('bases').select('*').order('nombre'),
      supabase.from('insumos').select('nombre,costo_unitario,stock_actual'),
      supabase.from('stock_camaras').select('nombre,tipo_producto').in('tipo_producto', ['impulsivo', 'postre']),
    ])
    setSabores(sab || [])
    setSaborIngredientes(sabIng || [])
    setImpulsivos(imp || [])
    setImpulsivoIngredientes(impIng || [])
    setBases(bas || [])
    setInsumos(ins || [])
    setStockCamaras(cam || [])
    setLoading(false)
  }

  function showToast(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const insumoPorNombre = useMemo(() => {
    const m = {}
    insumos.forEach(i => { m[(i.nombre || '').trim().toLowerCase()] = i })
    return m
  }, [insumos])

  // Mapa nombre→tipo desde stock_camaras para separar impulsivos de postres
  const tiposMap = useMemo(() => {
    const m = {}
    stockCamaras.forEach(c => { m[(c.nombre || '').toUpperCase()] = c.tipo_producto })
    return m
  }, [stockCamaras])

  const secciones = useMemo(() => {
    const mkRow = (tabla, prefix) => (r) => ({
      key: `${prefix}-${r.id}`, id: r.id, tabla, nombre: r.nombre,
      costo_materiales: r.costo_materiales || 0,
      mano_de_obra: r.mano_de_obra || 0,
      costo_total: r.costo_total || 0,
      precio_venta: r.precio_venta || 0,
    })
    const impsRows = impulsivos.map(mkRow('impulsivos', 'impulsivo'))
    return {
      Bases:      bases.map(mkRow('bases', 'base')),
      Sabores:    sabores.map(mkRow('sabores', 'sabor')),
      Impulsivos: impsRows.filter(r => (tiposMap[(r.nombre || '').toUpperCase()] || 'impulsivo') === 'impulsivo'),
      Postres:    impsRows.filter(r => tiposMap[(r.nombre || '').toUpperCase()] === 'postre'),
    }
  }, [bases, sabores, impulsivos, tiposMap])

  const productos = useMemo(() => (
    [...secciones.Bases, ...secciones.Sabores, ...secciones.Impulsivos, ...secciones.Postres]
      .sort((x, y) => x.nombre.localeCompare(y.nombre))
  ), [secciones])

  async function actualizarCampo(producto, campo, valor) {
    const num = parseFloat(valor) || 0
    const updates = { [campo]: num }
    if (campo === 'mano_de_obra') updates.costo_total = (producto.costo_materiales || 0) + num
    const { error } = await supabase.from(producto.tabla).update(updates).eq('id', producto.id)
    if (error) { showToast(error.message, 'error'); return }
    if (producto.tabla === 'sabores') {
      setSabores(prev => prev.map(s => s.id === producto.id ? { ...s, ...updates } : s))
    } else if (producto.tabla === 'bases') {
      setBases(prev => prev.map(b => b.id === producto.id ? { ...b, ...updates } : b))
    } else {
      setImpulsivos(prev => prev.map(i => i.id === producto.id ? { ...i, ...updates } : i))
    }
  }

  function calcCostoIngredientes(ingredientes) {
    return ingredientes.reduce((acc, ing) => {
      const ins = insumoPorNombre[(ing.insumo_nombre || '').trim().toLowerCase()]
      const cu = ins?.costo_unitario ?? ing.costo_unitario ?? 0
      return acc + (ing.cantidad || 0) * cu
    }, 0)
  }

  async function recalcularTodos() {
    setRecalculando(true)
    const snap = {}
    productos.forEach(p => {
      snap[p.key] = { costo_total: p.costo_total, margen: margenPct(p.costo_total, p.precio_venta) }
    })
    for (const s of sabores) {
      const ings = saborIngredientes.filter(si => si.sabor_id === s.id)
      const costoMat = calcCostoIngredientes(ings)
      const costoTotal = costoMat + (s.mano_de_obra || 0)
      await supabase.from('sabores').update({ costo_materiales: costoMat, costo_total: costoTotal }).eq('id', s.id)
    }
    for (const i of impulsivos) {
      const ings = impulsivoIngredientes.filter(ii => ii.impulsivo_id === i.id)
      const costoMat = calcCostoIngredientes(ings)
      const costoTotal = costoMat + (i.mano_de_obra || 0)
      await supabase.from('impulsivos').update({ costo_materiales: costoMat, costo_total: costoTotal }).eq('id', i.id)
    }
    await cargar()
    setPrevSnapshot(snap)
    setLastUpdated(new Date())
    setRecalculando(false)
    showToast('Costos actualizados desde ingredientes × precios del depósito')
  }

  const margenes = useMemo(() => (
    productos.map(p => ({
      ...p,
      ganancia: (p.precio_venta || 0) - (p.costo_total || 0),
      margen: margenPct(p.costo_total, p.precio_venta),
    }))
  ), [productos])

  const margenesSorted = useMemo(() => (
    [...margenes].sort((a, b) => sortDir === 'desc' ? b.margen - a.margen : a.margen - b.margen)
  ), [margenes, sortDir])

  const chartData = useMemo(() => (
    [...margenes]
      .filter(p => p.precio_venta > 0)
      .sort((a, b) => b.margen - a.margen)
      .slice(0, 15)
      .map(p => ({ ...p, nombreCorto: p.nombre.length > 20 ? p.nombre.slice(0, 18) + '…' : p.nombre }))
  ), [margenes])

  const alertStats = useMemo(() => {
    const conPrecio = margenes.filter(p => p.precio_venta > 0)
    return {
      negativos:  conPrecio.filter(p => p.margen < 0),
      criticos:   conPrecio.filter(p => p.margen >= 0 && p.margen < 15),
      bajos:      conPrecio.filter(p => p.margen >= 15 && p.margen < 30),
      saludables: conPrecio.filter(p => p.margen >= 30 && p.margen <= 50),
      excelentes: conPrecio.filter(p => p.margen > 50),
    }
  }, [margenes])

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
    const cp = margenes.filter(p => p.precio_venta > 0)
    if (!cp.length) return 0
    return cp.reduce((a, p) => a + p.margen, 0) / cp.length
  }, [margenes])

  const distribucionCostos = useMemo(() => {
    const totalMP = productos.reduce((a, p) => a + (p.costo_materiales || 0), 0)
    const totalMO = productos.reduce((a, p) => a + (p.mano_de_obra || 0), 0)
    return [{ name: 'Materia Prima', value: totalMP }, { name: 'Mano de Obra', value: totalMO }]
  }, [productos])

  const tieneDiff = prevSnapshot != null

  // ── PDF de márgenes ──────────────────────────────────────────────────────────
  async function generarPDFMargenes() {
    setGenerandoPDF(true)
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pw = doc.internal.pageSize.getWidth()
    const ph = doc.internal.pageSize.getHeight()
    const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const conPrecio = margenes.filter(p => p.precio_venta > 0)
    const ordenado = [...conPrecio].sort((a, b) => b.margen - a.margen)

    function addBandHeader() {
      doc.setFillColor(18, 15, 56)
      doc.rect(0, 0, pw, 15, 'F')
      doc.setFontSize(7.5)
      doc.setTextColor(200, 200, 230)
      doc.text('Del Parque — Análisis de Rentabilidad', 14, 9.5)
      doc.text(fecha, pw - 14, 9.5, { align: 'right' })
      doc.setTextColor(0)
    }
    function addFooter() {
      const n = doc.getNumberOfPages()
      doc.setFontSize(7)
      doc.setTextColor(150)
      doc.text(`Pág. ${n}`, pw / 2, ph - 6, { align: 'center' })
      doc.text('Confidencial — Del Parque', pw - 14, ph - 6, { align: 'right' })
      doc.setTextColor(0)
    }
    function nivelStr(pct) {
      if (pct < 0)   return 'NEGATIVO'
      if (pct < 15)  return 'CRÍTICO'
      if (pct < 30)  return 'BAJO'
      if (pct <= 50) return 'SALUDABLE'
      return 'EXCELENTE'
    }

    // ── Pág 1: Portada ──
    doc.setFillColor(18, 15, 56)
    doc.rect(0, 0, pw, ph, 'F')
    doc.setFontSize(30); doc.setFont(undefined, 'bold'); doc.setTextColor(255, 255, 255)
    doc.text('Del Parque', pw / 2, 62, { align: 'center' })
    doc.setDrawColor(212, 82, 26); doc.setLineWidth(1.5)
    doc.line(30, 72, pw - 30, 72)
    doc.setFontSize(15); doc.setFont(undefined, 'normal')
    doc.text('ANÁLISIS DE RENTABILIDAD', pw / 2, 83, { align: 'center' })
    doc.text('POR PRODUCTO', pw / 2, 92, { align: 'center' })
    doc.setFontSize(10); doc.setTextColor(160, 160, 200)
    doc.text(`Emisión: ${fecha}`, pw / 2, 112, { align: 'center' })
    doc.text(`Productos analizados: ${conPrecio.length}`, pw / 2, 120, { align: 'center' })
    doc.setDrawColor(212, 82, 26); doc.setLineWidth(0.5)
    doc.line(30, 130, pw - 30, 130)
    doc.setFontSize(7.5); doc.setTextColor(212, 82, 26)
    doc.text('CONFIDENCIAL — USO INTERNO', pw / 2, 138, { align: 'center' })

    // ── Pág 2: Resumen ejecutivo ──
    doc.addPage()
    addBandHeader(); addFooter()
    const promM = conPrecio.length ? conPrecio.reduce((a, p) => a + p.margen, 0) / conPrecio.length : 0
    const negativosPDF = conPrecio.filter(p => p.margen < 0)
    const top1 = ordenado[0]
    const bot1 = ordenado[ordenado.length - 1]
    const perdiaTotalNeg = negativosPDF.reduce((a, p) => a + Math.abs(p.ganancia), 0)
    const top3nombres = ordenado.slice(0, 3).map(p => p.nombre).join(', ')
    const criticosPDF = conPrecio.filter(p => p.margen >= 0 && p.margen < 15)

    doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(18, 15, 56)
    doc.text('Resumen Ejecutivo', 14, 26)

    autoTable(doc, {
      startY: 32,
      head: [['Indicador', 'Valor']],
      body: [
        ['Margen promedio general', `${promM.toFixed(1)}%`],
        ['Productos analizados', conPrecio.length.toString()],
        ['Productos margen negativo', negativosPDF.length.toString()],
        ['Productos margen crítico (0–15%)', criticosPDF.length.toString()],
        ['Producto más rentable', top1 ? `${top1.nombre} (${top1.margen.toFixed(1)}%)` : '—'],
        ['Producto menos rentable', bot1 ? `${bot1.nombre} (${bot1.margen.toFixed(1)}%)` : '—'],
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [18, 15, 56], textColor: [255, 255, 255] },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 85 } },
      margin: { left: 14, right: 14 },
    })

    const yP = doc.lastAutoTable.finalY + 10
    doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(18, 15, 56)
    doc.text('Análisis automático', 14, yP)

    const parrafo = [
      `El portfolio actual de ${conPrecio.length} productos tiene un margen promedio de ${promM.toFixed(1)}%.`,
      negativosPDF.length > 0
        ? `${negativosPDF.length} producto${negativosPDF.length > 1 ? 's' : ''} opera${negativosPDF.length > 1 ? 'n' : ''} con margen negativo, representando una pérdida estimada de $${pesos(perdiaTotalNeg)} por unidad.`
        : 'Ningún producto opera con margen negativo, lo que refleja una estructura de costos saludable.',
      top3nombres ? `Los productos más rentables son: ${top3nombres}.` : '',
      criticosPDF.length > 0
        ? `Se recomienda revisar el precio de venta de: ${criticosPDF.slice(0, 3).map(p => p.nombre).join(', ')}${criticosPDF.length > 3 ? ' y otros.' : '.'}`
        : 'Todos los demás productos superan el umbral de margen crítico del 15%.',
    ].filter(Boolean).join(' ')

    doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(50, 50, 80)
    const lns = doc.splitTextToSize(parrafo, pw - 28)
    doc.text(lns, 14, yP + 8)

    // ── Pág 3: Tabla completa ──
    doc.addPage()
    addBandHeader(); addFooter()
    doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(18, 15, 56)
    doc.text('Detalle por Producto', 14, 26)

    autoTable(doc, {
      startY: 32,
      head: [['Producto', 'Tipo', 'Costo total', 'Precio venta', 'Ganancia $', 'Margen %', 'Estado']],
      body: ordenado.map(p => [
        p.nombre,
        p.tipo,
        `$${pesos(p.costo_total)}`,
        `$${pesos(p.precio_venta)}`,
        `$${pesos(p.ganancia)}`,
        `${p.margen.toFixed(1)}%`,
        nivelStr(p.margen),
      ]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [18, 15, 56], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 48 },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'center', cellWidth: 22 },
      },
      didParseCell: d => {
        if (d.section !== 'body') return
        const pct = ordenado[d.row.index]?.margen ?? 100
        if (pct < 0)        d.cell.styles.fillColor = [254, 226, 226]
        else if (pct < 15)  d.cell.styles.fillColor = [255, 237, 213]
        else if (pct < 30)  d.cell.styles.fillColor = [254, 252, 232]
        else if (pct > 50)  d.cell.styles.fillColor = [220, 252, 231]
      },
      margin: { left: 14, right: 14 },
    })

    // ── Pág 4: Recomendaciones ──
    doc.addPage()
    addBandHeader(); addFooter()
    doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(18, 15, 56)
    doc.text('Acciones Sugeridas', 14, 26)

    const acciones = conPrecio
      .filter(p => p.margen < 30)
      .sort((a, b) => a.margen - b.margen)
      .slice(0, 15)
      .map(p => {
        let situacion, accion, impacto
        if (p.margen < 0) {
          const precioMin = p.costo_total / 0.8
          situacion = `Margen negativo (${p.margen.toFixed(1)}%)`
          accion = `Subir precio a $${pesos(precioMin)} (mín. para 20% margen)`
          impacto = `Recuperar $${pesos(precioMin - p.precio_venta)}/u`
        } else if (p.margen < 15) {
          const precioIdeal = p.costo_total / 0.7
          situacion = `Margen crítico (${p.margen.toFixed(1)}%)`
          accion = `Ajustar precio a $${pesos(precioIdeal)} o reducir costo MP`
          impacto = `+${(30 - p.margen).toFixed(1)}pp de margen`
        } else {
          situacion = `Margen bajo (${p.margen.toFixed(1)}%)`
          accion = 'Monitorear precios de insumos principales'
          impacto = 'Margen en riesgo ante suba de precios'
        }
        return [p.nombre, situacion, accion, impacto]
      })

    if (acciones.length === 0) {
      doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.setTextColor(22, 163, 74)
      doc.text('¡Excelente! Todos los productos tienen margen superior al 30%.', 14, 38)
    } else {
      autoTable(doc, {
        startY: 32,
        head: [['Producto', 'Situación', 'Acción sugerida', 'Impacto estimado']],
        body: acciones,
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        headStyles: { fillColor: [212, 82, 26], textColor: [255, 255, 255] },
        columnStyles: {
          0: { cellWidth: 38 },
          1: { cellWidth: 35 },
          2: { cellWidth: 68 },
          3: { cellWidth: 39 },
        },
        didParseCell: d => {
          if (d.section !== 'body') return
          const txt = acciones[d.row.index]?.[1] || ''
          if (txt.includes('negativo'))  d.cell.styles.fillColor = [254, 226, 226]
          else if (txt.includes('crítico')) d.cell.styles.fillColor = [255, 237, 213]
        },
        margin: { left: 14, right: 14 },
      })
    }

    // ── Pág 5: Firmas ──
    doc.addPage()
    addBandHeader(); addFooter()
    doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(18, 15, 56)
    doc.text('Firmas y Aprobaciones', 14, 30)
    let yF = 50
    ;['Gerente General', 'Contador / Responsable Financiero', 'Fecha y aclaración'].forEach(rol => {
      doc.setDrawColor(150); doc.setLineWidth(0.4)
      doc.line(14, yF, 95, yF)
      doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(80)
      doc.text(rol, 14, yF + 5)
      doc.setFont(undefined, 'normal')
      doc.text('Nombre y apellido: ___________________________', 14, yF + 12)
      yF += 34
    })

    doc.save(`Rentabilidad_DelParque_${fecha.replace(/\//g, '-')}.pdf`)
    setGenerandoPDF(false)
  }

  // ── JSX ───────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <Toast toast={toast} />

      {/* Header */}
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
            <Button variant="secondary" onClick={recalcularTodos} loading={recalculando}>
              <RefreshCw size={14} /> Actualizar costos
            </Button>
          )}
          {tab === 'Márgenes' && (
            <Button variant="primary" onClick={generarPDFMargenes} loading={generandoPDF}>
              <FileDown size={14} /> Exportar PDF
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
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
          {/* ════════════════════════════ TAB COSTOS ════════════════════════════ */}
          {tab === 'Costos' && (
            <div className="space-y-6">
              {tieneDiff && (
                <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                  style={{ backgroundColor: '#f0fdf4', border: `1px solid #bbf7d0`, color: colors.success }}>
                  <RefreshCw size={11} />
                  Costos recalculados. Los badges muestran variación vs. estado anterior.
                </div>
              )}
              {[
                { key: 'Bases',      label: '🧱 BASES',      items: secciones.Bases      },
                { key: 'Sabores',    label: '🧊 SABORES',    items: secciones.Sabores    },
                { key: 'Impulsivos', label: '📦 IMPULSIVOS', items: secciones.Impulsivos },
                { key: 'Postres',    label: '🍰 POSTRES',    items: secciones.Postres    },
              ].map(({ key, label, items }) => items.length > 0 && (
                <div key={key} className="overflow-hidden" style={SURFACE}>
                  <div className="px-4 py-2.5" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>{label}</span>
                    <span className="text-xs ml-2" style={{ color: colors.textMuted }}>{items.length} producto{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[720px]">
                      <Thead>
                        <Tr>
                          <Th>Producto</Th><Th className="text-right">Costo MP ($)</Th>
                          <Th className="text-right">Mano de obra ($)</Th><Th className="text-right">Costo total ($)</Th>
                          <Th className="text-right">Precio venta ($)</Th><Th className="text-right">Margen %</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {items.map(p => {
                          const prev = prevSnapshot?.[p.key]
                          const margen = margenPct(p.costo_total, p.precio_venta)
                          const nv = nivelMargen(margen)
                          return (
                            <Tr key={p.key}>
                              <Td className="font-medium">{p.nombre}</Td>
                              <Td className="text-right">
                                ${pesos(p.costo_materiales)}
                                {tieneDiff && <DiffBadge actual={p.costo_materiales} anterior={prev ? prev.costo_total - (p.mano_de_obra || 0) : null} />}
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
                              <Td className="text-right">
                                {p.precio_venta > 0
                                  ? <span style={{ color: nv.barColor, fontWeight: '700' }}>{margen.toFixed(1)}%</span>
                                  : <span style={{ color: colors.textMuted }}>—</span>}
                              </Td>
                            </Tr>
                          )
                        })}
                      </Tbody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ═══════════════════════════ TAB MÁRGENES ═══════════════════════════ */}
          {tab === 'Márgenes' && (
            <div className="space-y-4">

              {/* Panel de alertas */}
              <div className="space-y-2">
                {alertStats.negativos.map(p => (
                  <div key={p.key} className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
                    style={{ backgroundColor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <AlertTriangle size={16} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <p className="font-bold" style={{ color: '#EF4444' }}>MARGEN NEGATIVO — {p.nombre}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#F87171' }}>
                        Estás vendiendo por debajo del costo. Perdés ${pesos(Math.abs(p.ganancia))} por unidad.
                      </p>
                    </div>
                    <span className="ml-auto text-sm font-bold flex-shrink-0" style={{ color: '#ef4444' }}>
                      {p.margen.toFixed(1)}%
                    </span>
                  </div>
                ))}
                {alertStats.criticos.map(p => (
                  <div key={p.key} className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
                    style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa' }}>
                    <AlertTriangle size={16} style={{ color: '#f97316', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <p className="font-bold" style={{ color: '#ea580c' }}>MARGEN CRÍTICO — {p.nombre}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#9a3412' }}>
                        Margen muy bajo ({p.margen.toFixed(1)}%). Apenas cubrís costos fijos y mano de obra.
                      </p>
                    </div>
                    <span className="ml-auto text-sm font-bold flex-shrink-0" style={{ color: '#f97316' }}>
                      {p.margen.toFixed(1)}%
                    </span>
                  </div>
                ))}
                {/* Resumen de los niveles positivos */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Margen bajo (15–30%)', count: alertStats.bajos.length, bg: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: 'rgba(245,158,11,0.25)' },
                    { label: 'Margen saludable (30–50%)', count: alertStats.saludables.length, bg: 'rgba(34,197,94,0.1)', color: '#22C55E', border: 'rgba(34,197,94,0.25)' },
                    { label: 'Margen excelente (>50%)', count: alertStats.excelentes.length, bg: 'rgba(34,197,94,0.12)', color: '#4ade80', border: 'rgba(74,222,128,0.3)' },
                    { label: 'Sin precio de venta', count: margenes.filter(p => !p.precio_venta).length, bg: colors.bg, color: colors.textMuted, border: colors.border },
                  ].map(({ label, count, bg, color, border }) => (
                    <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                      style={{ backgroundColor: bg, border: `1px solid ${border}` }}>
                      <span className="text-lg font-bold" style={{ color }}>{count}</span>
                      <span style={{ color }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabla completa de márgenes */}
              <div className="overflow-hidden" style={SURFACE}>
                <div className="overflow-x-auto">
                  <Table className="min-w-[860px]">
                    <Thead>
                      <Tr>
                        <Th>Producto</Th>
                        <Th>Costo MP</Th>
                        <Th>MO</Th>
                        <Th>Costo total</Th>
                        <Th>
                          <span>Precio venta</span>
                          <span className="ml-1 text-[10px] font-normal" style={{ color: colors.textMuted }}>(editable)</span>
                        </Th>
                        <Th>Ganancia $</Th>
                        <Th>
                          <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                            className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                            Margen %
                            {sortDir === 'desc' ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
                          </button>
                        </Th>
                        <Th>Alerta</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {margenesSorted.map(p => {
                        const nv = nivelMargen(p.margen)
                        const prevMargen = prevSnapshot?.[p.key]?.margen
                        const margenDrop = prevMargen != null ? p.margen - prevMargen : 0
                        return (
                          <Tr key={p.key} style={{ backgroundColor: nv.rowBg }}>
                            <Td className="font-medium max-w-[140px] truncate">{p.nombre}</Td>
                            <Td className="text-right text-xs">${pesos(p.costo_materiales)}</Td>
                            <Td className="text-right text-xs">${pesos(p.mano_de_obra)}</Td>
                            <Td className="text-right font-semibold">
                              ${pesos(p.costo_total)}
                              {tieneDiff && <DiffBadge actual={p.costo_total} anterior={prevSnapshot?.[p.key]?.costo_total} />}
                            </Td>
                            <Td className="text-right">
                              <EditableNumber value={p.precio_venta} onCommit={v => actualizarCampo(p, 'precio_venta', v)} />
                            </Td>
                            <Td className="text-right font-semibold" style={{ color: p.ganancia >= 0 ? colors.success : colors.danger }}>
                              ${pesos(p.ganancia)}
                            </Td>
                            <Td>
                              <div className="flex items-center gap-1.5">
                                {p.precio_venta > 0
                                  ? <span className="text-sm font-bold" style={{ color: nv.barColor }}>
                                      {p.margen.toFixed(1)}%
                                    </span>
                                  : <span style={{ color: colors.textMuted }}>—</span>}
                                {tieneDiff && prevMargen != null && Math.abs(margenDrop) > 0.1 && (
                                  <span className="text-[10px] font-semibold" style={{ color: margenDrop > 0 ? colors.success : colors.danger }}>
                                    {margenDrop > 0 ? '↑' : '↓'}{Math.abs(margenDrop).toFixed(1)}pp
                                  </span>
                                )}
                              </div>
                            </Td>
                            <Td>
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: nv.rowBg || '#f8fafc', color: nv.barColor, border: `1px solid ${nv.barColor}40` }}>
                                {nv.emoji} {nv.label}
                              </span>
                            </Td>
                          </Tr>
                        )
                      })}
                    </Tbody>
                  </Table>
                </div>
              </div>

              {/* Gráfico horizontal: ¿Cuánto ganás por producto? */}
              {chartData.length > 0 && (
                <div className="p-4" style={SURFACE}>
                  <h3 className="text-sm font-bold mb-1" style={{ color: colors.textPrimary }}>¿Cuánto ganás por producto?</h3>
                  <p className="text-xs mb-4" style={{ color: colors.textMuted }}>Top 15 — margen sobre precio de venta</p>
                  <ResponsiveContainer width="100%" height={Math.max(340, chartData.length * 32 + 60)}>
                    <BarChart
                      layout="vertical"
                      data={chartData}
                      margin={{ top: 4, right: 50, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colors.border} horizontal={false} />
                      <XAxis
                        type="number"
                        unit="%"
                        tick={{ fontSize: 10 }}
                        domain={[
                          d => Math.min(Math.floor(d.min) - 5, -5),
                          d => Math.max(Math.ceil(d.max) + 5, 60),
                        ]}
                      />
                      <YAxis
                        type="category"
                        dataKey="nombreCorto"
                        width={140}
                        tick={{ fontSize: 10.5 }}
                      />
                      <Tooltip content={<TooltipMargen />} />
                      <ReferenceLine x={0}  stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1.5}
                        label={{ value: '0%', position: 'insideTopLeft', fill: '#ef4444', fontSize: 9 }} />
                      <ReferenceLine x={30} stroke="#22c55e" strokeDasharray="5 5" strokeWidth={1.5}
                        label={{ value: '30% recomendado', position: 'insideTopRight', fill: '#22c55e', fontSize: 9 }} />
                      <Bar dataKey="margen" radius={[0, 4, 4, 0]} maxBarSize={22}>
                        {chartData.map((p, i) => (
                          <Cell key={i} fill={nivelMargen(p.margen).barColor} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════ TAB RESUMEN ═══════════════════════════ */}
          {tab === 'Resumen' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KpiCard label="Valor stock depósito"  value={`$${pesos(valorDeposito)}`}          icon={Warehouse}  color={colors.brand} />
                <KpiCard label="Valor stock cámaras"   value={`$${pesos(valorCamaras)}`}            icon={Thermometer} color={colors.info} />
                <KpiCard label="Margen promedio"        value={`${margenPromedio.toFixed(1)}%`}     icon={Percent}
                  color={nivelMargen(margenPromedio).barColor} />
              </div>

              <div className="p-4" style={SURFACE}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: colors.textPrimary }}>
                  Distribución de costos (Materia Prima vs. Mano de Obra)
                </h3>
                {distribucionCostos.some(d => d.value > 0) ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={distribucionCostos} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                        {distribucionCostos.map((_, i) => (
                          <Cell key={i} fill={[colors.brand, colors.info][i]} />
                        ))}
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
