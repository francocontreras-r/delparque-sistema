import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { crearCostoUnitario } from '../lib/costoUnitario'
import { normalizarNombre } from '../lib/texto'
import { movimientosSinGemelo } from '../lib/dedupeProduccion'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Button from '../components/ui/Button'
import { PageHeader } from '../components/PageHeader'
import Modal from '../components/ui/Modal'
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
import {
  getEstiloInforme, dibujarPortada, dibujarEncabezado, dibujarPie,
  dibujarKpiCard, dibujarSeccion, dibujarFirmas,
  PDF_CONTENT_Y, PDF_NEGRO, PDF_SEM_NEG, PDF_SEM_CRIT, PDF_SEM_LOW, PDF_SEM_OK, PDF_SEM_EXC,
} from '../lib/pdfEstilos'

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

// Convierte un valor a ISO string de forma segura. Devuelve null si la fecha es inválida.
function safeToISO(val) {
  if (!val) return null
  try {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d.toISOString()
  } catch { return null }
}

function sumarDias(fechaISO, dias) {
  try {
    if (!fechaISO) return hoyISO()
    const d = new Date(fechaISO)
    if (isNaN(d.getTime())) return hoyISO()
    d.setDate(d.getDate() + dias)
    const iso = d.toISOString()
    return iso.split('T')[0]
  } catch { return hoyISO() }
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
  const [desdePers, setDesdePers]   = useState(() => sumarDias(hoyISO(), -6))
  const [hastaPers, setHastaPers]   = useState(hoyISO)
  const [loading, setLoading]       = useState(true)
  const [exportando, setExportando] = useState(false)
  const chartRefProd = useRef(null)
  const chartRefOp   = useRef(null)

  const [modalDetalle, setModalDetalle] = useState(null) // { nombre, tipo, registros }

  const [produccionesActual, setProduccionesActual]     = useState([])
  const [produccionesAnterior, setProduccionesAnterior] = useState([])
  const [mermasActual, setMermasActual]     = useState([])
  const [mermasAnterior, setMermasAnterior] = useState([])
  const [categoriaPorCodigo, setCategoriaPorCodigo] = useState({})
  const [sabores, setSabores]           = useState([])
  const [impulsivos, setImpulsivos]     = useState([])
  const [insumos, setInsumos]           = useState([])
  const [stockCamaras, setStockCamaras] = useState([])
  const [bases, setBases]               = useState([])
  const [baseIngredientes, setBaseIngredientes]     = useState([])
  const [saborIngredientes, setSaborIngredientes]   = useState([])
  const [impulsivoIngredientes, setImpulsivoIngredientes] = useState([])
  const [consumosBase, setConsumosBase] = useState([])   // vínculos base→producto (Órdenes)

  const rango = useMemo(() => {
    try {
      if (periodo === 'dia') {
        const diaValido = diaSeleccionado && !isNaN(new Date(diaSeleccionado).getTime())
          ? diaSeleccionado : hoyISO()
        const antHasta = sumarDias(diaValido, -1)
        return { desde: diaValido, hasta: diaValido, antDesde: antHasta, antHasta }
      }
      if (periodo === 'personalizado') {
        let d = desdePers && !isNaN(new Date(desdePers).getTime()) ? desdePers : hoyISO()
        let h = hastaPers && !isNaN(new Date(hastaPers).getTime()) ? hastaPers : d
        if (new Date(h) < new Date(d)) { const t = d; d = h; h = t } // corrige rango invertido
        const dur = Math.round((new Date(h) - new Date(d)) / 86400000) + 1
        const antHasta = sumarDias(d, -1)
        const antDesde = sumarDias(antHasta, -(dur - 1))
        return { desde: d, hasta: h, antDesde, antHasta }
      }
      return calcularRangos(periodo)
    } catch { return calcularRangos('semana') }
  }, [periodo, diaSeleccionado, desdePers, hastaPers])

  useEffect(() => { cargar() }, [rango]) // eslint-disable-line react-hooks/exhaustive-deps

  function normalizarMovCamara(m) {
    const tipoProd = m.tipo_producto || 'helado'
    const esImpCam = tipoProd === 'impulsivo'
    return {
      producto_nombre: (m.sabor_nombre || m.producto_nombre || '').trim(),
      peso_kg: esImpCam ? (m.baldes || 0) : (m.kg || 0),
      categoria: tipoProd,
      tipo_producto: tipoProd,   // campo explícito para clasificarRegistro
      producto_codigo: null,
      operario_nombre: m.operario_nombre || null,
      origen: esImpCam ? 'manual' : 'escaneo',
      fecha: m.fecha || (m.created_at || '').split('T')[0],
    }
  }

  async function cargar() {
    setLoading(true)
    const { desde, hasta, antDesde, antHasta } = rango
    const [
      { data: prodAct }, { data: prodAnt },
      { data: merAct }, { data: merAnt },
      { data: pp }, { data: sab }, { data: imp }, { data: ins }, { data: cam },
      { data: movCamAct }, { data: movCamAnt },
      { data: bas }, { data: basIng }, { data: sabIng }, { data: impIng },
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
      // Ingresos de cámara que SON producción (motivo 'Producción'): capturan la
      // producción cargada directo en Cámaras. Los gemelos de `producciones` se
      // sacan luego con movimientosSinGemelo. Se excluyen Ajuste/Transferencia/
      // Devolución: son movimientos de inventario, no producción.
      supabase.from('movimientos_camara').select('*').eq('tipo', 'ingreso').eq('motivo', 'Producción')
        .gte('created_at', desde + 'T00:00:00').lte('created_at', hasta + 'T23:59:59'),
      supabase.from('movimientos_camara').select('*').eq('tipo', 'ingreso').eq('motivo', 'Producción')
        .gte('created_at', antDesde + 'T00:00:00').lte('created_at', antHasta + 'T23:59:59'),
      supabase.from('bases').select('id,nombre,litros_batch,mano_de_obra'),
      supabase.from('base_ingredientes').select('base_id,insumo_nombre,cantidad,unidad'),
      supabase.from('sabor_ingredientes').select('sabor_id,insumo_nombre,cantidad,unidad'),
      supabase.from('impulsivo_ingredientes').select('impulsivo_id,insumo_nombre,cantidad,unidad'),
    ])
    // Evitar DOBLE CONTEO: el módulo Producción escribe cada elaboración en DOS
    // tablas — `producciones` (con lote) y `movimientos_camara` (motivo 'Producción',
    // sin lote) — que son la misma cosa. Sumar las dos repetía cada producción.
    // movimientosSinGemelo quita los movimientos que ya están en producciones y
    // conserva los ingresos cargados DIRECTO desde Cámaras.
    setProduccionesActual([...(prodAct || []), ...movimientosSinGemelo(prodAct, movCamAct).map(normalizarMovCamara)])
    setProduccionesAnterior([...(prodAnt || []), ...movimientosSinGemelo(prodAnt, movCamAnt).map(normalizarMovCamara)])
    setMermasActual(merAct || [])
    setMermasAnterior(merAnt || [])
    setCategoriaPorCodigo(Object.fromEntries((pp || []).map(p => [p.codigo, p.categoria || 'OTRO'])))
    setSabores(sab || [])
    setImpulsivos(imp || [])
    setInsumos(ins || [])
    setStockCamaras(cam || [])
    setBases(bas || [])
    setBaseIngredientes(basIng || [])
    setSaborIngredientes(sabIng || [])
    setImpulsivoIngredientes(impIng || [])

    // Consumo de bases (vínculos manuales base→producto). La tabla puede no
    // existir todavía si no se corrió el SQL: en ese caso queda vacío, sin romper.
    const cb = await supabase.from('consumos_base').select('*').gte('fecha', desde).lte('fecha', hasta)
    setConsumosBase(cb.error ? [] : (cb.data || []))

    setLoading(false)
  }

  // ── A) Informe de Producción ─────────────────────────────────────────────

  // Clasificación robusta: helado | impulsivo | postre
  // Busca por nombre en sabores, impulsivos y stock_camaras (tipo_producto).
  const clasificarRegistro = useMemo(() => {
    const saboresSet = new Set(sabores.map(s => normalizarNombre(s.nombre)))
    const impulsivosSet = new Set(impulsivos.map(i => normalizarNombre(i.nombre)))
    const camMap = {}
    stockCamaras.forEach(c => { camMap[normalizarNombre(c.nombre)] = c.tipo_producto })
    return (r) => {
      const nombre = (r.producto_nombre || '').trim().toLowerCase() // para heurísticas de texto
      const nombreN = normalizarNombre(r.producto_nombre || '')      // para matchear tablas
      const cat = (r.categoria || categoriaPorCodigo[r.producto_codigo] || '').toLowerCase()

      // 1. Campo tipo_producto explícito (movimientos_camara normalizados)
      if (r.tipo_producto === 'impulsivo') return 'impulsivo'
      if (r.tipo_producto === 'postre')    return 'postre'
      if (r.tipo_producto === 'helado')    return 'helado'

      // 2. Bases primero
      if (cat === 'base' || cat.includes('base') || nombre.startsWith('base ') || nombre === 'base') return 'base'
      const tipoCam = camMap[nombreN]
      if (tipoCam === 'base') return 'base'

      // 3. Categoria explícita del registro
      if (cat === 'helado')    return 'helado'
      if (cat === 'impulsivo' || cat.includes('impulsiv')) return 'impulsivo'
      if (cat === 'postre'    || cat.includes('postre'))   return 'postre'

      // 4. Búsqueda por nombre en tablas de referencia
      if (saboresSet.has(nombreN))    return 'helado'
      if (impulsivosSet.has(nombreN)) return 'impulsivo'

      // 5. tipo_producto en stock_camaras
      if (tipoCam === 'impulsivo') return 'impulsivo'
      if (tipoCam === 'postre')    return 'postre'
      if (tipoCam === 'helado')    return 'helado'

      return 'helado'
    }
  }, [sabores, impulsivos, stockCamaras, categoriaPorCodigo])

  const produccionInforme = useMemo(() => {
    function analizar(lista) {
      const filtrada = lista.filter(r =>
        !NOMBRES_EXCLUIDOS.has((r.producto_nombre || '').trim().toLowerCase())
      )
      let kgBases = 0, regBases = 0
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
          kgBases: 0, regBases: 0,
          kgSabores: 0, regSabores: 0,
          unidImpulsivos: 0,
          kgPostres: 0, regPostres: 0,
        }
        porProducto[nombre].registros++
        porOperario[op].registros++

        if (tipo === 'base') {
          kgBases += r.peso_kg || 0; regBases++
          porProducto[nombre].kg += r.peso_kg || 0
          porOperario[op].kgBases += r.peso_kg || 0; porOperario[op].regBases++
        } else if (tipo === 'helado') {
          kgHelados += r.peso_kg || 0; regHelados++
          porProducto[nombre].kg += r.peso_kg || 0
          porOperario[op].kgSabores += r.peso_kg || 0; porOperario[op].regSabores++
        } else if (tipo === 'impulsivo') {
          const u = unidadesDe(r)
          unidadesImpulsivos += u
          porProducto[nombre].unidades += u
          porOperario[op].unidImpulsivos += u
        } else {
          // Postres: se venden por PESO (kg), igual que los sabores. Nunca por
          // unidad. Solo acumulamos kg; `regPostres` cuenta cuántos se registraron.
          kgPostres += r.peso_kg || 0; regPostres++
          porProducto[nombre].kg += r.peso_kg || 0
          porOperario[op].kgPostres += r.peso_kg || 0; porOperario[op].regPostres++
        }
      })

      const promedioBases   = regBases > 0 ? kgBases / regBases : 0
      const baldesHelados   = regHelados
      const promedioKgHelados = regHelados > 0 ? kgHelados / regHelados : 0
      const promedioKgPostres = regPostres > 0 ? kgPostres / regPostres : 0

      return {
        kgBases, regBases, promedioBases,
        kgHelados, regHelados, baldesHelados, promedioKgHelados,
        unidadesImpulsivos,
        kgPostres, regPostres, promedioKgPostres,
        unidadesTotal: unidadesImpulsivos,
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
      bases: prods
        .filter(p => p.tipo === 'base')
        .map(p => ({ ...p, promedio: p.registros > 0 ? p.kg / p.registros : 0 }))
        .sort((a, b) => b.kg - a.kg),
      sabores: prods
        .filter(p => p.tipo === 'helado')
        .map(p => ({ ...p, baldes: p.registros, promedio: p.registros > 0 ? p.kg / p.registros : 0 }))
        .sort((a, b) => b.kg - a.kg),
      impulsivos: prods
        .filter(p => p.tipo === 'impulsivo')
        .sort((a, b) => b.unidades - a.unidades),
      postres: prods
        .filter(p => p.tipo === 'postre')
        .map(p => ({ ...p, promedio: p.registros > 0 ? p.kg / p.registros : 0 }))
        .sort((a, b) => b.kg - a.kg),
    }
  }, [produccionInforme])

  const chartProduccion = useMemo(() => (
    produccionInforme.actual.porProducto
      .filter(p => p.tipo === 'helado' && p.kg > 0)
      .map(p => ({ nombre: p.nombre, kg: Number(p.kg.toFixed(1)) }))
      .sort((a, b) => b.kg - a.kg)
      .slice(0, 8)
  ), [produccionInforme])

  // Consumo de bases / materia prima del período (de los vínculos base→producto).
  const consumoInforme = useMemo(() => {
    const porBase = {}
    consumosBase.forEach(c => {
      const k = c.base_nombre || '—'
      if (!porBase[k]) porBase[k] = { base: k, kg: 0, registros: 0, productos: new Set() }
      porBase[k].kg += Number(c.kg_consumidos) || 0
      porBase[k].registros++
      if (c.producto_nombre) porBase[k].productos.add(c.producto_nombre)
    })
    const filas = Object.values(porBase)
      .map(b => ({ base: b.base, kg: b.kg, registros: b.registros, productos: b.productos.size }))
      .sort((a, b) => b.kg - a.kg)
    return { filas, totalKg: filas.reduce((a, b) => a + b.kg, 0) }
  }, [consumosBase])

  // ── B) Informe de Mermas ──────────────────────────────────────────────────
  const costoKgPorProducto = useMemo(() => {
    const m = {}
    stockCamaras.forEach(s => {
      const costo = s.costo_kg ?? TIPO_PRECIOS[s.tipo]?.costo_kg ?? 0
      m[normalizarNombre(s.nombre)] = costo
    })
    return m
  }, [stockCamaras])

  function costoMerma(m) {
    const costoKg = costoKgPorProducto[normalizarNombre(m.sabor_nombre || '')] || 0
    return (m.diferencia || 0) * costoKg
  }

  const mermasInforme = useMemo(() => {
    // Clasificación por tipo, no por texto de causa:
    //  - RENDIMIENTO: hubo producción real (kg_reales > 0). El % (faltante/teórico)
    //    es una TASA con sentido → se puede colorear por %.
    //  - PÉRDIDA directa: faltante de conteo / merma-baja de cámara (kg_reales = 0).
    //    No tiene tasa (sería 100% siempre) → se mide en cantidad y $, sin %.
    function analizar(lista) {
      const mermas = lista.filter(m => (m.diferencia || 0) > 0)
      const rendimiento = mermas.filter(m => (m.kg_reales || 0) > 0)
      const perdidas    = mermas.filter(m => (m.kg_reales || 0) <= 0)

      // Rendimiento (tasa %)
      const totalDifR = rendimiento.reduce((a, m) => a + m.diferencia, 0)
      const totalTeoR = rendimiento.reduce((a, m) => a + (m.kg_teoricos || 0), 0)
      const pctGlobal = totalTeoR > 0 ? (totalDifR / totalTeoR) * 100 : 0
      const costoR    = rendimiento.reduce((a, m) => a + costoMerma(m), 0)
      const agrup = (arr, key) => {
        const g = {}
        arr.forEach(m => { const k = m[key] || (key === 'operario_nombre' ? 'Sin asignar' : 'Sin especificar')
          if (!g[k]) g[k] = { nombre: k, dif: 0, teo: 0 }; g[k].dif += m.diferencia; g[k].teo += m.kg_teoricos || 0 })
        return Object.values(g).map(x => ({ ...x, pct: x.teo > 0 ? (x.dif / x.teo) * 100 : 0 }))
      }

      // Pérdidas directas (cantidad + $, por causa)
      const costoP = perdidas.reduce((a, m) => a + costoMerma(m), 0)
      const porCausa = {}
      perdidas.forEach(m => { const c = m.causa || 'Sin especificar'
        if (!porCausa[c]) porCausa[c] = { causa: c, dif: 0, costo: 0, cnt: 0 }
        porCausa[c].dif += m.diferencia; porCausa[c].costo += costoMerma(m); porCausa[c].cnt++ })

      const perdidasKgTot = perdidas.reduce((a, m) => a + m.diferencia, 0)
      return {
        // "Kg merma total" = pérdida física total (rendimiento + pérdidas directas)
        totalDif: totalDifR + perdidasKgTot, totalTeo: totalTeoR, pctGlobal, costoRend: costoR,
        porProducto: agrup(rendimiento, 'sabor_nombre').filter(p => p.dif > 0).sort((a, b) => b.dif - a.dif),
        porOperario: agrup(rendimiento, 'operario_nombre').filter(o => o.dif > 0).sort((a, b) => b.pct - a.pct),
        // pérdidas
        perdidasKg: perdidas.reduce((a, m) => a + m.diferencia, 0), costoPerdidas: costoP,
        porCausa: Object.values(porCausa).sort((a, b) => b.costo - a.costo),
        // total valorizado (para KPI)
        costoTotal: costoR + costoP,
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

  // Valuación de cámara con el COSTO FINAL de Finanzas (mismo criterio que el
  // módulo Cámaras). Helado/postre por kg; impulsivo por unidad. Respaldo: TIPO_PRECIOS.
  const valorCamaras = useMemo(() => {
    const cf = {}
    sabores.forEach(s => { cf[normalizarNombre(s.nombre)] = Number(s.costo_final) || 0 })
    impulsivos.forEach(i => { cf[normalizarNombre(i.nombre)] = Number(i.costo_final) || 0 })
    return stockCamaras.reduce((a, c) => {
      const costo = cf[normalizarNombre(c.nombre)] || 0
      const esUnid = c.tipo_producto === 'impulsivo'
      if (costo > 0) return a + (esUnid ? (c.baldes || 0) : (c.kg || 0)) * costo
      const costoKg = c.costo_kg ?? TIPO_PRECIOS[c.tipo]?.costo_kg ?? 0 // respaldo
      return a + (c.kg || 0) * costoKg
    }, 0)
  }, [stockCamaras, sabores, impulsivos])

  // Tipo de precio de sabor (Lisa/Con Agregado/Agua/Especial + Pistacho/Rocher)
  const tipoSaborMap = useMemo(() => {
    const m = {}; stockCamaras.forEach(c => { if (c.tipo) m[(c.nombre || '').toUpperCase()] = c.tipo }); return m
  }, [stockCamaras])
  const tipoProductoMap = useMemo(() => {
    const m = {}; stockCamaras.forEach(c => { m[(c.nombre || '').toUpperCase()] = c.tipo_producto }); return m
  }, [stockCamaras])
  const tierDeSabor = (nombre) => {
    const n = (nombre || '').toLowerCase()
    if (n.includes('pistacho')) return 'Pistacho'
    if (n.includes('rocher')) return 'Rocher'
    return tipoSaborMap[(nombre || '').toUpperCase()] || '—'
  }

  // Costo UNITARIO real (misma fuente que Finanzas → los márgenes coinciden)
  const costoUnitario = useMemo(() => crearCostoUnitario({
    insumos, bases, baseIngredientes, sabores, saborIngredientes,
    impulsivos, impulsivoIngredientes, tiposMap: tipoProductoMap,
  }), [insumos, bases, baseIngredientes, sabores, saborIngredientes, impulsivos, impulsivoIngredientes, tipoProductoMap])

  const productosFinancieros = useMemo(() => {
    const vistos = new Set()
    const filas = []
    const push = (nombre, precio, tipoGrupo, subtipo, costoFinal) => {
      const clave = `${tipoGrupo}::${normalizarNombre(nombre)}`
      if (vistos.has(clave)) return // evita duplicados (ej. Pomelo Rosado 2 veces)
      vistos.add(clave)
      // Preferimos el COSTO FINAL que guarda Finanzas (MP+MO+CIF). Respaldo: cálculo en vivo.
      const costo = Number(costoFinal) > 0 ? Number(costoFinal) : costoUnitario.costoUnitDe(nombre)
      const pv = Number(precio) || 0
      filas.push({
        key: clave, nombre, tipo: tipoGrupo, subtipo,
        costo_unit: costo, precio_venta: pv,
        ganancia: pv - costo, margen: margenPct(costo, pv),
      })
    }
    sabores.forEach(s => push(s.nombre, s.precio_venta, 'Helado', tierDeSabor(s.nombre), s.costo_final))
    impulsivos.forEach(i => {
      const esPostre = (tipoProductoMap[(i.nombre || '').toUpperCase()]) === 'postre'
      push(i.nombre, i.precio_venta, esPostre ? 'Postre' : 'Impulsivo', esPostre ? 'Postre' : 'Impulsivo', i.costo_final)
    })
    return filas
  }, [sabores, impulsivos, costoUnitario, tipoProductoMap]) // eslint-disable-line react-hooks/exhaustive-deps

  // Más rentables: solo productos con precio Y costo cargados (evita "100%" falso de un costo $0)
  const masRentables = useMemo(() => (
    [...productosFinancieros].filter(p => p.precio_venta > 0 && p.costo_unit > 0).sort((a, b) => b.margen - a.margen).slice(0, 5)
  ), [productosFinancieros])

  const margenPromedio = useMemo(() => {
    // Solo productos con precio y costo reales (un costo $0 daría 100% falso)
    const conDatos = productosFinancieros.filter(p => p.precio_venta > 0 && p.costo_unit > 0)
    if (conDatos.length === 0) return 0
    return conDatos.reduce((a, p) => a + p.margen, 0) / conDatos.length
  }, [productosFinancieros])

  const costoProduccionPeriodo = useMemo(() => {
    // Helado y POSTRE: kg producidos × costo/kg (los postres se costean por peso;
    // las unidades son solo control de stock). Impulsivo: unidades × costo/unidad.
    const impCostoUnit = {}; impulsivos.forEach(i => { impCostoUnit[normalizarNombre(i.nombre)] = Number(i.costo_total) || 0 })
    return produccionesActual.reduce((acc, r) => {
      const tipo = clasificarRegistro(r)
      const nombre = r.producto_nombre || ''
      if (tipo === 'impulsivo') return acc + unidadesDe(r) * (impCostoUnit[normalizarNombre(nombre)] || 0)
      return acc + (r.peso_kg || 0) * costoUnitario.costoUnitDe(nombre)
    }, 0)
  }, [produccionesActual, impulsivos, costoUnitario, clasificarRegistro])

  // ── Exportación PDF ───────────────────────────────────────────────────────
  function periodoLabel() {
    if (periodo === 'dia') return `Día ${fmtFecha(diaSeleccionado)}`
    if (periodo === 'personalizado') return 'Personalizado'
    return PERIODOS.find(p => p.key === periodo)?.label || ''
  }

  async function exportarPDF() {
    setExportando(true)
    try {
      const doc  = new jsPDF({ unit: 'mm', format: 'a4' })
      const pw   = doc.internal.pageSize.getWidth()
      const ph   = doc.internal.pageSize.getHeight()
      const hoy  = new Date().toLocaleString('es-AR')
      const MOD  = 'INFORMES'
      const TIT  = `INFORME DE ${tab.toUpperCase()}`
      const peri = `${fmtFecha(rango.desde)} – ${fmtFecha(rango.hasta)} (${periodoLabel()})  ·  vs. anterior: ${fmtFecha(rango.antDesde)} – ${fmtFecha(rango.antHasta)}`
      const EST  = getEstiloInforme()

      // Color semántico (solo en datos)
      const semMargen = m => m < 0 ? PDF_SEM_NEG : m < 20 ? PDF_SEM_CRIT : m < 40 ? PDF_SEM_LOW : m <= 50 ? PDF_SEM_OK : PDF_SEM_EXC
      const semMerma  = p => p < 3 ? PDF_SEM_OK : p < 8 ? PDF_SEM_CRIT : PDF_SEM_NEG

      // Fila de KPI cards (estilo unificado). Devuelve el nuevo Y.
      const kpiRow = (items, yTop) => {
        const gap = 4, n = items.length, cw = (pw - 28 - gap * (n - 1)) / n, ch = 22
        items.forEach((it, i) => dibujarKpiCard(doc, 14 + i * (cw + gap), yTop, cw, ch, it[0], it[1], it[2] || PDF_NEGRO))
        return yTop + ch + 8
      }

      // Helper reutilizable para header+footer en didDrawPage
      const didDP = () => {
        dibujarEncabezado(doc, pw, MOD, TIT, hoy)
        dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
      }

      // Guard: si y está cerca del pie, agregar página nueva
      const saltarSiNecesario = (y) => {
        if (y > ph - 45) { doc.addPage(); didDP(); return PDF_CONTENT_Y }
        return y
      }

      // P1 — Portada
      dibujarPortada(doc, pw, ph, MOD, TIT, peri, hoy)

      // P2 — Contenido
      doc.addPage()
      dibujarEncabezado(doc, pw, MOD, TIT, hoy)
      dibujarPie(doc, pw, ph, 2)
      let y = PDF_CONTENT_Y

      // ── TAB: PRODUCCIÓN ────────────────────────────────────────────────────
      if (tab === 'Producción') {
        const { actual, anterior } = produccionInforme
        y = kpiRow([
          ['KG helados',       `${fmtNum(actual.kgHelados)} kg`,             PDF_SEM_OK],
          ['Unid. impulsivos', `${fmtNum(actual.unidadesImpulsivos, 0)} u`,  PDF_SEM_LOW],
          ['Operarios activos', String(actual.porOperario.length),           PDF_NEGRO],
        ], y)

        // Gráfico NATIVO de barras (reemplaza las capturas de pantalla)
        const barras = (titulo, rows, color) => {
          if (!rows.length) return
          y = saltarSiNecesario(y)
          y = dibujarSeccion(doc, pw, titulo, y)
          const maxV = Math.max(...rows.map(r => r.v), 1)
          const bx = 62, bw = pw - 14 - bx - 34
          rows.forEach((r, i) => {
            const by = y + i * 8
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...PDF_NEGRO)
            doc.text(r.nombre.length > 26 ? r.nombre.slice(0, 25) + '…' : r.nombre, 14, by + 3.5)
            doc.setFillColor(230, 230, 230); doc.roundedRect(bx, by, bw, 4.5, 0.8, 0.8, 'F')
            doc.setFillColor(...color); doc.roundedRect(bx, by, Math.max(1, bw * (r.v / maxV)), 4.5, 0.8, 0.8, 'F')
            doc.setTextColor(...PDF_NEGRO); doc.text(r.txt, bx + bw + 2, by + 3.5)
          })
          y += rows.length * 8 + 8
        }
        // Por peso (kg): bases, helados y postres. Por unidad: solo impulsivos.
        const topProd = [...actual.porProducto].filter(p => p.tipo !== 'base')
          .map(p => { const peso = p.tipo !== 'impulsivo'; return { nombre: p.nombre, v: peso ? p.kg : p.unidades, txt: `${fmtNum(peso ? p.kg : p.unidades, peso ? 1 : 0)} ${peso ? 'kg' : 'u'}` } })
          .sort((a, b) => b.v - a.v).slice(0, 8)
        barras('Top productos — cantidad producida', topProd, [255, 71, 19])
        // Kg totales del operario = bases + sabores + postres (todos van en kg).
        // Antes usaba solo kgSabores, por eso un operario que hizo solo postres
        // aparecía en 0 kg aunque la tabla de abajo sí lo contaba.
        const topOps = [...actual.porOperario]
          .map(o => { const kgTot = (o.kgBases || 0) + (o.kgSabores || 0) + (o.kgPostres || 0); return { nombre: o.nombre, v: kgTot, txt: `${fmtNum(kgTot, 1)} kg` } })
          .sort((a, b) => b.v - a.v).slice(0, 8)
        barras('Producción por operario — kg', topOps, [59, 130, 246])

        y = saltarSiNecesario(y)
        y = dibujarSeccion(doc, pw, 'Resumen general', y)
        autoTable(doc, {
          ...EST, startY: y,
          head: [['INDICADOR', 'PERÍODO ACTUAL', 'PERÍODO ANTERIOR', 'VARIACIÓN']],
          body: [
            ['Total KG (helados)',        `${fmtNum(actual.kgHelados)} kg`,            `${fmtNum(anterior.kgHelados)} kg`,            fmtVar(variacionPct(actual.kgHelados, anterior.kgHelados))],
            ['Unidades (impulsivos)',      `${fmtNum(actual.unidadesImpulsivos, 0)} u`, `${fmtNum(anterior.unidadesImpulsivos, 0)} u`, fmtVar(variacionPct(actual.unidadesImpulsivos, anterior.unidadesImpulsivos))],
            ['Total KG (postres)',         `${fmtNum(actual.kgPostres, 1)} kg`,         `${fmtNum(anterior.kgPostres, 1)} kg`,         fmtVar(variacionPct(actual.kgPostres, anterior.kgPostres))],
            ['Operarios activos',          String(actual.porOperario.length),            String(anterior.porOperario.length),            '—'],
          ],
          didDrawPage: didDP,
        })
        y = saltarSiNecesario(doc.lastAutoTable.finalY + 6)

        y = dibujarSeccion(doc, pw, 'Producción por producto', y)
        const anteriorMapProd = {}
        anterior.porProducto.forEach(p => { anteriorMapProd[p.nombre] = p.tipo !== 'impulsivo' ? p.kg : p.unidades })
        const productosComp = actual.porProducto
          .filter(p => p.tipo !== 'base')
          .map(p => {
            const va = p.tipo !== 'impulsivo' ? p.kg : p.unidades
            const vb = anteriorMapProd[p.nombre] || 0
            return { nombre: p.nombre, tipo: p.tipo, va, vb, var: variacionPct(va, vb) }
          })
          .sort((a, b) => b.va - a.va)
        autoTable(doc, {
          ...EST, startY: y,
          head: [['PRODUCTO', 'CANTIDAD', 'PERÍODO ANTERIOR', 'VARIACIÓN']],
          body: productosComp.map(p => {
            const peso = p.tipo !== 'impulsivo'
            const u = peso ? 'kg' : 'u'
            const dec = peso ? 1 : 0
            return [p.nombre, `${fmtNum(p.va, dec)} ${u}`, `${fmtNum(p.vb, dec)} ${u}`, fmtVar(p.var)]
          }),
          didDrawPage: didDP,
        })
        y = saltarSiNecesario(doc.lastAutoTable.finalY + 6)

        y = dibujarSeccion(doc, pw, 'Producción por operario', y)
        autoTable(doc, {
          ...EST, startY: y,
          head: [['OPERARIO', 'KG PRODUCIDOS', 'UNIDADES', 'REGISTROS']],
          // Cada producto en UNA sola columna según cómo se mide:
          // KG = lo que va por peso (bases + sabores + postres) · UNIDADES = lo que
          // va por unidad (solo impulsivos). Sin doble conteo.
          body: actual.porOperario.map(o => {
            const kgTot = (o.kgBases || 0) + (o.kgSabores || 0) + (o.kgPostres || 0)
            const unidTot = (o.unidImpulsivos || 0)
            return [o.nombre, `${fmtNum(kgTot)} kg`, `${fmtNum(unidTot, 0)} u`, String(o.registros)]
          }),
          didDrawPage: didDP,
        })

        // Consumo de bases / materia prima (de los vínculos base→producto en Órdenes).
        if (consumoInforme.filas.length) {
          y = saltarSiNecesario(doc.lastAutoTable.finalY + 6)
          y = dibujarSeccion(doc, pw, 'Consumo de bases / materia prima', y)
          autoTable(doc, {
            ...EST, startY: y,
            head: [['BASE', 'KG CONSUMIDOS', 'PRODUCTOS', 'VÍNCULOS']],
            body: [
              ...consumoInforme.filas.map(b => [b.base, `${fmtNum(b.kg, 1)} kg`, String(b.productos), String(b.registros)]),
              ['TOTAL', `${fmtNum(consumoInforme.totalKg, 1)} kg`, '', ''],
            ],
            didDrawPage: didDP,
          })
        }
      }

      // ── TAB: MERMAS ────────────────────────────────────────────────────────
      if (tab === 'Mermas') {
        const { actual, anterior } = mermasInforme
        y = kpiRow([
          ['Kg merma total',    `${fmtNum(actual.totalDif)} kg`,    PDF_SEM_NEG],
          ['% merma global',    `${fmtNum(actual.pctGlobal)}%`,     semMerma(actual.pctGlobal)],
          ['Costo total merma', `$${pesos(actual.costoTotal)}`,     PDF_SEM_NEG],
        ], y)

        y = dibujarSeccion(doc, pw, 'Resumen general', y)
        autoTable(doc, {
          ...EST, startY: y,
          head: [['INDICADOR', 'PERÍODO ACTUAL', 'PERÍODO ANTERIOR', 'VARIACIÓN']],
          body: [
            ['Kg merma total',   `${fmtNum(actual.totalDif)} kg`,  `${fmtNum(anterior.totalDif)} kg`,  fmtVar(variacionPct(actual.totalDif, anterior.totalDif))],
            ['% merma global',   `${fmtNum(actual.pctGlobal)}%`,   `${fmtNum(anterior.pctGlobal)}%`,   fmtVar(variacionPct(actual.pctGlobal, anterior.pctGlobal))],
            ['Costo total merma',`$${pesos(actual.costoTotal)}`,    `$${pesos(anterior.costoTotal)}`,   fmtVar(variacionPct(actual.costoTotal, anterior.costoTotal))],
          ],
          didDrawPage: didDP,
        })
        y = saltarSiNecesario(doc.lastAutoTable.finalY + 6)

        y = dibujarSeccion(doc, pw, 'Merma por producto', y)
        autoTable(doc, {
          ...EST, startY: y,
          head: [['PRODUCTO', 'KG MERMA', '% MERMA']],
          body: actual.porProducto.map(p => [p.nombre, `${fmtNum(p.dif)} kg`, `${fmtNum(p.pct)}%`]),
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' } },
          didParseCell: d => {
            if (d.section === 'body' && d.column.index === 2) d.cell.styles.textColor = semMerma(actual.porProducto[d.row.index]?.pct ?? 0)
          },
          didDrawPage: didDP,
        })
        y = saltarSiNecesario(doc.lastAutoTable.finalY + 6)

        y = dibujarSeccion(doc, pw, '% de merma por operario', y)
        autoTable(doc, {
          ...EST, startY: y,
          head: [['OPERARIO', 'KG MERMA', '% MERMA']],
          body: actual.porOperario.map(o => [o.nombre, `${fmtNum(o.dif)} kg`, `${fmtNum(o.pct)}%`]),
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' } },
          didParseCell: d => {
            if (d.section === 'body' && d.column.index === 2) d.cell.styles.textColor = semMerma(actual.porOperario[d.row.index]?.pct ?? 0)
          },
          didDrawPage: didDP,
        })
        y = saltarSiNecesario(doc.lastAutoTable.finalY + 6)

        y = dibujarSeccion(doc, pw, 'Top causas de merma', y)
        autoTable(doc, {
          ...EST, startY: y,
          head: [['CAUSA', 'REGISTROS', 'KG MERMA', 'COSTO']],
          body: actual.porCausa.slice(0, 5).map(c => [c.causa, String(c.cnt), `${fmtNum(c.dif)} kg`, `$${pesos(c.costo)}`]),
          didDrawPage: didDP,
        })
      }

      // ── TAB: FINANCIERO ────────────────────────────────────────────────────
      if (tab === 'Financiero') {
        y = kpiRow([
          ['Stock depósito',  `$${pesos(valorDeposito)}`,                  PDF_NEGRO],
          ['Stock cámaras',   `$${pesos(valorCamaras)}`,                   PDF_NEGRO],
          ['Total stock',     `$${pesos(valorDeposito + valorCamaras)}`,   PDF_NEGRO],
          ['Margen promedio', `${fmtNum(margenPromedio)}%`,                semMargen(margenPromedio)],
        ], y)

        // Gráfico NATIVO: margen por producto (mejores) — barras coloreadas por nivel
        const priced = [...productosFinancieros].filter(p => p.precio_venta > 0 && p.costo_unit > 0).sort((a, b) => b.margen - a.margen)
        const topM = priced.slice(0, 10)
        if (topM.length) {
          y = dibujarSeccion(doc, pw, 'Margen por producto (mejores)', y)
          const maxV = Math.max(...topM.map(p => Math.max(p.margen, 0)), 1), bx = 64, bw = pw - 14 - bx - 26
          topM.forEach((p, i) => {
            const by = y + i * 7.5
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...PDF_NEGRO)
            doc.text((p.nombre || '').length > 26 ? p.nombre.slice(0, 25) + '…' : (p.nombre || ''), 14, by + 3.3)
            doc.setFillColor(232, 232, 232); doc.roundedRect(bx, by, bw, 4, 0.7, 0.7, 'F')
            doc.setFillColor(...semMargen(p.margen)); doc.roundedRect(bx, by, Math.max(1, bw * (Math.max(p.margen, 0) / maxV)), 4, 0.7, 0.7, 'F')
            doc.setTextColor(...PDF_NEGRO); doc.text(`${fmtNum(p.margen)}%`, bx + bw + 2, by + 3.3)
          })
          y += topM.length * 7.5 + 8
        }
        y = saltarSiNecesario(y)

        y = dibujarSeccion(doc, pw, 'Indicadores generales', y)
        autoTable(doc, {
          ...EST, startY: y,
          head: [['INDICADOR', 'VALOR']],
          body: [
            ['Valor stock depósito',           `$${pesos(valorDeposito)}`],
            ['Valor stock cámaras',            `$${pesos(valorCamaras)}`],
            ['Valor total de stock',           `$${pesos(valorDeposito + valorCamaras)}`],
            ['Costo de producción del período',`$${pesos(costoProduccionPeriodo)}`],
            ['Margen estimado promedio',        `${fmtNum(margenPromedio)}%`],
          ],
          columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
          didDrawPage: didDP,
        })
        y = saltarSiNecesario(doc.lastAutoTable.finalY + 6)

        y = dibujarSeccion(doc, pw, 'Productos más rentables', y)
        autoTable(doc, {
          ...EST, startY: y,
          head: [['PRODUCTO', 'TIPO', 'COSTO', 'PRECIO VENTA', 'GANANCIA', 'MARGEN %']],
          body: masRentables.map(p => [p.nombre, p.tipo === 'Helado' ? `Helado · ${p.subtipo}` : p.tipo, `$${pesos(p.costo_unit)}`, `$${pesos(p.precio_venta)}`, `$${pesos(p.ganancia)}`, `${fmtNum(p.margen)}%`]),
          columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } },
          didParseCell: d => {
            if (d.section === 'body' && d.column.index === 5) d.cell.styles.textColor = semMargen(masRentables[d.row.index]?.margen ?? 0)
          },
          didDrawPage: didDP,
        })
        y = saltarSiNecesario(doc.lastAutoTable.finalY + 6)

        // Productos MENOS rentables (los que hay que revisar)
        const menosRent = priced.slice(-5).reverse().filter(p => !masRentables.includes(p))
        if (menosRent.length) {
          y = dibujarSeccion(doc, pw, 'Productos menos rentables (a revisar)', y)
          autoTable(doc, {
            ...EST, startY: y,
            head: [['PRODUCTO', 'TIPO', 'COSTO', 'PRECIO VENTA', 'GANANCIA', 'MARGEN %']],
            body: menosRent.map(p => [p.nombre, p.tipo === 'Helado' ? `Helado · ${p.subtipo}` : p.tipo, `$${pesos(p.costo_unit)}`, `$${pesos(p.precio_venta)}`, `$${pesos(p.ganancia)}`, `${fmtNum(p.margen)}%`]),
            columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } },
            didParseCell: d => {
              if (d.section === 'body' && d.column.index === 5) d.cell.styles.textColor = semMargen(menosRent[d.row.index]?.margen ?? 0)
            },
            didDrawPage: didDP,
          })
        }
      }

      // Firmas (al final del contenido; salta de hoja solo si no entran)
      dibujarFirmas(doc, pw, ph, doc.lastAutoTable?.finalY, MOD, hoy, ['Dirección', 'Responsable de Producción', 'Control de Calidad'])

      doc.save(`informe_${tab.toLowerCase()}_${hoyISO()}.pdf`)
    } catch (err) {
      console.error('Error generando PDF:', err)
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Informes"
        subtitle="Informe ejecutivo para dirección"
        actions={
          <Button variant="primary" onClick={exportarPDF} loading={exportando} disabled={loading}>
            <FileDown size={15} /> Exportar PDF
          </Button>
        }
      />

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
          <button onClick={() => setPeriodo('personalizado')}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border"
            style={{
              backgroundColor: periodo === 'personalizado' ? colors.brand : 'transparent',
              borderColor: periodo === 'personalizado' ? colors.brand : colors.border,
              color: periodo === 'personalizado' ? 'white' : colors.textSecondary,
            }}>
            Personalizado
          </button>
          {periodo === 'dia' && (
            <input
              type="date"
              value={diaSeleccionado}
              onChange={e => setDiaSeleccionado(e.target.value)}
              className="rounded-lg border text-xs px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-[#FF4713]/25 focus:border-[#FF4713]"
              style={{ borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bg }}
            />
          )}
          {periodo === 'personalizado' && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs" style={{ color: colors.textMuted }}>Desde</span>
              <input
                type="date"
                value={desdePers}
                max={hastaPers || undefined}
                onChange={e => setDesdePers(e.target.value)}
                className="rounded-lg border text-xs px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-[#FF4713]/25 focus:border-[#FF4713]"
                style={{ borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bg }}
              />
              <span className="text-xs" style={{ color: colors.textMuted }}>Hasta</span>
              <input
                type="date"
                value={hastaPers}
                min={desdePers || undefined}
                onChange={e => setHastaPers(e.target.value)}
                className="rounded-lg border text-xs px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-[#FF4713]/25 focus:border-[#FF4713]"
                style={{ borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.bg }}
              />
            </div>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard label="KG Bases" value={`${fmtNum(produccionInforme.actual.kgBases, 1)} kg`} icon={Scale} color="#78716c"
                sub={<VariacionTag pct={variacionPct(produccionInforme.actual.kgBases, produccionInforme.anterior.kgBases)} />} />
              <KpiCard label="KG Helados" value={`${fmtNum(produccionInforme.actual.kgHelados)} kg`} icon={Scale} color={colors.brand}
                sub={<VariacionTag pct={variacionPct(produccionInforme.actual.kgHelados, produccionInforme.anterior.kgHelados)} />} />
              <KpiCard label="Baldes Helados" value={`${produccionInforme.actual.baldesHelados} bal.`} icon={Scale} color={colors.info}
                sub={`≈ ${fmtNum(produccionInforme.actual.promedioKgHelados, 2)} kg/reg`} />
              <KpiCard label="Unidades Impulsivos" value={`${fmtNum(produccionInforme.actual.unidadesImpulsivos, 0)} u`} icon={Package} color={colors.warning}
                sub={<VariacionTag pct={variacionPct(produccionInforme.actual.unidadesImpulsivos, produccionInforme.anterior.unidadesImpulsivos)} />} />
              <KpiCard label="KG Postres" value={`${fmtNum(produccionInforme.actual.kgPostres, 1)} kg`} icon={Scale} color="#7c3aed"
                sub={<VariacionTag pct={variacionPct(produccionInforme.actual.kgPostres, produccionInforme.anterior.kgPostres)} />} />
              <KpiCard label="Postres registrados" value={`${fmtNum(produccionInforme.actual.regPostres, 0)}`} icon={Package} color={colors.postres}
                sub={`≈ ${fmtNum(produccionInforme.actual.promedioKgPostres, 2)} kg/reg`} />
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

                {/* Sección Bases */}
                {prodTableData.bases.length > 0 && (
                  <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                    <div className="px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#78716c' }}>🧱 Bases</span>
                      <span className="text-xs ml-auto" style={{ color: colors.textMuted }}>{fmtNum(produccionInforme.actual.kgBases, 1)} kg · {produccionInforme.actual.regBases} registros</span>
                    </div>
                    <Table className="min-w-[500px]">
                      <Thead><Tr><Th>Base</Th><Th className="text-right">Registros</Th><Th className="text-right">KG Total</Th><Th className="text-right">Prom kg/reg</Th></Tr></Thead>
                      <Tbody>
                        {prodTableData.bases.map(p => (
                          <Tr key={p.nombre} style={{ cursor: 'pointer' }}
                            onClick={() => setModalDetalle({ nombre: p.nombre, tipo: 'helado', registros: produccionesActual.filter(r => (r.producto_nombre || '') === p.nombre).sort((a, b) => { const da = new Date(a.created_at || a.fecha || 0); const db = new Date(b.created_at || b.fecha || 0); return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da) }) })}>
                            <Td className="font-medium" style={{ color: '#78716c' }}>{p.nombre}</Td>
                            <Td className="text-right" style={{ color: colors.textMuted }}>{p.registros}</Td>
                            <Td className="text-right font-bold" style={{ color: '#78716c' }}>{fmtNum(p.kg, 1)} kg</Td>
                            <Td className="text-right text-xs" style={{ color: colors.textMuted }}>{fmtNum(p.promedio, 2)} kg</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
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
                          <Tr key={p.nombre} style={{ cursor: 'pointer' }}
                            onClick={() => setModalDetalle({ nombre: p.nombre, tipo: 'helado', registros: produccionesActual.filter(r => (r.producto_nombre || '') === p.nombre).sort((a, b) => { const da = new Date(a.created_at || a.fecha || 0); const db = new Date(b.created_at || b.fecha || 0); return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da) }) })}>
                            <Td className="font-medium" style={{ color: colors.brand }}>{p.nombre}</Td>
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
                          <Tr key={p.nombre} style={{ cursor: 'pointer' }}
                            onClick={() => setModalDetalle({ nombre: p.nombre, tipo: 'impulsivo', registros: produccionesActual.filter(r => (r.producto_nombre || '') === p.nombre).sort((a, b) => { const da = new Date(a.created_at || a.fecha || 0); const db = new Date(b.created_at || b.fecha || 0); return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da) }) })}>
                            <Td className="font-medium" style={{ color: colors.warning }}>{p.nombre}</Td>
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
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.postres }}>🍰 Postres</span>
                      <span className="text-xs ml-auto" style={{ color: colors.textMuted }}>{fmtNum(produccionInforme.actual.kgPostres, 1)} kg · {fmtNum(produccionInforme.actual.regPostres, 0)} reg.</span>
                    </div>
                    <Table className="min-w-[560px]">
                      <Thead><Tr><Th>Producto</Th><Th className="text-right">KG Total</Th><Th className="text-right">Registros</Th><Th className="text-right">Prom kg/reg</Th></Tr></Thead>
                      <Tbody>
                        {prodTableData.postres.map(p => (
                          <Tr key={p.nombre} style={{ cursor: 'pointer' }}
                            onClick={() => setModalDetalle({ nombre: p.nombre, tipo: 'postre', registros: produccionesActual.filter(r => (r.producto_nombre || '') === p.nombre).sort((a, b) => { const da = new Date(a.created_at || a.fecha || 0); const db = new Date(b.created_at || b.fecha || 0); return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da) }) })}>
                            <Td className="font-medium" style={{ color: colors.postres }}>{p.nombre}</Td>
                            <Td className="text-right font-bold" style={{ color: colors.postres }}>{fmtNum(p.kg, 1)} kg</Td>
                            <Td className="text-right">{fmtNum(p.registros, 0)}</Td>
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
                              <span style={{ color: colors.textMuted }}> · {o.regSabores} baldes</span>
                              {o.regSabores > 0 && <span style={{ color: colors.textMuted }}> · prom {fmtNum(o.kgSabores / o.regSabores, 2)} kg/reg</span>}
                            </div>
                          )}
                          {o.unidImpulsivos > 0 && (
                            <p className="text-xs" style={{ color: colors.warning }}>
                              <span className="font-semibold">{fmtNum(o.unidImpulsivos, 0)} u</span>
                              <span style={{ color: colors.textMuted }}> impulsivos</span>
                            </p>
                          )}
                          {o.kgPostres > 0 && (
                            <p className="text-xs" style={{ color: colors.postres }}>
                              <span className="font-semibold">{fmtNum(o.kgPostres, 1)} kg</span>
                              <span style={{ color: colors.textMuted }}> postres · {o.regPostres} reg.</span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Consumo de bases / materia prima — de los vínculos base→producto */}
                {consumoInforme.filas.length > 0 && (
                  <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                    <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>🧱 Consumo de bases / materia prima</span>
                      <span className="text-xs font-semibold" style={{ color: colors.brand }}>{fmtNum(consumoInforme.totalKg, 1)} kg</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full" style={{ minWidth: 420 }}>
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                            {['Base', 'Kg consumidos', 'Productos', 'Vínculos'].map((h, i) => (
                              <th key={h} className="py-2 px-4 font-semibold uppercase" style={{ fontSize: 10, color: colors.textMuted, letterSpacing: '0.07em', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {consumoInforme.filas.map(b => (
                            <tr key={b.base} style={{ borderBottom: `1px solid ${colors.border}` }}>
                              <td className="py-2 px-4 text-sm font-medium" style={{ color: colors.textPrimary }}>{b.base}</td>
                              <td className="py-2 px-4 text-sm font-semibold text-right" style={{ color: colors.brand }}>{fmtNum(b.kg, 1)} kg</td>
                              <td className="py-2 px-4 text-xs text-right" style={{ color: colors.textMuted }}>{b.productos}</td>
                              <td className="py-2 px-4 text-xs text-right" style={{ color: colors.textMuted }}>{b.registros}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
                        <Td><Badge variant="neutral">{p.tipo === 'Helado' ? `Helado · ${p.subtipo}` : p.tipo}</Badge></Td>
                        <Td className="text-right">${pesos(p.costo_unit)}</Td>
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

      {/* ── Modal detalle de producción por producto ── */}
      {modalDetalle && (() => {
        const { nombre, tipo, registros } = modalDetalle
        const esHelado    = tipo === 'helado'
        const esImpulsivo = tipo === 'impulsivo'
        const esPostre    = tipo === 'postre'
        const esPeso      = esHelado || esPostre // helados y postres se miden por kg

        const totalKg      = registros.reduce((a, r) => a + (r.peso_kg || 0), 0)
        const totalUnidades = registros.reduce((a, r) => a + (r.peso_kg || 0), 0) // para impulsivos peso_kg = unidades
        const totalBaldes  = registros.length
        const promedio     = registros.length > 0 ? totalKg / registros.length : 0

        const fmtTS = (r) => {
          const ts = r.created_at || r.fecha
          if (!ts) return '—'
          try {
            const d = new Date(ts)
            if (isNaN(d.getTime())) return ts.slice(0, 10) || '—'
            return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' hs'
          } catch { return '—' }
        }

        return (
          <Modal
            open
            onClose={() => setModalDetalle(null)}
            title={`Detalle de producción — ${nombre}`}
            maxWidth="max-w-3xl"
            disableBackdropClose={false}
            footer={<Button variant="secondary" onClick={() => setModalDetalle(null)} className="w-full sm:w-auto">Cerrar</Button>}
          >
            <div className="space-y-4">
              {registros.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: colors.textMuted }}>Sin registros en este período</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full" style={{ minWidth: esPeso ? 580 : 480 }}>
                      <thead>
                        <tr style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                          {['Fecha/Hora', 'Operario',
                            esPeso ? 'KG' : 'Unidades',
                            'Lote', 'Observaciones',
                          ].filter(Boolean).map(h => (
                            <th key={h} className="py-2.5 px-4 text-left font-semibold uppercase"
                              style={{ fontSize: 10, color: colors.textMuted, letterSpacing: '0.07em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {registros.map((r, i) => (
                          <tr key={r.id || i} style={{ borderBottom: `1px solid ${colors.border}` }}>
                            <td className="py-2.5 px-4 text-xs whitespace-nowrap" style={{ color: colors.textMuted }}>{fmtTS(r)}</td>
                            <td className="py-2.5 px-4 text-sm" style={{ color: colors.textSecondary }}>{r.operario_nombre || '—'}</td>
                            <td className="py-2.5 px-4 text-sm font-semibold text-right" style={{ color: esHelado ? colors.brand : esImpulsivo ? colors.warning : colors.postres }}>
                              {fmtNum(r.peso_kg, esPeso ? 3 : 0)} {esPeso ? 'kg' : 'u'}
                            </td>
                            <td className="py-2.5 px-4 text-xs font-mono" style={{ color: colors.textMuted }}>{r.lote || '—'}</td>
                            <td className="py-2.5 px-4 text-xs max-w-[140px] truncate" style={{ color: colors.textMuted }}>{r.observaciones || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totales al pie */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2" style={{ borderTop: `1px solid ${colors.border}` }}>
                    <div className="text-center p-2 rounded-lg" style={{ backgroundColor: colors.bg }}>
                      <p className="text-xs" style={{ color: colors.textMuted }}>Registros</p>
                      <p className="text-lg font-bold" style={{ color: colors.textPrimary }}>{registros.length}</p>
                    </div>
                    {esHelado && <>
                      <div className="text-center p-2 rounded-lg" style={{ backgroundColor: colors.bg }}>
                        <p className="text-xs" style={{ color: colors.textMuted }}>Total KG</p>
                        <p className="text-lg font-bold" style={{ color: colors.brand }}>{fmtNum(totalKg, 2)} kg</p>
                      </div>
                      <div className="text-center p-2 rounded-lg" style={{ backgroundColor: colors.bg }}>
                        <p className="text-xs" style={{ color: colors.textMuted }}>Total Baldes</p>
                        <p className="text-lg font-bold" style={{ color: colors.info }}>{totalBaldes}</p>
                      </div>
                      <div className="text-center p-2 rounded-lg" style={{ backgroundColor: colors.bg }}>
                        <p className="text-xs" style={{ color: colors.textMuted }}>Prom kg/reg</p>
                        <p className="text-lg font-bold" style={{ color: colors.textSecondary }}>{fmtNum(promedio, 3)}</p>
                      </div>
                    </>}
                    {esImpulsivo && (
                      <div className="text-center p-2 rounded-lg" style={{ backgroundColor: colors.bg }}>
                        <p className="text-xs" style={{ color: colors.textMuted }}>Total Unidades</p>
                        <p className="text-lg font-bold" style={{ color: colors.warning }}>{Math.round(totalUnidades)} u</p>
                      </div>
                    )}
                    {esPostre && <>
                      <div className="text-center p-2 rounded-lg" style={{ backgroundColor: colors.bg }}>
                        <p className="text-xs" style={{ color: colors.textMuted }}>Total KG</p>
                        <p className="text-lg font-bold" style={{ color: '#7c3aed' }}>{fmtNum(totalKg, 2)} kg</p>
                      </div>
                      <div className="text-center p-2 rounded-lg" style={{ backgroundColor: colors.bg }}>
                        <p className="text-xs" style={{ color: colors.textMuted }}>Prom kg/reg</p>
                        <p className="text-lg font-bold" style={{ color: colors.textSecondary }}>{fmtNum(promedio, 3)}</p>
                      </div>
                    </>}
                  </div>
                </>
              )}
            </div>
          </Modal>
        )
      })()}

      {/* Gráficos ocultos para captura PDF */}
      <div ref={chartRefProd} style={{ position: 'fixed', left: '-9999px', top: 0, width: '760px', height: '300px', background: '#1e293b', padding: '16px 20px', zIndex: -1, borderRadius: '8px' }}>
        <BarChart width={720} height={268} data={chartProduccion}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="nombre" stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
          <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 10 }} />
          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }} formatter={v => [`${v} kg`, 'Producción']} />
          <Bar dataKey="kg" fill="#FF4713" radius={[4, 4, 0, 0]} />
        </BarChart>
      </div>
      <div ref={chartRefOp} style={{ position: 'fixed', left: '-9999px', top: 0, width: '760px', height: '260px', background: '#1e293b', padding: '16px 20px', zIndex: -1, borderRadius: '8px' }}>
        <BarChart width={720} height={228} data={produccionInforme.actual.porOperario.map(o => ({ nombre: (o.nombre || '').split(' ')[0], kg: Number(((o.kgBases || 0) + (o.kgSabores || 0) + (o.kgPostres || 0)).toFixed(1)) }))}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="nombre" stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 10 }} />
          <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 10 }} />
          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }} formatter={v => [`${v} kg`, 'KG producidos']} />
          <Bar dataKey="kg" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </div>
    </div>
  )
}
