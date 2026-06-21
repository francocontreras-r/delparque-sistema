import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import {
  FileText, Scale, Package, Users, TrendingDown, TrendingUp, DollarSign, Percent,
  Warehouse, Thermometer, Award, ArrowUp, ArrowDown, Minus, FileDown,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
const logoUrl = '/logo_delparque.png'

const TABS = ['Producción', 'Mermas', 'Financiero']

// Productos excluidos del informe de producción
const NOMBRES_EXCLUIDOS = new Set(['barra helada'])

const PERIODOS = [
  { key: 'dia',       label: 'Día',       dias: 1  },
  { key: 'semana',    label: 'Semana',    dias: 7  },
  { key: 'mes',       label: 'Mes',       dias: 30 },
  { key: 'trimestre', label: 'Trimestre', dias: 90 },
]

const TIPO_PRECIOS = {
  Lisa:           { costo_kg: 1200 },
  'Con Agregado': { costo_kg: 1500 },
  Agua:           { costo_kg:  900 },
  Especial:       { costo_kg: 2000 },
}

function pesos(n) { return Math.round(n || 0).toLocaleString('es-AR') }
function fmtNum(n, dec = 1) { return Number(n || 0).toFixed(dec) }

function fmtFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
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

function esImpulsivo(r, categoriaPorCodigo) {
  const cat = (r.categoria || categoriaPorCodigo[r.producto_codigo] || '').toLowerCase()
  return cat.includes('impulsiv') || cat.includes('postre')
}

// Para registros manuales de impulsivos/postres, "peso_kg" representa la
// cantidad de unidades cargadas; para registros escaneados, cada lectura es 1 unidad.
function unidadesDe(r) {
  return r.origen === 'manual' ? (r.peso_kg || 0) : 1
}

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

// pct === null     → sin datos en ningún período
// pct === Infinity → no había datos en el período anterior (producto nuevo)
function variacionPct(actual, anterior) {
  if (!anterior) return actual === 0 ? null : Infinity
  return ((actual - anterior) / anterior) * 100
}

function fmtVar(pct) {
  if (pct === null) return '—'
  if (pct === Infinity) return 'Nuevo'
  const signo = pct > 0 ? '+' : ''
  return `${signo}${pct.toFixed(1)}%`
}

function VariacionTag({ pct, invertido = false }) {
  if (pct === null) return <Badge variant="neutral">—</Badge>
  if (pct === Infinity) return <Badge variant="info">Nuevo</Badge>
  const subio = pct > 0.5
  const bajo  = pct < -0.5
  const bueno = invertido ? bajo : subio
  const malo  = invertido ? subio : bajo
  const variant = bueno ? 'success' : malo ? 'danger' : 'neutral'
  const Icon = subio ? ArrowUp : bajo ? ArrowDown : Minus
  return (
    <Badge variant={variant}>
      <Icon size={11} className="inline -mt-0.5 mr-1" />
      {Math.abs(pct).toFixed(1)}%
    </Badge>
  )
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

export default function Informes() {
  const [tab, setTab]               = useState('Producción')
  const [periodo, setPeriodo]       = useState('semana')
  const [diaSeleccionado, setDiaSeleccionado] = useState(hoyISO)
  const [loading, setLoading]       = useState(true)
  const [exportando, setExportando] = useState(false)

  const [produccionesActual, setProduccionesActual]     = useState([])
  const [produccionesAnterior, setProduccionesAnterior] = useState([])
  const [mermasActual, setMermasActual]     = useState([])
  const [mermasAnterior, setMermasAnterior] = useState([])
  const [categoriaPorCodigo, setCategoriaPorCodigo] = useState({})
  const [sabores, setSabores]           = useState([])
  const [impulsivos, setImpulsivos]     = useState([])
  const [insumos, setInsumos]           = useState([])
  const [stockCamaras, setStockCamaras] = useState([])

  const rango = useMemo(() => {
    if (periodo === 'dia') {
      const antHasta = sumarDias(diaSeleccionado, -1)
      return { desde: diaSeleccionado, hasta: diaSeleccionado, antDesde: antHasta, antHasta }
    }
    return calcularRangos(periodo)
  }, [periodo, diaSeleccionado])

  useEffect(() => { cargar() }, [rango]) // eslint-disable-line react-hooks/exhaustive-deps

  async function cargar() {
    setLoading(true)
    const { desde, hasta, antDesde, antHasta } = rango
    const [
      { data: prodAct }, { data: prodAnt },
      { data: merAct }, { data: merAnt },
      { data: pp }, { data: sab }, { data: imp }, { data: ins }, { data: cam },
    ] = await Promise.all([
      supabase.from('producciones').select('*').gte('fecha', desde).lte('fecha', hasta),
      supabase.from('producciones').select('*').gte('fecha', antDesde).lte('fecha', antHasta),
      supabase.from('mermas').select('*').gte('fecha', desde).lte('fecha', hasta),
      supabase.from('mermas').select('*').gte('fecha', antDesde).lte('fecha', antHasta),
      supabase.from('productos_produccion').select('codigo,categoria'),
      supabase.from('sabores').select('*'),
      supabase.from('impulsivos').select('*'),
      supabase.from('insumos').select('*'),
      supabase.from('stock_camaras').select('*'),
    ])
    setProduccionesActual(prodAct || [])
    setProduccionesAnterior(prodAnt || [])
    setMermasActual(merAct || [])
    setMermasAnterior(merAnt || [])
    setCategoriaPorCodigo(Object.fromEntries((pp || []).map(p => [p.codigo, p.categoria || 'OTRO'])))
    setSabores(sab || [])
    setImpulsivos(imp || [])
    setInsumos(ins || [])
    setStockCamaras(cam || [])
    setLoading(false)
  }

  // ── A) Informe de Producción ─────────────────────────────────────────────

  // Clasificación robusta: helado | impulsivo | postre
  // Busca por nombre en sabores, impulsivos y stock_camaras (tipo_producto).
  const clasificarRegistro = useMemo(() => {
    const saboresSet = new Set(sabores.map(s => (s.nombre || '').trim().toLowerCase()))
    const impulsivosSet = new Set(impulsivos.map(i => (i.nombre || '').trim().toLowerCase()))
    const camMap = {}
    stockCamaras.forEach(c => { camMap[(c.nombre || '').trim().toLowerCase()] = c.tipo_producto })
    return (r) => {
      const nombre = (r.producto_nombre || '').trim().toLowerCase()
      const cat = (r.categoria || categoriaPorCodigo[r.producto_codigo] || '').toLowerCase()
      if (cat === 'helado' || saboresSet.has(nombre)) return 'helado'
      const tipoCam = camMap[nombre]
      if (tipoCam === 'postre') return 'postre'
      if (tipoCam === 'impulsivo') return 'impulsivo'
      if (impulsivosSet.has(nombre)) return 'impulsivo'
      if (cat.includes('postre')) return 'postre'
      if (cat.includes('impulsiv')) return 'impulsivo'
      return 'helado'
    }
  }, [sabores, impulsivos, stockCamaras, categoriaPorCodigo])

  const produccionInforme = useMemo(() => {
    function analizar(lista) {
      const filtrada = lista.filter(r =>
        !NOMBRES_EXCLUIDOS.has((r.producto_nombre || '').trim().toLowerCase())
      )
      let kgHelados = 0, regHelados = 0, unidadesImpulsivos = 0, kgPostres = 0, regPostres = 0
      const porProducto = {}
      const porOperario = {}

      filtrada.forEach(r => {
        const tipo = clasificarRegistro(r)
        const nombre = r.producto_nombre || 'Sin nombre'
        const op = r.operario_nombre || 'Sin asignar'

        if (!porProducto[nombre]) porProducto[nombre] = { nombre, tipo, kg: 0, unidades: 0, registros: 0 }
        if (!porOperario[op]) porOperario[op] = {
          nombre: op, registros: 0,
          kgSabores: 0, regSabores: 0,
          unidImpulsivos: 0,
          kgPostres: 0, regPostres: 0,
        }
        porProducto[nombre].registros++
        porOperario[op].registros++

        if (tipo === 'helado') {
          kgHelados += r.peso_kg || 0; regHelados++
          porProducto[nombre].kg += r.peso_kg || 0
          porOperario[op].kgSabores += r.peso_kg || 0; porOperario[op].regSabores++
        } else if (tipo === 'impulsivo') {
          const u = unidadesDe(r)
          unidadesImpulsivos += u
          porProducto[nombre].unidades += u
          porOperario[op].unidImpulsivos += u
        } else {
          kgPostres += r.peso_kg || 0; regPostres++
          porProducto[nombre].kg += r.peso_kg || 0
          porProducto[nombre].unidades++
          porOperario[op].kgPostres += r.peso_kg || 0; porOperario[op].regPostres++
        }
      })

      const baldesHelados = Math.round(kgHelados / 7)
      const promedioKgHelados = regHelados > 0 ? kgHelados / regHelados : 0
      const unidadesPostres = regPostres

      return {
        kgHelados, regHelados, baldesHelados, promedioKgHelados,
        unidadesImpulsivos,
        kgPostres, unidadesPostres,
        // Compat legacy
        unidadesTotal: unidadesImpulsivos + unidadesPostres,
        porProducto: Object.values(porProducto),
        porOperario: Object.values(porOperario).sort((a, b) => b.kgSabores - a.kgSabores),
      }
    }
    return { actual: analizar(produccionesActual), anterior: analizar(produccionesAnterior) }
  }, [produccionesActual, produccionesAnterior, clasificarRegistro])

  // Tablas por sección
  const prodTableData = useMemo(() => {
    const prods = produccionInforme.actual.porProducto
    return {
      sabores: prods
        .filter(p => p.tipo === 'helado')
        .map(p => ({ ...p, baldes: Math.round(p.kg / 7), promedio: p.registros > 0 ? p.kg / p.registros : 0 }))
        .sort((a, b) => b.kg - a.kg),
      impulsivos: prods
        .filter(p => p.tipo === 'impulsivo')
        .sort((a, b) => b.unidades - a.unidades),
      postres: prods
        .filter(p => p.tipo === 'postre')
        .map(p => ({ ...p, promedio: p.registros > 0 ? p.kg / p.registros : 0 }))
        .sort((a, b) => b.unidades - a.unidades),
    }
  }, [produccionInforme])

  const chartProduccion = useMemo(() => (
    produccionInforme.actual.porProducto
      .filter(p => p.tipo === 'helado' && p.kg > 0)
      .map(p => ({ nombre: p.nombre, kg: Number(p.kg.toFixed(1)) }))
      .sort((a, b) => b.kg - a.kg)
      .slice(0, 8)
  ), [produccionInforme])

  // ── B) Informe de Mermas ──────────────────────────────────────────────────
  const costoKgPorProducto = useMemo(() => {
    const m = {}
    stockCamaras.forEach(s => {
      const costo = s.costo_kg ?? TIPO_PRECIOS[s.tipo]?.costo_kg ?? 0
      m[(s.nombre || '').trim().toLowerCase()] = costo
    })
    return m
  }, [stockCamaras])

  function costoMerma(m) {
    const costoKg = costoKgPorProducto[(m.sabor_nombre || '').trim().toLowerCase()] || 0
    return (m.diferencia || 0) * costoKg
  }

  const mermasInforme = useMemo(() => {
    function analizar(lista) {
      const totalDif = lista.reduce((a, m) => a + (m.diferencia || 0), 0)
      const totalTeo = lista.reduce((a, m) => a + (m.kg_teoricos || 0), 0)
      const pctGlobal = totalTeo > 0 ? (totalDif / totalTeo) * 100 : 0
      const costoTotal = lista.reduce((a, m) => a + costoMerma(m), 0)

      const porProducto = {}
      const porOperario  = {}
      const porCausa     = {}
      lista.forEach(m => {
        const prod = m.sabor_nombre || 'Sin especificar'
        if (!porProducto[prod]) porProducto[prod] = { nombre: prod, dif: 0, teo: 0 }
        porProducto[prod].dif += m.diferencia || 0
        porProducto[prod].teo += m.kg_teoricos || 0

        const op = m.operario_nombre || 'Sin asignar'
        if (!porOperario[op]) porOperario[op] = { nombre: op, dif: 0, teo: 0 }
        porOperario[op].dif += m.diferencia || 0
        porOperario[op].teo += m.kg_teoricos || 0

        const causa = m.causa || 'Sin especificar'
        if (!porCausa[causa]) porCausa[causa] = { causa, dif: 0, costo: 0, cnt: 0 }
        porCausa[causa].dif += m.diferencia || 0
        porCausa[causa].costo += costoMerma(m)
        porCausa[causa].cnt++
      })
      return {
        totalDif, totalTeo, pctGlobal, costoTotal,
        porProducto: Object.values(porProducto).map(p => ({ ...p, pct: p.teo > 0 ? (p.dif / p.teo) * 100 : 0 })).sort((a, b) => b.dif - a.dif),
        porOperario: Object.values(porOperario).map(o => ({ ...o, pct: o.teo > 0 ? (o.dif / o.teo) * 100 : 0 })).sort((a, b) => b.pct - a.pct),
        porCausa: Object.values(porCausa).sort((a, b) => b.dif - a.dif),
      }
    }
    return { actual: analizar(mermasActual), anterior: analizar(mermasAnterior) }
  }, [mermasActual, mermasAnterior, costoKgPorProducto])

  const chartMermas = useMemo(() => (
    mermasInforme.actual.porProducto.slice(0, 8).map(p => ({ nombre: p.nombre, kg: Number(p.dif.toFixed(2)) }))
  ), [mermasInforme])

  // ── C) Informe Financiero ─────────────────────────────────────────────────
  const valorDeposito = useMemo(() => (
    insumos.reduce((a, i) => a + (i.stock_actual || 0) * (i.costo_unitario || 0), 0)
  ), [insumos])

  const valorCamaras = useMemo(() => (
    stockCamaras.reduce((a, c) => {
      const costoKg = c.costo_kg ?? TIPO_PRECIOS[c.tipo]?.costo_kg ?? 0
      return a + (c.kg || 0) * costoKg
    }, 0)
  ), [stockCamaras])

  const productosFinancieros = useMemo(() => {
    const a = sabores.map(s => ({
      key: `sabor-${s.id}`, nombre: s.nombre, tipo: 'Helado',
      costo_total: s.costo_total || 0, precio_venta: s.precio_venta || 0,
    }))
    const b = impulsivos.map(i => ({
      key: `impulsivo-${i.id}`, nombre: i.nombre, tipo: 'Impulsivo/Postre',
      costo_total: i.costo_total || 0, precio_venta: i.precio_venta || 0,
    }))
    return [...a, ...b].map(p => ({
      ...p,
      ganancia: (p.precio_venta || 0) - (p.costo_total || 0),
      margen: margenPct(p.costo_total, p.precio_venta),
    }))
  }, [sabores, impulsivos])

  const masRentables = useMemo(() => (
    [...productosFinancieros].filter(p => p.precio_venta > 0).sort((a, b) => b.margen - a.margen).slice(0, 5)
  ), [productosFinancieros])

  const margenPromedio = useMemo(() => {
    const conPrecio = productosFinancieros.filter(p => p.precio_venta > 0)
    if (conPrecio.length === 0) return 0
    return conPrecio.reduce((a, p) => a + p.margen, 0) / conPrecio.length
  }, [productosFinancieros])

  const costoProduccionPeriodo = useMemo(() => {
    const costoPorNombre = {}
    productosFinancieros.forEach(p => { costoPorNombre[p.nombre.trim().toLowerCase()] = p.costo_total })
    return produccionesActual.reduce((acc, r) => {
      const tipo = clasificarRegistro(r)
      const nombre = (r.producto_nombre || '').trim().toLowerCase()
      if (tipo !== 'helado') {
        const costoUnit = costoPorNombre[nombre] || 0
        return acc + unidadesDe(r) * costoUnit
      }
      const costoKg = costoPorNombre[nombre] ?? costoKgPorProducto[nombre] ?? 0
      return acc + (r.peso_kg || 0) * costoKg
    }, 0)
  }, [produccionesActual, productosFinancieros, clasificarRegistro, costoKgPorProducto])

  // ── Exportación PDF ───────────────────────────────────────────────────────
  function periodoLabel() {
    if (periodo === 'dia') return `Día ${fmtFecha(diaSeleccionado)}`
    return PERIODOS.find(p => p.key === periodo)?.label || ''
  }

  async function exportarPDF() {
    setExportando(true)
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()

    try {
      const logoData = await toDataURL(logoUrl)
      doc.addImage(logoData, 'PNG', 14, 10, 36, 13)
    } catch {
      // si no se puede cargar el logo, se continúa sin él
    }

    doc.setFontSize(13)
    doc.setTextColor(40, 40, 40)
    doc.text(`Informe de ${tab}`, pageWidth - 14, 14, { align: 'right' })
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text(`Período: ${fmtFecha(rango.desde)} – ${fmtFecha(rango.hasta)} (${periodoLabel()})`, pageWidth - 14, 19, { align: 'right' })
    doc.text(`vs. anterior: ${fmtFecha(rango.antDesde)} – ${fmtFecha(rango.antHasta)} · Emitido ${new Date().toLocaleString('es-AR')}`, pageWidth - 14, 24, { align: 'right' })

    const headStyles = { fillColor: [212, 82, 26], textColor: 255 }
    const styles = { fontSize: 8, cellPadding: 2 }
    let startY = 32

    function titulo(texto, y) {
      doc.setFontSize(10)
      doc.setTextColor(40, 40, 40)
      doc.text(texto, 14, y)
    }

    if (tab === 'Producción') {
      const { actual, anterior } = produccionInforme
      autoTable(doc, {
        startY,
        head: [['Indicador', 'Período actual', 'Período anterior', 'Variación']],
        body: [
          ['Total KG (helados)', `${fmtNum(actual.kgHelados)} kg`, `${fmtNum(anterior.kgHelados)} kg`, fmtVar(variacionPct(actual.kgHelados, anterior.kgHelados))],
          ['Total unidades (impulsivos)', `${fmtNum(actual.unidadesImpulsivos, 0)} u`, `${fmtNum(anterior.unidadesImpulsivos, 0)} u`, fmtVar(variacionPct(actual.unidadesImpulsivos, anterior.unidadesImpulsivos))],
          ['Total unidades (postres)', `${fmtNum(actual.unidadesPostres, 0)} u`, `${fmtNum(anterior.unidadesPostres, 0)} u`, fmtVar(variacionPct(actual.unidadesPostres, anterior.unidadesPostres))],
          ['Operarios activos', String(actual.porOperario.length), String(anterior.porOperario.length), '—'],
        ],
        styles, headStyles,
      })
      startY = doc.lastAutoTable.finalY + 8

      titulo('Producción por producto', startY)
      autoTable(doc, {
        startY: startY + 3,
        head: [['Producto', 'Cantidad', 'Período anterior', 'Variación']],
        body: productosComparados.map(p => {
          const esHelado = p.tipo === 'helado'
          return [
            p.nombre,
            `${fmtNum(p.valorActual, esHelado ? 1 : 0)} ${esHelado ? 'kg' : 'u'}`,
            `${fmtNum(p.valorAnterior, esHelado ? 1 : 0)} ${esHelado ? 'kg' : 'u'}`,
            fmtVar(p.variacion),
          ]
        }),
        styles, headStyles,
      })
      startY = doc.lastAutoTable.finalY + 8

      titulo('Producción por operario', startY)
      autoTable(doc, {
        startY: startY + 3,
        head: [['Operario', 'Kg producidos', 'Unidades', 'Registros']],
        body: actual.porOperario.map(o => [o.nombre, `${fmtNum(o.kg)} kg`, `${fmtNum(o.unidades, 0)} u`, String(o.registros)]),
        styles, headStyles,
      })
    }

    if (tab === 'Mermas') {
      const { actual, anterior } = mermasInforme
      autoTable(doc, {
        startY,
        head: [['Indicador', 'Período actual', 'Período anterior', 'Variación']],
        body: [
          ['Kg merma total', `${fmtNum(actual.totalDif)} kg`, `${fmtNum(anterior.totalDif)} kg`, fmtVar(variacionPct(actual.totalDif, anterior.totalDif))],
          ['% merma global', `${fmtNum(actual.pctGlobal)}%`, `${fmtNum(anterior.pctGlobal)}%`, fmtVar(variacionPct(actual.pctGlobal, anterior.pctGlobal))],
          ['Costo total merma', `$${pesos(actual.costoTotal)}`, `$${pesos(anterior.costoTotal)}`, fmtVar(variacionPct(actual.costoTotal, anterior.costoTotal))],
        ],
        styles, headStyles,
      })
      startY = doc.lastAutoTable.finalY + 8

      titulo('Merma por producto', startY)
      autoTable(doc, {
        startY: startY + 3,
        head: [['Producto', 'Kg merma', '% merma']],
        body: actual.porProducto.map(p => [p.nombre, `${fmtNum(p.dif)} kg`, `${fmtNum(p.pct)}%`]),
        styles, headStyles,
      })
      startY = doc.lastAutoTable.finalY + 8

      titulo('% de merma por operario', startY)
      autoTable(doc, {
        startY: startY + 3,
        head: [['Operario', 'Kg merma', '% merma']],
        body: actual.porOperario.map(o => [o.nombre, `${fmtNum(o.dif)} kg`, `${fmtNum(o.pct)}%`]),
        styles, headStyles,
      })
      startY = doc.lastAutoTable.finalY + 8

      titulo('Top causas de merma', startY)
      autoTable(doc, {
        startY: startY + 3,
        head: [['Causa', 'Registros', 'Kg merma', 'Costo']],
        body: actual.porCausa.slice(0, 3).map(c => [c.causa, String(c.cnt), `${fmtNum(c.dif)} kg`, `$${pesos(c.costo)}`]),
        styles, headStyles,
      })
    }

    if (tab === 'Financiero') {
      autoTable(doc, {
        startY,
        head: [['Indicador', 'Valor']],
        body: [
          ['Valor stock depósito', `$${pesos(valorDeposito)}`],
          ['Valor stock cámaras', `$${pesos(valorCamaras)}`],
          ['Valor total de stock', `$${pesos(valorDeposito + valorCamaras)}`],
          ['Costo de producción del período', `$${pesos(costoProduccionPeriodo)}`],
          ['Margen estimado promedio', `${fmtNum(margenPromedio)}%`],
        ],
        styles, headStyles,
      })
      startY = doc.lastAutoTable.finalY + 8

      titulo('Productos más rentables', startY)
      autoTable(doc, {
        startY: startY + 3,
        head: [['Producto', 'Tipo', 'Costo', 'Precio venta', 'Ganancia', 'Margen %']],
        body: masRentables.map(p => [p.nombre, p.tipo, `$${pesos(p.costo_total)}`, `$${pesos(p.precio_venta)}`, `$${pesos(p.ganancia)}`, `${fmtNum(p.margen)}%`]),
        styles, headStyles,
      })
    }

    doc.save(`informe_${tab.toLowerCase()}_${hoyISO()}.pdf`)
    setExportando(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Informes</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Informe ejecutivo para dirección</p>
        </div>
        <Button variant="primary" onClick={exportarPDF} loading={exportando} disabled={loading}>
          <FileDown size={15} /> Exportar PDF
        </Button>
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

      <div className="p-3 flex flex-wrap gap-3 items-center justify-between" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
        <div className="flex gap-1.5 flex-wrap items-center">
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
          {periodo === 'dia' && (
            <input
              type="date"
              value={diaSeleccionado}
              onChange={e => setDiaSeleccionado(e.target.value)}
              className="rounded-lg border text-xs px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-[#D4521A]/25 focus:border-[#D4521A]"
              style={{ borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bg }}
            />
          )}
        </div>
        <p className="text-xs" style={{ color: colors.textMuted }}>
          {periodo === 'dia'
            ? `${fmtFecha(rango.desde)} · vs. ${fmtFecha(rango.antHasta)}`
            : `${fmtFecha(rango.desde)} – ${fmtFecha(rango.hasta)} · vs. ${fmtFecha(rango.antDesde)} – ${fmtFecha(rango.antHasta)}`}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-14"><Spinner size={28} /></div>
      ) : (
        <>
          {tab === 'Producción' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiCard label="KG Helados" value={`${fmtNum(produccionInforme.actual.kgHelados)} kg`} icon={Scale} color={colors.brand}
                sub={<VariacionTag pct={variacionPct(produccionInforme.actual.kgHelados, produccionInforme.anterior.kgHelados)} />} />
              <KpiCard label="Baldes Helados" value={`${produccionInforme.actual.baldesHelados} bal.`} icon={Scale} color={colors.info}
                sub={`≈ ${fmtNum(produccionInforme.actual.promedioKgHelados, 2)} kg/reg`} />
              <KpiCard label="Unidades Impulsivos" value={`${fmtNum(produccionInforme.actual.unidadesImpulsivos, 0)} u`} icon={Package} color={colors.warning}
                sub={<VariacionTag pct={variacionPct(produccionInforme.actual.unidadesImpulsivos, produccionInforme.anterior.unidadesImpulsivos)} />} />
              <KpiCard label="Unidades Postres" value={`${fmtNum(produccionInforme.actual.unidadesPostres, 0)} u`} icon={Package} color="#a855f7"
                sub={<VariacionTag pct={variacionPct(produccionInforme.actual.unidadesPostres, produccionInforme.anterior.unidadesPostres)} />} />
              <KpiCard label="KG Postres" value={`${fmtNum(produccionInforme.actual.kgPostres, 1)} kg`} icon={Scale} color="#7c3aed"
                sub={<VariacionTag pct={variacionPct(produccionInforme.actual.kgPostres, produccionInforme.anterior.kgPostres)} />} />
            </div>

            {produccionesActual.length === 0 ? (
              <EmptyState icon={Scale} title="Sin producción en este período" subtitle="Registrá producción para ver el informe" />
            ) : (
              <>
                {chartProduccion.length > 0 && (
                  <div className="p-4" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                    <h3 className="text-sm font-semibold mb-3" style={{ color: colors.textPrimary }}>Kg producidos por producto</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={chartProduccion}>
                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                        <XAxis dataKey="nombre" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={80} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={v => [`${v} kg`, 'Producción']} />
                        <Bar dataKey="kg" fill={colors.brand} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Sección Sabores */}
                {prodTableData.sabores.length > 0 && (
                  <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                    <div className="px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.brand }}>🧊 Sabores (Helados)</span>
                      <span className="text-xs ml-auto" style={{ color: colors.textMuted }}>{fmtNum(produccionInforme.actual.kgHelados)} kg · {produccionInforme.actual.baldesHelados} baldes</span>
                    </div>
                    <Table className="min-w-[620px]">
                      <Thead><Tr><Th>Sabor</Th><Th className="text-right">Registros</Th><Th className="text-right">KG Total</Th><Th className="text-right">Baldes</Th><Th className="text-right">Prom kg/reg</Th></Tr></Thead>
                      <Tbody>
                        {prodTableData.sabores.map(p => (
                          <Tr key={p.nombre}>
                            <Td className="font-medium">{p.nombre}</Td>
                            <Td className="text-right" style={{ color: colors.textMuted }}>{p.registros}</Td>
                            <Td className="text-right font-bold" style={{ color: colors.brand }}>{fmtNum(p.kg, 1)} kg</Td>
                            <Td className="text-right">{p.baldes}</Td>
                            <Td className="text-right text-xs" style={{ color: colors.textMuted }}>{fmtNum(p.promedio, 2)} kg</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </div>
                )}

                {/* Sección Impulsivos */}
                {prodTableData.impulsivos.length > 0 && (
                  <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                    <div className="px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.warning }}>📦 Impulsivos</span>
                      <span className="text-xs ml-auto" style={{ color: colors.textMuted }}>{fmtNum(produccionInforme.actual.unidadesImpulsivos, 0)} unidades</span>
                    </div>
                    <Table className="min-w-[400px]">
                      <Thead><Tr><Th>Producto</Th><Th className="text-right">Unidades totales</Th></Tr></Thead>
                      <Tbody>
                        {prodTableData.impulsivos.map(p => (
                          <Tr key={p.nombre}>
                            <Td className="font-medium">{p.nombre}</Td>
                            <Td className="text-right font-bold" style={{ color: colors.warning }}>{fmtNum(p.unidades, 0)} u</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </div>
                )}

                {/* Sección Postres */}
                {prodTableData.postres.length > 0 && (
                  <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                    <div className="px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#a855f7' }}>🍰 Postres</span>
                      <span className="text-xs ml-auto" style={{ color: colors.textMuted }}>{fmtNum(produccionInforme.actual.unidadesPostres, 0)} u · {fmtNum(produccionInforme.actual.kgPostres, 1)} kg</span>
                    </div>
                    <Table className="min-w-[560px]">
                      <Thead><Tr><Th>Producto</Th><Th className="text-right">Unidades</Th><Th className="text-right">KG Total</Th><Th className="text-right">Prom kg/u</Th></Tr></Thead>
                      <Tbody>
                        {prodTableData.postres.map(p => (
                          <Tr key={p.nombre}>
                            <Td className="font-medium">{p.nombre}</Td>
                            <Td className="text-right font-bold" style={{ color: '#a855f7' }}>{fmtNum(p.unidades, 0)} u</Td>
                            <Td className="text-right">{fmtNum(p.kg, 1)} kg</Td>
                            <Td className="text-right text-xs" style={{ color: colors.textMuted }}>{fmtNum(p.promedio, 2)} kg</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </div>
                )}

                {/* Producción por operario — cards con desglose */}
                {produccionInforme.actual.porOperario.length > 0 && (
                  <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                    <div className="px-4 py-2.5" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>👤 Producción por operario</span>
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {produccionInforme.actual.porOperario.map(o => (
                        <div key={o.nombre} className="p-3 rounded-lg space-y-1.5" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}>
                          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textPrimary }}>{o.nombre}</p>
                          <p className="text-xs" style={{ color: colors.textMuted }}>Registros: <span className="font-semibold" style={{ color: colors.textPrimary }}>{o.registros}</span></p>
                          {o.kgSabores > 0 && (
                            <div className="text-xs" style={{ color: colors.brand }}>
                              <span className="font-semibold">{fmtNum(o.kgSabores, 1)} kg</span>
                              <span style={{ color: colors.textMuted }}> · {Math.round(o.kgSabores / 7)} baldes</span>
                              {o.regSabores > 0 && <span style={{ color: colors.textMuted }}> · prom {fmtNum(o.kgSabores / o.regSabores, 2)} kg/reg</span>}
                            </div>
                          )}
                          {o.unidImpulsivos > 0 && (
                            <p className="text-xs" style={{ color: colors.warning }}>
                              <span className="font-semibold">{fmtNum(o.unidImpulsivos, 0)} u</span>
                              <span style={{ color: colors.textMuted }}> impulsivos</span>
                            </p>
                          )}
                          {o.regPostres > 0 && (
                            <p className="text-xs" style={{ color: '#a855f7' }}>
                              <span className="font-semibold">{o.regPostres} u</span>
                              {o.kgPostres > 0 && <span style={{ color: colors.textMuted }}> · {fmtNum(o.kgPostres, 1)} kg</span>}
                              <span style={{ color: colors.textMuted }}> postres</span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
          )}

          {tab === 'Mermas' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Kg merma total" value={`${fmtNum(mermasInforme.actual.totalDif)} kg`} icon={TrendingDown} color={colors.danger}
                sub={<VariacionTag pct={variacionPct(mermasInforme.actual.totalDif, mermasInforme.anterior.totalDif)} invertido />} />
              <KpiCard label="% merma global" value={`${fmtNum(mermasInforme.actual.pctGlobal)}%`} icon={Percent}
                color={mermasInforme.actual.pctGlobal < 3 ? colors.success : mermasInforme.actual.pctGlobal < 8 ? colors.warning : colors.danger}
                sub={<VariacionTag pct={variacionPct(mermasInforme.actual.pctGlobal, mermasInforme.anterior.pctGlobal)} invertido />} />
              <KpiCard label="Costo total mermas" value={`$${pesos(mermasInforme.actual.costoTotal)}`} icon={DollarSign} color={colors.danger}
                sub={<VariacionTag pct={variacionPct(mermasInforme.actual.costoTotal, mermasInforme.anterior.costoTotal)} invertido />} />
              <KpiCard label="Tendencia"
                value={
                  mermasInforme.actual.pctGlobal < mermasInforme.anterior.pctGlobal ? 'Mejorando'
                  : mermasInforme.actual.pctGlobal > mermasInforme.anterior.pctGlobal ? 'Empeorando'
                  : 'Estable'
                }
                icon={mermasInforme.actual.pctGlobal <= mermasInforme.anterior.pctGlobal ? TrendingDown : TrendingUp}
                color={mermasInforme.actual.pctGlobal <= mermasInforme.anterior.pctGlobal ? colors.success : colors.danger} />
            </div>

            {mermasActual.length === 0 ? (
              <EmptyState icon={TrendingDown} title="Sin mermas en este período" subtitle="Las mermas registradas aparecerán aquí" />
            ) : (
              <>
                {chartMermas.length > 0 && (
                  <div className="p-4" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                    <h3 className="text-sm font-semibold mb-3" style={{ color: colors.textPrimary }}>Kg de merma por producto</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={chartMermas}>
                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                        <XAxis dataKey="nombre" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={80} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={v => [`${v} kg`, 'Merma']} />
                        <Bar dataKey="kg" fill={colors.danger} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <h3 className="px-4 pt-4 pb-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>Merma por producto</h3>
                  <Table className="min-w-[420px]">
                    <Thead>
                      <Tr>
                        <Th>Producto</Th>
                        <Th>Kg merma</Th>
                        <Th>% merma</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {mermasInforme.actual.porProducto.map(p => (
                        <Tr key={p.nombre}>
                          <Td className="font-medium">{p.nombre}</Td>
                          <Td className="text-right font-semibold" style={{ color: colors.danger }}>{fmtNum(p.dif)} kg</Td>
                          <Td><Badge variant={p.pct < 3 ? 'success' : p.pct < 8 ? 'warning' : 'danger'}>{fmtNum(p.pct)}%</Badge></Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>

                <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <h3 className="px-4 pt-4 pb-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>% de merma por operario</h3>
                  <Table className="min-w-[420px]">
                    <Thead>
                      <Tr>
                        <Th>Operario</Th>
                        <Th>Kg merma</Th>
                        <Th>% merma</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {mermasInforme.actual.porOperario.map(o => (
                        <Tr key={o.nombre}>
                          <Td className="font-medium">{o.nombre}</Td>
                          <Td className="text-right font-semibold" style={{ color: colors.danger }}>{fmtNum(o.dif)} kg</Td>
                          <Td><Badge variant={o.pct < 3 ? 'success' : o.pct < 8 ? 'warning' : 'danger'}>{fmtNum(o.pct)}%</Badge></Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>

                <div className="p-4" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: colors.textPrimary }}>Top causas de merma</h3>
                  <div className="space-y-2">
                    {mermasInforme.actual.porCausa.slice(0, 3).map((c, i) => (
                      <div key={c.causa} className="flex items-center gap-3 p-3" style={{ backgroundColor: colors.bg, borderRadius: radius.md }}>
                        <span className="text-lg font-bold flex-shrink-0" style={{ color: colors.brand }}>#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>{c.causa}</p>
                          <p className="text-xs" style={{ color: colors.textMuted }}>{c.cnt} registro{c.cnt !== 1 ? 's' : ''}</p>
                        </div>
                        <span className="text-sm font-bold flex-shrink-0" style={{ color: colors.danger }}>{c.dif.toFixed(2)} kg</span>
                        <Badge variant="danger">${pesos(c.costo)}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
          )}

          {tab === 'Financiero' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Valor stock depósito" value={`$${pesos(valorDeposito)}`} icon={Warehouse} color={colors.brand} />
              <KpiCard label="Valor stock cámaras" value={`$${pesos(valorCamaras)}`} icon={Thermometer} color={colors.info} />
              <KpiCard label="Valor total de stock" value={`$${pesos(valorDeposito + valorCamaras)}`} icon={DollarSign} color={colors.brand} />
              <KpiCard label="Costo producción del período" value={`$${pesos(costoProduccionPeriodo)}`} icon={Scale} color={colors.warning} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <KpiCard label="Margen estimado promedio" value={`${fmtNum(margenPromedio)}%`} icon={Percent} color={margenColor(margenPromedio)} />
              <KpiCard label="Producto más rentable" value={masRentables[0]?.nombre || '—'}
                sub={masRentables[0] ? `Margen ${fmtNum(masRentables[0].margen)}%` : undefined}
                icon={Award} color={colors.success} />
            </div>

            {masRentables.length === 0 ? (
              <EmptyState icon={DollarSign} title="Sin datos de costos y precios"
                subtitle="Cargá costos y precios de venta desde Finanzas para ver márgenes y productos más rentables" />
            ) : (
              <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                <h3 className="px-4 pt-4 pb-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>Productos más rentables</h3>
                <Table className="min-w-[640px]">
                  <Thead>
                    <Tr>
                      <Th>Producto</Th>
                      <Th>Tipo</Th>
                      <Th>Costo</Th>
                      <Th>Precio venta</Th>
                      <Th>Ganancia</Th>
                      <Th>Margen</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {masRentables.map(p => (
                      <Tr key={p.key}>
                        <Td className="font-medium">{p.nombre}</Td>
                        <Td><Badge variant="neutral">{p.tipo}</Badge></Td>
                        <Td className="text-right">${pesos(p.costo_total)}</Td>
                        <Td className="text-right">${pesos(p.precio_venta)}</Td>
                        <Td className="text-right font-semibold" style={{ color: p.ganancia >= 0 ? colors.success : colors.danger }}>${pesos(p.ganancia)}</Td>
                        <Td><Badge variant={margenVariant(p.margen)}>{fmtNum(p.margen)}%</Badge></Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            )}
          </>
          )}
        </>
      )}
    </div>
  )
}
