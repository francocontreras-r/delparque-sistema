import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  dibujarPortada, dibujarEncabezado, dibujarPie, dibujarSeccion, dibujarFirmas,
  getEstiloInforme, PDF_CONTENT_Y, PDF_NEGRO, PDF_BLANCO,
  PDF_SEM_NEG, PDF_SEM_OK, PDF_SEM_EXC,
} from '../lib/pdfEstilos'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import { exportarCSV } from '../lib/exportar'
import { crearCosteador } from '../lib/costeoRecetas'
import { cargarHistorialCostos } from '../lib/historialCostos'
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
const TABS = ['Costos', 'CIF', 'Márgenes', 'Historial', 'Resumen Ejecutivo']

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
  const [historial, setHistorial]   = useState({ disponible: true, rows: [] })
  const [histLoading, setHistLoading] = useState(false)

  useEffect(() => { cargar() }, [])

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
      supabase.from('stock_camaras').select('nombre,tipo_producto').in('tipo_producto', ['impulsivo', 'postre']),
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

  // Mapa nombre→litros_base para calcular CIF por sabor
  const litrosBasePorNombre = useMemo(() => {
    const m = {}
    sabores.forEach(s => { m[(s.nombre || '').toUpperCase()] = s.litros_base || 0 })
    return m
  }, [sabores])

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
      return {
        key: `${prefix}-${r.id}`, id: r.id, tabla, nombre: r.nombre,
        costo_materiales: costoMat,
        mano_de_obra: r.mano_de_obra || 0,
        costo_total: costoTotal,
        cif_kg: cifKg,
        costo_total_cif: costoTotal + cifKg,
        precio_venta: r.precio_venta || 0,
        litros_base: r.litros_base || 0,
      }
    }
    const cifSabor = (r) => cifPorLitro * (litrosBasePorNombre[(r.nombre || '').toUpperCase()] || 0)
    const impsRows = impulsivos.map(mkRow('impulsivos', 'impulsivo', null))
    return {
      Bases:      bases.map(mkRow('bases', 'base', null)),
      Sabores:    sabores.map(mkRow('sabores', 'sabor', cifSabor)),
      Impulsivos: impsRows.filter(r => (tiposMap[(r.nombre || '').toUpperCase()] || 'impulsivo') === 'impulsivo'),
      Postres:    impsRows.filter(r => tiposMap[(r.nombre || '').toUpperCase()] === 'postre'),
    }
  }, [bases, sabores, impulsivos, tiposMap, cifPorLitro, litrosBasePorNombre, costeador, saborIngredientes, impulsivoIngredientes, baseIngredientes])

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
    const MOD = 'Finanzas'

    const conPrecio = margenes.filter(p => p.precio_venta > 0)
    const ordenado = [...conPrecio].sort((a, b) => b.margen - a.margen)

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
      head: [['Producto', 'Tipo', 'Costo total', 'Precio venta', 'Ganancia', 'Margen', 'Estado']],
      body: ordenado.map(p => [
        p.nombre, p.tipo || '—',
        `$${pesos(p.costo_total)}`, `$${pesos(p.precio_venta)}`, `$${pesos(p.ganancia)}`,
        `${p.margen.toFixed(1)}%`, nivelStr(p.margen),
      ]),
      columnStyles: {
        0: { cellWidth: 46 },
        2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
        6: { halign: 'center', cellWidth: 24 },
      },
      didParseCell: d => {
        if (d.section !== 'body') return
        const m = ordenado[d.row.index]?.margen ?? 0
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
                { header: 'Costo total', get: p => Math.round(p.costo_total || 0) },
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
                    <Table className="min-w-[820px]">
                      <Thead>
                        <Tr>
                          <Th>Producto</Th><Th className="text-right">Costo MP ($)</Th>
                          <Th className="text-right">MOD ($)</Th>
                          <Th className="text-right">CIF ($)</Th>
                          <Th className="text-right">Costo Total ($)</Th>
                          <Th className="text-right">Precio venta ($)</Th>
                          <Th className="text-right">Margen %</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {items.map(p => {
                          const prev = prevSnapshot?.[p.key]
                          const margen = margenPct(p.costo_total_cif, p.precio_venta)
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
                              <Td className="text-right text-xs" style={{ color: p.cif_kg > 0 ? colors.textSecondary : colors.textMuted }}>
                                {p.cif_kg > 0 ? `$${pesos(p.cif_kg)}` : '—'}
                              </Td>
                              <Td className="text-right font-semibold">
                                ${pesos(p.costo_total_cif)}
                                {tieneDiff && <DiffBadge actual={p.costo_total} anterior={prev?.costo_total} />}
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
