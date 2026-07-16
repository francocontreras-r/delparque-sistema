import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  dibujarPortada, dibujarEncabezado, dibujarPie, dibujarSeccion, dibujarFirmas,
  getEstiloInforme, dibujarKpiCard, dibujarKpiCardDestacada,
  PDF_CONTENT_Y, PDF_NEGRO, PDF_BLANCO,
  PDF_SEM_NEG, PDF_SEM_OK, PDF_SEM_EXC,
} from '../lib/pdfEstilos'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Button from '../components/ui/Button'
import { PageHeader } from '../components/PageHeader'
import Badge from '../components/ui/Badge'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, SURFACE } from '../styles/design-system'
import { exportarCSV } from '../lib/exportar'
import { crearCosteador } from '../lib/costeoRecetas'
import { normalizarNombre } from '../lib/texto'
import { cargarHistorialCostos } from '../lib/historialCostos'
import { construirPrecioMapCamara, valorTotalCamara } from '../lib/valorCamara'
// generarPdfListaPrecios se importa de forma diferida en emitirPdfLista (trae fuentes
// e íconos embebidos ~400KB; no debe pesar en la carga de Finanzas).
import { clonarSemilla, preciosPorTier, TIER_ORDEN, migrarLista } from '../lib/listaPreciosData'
import { ICON_KEYS, ICONOS_LABELS, iconoDe, normNombre, resolverIcono } from '../lib/iconosMapa'
import { useSearchParams } from 'react-router-dom'
import {
  DollarSign, RefreshCw, Warehouse, Thermometer, Percent,
  TrendingUp, TrendingDown, Clock, FileDown, AlertTriangle,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'

// ── Constantes ─────────────────────────────────────────────────────────────────
const TABS = ['Costos', 'CIF', 'Márgenes', 'Lista de precios', 'Historial', 'Resumen Ejecutivo']

// Etiqueta corta de cada tier para la línea de referencia de costo por kg.
const TIER_CORTO = { Agua: 'Agua', Lisa: 'Crema', 'Con Agregado': 'C/Agregado', Especial: 'Especial', Rocher: 'Rocher', Pistacho: 'Pistacho' }

const CIF_PREDEFINIDOS = [
  { concepto: 'Alquiler del local',        categoria: 'fijo',     monto_mensual: 0 },
  { concepto: 'Amortización maquinaria',   categoria: 'fijo',     monto_mensual: 0 },
  { concepto: 'Seguros',                   categoria: 'fijo',     monto_mensual: 0 },
  { concepto: 'Salarios supervisores',     categoria: 'fijo',     monto_mensual: 0 },
  { concepto: 'Internet y telefonía',      categoria: 'fijo',     monto_mensual: 0 },
  { concepto: 'Energía eléctrica',         categoria: 'variable', monto_mensual: 0 },
  { concepto: 'Gas',                       categoria: 'variable', monto_mensual: 0 },
  { concepto: 'Agua',                      categoria: 'variable', monto_mensual: 0 },
  { concepto: 'Mantenimiento equipos',     categoria: 'variable', monto_mensual: 0 },
  { concepto: 'Packaging general',         categoria: 'variable', monto_mensual: 0 },
  { concepto: 'Productos de limpieza',     categoria: 'variable', monto_mensual: 0 },
]

// Tipos de sabor para precio por tipo. Lisa/Con Agregado/Agua/Especial vienen de
// la segmentación de cámara; Pistacho y Rocher son "con agregado" pero cuestan
// más de producir → precio propio (se detectan por nombre).
const TIERS_SABOR = ['Lisa', 'Con Agregado', 'Agua', 'Especial', 'Pistacho', 'Rocher']
const tierEmoji = { Lisa: '🔵', 'Con Agregado': '🟣', Agua: '🩵', Especial: '🟠', Pistacho: '🟢', Rocher: '🟤' }


const numInputClass = 'w-24 text-right rounded-md border border-[#d1d5db] text-sm px-2 py-1 outline-none focus:ring-2 focus:ring-[#FF4713]/30 focus:border-[#FF4713]'

// ── Helpers ────────────────────────────────────────────────────────────────────
function pesos(n) { return Math.round(n || 0).toLocaleString('es-AR') }

function margenPct(costo, precio) {
  if (!precio) return 0
  return ((precio - costo) / precio) * 100
}

// Marcación (markup) = ganancia sobre el COSTO. Es "cuánto le pongo arriba del
// costo" (el número que la planilla suele llamar, mal, "% ganancia").
function marcacionPct(costo, precio) {
  if (!costo) return 0
  return ((precio - costo) / costo) * 100
}

function nivelMargen(pct) {
  if (pct < 0)   return { nivel: 'negativo',   emoji: '🔴', label: 'NEGATIVO',   barColor: '#EF4444', rowBg: 'rgba(239,68,68,0.08)',  badgeVariant: 'danger',  descCorta: 'Pérdida' }
  if (pct < 15)  return { nivel: 'critico',    emoji: '🔴', label: 'CRÍTICO',    barColor: '#f97316', rowBg: 'rgba(249,115,22,0.08)', badgeVariant: 'warning', descCorta: 'Crítico' }
  if (pct < 30)  return { nivel: 'bajo',       emoji: '🟠', label: 'BAJO',       barColor: '#f59e0b', rowBg: 'rgba(245,158,11,0.08)', badgeVariant: 'warning', descCorta: 'Bajo' }
  if (pct < 45)  return { nivel: 'aceptable',  emoji: '🟡', label: 'ACEPTABLE',  barColor: '#eab308', rowBg: 'rgba(234,179,8,0.08)',  badgeVariant: 'warning', descCorta: 'Aceptable' }
  if (pct < 55)  return { nivel: 'bueno',      emoji: '🟢', label: 'BUENO',      barColor: '#22C55E', rowBg: 'rgba(34,197,94,0.06)',  badgeVariant: 'success', descCorta: 'Bueno' }
  return                 { nivel: 'excelente',  emoji: '💚', label: 'EXCELENTE',  barColor: '#16a34a', rowBg: 'rgba(34,197,94,0.1)',   badgeVariant: 'success', descCorta: 'Excelente' }
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
  const [searchParams] = useSearchParams()
  const [focoBanner, setFocoBanner] = useState(null)
  const [sabores, setSabores]       = useState([])
  const [saborIngredientes, setSaborIngredientes] = useState([])
  const [impulsivos, setImpulsivos] = useState([])
  const [impulsivoIngredientes, setImpulsivoIngredientes] = useState([])
  const [bases, setBases]           = useState([])
  const [baseIngredientes, setBaseIngredientes] = useState([])
  const [insumos, setInsumos]       = useState([])
  const [stockCamaras, setStockCamaras] = useState([])
  const [loading, setLoading]       = useState(true)
  const [recalculando, setRecalculando] = useState(false)
  const [generandoPDF, setGenerandoPDF] = useState(false)
  const [toast, setToast]           = useState(null)
  const [prevSnapshot, setPrevSnapshot] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [sortDir, setSortDir]       = useState('desc')
  const [cifConfig, setCifConfig]   = useState([])
  const [savingCIF, setSavingCIF]   = useState(false)
  const [newCIF, setNewCIF]         = useState({ concepto: '', categoria: 'fijo', monto_mensual: '' })
  const [editingCIF, setEditingCIF] = useState({}) // id → monto
  const [litrosMes, setLitrosMes]   = useState(0)
  const [seccionCostos, setSeccionCostos] = useState('Todos') // filtro Bases/Sabores/Impulsivos/Postres
  const [precioTier, setPrecioTier] = useState({}) // { tier: precio en edición }
  const [aplicandoTier, setAplicandoTier] = useState('')
  const [historial, setHistorial]   = useState({ disponible: true, rows: [] })
  const [histLoading, setHistLoading] = useState(false)
  const [precioLista, setPrecioLista] = useState(clonarSemilla()) // lista de precios (franquicia+público)
  const [guardandoPrecios, setGuardandoPrecios] = useState(false)
  const [emitiendoPdf, setEmitiendoPdf] = useState(false)
  const [emitiendoInforme, setEmitiendoInforme] = useState(false)
  const [pctAumento, setPctAumento] = useState('4')
  const [subLista, setSubLista]     = useState('margenes') // 'margenes' | 'editar'

  useEffect(() => { cargar() }, [])

  // Deep-link desde el Centro de control: ir a Márgenes ordenado de peor a mejor.
  useEffect(() => {
    const foco = searchParams.get('foco')
    if (foco === 'perdida') { setTab('Márgenes'); setSortDir('asc'); setFocoBanner('Productos que se venden a pérdida') }
    else if (foco === 'margen_bajo') { setTab('Márgenes'); setSortDir('asc'); setFocoBanner('Productos con margen bajo') }
  }, [searchParams])

  // Historial de costos: se carga la primera vez que se abre la pestaña.
  useEffect(() => {
    if (tab !== 'Historial' || historial.rows.length > 0 || histLoading) return
    setHistLoading(true)
    cargarHistorialCostos().then(r => { setHistorial(r); setHistLoading(false) })
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function cargar() {
    const hoy = new Date()
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0]
    const finMes    = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().split('T')[0]

    const [
      { data: sab }, { data: sabIng },
      { data: imp }, { data: impIng },
      { data: bas }, { data: basIng },
      { data: ins }, { data: cam },
      { data: cif },
      { data: prods },
    ] = await Promise.all([
      supabase.from('sabores').select('*').order('nombre'),
      supabase.from('sabor_ingredientes').select('*'),
      supabase.from('impulsivos').select('*').order('nombre'),
      supabase.from('impulsivo_ingredientes').select('*'),
      supabase.from('bases').select('*').order('nombre'),
      supabase.from('base_ingredientes').select('*'),
      supabase.from('insumos').select('nombre,costo_unitario,stock_actual'),
      supabase.from('stock_camaras').select('nombre,tipo_producto,tipo,kg,baldes'),
      supabase.from('cif_config').select('*').order('categoria').order('concepto'),
      supabase.from('producciones').select('peso_kg').gte('fecha', inicioMes).lte('fecha', finMes),
    ])
    setSabores(sab || [])
    setSaborIngredientes(sabIng || [])
    setImpulsivos(imp || [])
    setImpulsivoIngredientes(impIng || [])
    setBases(bas || [])
    setBaseIngredientes(basIng || [])
    setInsumos(ins || [])
    setStockCamaras(cam || [])
    // Sembrar CIF predefinidos si la tabla está vacía
    if ((cif || []).length === 0) {
      const { data: insertados } = await supabase.from('cif_config').insert(CIF_PREDEFINIDOS).select()
      setCifConfig(insertados || [])
    } else {
      setCifConfig(cif || [])
    }
    setLitrosMes((prods || []).reduce((a, p) => a + (Number(p.peso_kg) || 0), 0))
    // Lista de precios: si existe la fila guardada la usamos; si no (tabla ausente
    // o vacía), queda la semilla de listaPreciosData.js (modo lectura).
    try {
      const { data: pl } = await supabase.from('precios_lista').select('data').eq('id', 1).maybeSingle()
      if (pl?.data) {
        // Merge con la semilla para que filas guardadas antes de reventa/formatos
        // no rompan (quedan con los valores propuestos hasta que se editen).
        const seed = clonarSemilla()
        const merged = { ...seed, ...pl.data }
        if (!merged.reventa) merged.reventa = seed.reventa
        if (!merged.formatos) merged.formatos = seed.formatos
        setPrecioLista(migrarLista(merged))
      }
    } catch { /* tabla ausente → semilla */ }
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

  // Nombres de insumos de Depósito, ordenados, para elegir el packaging de reventa
  // desde un desplegable (así no hay que tipear el nombre exacto ni queda "sin vincular").
  const insumosNombres = useMemo(
    () => insumos.map(i => i.nombre).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')),
    [insumos]
  )

  // Costeador con rollup: el costo de un sabor incluye su base; el de un
  // impulsivo/postre, los sabores que usa. Resuelve intermedios recursivamente.
  const costeador = useMemo(
    () => crearCosteador({ insumos, bases, baseIngredientes, sabores, saborIngredientes }),
    [insumos, bases, baseIngredientes, sabores, saborIngredientes]
  )

  // ── CIF ──────────────────────────────────────────────────────────────────────
  const totalCIF = useMemo(() => cifConfig.filter(c => c.activo).reduce((a, c) => a + (Number(c.monto_mensual) || 0), 0), [cifConfig])
  const totalCIFfijos = useMemo(() => cifConfig.filter(c => c.activo && c.categoria === 'fijo').reduce((a, c) => a + (Number(c.monto_mensual) || 0), 0), [cifConfig])
  const totalCIFvariables = useMemo(() => cifConfig.filter(c => c.activo && c.categoria === 'variable').reduce((a, c) => a + (Number(c.monto_mensual) || 0), 0), [cifConfig])
  const cifPorLitro = useMemo(() => litrosMes > 0 ? totalCIF / litrosMes : 0, [totalCIF, litrosMes])

  async function agregarCIF() {
    if (!newCIF.concepto.trim()) { showToast('Falta el concepto', 'error'); return }
    setSavingCIF(true)
    const { data, error } = await supabase.from('cif_config').insert({ concepto: newCIF.concepto.trim(), categoria: newCIF.categoria, monto_mensual: parseFloat(newCIF.monto_mensual) || 0, activo: true }).select().single()
    setSavingCIF(false)
    if (error) { showToast(error.message, 'error'); return }
    setCifConfig(prev => [...prev, data])
    setNewCIF({ concepto: '', categoria: 'fijo', monto_mensual: '' })
    showToast('CIF agregado')
  }

  async function actualizarCIFMonto(id) {
    const monto = parseFloat(editingCIF[id]) || 0
    const { error } = await supabase.from('cif_config').update({ monto_mensual: monto }).eq('id', id)
    if (error) { showToast(error.message, 'error'); return }
    setCifConfig(prev => prev.map(c => c.id === id ? { ...c, monto_mensual: monto } : c))
    setEditingCIF(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  async function toggleActivoCIF(id, activo) {
    const { error } = await supabase.from('cif_config').update({ activo: !activo }).eq('id', id)
    if (error) { showToast(error.message, 'error'); return }
    setCifConfig(prev => prev.map(c => c.id === id ? { ...c, activo: !activo } : c))
  }

  async function eliminarCIF(id) {
    if (!window.confirm('¿Eliminar este CIF?')) return
    const { error } = await supabase.from('cif_config').delete().eq('id', id)
    if (error) { showToast(error.message, 'error'); return }
    setCifConfig(prev => prev.filter(c => c.id !== id))
  }

  // Mapa nombre→tipo desde stock_camaras para separar impulsivos de postres
  const tiposMap = useMemo(() => {
    const m = {}
    stockCamaras.forEach(c => { m[(c.nombre || '').toUpperCase()] = c.tipo_producto })
    return m
  }, [stockCamaras])

  // Mapa nombre→segmentación de sabor (Lisa/Con Agregado/Agua/Especial) desde cámara
  const tipoSaborMap = useMemo(() => {
    const m = {}
    stockCamaras.forEach(c => { if (c.tipo) m[(c.nombre || '').toUpperCase()] = c.tipo })
    return m
  }, [stockCamaras])

  // Tipo de precio de un sabor: Pistacho/Rocher por nombre (cuestan más), si no el de cámara.
  const tierDeSabor = (nombre) => {
    const n = (nombre || '').toLowerCase()
    if (n.includes('pistacho')) return 'Pistacho'
    if (n.includes('rocher')) return 'Rocher'
    return tipoSaborMap[(nombre || '').toUpperCase()] || null
  }

  // Mapa nombre→litros_base para calcular CIF por sabor
  const litrosBasePorNombre = useMemo(() => {
    const m = {}
    sabores.forEach(s => { m[(s.nombre || '').toUpperCase()] = s.litros_base || 0 })
    return m
  }, [sabores])

  // Rinde/peso por producto para pasar el costo del BATCH a costo POR UNIDAD.
  // Sabor: kg = litros_base + kg de agregados. Postre: kg = suma de kg de su receta.
  const rindeKgSabor = useMemo(() => {
    const extra = {}
    saborIngredientes.forEach(i => { if ((i.unidad || '').toLowerCase() === 'kg') extra[i.sabor_id] = (extra[i.sabor_id] || 0) + (Number(i.cantidad) || 0) })
    const m = {}
    sabores.forEach(s => { m[s.id] = (Number(s.litros_base) || 120) + (extra[s.id] || 0) })
    return m
  }, [sabores, saborIngredientes])
  const pesoKgImpulsivo = useMemo(() => {
    const m = {}
    impulsivoIngredientes.forEach(i => { if ((i.unidad || '').toLowerCase() === 'kg') m[i.impulsivo_id] = (m[i.impulsivo_id] || 0) + (Number(i.cantidad) || 0) })
    return m
  }, [impulsivoIngredientes])

  const secciones = useMemo(() => {
    const ingsDe = (tabla, id) =>
      tabla === 'sabores' ? saborIngredientes.filter(i => i.sabor_id === id)
        : tabla === 'impulsivos' ? impulsivoIngredientes.filter(i => i.impulsivo_id === id)
          : baseIngredientes.filter(i => i.base_id === id)
    const mkRow = (tabla, prefix, getCIF) => (r) => {
      // Costo de materiales EN VIVO con rollup: un sabor incluye su base; un
      // impulsivo/postre, los sabores que usa. Ya no queda en $0.
      const costoMat = ingsDe(tabla, r.id).reduce((a, i) => a + (Number(i.cantidad) || 0) * costeador.costoDe(i.insumo_nombre), 0)
      const cifKg = getCIF ? getCIF(r) : 0
      const costoTotal = costoMat + (r.mano_de_obra || 0)
      // Divisor y unidad para el costo UNITARIO (así el margen compara con el precio).
      const esPostre = tabla === 'impulsivos' && tiposMap[(r.nombre || '').toUpperCase()] === 'postre'
      let divisor = 1, unidad = 'u'
      if (tabla === 'bases') { divisor = Number(r.litros_batch) || 120; unidad = 'L' }
      else if (tabla === 'sabores') { divisor = rindeKgSabor[r.id] || 120; unidad = 'kg' }
      else if (esPostre) { divisor = pesoKgImpulsivo[r.id] || 1; unidad = 'kg' }
      // COSTO FINAL por unidad = (materia prima + mano de obra + CIF) / rinde.
      // Este es el costo que Finanzas "manda" a Cámara e Informes (se guarda en
      // costo_final al Actualizar costos). El margen se calcula contra este.
      const costoUnit = divisor > 0 ? (costoTotal + cifKg) / divisor : (costoTotal + cifKg)
      const tipoLabel = tabla === 'bases' ? 'Base'
        : tabla === 'sabores' ? `Helado · ${tierDeSabor(r.nombre)}`
        : esPostre ? 'Postre' : 'Impulsivo'
      return {
        key: `${prefix}-${r.id}`, id: r.id, tabla, nombre: r.nombre, tipo: tipoLabel,
        costo_materiales: costoMat,
        mano_de_obra: r.mano_de_obra || 0,
        costo_total: costoTotal,
        cif_kg: cifKg,
        costo_total_cif: costoTotal + cifKg,
        divisor, unidad, costo_unit: costoUnit,
        precio_venta: r.precio_venta || 0,
        litros_base: r.litros_base || 0,
        es_intermedio: !!r.es_intermedio,
      }
    }
    const cifSabor = (r) => cifPorLitro * (litrosBasePorNombre[(r.nombre || '').toUpperCase()] || 0)
    // Deduplica por nombre (evita que un producto cargado 2 veces aparezca repetido)
    const dedupe = (arr) => { const seen = new Set(); return arr.filter(x => { const k = normalizarNombre(x.nombre || ''); if (seen.has(k)) return false; seen.add(k); return true }) }
    const impsRows = dedupe(impulsivos).map(mkRow('impulsivos', 'impulsivo', null))
    return {
      Bases:      dedupe(bases).map(mkRow('bases', 'base', null)),
      Sabores:    dedupe(sabores).map(mkRow('sabores', 'sabor', cifSabor)),
      Impulsivos: impsRows.filter(r => (tiposMap[(r.nombre || '').toUpperCase()] || 'impulsivo') === 'impulsivo'),
      Postres:    impsRows.filter(r => tiposMap[(r.nombre || '').toUpperCase()] === 'postre'),
    }
  }, [bases, sabores, impulsivos, tiposMap, cifPorLitro, litrosBasePorNombre, costeador, saborIngredientes, impulsivoIngredientes, baseIngredientes, rindeKgSabor, pesoKgImpulsivo])

  // Márgenes de VENTA: excluye los intermedios (no se venden solos).
  const productos = useMemo(() => (
    [...secciones.Bases, ...secciones.Sabores.filter(s => !s.es_intermedio), ...secciones.Impulsivos, ...secciones.Postres]
      .sort((x, y) => x.nombre.localeCompare(y.nombre))
  ), [secciones])

  // Sabores agrupados por tipo de precio (para el panel "precio por tipo")
  const tierGroups = useMemo(() => {
    const g = {}; TIERS_SABOR.forEach(t => { g[t] = [] })
    const sinTipo = []
    secciones.Sabores.forEach(s => {
      const t = tierDeSabor(s.nombre)
      if (t && g[t]) g[t].push(s); else sinTipo.push(s)
    })
    return { g, sinTipo }
  }, [secciones.Sabores, tipoSaborMap]) // eslint-disable-line react-hooks/exhaustive-deps

  // Aplica un precio de venta a TODOS los sabores de un tipo (de una).
  async function aplicarPrecioTipo(tier) {
    const precio = parseFloat(precioTier[tier])
    const items = tierGroups.g[tier] || []
    if (!(precio > 0)) { showToast('Ingresá un precio válido', 'error'); return }
    if (items.length === 0) { showToast(`No hay sabores del tipo ${tier}`, 'error'); return }
    setAplicandoTier(tier)
    const ids = items.map(s => s.id)
    const { error } = await supabase.from('sabores').update({ precio_venta: precio }).in('id', ids)
    if (error) { setAplicandoTier(''); showToast(error.message, 'error'); return }
    // Historial de precios (una fila por sabor) para no perder el registro
    const hoy = new Date().toISOString().split('T')[0]
    await supabase.from('precios_historicos').insert(items.map(s => ({
      producto_nombre: s.nombre, tipo_producto: 'sabor', precio_venta: precio,
      costo_total: s.costo_total || 0,
      margen: precio > 0 ? Number(((precio - (s.costo_total || 0)) / precio * 100).toFixed(1)) : 0,
      fecha_vigencia: hoy,
    })))
    setSabores(prev => prev.map(s => ids.includes(s.id) ? { ...s, precio_venta: precio } : s))
    setAplicandoTier('')
    setPrecioTier(prev => ({ ...prev, [tier]: '' }))
    showToast(`Precio $${precio.toLocaleString('es-AR')} aplicado a ${items.length} sabor${items.length !== 1 ? 'es' : ''} ${tier}`)
  }

  async function actualizarCampo(producto, campo, valor) {
    const num = parseFloat(valor) || 0
    const updates = { [campo]: num }
    if (campo === 'mano_de_obra') updates.costo_total = (producto.costo_materiales || 0) + num
    const { error } = await supabase.from(producto.tabla).update(updates).eq('id', producto.id)
    if (error) { showToast(error.message, 'error'); return }
    if (campo === 'precio_venta') {
      const costoTotal = producto.costo_total || 0
      await supabase.from('precios_historicos').insert({
        producto_nombre: producto.nombre,
        tipo_producto: producto.tabla === 'sabores' ? 'sabor' : producto.tabla === 'impulsivos' ? 'impulsivo' : 'base',
        precio_venta: num,
        costo_total: costoTotal,
        margen: num > 0 ? ((num - costoTotal) / num * 100).toFixed(1) : 0,
        fecha_vigencia: new Date().toISOString().split('T')[0],
      })
    }
    if (producto.tabla === 'sabores') {
      setSabores(prev => prev.map(s => s.id === producto.id ? { ...s, ...updates } : s))
    } else if (producto.tabla === 'bases') {
      setBases(prev => prev.map(b => b.id === producto.id ? { ...b, ...updates } : b))
    } else {
      setImpulsivos(prev => prev.map(i => i.id === producto.id ? { ...i, ...updates } : i))
    }
  }

  function calcCostoIngredientes(ingredientes) {
    // Usa el costeador: la base y los sabores intermedios se costean por su
    // propia receta (no quedan en $0). El agua es gratis.
    return ingredientes.reduce((acc, ing) => acc + (Number(ing.cantidad) || 0) * costeador.costoDe(ing.insumo_nombre), 0)
  }

  async function recalcularTodos() {
    setRecalculando(true)
    const snap = {}
    productos.forEach(p => {
      snap[p.key] = { costo_total: p.costo_total, margen: margenPct(p.costo_unit, p.precio_venta) }
    })
    // Costo FINAL por unidad (incl. CIF) que Finanzas guarda para que lo lean los
    // demás módulos. Lo tomamos de las filas ya calculadas (secciones).
    const finalPorId = {}
    ;[...secciones.Sabores, ...secciones.Impulsivos, ...secciones.Postres].forEach(p => {
      finalPorId[`${p.tabla}:${p.id}`] = { costo_final: p.costo_unit, costo_unidad: p.unidad }
    })
    // Si las columnas costo_final aún no existen, seguimos sin ellas (degradación).
    let finalOk = true
    const actualizar = async (tabla, id, base) => {
      const fin = finalPorId[`${tabla}:${id}`]
      if (finalOk && fin) {
        const { error } = await supabase.from(tabla).update({ ...base, ...fin }).eq('id', id)
        if (!error) return
        if (error.code === '42703') finalOk = false // columna inexistente → sin costo_final
      }
      await supabase.from(tabla).update(base).eq('id', id)
    }
    for (const s of sabores) {
      const ings = saborIngredientes.filter(si => si.sabor_id === s.id)
      const costoMat = calcCostoIngredientes(ings)
      await actualizar('sabores', s.id, { costo_materiales: costoMat, costo_total: costoMat + (s.mano_de_obra || 0) })
    }
    for (const i of impulsivos) {
      const ings = impulsivoIngredientes.filter(ii => ii.impulsivo_id === i.id)
      const costoMat = calcCostoIngredientes(ings)
      await actualizar('impulsivos', i.id, { costo_materiales: costoMat, costo_total: costoMat + (i.mano_de_obra || 0) })
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
      // Ganancia y margen POR UNIDAD (costo unitario vs precio de venta unitario)
      ganancia: (p.precio_venta || 0) - (p.costo_unit || 0),
      margen: margenPct(p.costo_unit, p.precio_venta),
    }))
  ), [productos])

  const margenesSorted = useMemo(() => (
    [...margenes].sort((a, b) => sortDir === 'desc' ? b.margen - a.margen : a.margen - b.margen)
  ), [margenes, sortDir])

  // ── Lista de precios: margen de cada SABOR contra el precio de FRANQUICIA ─────
  // El precio de franquicia sale del tier del sabor (Agua/Lisa/Con Agregado/…),
  // el costo unitario ya lo calcula Finanzas. Así el margen sale sin cargar precio
  // sabor por sabor. Ordena de mayor a menor margen.
  // Margen de FÁBRICA por sabor: precio de franquicia (por tier) vs. costo unit.
  const margenesFranquicia = useMemo(() => {
    const tp = preciosPorTier(precioLista)
    return (secciones.Sabores || []).filter(s => !s.es_intermedio).map(s => {
      const tier = tierDeSabor(s.nombre)
      const precio = tier ? (Number(tp[tier]) || 0) : 0
      const costo = Number(s.costo_unit) || 0
      return { nombre: s.nombre, tier, precio, costo, ganancia: precio - costo, margen: margenPct(costo, precio), marcacion: marcacionPct(costo, precio) }
    }).sort((a, b) => b.margen - a.margen)
  }, [secciones.Sabores, precioLista]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cadena de valor por tier (lado FÁBRICA): costo promedio → precio franquicia.
  const cadenaTiers = useMemo(() => {
    const tp = preciosPorTier(precioLista)
    const g = {}
    margenesFranquicia.forEach(m => {
      if (!m.tier) return
      if (!g[m.tier]) g[m.tier] = { tier: m.tier, costos: [], precio: Number(tp[m.tier]) || 0 }
      g[m.tier].costos.push(m.costo)
    })
    return TIER_ORDEN.filter(t => g[t]).map(t => {
      const c = g[t].costos
      const costoProm = c.length ? c.reduce((a, x) => a + x, 0) / c.length : 0
      return { tier: t, costoProm, precio: g[t].precio, margenFabrica: margenPct(costoProm, g[t].precio), marcacionFabrica: marcacionPct(costoProm, g[t].precio) }
    })
  }, [margenesFranquicia, precioLista])

  const resumenFranquicia = useMemo(() => {
    const conPrecio = margenesFranquicia.filter(m => m.precio > 0)
    const prom = conPrecio.length ? conPrecio.reduce((a, m) => a + m.margen, 0) / conPrecio.length : 0
    const mejor = conPrecio.length ? Math.max(...conPrecio.map(m => m.margen)) : 0
    const vigilar = conPrecio.filter(m => m.margen < 30).length
    return { prom, mejor, vigilar, total: margenesFranquicia.length, sinPrecio: margenesFranquicia.length - conPrecio.length }
  }, [margenesFranquicia])

  // Precio de fábrica PROMEDIO por kg (promedio de la franquicia sobre todos los
  // sabores con precio). Es el costo del helado por kg para el franquiciado.
  const avgFranquiciaKg = useMemo(() => {
    const con = margenesFranquicia.filter(m => m.precio > 0)
    return con.length ? con.reduce((a, m) => a + m.precio, 0) / con.length : 0
  }, [margenesFranquicia])

  // Costo por unidad de cada insumo de reventa (Depósito ÷ unidades por paquete).
  const reventaCostos = useMemo(() => {
    const m = {}
    ;(precioLista.reventa || []).forEach(r => {
      const rinde = Number(r.unidadesPorPaquete) || 1
      const costoDep = costeador.costoDe(r.nombre) || 0
      m[normalizarNombre(r.nombre)] = { costoU: rinde > 0 ? costoDep / rinde : costoDep, reventaU: Number(r.precioFranquicia) || 0, costoDep }
    })
    return m
  }, [precioLista.reventa, costeador])

  // Margen del FRANQUICIADO por formato de venta: (público − costo) / público,
  // donde costo = helado (kg × precio fábrica promedio) + packaging (a precio de
  // reventa, lo que el franquiciado te paga). También el margen que TE deja a vos
  // el packaging (reventa − costo).
  const margenPorFormato = useMemo(() => {
    const rows = []
    ;(precioLista.formatos || []).forEach(f => {
      const kg = Number(f.kg) || 0
      const publico = Number(f.precioVenta) || 0
      const costoHelado = kg * avgFranquiciaKg
      // Compat: si por algún motivo quedó sin presentaciones, tomamos el packaging suelto.
      const presentaciones = (f.presentaciones && f.presentaciones.length)
        ? f.presentaciones
        : [{ nombre: 'Única', packaging: f.packaging || [] }]
      presentaciones.forEach(pr => {
        let costoPack = 0, gananciaPackFabrica = 0, sinVincular = false
        ;(pr.packaging || []).forEach(p => {
          const info = reventaCostos[normalizarNombre(p.nombre)]
          const cant = Number(p.cantidad) || 0
          if (!info) { sinVincular = true; return }
          // El franquiciado paga la reventa; si no la cargaste, usamos el costo (como el Excel).
          const packUnit = info.reventaU > 0 ? info.reventaU : info.costoU
          costoPack += cant * packUnit
          gananciaPackFabrica += cant * (info.reventaU > 0 ? info.reventaU - info.costoU : 0)
        })
        const costoFranq = costoHelado + costoPack
        rows.push({
          key: `${f.producto}·${pr.nombre}`,
          producto: f.producto, presentacion: pr.nombre, kg, publico,
          costoHelado, costoPack, costoFranq,
          margen: margenPct(costoFranq, publico), marcacion: marcacionPct(costoFranq, publico),
          gananciaPackFabrica, sinVincular,
        })
      })
    })
    return rows
  }, [precioLista, avgFranquiciaKg, reventaCostos])

  const resumenFormato = useMemo(() => {
    const con = margenPorFormato.filter(f => f.publico > 0)
    const prom = con.length ? con.reduce((a, f) => a + f.margen, 0) / con.length : 0
    return { prom, total: con.length }
  }, [margenPorFormato])

  // Cuántas presentaciones tiene cada producto (para unificar la celda "Producto").
  const formatoGrupoCount = useMemo(() => {
    const m = {}
    margenPorFormato.forEach(f => { m[f.producto] = (m[f.producto] || 0) + 1 })
    return m
  }, [margenPorFormato])

  // Stats por producto: promedio de margen + cuál presentación es la más rentable
  // (best) y la de menor margen (worst). Solo marca best/worst si hay más de una.
  const formatoStats = useMemo(() => {
    const g = {}
    margenPorFormato.forEach(f => { (g[f.producto] = g[f.producto] || []).push(f) })
    const m = {}
    Object.entries(g).forEach(([prod, rows]) => {
      const conP = rows.filter(r => r.publico > 0)
      const prom = conP.length ? conP.reduce((a, r) => a + r.margen, 0) / conP.length : 0
      let bestKey = null, worstKey = null
      if (conP.length > 1) {
        const ord = [...conP].sort((a, b) => b.margen - a.margen)
        bestKey = ord[0].key
        worstKey = ord[ord.length - 1].key
      }
      m[prod] = { count: rows.length, prom, bestKey, worstKey }
    })
    return m
  }, [margenPorFormato])

  // Referencia del costo del helado por kg: promedio + desglose por tier (precio de
  // franquicia de cada categoría). Contextualiza el promedio que usa la tabla.
  const tierRef = useMemo(() => {
    const tp = preciosPorTier(precioLista)
    return TIER_ORDEN.filter(t => (tp[t] || 0) > 0).map(t => ({ tier: t, precio: tp[t] }))
  }, [precioLista])

  // Simulador: si aplicás +pct% a la lista de franquicia, cómo quedan los promedios
  // de margen (fábrica y franquiciado) SIN aplicar todavía. Redondea a $50 como el
  // aumento real. Devuelve null si el % es 0.
  const proyeccionAumento = useMemo(() => {
    const pct = Number(pctAumento) || 0
    if (!pct) return null
    const fac = 1 + pct / 100
    const r50 = n => Math.round((Number(n) || 0) * fac / 50) * 50
    const tp = preciosPorTier(precioLista)
    const nuevoTp = {}; Object.entries(tp).forEach(([t, p]) => { nuevoTp[t] = r50(p) })
    const sab = margenesFranquicia.filter(m => m.tier)
    const fabDesp = sab.length ? sab.reduce((a, m) => a + margenPct(m.costo, nuevoTp[m.tier] || 0), 0) / sab.length : 0
    const conP = sab.filter(m => (nuevoTp[m.tier] || 0) > 0)
    const nuevoAvgKg = conP.length ? conP.reduce((a, m) => a + (nuevoTp[m.tier] || 0), 0) / conP.length : 0
    let acc = 0, n = 0
    ;(precioLista.formatos || []).forEach(f => {
      const pv = Number(f.precioVenta) || 0; if (!pv) return
      const kg = Number(f.kg) || 0
      ;(f.presentaciones || []).forEach(pr => {
        let cp = 0
        ;(pr.packaging || []).forEach(p => {
          const info = reventaCostos[normalizarNombre(p.nombre)]
          if (info) cp += (Number(p.cantidad) || 0) * (info.reventaU > 0 ? info.reventaU : info.costoU)
        })
        acc += margenPct(kg * nuevoAvgKg + cp, pv); n++
      })
    })
    return { pct, fabAntes: resumenFranquicia.prom, fabDesp, franqAntes: resumenFormato.prom, franqDesp: n ? acc / n : 0 }
  }, [pctAumento, precioLista, margenesFranquicia, reventaCostos, resumenFranquicia, resumenFormato]) // eslint-disable-line react-hooks/exhaustive-deps

  // Comparativa vs. competencia: posición de cada producto (más barato / más caro).
  const competenciaStats = useMemo(() => {
    const filas = precioLista.competencia?.filas || []
    return filas.map(f => {
      const comps = (f.comp || []).map(Number).filter(x => x > 0)
      const propio = Number(f.propio) || 0
      const minC = comps.length ? Math.min(...comps) : null
      const maxC = comps.length ? Math.max(...comps) : null
      let pos = null
      if (propio > 0 && comps.length) pos = propio < minC ? 'barato' : propio > maxC ? 'caro' : 'medio'
      return { ...f, propio, pos }
    })
  }, [precioLista.competencia])

  // Handlers de edición de reventa (packaging) y formatos.
  function editarReventa(idx, campo, valor) {
    setPrecioLista(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const fila = (next.reventa || [])[idx]
      if (fila) fila[campo] = campo === 'nombre' ? valor : (valor === '' ? 0 : Number(valor))
      return next
    })
  }
  function agregarReventa() {
    setPrecioLista(prev => ({ ...prev, reventa: [...(prev.reventa || []), { nombre: '', unidadesPorPaquete: 1, precioFranquicia: 0 }] }))
  }
  function quitarReventa(idx) {
    setPrecioLista(prev => ({ ...prev, reventa: (prev.reventa || []).filter((_, i) => i !== idx) }))
  }
  function editarFormatoCampo(idx, campo, valor) {
    setPrecioLista(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const f = (next.formatos || [])[idx]
      if (f) f[campo] = campo === 'producto' ? valor : (valor === '' ? 0 : Number(valor))
      return next
    })
  }
  function agregarFormato() {
    setPrecioLista(prev => ({ ...prev, formatos: [...(prev.formatos || []), { producto: 'Nuevo producto', kg: 0, precioVenta: 0, presentaciones: [{ nombre: 'Presentación 1', packaging: [] }] }] }))
  }
  function quitarFormato(fIdx) {
    setPrecioLista(prev => ({ ...prev, formatos: (prev.formatos || []).filter((_, i) => i !== fIdx) }))
  }
  function editarPresentacionNombre(fIdx, prIdx, valor) {
    setPrecioLista(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const pr = next.formatos?.[fIdx]?.presentaciones?.[prIdx]
      if (pr) pr.nombre = valor
      return next
    })
  }
  function agregarPresentacion(fIdx) {
    setPrecioLista(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const f = next.formatos?.[fIdx]
      if (f) { f.presentaciones = f.presentaciones || []; f.presentaciones.push({ nombre: `Presentación ${f.presentaciones.length + 1}`, packaging: [] }) }
      return next
    })
  }
  function quitarPresentacion(fIdx, prIdx) {
    setPrecioLista(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const f = next.formatos?.[fIdx]
      if (f?.presentaciones) f.presentaciones = f.presentaciones.filter((_, i) => i !== prIdx)
      return next
    })
  }
  function editarFormatoPack(fIdx, prIdx, pIdx, campo, valor) {
    setPrecioLista(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const p = next.formatos?.[fIdx]?.presentaciones?.[prIdx]?.packaging?.[pIdx]
      if (p) p[campo] = campo === 'nombre' ? valor : (valor === '' ? 0 : Number(valor))
      return next
    })
  }
  function agregarFormatoPack(fIdx, prIdx) {
    setPrecioLista(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const pr = next.formatos?.[fIdx]?.presentaciones?.[prIdx]
      if (pr) { pr.packaging = pr.packaging || []; pr.packaging.push({ nombre: '', cantidad: 1 }) }
      return next
    })
  }
  function quitarFormatoPack(fIdx, prIdx, pIdx) {
    setPrecioLista(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const pr = next.formatos?.[fIdx]?.presentaciones?.[prIdx]
      if (pr?.packaging) pr.packaging = pr.packaging.filter((_, i) => i !== pIdx)
      return next
    })
  }
  // Competencia
  function editarCompetidorNombre(cIdx, valor) {
    setPrecioLista(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      if (next.competencia?.competidores) next.competencia.competidores[cIdx] = valor
      return next
    })
  }
  function editarCompetenciaFila(idx, campo, valor, cIdx) {
    setPrecioLista(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const fila = next.competencia?.filas?.[idx]
      if (!fila) return next
      if (campo === 'producto') fila.producto = valor
      else if (campo === 'propio') fila.propio = valor === '' ? 0 : Number(valor)
      else if (campo === 'comp') { fila.comp = fila.comp || []; fila.comp[cIdx] = valor === '' ? 0 : Number(valor) }
      return next
    })
  }
  function agregarCompetenciaFila() {
    setPrecioLista(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const nComp = (next.competencia?.competidores || []).length
      next.competencia = next.competencia || { competidores: ['Competidor 1', 'Competidor 2'], filas: [] }
      next.competencia.filas.push({ producto: 'Nuevo', propio: 0, comp: Array(nComp).fill(0) })
      return next
    })
  }
  function quitarCompetenciaFila(idx) {
    setPrecioLista(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      if (next.competencia?.filas) next.competencia.filas = next.competencia.filas.filter((_, i) => i !== idx)
      return next
    })
  }

  // Aumento masivo: multiplica los precios del alcance por (1 + pct/100) y
  // redondea a $50. NO guarda (queda en pantalla para revisar y luego Guardar).
  function aumentarPrecios(scope) {
    const pct = Number(pctAumento)
    if (!pct) { showToast('Ingresá un porcentaje distinto de 0', 'error'); return }
    const f = 1 + pct / 100
    const r50 = n => Math.round((Number(n) || 0) * f / 50) * 50
    setPrecioLista(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const secs = scope === 'todo' ? ['franquicia', 'publico'] : [scope]
      secs.forEach(sec => Object.values(next[sec] || {}).forEach(arr => arr.forEach(row => {
        if (row.precio != null) row.precio = r50(row.precio)
        if (row.precio2 != null) row.precio2 = r50(row.precio2)
      })))
      return next
    })
    const lbl = scope === 'todo' ? 'todos los precios' : scope === 'franquicia' ? 'los precios de franquicia' : 'los precios al público'
    showToast(`${pct > 0 ? '+' : ''}${pct}% aplicado a ${lbl}. Revisá y tocá "Guardar precios".`)
  }

  // Informe INTERNO para los dueños: costos + margen fábrica + margen franquiciado.
  async function emitirInformeDuenos() {
    setEmitiendoInforme(true)
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight()
      const hoy = new Date().toLocaleString('es-AR')
      const EST = getEstiloInforme()
      const NARANJA = [220, 69, 26]
      const money = n => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`
      const pct = n => `${(Number(n) || 0).toFixed(1)}%`
      const semaforo = m => m < 15 ? PDF_SEM_NEG : m < 30 ? [245, 158, 11] : m <= 50 ? PDF_SEM_OK : PDF_SEM_EXC
      const neto = n => (Number(n) || 0) / 1.21   // precio de franquicia sin IVA (21%)

      // Estilo de tabla con VALORES CENTRADOS y un poco más de aire (informe con impacto).
      const ESTC = {
        ...EST,
        styles: { ...EST.styles, halign: 'center', valign: 'middle', fontSize: 8, cellPadding: 3, lineColor: [225, 225, 225] },
        headStyles: { ...EST.headStyles, halign: 'center', fontSize: 8, cellPadding: 3.2, fillColor: [26, 26, 26] },
        alternateRowStyles: { fillColor: [248, 246, 244] },
      }
      // Sección con barra de acento naranja (más impacto que la línea gris sola).
      const seccion = (titulo, yy) => {
        doc.setFillColor(...NARANJA); doc.rect(14, yy - 3.7, 2.6, 5.6, 'F')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20, 20, 20)
        doc.text(titulo, 19, yy)
        doc.setDrawColor(215, 215, 215); doc.setLineWidth(0.2); doc.line(14, yy + 3, pw - 14, yy + 3)
        return yy + 10
      }

      // Datos de FÁBRICA netos de IVA (los precios de franquicia se cargan con IVA).
      const cadenaNeto = cadenaTiers.map(c => {
        const pn = neto(c.precio)
        return { ...c, precioNeto: pn, margenNeto: margenPct(c.costoProm, pn), marcNeto: marcacionPct(c.costoProm, pn) }
      })
      const margenesNeto = margenesFranquicia.map(m => {
        const pn = neto(m.precio)
        return { ...m, precioNeto: pn, margenNeto: margenPct(m.costo, pn), marcNeto: marcacionPct(m.costo, pn) }
      })
      const conPrecioNeto = margenesNeto.filter(m => m.precio > 0)
      const fabPromNeto = conPrecioNeto.length ? conPrecioNeto.reduce((a, m) => a + m.margenNeto, 0) / conPrecioNeto.length : 0

      dibujarPortada(doc, pw, ph, 'FINANZAS', 'Informe de Márgenes · Franquicias', precioLista.vigencia || '', hoy)
      doc.addPage()
      dibujarEncabezado(doc, pw, 'FINANZAS', 'INFORME DE MÁRGENES', hoy)
      dibujarPie(doc, pw, ph, 2)
      let y = PDF_CONTENT_Y

      // KPIs: margen fábrica y franquiciado promedio
      const gap = 6, cardW = (pw - 28 - 2 * gap) / 3, cardH = 23
      dibujarKpiCard(doc, 14, y, cardW, cardH, 'Sabores', String(resumenFranquicia.total), NARANJA)
      dibujarKpiCardDestacada(doc, 14 + cardW + gap, y, cardW, cardH, 'Margen fábrica prom. (sin IVA)', pct(fabPromNeto), semaforo(fabPromNeto))
      dibujarKpiCardDestacada(doc, 14 + 2 * (cardW + gap), y, cardW, cardH, 'Margen franquiciado prom.', pct(resumenFormato.prom), semaforo(resumenFormato.prom))
      y += cardH + 8

      // Narrativa
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...PDF_NEGRO)
      const nar =
        `Este informe muestra la rentabilidad de la línea de helados en dos planos. El MARGEN de FÁBRICA es lo que gana Helados del Parque al venderle a sus franquicias: precio de franquicia (neto, sin IVA 21%) menos el costo de producción, por categoría (tier). ` +
        `El MARGEN del FRANQUICIADO es lo que le queda al franquiciado por formato de venta al público: su costo es el helado (kg × precio de fábrica promedio de ${money(avgFranquiciaKg)}/kg) más el packaging, contrastado contra el precio público. ` +
        `Cada margen se expresa de dos formas: "s/venta" = ganancia sobre el precio (rentabilidad real), y "marcación s/costo" = cuánto se agrega sobre el costo (para fijar precios). Vigencia: ${precioLista.vigencia || '—'}.`
      const ln = doc.splitTextToSize(nar, pw - 28)
      ln.forEach((l, i) => doc.text(l, 14, y + i * 5)); y += ln.length * 5 + 6

      // ── Cómo leer los márgenes (para explicárselo a los dueños) ──────────────
      if (y > ph - 78) { doc.addPage(); dibujarEncabezado(doc, pw, 'FINANZAS', 'INFORME DE MÁRGENES', hoy); dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber); y = PDF_CONTENT_Y }
      y = seccion('Cómo leer los márgenes', y)
      // Ejemplo real: primera presentación con precio y costo válidos.
      const ej = margenPorFormato.find(f => f.publico > 0 && f.costoFranq > 0)
      const eCosto = ej ? ej.costoFranq : 1179
      const ePrecio = ej ? ej.publico : 1900
      const eGan = ePrecio - eCosto
      const eNom = ej ? `${ej.producto} · ${ej.presentacion}` : 'Helado 1 sabor · Cono N°00'
      const eMargen = ePrecio ? eGan / ePrecio * 100 : 0
      const eMarc = eCosto ? eGan / eCosto * 100 : 0
      const bx = 14, bw = pw - 28, bTop = y
      const drawTxt = (t, x, yy, opt = {}) => {
        doc.setFont('helvetica', opt.b ? 'bold' : 'normal'); doc.setFontSize(opt.s || 9); doc.setTextColor(...(opt.c || PDF_NEGRO))
        doc.text(t, x, yy)
      }
      let iy = bTop + 8
      drawTxt(`Ejemplo — ${eNom}`, bx + 6, iy, { b: true, s: 9.5 })
      iy += 6
      drawTxt(`Costo ${money(eCosto)}    ·    Precio de venta ${money(ePrecio)}    ·    Ganancia ${money(eGan)}`, bx + 6, iy, { s: 9 })
      iy += 9
      drawTxt(`Margen s/venta   ${money(eGan)} / ${money(ePrecio)} = ${eMargen.toFixed(1)}%`, bx + 6, iy, { b: true, c: PDF_SEM_OK, s: 9.5 })
      iy += 5
      doc.setTextColor(...PDF_NEGRO)
      doc.splitTextToSize(`Rentabilidad real: de cada $100 que vende, ${eMargen.toFixed(0)} son ganancia. Nunca supera el 100%. Sirve para saber si un producto conviene y comparar entre productos.`, bw - 14)
        .forEach((l, i) => drawTxt(l, bx + 6, iy + i * 4.5, { s: 8.5 }))
      iy += 4.5 * 2 + 6
      drawTxt(`Marcación s/costo   ${money(eGan)} / ${money(eCosto)} = ${eMarc.toFixed(0)}%`, bx + 6, iy, { b: true, c: NARANJA, s: 9.5 })
      iy += 5
      doc.splitTextToSize(`Cuánto se agrega sobre el costo. Puede superar el 100% (el precio es más del doble del costo). Sirve para poner precios: "a este producto le pongo X% arriba del costo".`, bw - 14)
        .forEach((l, i) => drawTxt(l, bx + 6, iy + i * 4.5, { s: 8.5 }))
      iy += 4.5 * 2 + 6
      drawTxt('En una frase: s/venta = cuánto ganás;  s/costo = cuánto le sumás al costo para fijar el precio.', bx + 6, iy, { b: true, s: 9 })
      const bBottom = iy + 4
      // Marco y barra de acento (dibujados detrás no se puede; los ponemos alrededor).
      doc.setDrawColor(220); doc.setLineWidth(0.3); doc.roundedRect(bx, bTop, bw, bBottom - bTop, 2, 2, 'S')
      doc.setFillColor(...NARANJA); doc.rect(bx, bTop, 1.5, bBottom - bTop, 'F')
      y = bBottom + 8

      // Margen del franquiciado por presentación
      y = seccion('Margen del franquiciado por presentación', y)
      autoTable(doc, {
        ...ESTC, startY: y,
        head: [['PRODUCTO', 'PRESENTACIÓN', 'KG', 'C. HELADO', 'C. PACK.', 'C. TOTAL', 'P. VENTA', 'MARGEN s/venta', 'MARC. s/costo']],
        body: margenPorFormato.map((f, i) => {
          const first = i === 0 || margenPorFormato[i - 1].producto !== f.producto
          const st = formatoStats[f.producto] || {}
          const rest = [f.presentacion, String(f.kg), money(f.costoHelado), money(f.costoPack), money(f.costoFranq), money(f.publico), pct(f.margen), `${f.marcacion.toFixed(0)}%`]
          // Celda "Producto" unificada (rowSpan); con promedio si tiene más de una presentación.
          const etiqueta = st.count > 1 ? `${f.producto}\n(prom ${st.prom.toFixed(0)}%)` : f.producto
          return first ? [{ content: etiqueta, rowSpan: st.count || 1, styles: { valign: 'middle', halign: 'left', fontStyle: 'bold' } }, ...rest] : rest
        }),
        columnStyles: { 1: { halign: 'left' } },
        didParseCell: d => { if (d.section === 'body' && d.column.index === 7) { d.cell.styles.textColor = semaforo(margenPorFormato[d.row.index]?.margen ?? 0); d.cell.styles.fontStyle = 'bold' } },
      })
      y = doc.lastAutoTable.finalY + 8

      // Cadena de valor por categoría (lado fábrica, sin IVA)
      if (y > ph - 40) { doc.addPage(); dibujarEncabezado(doc, pw, 'FINANZAS', 'INFORME DE MÁRGENES', hoy); dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber); y = PDF_CONTENT_Y }
      y = seccion('Margen de fábrica por categoría — por kg, sin IVA', y)
      autoTable(doc, {
        ...ESTC, startY: y,
        head: [['CATEGORÍA', 'COSTO FÁBRICA', 'PRECIO FRANQUICIA', 'MARGEN s/venta', 'MARCACIÓN s/costo']],
        body: cadenaNeto.map(c => [c.tier, money(c.costoProm), money(c.precioNeto), pct(c.margenNeto), `${c.marcNeto.toFixed(0)}%`]),
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
        didParseCell: d => { if (d.section === 'body' && d.column.index === 3) { d.cell.styles.textColor = semaforo(cadenaNeto[d.row.index]?.margenNeto ?? 0); d.cell.styles.fontStyle = 'bold' } },
      })
      y = doc.lastAutoTable.finalY + 8

      // Márgenes de fábrica por sabor (sin IVA)
      if (y > ph - 40) { doc.addPage(); dibujarEncabezado(doc, pw, 'FINANZAS', 'INFORME DE MÁRGENES', hoy); dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber); y = PDF_CONTENT_Y }
      y = seccion('Margen de fábrica por sabor — sin IVA', y)
      autoTable(doc, {
        ...ESTC, startY: y, margin: { top: PDF_CONTENT_Y, left: 14, right: 14 },
        head: [['SABOR', 'TIER', 'COSTO/KG', 'FRANQUICIA/KG', 'MARGEN s/venta', 'MARCACIÓN s/costo']],
        body: margenesNeto.map(m => [m.nombre, m.tier || '—', money(m.costo), money(m.precioNeto), pct(m.margenNeto), `${m.marcNeto.toFixed(0)}%`]),
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
        didParseCell: d => { if (d.section === 'body' && d.column.index === 4) { d.cell.styles.textColor = semaforo(margenesNeto[d.row.index]?.margenNeto ?? 0); d.cell.styles.fontStyle = 'bold' } },
        didDrawPage: () => { dibujarEncabezado(doc, pw, 'FINANZAS', 'INFORME DE MÁRGENES', hoy); dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber) },
      })
      y = doc.lastAutoTable.finalY + 8

      // Comparativa vs. competencia (precio al público)
      const comp = precioLista.competencia
      if (comp?.filas?.length) {
        if (y > ph - 50) { doc.addPage(); dibujarEncabezado(doc, pw, 'FINANZAS', 'INFORME DE MÁRGENES', hoy); dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber); y = PDF_CONTENT_Y }
        y = seccion('Comparativa vs. competencia — precio al público', y)
        const posTxt = f => {
          const cs = (f.comp || []).map(Number).filter(x => x > 0), pr = Number(f.propio) || 0
          if (!pr || !cs.length) return '—'
          return pr < Math.min(...cs) ? 'Más barato' : pr > Math.max(...cs) ? 'Más caro' : 'En el medio'
        }
        const filasComp = comp.filas.map(f => ({ f, pos: posTxt(f) }))
        autoTable(doc, {
          ...ESTC, startY: y, margin: { top: PDF_CONTENT_Y, left: 14, right: 14 },
          head: [['PRODUCTO', 'DEL PARQUE', ...(comp.competidores || []).map(c => c.toUpperCase()), 'POSICIÓN']],
          body: filasComp.map(({ f, pos }) => [f.producto, Number(f.propio) > 0 ? money(f.propio) : '—', ...(f.comp || []).map(c => Number(c) > 0 ? money(c) : '—'), pos]),
          columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
          didParseCell: d => {
            const posCol = 2 + (comp.competidores || []).length
            if (d.section === 'body' && d.column.index === posCol) {
              const p = filasComp[d.row.index]?.pos
              if (p === 'Más barato') { d.cell.styles.textColor = PDF_SEM_OK; d.cell.styles.fontStyle = 'bold' }
              else if (p === 'Más caro') { d.cell.styles.textColor = PDF_SEM_NEG; d.cell.styles.fontStyle = 'bold' }
            }
          },
          didDrawPage: () => { dibujarEncabezado(doc, pw, 'FINANZAS', 'INFORME DE MÁRGENES', hoy); dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber) },
        })
      }

      doc.save(`informe-margenes-franquicias-${(precioLista.vigencia || 'lista').toLowerCase().replace(/\s+/g, '-')}.pdf`)
    } catch (e) { showToast('No se pudo generar el informe: ' + (e.message || ''), 'error') }
    finally { setEmitiendoInforme(false) }
  }

  // Edita un precio de la lista en memoria (no persiste hasta "Guardar precios").
  function editarPrecio(seccion, cat, idx, campo, valor) {
    setPrecioLista(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const fila = next?.[seccion]?.[cat]?.[idx]
      if (fila) fila[campo] = valor === '' ? (campo === 'precio2' ? null : 0) : Number(valor)
      return next
    })
  }
  function editarVigencia(v) { setPrecioLista(prev => ({ ...prev, vigencia: v })) }
  // Override manual del ícono de un producto (para el PDF). '' = volver a Automático.
  function editarIcono(nombre, key) {
    setPrecioLista(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      next.iconos = next.iconos || {}
      const k = normNombre(nombre)
      if (key) next.iconos[k] = key
      else delete next.iconos[k]
      return next
    })
  }

  async function guardarPrecios() {
    setGuardandoPrecios(true)
    try {
      const { error } = await supabase.from('precios_lista').upsert(
        { id: 1, data: precioLista, vigencia: precioLista.vigencia || null, actualizado: new Date().toISOString() },
        { onConflict: 'id' })
      if (error) {
        // Tabla ausente: Postgres devuelve 42P01; PostgREST, PGRST205 / "schema cache".
        const faltaTabla = error.code === '42P01' || error.code === 'PGRST205' ||
          /schema cache|could not find the table/i.test(error.message || '')
        if (faltaTabla) showToast('Falta crear la tabla precios_lista en Supabase (corré sql/precios_lista.sql). Los precios están cargados pero no se pueden guardar hasta crearla.', 'error')
        else showToast(error.message, 'error')
      } else showToast('Lista de precios guardada')
    } catch (e) { showToast(e.message || 'No se pudo guardar', 'error') }
    finally { setGuardandoPrecios(false) }
  }

  async function emitirPdfLista() {
    setEmitiendoPdf(true)
    try {
      // Cargar assets de marca como dataURL (logo a color + isotipo watermark),
      // con su relación de aspecto real. Si falla, el PDF cae al texto "Del Parque".
      const cargarImg = async (src) => {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
        c.getContext('2d').drawImage(img, 0, 0)
        return { data: c.toDataURL('image/png'), ratio: img.naturalWidth / img.naturalHeight }
      }
      let logo = null, marca = null
      // ?v: cache-buster para que el navegador tome el logo actualizado (el
      // isotipo se rehizo en alta calidad) y no sirva la versión vieja cacheada.
      try { logo = await cargarImg('/logo-lista-color.png?v=164') } catch { logo = null }
      try { marca = await cargarImg('/isotipo-naranja.png') } catch { marca = null }
      const { generarPdfListaPrecios } = await import('../lib/pdfListaPrecios')
      const doc = generarPdfListaPrecios(precioLista, { logo, marca, fecha: new Date().toLocaleDateString('es-AR') })
      const slug = (precioLista.vigencia || 'lista').toLowerCase().replace(/\s+/g, '-')
      doc.save(`lista-precios-${slug}.pdf`)
    } catch (e) { showToast('No se pudo generar el PDF: ' + (e.message || ''), 'error') }
    finally { setEmitiendoPdf(false) }
  }

  // Resumen del historial de costos: variación acumulada por insumo + inflación
  // promedio del período. Ordena de mayor a menor suba.
  const histResumen = useMemo(() => {
    const rows = historial.rows || []
    const conVar = rows.filter(r => r.variacion_pct != null)
    const inflacionProm = conVar.length
      ? conVar.reduce((a, r) => a + Number(r.variacion_pct), 0) / conVar.length
      : 0
    // Agrupar por insumo (rows vienen desc por fecha → [0] es el más nuevo).
    const porItem = {}
    rows.forEach(r => {
      const k = r.item_nombre
      if (!porItem[k]) porItem[k] = { nombre: k, tipo: r.tipo, ultimo: r.costo_nuevo, ultimaFecha: r.fecha, primero: r.costo_nuevo, cambios: 0 }
      porItem[k].primero = r.costo_anterior != null ? r.costo_anterior : r.costo_nuevo
      porItem[k].cambios += 1
    })
    const items = Object.values(porItem).map(it => ({
      ...it,
      variacionAcum: it.primero > 0 ? ((it.ultimo - it.primero) / it.primero * 100) : null,
    })).sort((a, b) => (b.variacionAcum ?? -Infinity) - (a.variacionAcum ?? -Infinity))
    return { inflacionProm, items, totalRegistros: rows.length, itemsDistintos: items.length }
  }, [historial])

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

  // Valoriza el stock en cámara con la MISMA función que la pantalla Cámara
  // (fuente única en lib/valorCamara) → los dos módulos dan el mismo número.
  const valorCamaras = useMemo(() => {
    const precioMap = construirPrecioMapCamara({ sabores, impulsivos, saborIngredientes })
    return valorTotalCamara(stockCamaras, precioMap).valorCosto
  }, [stockCamaras, sabores, impulsivos, saborIngredientes])

  const margenPromedio = useMemo(() => {
    const cp = margenes.filter(p => p.precio_venta > 0)
    if (!cp.length) return 0
    return cp.reduce((a, p) => a + p.margen, 0) / cp.length
  }, [margenes])

  const distribucionCostos = useMemo(() => {
    const totalMP = productos.reduce((a, p) => a + (p.costo_materiales || 0), 0)
    const totalMO = productos.reduce((a, p) => a + (p.mano_de_obra || 0), 0)
    const arr = [
      { name: 'Materia Prima', value: totalMP, color: colors.brand },
      { name: 'Mano de Obra', value: totalMO, color: colors.info },
    ]
    if (totalCIF > 0) arr.push({ name: 'CIF', value: totalCIF, color: '#f59e0b' })
    return arr
  }, [productos, totalCIF])

  const tieneDiff = prevSnapshot != null

  // ── PDF de márgenes ──────────────────────────────────────────────────────────
  async function generarPDFMargenes() {
    setGenerandoPDF(true)
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pw = doc.internal.pageSize.getWidth()
    const ph = doc.internal.pageSize.getHeight()
    const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const MOD = 'Finanzas'

    const conPrecio = margenes.filter(p => p.precio_venta > 0)
    const ordenado = [...conPrecio].sort((a, b) => b.margen - a.margen)
    // Detalle completo: TODOS los productos (con y sin precio), los sin precio al final.
    const detalle = [...margenes].sort((a, b) => {
      const ap = a.precio_venta > 0, bp = b.precio_venta > 0
      if (ap !== bp) return ap ? -1 : 1
      return b.margen - a.margen
    })

    // Color y etiqueta semántica por margen — usa la MISMA escala que la pantalla
    // (nivelMargen) para que Estado coincida exactamente entre app y PDF.
    const hexRgb = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
    const semColor = m => hexRgb(nivelMargen(m).barColor)
    const nivelStr = m => nivelMargen(m).label
    const tint = (c, fr) => [Math.round(c[0] + (255 - c[0]) * fr), Math.round(c[1] + (255 - c[1]) * fr), Math.round(c[2] + (255 - c[2]) * fr)]
    const esClaro = c => (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) > 150

    // Métricas
    const promM      = conPrecio.length ? conPrecio.reduce((a, p) => a + p.margen, 0) / conPrecio.length : 0
    const negativos  = conPrecio.filter(p => p.margen < 0)
    const criticos   = conPrecio.filter(p => p.margen >= 0 && p.margen < 15)
    const perdidaNeg = negativos.reduce((a, p) => a + Math.abs(p.ganancia), 0)

    // ── Pág 1: Portada ──
    dibujarPortada(doc, pw, ph, MOD, 'Análisis de Rentabilidad por Producto',
      `${conPrecio.length} productos con precio de venta`, fecha)

    // ── Pág 2: Resumen Ejecutivo ──
    doc.addPage()
    dibujarEncabezado(doc, pw, MOD, 'Resumen Ejecutivo', fecha)
    dibujarPie(doc, pw, ph, 2)

    // KPI cards con acento semántico superior
    const cards = [
      { l: 'Margen promedio',      v: `${promM.toFixed(1)}%`,   s: 'portfolio general',   c: semColor(promM) },
      { l: 'Productos analizados', v: String(conPrecio.length), s: 'con precio de venta',  c: PDF_NEGRO },
      { l: 'Margen negativo',      v: String(negativos.length), s: 'operan a pérdida',     c: negativos.length ? PDF_SEM_NEG : PDF_SEM_OK },
      { l: 'Pérdida estimada',     v: `$${pesos(perdidaNeg)}`,  s: 'por unidad / mes',     c: perdidaNeg > 0 ? PDF_SEM_NEG : PDF_SEM_OK },
    ]
    const gap = 4
    const cardW = (pw - 28 - gap * 3) / 4
    const cardH = 26
    const cardY = PDF_CONTENT_Y - 2
    cards.forEach((c, i) => {
      const x = 14 + i * (cardW + gap)
      doc.setDrawColor(...PDF_NEGRO); doc.setLineWidth(0.3); doc.rect(x, cardY, cardW, cardH)
      doc.setFillColor(...c.c); doc.rect(x, cardY, cardW, 1.4, 'F')
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(90, 90, 90)
      doc.text(c.l.toUpperCase(), x + 3, cardY + 7)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...PDF_NEGRO)
      doc.text(c.v, x + 3, cardY + 16)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(130, 130, 130)
      doc.text(c.s, x + 3, cardY + 22)
    })
    let y = cardY + cardH + 8

    // Síntesis
    y = dibujarSeccion(doc, pw, 'Síntesis', y)
    const sintesis =
      `El portfolio de ${conPrecio.length} productos presenta un margen promedio de ${promM.toFixed(1)}%. ` +
      (negativos.length
        ? `${negativos.length} producto${negativos.length > 1 ? 's' : ''} ${negativos.length > 1 ? 'operan' : 'opera'} con margen negativo, con una pérdida estimada de $${pesos(perdidaNeg)} por unidad al mes. `
        : 'Ningún producto opera con margen negativo, lo que refleja una estructura de costos saludable. ') +
      (criticos.length
        ? `Otros ${criticos.length} se ubican en zona crítica (margen inferior al 15%) y requieren revisión de precios.`
        : 'No hay productos en zona crítica.')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(50, 50, 50)
    const sl = doc.splitTextToSize(sintesis, pw - 28)
    doc.text(sl, 14, y)
    y += sl.length * 4.6 + 6

    // Distribución de márgenes (barra apilada con color semántico)
    y = dibujarSeccion(doc, pw, 'Distribución de márgenes', y)
    const bandsDef = [
      ['Negativo',  p => p.margen < 0,                     semColor(-1)],
      ['Crítico',   p => p.margen >= 0 && p.margen < 15,   semColor(10)],
      ['Bajo',      p => p.margen >= 15 && p.margen < 30,  semColor(20)],
      ['Aceptable', p => p.margen >= 30 && p.margen < 45,  semColor(40)],
      ['Bueno',     p => p.margen >= 45 && p.margen < 55,  semColor(50)],
      ['Excelente', p => p.margen >= 55,                   semColor(60)],
    ]
    const bands = bandsDef.map(([label, fn, col]) => ({ label, n: conPrecio.filter(fn).length, col }))
    const totalB = bands.reduce((a, b) => a + b.n, 0) || 1
    const barW = pw - 28, barH = 7
    let bx = 14
    bands.forEach(b => {
      const w = (b.n / totalB) * barW
      if (w <= 0) return
      doc.setFillColor(...b.col); doc.rect(bx, y, w, barH, 'F')
      if (w > 6) {
        const light = (b.col[0] * 0.299 + b.col[1] * 0.587 + b.col[2] * 0.114) > 150
        doc.setTextColor(...(light ? PDF_NEGRO : PDF_BLANCO))
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5)
        doc.text(String(b.n), bx + w / 2, y + barH / 2 + 1.4, { align: 'center' })
      }
      bx += w
    })
    y += barH + 5
    let lx = 14
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    bands.forEach(b => {
      doc.setFillColor(...b.col); doc.rect(lx, y - 2.6, 3, 3, 'F')
      doc.setTextColor(70, 70, 70); doc.text(b.label, lx + 4.5, y)
      lx += 4.5 + doc.getTextWidth(b.label) + 7
    })
    y += 9

    // Rentabilidad por producto — Top y Bottom (barras horizontales)
    y = dibujarSeccion(doc, pw, 'Rentabilidad por producto — Top y Bottom', y)
    const top5 = ordenado.slice(0, 5)
    const bottom3 = ordenado.slice(-3).filter(p => !top5.includes(p))
    const chartItems = [...top5, ...bottom3]
    const maxAbs = Math.max(1, ...chartItems.map(p => Math.abs(p.margen)))
    const labelW = 36
    const axisX = 14 + labelW
    const axisRight = pw - 16
    const axisW = axisRight - axisX
    const hasNeg = chartItems.some(p => p.margen < 0)
    const zeroX = hasNeg ? axisX + axisW * 0.42 : axisX
    const rowH = 5.6
    chartItems.forEach((p, i) => {
      const ry = y + i * rowH
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(50, 50, 50)
      const nm = p.nombre.length > 24 ? p.nombre.slice(0, 22) + '…' : p.nombre
      doc.text(nm, axisX - 3, ry + 2.4, { align: 'right' })
      doc.setFillColor(...semColor(p.margen))
      if (p.margen >= 0) {
        const w = (p.margen / maxAbs) * (axisRight - zeroX)
        doc.rect(zeroX, ry, Math.max(w, 0.3), 3, 'F')
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(70, 70, 70)
        doc.text(`${p.margen.toFixed(1)}%`, zeroX + w + 1.5, ry + 2.3)
      } else {
        const w = (Math.abs(p.margen) / maxAbs) * (zeroX - axisX)
        doc.rect(zeroX - w, ry, Math.max(w, 0.3), 3, 'F')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...PDF_SEM_NEG)
        doc.text(`${p.margen.toFixed(1)}%`, zeroX - w - 1.5, ry + 2.3, { align: 'right' })
      }
    })
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.2)
    doc.line(zeroX, y - 1, zeroX, y + chartItems.length * rowH - 1)

    // ── Pág 3: Detalle por producto ──
    const EST = getEstiloInforme()
    doc.addPage()
    dibujarEncabezado(doc, pw, MOD, 'Detalle por Producto', fecha)
    dibujarPie(doc, pw, ph, 3)
    autoTable(doc, {
      ...EST,
      startY: PDF_CONTENT_Y,
      head: [['Producto', 'Tipo', 'Costo unit.', 'Precio venta', 'Ganancia', 'Margen', 'Estado']],
      body: detalle.map(p => {
        const cp = p.precio_venta > 0
        return [
          p.nombre, p.tipo || '—',
          `$${pesos(p.costo_unit)}/${p.unidad}`,
          cp ? `$${pesos(p.precio_venta)}` : '—',
          cp ? `$${pesos(p.ganancia)}` : '—',
          cp ? `${p.margen.toFixed(1)}%` : '—',
          cp ? nivelStr(p.margen) : 'sin precio',
        ]
      }),
      columnStyles: {
        0: { cellWidth: 46 },
        2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
        6: { halign: 'center', cellWidth: 24 },
      },
      didParseCell: d => {
        if (d.section !== 'body') return
        const row = detalle[d.row.index]
        if (!row || !(row.precio_venta > 0)) return // sin precio: sin color
        const m = row.margen ?? 0
        const col = semColor(m)
        if (d.column.index === 5) {          // Margen %: texto en color + fondo tenue de la banda
          d.cell.styles.textColor = col
          d.cell.styles.fontStyle = 'bold'
          d.cell.styles.fillColor = tint(col, 0.82)
        }
        if (d.column.index === 6) {          // Estado: badge con el color sólido de la banda
          d.cell.styles.fillColor = col
          d.cell.styles.textColor = esClaro(col) ? PDF_NEGRO : PDF_BLANCO
          d.cell.styles.fontStyle = 'bold'
        }
      },
      didDrawPage: () => {
        dibujarEncabezado(doc, pw, MOD, 'Detalle por Producto', fecha)
        dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
      },
    })

    // Leyenda: qué significa la columna "Estado" (según el margen %)
    let yLeg = doc.lastAutoTable.finalY + 7
    if (yLeg > ph - 32) { doc.addPage(); dibujarEncabezado(doc, pw, MOD, 'Detalle por Producto', fecha); dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber); yLeg = PDF_CONTENT_Y }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...PDF_NEGRO)
    doc.text('CÓMO LEER EL ESTADO  (rentabilidad según el margen sobre el precio de venta)', 14, yLeg)
    yLeg += 4.5
    const leyenda = [
      ['NEGATIVO',  'margen menor a 0%  ·  el producto se vende a pérdida', semColor(-1)],
      ['CRÍTICO',   'margen 0% a 15%  ·  apenas cubre costos, revisar precio', semColor(10)],
      ['BAJO',      'margen 15% a 30%  ·  rentabilidad floja', semColor(20)],
      ['ACEPTABLE', 'margen 30% a 45%  ·  pasable', semColor(40)],
      ['BUENO',     'margen 45% a 55%  ·  rango objetivo', semColor(50)],
      ['EXCELENTE', 'margen mayor a 55%  ·  muy rentable', semColor(60)],
    ]
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    leyenda.forEach(([etq, desc, col]) => {
      doc.setFillColor(...col); doc.rect(14, yLeg - 2.4, 3, 3, 'F')
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...col); doc.text(etq, 19, yLeg)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(70, 70, 70); doc.text(desc, 45, yLeg)
      yLeg += 4.6
    })

    // ── Pág 4: Acciones sugeridas ──
    doc.addPage()
    dibujarEncabezado(doc, pw, MOD, 'Acciones Sugeridas', fecha)
    dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
    const acciones = conPrecio
      .filter(p => p.margen < 30)
      .sort((a, b) => a.margen - b.margen)
      .slice(0, 15)
      .map(p => {
        let situacion, accion, impacto
        if (p.margen < 0) {
          const precioMin = p.costo_total / 0.8
          situacion = `Negativo (${p.margen.toFixed(1)}%)`
          accion = `Subir precio a $${pesos(precioMin)} (mín. 20% margen)`
          impacto = `Recuperar $${pesos(precioMin - p.precio_venta)}/u`
        } else if (p.margen < 15) {
          const precioIdeal = p.costo_total / 0.7
          situacion = `Crítico (${p.margen.toFixed(1)}%)`
          accion = `Ajustar precio a $${pesos(precioIdeal)} o reducir costo MP`
          impacto = `+${(30 - p.margen).toFixed(1)}pp de margen`
        } else {
          situacion = `Bajo (${p.margen.toFixed(1)}%)`
          accion = 'Monitorear precios de insumos principales'
          impacto = 'Margen en riesgo ante suba de precios'
        }
        return [p.nombre, situacion, accion, impacto, p.margen]
      })

    if (acciones.length === 0) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...PDF_SEM_EXC)
      doc.text('Todos los productos superan el 30% de margen. No se requieren acciones.', 14, PDF_CONTENT_Y + 4)
    } else {
      autoTable(doc, {
        ...EST,
        startY: PDF_CONTENT_Y,
        head: [['Producto', 'Situación', 'Acción sugerida', 'Impacto estimado']],
        body: acciones.map(a => a.slice(0, 4)),
        columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 33 }, 2: { cellWidth: 68 }, 3: { cellWidth: 39 } },
        didParseCell: d => {
          if (d.section !== 'body') return
          if (d.column.index === 1) {
            d.cell.styles.textColor = semColor(acciones[d.row.index]?.[4] ?? 0)
            d.cell.styles.fontStyle = 'bold'
          }
        },
        didDrawPage: () => {
          dibujarEncabezado(doc, pw, MOD, 'Acciones Sugeridas', fecha)
          dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
        },
      })
    }

    // ── Firmas (al final del contenido; salta de hoja solo si no entran) ──
    const firmasY = acciones.length === 0 ? PDF_CONTENT_Y + 10 : doc.lastAutoTable.finalY
    dibujarFirmas(doc, pw, ph, firmasY, MOD, fecha,
      ['Gerente General', 'Responsable Financiero', 'Fecha y aclaración'])

    doc.save(`Rentabilidad_DelParque_${fecha.replace(/\//g, '-')}.pdf`)
    setGenerandoPDF(false)
  }

  // ── JSX ───────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <Toast toast={toast} />

      {focoBanner && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg text-sm flex-wrap"
          style={{ backgroundColor: 'rgba(255,71,19,0.10)', border: `1px solid ${colors.brand}` }}>
          <span style={{ color: colors.textPrimary }}>🎯 Del Centro de control: <b>{focoBanner}</b> — ordenados de peor a mejor margen.</span>
          <button onClick={() => setFocoBanner(null)} className="text-xs font-semibold px-2 py-1 rounded-md" style={{ color: colors.brand }}>✕</button>
        </div>
      )}

      {/* Header */}
      <PageHeader
        title="Finanzas"
        subtitle="Costos, márgenes y resumen financiero"
        actions={<>
          {lastUpdated && (
            <span className="text-xs flex items-center gap-1.5" style={{ color: colors.textMuted }}>
              <Clock size={12} />
              Actualizado: {lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {tab !== 'Resumen Ejecutivo' && tab !== 'Historial' && (
            <Button variant="secondary" onClick={recalcularTodos} loading={recalculando}>
              <RefreshCw size={14} /> Actualizar costos
            </Button>
          )}
          {tab === 'Márgenes' && (
            <>
              <Button variant="secondary" onClick={() => exportarCSV('rentabilidad', [
                { header: 'Producto', get: p => p.nombre },
                { header: 'Tipo', get: p => p.tipo || '' },
                { header: 'Costo MP', get: p => Math.round(p.costo_materiales || 0) },
                { header: 'Mano de obra', get: p => Math.round(p.mano_de_obra || 0) },
                { header: 'Costo total (batch)', get: p => Math.round(p.costo_total || 0) },
                { header: 'Costo unit.', get: p => Math.round(p.costo_unit || 0) },
                { header: 'Unidad', get: p => p.unidad || '' },
                { header: 'Precio venta', get: p => Math.round(p.precio_venta || 0) },
                { header: 'Ganancia', get: p => Math.round(p.ganancia || 0) },
                { header: 'Margen %', get: p => (p.margen || 0).toFixed(1) },
                { header: 'Estado', get: p => nivelMargen(p.margen).label },
              ], margenesSorted)} disabled={margenesSorted.length === 0}>
                <FileDown size={14} /> Excel
              </Button>
              <Button variant="primary" onClick={generarPDFMargenes} loading={generandoPDF}>
                <FileDown size={14} /> Exportar PDF
              </Button>
            </>
          )}
        </>}
      />

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
              {/* Filtro por sección */}
              <div className="flex gap-1.5 flex-wrap">
                {['Todos', 'Bases', 'Sabores', 'Impulsivos', 'Postres'].map(s => (
                  <button key={s} onClick={() => setSeccionCostos(s)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border"
                    style={{
                      backgroundColor: seccionCostos === s ? colors.brand : 'transparent',
                      borderColor: seccionCostos === s ? colors.brand : colors.border,
                      color: seccionCostos === s ? 'white' : colors.textSecondary,
                    }}>
                    {s === 'Todos' ? 'Todos' : s === 'Bases' ? '🧱 Bases' : s === 'Sabores' ? '🧊 Sabores' : s === 'Impulsivos' ? '📦 Impulsivos' : '🍰 Postres'}
                  </button>
                ))}
              </div>
              {/* Precio por tipo de sabor: cargás uno y se aplica a todos los del tipo */}
              {(seccionCostos === 'Todos' || seccionCostos === 'Sabores') && secciones.Sabores.length > 0 && (
                <div className="overflow-hidden" style={SURFACE}>
                  <div className="px-4 py-2.5" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>💲 Precio de venta por tipo de sabor</span>
                    <span className="text-xs ml-2" style={{ color: colors.textMuted }}>cargás el precio y se aplica a todos los sabores de ese tipo</span>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {TIERS_SABOR.map(t => {
                      const items = tierGroups.g[t] || []
                      return (
                        <div key={t} className="flex items-center gap-2 p-2 rounded-lg" style={{ border: `1px solid ${colors.border}` }}>
                          <span className="text-sm" title={t}>{tierEmoji[t]}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate" style={{ color: colors.textPrimary }}>{t}</div>
                            <div className="text-xs" style={{ color: colors.textMuted }}>{items.length} sabor{items.length !== 1 ? 'es' : ''}</div>
                          </div>
                          <input type="number" min="0" value={precioTier[t] || ''} placeholder="$"
                            onChange={e => setPrecioTier(prev => ({ ...prev, [t]: e.target.value }))}
                            className="w-24 text-right rounded-md border text-sm px-2 py-1 outline-none"
                            style={{ borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary }} />
                          <Button variant="primary" size="sm" loading={aplicandoTier === t}
                            disabled={items.length === 0 || !(parseFloat(precioTier[t]) > 0)}
                            onClick={() => aplicarPrecioTipo(t)}>Aplicar</Button>
                        </div>
                      )
                    })}
                  </div>
                  {tierGroups.sinTipo.length > 0 && (
                    <div className="px-4 pb-3 text-xs" style={{ color: colors.textMuted }}>
                      Sin tipo asignado (cargá su precio a mano en la tabla): {tierGroups.sinTipo.map(s => s.nombre).join(', ')}
                    </div>
                  )}
                </div>
              )}
              {[
                { key: 'Bases',      label: '🧱 BASES',      items: secciones.Bases      },
                { key: 'Sabores',    label: '🧊 SABORES',    items: secciones.Sabores    },
                { key: 'Impulsivos', label: '📦 IMPULSIVOS', items: secciones.Impulsivos },
                { key: 'Postres',    label: '🍰 POSTRES',    items: secciones.Postres    },
              ].filter(({ key }) => seccionCostos === 'Todos' || seccionCostos === key)
                .map(({ key, label, items }) => items.length > 0 && (
                <div key={key} className="overflow-hidden" style={SURFACE}>
                  <div className="px-4 py-2.5" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>{label}</span>
                    <span className="text-xs ml-2" style={{ color: colors.textMuted }}>{items.length} producto{items.length !== 1 ? 's' : ''}</span>
                    {key === 'Sabores' && (
                      <p className="text-[10px] mt-0.5" style={{ color: colors.textMuted }}>
                        MP · MOD · CIF · Costo Total son de la <b>tanda</b> (120 L de base ≈ el rinde en kg). <b>Costo unit.</b> = Costo Total ÷ Rinde = el costo real por kg.
                      </p>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[820px]">
                      <Thead>
                        <Tr>
                          <Th>Producto</Th><Th className="text-right">Costo MP ($)</Th>
                          <Th className="text-right">MOD ($)</Th>
                          <Th className="text-right">CIF ($)</Th>
                          <Th className="text-right">Costo Total ($)</Th>
                          <Th className="text-right">Rinde</Th>
                          <Th className="text-right">Costo unit. ($)</Th>
                          <Th className="text-right">Precio venta ($)</Th>
                          <Th className="text-right">Margen %</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {items.map(p => {
                          const prev = prevSnapshot?.[p.key]
                          const margen = margenPct(p.costo_unit, p.precio_venta)
                          const nv = nivelMargen(margen)
                          return (
                            <Tr key={p.key}>
                              <Td className="font-medium">
                                {p.nombre}
                                {key === 'Sabores' && tierDeSabor(p.nombre) && (
                                  <span className="ml-1.5 text-xs" style={{ color: colors.textMuted }}>{tierEmoji[tierDeSabor(p.nombre)]} {tierDeSabor(p.nombre)}</span>
                                )}
                              </Td>
                              <Td className="text-right">
                                ${pesos(p.costo_materiales)}
                                {tieneDiff && <DiffBadge actual={p.costo_materiales} anterior={prev ? prev.costo_total - (p.mano_de_obra || 0) : null} />}
                              </Td>
                              <Td className="text-right">
                                <EditableNumber value={p.mano_de_obra} onCommit={v => actualizarCampo(p, 'mano_de_obra', v)} />
                              </Td>
                              <Td className="text-right text-xs" style={{ color: p.cif_kg > 0 ? colors.textSecondary : colors.textMuted }}>
                                {p.cif_kg > 0 ? `$${pesos(p.cif_kg)}` : '—'}
                              </Td>
                              <Td className="text-right font-semibold">
                                ${pesos(p.costo_total_cif)}
                                {tieneDiff && <DiffBadge actual={p.costo_total} anterior={prev?.costo_total} />}
                              </Td>
                              <Td className="text-right text-xs" style={{ color: colors.textSecondary }}>
                                {p.divisor > 1 ? `${(Number(p.divisor) || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${p.unidad}` : `1 ${p.unidad}`}
                              </Td>
                              <Td className="text-right font-bold" style={{ color: colors.brand }}>
                                ${pesos(p.costo_unit)}
                                <span className="text-xs font-normal" style={{ color: colors.textMuted }}>/{p.unidad}</span>
                              </Td>
                              <Td className="text-right">
                                <EditableNumber value={p.precio_venta} onCommit={v => actualizarCampo(p, 'precio_venta', v)} />
                              </Td>
                              <Td className="text-right">
                                {p.precio_venta > 0
                                  ? <span style={{ color: nv.barColor, fontWeight: '700' }}>{nv.emoji} {margen.toFixed(1)}%</span>
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

          {/* ═══════════════════════════ TAB CIF ════════════════════════════════ */}
          {tab === 'CIF' && (
            <div className="space-y-5">
              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'CIF fijos/mes',    value: `$${pesos(totalCIFfijos)}`,    color: '#3b82f6' },
                  { label: 'CIF variables/mes', value: `$${pesos(totalCIFvariables)}`, color: '#f59e0b' },
                  { label: 'Total CIF/mes',     value: `$${pesos(totalCIF)}`,         color: colors.brand },
                  { label: 'CIF/litro producido', value: cifPorLitro > 0 ? `$${pesos(cifPorLitro)}/L` : `— (${pesos(litrosMes)} L este mes)`, color: '#10b981' },
                ].map(k => (
                  <div key={k.label} className="p-4 rounded-xl" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderTop: `3px solid ${k.color}` }}>
                    <div className="text-xl font-bold" style={{ color: k.color }}>{k.value}</div>
                    <div className="text-xs mt-1 uppercase tracking-wide" style={{ color: colors.textMuted }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Tabla CIF */}
              <div className="overflow-hidden" style={SURFACE}>
                <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Costos Indirectos de Fabricación</span>
                  <span className="text-xs" style={{ color: colors.textMuted }}>{cifConfig.filter(c => c.activo).length} activos</span>
                </div>
                <Table className="min-w-[600px]">
                  <Thead>
                    <Tr><Th>Concepto</Th><Th>Categoría</Th><Th className="text-right">Monto/mes ($)</Th><Th>Activo</Th><Th></Th></Tr>
                  </Thead>
                  <Tbody>
                    {cifConfig.map(c => (
                      <Tr key={c.id} style={{ opacity: c.activo ? 1 : 0.5 }}>
                        <Td className="font-medium">{c.concepto}</Td>
                        <Td>
                          <Badge variant={c.categoria === 'fijo' ? 'info' : 'warning'}>
                            {c.categoria === 'fijo' ? 'Fijo' : 'Variable'}
                          </Badge>
                        </Td>
                        <Td className="text-right">
                          {editingCIF[c.id] !== undefined ? (
                            <div className="flex items-center gap-1 justify-end">
                              <input type="number" min="0" value={editingCIF[c.id]}
                                onChange={e => setEditingCIF(prev => ({ ...prev, [c.id]: e.target.value }))}
                                className={numInputClass} autoFocus />
                              <button onClick={() => actualizarCIFMonto(c.id)}
                                className="text-xs px-2 py-1 rounded font-semibold"
                                style={{ backgroundColor: colors.success + '22', color: colors.success }}>✓</button>
                              <button onClick={() => setEditingCIF(prev => { const n = { ...prev }; delete n[c.id]; return n })}
                                className="text-xs px-1.5 py-1 rounded"
                                style={{ color: colors.textMuted }}>✕</button>
                            </div>
                          ) : (
                            <button onClick={() => setEditingCIF(prev => ({ ...prev, [c.id]: c.monto_mensual }))}
                              className="font-semibold hover:underline"
                              style={{ color: colors.textPrimary }}>
                              ${pesos(c.monto_mensual)}
                            </button>
                          )}
                        </Td>
                        <Td>
                          <button onClick={() => toggleActivoCIF(c.id, c.activo)}
                            className="text-xs px-2 py-0.5 rounded-full font-semibold transition-colors"
                            style={{ backgroundColor: c.activo ? colors.success + '22' : colors.border, color: c.activo ? colors.success : colors.textMuted }}>
                            {c.activo ? 'Sí' : 'No'}
                          </button>
                        </Td>
                        <Td>
                          <button onClick={() => eliminarCIF(c.id)} className="text-xs px-1.5 py-1 rounded hover:bg-red-100"
                            style={{ color: colors.danger }}>✕</button>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>

              {/* Agregar CIF */}
              <div className="p-4 rounded-xl space-y-3" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}>
                <p className="text-sm font-semibold" style={{ color: colors.textPrimary }}>＋ Agregar CIF</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input value={newCIF.concepto} onChange={e => setNewCIF(f => ({ ...f, concepto: e.target.value }))}
                    placeholder="Concepto (ej: Gas natural)"
                    className="rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
                    style={{ borderColor: colors.border, color: colors.textPrimary }} />
                  <select value={newCIF.categoria} onChange={e => setNewCIF(f => ({ ...f, categoria: e.target.value }))}
                    className="rounded-md border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: colors.border, color: colors.textPrimary }}>
                    <option value="fijo">Fijo</option>
                    <option value="variable">Variable</option>
                  </select>
                  <div className="flex gap-2">
                    <input type="number" min="0" value={newCIF.monto_mensual} onChange={e => setNewCIF(f => ({ ...f, monto_mensual: e.target.value }))}
                      placeholder="Monto/mes"
                      className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
                      style={{ borderColor: colors.border, color: colors.textPrimary }} />
                    <Button variant="primary" onClick={agregarCIF} loading={savingCIF} disabled={!newCIF.concepto.trim()}>
                      Agregar
                    </Button>
                  </div>
                </div>
              </div>
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
                        <Th>Tipo</Th>
                        <Th>Costo MP</Th>
                        <Th>MO</Th>
                        <Th>Costo unit.</Th>
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
                            <Td className="text-xs" style={{ color: colors.textMuted }}>{p.tipo}</Td>
                            <Td className="text-right text-xs">${pesos(p.costo_materiales)}</Td>
                            <Td className="text-right text-xs">${pesos(p.mano_de_obra)}</Td>
                            <Td className="text-right font-semibold">
                              ${pesos(p.costo_unit)}<span className="text-[10px] font-normal" style={{ color: colors.textMuted }}>/{p.unidad}</span>
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
                <div className="px-4 py-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]" style={{ borderTop: `1px solid ${colors.border}`, color: colors.textMuted }}>
                  <span className="font-semibold" style={{ color: colors.textSecondary }}>Alerta (margen sobre precio de venta):</span>
                  <span>🔴 <b style={{ color: '#EF4444' }}>NEGATIVO</b> &lt;0% (pérdida)</span>
                  <span>🔴 <b style={{ color: '#f97316' }}>CRÍTICO</b> 0–15%</span>
                  <span>🟠 <b style={{ color: '#f59e0b' }}>BAJO</b> 15–30%</span>
                  <span>🟡 <b style={{ color: '#eab308' }}>ACEPTABLE</b> 30–45%</span>
                  <span>🟢 <b style={{ color: '#22C55E' }}>BUENO</b> 45–55%</span>
                  <span>💚 <b style={{ color: '#16a34a' }}>EXCELENTE</b> &gt;55%</span>
                  <span className="w-full" style={{ color: colors.textMuted }}>El valor junto al margen (ej. <b>↓2,3pp</b>) indica cuántos puntos porcentuales cambió respecto al último recálculo guardado.</span>
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

          {/* ═══════════════════════ TAB LISTA DE PRECIOS ═══════════════════════ */}
          {tab === 'Lista de precios' && (
            <div className="space-y-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-sm font-bold" style={{ color: colors.textPrimary }}>Lista de precios · Franquicias</h3>
                  <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                    <b style={{ color: colors.textSecondary }}>Ver márgenes</b>: cuánto ganás como fábrica y cuánto le queda al franquiciado. <b style={{ color: colors.textSecondary }}>Editar precios</b>: cargás y actualizás. El PDF sale limpio, sin costos ni márgenes.
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="secondary" onClick={emitirInformeDuenos} loading={emitiendoInforme}>
                    <FileDown size={15} /> Informe para dueños
                  </Button>
                  <Button variant="primary" onClick={emitirPdfLista} loading={emitiendoPdf}>
                    <FileDown size={15} /> Emitir PDF limpio
                  </Button>
                </div>
              </div>

              {/* Sub-navegación: ver márgenes vs. editar precios */}
              <div className="flex gap-1.5">
                {[['margenes', '📊 Ver márgenes'], ['editar', '✏️ Editar precios']].map(([k, label]) => (
                  <button key={k} onClick={() => setSubLista(k)}
                    className="px-3.5 py-2 rounded-lg text-xs font-bold transition-all duration-150 border"
                    style={{
                      backgroundColor: subLista === k ? colors.brand : 'transparent',
                      borderColor: subLista === k ? colors.brand : colors.border,
                      color: subLista === k ? 'white' : colors.textSecondary,
                    }}>
                    {label}
                  </button>
                ))}
              </div>

              {subLista === 'margenes' && (<>

              {/* Cómo se leen los márgenes */}
              <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl text-[11px]" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}>
                <span className="text-sm leading-none">💡</span>
                <span style={{ color: colors.textSecondary }}>
                  <b>Margen de fábrica</b> = lo que ganás vos vendiéndole al franquiciado (precio franquicia − tu costo).{' '}
                  <b>Margen del franquiciado</b> = lo que le queda a él vendiendo al público (precio público − lo que te compra).
                  {avgFranquiciaKg === 0 && <span style={{ color: '#f59e0b' }}> · Cargá los precios de franquicia en «Editar precios» para ver estos números.</span>}
                </span>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { l: 'Margen fábrica prom.', v: `${resumenFranquicia.prom.toFixed(1)}%`, c: nivelMargen(resumenFranquicia.prom).barColor },
                  { l: 'Margen franquiciado prom.', v: `${resumenFormato.prom.toFixed(1)}%`, c: nivelMargen(resumenFormato.prom).barColor },
                  { l: 'Sabores', v: String(resumenFranquicia.total), c: colors.textPrimary },
                  { l: 'A vigilar (<30%)', v: String(resumenFranquicia.vigilar), c: '#f59e0b' },
                ].map(k => (
                  <div key={k.l} className="px-3 py-2.5 rounded-xl" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: colors.textMuted }}>{k.l}</p>
                    <p className="text-xl font-bold mt-0.5" style={{ color: k.c }}>{k.v}</p>
                  </div>
                ))}
              </div>

              {/* Explicación: margen s/venta vs marcación s/costo */}
              <div className="rounded-xl p-3.5" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}>
                <p className="text-xs font-bold mb-2" style={{ color: colors.textPrimary }}>📊 Cómo leer los dos márgenes</p>
                <div className="grid sm:grid-cols-2 gap-3 text-[12px] leading-relaxed">
                  <div className="rounded-lg p-2.5" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}>
                    <p className="font-bold" style={{ color: colors.success }}>Margen s/venta</p>
                    <p className="text-[11px]" style={{ color: colors.textMuted }}>ganancia ÷ precio de venta</p>
                    <p className="mt-1" style={{ color: colors.textSecondary }}>Rentabilidad real: de cada $100 que vende, cuánto es ganancia. <b>Nunca pasa de 100%.</b> Para saber si un producto conviene.</p>
                  </div>
                  <div className="rounded-lg p-2.5" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}>
                    <p className="font-bold" style={{ color: colors.brand }}>Marcación s/costo</p>
                    <p className="text-[11px]" style={{ color: colors.textMuted }}>ganancia ÷ costo</p>
                    <p className="mt-1" style={{ color: colors.textSecondary }}>Cuánto se agrega sobre el costo. <b>Puede pasar de 100%.</b> Para poner precios.</p>
                  </div>
                </div>
                <p className="text-[11px] mt-2 font-semibold" style={{ color: colors.textSecondary }}>En una frase: s/venta = cuánto ganás; s/costo = cuánto le sumás al costo para fijar el precio.</p>
              </div>

              {/* Margen del FRANQUICIADO por formato (helado promedio + packaging) */}
              <div className="overflow-hidden" style={SURFACE}>
                <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Margen del franquiciado por presentación</span>
                    <span className="text-[11px]" style={{ color: colors.textMuted }}>una fila por cómo se sirve</span>
                  </div>
                  {tierRef.length > 0 && (
                    <p className="text-[11px] mt-1" style={{ color: colors.textMuted }}>
                      Costo del helado/kg: <b style={{ color: colors.textSecondary }}>prom ${pesos(avgFranquiciaKg)}</b>
                      {tierRef.map(t => <span key={t.tier}> · {TIER_CORTO[t.tier] || t.tier} ${pesos(t.precio)}</span>)}
                      <span className="ml-1">(la tabla usa el promedio)</span>
                    </p>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <Table className="min-w-[860px]">
                    <Thead>
                      <Tr>
                        <Th>Producto</Th><Th>Presentación</Th><Th>Kg</Th><Th>Costo helado</Th><Th>Costo packaging</Th><Th>Costo total</Th><Th>Precio venta</Th><Th>Margen s/venta</Th><Th>Marcación s/costo</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {margenPorFormato.map((f, i) => {
                        const nv = nivelMargen(f.margen)
                        const primeraDelGrupo = i === 0 || margenPorFormato[i - 1].producto !== f.producto
                        const st = formatoStats[f.producto] || {}
                        const bajo = f.publico > 0 && f.margen < 30
                        const esBest = st.bestKey === f.key
                        const esWorst = st.worstKey === f.key
                        return (
                          <Tr key={f.key} style={{
                            ...(primeraDelGrupo && i > 0 ? { borderTop: `2px solid ${colors.border}` } : {}),
                            ...(bajo ? { backgroundColor: nv.rowBg } : {}),
                          }}>
                            {primeraDelGrupo && (
                              <Td rowSpan={formatoGrupoCount[f.producto]} className="font-medium" style={{ verticalAlign: 'middle', borderRight: `1px solid ${colors.border}`, backgroundColor: colors.bg }}>
                                {f.producto}
                                {st.count > 1 && <div className="text-[11px] font-normal mt-0.5" style={{ color: nivelMargen(st.prom).barColor }}>prom {st.prom.toFixed(0)}%</div>}
                              </Td>
                            )}
                            <Td style={{ color: colors.textSecondary }}>
                              {f.presentacion}
                              {esBest && <span title="La más rentable de este producto" className="ml-1 font-bold" style={{ color: colors.success }}>✓</span>}
                              {esWorst && <span title="La de menor margen de este producto" className="ml-1 font-bold" style={{ color: '#f59e0b' }}>↓</span>}
                              {f.sinVincular && <span title="Algún packaging no está vinculado a un insumo de Depósito" className="ml-1 text-xs" style={{ color: '#f59e0b' }}>⚠</span>}
                            </Td>
                            <Td style={{ color: colors.textMuted }}>{f.kg}</Td>
                            <Td style={{ color: colors.textMuted }}>${pesos(f.costoHelado)}</Td>
                            <Td style={{ color: colors.textMuted }}>${pesos(f.costoPack)}</Td>
                            <Td className="font-semibold">${pesos(f.costoFranq)}</Td>
                            <Td>${pesos(f.publico)}</Td>
                            <Td>{f.publico > 0
                              ? <Badge variant={nv.badgeVariant}>{nv.emoji} {f.margen.toFixed(1)}%</Badge>
                              : <span className="text-xs" style={{ color: colors.textMuted }}>sin precio</span>}</Td>
                            <Td style={{ color: colors.textSecondary }}>{f.publico > 0 ? `${f.marcacion.toFixed(0)}%` : '—'}</Td>
                          </Tr>
                        )
                      })}
                    </Tbody>
                  </Table>
                </div>
                <div className="px-4 py-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ borderTop: `1px solid ${colors.border}`, color: colors.textMuted }}>
                  <span><b style={{ color: colors.success }}>✓</b> presentación más rentable del producto</span>
                  <span><b style={{ color: '#f59e0b' }}>↓</b> la de menor margen</span>
                  <span><span className="inline-block w-2.5 h-2.5 rounded-sm align-middle" style={{ backgroundColor: nivelMargen(20).rowBg, border: `1px solid ${colors.border}` }} /> fila resaltada = margen bajo (&lt;30%)</span>
                  <span><b>prom</b> bajo el producto = promedio de sus presentaciones</span>
                </div>
              </div>

              {/* Margen de FÁBRICA por categoría (tier) */}
              <div className="overflow-hidden" style={SURFACE}>
                <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Margen de fábrica por categoría — por kg</span>
                </div>
                <div className="overflow-x-auto">
                  <Table className="min-w-[600px]">
                    <Thead>
                      <Tr><Th>Categoría</Th><Th>Costo fábrica</Th><Th>Precio franquicia</Th><Th>Margen s/venta</Th><Th>Marcación s/costo</Th></Tr>
                    </Thead>
                    <Tbody>
                      {cadenaTiers.map(c => {
                        const nf = nivelMargen(c.margenFabrica)
                        return (
                          <Tr key={c.tier}>
                            <Td className="font-medium">{c.tier}</Td>
                            <Td style={{ color: colors.textMuted }}>${pesos(c.costoProm)}</Td>
                            <Td className="font-semibold">${pesos(c.precio)}</Td>
                            <Td><Badge variant={nf.badgeVariant}>{nf.emoji} {c.margenFabrica.toFixed(1)}%</Badge></Td>
                            <Td style={{ color: colors.textSecondary }}>{c.marcacionFabrica.toFixed(0)}%</Td>
                          </Tr>
                        )
                      })}
                    </Tbody>
                  </Table>
                </div>
              </div>

              {/* Márgenes de fábrica por sabor */}
              <div className="overflow-hidden" style={SURFACE}>
                <div className="px-4 py-2.5" style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Márgenes de fábrica por sabor</span>
                </div>
                <div className="overflow-x-auto">
                  <Table className="min-w-[680px]">
                    <Thead>
                      <Tr><Th>Sabor</Th><Th>Tier</Th><Th>Costo /kg</Th><Th>Franquicia /kg</Th><Th>Margen s/venta</Th><Th>Marcación s/costo</Th></Tr>
                    </Thead>
                    <Tbody>
                      {margenesFranquicia.map(m => {
                        const nv = nivelMargen(m.margen)
                        return (
                          <Tr key={m.nombre}>
                            <Td className="font-medium">{m.nombre}</Td>
                            <Td><span className="text-xs" style={{ color: colors.textMuted }}>{m.tier || '—'}</span></Td>
                            <Td style={{ color: colors.textMuted }}>${pesos(m.costo)}</Td>
                            <Td className="font-semibold">${pesos(m.precio)}</Td>
                            <Td>{m.precio > 0
                              ? <Badge variant={nv.badgeVariant}>{nv.emoji} {m.margen.toFixed(1)}%</Badge>
                              : <span className="text-xs" style={{ color: colors.textMuted }}>sin precio</span>}</Td>
                            <Td style={{ color: colors.textSecondary }}>{m.precio > 0 ? `${m.marcacion.toFixed(0)}%` : '—'}</Td>
                          </Tr>
                        )
                      })}
                    </Tbody>
                  </Table>
                </div>
              </div>

              {/* Comparativa vs. competencia (precio de venta al público) */}
              {competenciaStats.length > 0 && (
                <div className="overflow-hidden" style={SURFACE}>
                  <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-1" style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Comparativa vs. competencia — precio al público</span>
                    <span className="text-[11px]" style={{ color: colors.textMuted }}>Se edita en «Editar precios»</span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[560px]">
                      <Thead>
                        <Tr>
                          <Th>Producto</Th><Th>Del Parque</Th>
                          {(precioLista.competencia?.competidores || []).map((c, i) => <Th key={i}>{c}</Th>)}
                          <Th>Posición</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {competenciaStats.map((f, idx) => {
                          const posMap = { barato: { t: '↓ más barato', c: colors.success }, caro: { t: '↑ más caro', c: colors.danger }, medio: { t: '≈ en el medio', c: colors.textMuted } }
                          const p = f.pos ? posMap[f.pos] : null
                          return (
                            <Tr key={idx}>
                              <Td className="font-medium">{f.producto}</Td>
                              <Td className="font-semibold">{f.propio > 0 ? `$${pesos(f.propio)}` : '—'}</Td>
                              {(f.comp || []).map((c, i) => <Td key={i} style={{ color: colors.textMuted }}>{Number(c) > 0 ? `$${pesos(c)}` : '—'}</Td>)}
                              <Td>{p ? <span className="text-xs font-semibold" style={{ color: p.c }}>{p.t}</span> : <span className="text-xs" style={{ color: colors.textMuted }}>—</span>}</Td>
                            </Tr>
                          )
                        })}
                      </Tbody>
                    </Table>
                  </div>
                </div>
              )}

              </>)}

              {subLista === 'editar' && (<>

              {/* Editor de precios */}
              <div className="p-4 space-y-4" style={SURFACE}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Precios (editables)</span>
                  <div className="flex items-center gap-2">
                    <label className="text-xs" style={{ color: colors.textMuted }}>Vigencia</label>
                    <input value={precioLista.vigencia || ''} onChange={e => editarVigencia(e.target.value)}
                      className="px-2 py-1 rounded-md text-sm w-32" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                    <Button variant="primary" onClick={guardarPrecios} loading={guardandoPrecios}>Guardar precios</Button>
                  </div>
                </div>

                {/* Aumento masivo por % */}
                <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 rounded-lg" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}>
                  <span className="text-xs font-semibold" style={{ color: colors.textSecondary }}>Aumento masivo</span>
                  <input type="number" value={pctAumento} onChange={e => setPctAumento(e.target.value)}
                    className="px-2 py-1 rounded-md text-sm w-16 text-right" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                  <span className="text-xs" style={{ color: colors.textMuted }}>%</span>
                  <Button variant="secondary" size="sm" onClick={() => aumentarPrecios('franquicia')}>Aplicar a Franquicia</Button>
                  <Button variant="secondary" size="sm" onClick={() => aumentarPrecios('publico')}>Aplicar a Público</Button>
                  <Button variant="secondary" size="sm" onClick={() => aumentarPrecios('todo')}>Aplicar a Todo</Button>
                  <span className="text-[11px] w-full sm:w-auto" style={{ color: colors.textMuted }}>Redondea a $50. No guarda solo: revisá y tocá «Guardar precios».</span>
                  {/* Simulador: proyección al subir la lista de franquicia, sin aplicar */}
                  {proyeccionAumento && (
                    <div className="w-full mt-1 pt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ borderTop: `1px dashed ${colors.border}` }}>
                      <span className="font-semibold" style={{ color: colors.textSecondary }}>Simulación +{proyeccionAumento.pct}% a Franquicia:</span>
                      <span style={{ color: colors.textMuted }}>
                        Margen fábrica <b style={{ color: colors.textSecondary }}>{proyeccionAumento.fabAntes.toFixed(1)}%</b> → <b style={{ color: nivelMargen(proyeccionAumento.fabDesp).barColor }}>{proyeccionAumento.fabDesp.toFixed(1)}%</b>
                      </span>
                      <span style={{ color: colors.textMuted }}>
                        Margen franquiciado <b style={{ color: colors.textSecondary }}>{proyeccionAumento.franqAntes.toFixed(1)}%</b> → <b style={{ color: nivelMargen(proyeccionAumento.franqDesp).barColor }}>{proyeccionAumento.franqDesp.toFixed(1)}%</b>
                      </span>
                      <span style={{ color: colors.textMuted }}>(al franquiciado le sube el costo)</span>
                    </div>
                  )}
                </div>

                {[
                  { seccion: 'franquicia', titulo: 'PRECIOS FRANQUICIA', cats: ['HELADOS', 'UNITARIOS', 'TORTAS'], dos: false },
                  { seccion: 'publico', titulo: 'PRECIOS AL PÚBLICO', cats: ['HELADOS', 'UNITARIOS', 'TORTAS', 'BEBIDAS', 'OTROS'], dos: true },
                ].map(sec => (
                  <div key={sec.seccion} className="space-y-3">
                    <p className="text-xs font-bold" style={{ color: colors.brand }}>{sec.titulo}</p>
                    {sec.cats.map(cat => {
                      const filas = precioLista?.[sec.seccion]?.[cat] || []
                      if (!filas.length) return null
                      return (
                        <div key={cat}>
                          <p className="text-[11px] font-semibold uppercase mb-1" style={{ color: colors.textMuted }}>{cat}</p>
                          <div className="space-y-1">
                            {filas.map((f, idx) => (
                              <div key={f.producto} className="flex items-center gap-2">
                                <img src={`/iconos/${resolverIcono(f.producto, cat, precioLista.iconos)}.png`} alt="" width="20" height="20"
                                  title={`Ícono: ${ICONOS_LABELS[resolverIcono(f.producto, cat, precioLista.iconos)]}`}
                                  style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} />
                                <span className="text-sm flex-1 truncate" style={{ color: colors.textPrimary }}>{f.producto}</span>
                                <select value={precioLista.iconos?.[normNombre(f.producto)] || ''} onChange={e => editarIcono(f.producto, e.target.value)}
                                  title="Ícono del producto en el PDF"
                                  className="px-1.5 py-1 rounded-md text-xs w-32" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.textSecondary }}>
                                  <option value="">Auto · {ICONOS_LABELS[iconoDe(f.producto, cat)]}</option>
                                  {ICON_KEYS.map(k => <option key={k} value={k}>{ICONOS_LABELS[k]}</option>)}
                                </select>
                                <input type="number" value={f.precio ?? ''} onChange={e => editarPrecio(sec.seccion, cat, idx, 'precio', e.target.value)}
                                  className="px-2 py-1 rounded-md text-sm w-24 text-right" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                                {sec.dos && (
                                  <input type="number" value={f.precio2 ?? ''} placeholder="P. Ya" onChange={e => editarPrecio(sec.seccion, cat, idx, 'precio2', e.target.value)}
                                    className="px-2 py-1 rounded-md text-sm w-24 text-right" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.textMuted }} />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
                <p className="text-[11px]" style={{ color: colors.textMuted }}>
                  Los precios de FRANQUICIA · HELADOS son por tier (categoría): se aplican a todos los sabores de esa categoría y con eso se calcula el margen de cada uno.
                </p>
              </div>

              {/* Editor: packaging de reventa (costo desde Depósito + reventa editable) */}
              <div className="p-4 space-y-3" style={SURFACE}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Packaging de reventa</span>
                  <Button variant="secondary" size="sm" onClick={agregarReventa}>+ Agregar insumo</Button>
                </div>
                <p className="text-[11px]" style={{ color: colors.textMuted }}>
                  Elegí el insumo del <b>desplegable</b> (son los que tenés en Depósito): así el <b>costo/unidad</b> se toma solo, en vivo. La <b>reventa/unidad</b> la ponés vos: es lo que le cobrás al franquiciado por ese envase.
                </p>
                {insumosNombres.length === 0 && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-[11px]" style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span>No hay insumos cargados en Depósito. Cargá ahí los envases/papeles con su precio y después elegilos acá.</span>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <Thead>
                      <Tr><Th>Insumo (Depósito)</Th><Th>Unid./paquete</Th><Th>Costo/unidad</Th><Th>Reventa/unidad</Th><Th></Th></Tr>
                    </Thead>
                    <Tbody>
                      {(precioLista.reventa || []).map((r, idx) => {
                        const info = reventaCostos[normalizarNombre(r.nombre)] || { costoU: 0, costoDep: 0 }
                        const sinDep = !(info.costoDep > 0)
                        const enDeposito = insumosNombres.includes(r.nombre)
                        return (
                          <Tr key={idx}>
                            <Td>
                              <select value={r.nombre || ''} onChange={e => editarReventa(idx, 'nombre', e.target.value)}
                                className="px-2 py-1 rounded-md text-sm w-52" style={{ backgroundColor: colors.bg, border: `1px solid ${sinDep ? '#f59e0b88' : colors.border}`, color: colors.textPrimary }}>
                                <option value="">— elegir insumo de Depósito —</option>
                                {r.nombre && !enDeposito && <option value={r.nombre}>⚠ {r.nombre} (no está en Depósito)</option>}
                                {insumosNombres.map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </Td>
                            <Td><input type="number" value={r.unidadesPorPaquete ?? ''} onChange={e => editarReventa(idx, 'unidadesPorPaquete', e.target.value)}
                              className="px-2 py-1 rounded-md text-sm w-20 text-right" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.textPrimary }} /></Td>
                            <Td style={{ color: sinDep ? '#f59e0b' : colors.textMuted }}>{sinDep ? 'sin vincular' : `$${pesos(info.costoU)}`}</Td>
                            <Td><input type="number" value={r.precioFranquicia ?? ''} onChange={e => editarReventa(idx, 'precioFranquicia', e.target.value)}
                              className="px-2 py-1 rounded-md text-sm w-24 text-right" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.textPrimary }} /></Td>
                            <Td><button onClick={() => quitarReventa(idx)} className="text-xs hover:opacity-70" style={{ color: colors.danger }}>Quitar</button></Td>
                          </Tr>
                        )
                      })}
                    </Tbody>
                  </Table>
                </div>
              </div>

              {/* Editor: formatos (producto + kg + precio + presentaciones) */}
              <div className="p-4 space-y-3" style={SURFACE}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Formatos y presentaciones</span>
                  <Button variant="secondary" size="sm" onClick={agregarFormato}>+ Agregar producto</Button>
                </div>
                <p className="text-[11px]" style={{ color: colors.textMuted }}>
                  Cada producto tiene sus <b>kg de helado</b>, su <b>precio de venta</b> y una o varias <b>presentaciones</b> (el mismo helado servido en distinto envase). Cada presentación se costea aparte → margen propio.
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {(precioLista.formatos || []).map((f, fIdx) => (
                    <div key={fIdx} className="p-3 rounded-lg space-y-2.5" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}>
                      {/* Cabecera producto */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <input value={f.producto || ''} onChange={e => editarFormatoCampo(fIdx, 'producto', e.target.value)}
                          className="px-2 py-1 rounded-md text-sm font-semibold flex-1 min-w-[120px]" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                        <input type="number" step="0.01" value={f.kg ?? ''} onChange={e => editarFormatoCampo(fIdx, 'kg', e.target.value)}
                          className="px-2 py-1 rounded-md text-sm w-16 text-right" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                        <span className="text-xs" style={{ color: colors.textMuted }}>kg</span>
                        <span className="text-xs" style={{ color: colors.textMuted }}>$</span>
                        <input type="number" value={f.precioVenta ?? ''} onChange={e => editarFormatoCampo(fIdx, 'precioVenta', e.target.value)}
                          className="px-2 py-1 rounded-md text-sm w-24 text-right" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                        <button onClick={() => quitarFormato(fIdx)} title="Quitar producto" className="text-xs hover:opacity-70 px-1" style={{ color: colors.danger }}>🗑</button>
                      </div>

                      {/* Presentaciones */}
                      {(f.presentaciones || []).map((pr, prIdx) => (
                        <div key={prIdx} className="rounded-md p-2 space-y-1.5" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase" style={{ color: colors.brand }}>Presentación</span>
                            <input value={pr.nombre || ''} onChange={e => editarPresentacionNombre(fIdx, prIdx, e.target.value)}
                              className="px-2 py-0.5 rounded text-xs font-semibold flex-1" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                            {(f.presentaciones || []).length > 1 && (
                              <button onClick={() => quitarPresentacion(fIdx, prIdx)} title="Quitar presentación" className="text-xs hover:opacity-70" style={{ color: colors.danger }}>✕</button>
                            )}
                          </div>
                          {(pr.packaging || []).map((p, pIdx) => (
                            <div key={pIdx} className="flex items-center gap-1.5">
                              <select value={p.nombre || ''} onChange={e => editarFormatoPack(fIdx, prIdx, pIdx, 'nombre', e.target.value)}
                                className="px-2 py-1 rounded-md text-xs flex-1" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                <option value="">— elegir packaging —</option>
                                {p.nombre && !(precioLista.reventa || []).some(r => r.nombre === p.nombre) && <option value={p.nombre}>⚠ {p.nombre}</option>}
                                {(precioLista.reventa || []).filter(r => r.nombre).map((r, i) => <option key={i} value={r.nombre}>{r.nombre}</option>)}
                              </select>
                              <span className="text-xs" style={{ color: colors.textMuted }}>×</span>
                              <input type="number" value={p.cantidad ?? ''} onChange={e => editarFormatoPack(fIdx, prIdx, pIdx, 'cantidad', e.target.value)}
                                className="px-2 py-1 rounded-md text-xs w-12 text-right" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                              <button onClick={() => quitarFormatoPack(fIdx, prIdx, pIdx)} className="text-xs hover:opacity-70" style={{ color: colors.danger }}>✕</button>
                            </div>
                          ))}
                          <button onClick={() => agregarFormatoPack(fIdx, prIdx)} className="text-xs hover:opacity-70" style={{ color: colors.brand }}>+ packaging</button>
                        </div>
                      ))}
                      <button onClick={() => agregarPresentacion(fIdx)} className="text-xs font-semibold hover:opacity-70" style={{ color: colors.brand }}>+ Agregar presentación</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Editor: comparativa de competencia */}
              <div className="p-4 space-y-3" style={SURFACE}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Comparativa de competencia</span>
                  <Button variant="secondary" size="sm" onClick={agregarCompetenciaFila}>+ Agregar producto</Button>
                </div>
                <p className="text-[11px]" style={{ color: colors.textMuted }}>Precio de venta al público: el tuyo vs. cada competidor (0 = sin dato). Los nombres de las columnas son editables.</p>
                <div className="overflow-x-auto">
                  <Table className="min-w-[560px]">
                    <Thead>
                      <Tr>
                        <Th>Producto</Th><Th>Del Parque</Th>
                        {(precioLista.competencia?.competidores || []).map((c, i) => (
                          <Th key={i}>
                            <input value={c} onChange={e => editarCompetidorNombre(i, e.target.value)}
                              className="px-1.5 py-0.5 rounded text-xs font-semibold w-28" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                          </Th>
                        ))}
                        <Th></Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {(precioLista.competencia?.filas || []).map((f, idx) => (
                        <Tr key={idx}>
                          <Td>
                            <input value={f.producto || ''} onChange={e => editarCompetenciaFila(idx, 'producto', e.target.value)}
                              className="px-2 py-1 rounded-md text-sm w-36" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                          </Td>
                          <Td>
                            <input type="number" value={f.propio ?? ''} onChange={e => editarCompetenciaFila(idx, 'propio', e.target.value)}
                              className="px-2 py-1 rounded-md text-sm w-24 text-right" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                          </Td>
                          {(precioLista.competencia?.competidores || []).map((_, i) => (
                            <Td key={i}>
                              <input type="number" value={f.comp?.[i] ?? ''} onChange={e => editarCompetenciaFila(idx, 'comp', e.target.value, i)}
                                className="px-2 py-1 rounded-md text-sm w-24 text-right" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                            </Td>
                          ))}
                          <Td><button onClick={() => quitarCompetenciaFila(idx)} className="text-xs hover:opacity-70" style={{ color: colors.danger }}>Quitar</button></Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              </div>

              </>)}
            </div>
          )}

          {/* ══════════════════════════ TAB HISTORIAL ══════════════════════════ */}
          {tab === 'Historial' && (
            <div className="space-y-4">
              {histLoading ? (
                <div className="flex justify-center py-14"><Spinner size={28} /></div>
              ) : !historial.disponible ? (
                <div className="flex items-start gap-2 text-xs px-3 py-3 rounded-lg"
                  style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    El historial de costos todavía no está activo. Corré <b>sql/costos_historicos.sql</b> en
                    Supabase para empezar a registrar la evolución del costo de la materia prima. A partir de
                    ahí, cada compra o edición de costo se guarda automáticamente.
                  </span>
                </div>
              ) : historial.rows.length === 0 ? (
                <EmptyState icon={Clock} title="Sin cambios de costo registrados aún"
                  subtitle="El historial se irá llenando solo: cada vez que una compra o una edición cambie el costo de un insumo, queda un registro acá para medir la inflación real." />
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <KpiCard label="Inflación promedio (por cambio)" value={`${histResumen.inflacionProm >= 0 ? '+' : ''}${histResumen.inflacionProm.toFixed(1)}%`}
                      icon={histResumen.inflacionProm >= 0 ? TrendingUp : TrendingDown}
                      color={histResumen.inflacionProm >= 0 ? colors.danger : colors.success} />
                    <KpiCard label="Insumos con historial" value={histResumen.itemsDistintos} icon={Warehouse} color={colors.brand} />
                    <KpiCard label="Cambios registrados" value={histResumen.totalRegistros} icon={Clock} color={colors.textSecondary} />
                  </div>

                  {/* Variación acumulada por insumo */}
                  <div className="overflow-hidden" style={SURFACE}>
                    <div className="px-4 py-2.5" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>📈 Variación acumulada por insumo</span>
                      <span className="text-xs ml-2" style={{ color: colors.textMuted }}>desde el primer registro</span>
                    </div>
                    <div className="overflow-x-auto">
                      <Table className="min-w-[720px]">
                        <Thead>
                          <Tr>
                            <Th>Insumo</Th>
                            <Th className="text-right">Costo inicial ($)</Th>
                            <Th className="text-right">Costo actual ($)</Th>
                            <Th className="text-right">Variación</Th>
                            <Th className="text-right">Cambios</Th>
                            <Th className="text-right">Último</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {histResumen.items.map(it => (
                            <Tr key={it.nombre}>
                              <Td className="font-medium">{it.nombre}</Td>
                              <Td className="text-right">${pesos(it.primero)}</Td>
                              <Td className="text-right font-semibold">${pesos(it.ultimo)}</Td>
                              <Td className="text-right">
                                {it.variacionAcum == null ? <span style={{ color: colors.textMuted }}>—</span>
                                  : <span style={{ color: it.variacionAcum > 0 ? colors.danger : it.variacionAcum < 0 ? colors.success : colors.textMuted, fontWeight: 700 }}>
                                      {it.variacionAcum > 0 ? '▲' : it.variacionAcum < 0 ? '▼' : ''} {it.variacionAcum >= 0 ? '+' : ''}{it.variacionAcum.toFixed(1)}%
                                    </span>}
                              </Td>
                              <Td className="text-right text-xs" style={{ color: colors.textSecondary }}>{it.cambios}</Td>
                              <Td className="text-right text-xs" style={{ color: colors.textMuted }}>{it.ultimaFecha}</Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </div>
                  </div>

                  {/* Últimos cambios de costo */}
                  <div className="overflow-hidden" style={SURFACE}>
                    <div className="px-4 py-2.5" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>🕑 Últimos cambios</span>
                    </div>
                    <div className="overflow-x-auto">
                      <Table className="min-w-[720px]">
                        <Thead>
                          <Tr>
                            <Th>Fecha</Th><Th>Insumo</Th>
                            <Th className="text-right">Anterior ($)</Th>
                            <Th className="text-right">Nuevo ($)</Th>
                            <Th className="text-right">Variación</Th>
                            <Th>Origen</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {historial.rows.slice(0, 60).map(r => (
                            <Tr key={r.id}>
                              <Td className="text-xs" style={{ color: colors.textSecondary }}>{r.fecha}</Td>
                              <Td className="font-medium">{r.item_nombre}</Td>
                              <Td className="text-right">{r.costo_anterior != null ? `$${pesos(r.costo_anterior)}` : '—'}</Td>
                              <Td className="text-right font-semibold">${pesos(r.costo_nuevo)}</Td>
                              <Td className="text-right">
                                {r.variacion_pct == null ? <span style={{ color: colors.textMuted }}>nuevo</span>
                                  : <span style={{ color: r.variacion_pct > 0 ? colors.danger : r.variacion_pct < 0 ? colors.success : colors.textMuted, fontWeight: 700 }}>
                                      {r.variacion_pct >= 0 ? '+' : ''}{Number(r.variacion_pct).toFixed(1)}%
                                    </span>}
                              </Td>
                              <Td>
                                <Badge variant={r.origen === 'compra' ? 'info' : r.origen === 'edicion_manual' ? 'warning' : 'neutral'}>
                                  {r.origen === 'compra' ? 'Compra' : r.origen === 'edicion_manual' ? 'Edición' : r.origen || '—'}
                                </Badge>
                              </Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══════════════════════════ TAB RESUMEN ═══════════════════════════ */}
          {tab === 'Resumen Ejecutivo' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <KpiCard label="Margen promedio portfolio" value={`${margenPromedio.toFixed(1)}%`} icon={Percent} color={nivelMargen(margenPromedio).barColor} />
                <KpiCard label="Producto más rentable"  value={margenesSorted[0]?.nombre.split(' ')[0] || '—'} icon={TrendingUp} color={colors.success} />
                <KpiCard label="Producto menos rentable" value={margenesSorted[margenesSorted.length - 1]?.nombre.split(' ')[0] || '—'} icon={TrendingDown} color={colors.danger} />
                <KpiCard label="Total CIF/mes"           value={`$${pesos(totalCIF)}`}            icon={DollarSign}  color={colors.brand} />
                <KpiCard label="CIF/litro producido"     value={cifPorLitro > 0 ? `$${pesos(cifPorLitro)}/L` : '—'} icon={Percent} color='#f59e0b' />
                <KpiCard label="% CIF sobre costo total" value={(() => { const ct = productos.reduce((a,p)=>a+(p.costo_total||0),0); return ct > 0 ? `${(totalCIF/ct*100).toFixed(1)}%` : '—' })()} icon={Percent} color='#6366f1' />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <KpiCard label="Valor stock depósito"  value={`$${pesos(valorDeposito)}`}  icon={Warehouse}   color={colors.brand} />
                <KpiCard label="Valor stock cámaras"   value={`$${pesos(valorCamaras)}`}   icon={Thermometer} color={colors.info}  />
              </div>

              <div className="p-4" style={SURFACE}>
                <h3 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>
                  Estructura de costos
                </h3>
                <p className="text-xs mb-3" style={{ color: colors.textMuted }}>
                  Proporción de materia prima, mano de obra{totalCIF > 0 ? ' y CIF' : ''} en el costo de las recetas.
                </p>
                {(() => {
                  const total = distribucionCostos.reduce((a, d) => a + (d.value || 0), 0)
                  if (total <= 0) return (
                    <EmptyState icon={TrendingUp} title="Sin datos de costos"
                      subtitle="Cargá ingredientes y mano de obra en la pestaña Costos para ver la distribución" />
                  )
                  return (
                    <div className="space-y-3">
                      <div className="flex h-7 w-full rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
                        {distribucionCostos.filter(d => d.value > 0).map(d => (
                          <div key={d.name} title={`${d.name}: $${pesos(d.value)}`}
                            style={{ width: `${(d.value / total) * 100}%`, backgroundColor: d.color }} />
                        ))}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {distribucionCostos.map(d => (
                          <div key={d.name} className="flex items-center gap-2 min-w-0">
                            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
                            <div className="min-w-0">
                              <p className="text-xs truncate" style={{ color: colors.textMuted }}>{d.name}</p>
                              <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                ${pesos(d.value)}
                                <span className="text-xs font-normal ml-1" style={{ color: colors.textMuted }}>· {((d.value / total) * 100).toFixed(1)}%</span>
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
