import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useUser } from '../context/UserContext'
import { deduplicarOperarios } from '../lib/operarios'
import { normalizarNombre } from '../lib/texto'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  getEstiloInforme, dibujarSeccion, LOGO_PDF, LOGO_PDF_HORIZONTAL,
} from '../lib/pdfEstilos'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import { PageHeader } from '../components/PageHeader'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Badge from '../components/ui/Badge'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow, SURFACE } from '../styles/design-system'
import { finalizarOrdenManual, progresoColor, ESTADO_EN_PROCESO, ESTADO_COMPLETADA } from '../lib/ordenes'
import { POSTRES } from '../lib/postres'
import EtapasOrden from '../components/EtapasOrden'
import ReconciliacionBases from '../components/ReconciliacionBases'
import { usaEtapas } from '../lib/etapas'
import { ClipboardList, Plus, Printer, FileDown, CheckCircle2, Warehouse, X, ChevronDown, ChevronUp, Package, Clock, BarChart2, AlertTriangle, Trash2 } from 'lucide-react'
const logoUrl = '/logo-byn.png'

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

const LITROS_BATCH = 120
const BATCH_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]
const POR_PAGINA = 20

const GRUPOS_PRODUCTO = ['BASES', 'SABORES', 'IMPULSIVOS', 'POSTRES']

const ESTADOS = [
  { key: 'pendiente',  label: 'Pendiente',  color: colors.warning,   variant: 'warning' },
  { key: 'en_proceso', label: 'En proceso', color: colors.info,      variant: 'info'    },
  { key: 'completada', label: 'Completada', color: colors.success,   variant: 'success' },
  { key: 'cancelada',  label: 'Cancelada',  color: colors.textMuted, variant: 'neutral' },
]


const textareaClass = 'w-full rounded-lg border border-[#334155] text-sm text-[#F1F5F9] placeholder:text-[#64748B] bg-[#0F172A] outline-none transition-colors duration-150 px-3 py-2 resize-none focus:ring-2 focus:ring-[#FF4713]/25 focus:border-[#FF4713]'

function estadoInfo(estado) {
  return ESTADOS.find(e => e.key === estado) || ESTADOS[0]
}

function fmtNum(n) {
  return Number((n || 0).toFixed(2)).toString()
}

function formatDuracion(horas) {
  if (!horas || horas <= 0) return '0h 0m'
  const totalMin = Math.round(horas * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${m}m`
}

function eficienciaVariant(pct) {
  if ((pct || 0) >= 90) return 'success'
  if ((pct || 0) >= 70) return 'warning'
  return 'danger'
}

function nowLocal() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function fmtDatetime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Muestra el tiempo transcurrido desde fecha_inicio, actualizándose en vivo.
function TiempoTranscurrido({ fechaInicio }) {
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  if (!fechaInicio) return null
  const horas = Math.max(0, (ahora - new Date(fechaInicio).getTime()) / 3600000)
  return <>{formatDuracion(horas)}</>
}

// Busca la receta de un sabor o, si no existe, de una base, por nombre.
function resolverRecetaCtx(nombre, ctx) {
  const n = normalizarNombre(nombre) // match tolerante a acentos/mayúsculas/espacios
  const sabor = ctx.sabores.find(s => normalizarNombre(s.nombre) === n)
  if (sabor) {
    return {
      tipo: 'sabor',
      id: sabor.id,
      litrosBase: sabor.litros_base || LITROS_BATCH,
      ingredientes: ctx.saborIngredientes.filter(i => i.sabor_id === sabor.id),
    }
  }
  const base = ctx.bases.find(b => normalizarNombre(b.nombre) === n)
  if (base) {
    return {
      tipo: 'base',
      id: base.id,
      litrosBase: base.litros_batch || LITROS_BATCH,
      ingredientes: ctx.baseIngredientes.filter(i => i.base_id === base.id),
    }
  }
  return null
}

function computeMateriasPrimas(item, ctx) {
  // Determinar los ingredientes de la receta y el factor (multiplicador)
  let ingredientes = null
  let factor = 0

  if (item.tipo_producto === 'helado') {
    const receta = resolverRecetaCtx(item.sabor_nombre, ctx)
    if (!receta) return []
    ingredientes = receta.ingredientes
    factor = item.batches || 0
  } else {
    // Impulsivo / postre: la cantidad de la receta es POR UNIDAD,
    // se multiplica por las unidades de la orden.
    factor = item.cantidad_unidades || 0
    const nom = normalizarNombre(item.sabor_nombre)
    // 1) Impulsivo en DB: el sabor_id de la orden viene de stock_camaras y NO
    //    coincide con impulsivo_ingredientes.impulsivo_id (tabla impulsivos).
    //    Resolvemos el id correcto por nombre vía la tabla impulsivos.
    if (ctx.impulsivoIngredientes && ctx.impulsivos) {
      const imp = ctx.impulsivos.find(i => normalizarNombre(i.nombre) === nom)
      if (imp) ingredientes = ctx.impulsivoIngredientes.filter(i => i.impulsivo_id === imp.id)
    }
    // 1b) Compatibilidad: por si alguna orden guardó directamente el impulsivo_id
    if ((!ingredientes || ingredientes.length === 0) && item.sabor_id && ctx.impulsivoIngredientes) {
      const porSaborId = ctx.impulsivoIngredientes.filter(i => i.impulsivo_id === item.sabor_id)
      if (porSaborId.length) ingredientes = porSaborId
    }
    // 2) Postre del catálogo (lib/postres.js): receta por nombre
    if (!ingredientes || ingredientes.length === 0) {
      const postre = POSTRES.find(p => normalizarNombre(p.nombre) === nom)
      if (postre) ingredientes = (postre.ingredientes || []).map(i => ({
        insumo_nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad,
      }))
    }
    if (!ingredientes || ingredientes.length === 0) return []
  }

  const insumoPorNombre = {}
  ctx.insumosStock.forEach(i => { insumoPorNombre[normalizarNombre(i.nombre)] = i })
  // Bases (viven en stock_bases) y sabores intermedios: no se controlan contra
  // el depósito. Una base se mide por lo producido; un sabor intermedio se
  // produce aparte.
  const baseNombres = new Set((ctx.bases || []).map(b => normalizarNombre(b.nombre)))
  const saborNombres = new Set((ctx.sabores || []).map(s => normalizarNombre(s.nombre)))
  const baseDisp = {}
  ;(ctx.stockBases || []).forEach(b => { const k = normalizarNombre(b.base_nombre); baseDisp[k] = (baseDisp[k] || 0) + (Number(b.kg_disponible) || 0) })

  return ingredientes.map(ing => {
    const cantidadPorBatch = ing.cantidad || 0
    const necesario = cantidadPorBatch * factor
    const fila = { nombre: ing.insumo_nombre, cantidadPorBatch, batches: factor, necesario, unidad: ing.unidad }
    const nk = normalizarNombre(ing.insumo_nombre)
    // El agua no se controla (es "sin límite") de forma intencional.
    if (nk.includes('agua')) return { ...fila, disponible: null, estado: 'sinlimite' }
    // Base como ingrediente → disponibilidad desde stock_bases (lo producido).
    if (baseNombres.has(nk)) {
      const disponible = baseDisp[nk] || 0
      return { ...fila, disponible, estado: disponible >= necesario ? 'ok' : 'insuficiente', esBase: true }
    }
    // Sabor intermedio → se produce aparte, no bloquea.
    if (saborNombres.has(nk)) return { ...fila, disponible: null, estado: 'sinlimite', intermedio: true }
    const insumo = insumoPorNombre[nk]
    // Ingrediente que NO matchea ningún insumo del depósito: se marca como
    // "no vinculado" (visible) en vez de fingir que está disponible.
    if (!insumo) return { ...fila, disponible: null, estado: 'no_vinculado' }
    const disponible = insumo.stock_actual || 0
    return { ...fila, disponible, estado: disponible >= necesario ? 'ok' : 'insuficiente' }
  })
}

function calcularProyeccionItem(nombre, ingredientes, insumosMap, litrosBase, tipo, itemKey, grupo) {
  let batchesPosibles = Infinity
  let ingredienteLimitante = null

  for (const ing of ingredientes) {
    const nomIng = normalizarNombre(ing.insumo_nombre || ing.nombre)
    if (nomIng.includes('agua')) continue
    const cantidad = ing.cantidad || 0
    if (cantidad <= 0) continue
    const insumo = insumosMap[nomIng]
    if (!insumo) continue
    const stockActual = insumo.stock_actual || 0
    const posible = stockActual / cantidad
    if (posible < batchesPosibles) {
      batchesPosibles = posible
      ingredienteLimitante = { nombre: ing.insumo_nombre || ing.nombre, stockActual, necesita: cantidad, unidad: ing.unidad || '' }
    }
  }

  if (!isFinite(batchesPosibles)) batchesPosibles = 0
  // Redondear hacia abajo al 0.5 más cercano
  const batchesRedondeado = Math.floor(batchesPosibles * 2) / 2
  const kgResultante = litrosBase != null ? batchesRedondeado * litrosBase : null

  return { nombre, batchesPosibles: batchesRedondeado, ingredienteLimitante, tipo, litrosBase, kgResultante, _key: itemKey, _grupo: grupo }
}

export default function Ordenes() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [ordenes, setOrdenes]         = useState([])
  const [producciones, setProducciones] = useState([]) // para el desglose "Hecho por"
  const [saboresCamara, setSaboresCamara] = useState([])
  const [sabores, setSabores]         = useState([])
  const [impulsivos, setImpulsivos]   = useState([])
  const [operarios, setOperarios]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState(null)
  const [modal, setModal]             = useState(false)
  const [saving, setSaving]           = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [stockAlert, setStockAlert]   = useState(null)
  const [checkingId, setCheckingId]   = useState(null)
  const [ordenDetalle, setOrdenDetalle]   = useState(null)
  const [reconcOpen, setReconcOpen]   = useState(false)
  const [detalleRegistros, setDetalleRegistros] = useState([])
  const [cargandoDetalle, setCargandoDetalle]   = useState(false)
  const [finalizando, setFinalizando] = useState(false)

  const [saborIngredientes, setSaborIngredientes] = useState([])
  const [insumosStock, setInsumosStock]   = useState([])
  const [stockAlertCrear, setStockAlertCrear] = useState(null)
  const [bases, setBases]             = useState([])
  const [baseIngredientes, setBaseIngredientes] = useState([])

  const [busqueda, setBusqueda]       = useState('')
  const [filtroFecha, setFiltroFecha] = useState('')
  const [filtroMes, setFiltroMes]     = useState('')
  const [ordenarPor, setOrdenarPor]   = useState('fecha')
  const [pagina, setPagina]           = useState(1)

  const [tabProducto, setTabProducto] = useState('BASES')
  const [lineaSel, setLineaSel]       = useState('')
  const [lineaCantidad, setLineaCantidad] = useState('1')
  const [lineaHoras, setLineaHoras]   = useState('')
  const [lineas, setLineas]           = useState([])
  const [mpExpandido, setMpExpandido] = useState({})
  const [stockAlertAgregar, setStockAlertAgregar] = useState(null)
  const [form, setForm] = useState({
    fecha_produccion: new Date().toISOString().split('T')[0],
    operario_id: '', operario_nombre: '', observaciones: '',
  })

  const [stockBases, setStockBases] = useState([])
  const [baseSel, setBaseSel]       = useState('')
  const [kgBaseAUsar, setKgBaseAUsar] = useState('')
  const [pdfLoadingGrupo, setPdfLoadingGrupo] = useState(null)

  const [modalProyeccion, setModalProyeccion] = useState(false)
  const [proyeccionData, setProyeccionData]   = useState({})
  const [loadingProyeccion, setLoadingProyeccion] = useState(false)
  const [tabProyeccion, setTabProyeccion]     = useState('BASES')
  const [filtroProyeccion, setFiltroProyeccion] = useState('todos')
  const [impulsivoIngredientes, setImpulsivoIngredientes] = useState([])

  const [modalInicio, setModalInicio] = useState(null) // { orden }
  const [modalFin, setModalFin]       = useState(null) // { orden, fromDetalle }
  const [fechaInicioVal, setFechaInicioVal] = useState('')
  const [fechaFinVal, setFechaFinVal]       = useState('')
  const [savingHora, setSavingHora]         = useState(false)
  // Alta de base usada al cerrar un sabor cuya base no figura en stock
  const [baseAlta, setBaseAlta]   = useState({ cantidad: '', fecha: '', operario: '' })

  const { isAdmin, user } = useUser()

  // Al abrir el modal de finalización de un sabor sin base en stock, prellenar
  // el alta de base con lo que la receta dice que se necesitó.
  useEffect(() => {
    if (!modalFin) return
    const info = baseDeSabor(modalFin.orden)
    if (info && info.baseNombre && info.falta) {
      setBaseAlta({
        cantidad: info.necesaria ? String(Math.round(info.necesaria * 10) / 10) : '',
        fecha: nowLocal(),
        operario: modalFin.orden.operario_nombre || '',
      })
    } else {
      setBaseAlta({ cantidad: '', fecha: '', operario: '' })
    }
  }, [modalFin]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargar() }, [])

  useEffect(() => {
    const estado = searchParams.get('estado')
    const fecha = searchParams.get('fecha')
    const operario = searchParams.get('operario')
    if (estado) setFiltroEstado(estado)
    if (fecha) setFiltroFecha(fecha)
    if (operario) setBusqueda(operario)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargar() {
    const [
      { data: ord }, { data: sab }, { data: imp }, { data: ops },
      { data: recetas }, { data: ingredientes }, { data: insumosData },
      { data: basesData }, { data: baseIngs }, { data: stockBasesData },
      { data: impIngsData },
    ] = await Promise.all([
      supabase.from('ordenes_produccion').select('*').order('id', { ascending: false }).limit(300),
      supabase.from('stock_camaras').select('id,nombre,tipo,tipo_producto,baldes').order('nombre'),
      supabase.from('impulsivos').select('id,nombre').order('nombre'),
      supabase.from('operarios').select('*').order('nombre'),
      supabase.from('sabores').select('id,nombre,litros_base,base_nombre').order('nombre'),
      supabase.from('sabor_ingredientes').select('*'),
      supabase.from('insumos').select('nombre,stock_actual,unidad'),
      supabase.from('bases').select('id,nombre,litros_batch').order('nombre'),
      supabase.from('base_ingredientes').select('*'),
      supabase.from('stock_bases').select('*').gt('kg_disponible', 0).order('fecha', { ascending: false }),
      supabase.from('impulsivo_ingredientes').select('*'),
    ])
    // Producciones recientes (para mostrar quién produjo cada orden). Ventana amplia.
    const ventanaProd = new Date(); ventanaProd.setDate(ventanaProd.getDate() - 90)
    const { data: prods } = await supabase.from('producciones')
      .select('producto_nombre,peso_kg,operario_nombre,fecha,origen')
      .gte('fecha', ventanaProd.toISOString().split('T')[0])
      .limit(3000)
    const operariosDedup = deduplicarOperarios(ops)
    setOrdenes(ord || [])
    setProducciones(prods || [])
    setSaboresCamara(sab || [])
    setImpulsivos(imp || [])
    setOperarios(operariosDedup)
    setSabores(recetas || [])
    setSaborIngredientes(ingredientes || [])
    setInsumosStock(insumosData || [])
    setBases(basesData || [])
    setBaseIngredientes(baseIngs || [])
    setStockBases(stockBasesData || [])
    setImpulsivoIngredientes(impIngsData || [])

    const opciones = [
      ...(basesData || []).map(b => ({ _key: `base-${b.id}`, _grupo: 'BASES' })),
      ...(recetas || []).map(s => ({ _key: `sabor-${s.id}`, _grupo: 'SABORES' })),
      ...(sab || []).filter(s => s.tipo_producto === 'impulsivo').map(p => ({ _key: `imp-${p.id}`, _grupo: 'IMPULSIVOS' })),
      ...(sab || []).filter(s => s.tipo_producto === 'postre').map(p => ({ _key: `postre-${p.id}`, _grupo: 'POSTRES' })),
    ]
    const primero = GRUPOS_PRODUCTO.map(g => opciones.find(o => o._grupo === g)).find(Boolean)
    if (primero) { setTabProducto(primero._grupo); setLineaSel(primero._key) }

    if (operariosDedup.length > 0) setForm(f => ({ ...f, operario_id: String(operariosDedup[0].id), operario_nombre: operariosDedup[0].nombre }))
    setLoading(false)
  }

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function upd(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function abrirProyeccion() {
    setModalProyeccion(true)
    setLoadingProyeccion(true)

    // Cargar impulsivo_ingredientes si no están en memoria
    let impIngs = impulsivoIngredientes
    if (impIngs.length === 0) {
      const { data } = await supabase.from('impulsivo_ingredientes').select('*')
      impIngs = data || []
      setImpulsivoIngredientes(impIngs)
    }

    // Mapa de insumos por nombre (lowercase)
    const insumosMap = {}
    insumosStock.forEach(i => { insumosMap[normalizarNombre(i.nombre)] = i })

    const basesProy = bases.map(base => calcularProyeccionItem(
      base.nombre,
      baseIngredientes.filter(i => i.base_id === base.id),
      insumosMap, base.litros_batch || LITROS_BATCH, 'base', `base-${base.id}`, 'BASES'
    ))

    const saboresProy = sabores.map(sabor => calcularProyeccionItem(
      sabor.nombre,
      saborIngredientes.filter(i => i.sabor_id === sabor.id),
      insumosMap, sabor.litros_base || LITROS_BATCH, 'sabor', `sabor-${sabor.id}`, 'SABORES'
    ))

    const impulsivosProy = impulsivos.map(imp => calcularProyeccionItem(
      imp.nombre,
      impIngs.filter(i => i.impulsivo_id === imp.id),
      insumosMap, null, 'impulsivo', `imp-${imp.id}`, 'IMPULSIVOS'
    ))

    const postresProy = POSTRES.map((postre, idx) => calcularProyeccionItem(
      postre.nombre,
      (postre.ingredientes || []).map(i => ({ insumo_nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad })),
      insumosMap, null, 'postre', `postre-${idx}`, 'POSTRES'
    ))

    const sortDesc = arr => [...arr].sort((a, b) => b.batchesPosibles - a.batchesPosibles)
    setProyeccionData({
      bases:      sortDesc(basesProy),
      sabores:    sortDesc(saboresProy),
      impulsivos: sortDesc(impulsivosProy),
      postres:    sortDesc(postresProy),
    })
    setLoadingProyeccion(false)
  }

  function abrirNuevaOrdenConProducto(item) {
    setModalProyeccion(false)
    setTabProducto(item._grupo)
    setLineaSel(item._key)
    setModal(true)
  }

  const opcionesActivas = [
    ...bases.map(b => ({ ...b, _key: `base-${b.id}`, _tipo: 'base', _grupo: 'BASES', nombre: (b.nombre || '').toUpperCase() })),
    ...sabores.map(s => ({ ...s, _key: `sabor-${s.id}`, _tipo: 'sabor', _grupo: 'SABORES', nombre: (s.nombre || '').toUpperCase() })),
    ...saboresCamara.filter(s => s.tipo_producto === 'impulsivo').map(p => ({ ...p, _key: `imp-${p.id}`, _tipo: 'impulsivo', _grupo: 'IMPULSIVOS', nombre: (p.nombre || '').toUpperCase() })),
    ...saboresCamara.filter(s => s.tipo_producto === 'postre').map(p => ({ ...p, _key: `postre-${p.id}`, _tipo: 'postre', _grupo: 'POSTRES', nombre: (p.nombre || '').toUpperCase() })),
  ]
  const opcionesDelTab = opcionesActivas.filter(p => p._grupo === tabProducto)
  const productoSel = opcionesActivas.find(p => p._key === lineaSel)
  const productoSelEsHelado = productoSel?._tipo === 'sabor' || productoSel?._tipo === 'base'

  function cambiarTabProducto(grupo) {
    setTabProducto(grupo)
    const opciones = opcionesActivas.filter(p => p._grupo === grupo)
    setLineaSel(opciones[0]?._key || '')
    setLineaCantidad('1')
    setBaseSel('')
    setKgBaseAUsar('')
  }

  function resolverReceta(nombre) {
    return resolverRecetaCtx(nombre, { sabores, bases, saborIngredientes, baseIngredientes })
  }

  // ¿La orden es un sabor que necesita una base, y hay stock de esa base?
  // Devuelve null para bases/impulsivos/postres (no aplica el control).
  function baseDeSabor(orden) {
    if (!orden) return null
    if (orden.tipo_producto && orden.tipo_producto !== 'helado') return null
    const sabor = sabores.find(s => normalizarNombre(s.nombre) === normalizarNombre(orden.sabor_nombre))
    if (!sabor) return null // no es un sabor conocido (p. ej. una base)
    if (!sabor.base_nombre) return { sinBaseEnReceta: true, saborNombre: sabor.nombre }
    const litrosBase = Number(sabor.litros_base) || 0
    const necesaria = (Number(orden.batches) || 0) * litrosBase
    const disponible = stockBases
      .filter(b => normalizarNombre(b.base_nombre) === normalizarNombre(sabor.base_nombre))
      .reduce((a, b) => a + (Number(b.kg_disponible) || 0), 0)
    return { baseNombre: sabor.base_nombre, litrosBase, necesaria, disponible, falta: disponible + 0.5 < (necesaria || 0.01) }
  }

  function calcularKgObjetivo(nombreProducto, batches) {
    const receta = resolverReceta(nombreProducto)
    if (!receta) return { kgObjetivo: batches * LITROS_BATCH, litrosBase: LITROS_BATCH, extraKg: 0 }
    if (receta.tipo === 'base') {
      const kgObjetivo = batches * receta.litrosBase
      return { kgObjetivo, litrosBase: receta.litrosBase, extraKg: 0 }
    }
    const extraKg = receta.ingredientes.filter(i => i.unidad === 'kg').reduce((a, i) => a + (i.cantidad || 0), 0)
    const kgObjetivo = batches * (receta.litrosBase + extraKg)
    return { kgObjetivo, litrosBase: receta.litrosBase, extraKg }
  }

  function agregarLinea() {
    if (!productoSel) { toast2('Seleccioná un producto', 'error'); return }
    const horasEstimadas = parseFloat(lineaHoras || '0') || 0
    if (!(horasEstimadas > 0)) { toast2('Las horas estimadas son obligatorias', 'error'); return }
    if (productoSelEsHelado) {
      const cantidad = parseFloat(lineaCantidad || '1')
      if (!(cantidad > 0)) { toast2('La cantidad debe ser mayor a 0', 'error'); return }
      const { kgObjetivo, litrosBase, extraKg } = calcularKgObjetivo(productoSel.nombre, cantidad)
      const linea = {
        tipo: 'helado', producto_id: productoSel.id, producto_nombre: productoSel.nombre,
        cantidad, litros: cantidad * LITROS_BATCH,
        kg_objetivo: kgObjetivo, litros_base: litrosBase, extra_kg: extraKg,
        horas_estimadas: horasEstimadas,
        base_nombre: null,
        kg_base_consumida: 0,
      }
      const items = compararConStock(requerimientosDeLineas([linea]))
      if (items.some(it => it.estado !== 'ok')) {
        setStockAlertAgregar({ items, linea })
        return
      }
      setLineas(ls => [...ls, linea])
    } else {
      const cantidad = parseInt(lineaCantidad || '1', 10)
      if (!(cantidad > 0)) { toast2('La cantidad debe ser mayor a 0', 'error'); return }
      setLineas(ls => [...ls, {
        tipo: productoSel._tipo, // 'impulsivo' o 'postre'
        producto_id: productoSel.id, producto_nombre: productoSel.nombre,
        cantidad, kg_objetivo: 0, horas_estimadas: horasEstimadas,
        base_nombre: null, kg_base_consumida: 0,
      }])
    }
    setLineaCantidad('1')
    setLineaHoras('')
    setBaseSel('')
    setKgBaseAUsar('')
  }

  function agregarLineaConFaltantes() {
    if (!stockAlertAgregar) return
    setLineas(ls => [...ls, stockAlertAgregar.linea])
    setStockAlertAgregar(null)
    setLineaCantidad('1')
    setLineaHoras('')
  }

  function quitarLinea(idx) {
    setLineas(ls => ls.filter((_, i) => i !== idx))
  }

  function requerimientosDeLineas(lineasHelado) {
    const map = {}
    lineasHelado.forEach(l => {
      const receta = resolverReceta(l.producto_nombre)
      if (!receta) return
      receta.ingredientes.forEach(ing => {
        const key = normalizarNombre(ing.insumo_nombre)
        if (!key) return
        if (!map[key]) map[key] = { nombre: ing.insumo_nombre, cantidad: 0, unidad: ing.unidad }
        map[key].cantidad += (ing.cantidad || 0) * l.cantidad
      })
    })
    return Object.values(map)
  }

  function compararConStock(requeridos) {
    const insumoPorNombre = {}
    insumosStock.forEach(i => { insumoPorNombre[normalizarNombre(i.nombre)] = i })
    // Las BASES no viven en el depósito: su disponibilidad sale de stock_bases
    // (lo que se produjo). Antes se buscaban en insumos → siempre faltaban.
    const baseDisp = {}
    stockBases.forEach(b => { const k = normalizarNombre(b.base_nombre); baseDisp[k] = (baseDisp[k] || 0) + (Number(b.kg_disponible) || 0) })
    const esBase  = new Set(bases.map(b => normalizarNombre(b.nombre)))
    const esSabor = new Set(sabores.map(s => normalizarNombre(s.nombre)))
    return requeridos.map(r => {
      const nk = normalizarNombre(r.nombre)
      if ((r.nombre || '').toLowerCase().includes('agua')) {
        return { nombre: r.nombre, necesario: r.cantidad, unidad: r.unidad, disponible: Infinity, diferencia: Infinity, estado: 'ok' }
      }
      // Ingrediente que es una BASE → se controla contra lo producido (stock_bases).
      if (esBase.has(nk)) {
        const disponible = baseDisp[nk] || 0
        const diferencia = disponible - r.cantidad
        const severo = r.cantidad > 0 && (r.cantidad - disponible) / r.cantidad >= 0.5
        const estado = diferencia >= 0 ? 'ok' : (severo ? 'critico' : 'bajo')
        return { nombre: r.nombre, necesario: r.cantidad, unidad: r.unidad, disponible, diferencia, estado, esBase: true }
      }
      // Ingrediente que es un SABOR intermedio → se produce aparte, no bloquea acá.
      if (esSabor.has(nk)) {
        return { nombre: r.nombre, necesario: r.cantidad, unidad: r.unidad, disponible: Infinity, diferencia: Infinity, estado: 'ok', intermedio: true }
      }
      const insumo = insumoPorNombre[nk]
      const disponible = insumo ? (insumo.stock_actual || 0) : 0
      const diferencia = disponible - r.cantidad
      const severo = r.cantidad > 0 && (r.cantidad - disponible) / r.cantidad >= 0.5
      const estado = diferencia >= 0 ? 'ok' : (severo ? 'critico' : 'bajo')
      return { nombre: r.nombre, necesario: r.cantidad, unidad: r.unidad, disponible, diferencia, estado }
    })
  }

  function materiasPrimasDe(item) {
    return computeMateriasPrimas(item, { sabores, bases, saborIngredientes, baseIngredientes, insumosStock, impulsivoIngredientes, impulsivos, stockBases })
  }

  const basesNecesarias = useMemo(() => {
    const map = {}
    lineas.forEach(l => {
      if (l.tipo !== 'helado') return
      const saborRecord = sabores.find(s => (s.nombre || '').toLowerCase() === (l.producto_nombre || '').toLowerCase())
      if (!saborRecord?.base_nombre) return
      const baseNombre = saborRecord.base_nombre
      const litrosPorBatch = saborRecord.litros_base || LITROS_BATCH
      if (!map[baseNombre]) map[baseNombre] = { base: baseNombre, litros: 0, batches: 0 }
      map[baseNombre].litros += litrosPorBatch * l.cantidad
      map[baseNombre].batches += l.cantidad
    })
    return Object.values(map)
  }, [lineas, sabores])

  async function crearOrden() {
    if (lineas.length === 0) { toast2('Agregá al menos un producto', 'error'); return }
    if (!form.fecha_produccion) { toast2('Completá la fecha de producción', 'error'); return }

    const lineasHelado = lineas.filter(l => l.tipo === 'helado')
    if (lineasHelado.length > 0) {
      const items = compararConStock(requerimientosDeLineas(lineasHelado))
      if (items.some(it => it.estado !== 'ok')) {
        setStockAlertCrear({ items })
        return
      }
    }
    await crearOrdenInterna()
  }

  function crearIgualConFaltantes() {
    setStockAlertCrear(null)
    crearOrdenInterna()
  }

  async function crearOrdenInterna() {
    setSaving(true)

    const { data: existentes } = await supabase.from('ordenes_produccion')
      .select('numero').like('numero', '0000-%')
    let maxNum = 0
    ;(existentes || []).forEach(o => {
      const m = /^0000-(\d{7})$/.exec(o.numero || '')
      if (m) {
        const n = parseInt(m[1], 10)
        if (n > maxNum) maxNum = n
      }
    })
    const numero = `0000-${String(maxNum + 1).padStart(7, '0')}`

    const filas = lineas.map(l => ({
      numero,
      tipo_producto: l.tipo,
      sabor_id: l.producto_id,
      sabor_nombre: l.producto_nombre,
      batches: l.tipo === 'helado' ? l.cantidad : null,
      litros_total: l.tipo === 'helado' ? l.litros : null,
      cantidad_unidades: (l.tipo === 'impulsivo' || l.tipo === 'postre') ? l.cantidad : null,
      kg_objetivo: l.tipo === 'helado' ? l.kg_objetivo : 0,
      kg_producido: 0,
      porcentaje_completitud: 0,
      horas_estimadas: l.horas_estimadas || 0,
      operario_id: form.operario_id ? parseInt(form.operario_id, 10) : null,
      operario_nombre: (form.operario_nombre || '').toUpperCase() || null,
      estado: 'pendiente',
      fecha_produccion: form.fecha_produccion,
      observaciones: form.observaciones || null,
      base_nombre: l.base_nombre || null,
      kg_base_consumida: l.kg_base_consumida || 0,
      usuario_email: user?.email || null,
    }))

    const { error } = await supabase.from('ordenes_produccion').insert(filas)
    setSaving(false)
    if (error) { toast2(error.message, 'error'); return }
    toast2(`Orden ${numero} creada con ${filas.length} producto${filas.length !== 1 ? 's' : ''}`)
    setModal(false)
    setLineas([])
    setForm(f => ({ ...f, observaciones: '' }))
    setStockAlertCrear(null)
    cargar()
  }

  function handleCloseOrden() {
    if (lineas.length > 0 && !window.confirm('¿Seguro que querés cancelar? Se perderán los productos cargados.')) return
    setModal(false)
  }

  async function cambiarEstado(item, estado) {
    const update = { estado }
    const { error } = await supabase.from('ordenes_produccion').update(update).eq('id', item.id)
    if (error) { toast2(error.message, 'error'); return }
    setOrdenes(prev => prev.map(o => o.id === item.id ? { ...o, ...update } : o))
    toast2('Estado actualizado')
  }

  async function confirmarInicioConFecha() {
    if (!modalInicio) return
    setSavingHora(true)
    const { orden } = modalInicio
    const fechaInicio = new Date(fechaInicioVal).toISOString()
    const update = { estado: 'en_proceso', fecha_inicio: fechaInicio }
    const { error } = await supabase.from('ordenes_produccion').update(update).eq('id', orden.id)
    setSavingHora(false)
    if (error) { toast2(error.message, 'error'); return }
    setOrdenes(prev => prev.map(o => o.id === orden.id ? { ...o, ...update } : o))
    setModalInicio(null)
    toast2('Producción iniciada')
  }

  async function confirmarFinConFecha() {
    if (!modalFin) return
    const { orden, fromDetalle } = modalFin

    // ── Control base↔sabor: no se cierra un sabor sin su base ────────────────
    const info = baseDeSabor(orden)
    if (info && info.baseNombre && info.falta) {
      const cant = parseFloat(baseAlta.cantidad)
      if (!(cant > 0)) { toast2('Registrá los kg de base que se usaron para poder cerrar', 'error'); return }
      if (!baseAlta.fecha) { toast2('Indicá la fecha en que se hizo la base', 'error'); return }
      setSavingHora(true)
      const fechaBase = baseAlta.fecha.slice(0, 10)
      const hoyStr = new Date().toISOString().slice(0, 10)
      const payload = {
        base_nombre: info.baseNombre,
        kg_disponible: cant, kg_original: cant,
        orden_origen: `RETRO-${orden.numero || orden.id}`,
        operario_nombre: baseAlta.operario || orden.operario_nombre || null,
        fecha: fechaBase,
        es_retroactiva: fechaBase < hoyStr,
      }
      let { error: eBase } = await supabase.from('stock_bases').insert(payload)
      // Si todavía no se corrió el ALTER (columna es_retroactiva), reintentar sin ella.
      if (eBase && /es_retroactiva/i.test(eBase.message || '')) {
        const { es_retroactiva, ...sinCol } = payload // eslint-disable-line no-unused-vars
        ;({ error: eBase } = await supabase.from('stock_bases').insert(sinCol))
      }
      if (eBase) { setSavingHora(false); toast2('No se pudo registrar la base: ' + eBase.message, 'error'); return }
    }

    setSavingHora(true)
    const fechaFin = new Date(fechaFinVal).toISOString()
    const { error, mermaError, toastMsg, toastType } = await finalizarOrdenManual(orden, fechaFin)
    setSavingHora(false)
    if (error) { toast2(error.message, 'error'); return }
    if (mermaError) toast2(`Orden finalizada, error en merma: ${mermaError.message}`, 'error')
    const esBase = await manejarCompletadaBase(orden)
    if (!esBase) {
      await manejarCompletadaSabor(orden)
      if (!mermaError) toast2(toastMsg || 'Orden finalizada', toastType || 'ok')
    }
    setModalFin(null)
    if (fromDetalle) setOrdenDetalle(null)
    cargar()
  }

  async function intentarCambiarEstado(item, estado) {
    if (estado === ESTADO_COMPLETADA) {
      setFechaFinVal(nowLocal())
      setModalFin({ orden: item, fromDetalle: false })
      return
    }
    if (estado !== 'en_proceso') {
      cambiarEstado(item, estado)
      return
    }
    setCheckingId(item.id)

    let ings = []
    if (item.tipo_producto === 'impulsivo' || item.tipo_producto === 'postre') {
      // Resuelve la receta del impulsivo (por nombre) o del postre (catálogo)
      ings = materiasPrimasDe(item)
        .filter(m => m.estado !== 'sinlimite')
        .map(m => ({ insumo_nombre: m.nombre, cantidad: m.cantidadPorBatch, unidad: m.unidad, factor: m.batches }))
    } else {
      const receta = resolverReceta(item.sabor_nombre)
      if (receta) {
        ings = receta.ingredientes.map(i => ({ ...i, factor: item.batches || 1 }))
      }
    }

    if (ings.length === 0) {
      setCheckingId(null)
      setStockAlert({ orden: item, items: [], ok: true })
      return
    }

    const { data: insumos } = await supabase.from('insumos').select('nombre,stock_actual,unidad')
    const insumoPorNombre = {}
    ;(insumos || []).forEach(i => { insumoPorNombre[normalizarNombre(i.nombre)] = i })
    // Las BASES se controlan contra lo producido (stock_bases), no contra el
    // depósito. Un sabor intermedio se produce aparte y no bloquea el inicio.
    const esBase = new Set(bases.map(b => normalizarNombre(b.nombre)))
    const esSaborInt = new Set(sabores.map(s => normalizarNombre(s.nombre)))
    const baseDisp = {}
    stockBases.forEach(b => { const k = normalizarNombre(b.base_nombre); baseDisp[k] = (baseDisp[k] || 0) + (Number(b.kg_disponible) || 0) })

    const faltantes = []
    for (const ing of ings) {
      const nk = normalizarNombre(ing.insumo_nombre)
      if (nk.includes('agua')) continue
      const requerido = (ing.cantidad || 0) * ing.factor
      if (esBase.has(nk)) {
        const disponible = baseDisp[nk] || 0
        if (disponible + 0.5 < requerido) {
          faltantes.push({ nombre: ing.insumo_nombre, requerido, disponible, faltan: requerido - disponible, unidad: ing.unidad || 'L', severo: requerido > 0 && ((requerido - disponible) / requerido) >= 0.5 })
        }
        continue
      }
      if (esSaborInt.has(nk)) continue // sabor intermedio → se produce aparte
      const insumo = insumoPorNombre[nk]
      const disponible = insumo?.stock_actual ?? 0
      if (disponible < requerido) {
        const faltan = requerido - disponible
        faltantes.push({
          nombre: ing.insumo_nombre,
          requerido, disponible, faltan,
          unidad: ing.unidad,
          severo: requerido > 0 && (faltan / requerido) >= 0.5,
        })
      }
    }
    setCheckingId(null)
    setStockAlert({ orden: item, items: faltantes, ok: faltantes.length === 0 })
  }

  function confirmarInicio() {
    if (!stockAlert) return
    const orden = stockAlert.orden
    setStockAlert(null)
    setFechaInicioVal(nowLocal())
    setModalInicio({ orden })
  }

  async function abrirDashboard(item) {
    setOrdenDetalle(item)
    setCargandoDetalle(true)
    const { data } = await supabase.from('producciones').select('*')
      .ilike('producto_nombre', item.sabor_nombre)
      .eq('fecha', item.fecha_produccion)
      .order('id', { ascending: false })
      .limit(20)
    setDetalleRegistros(data || [])
    setCargandoDetalle(false)
  }

  function finalizarManual() {
    if (!ordenDetalle) return
    setFechaFinVal(nowLocal())
    setModalFin({ orden: ordenDetalle, fromDetalle: true })
  }

  async function manejarCompletadaBase(item) {
    const receta = resolverReceta(item.sabor_nombre)
    if (receta?.tipo !== 'base') return false
    // Anti-duplicado: si esta orden ya cargó ESTA base, no volver a insertarla
    // (evita bases duplicadas si se "completa" dos veces).
    const { data: yaCargada } = await supabase.from('stock_bases')
      .select('id').eq('orden_origen', item.numero).eq('base_nombre', item.sabor_nombre).limit(1)
    if (yaCargada && yaCargada.length) {
      toast2(`La base ${item.sabor_nombre} de la orden ${item.numero} ya estaba cargada`, 'warn')
      return true
    }
    const litrosBase = receta.litrosBase || LITROS_BATCH
    const kgTeorico = (item.batches || 0) * litrosBase
    // Usar kg_producido real (escaneado en Producción); fallback al teórico si no hay dato
    const kgProducidos = (item.kg_producido || 0) > 0 ? item.kg_producido : kgTeorico
    const hoy = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('stock_bases').insert({
      base_nombre: item.sabor_nombre,
      kg_disponible: kgProducidos,
      kg_original: kgProducidos,
      orden_origen: item.numero,
      operario_nombre: item.operario_nombre,
      fecha: hoy,
    })
    if (!error) {
      const difTexto = Math.abs(kgProducidos - kgTeorico) > 0.5
        ? ` (teórico: ${kgTeorico.toFixed(1)} kg)`
        : ''
      toast2(`Base ${item.sabor_nombre} lista: ${kgProducidos.toFixed(1)} kg${difTexto}`)
    }
    return true
  }

  async function manejarCompletadaSabor(_item) {
    // El descuento de stock_bases y el registro de merma base→sabor
    // se procesan en registrarMermaAutomatica (src/lib/ordenes.js).
  }

  // Elimina una partida de base del stock (p. ej. una base duplicada por error).
  async function eliminarBaseStock(b) {
    if (!window.confirm(`¿Eliminar ${b.base_nombre} (${fmtNum(b.kg_disponible)} kg) del stock de bases?\nUsalo solo para corregir un duplicado o carga errónea.`)) return
    const { error } = await supabase.from('stock_bases').delete().eq('id', b.id)
    if (error) { toast2(error.message, 'error'); return }
    toast2(`Base ${b.base_nombre} eliminada del stock`)
    cargar()
  }

  const grupos = useMemo(() => {
    const m = {}
    ordenes.forEach(o => {
      const key = o.numero || `#${o.id}`
      if (!m[key]) m[key] = { numero: o.numero, fecha: o.fecha_produccion, operario: o.operario_nombre, items: [] }
      m[key].items.push(o)
    })
    return Object.values(m)
  }, [ordenes])

  const gruposFiltrados = useMemo(() => {
    let arr = grupos
    if (filtroEstado !== 'Todos') arr = arr.filter(g => g.items.some(i => i.estado === filtroEstado))
    // Vista por defecto ("Todos") = órdenes ACTIVAS: las terminadas (todas sus
    // líneas completadas o canceladas) se ocultan para no acumular. Se ven con
    // el filtro "Completada".
    else arr = arr.filter(g => !g.items.every(i => i.estado === 'completada' || i.estado === 'cancelada'))
    if (filtroFecha) arr = arr.filter(g => g.fecha === filtroFecha)
    if (filtroMes) arr = arr.filter(g => (g.fecha || '').startsWith(filtroMes))
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase()
      arr = arr.filter(g =>
        (g.numero || '').toLowerCase().includes(q) ||
        (g.operario || '').toLowerCase().includes(q) ||
        g.items.some(i => (i.sabor_nombre || '').toLowerCase().includes(q))
      )
    }
    return arr
  }, [grupos, filtroEstado, filtroFecha, filtroMes, busqueda])

  const gruposOrdenados = useMemo(() => {
    const arr = [...gruposFiltrados]
    switch (ordenarPor) {
      case 'numero':
        arr.sort((a, b) => (b.numero || '').localeCompare(a.numero || ''))
        break
      case 'estado':
        arr.sort((a, b) => {
          const ea = ESTADOS.findIndex(e => e.key === a.items[0]?.estado)
          const eb = ESTADOS.findIndex(e => e.key === b.items[0]?.estado)
          return ea - eb
        })
        break
      case 'producto':
        arr.sort((a, b) => (a.items[0]?.sabor_nombre || '').localeCompare(b.items[0]?.sabor_nombre || ''))
        break
      default:
        arr.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.numero || '').localeCompare(a.numero || ''))
    }
    return arr
  }, [gruposFiltrados, ordenarPor])

  useEffect(() => { setPagina(1) }, [busqueda, filtroEstado, filtroFecha, filtroMes, ordenarPor])

  const totalPaginas = Math.max(1, Math.ceil(gruposOrdenados.length / POR_PAGINA))
  const paginaSegura = Math.min(pagina, totalPaginas)
  const gruposPagina = gruposOrdenados.slice((paginaSegura - 1) * POR_PAGINA, paginaSegura * POR_PAGINA)

  function limpiarFiltros() {
    setBusqueda('')
    setFiltroFecha('')
    setFiltroMes('')
    setFiltroEstado('Todos')
  }

  // Desglose "Hecho por": suma los kg reales cargados en Producción por cada
  // operario para el sabor/fecha de la orden. Una orden puede haberla hecho
  // más de una persona; cada uno queda con SUS kg (para el rendimiento).
  function hechoPorDe(item) {
    if (!item || item.tipo_producto !== 'helado') return []
    const objetivo = normalizarNombre(item.sabor_nombre || item.producto_nombre || '')
    const fecha = item.fecha_produccion
    const porOp = {}
    producciones.forEach(p => {
      if (fecha && p.fecha !== fecha) return
      if (normalizarNombre(p.producto_nombre || '') !== objetivo) return
      const op = p.operario_nombre || 'Sin asignar'
      porOp[op] = (porOp[op] || 0) + (Number(p.peso_kg) || 0)
    })
    return Object.entries(porOp).map(([nombre, kg]) => ({ nombre, kg })).sort((a, b) => b.kg - a.kg)
  }

  const kpiPendientes  = ordenes.filter(o => o.estado === 'pendiente').length
  const kpiEnProceso   = ordenes.filter(o => o.estado === 'en_proceso').length
  const kpiCompletadas = ordenes.filter(o => o.estado === 'completada').length

  const kpisProyeccion = useMemo(() => {
    const cnt = arr => [arr.filter(i => i.batchesPosibles > 0).length, arr.length]
    return {
      bases:      cnt(proyeccionData.bases || []),
      sabores:    cnt(proyeccionData.sabores || []),
      impulsivos: cnt(proyeccionData.impulsivos || []),
      postres:    cnt(proyeccionData.postres || []),
    }
  }, [proyeccionData])

  const datosTabProyeccion = useMemo(() => {
    const raw = ({
      BASES: proyeccionData.bases || [],
      SABORES: proyeccionData.sabores || [],
      IMPULSIVOS: proyeccionData.impulsivos || [],
      POSTRES: proyeccionData.postres || [],
    })[tabProyeccion] || []
    return filtroProyeccion === 'posibles' ? raw.filter(i => i.batchesPosibles > 0) : raw
  }, [proyeccionData, tabProyeccion, filtroProyeccion])

  function _buildPDFOrden(grupo, ctx) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pw  = doc.internal.pageSize.getWidth()
    const ph  = doc.internal.pageSize.getHeight()
    const hoy = new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

    const N   = [20, 20, 20]
    const B   = [255, 255, 255]
    const G   = [245, 245, 245]
    const GM  = [210, 210, 210]
    const VER = [22, 101, 52]
    const ROJ = [153, 27, 27]

    const HDR_H  = 46   // Y donde arranca la fila de KPIs (membrete arriba)
    const KPI_H  = 14
    const CNT_Y1 = HDR_H + KPI_H + 6
    const CNT_Y2 = HDR_H + 4

    const totalHelados = grupo.items.filter(i => i.tipo_producto !== 'impulsivo').length
    const totalImpPost = grupo.items.filter(i => i.tipo_producto === 'impulsivo').length
    const totalBatches = grupo.items.reduce((a, i) => a + (i.batches || 0), 0)
    const estLabel = grupo.items.every(i => i.estado === 'completada') ? 'COMPLETADA'
      : grupo.items.some(i => i.estado === 'en_proceso') ? 'EN PROCESO' : 'PENDIENTE'

    function _header(pg) {
      // Logo horizontal (izquierda)
      const lgH = 17, lgW = lgH * (4200 / 1440)
      try { doc.addImage(LOGO_PDF_HORIZONTAL, 'PNG', 14, 11, lgW, lgH) } catch {}
      // Bloque de título (derecha)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 120, 120)
      doc.text('ORDEN DE PRODUCCIÓN', pw - 14, 15, { align: 'right', charSpace: 0.6 })
      doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...N)
      doc.text(`N° ${grupo.numero}`, pw - 14, 25, { align: 'right' })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110, 110, 110)
      doc.text(`Emitido: ${hoy}`, pw - 14, 30, { align: 'right' })
      // Regla gruesa que cierra el membrete
      doc.setDrawColor(...N); doc.setLineWidth(1); doc.line(14, 35, pw - 14, 35)
      // Fila de estado: badge + operario / programada
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
      const badgeW = doc.getTextWidth(estLabel) + 8
      doc.setFillColor(...N); doc.roundedRect(14, 38.5, badgeW, 6, 1, 1, 'F')
      doc.setTextColor(...B); doc.text(estLabel, 14 + badgeW / 2, 42.6, { align: 'center' })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70, 70, 70)
      doc.text(`Operario: ${grupo.operario || '—'}     ·     Programada: ${grupo.fecha || '—'}`, 14 + badgeW + 4, 42.8)
      // Pie
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(110, 110, 110)
      doc.text(`Pág. ${pg}`, pw - 14, ph - 3, { align: 'right' })
      doc.text('Sistema de Gestión Del Parque — Información de uso confidencial', 14, ph - 3)
    }

    function _kpiFila() {
      const kpis = [
        { label: 'Operario',         val: grupo.operario || '—' },
        { label: 'Fecha programada', val: grupo.fecha    || '—' },
        { label: 'Helados',          val: String(totalHelados) },
        { label: 'Imp./Postres',     val: String(totalImpPost) },
        { label: 'Batches',          val: String(totalBatches) },
      ]
      const kY = HDR_H
      const gap = 3
      const cardW = (pw - 28 - gap * (kpis.length - 1)) / kpis.length
      kpis.forEach((k, i) => {
        const x = 14 + i * (cardW + gap)
        doc.setDrawColor(...N); doc.setLineWidth(0.3); doc.rect(x, kY, cardW, KPI_H)
        doc.setFillColor(...N); doc.rect(x, kY, cardW, 1.2, 'F')
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(110, 110, 110)
        doc.text(k.label.toUpperCase(), x + 2.5, kY + 5)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...N)
        const val = doc.splitTextToSize(String(k.val), cardW - 5)[0] || ''
        doc.text(val, x + 2.5, kY + 11)
      })
    }

    function _firmas() {
      const y = ph - 26
      const roles = ['Supervisor', 'Operario / Fecha', 'Control de Calidad']
      const gap = (pw - 28) / roles.length
      roles.forEach((rol, i) => {
        const x = 14 + i * gap
        doc.setDrawColor(...N)
        doc.setLineWidth(0.5)
        doc.line(x, y, x + gap - 6, y)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(80, 80, 80)
        doc.text(rol, x, y + 5)
      })
    }

    const TS = {
      headStyles: { fillColor: N, textColor: B, fontStyle: 'bold', fontSize: 7.5, cellPadding: 2.5, lineColor: N, lineWidth: 0.1 },
      bodyStyles: { fontSize: 7.5, cellPadding: 2.5, textColor: [40, 40, 40], lineColor: GM, lineWidth: 0.1 },
      alternateRowStyles: { fillColor: G },
      margin: { left: 14, right: 14, bottom: 18 },
    }

    _header(1)
    _kpiFila()
    let finalY = CNT_Y1

    finalY = dibujarSeccion(doc, pw, 'Productos de la orden', finalY)
    autoTable(doc, {
      ...TS,
      startY: finalY,
      head: [['PRODUCTO', 'TIPO', 'CANTIDAD', 'ESTADO']],
      body: grupo.items.map(it => [
        it.sabor_nombre,
        it.tipo_producto === 'impulsivo' ? 'Impulsivo' : it.tipo_producto === 'postre' ? 'Postre' : 'Helado',
        (it.tipo_producto === 'impulsivo' || it.tipo_producto === 'postre')
          ? `${it.cantidad_unidades} u`
          : `${it.batches} batch${it.batches !== 1 ? 'es' : ''} (${it.litros_total} L)`,
        estadoInfo(it.estado).label,
      ]),
      didDrawPage: () => {
        const pg = doc.internal.getCurrentPageInfo().pageNumber
        if (pg > 1) _header(pg)
      },
    })

    finalY = (doc.lastAutoTable?.finalY || finalY) + 8

    const obs = grupo.items.find(i => i.observaciones)?.observaciones
    if (obs) {
      if (finalY > ph - 55) { doc.addPage(); _header(doc.internal.getCurrentPageInfo().pageNumber); finalY = CNT_Y2 }
      finalY = dibujarSeccion(doc, pw, 'Observaciones', finalY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(50, 50, 50)
      const obsLines = doc.splitTextToSize(obs, pw - 28)
      doc.text(obsLines, 14, finalY)
      finalY += obsLines.length * 4.5 + 8
    }

    const mpSecciones = grupo.items
      .map(it => ({ it, mp: computeMateriasPrimas(it, ctx) }))
      .filter(s => s.mp.length > 0)

    for (const { it, mp } of mpSecciones) {
      if (finalY > ph - 55) { doc.addPage(); _header(doc.internal.getCurrentPageInfo().pageNumber); finalY = CNT_Y2 }
      const detalle = it.tipo_producto === 'helado'
        ? `${it.batches} batch${it.batches !== 1 ? 'es' : ''}`
        : `${it.cantidad_unidades} u`
      finalY = dibujarSeccion(doc, pw, `MP — ${it.sabor_nombre} (${detalle})`, finalY + 3)
      autoTable(doc, {
        ...TS,
        bodyStyles: { ...TS.bodyStyles, cellPadding: 2 },
        headStyles: { ...TS.headStyles, cellPadding: 2 },
        startY: finalY,
        head: [['INGREDIENTE', 'NECESARIO', 'STOCK', 'ESTADO']],
        body: mp.map(m => [
          m.nombre,
          `${fmtNum(m.necesario)} ${m.unidad}`,
          m.estado === 'sinlimite' ? '∞' : m.estado === 'no_vinculado' ? '—' : `${fmtNum(m.disponible)} ${m.unidad}`,
          m.estado === 'sinlimite' ? 'Sin límite' : m.estado === 'no_vinculado' ? 'SIN VINCULAR' : m.estado === 'ok' ? 'OK' : 'INSUF.',
        ]),
        didParseCell(data) {
          if (data.section !== 'body' || data.column.index !== 3) return
          const estado = mp[data.row.index]?.estado
          if (estado === 'insuficiente') data.cell.styles.textColor = ROJ
          else if (estado === 'ok') data.cell.styles.textColor = VER
          else if (estado === 'no_vinculado') data.cell.styles.textColor = [224, 134, 0]
        },
        didDrawPage: () => {
          const pg = doc.internal.getCurrentPageInfo().pageNumber
          if (pg > 1) _header(pg)
        },
      })
      finalY = (doc.lastAutoTable?.finalY || finalY) + 6
    }

    if (finalY > ph - 42) {
      doc.addPage()
      _header(doc.internal.getCurrentPageInfo().pageNumber)
    }
    _firmas()

    return doc
  }

  async function _cargarDatosOrden() {
    let ctx = { sabores, bases, saborIngredientes, baseIngredientes, insumosStock, impulsivoIngredientes, impulsivos, stockBases }
    if (!saborIngredientes.length || !insumosStock.length) {
      const [{ data: ings }, { data: ins }, { data: baseIngs }] = await Promise.all([
        supabase.from('sabor_ingredientes').select('*'),
        supabase.from('insumos').select('nombre,stock_actual,unidad'),
        supabase.from('base_ingredientes').select('*'),
      ])
      if (ings) { setSaborIngredientes(ings); ctx = { ...ctx, saborIngredientes: ings } }
      if (ins)  { setInsumosStock(ins);  ctx = { ...ctx, insumosStock: ins } }
      if (baseIngs) { setBaseIngredientes(baseIngs); ctx = { ...ctx, baseIngredientes: baseIngs } }
    }
    return ctx
  }

  async function imprimirOrden(grupo) {
    setPdfLoadingGrupo(grupo.numero + '-print')
    const ctx = await _cargarDatosOrden()
    const doc = _buildPDFOrden(grupo, ctx)
    doc.autoPrint()
    window.open(doc.output('bloburl'), '_blank')
    setPdfLoadingGrupo(null)
  }

  async function imprimirListaMP(grupo, item) {
    const w = window.open('', '_blank')

    let ctx = { sabores, bases, saborIngredientes, baseIngredientes, insumosStock, impulsivoIngredientes, impulsivos, stockBases }
    let mp = computeMateriasPrimas(item, ctx)

    if (mp.length === 0) {
      const [{ data: ingredientes }, { data: insumosData }, { data: baseIngs }] = await Promise.all([
        supabase.from('sabor_ingredientes').select('*'),
        supabase.from('insumos').select('nombre,stock_actual,unidad'),
        supabase.from('base_ingredientes').select('*'),
      ])
      setSaborIngredientes(ingredientes || [])
      setInsumosStock(insumosData || [])
      setBaseIngredientes(baseIngs || [])
      ctx = { ...ctx, saborIngredientes: ingredientes || [], insumosStock: insumosData || [], baseIngredientes: baseIngs || [] }
      mp = computeMateriasPrimas(item, ctx)
    }

    if (mp.length === 0) {
      w.close()
      toast2('No se encontraron materias primas para este producto', 'error')
      return
    }

    const filas = mp.map(m => `
      <tr>
        <td>${m.nombre}</td>
        <td style="text-align:right">
          <strong>${fmtNum(m.necesario)} ${m.unidad}</strong>
          ${m.batches > 0 ? `<br><span style="font-size:9px;color:#6b7280">(${fmtNum(m.cantidadPorBatch)} ${m.unidad} × ${m.batches} batch${m.batches !== 1 ? 'es' : ''})</span>` : ''}
        </td>
        <td style="text-align:right">${m.disponible == null ? '—' : `${fmtNum(m.disponible)} ${m.unidad}`}</td>
        <td>${m.estado === 'sinlimite' ? '♾️ Sin límite' : m.estado === 'no_vinculado' ? '⚠️ Sin vincular' : m.estado === 'ok' ? '✅ OK' : '❌ INSUFICIENTE'}</td>
        <td style="text-align:center"><div class="checkbox"></div></td>
      </tr>`).join('')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Lista MP — ${grupo.numero}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11px;padding:24px}
      .header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px}
      .logo-img{height:32px;display:block}
      .sub{font-size:10px;color:#666}
      h2{font-size:15px;margin-bottom:14px;color:#111827}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
      .campo{background:#f9fafb;border-radius:8px;padding:10px}
      .campo-label{font-size:8px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:2px}
      .campo-val{font-size:13px;font-weight:700;color:#111827}
      table{width:100%;border-collapse:collapse;margin-bottom:20px}
      th{background:#f3f4f6;font-size:9px;font-weight:700;text-transform:uppercase;padding:6px 8px;text-align:left;border-bottom:2px solid ${colors.brand}}
      td{padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:11px}
      .checkbox{width:14px;height:14px;border:1.5px solid #374151;border-radius:3px;margin:0 auto}
      .firma-area{display:flex;gap:48px;margin-top:48px}
      .firma{flex:1;border-top:1px solid #374151;padding-top:8px;font-size:9px;color:#6b7280}
      @media print{body{padding:0}}
    </style></head><body>
    <div class="header">
      <img src="${logoUrl}" class="logo-img" alt="Del Parque" />
      <div class="sub">Emitida: ${new Date().toLocaleDateString('es-AR')}</div>
    </div>
    <h2>Del Parque — Lista de Materias Primas</h2>
    <div class="grid">
      <div class="campo"><div class="campo-label">Orden N°</div><div class="campo-val">${grupo.numero}</div></div>
      <div class="campo"><div class="campo-label">Producto</div><div class="campo-val">${item.sabor_nombre}</div></div>
      <div class="campo"><div class="campo-label">Operario</div><div class="campo-val">${grupo.operario || '—'}</div></div>
      <div class="campo"><div class="campo-label">Fecha</div><div class="campo-val">${grupo.fecha || '—'}</div></div>
      <div class="campo"><div class="campo-label">Batches</div><div class="campo-val">${item.batches}</div></div>
    </div>
    <table>
      <thead><tr><th>Ingrediente</th><th>Necesario (× batches)</th><th>Stock actual</th><th>Estado</th><th>Entregado ✓</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="firma-area">
      <div class="firma">Encargado de Depósito · Firma y fecha</div>
      <div class="firma">Operario que recibe · Firma y fecha</div>
    </div>
    </body></html>`)
    w.document.close()
    w.onload = () => w.print()
  }

  async function exportarPDF(grupo) {
    setPdfLoadingGrupo(grupo.numero + '-pdf')
    const ctx = await _cargarDatosOrden()
    const doc = _buildPDFOrden(grupo, ctx)
    doc.save(`orden_${grupo.numero}.pdf`)
    setPdfLoadingGrupo(null)
  }

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      <PageHeader
        title="Órdenes"
        subtitle={`Órdenes de producción · ${LITROS_BATCH} L/batch`}
        actions={<>
          {isAdmin && (
            <Button variant="secondary" onClick={abrirProyeccion}>
              <BarChart2 size={15} /> ¿Qué puedo producir?
            </Button>
          )}
          <Button variant="secondary" onClick={() => setReconcOpen(true)}>
            <BarChart2 size={15} /> Reconciliar bases
          </Button>
          <Button variant="primary" onClick={() => setModal(true)}>
            <Plus size={15} /> Nueva orden
          </Button>
        </>}
      />

      {reconcOpen && <ReconciliacionBases onClose={() => setReconcOpen(false)} />}

      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Pendientes"  value={loading ? '—' : kpiPendientes}  color={colors.warning} />
        <KpiCard label="En proceso"  value={loading ? '—' : kpiEnProceso}   color={colors.info} />
        <KpiCard label="Completadas" value={loading ? '—' : kpiCompletadas} color={colors.success} />
      </div>

      {stockBases.length > 0 && (
        <div className="overflow-hidden" style={SURFACE}>
          <h3 className="px-4 pt-4 pb-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>
            Stock de Bases Disponible
          </h3>
          <Table>
            <Thead>
              <Tr>
                <Th>Base</Th>
                <Th className="text-right">Kg disponibles</Th>
                <Th className="text-right">Kg original</Th>
                <Th>Fecha elaboración</Th>
                <Th>Operario</Th>
                <Th>Orden origen</Th>
                {isAdmin && <Th></Th>}
              </Tr>
            </Thead>
            <Tbody>
              {stockBases.map(b => {
                const pct = b.kg_original > 0 ? (b.kg_disponible / b.kg_original) * 100 : 100
                return (
                  <Tr key={b.id}>
                    <Td className="font-medium">{b.base_nombre}</Td>
                    <Td className="text-right">
                      <span className="font-bold" style={{ color: pct < 30 ? colors.warning : colors.brand }}>
                        {fmtNum(b.kg_disponible)} kg
                      </span>
                    </Td>
                    <Td className="text-right" style={{ color: colors.textMuted }}>{fmtNum(b.kg_original)} kg</Td>
                    <Td>{b.fecha || '—'}</Td>
                    <Td>{b.operario_nombre || '—'}</Td>
                    <Td>{b.orden_origen || '—'}</Td>
                    {isAdmin && (
                      <Td className="text-right">
                        <button onClick={() => eliminarBaseStock(b)} title="Eliminar del stock"
                          className="p-1 rounded-md hover:opacity-80" style={{ color: colors.danger }}>
                          <Trash2 size={15} />
                        </button>
                      </Td>
                    )}
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[220px]">
          <Input placeholder="Buscar por N° orden, producto u operario..." value={busqueda}
            onChange={e => setBusqueda(e.target.value)} />
        </div>
        <div className="w-40">
          <Input type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
        </div>
        <div className="w-40">
          <Input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} />
        </div>
        <div className="w-48">
          <Select value={ordenarPor} onChange={e => setOrdenarPor(e.target.value)}>
            <option value="fecha">Más recientes primero</option>
            <option value="numero">Ordenar por número</option>
            <option value="estado">Ordenar por estado</option>
            <option value="producto">Ordenar por producto</option>
          </Select>
        </div>
        {(busqueda || filtroFecha || filtroMes || filtroEstado !== 'Todos') && (
          <Button variant="ghost" size="sm" onClick={limpiarFiltros}>Limpiar filtros</Button>
        )}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {['Todos', ...ESTADOS.map(e => e.key)].map(f => (
          <button key={f} onClick={() => setFiltroEstado(f)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all duration-150 border"
            style={{
              backgroundColor: filtroEstado === f ? colors.brand : 'transparent',
              borderColor: filtroEstado === f ? colors.brand : colors.border,
              color: filtroEstado === f ? 'white' : colors.textSecondary,
            }}>
            {f === 'Todos' ? 'Todas' : ESTADOS.find(e => e.key === f)?.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-14"><Spinner size={28} /></div>
      ) : gruposOrdenados.length === 0 ? (
        <EmptyState icon={ClipboardList}
          title={ordenes.length === 0 ? 'Sin órdenes' : 'No se encontraron órdenes'}
          subtitle={ordenes.length === 0 ? 'Creá una orden de producción para comenzar' : 'Probá ajustar los filtros o la búsqueda'} />
      ) : (
        <div className="space-y-3">
          {gruposPagina.map(grupo => (
            <div key={grupo.numero} className="p-4 space-y-3"
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.lg,
                border: `1px solid ${colors.border}`,
                boxShadow: shadow.sm,
              }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-bold" style={{ color: colors.textPrimary }}>{grupo.numero}</p>
                  <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                    {grupo.fecha} · {grupo.operario || 'Sin asignar'} · {grupo.items.length} producto{grupo.items.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => imprimirOrden(grupo)} loading={pdfLoadingGrupo === grupo.numero + '-print'}>
                    <Printer size={12} /> Imprimir
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => exportarPDF(grupo)} loading={pdfLoadingGrupo === grupo.numero + '-pdf'}>
                    <FileDown size={12} /> PDF
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {grupo.items.map(item => {
                  const e = estadoInfo(item.estado)
                  const tieneObjetivo = item.tipo_producto === 'helado' && (item.kg_objetivo || 0) > 0
                  const pct = item.porcentaje_completitud || 0
                  const completada95 = tieneObjetivo && pct >= 95
                  const clickable = tieneObjetivo && item.estado === ESTADO_EN_PROCESO
                  const materiasPrimas = materiasPrimasDe(item)
                  // Completada por peso pero sin kg cargados → pendiente de conciliar.
                  const pendienteKg = tieneObjetivo && item.estado === ESTADO_COMPLETADA && !((item.kg_producido || 0) > 0)
                  const hechoPor = item.estado === ESTADO_COMPLETADA && (item.kg_producido || 0) > 0 ? hechoPorDe(item) : []
                  return (
                    <div key={item.id} className="p-3"
                      style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderLeft: `4px solid ${e.color}` }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap"
                        style={clickable ? { cursor: 'pointer' } : undefined}
                        onClick={clickable ? () => abrirDashboard(item) : undefined}>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm" style={{ color: colors.textPrimary }}>{item.sabor_nombre}</p>
                            <Badge variant="neutral">{item.tipo_producto === 'impulsivo' ? 'Impulsivo/Postre' : 'Helado'}</Badge>
                            <Badge variant={e.variant}>{e.label}</Badge>
                            {completada95 && !pendienteKg && <Badge variant="success">✅ COMPLETADA</Badge>}
                            {pendienteKg && <Badge variant="warning">⏳ Pendiente de kg</Badge>}
                          </div>
                          {item.base_nombre && (
                            <p className="text-xs mt-0.5 font-medium" style={{ color: colors.info }}>
                              Base: {item.base_nombre} · {fmtNum(item.kg_base_consumida)} kg
                            </p>
                          )}
                          {item.observaciones && (
                            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>{item.observaciones}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          {(item.tipo_producto === 'impulsivo' || item.tipo_producto === 'postre') ? (
                            <p className="text-lg font-extrabold" style={{ color: colors.brand }}>{item.cantidad_unidades} u</p>
                          ) : (
                            <>
                              <p className="text-lg font-extrabold" style={{ color: colors.brand }}>{item.litros_total} L</p>
                              <p className="text-xs" style={{ color: colors.textMuted }}>{item.batches} batch{item.batches !== 1 ? 'es' : ''}</p>
                            </>
                          )}
                        </div>
                      </div>
                      {tieneObjetivo && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs" style={{ color: colors.textMuted }}>
                              {fmtNum(item.kg_producido)} kg de {fmtNum(item.kg_objetivo)} kg objetivo
                            </span>
                            <span className="text-xs font-bold" style={{ color: progresoColor(pct, colors) }}>
                              {fmtNum(pct)}%
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: colors.border }}>
                            <div className="h-full rounded-full transition-all" style={{
                              width: `${Math.min(100, pct)}%`,
                              backgroundColor: progresoColor(pct, colors),
                            }} />
                          </div>
                        </div>
                      )}
                      {hechoPor.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: colors.textMuted }}>Hecho por</p>
                          <div className="flex flex-wrap gap-1.5">
                            {hechoPor.map(h => (
                              <span key={h.nombre} className="text-xs px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, color: colors.textSecondary }}>
                                {h.nombre} · <strong style={{ color: colors.textPrimary }}>{fmtNum(h.kg)} kg</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {pendienteKg && (
                        <p className="text-xs mt-2" style={{ color: colors.warning }}>
                          ⏳ Completada sin cargar los kg. Cuando el operario cargue la producción se calculan merma y rendimiento.
                        </p>
                      )}
                      {(item.fecha_inicio || item.fecha_fin) && (
                        <div className="mt-2 space-y-0.5">
                          {item.fecha_inicio && (
                            <p className="text-xs" style={{ color: colors.textMuted }}>
                              ▶ Inicio: <strong style={{ color: colors.textPrimary }}>{fmtDatetime(item.fecha_inicio)}</strong>
                            </p>
                          )}
                          {item.fecha_fin && (
                            <p className="text-xs" style={{ color: colors.textMuted }}>
                              ⏹ Fin: <strong style={{ color: colors.textPrimary }}>{fmtDatetime(item.fecha_fin)}</strong>
                            </p>
                          )}
                          {item.fecha_inicio && item.fecha_fin && (
                            <p className="text-xs flex items-center gap-1" style={{ color: colors.textMuted }}>
                              <Clock size={10} />
                              Duración: <strong style={{ color: colors.textPrimary }}>
                                {formatDuracion((new Date(item.fecha_fin) - new Date(item.fecha_inicio)) / 3600000)}
                              </strong>
                            </p>
                          )}
                        </div>
                      )}
                      {(item.horas_estimadas > 0 || item.horas_reales > 0) && (
                        <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs" style={{ color: colors.textMuted }}>
                            Meta: {fmtNum(item.horas_estimadas)} hs
                            {item.horas_reales > 0 && ` | Real: ${fmtNum(item.horas_reales)} hs`}
                          </span>
                          {item.eficiencia_tiempo > 0 && (
                            <Badge variant={eficienciaVariant(item.eficiencia_tiempo)}>
                              ⏱ Eficiencia: {fmtNum(item.eficiencia_tiempo)}%
                            </Badge>
                          )}
                        </div>
                      )}
                      {(item.estado === 'pendiente' || item.estado === ESTADO_EN_PROCESO) && materiasPrimas.length > 0 && (
                        <div className="mt-2 overflow-hidden" style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md }}>
                          <button
                            onClick={() => setMpExpandido(s => ({ ...s, [item.id]: !s[item.id] }))}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold transition-colors"
                            style={{ color: colors.textPrimary, backgroundColor: colors.bg }}
                          >
                            <span className="flex items-center gap-1.5">
                              <Package size={13} /> Materias Primas
                            </span>
                            {mpExpandido[item.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                          {mpExpandido[item.id] && (
                            <div style={{ borderTop: `1px solid ${colors.border}` }}>
                              <div className="flex justify-end px-2 py-1.5" style={{ borderBottom: `1px solid ${colors.border}` }}>
                                <Button variant="ghost" size="sm" onClick={() => imprimirListaMP(grupo, item)}>
                                  <Printer size={12} /> Imprimir lista MP
                                </Button>
                              </div>
                              <Table>
                                <Thead><Tr><Th>Ingrediente</Th><Th>Necesario</Th><Th>Stock</Th><Th>Estado</Th></Tr></Thead>
                                <Tbody>
                                  {materiasPrimas.map((m, i) => (
                                    <Tr key={i}>
                                      <Td className="font-medium">{m.nombre}</Td>
                                      <Td className="text-right">
                                        <span className="font-semibold">{fmtNum(m.necesario)} {m.unidad}</span>
                                        {m.batches > 0 && <span className="block text-xs" style={{ color: colors.textMuted }}>({fmtNum(m.cantidadPorBatch)} {m.unidad} × {m.batches} batch{m.batches !== 1 ? 'es' : ''})</span>}
                                      </Td>
                                      <Td className="text-right">{m.disponible == null ? '—' : `${fmtNum(m.disponible)} ${m.unidad}`}</Td>
                                      <Td>{m.estado === 'sinlimite' ? '♾️ Sin límite' : m.estado === 'no_vinculado' ? '⚠️ Sin vincular' : m.estado === 'ok' ? '✅ OK' : '❌ INSUFICIENTE'}</Td>
                                    </Tr>
                                  ))}
                                </Tbody>
                              </Table>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2 flex-wrap items-center mt-2">
                        {ESTADOS.filter(es => es.key !== item.estado && es.key !== 'cancelada').map(es => (
                          <Button key={es.key} variant="ghost" size="sm" onClick={() => intentarCambiarEstado(item, es.key)}
                            loading={checkingId === item.id} disabled={checkingId !== null && checkingId !== item.id}
                            className="!border" style={{ borderColor: es.color, color: es.color }}>
                            → {es.label}
                          </Button>
                        ))}
                        {item.estado !== 'cancelada' && (
                          <Button variant="ghost" size="sm" onClick={() => cambiarEstado(item, 'cancelada')}
                            className="!border" style={{ borderColor: colors.border, color: colors.textMuted }}>
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <p className="text-xs" style={{ color: colors.textMuted }}>
              Mostrando {(paginaSegura - 1) * POR_PAGINA + 1}-{Math.min(paginaSegura * POR_PAGINA, gruposOrdenados.length)} de {gruposOrdenados.length} órdenes
            </p>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" disabled={paginaSegura <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>
                Anterior
              </Button>
              <Button variant="ghost" size="sm" disabled={paginaSegura >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>
                Siguiente
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={modal}
        onClose={handleCloseOrden}
        title="Nueva Orden de Producción"
        maxWidth="max-w-lg"
        disableBackdropClose
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseOrden} disabled={saving} className="flex-1">
              Cancelar
            </Button>
            <Button variant="primary" onClick={crearOrden} loading={saving} className="flex-1">
              {saving ? 'Creando…' : `Crear orden (${lineas.length})`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha de producción *" type="date" value={form.fecha_produccion} onChange={e => upd('fecha_produccion', e.target.value)} />
            <Select label="Operario" value={form.operario_id} onChange={e => {
              const o = operarios.find(o => String(o.id) === e.target.value)
              upd('operario_id', e.target.value)
              upd('operario_nombre', o?.nombre || '')
            }}>
              <option value="">— Sin asignar —</option>
              {operarios.map(o => <option key={o.id} value={String(o.id)}>{o.nombre}</option>)}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Observaciones</label>
            <textarea value={form.observaciones} onChange={e => upd('observaciones', e.target.value)}
              rows={2} className={textareaClass} />
          </div>

          <div className="pt-2" style={{ borderTop: `1px solid ${colors.border}` }}>
            <p className="text-sm font-medium text-[#94A3B8] mb-2 mt-3">Agregar producto</p>

            {opcionesActivas.length === 0 ? (
              <p className="text-sm" style={{ color: colors.textMuted }}>
                No hay productos cargados.
              </p>
            ) : (
              <>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {GRUPOS_PRODUCTO.map(g => (
                    <button key={g} type="button" onClick={() => cambiarTabProducto(g)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border"
                      style={{
                        backgroundColor: tabProducto === g ? colors.brand : 'transparent',
                        borderColor: tabProducto === g ? colors.brand : colors.border,
                        color: tabProducto === g ? 'white' : colors.textSecondary,
                      }}>
                      {g}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Select label="Producto" value={lineaSel} onChange={e => { setLineaSel(e.target.value); setLineaCantidad('1') }}>
                      {opcionesDelTab.length === 0 ? (
                        <option value="">— Sin productos —</option>
                      ) : (
                        opcionesDelTab.map(p => <option key={p._key} value={p._key}>{p.nombre}</option>)
                      )}
                    </Select>
                  </div>
                  <div className="w-28">
                    {productoSelEsHelado ? (
                      <Select label="Batches" value={lineaCantidad} onChange={e => setLineaCantidad(e.target.value)}>
                        {BATCH_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                      </Select>
                    ) : (
                      <Input label="Unidades" type="number" min="1" value={lineaCantidad}
                        onChange={e => setLineaCantidad(e.target.value)} />
                    )}
                  </div>
                  <Button variant="secondary" onClick={agregarLinea}>
                    <Plus size={14} /> Agregar
                  </Button>
                </div>
                <div className="w-32 mt-2">
                  <Input label="Horas estimadas *" type="number" min="0.5" step="0.5" placeholder="ej: 4.5"
                    value={lineaHoras} onChange={e => setLineaHoras(e.target.value)} />
                </div>

              </>
            )}

          </div>

          {lineas.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[#94A3B8]">Productos en esta orden</label>
              {lineas.map((l, idx) => (
                <div key={idx} className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: colors.bg, borderRadius: radius.md }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>{l.producto_nombre}</p>
                    <p className="text-xs" style={{ color: colors.textMuted }}>
                      {l.tipo === 'helado'
                        ? `${l.cantidad} batch${l.cantidad !== 1 ? 'es' : ''} · ${l.litros} L`
                        : `${l.cantidad} unidad${l.cantidad !== 1 ? 'es' : ''}`}
                    </p>
                    {l.tipo === 'helado' && (
                      <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                        Objetivo estimado: {fmtNum(l.kg_objetivo)} kg ({fmtNum(l.litros_base)}L base + {fmtNum(l.extra_kg)} kg agregados)
                      </p>
                    )}
                    {l.base_nombre && (
                      <p className="text-xs mt-0.5 font-medium" style={{ color: colors.info }}>
                        Base: {l.base_nombre} · {fmtNum(l.kg_base_consumida)} kg
                      </p>
                    )}
                    {l.horas_estimadas > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                        Tiempo estimado: {fmtNum(l.horas_estimadas)} h
                      </p>
                    )}
                  </div>
                  <button onClick={() => quitarLinea(idx)} className="w-7 h-7 flex items-center justify-center rounded-full transition-colors hover:bg-slate-200" style={{ color: colors.textMuted }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {basesNecesarias.length > 0 && (
            <div className="pt-3" style={{ borderTop: `1px solid ${colors.border}` }}>
              <p className="text-sm font-semibold mb-2" style={{ color: colors.textPrimary }}>Bases necesarias para esta orden</p>
              <div className="overflow-hidden" style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md }}>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Base</Th>
                      <Th className="text-right">Litros</Th>
                      <Th className="text-right">Batches</Th>
                      <Th>Stock disponible</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {basesNecesarias.map((b, i) => {
                      const kgDisponible = stockBases
                        .filter(s => (s.base_nombre || '').toLowerCase() === b.base.toLowerCase())
                        .reduce((sum, s) => sum + (s.kg_disponible || 0), 0)
                      const hayStock = kgDisponible >= b.litros
                      return (
                        <Tr key={i}>
                          <Td className="font-medium">{b.base}</Td>
                          <Td className="text-right">{fmtNum(b.litros)} L</Td>
                          <Td className="text-right">{b.batches} batch{b.batches !== 1 ? 'es' : ''}</Td>
                          <Td>
                            {kgDisponible > 0
                              ? <span style={{ color: hayStock ? colors.success : colors.warning }}>
                                  {hayStock ? '✅' : '⚠️'} {fmtNum(kgDisponible)} kg disponibles
                                </span>
                              : <span style={{ color: colors.textMuted }}>— Sin stock cargado</span>
                            }
                          </Td>
                        </Tr>
                      )
                    })}
                  </Tbody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!stockAlertCrear}
        onClose={() => setStockAlertCrear(null)}
        title="Stock insuficiente para esta orden"
        maxWidth="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStockAlertCrear(null)} className="flex-1">Cancelar</Button>
            <Button variant="primary" onClick={crearIgualConFaltantes} loading={saving} className="flex-1">
              Crear igual (con faltantes)
            </Button>
          </>
        }
      >
        {stockAlertCrear && (
          <div className="space-y-2">
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Algunos insumos no alcanzan para cubrir esta orden completa:
            </p>
            <Table>
              <Thead><Tr><Th>Ingrediente</Th><Th>Necesario</Th><Th>En stock</Th><Th>Diferencia</Th></Tr></Thead>
              <Tbody>
                {stockAlertCrear.items.map((it, i) => (
                  <Tr key={i}>
                    <Td className="font-medium">
                      {it.estado === 'ok' ? '✅' : it.estado === 'critico' ? '❌' : '⚠️'} {it.nombre}
                    </Td>
                    <Td className="text-right">{fmtNum(it.necesario)} {it.unidad}</Td>
                    <Td className="text-right">{fmtNum(it.disponible)} {it.unidad}</Td>
                    <Td className="text-right font-semibold" style={{ color: it.estado === 'ok' ? colors.success : colors.danger }}>
                      {it.estado === 'ok' ? 'OK' : `${fmtNum(it.diferencia)} ${it.unidad}`}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        )}
      </Modal>

      <Modal
        open={!!stockAlertAgregar}
        onClose={() => setStockAlertAgregar(null)}
        title="Stock insuficiente para este producto"
        maxWidth="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStockAlertAgregar(null)} className="flex-1">Cancelar</Button>
            <Button variant="primary" onClick={agregarLineaConFaltantes} className="flex-1">
              Agregar igual
            </Button>
          </>
        }
      >
        {stockAlertAgregar && (
          <div className="space-y-2">
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Algunos insumos no alcanzan para cubrir <strong>{stockAlertAgregar.linea?.producto_nombre}</strong>:
            </p>
            <Table>
              <Thead><Tr><Th>Ingrediente</Th><Th>Necesario</Th><Th>En stock</Th><Th>Estado</Th></Tr></Thead>
              <Tbody>
                {stockAlertAgregar.items.map((it, i) => (
                  <Tr key={i}>
                    <Td className="font-medium">{it.nombre}</Td>
                    <Td className="text-right">{fmtNum(it.necesario)} {it.unidad}</Td>
                    <Td className="text-right">{fmtNum(it.disponible)} {it.unidad}</Td>
                    <Td className="text-right font-semibold" style={{ color: it.estado === 'ok' ? colors.success : colors.danger }}>
                      {it.estado === 'ok' ? '✅ OK' : '❌ Falta'}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        )}
      </Modal>

      <Modal
        open={!!modalInicio}
        onClose={() => setModalInicio(null)}
        title="Registrar inicio de producción"
        maxWidth="max-w-sm"
        disableBackdropClose
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalInicio(null)} disabled={savingHora} className="flex-1">Cancelar</Button>
            <Button variant="primary" onClick={confirmarInicioConFecha} loading={savingHora} className="flex-1">Confirmar inicio</Button>
          </>
        }
      >
        {modalInicio && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Producto: <strong style={{ color: colors.textPrimary }}>{modalInicio.orden.sabor_nombre}</strong>
            </p>
            <Input
              label="Fecha y hora de inicio"
              type="datetime-local"
              value={fechaInicioVal}
              onChange={e => setFechaInicioVal(e.target.value)}
            />
          </div>
        )}
      </Modal>

      <Modal
        open={!!modalFin}
        onClose={() => setModalFin(null)}
        title="Registrar finalización de producción"
        maxWidth="max-w-sm"
        disableBackdropClose
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalFin(null)} disabled={savingHora} className="flex-1">Cancelar</Button>
            <Button variant="danger" onClick={confirmarFinConFecha} loading={savingHora} className="flex-1">Confirmar finalización</Button>
          </>
        }
      >
        {modalFin && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Producto: <strong style={{ color: colors.textPrimary }}>{modalFin.orden.sabor_nombre}</strong>
            </p>
            <Input
              label="Fecha y hora de finalización"
              type="datetime-local"
              value={fechaFinVal}
              onChange={e => setFechaFinVal(e.target.value)}
            />
            {modalFin.orden.fecha_inicio && (
              <p className="text-xs" style={{ color: colors.textMuted }}>
                Inicio registrado: {fmtDatetime(modalFin.orden.fecha_inicio)}
              </p>
            )}

            {(() => {
              const info = baseDeSabor(modalFin.orden)
              if (info?.sinBaseEnReceta) return (
                <div className="px-3 py-2.5 text-xs" style={{ backgroundColor: colors.warningBg, border: `1px solid ${colors.warning}55`, borderRadius: radius.md, color: colors.warning }}>
                  ⚠️ Este sabor no tiene una base vinculada en la receta. Vinculale una base en <strong>Recetas</strong> para que el sistema pueda controlar el consumo de base.
                </div>
              )
              if (!info || !info.baseNombre || !info.falta) return null
              return (
                <div className="px-3 py-3 space-y-2.5" style={{ backgroundColor: colors.dangerBg, border: `1px solid ${colors.danger}55`, borderRadius: radius.md }}>
                  <p className="text-xs font-semibold" style={{ color: colors.danger }}>
                    No se puede cerrar sin registrar la base usada.
                  </p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Este sabor usa <strong style={{ color: colors.textPrimary }}>{info.baseNombre}</strong> (~{fmtNum(info.necesaria)} kg) y no figura en stock. Registrá la base que se elaboró para poder cerrar — queda como consumo, con su fecha real.
                  </p>
                  <Input label="Kg de base usados" type="number" value={baseAlta.cantidad}
                    onChange={e => setBaseAlta(s => ({ ...s, cantidad: e.target.value }))} />
                  <Input label="Fecha en que se hizo la base" type="datetime-local" value={baseAlta.fecha}
                    onChange={e => setBaseAlta(s => ({ ...s, fecha: e.target.value }))} />
                  <Select label="Operario que la hizo" value={baseAlta.operario}
                    onChange={e => setBaseAlta(s => ({ ...s, operario: e.target.value }))}>
                    <option value="">— Seleccionar —</option>
                    {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
                  </Select>
                  {baseAlta.fecha && baseAlta.fecha.slice(0, 10) < new Date().toISOString().slice(0, 10) && (
                    <p className="text-[11px]" style={{ color: colors.textMuted }}>
                      Se marcará como <strong>retroactiva</strong> (su tiempo no se computa en eficiencia).
                    </p>
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </Modal>

      <Modal
        open={!!stockAlert}
        onClose={() => setStockAlert(null)}
        title={stockAlert?.ok ? 'Confirmar inicio de producción' : 'Stock insuficiente en depósito'}
        maxWidth="max-w-md"
        footer={
          stockAlert?.ok ? (
            <>
              <Button variant="secondary" onClick={() => setStockAlert(null)} className="flex-1">Cancelar</Button>
              <Button variant="primary" onClick={confirmarInicio} className="flex-1">Iniciar producción</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => navigate('/deposito')} className="flex-1">
                <Warehouse size={14} /> Ver depósito
              </Button>
              <Button variant="primary" onClick={() => setStockAlert(null)} className="flex-1">Entendido</Button>
            </>
          )
        }
      >
        {stockAlert && (
          stockAlert.ok ? (
            <div className="flex items-start gap-2.5 px-3 py-3" style={{ backgroundColor: colors.successBg, border: `1px solid ${colors.success}40`, borderRadius: radius.md }}>
              <CheckCircle2 size={18} style={{ color: colors.success }} className="flex-shrink-0 mt-0.5" />
              <p className="text-sm" style={{ color: colors.textPrimary }}>
                Hay stock suficiente de todos los ingredientes para <strong>{stockAlert.orden.sabor_nombre}</strong>. ¿Confirmás el inicio de la producción?
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                No se puede iniciar <strong>{stockAlert.orden.sabor_nombre}</strong>: faltan los siguientes insumos en depósito.
              </p>
              <div className="space-y-1.5">
                {stockAlert.items.map((it, i) => (
                  <div key={i} className="text-sm px-3 py-2" style={{ backgroundColor: it.severo ? colors.dangerBg : colors.warningBg, borderRadius: radius.md, color: it.severo ? colors.danger : colors.warning }}>
                    {it.severo ? '❌' : '⚠️'} {it.nombre}: necesitás {fmtNum(it.requerido)} {it.unidad}, tenés {fmtNum(it.disponible)} {it.unidad} (faltan {fmtNum(it.faltan)} {it.unidad})
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </Modal>

      <Modal
        open={!!ordenDetalle}
        onClose={() => setOrdenDetalle(null)}
        title={ordenDetalle ? `${ordenDetalle.sabor_nombre} · ${ordenDetalle.numero}` : ''}
        maxWidth="max-w-lg"
        footer={ordenDetalle && (
          <>
            <Button variant="secondary" onClick={() => setOrdenDetalle(null)} className="flex-1">Cerrar</Button>
            <Button variant="primary" onClick={finalizarManual} loading={finalizando} className="flex-1">
              Finalizar orden manualmente
            </Button>
          </>
        )}
      >
        {ordenDetalle && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: colors.textMuted }}>
              Operario: <span style={{ color: colors.textPrimary }}>{ordenDetalle.operario_nombre || '—'}</span>
            </p>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                  {fmtNum(ordenDetalle.kg_producido)} kg / {fmtNum(ordenDetalle.kg_objetivo)} kg
                </span>
                <span className="text-lg font-bold" style={{ color: progresoColor(ordenDetalle.porcentaje_completitud, colors) }}>
                  {fmtNum(ordenDetalle.porcentaje_completitud)}%
                </span>
              </div>
              <div className="w-full h-4 rounded-full overflow-hidden" style={{ backgroundColor: colors.border }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: `${Math.min(100, ordenDetalle.porcentaje_completitud || 0)}%`,
                  backgroundColor: progresoColor(ordenDetalle.porcentaje_completitud, colors),
                }} />
              </div>
            </div>

            {(ordenDetalle.fecha_inicio || ordenDetalle.fecha_fin) && (
              <div className="space-y-0.5">
                {ordenDetalle.fecha_inicio && (
                  <p className="text-sm" style={{ color: colors.textMuted }}>
                    ▶ Inicio: <strong style={{ color: colors.textPrimary }}>{fmtDatetime(ordenDetalle.fecha_inicio)}</strong>
                  </p>
                )}
                {ordenDetalle.fecha_fin && (
                  <p className="text-sm" style={{ color: colors.textMuted }}>
                    ⏹ Fin: <strong style={{ color: colors.textPrimary }}>{fmtDatetime(ordenDetalle.fecha_fin)}</strong>
                  </p>
                )}
                {ordenDetalle.fecha_inicio && ordenDetalle.fecha_fin && (
                  <p className="text-sm flex items-center gap-1.5" style={{ color: colors.textMuted }}>
                    <Clock size={13} />
                    Duración: <strong style={{ color: colors.textPrimary }}>
                      {formatDuracion((new Date(ordenDetalle.fecha_fin) - new Date(ordenDetalle.fecha_inicio)) / 3600000)}
                    </strong>
                  </p>
                )}
                {(ordenDetalle.horas_estimadas > 0 || ordenDetalle.horas_reales > 0) && (
                  <p className="text-sm" style={{ color: colors.textMuted }}>
                    Meta: <strong>{fmtNum(ordenDetalle.horas_estimadas)} hs</strong>
                    {ordenDetalle.horas_reales > 0 && <> | Real: <strong>{fmtNum(ordenDetalle.horas_reales)} hs</strong></>}
                    {ordenDetalle.eficiencia_tiempo > 0 && <> | Eficiencia: <strong>{fmtNum(ordenDetalle.eficiencia_tiempo)}%</strong></>}
                  </p>
                )}
              </div>
            )}

            {usaEtapas(ordenDetalle.tipo_producto) && (
              <div>
                <p className="text-sm font-semibold mb-2" style={{ color: colors.textPrimary }}>Etapas de proceso</p>
                <EtapasOrden orden={ordenDetalle} operarios={operarios} />
              </div>
            )}

            {materiasPrimasDe(ordenDetalle).length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Materias Primas Necesarias</p>
                  <Button variant="ghost" size="sm" onClick={() => {
                    const grupo = grupos.find(g => g.numero === ordenDetalle.numero) || { numero: ordenDetalle.numero, fecha: ordenDetalle.fecha_produccion, operario: ordenDetalle.operario_nombre }
                    imprimirListaMP(grupo, ordenDetalle)
                  }}>
                    <Printer size={12} /> Imprimir lista MP
                  </Button>
                </div>
                <div className="overflow-hidden" style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md }}>
                  <Table>
                    <Thead><Tr><Th>Ingrediente</Th><Th>Necesario</Th><Th>Unidad</Th><Th>Stock</Th><Th>Estado</Th></Tr></Thead>
                    <Tbody>
                      {materiasPrimasDe(ordenDetalle).map((m, i) => (
                        <Tr key={i}>
                          <Td className="font-medium">{m.nombre}</Td>
                          <Td className="text-right">
                            <span className="font-semibold">{fmtNum(m.necesario)}</span>
                            {m.batches > 0 && <span className="block text-xs" style={{ color: colors.textMuted }}>({fmtNum(m.cantidadPorBatch)} × {m.batches} btch)</span>}
                          </Td>
                          <Td>{m.unidad}</Td>
                          <Td className="text-right">{m.disponible == null ? '—' : `${fmtNum(m.disponible)} ${m.unidad}`}</Td>
                          <Td>{m.estado === 'sinlimite' ? '♾️ Sin límite' : m.estado === 'no_vinculado' ? '⚠️ Sin vincular' : m.estado === 'ok' ? '✅ OK' : '❌ INSUFICIENTE'}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              </div>
            )}

            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: colors.textPrimary }}>Últimos registros de producción</p>
              {cargandoDetalle ? (
                <div className="flex justify-center py-6"><Spinner size={20} /></div>
              ) : detalleRegistros.length === 0 ? (
                <p className="text-sm" style={{ color: colors.textMuted }}>Todavía no hay registros vinculados a esta orden.</p>
              ) : (
                <div className="overflow-hidden max-h-64 overflow-y-auto" style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md }}>
                  <Table>
                    <Thead>
                      <Tr><Th>Hora</Th><Th>Operario</Th><Th>Kg</Th></Tr>
                    </Thead>
                    <Tbody>
                      {detalleRegistros.map(r => (
                        <Tr key={r.id}>
                          <Td>{new Date(r.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</Td>
                          <Td>{r.operario_nombre || '—'}</Td>
                          <Td className="text-right font-semibold" style={{ color: colors.brand }}>{fmtNum(r.peso_kg)} kg</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal Proyección de Producción ── */}
      <Modal
        open={modalProyeccion}
        onClose={() => setModalProyeccion(false)}
        title="Proyección de producción — Stock actual"
        maxWidth="max-w-5xl"
        footer={
          <Button variant="secondary" onClick={() => setModalProyeccion(false)} className="w-full sm:w-auto">
            Cerrar
          </Button>
        }
      >
        {loadingProyeccion ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Spinner size={28} />
            <p className="text-sm" style={{ color: colors.textMuted }}>Calculando proyección de producción…</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Subtítulo */}
            <p className="text-xs" style={{ color: colors.textMuted }}>
              Basado en el stock de depósito al {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>

            {/* KPIs resumen */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Bases producibles', kpi: kpisProyeccion.bases, color: colors.brand },
                { label: 'Sabores producibles', kpi: kpisProyeccion.sabores, color: colors.info },
                { label: 'Impulsivos producibles', kpi: kpisProyeccion.impulsivos, color: colors.warning },
                { label: 'Postres producibles', kpi: kpisProyeccion.postres, color: colors.success },
              ].map(({ label, kpi, color }) => (
                <div key={label} className="p-3 rounded-xl text-center" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}>
                  <p className="text-xs mb-1" style={{ color: colors.textMuted }}>{label}</p>
                  <p className="text-2xl font-bold" style={{ color }}>{kpi[0]}</p>
                  <p className="text-[10px]" style={{ color: colors.textMuted }}>de {kpi[1]} total</p>
                </div>
              ))}
            </div>

            {/* Tabs + filtro */}
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex gap-1.5 flex-wrap">
                {['BASES', 'SABORES', 'IMPULSIVOS', 'POSTRES'].map(tab => (
                  <button key={tab} onClick={() => setTabProyeccion(tab)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all border"
                    style={{
                      backgroundColor: tabProyeccion === tab ? colors.brand : 'transparent',
                      borderColor: tabProyeccion === tab ? colors.brand : colors.border,
                      color: tabProyeccion === tab ? 'white' : colors.textSecondary,
                    }}>
                    {tab}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                {[{ key: 'todos', label: 'Todos' }, { key: 'posibles', label: 'Solo posibles' }].map(f => (
                  <button key={f.key} onClick={() => setFiltroProyeccion(f.key)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all border"
                    style={{
                      backgroundColor: filtroProyeccion === f.key ? colors.brand : 'transparent',
                      borderColor: filtroProyeccion === f.key ? colors.brand : colors.border,
                      color: filtroProyeccion === f.key ? 'white' : colors.textSecondary,
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cards de productos */}
            {datosTabProyeccion.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm" style={{ color: colors.textMuted }}>
                  {filtroProyeccion === 'posibles' ? 'Ningún producto se puede producir con el stock actual.' : 'Sin productos en esta categoría.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[55vh] overflow-y-auto pr-1">
                {datosTabProyeccion.map((item, idx) => {
                  const esHelado = item.tipo === 'base' || item.tipo === 'sabor'
                  const colorValor = item.batchesPosibles === 0 ? colors.danger : item.batchesPosibles >= 2 ? colors.success : colors.warning
                  const borderColor = item.batchesPosibles === 0 ? `${colors.danger}30` : item.batchesPosibles >= 2 ? `${colors.success}30` : `${colors.warning}30`
                  const bgColor = item.batchesPosibles === 0 ? 'rgba(239,68,68,0.05)' : item.batchesPosibles >= 2 ? 'rgba(34,197,94,0.05)' : 'rgba(245,158,11,0.05)'
                  return (
                    <div key={idx} className="rounded-xl p-4 space-y-3 flex flex-col" style={{ border: `1px solid ${borderColor}`, backgroundColor: bgColor }}>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold leading-tight" style={{ color: colors.textPrimary }}>{item.nombre}</h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
                          style={{ backgroundColor: `${colorValor}20`, color: colorValor }}>
                          {item.batchesPosibles === 0 ? '🔴 0' : item.batchesPosibles >= 2 ? `🟢 ${item.batchesPosibles}` : `🟡 ${item.batchesPosibles}`}
                        </span>
                      </div>

                      <div>
                        <span className="text-3xl font-extrabold" style={{ color: colorValor }}>
                          {item.batchesPosibles}
                        </span>
                        <span className="text-xs ml-1.5" style={{ color: colors.textMuted }}>
                          {esHelado ? 'batches posibles' : 'unidades posibles'}
                        </span>
                      </div>

                      {item.kgResultante != null && item.kgResultante > 0 && (
                        <p className="text-xs font-semibold" style={{ color: colors.brand }}>
                          ≈ {item.kgResultante.toFixed(0)} kg de helado resultante
                        </p>
                      )}

                      {item.ingredienteLimitante ? (
                        <div className="flex items-start gap-1.5 p-2 rounded-lg" style={{ backgroundColor: `${colors.danger}10`, border: `1px solid ${colors.danger}20` }}>
                          <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" style={{ color: colors.danger }} />
                          <p className="text-[10px] leading-relaxed" style={{ color: colors.danger }}>
                            <span className="font-semibold">Limitado por:</span> {item.ingredienteLimitante.nombre}
                            {' '}(quedan {Number(item.ingredienteLimitante.stockActual).toFixed(1)} {item.ingredienteLimitante.unidad},
                            necesitás {Number(item.ingredienteLimitante.necesita).toFixed(1)} {item.ingredienteLimitante.unidad}/batch)
                          </p>
                        </div>
                      ) : item.batchesPosibles === 0 ? (
                        <p className="text-[10px]" style={{ color: colors.textMuted }}>Sin ingredientes registrados</p>
                      ) : null}

                      <Button variant="secondary" size="sm" onClick={() => abrirNuevaOrdenConProducto(item)}
                        className="mt-auto w-full">
                        <Plus size={12} /> Crear orden
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
