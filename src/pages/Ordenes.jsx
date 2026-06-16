import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Badge from '../components/ui/Badge'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import { finalizarOrdenManual, progresoColor, ESTADO_EN_PROCESO, ESTADO_COMPLETADA } from '../lib/ordenes'
import { POSTRES } from '../lib/postres'
import { ClipboardList, Plus, Printer, FileDown, AlertTriangle, CheckCircle2, Warehouse, X, ChevronDown, ChevronUp, Package, Clock } from 'lucide-react'
const logoUrl = '/logo_delparque.png'

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

const SURFACE = { backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }

const textareaClass = 'w-full rounded-lg border border-[#d1d5db] text-sm text-[#111827] placeholder:text-[#9ca3af] bg-white outline-none transition-colors duration-150 px-3 py-2 resize-none focus:ring-2 focus:ring-[#D4521A]/30 focus:border-[#D4521A]'

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
  const n = (nombre || '').trim().toLowerCase()
  const sabor = ctx.sabores.find(s => (s.nombre || '').trim().toLowerCase() === n)
  if (sabor) {
    return {
      tipo: 'sabor',
      id: sabor.id,
      litrosBase: sabor.litros_base || LITROS_BATCH,
      ingredientes: ctx.saborIngredientes.filter(i => i.sabor_id === sabor.id),
    }
  }
  const base = ctx.bases.find(b => (b.nombre || '').trim().toLowerCase() === n)
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
  if (item.tipo_producto !== 'helado') return []
  const receta = resolverRecetaCtx(item.sabor_nombre, ctx)
  if (!receta) return []
  const insumoPorNombre = {}
  ctx.insumosStock.forEach(i => { insumoPorNombre[(i.nombre || '').trim().toLowerCase()] = i })
  return receta.ingredientes.map(ing => {
    const necesario = (ing.cantidad || 0) * (item.batches || 0)
    if ((ing.insumo_nombre || '').toLowerCase().includes('agua')) {
      return { nombre: ing.insumo_nombre, necesario, unidad: ing.unidad, disponible: null, estado: 'sinlimite' }
    }
    const insumo = insumoPorNombre[(ing.insumo_nombre || '').trim().toLowerCase()]
    if (!insumo) return { nombre: ing.insumo_nombre, necesario, unidad: ing.unidad, disponible: null, estado: 'sinlimite' }
    const disponible = insumo.stock_actual || 0
    return { nombre: ing.insumo_nombre, necesario, unidad: ing.unidad, disponible, estado: disponible >= necesario ? 'ok' : 'insuficiente' }
  })
}

export default function Ordenes() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [ordenes, setOrdenes]         = useState([])
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
    ] = await Promise.all([
      supabase.from('ordenes_produccion').select('*').order('id', { ascending: false }).limit(300),
      supabase.from('stock_camaras').select('id,nombre,tipo,baldes').order('nombre'),
      supabase.from('impulsivos').select('id,nombre').order('nombre'),
      supabase.from('operarios').select('*').order('nombre'),
      supabase.from('sabores').select('id,nombre,litros_base').order('nombre'),
      supabase.from('sabor_ingredientes').select('*'),
      supabase.from('insumos').select('nombre,stock_actual,unidad'),
      supabase.from('bases').select('id,nombre,litros_batch').order('nombre'),
      supabase.from('base_ingredientes').select('*'),
      supabase.from('stock_bases').select('*').gt('kg_disponible', 0).order('fecha', { ascending: false }),
    ])
    setOrdenes(ord || [])
    setSaboresCamara(sab || [])
    setImpulsivos(imp || [])
    setOperarios(ops || [])
    setSabores(recetas || [])
    setSaborIngredientes(ingredientes || [])
    setInsumosStock(insumosData || [])
    setBases(basesData || [])
    setBaseIngredientes(baseIngs || [])
    setStockBases(stockBasesData || [])

    const opciones = [
      ...(basesData || []).map(b => ({ _key: `base-${b.id}`, _grupo: 'BASES' })),
      ...(sab || []).map(s => ({ _key: `sabor-${s.id}`, _grupo: 'SABORES' })),
      ...(imp || []).map(p => ({ _key: `imp-${p.id}`, _grupo: 'IMPULSIVOS' })),
      ...POSTRES.map((p, idx) => ({ _key: `postre-${idx}`, _grupo: 'POSTRES' })),
    ]
    const primero = GRUPOS_PRODUCTO.map(g => opciones.find(o => o._grupo === g)).find(Boolean)
    if (primero) { setTabProducto(primero._grupo); setLineaSel(primero._key) }

    if (ops && ops.length > 0) setForm(f => ({ ...f, operario_id: String(ops[0].id), operario_nombre: ops[0].nombre }))
    setLoading(false)
  }

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function upd(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const opcionesActivas = [
    ...bases.map(b => ({ ...b, _key: `base-${b.id}`, _tipo: 'base', _grupo: 'BASES' })),
    ...saboresCamara.map(s => ({ ...s, _key: `sabor-${s.id}`, _tipo: 'sabor', _grupo: 'SABORES' })),
    ...impulsivos.map(p => ({ ...p, _key: `imp-${p.id}`, _tipo: 'impulsivo', _grupo: 'IMPULSIVOS' })),
    ...POSTRES.map((p, idx) => ({ ...p, _key: `postre-${idx}`, _tipo: 'postre', _grupo: 'POSTRES', id: null })),
  ]
  const opcionesDelTab = opcionesActivas.filter(p => p._grupo === tabProducto)
  const productoSel = opcionesActivas.find(p => p._key === lineaSel)
  const productoSelEsHelado = productoSel?._tipo === 'sabor' || productoSel?._tipo === 'base'
  const stockActualSel = productoSel?._tipo === 'sabor' ? (productoSel.baldes || 0) : null
  const faltaStockSel  = productoSel?._tipo === 'sabor' && stockActualSel < 2

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
    if (productoSelEsHelado) {
      const cantidad = parseFloat(lineaCantidad || '1')
      if (!(cantidad > 0)) { toast2('La cantidad debe ser mayor a 0', 'error'); return }
      const { kgObjetivo, litrosBase, extraKg } = calcularKgObjetivo(productoSel.nombre, cantidad)
      const baseNombre = tabProducto === 'SABORES' && baseSel
        ? (stockBases.find(b => String(b.id) === baseSel)?.base_nombre || null)
        : null
      const kgBaseUsado = baseNombre ? (parseFloat(kgBaseAUsar) || litrosBase * cantidad) : 0
      const linea = {
        tipo: 'helado', producto_id: productoSel.id, producto_nombre: productoSel.nombre,
        cantidad, litros: cantidad * LITROS_BATCH,
        kg_objetivo: kgObjetivo, litros_base: litrosBase, extra_kg: extraKg,
        horas_estimadas: horasEstimadas,
        base_nombre: baseNombre,
        kg_base_consumida: kgBaseUsado,
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
        tipo: 'impulsivo', producto_id: productoSel.id, producto_nombre: productoSel.nombre,
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
        const key = (ing.insumo_nombre || '').trim().toLowerCase()
        if (!key) return
        if (!map[key]) map[key] = { nombre: ing.insumo_nombre, cantidad: 0, unidad: ing.unidad }
        map[key].cantidad += (ing.cantidad || 0) * l.cantidad
      })
    })
    return Object.values(map)
  }

  function compararConStock(requeridos) {
    const insumoPorNombre = {}
    insumosStock.forEach(i => { insumoPorNombre[(i.nombre || '').trim().toLowerCase()] = i })
    return requeridos.map(r => {
      if ((r.nombre || '').toLowerCase().includes('agua')) {
        return { nombre: r.nombre, necesario: r.cantidad, unidad: r.unidad, disponible: Infinity, diferencia: Infinity, estado: 'ok' }
      }
      const insumo = insumoPorNombre[r.nombre.trim().toLowerCase()]
      const disponible = insumo ? (insumo.stock_actual || 0) : 0
      const diferencia = disponible - r.cantidad
      const severo = r.cantidad > 0 && (r.cantidad - disponible) / r.cantidad >= 0.5
      const estado = diferencia >= 0 ? 'ok' : (severo ? 'critico' : 'bajo')
      return { nombre: r.nombre, necesario: r.cantidad, unidad: r.unidad, disponible, diferencia, estado }
    })
  }

  function materiasPrimasDe(item) {
    return computeMateriasPrimas(item, { sabores, bases, saborIngredientes, baseIngredientes, insumosStock })
  }

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
      cantidad_unidades: l.tipo === 'impulsivo' ? l.cantidad : null,
      kg_objetivo: l.tipo === 'helado' ? l.kg_objetivo : 0,
      kg_producido: 0,
      porcentaje_completitud: 0,
      horas_estimadas: l.horas_estimadas || 0,
      operario_id: form.operario_id ? parseInt(form.operario_id, 10) : null,
      operario_nombre: form.operario_nombre || null,
      estado: 'pendiente',
      fecha_produccion: form.fecha_produccion,
      observaciones: form.observaciones || null,
      base_nombre: l.base_nombre || null,
      kg_base_consumida: l.kg_base_consumida || 0,
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

  async function cambiarEstado(item, estado) {
    if (estado === ESTADO_COMPLETADA) {
      const { error, mermaError } = await finalizarOrdenManual(item)
      if (error) { toast2(error.message, 'error'); return }
      if (mermaError) {
        toast2(`Orden finalizada, pero hubo un error al registrar la merma: ${mermaError.message}`, 'error')
      }
      const esBase = await manejarCompletadaBase(item)
      if (!esBase) {
        await manejarCompletadaSabor(item)
        if (!mermaError) toast2('Estado actualizado')
      }
      cargar()
      return
    }
    const update = { estado }
    if (estado === 'en_proceso') update.fecha_inicio = new Date().toISOString()
    const { error } = await supabase.from('ordenes_produccion').update(update).eq('id', item.id)
    if (error) { toast2(error.message, 'error'); return }
    setOrdenes(prev => prev.map(o => o.id === item.id ? { ...o, ...update } : o))
    toast2('Estado actualizado')
  }

  async function intentarCambiarEstado(item, estado) {
    if (estado !== 'en_proceso') {
      cambiarEstado(item, estado)
      return
    }
    setCheckingId(item.id)

    let ings = []
    if (item.tipo_producto === 'impulsivo') {
      const { data } = await supabase.from('impulsivo_ingredientes').select('*').eq('impulsivo_id', item.sabor_id)
      ings = (data || []).map(i => ({ ...i, factor: item.cantidad_unidades || 1 }))
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
    ;(insumos || []).forEach(i => { insumoPorNombre[i.nombre.trim().toLowerCase()] = i })

    const faltantes = []
    for (const ing of ings) {
      if ((ing.insumo_nombre || '').toLowerCase().includes('agua')) continue
      const requerido = (ing.cantidad || 0) * ing.factor
      const insumo = insumoPorNombre[(ing.insumo_nombre || '').trim().toLowerCase()]
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
    cambiarEstado(stockAlert.orden, 'en_proceso')
    setStockAlert(null)
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

  async function finalizarManual() {
    if (!ordenDetalle) return
    setFinalizando(true)
    const { error, pct, mermaError } = await finalizarOrdenManual(ordenDetalle)
    setFinalizando(false)
    if (error) { toast2(error.message, 'error'); return }
    if (mermaError) {
      toast2(`Orden finalizada, pero hubo un error al registrar la merma: ${mermaError.message}`, 'error')
    }
    const esBase = await manejarCompletadaBase(ordenDetalle)
    if (!esBase) {
      await manejarCompletadaSabor(ordenDetalle)
      if (!mermaError) toast2(`Orden ${ordenDetalle.numero} finalizada manualmente (${fmtNum(pct)}%)`)
    }
    setOrdenDetalle(null)
    cargar()
  }

  async function manejarCompletadaBase(item) {
    const receta = resolverReceta(item.sabor_nombre)
    if (receta?.tipo !== 'base') return false
    const litrosBase = receta.litrosBase || LITROS_BATCH
    const kgProducidos = (item.batches || 0) * litrosBase
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
      toast2(`Base ${item.sabor_nombre} lista: ${kgProducidos.toFixed(1)} kg disponibles para elaborar sabores`)
    }
    return true
  }

  async function manejarCompletadaSabor(item) {
    if (!item.base_nombre || !((item.kg_base_consumida || 0) > 0)) return
    const { data: rows } = await supabase.from('stock_bases')
      .select('*').eq('base_nombre', item.base_nombre).gt('kg_disponible', 0)
      .order('fecha', { ascending: false }).limit(1)
    if (rows && rows.length > 0) {
      const row = rows[0]
      const nuevosKg = Math.max(0, row.kg_disponible - (item.kg_base_consumida || 0))
      await supabase.from('stock_bases').update({ kg_disponible: nuevosKg }).eq('id', row.id)
      if (nuevosKg === 0) {
        toast2(`Base ${item.base_nombre} agotada`)
      }
    }
    const kgBase = item.kg_base_consumida || 0
    const kgSabor = item.kg_producido || 0
    const diferencia = kgBase - kgSabor
    if (diferencia > 0) {
      const hoy = new Date().toISOString().split('T')[0]
      await supabase.from('mermas').insert({
        fecha: hoy,
        sabor_nombre: item.sabor_nombre,
        operario_nombre: item.operario_nombre,
        kg_teoricos: kgBase,
        kg_reales: kgSabor,
        diferencia,
        porcentaje: (diferencia / kgBase) * 100,
        causa: 'Elaboración de sabores',
        observaciones: `Orden ${item.numero} · Base: ${item.base_nombre}`,
      })
    }
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

  const kpiPendientes  = ordenes.filter(o => o.estado === 'pendiente').length
  const kpiEnProceso   = ordenes.filter(o => o.estado === 'en_proceso').length
  const kpiCompletadas = ordenes.filter(o => o.estado === 'completada').length

  async function imprimirOrden(grupo) {
    const w = window.open('', '_blank')
    if (!w) { toast2('Popups bloqueados — habilitá popups para imprimir', 'error'); return }
    w.document.write('<html><body><p style="font-family:sans-serif;padding:24px;color:#6b7280">Preparando impresión…</p></body></html>')
    setPdfLoadingGrupo(grupo.numero + '-print')

    let ctx = { sabores, bases, saborIngredientes, baseIngredientes, insumosStock }
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

    setPdfLoadingGrupo(null)
    const obs = grupo.items.find(i => i.observaciones)?.observaciones
    const filas = grupo.items.map(it => `
      <tr>
        <td>${it.sabor_nombre}</td>
        <td>${it.tipo_producto === 'impulsivo' ? 'Impulsivo/Postre' : 'Helado'}</td>
        <td style="text-align:right">${it.tipo_producto === 'impulsivo' ? `${it.cantidad_unidades} u` : `${it.batches} batch${it.batches !== 1 ? 'es' : ''} (${it.litros_total} L)`}</td>
        <td>${estadoInfo(it.estado).label}</td>
      </tr>`).join('')

    const mpSecciones = grupo.items
      .filter(it => it.tipo_producto === 'helado')
      .map(it => ({ it, mp: computeMateriasPrimas(it, ctx) }))
      .filter(s => s.mp.length > 0)

    const mpHTML = mpSecciones.map(({ it, mp }) => {
      const filasMP = mp.map(m => `
        <tr>
          <td>${m.nombre}</td>
          <td style="text-align:right">${fmtNum(m.necesario)}</td>
          <td>${m.unidad}</td>
          <td style="text-align:right">${m.estado === 'sinlimite' ? '♾️' : `${fmtNum(m.disponible)} ${m.unidad}`}</td>
          <td>${m.estado === 'sinlimite' ? '♾️ Sin límite' : m.estado === 'ok' ? '✅ OK' : '❌ INSUFICIENTE'}</td>
          <td style="text-align:center"><div class="checkbox"></div></td>
        </tr>`).join('')
      return `
        <h3 style="font-size:11px;font-weight:700;margin:18px 0 6px;color:#374151;text-transform:uppercase;letter-spacing:.05em">
          MP — ${it.sabor_nombre} (${it.batches} batch${it.batches !== 1 ? 'es' : ''})
        </h3>
        <table>
          <thead><tr><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th>Stock</th><th>Estado</th><th>Entregado ✓</th></tr></thead>
          <tbody>${filasMP}</tbody>
        </table>`
    }).join('')

    w.document.open()
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Orden ${grupo.numero}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11px;padding:24px}
      .header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px}
      .logo-img{height:32px;display:block}
      .sub{font-size:10px;color:#666}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
      .campo{background:#f9fafb;border-radius:8px;padding:10px}
      .campo-label{font-size:8px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:2px}
      .campo-val{font-size:14px;font-weight:700;color:#111827}
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
      <div class="sub">Orden de Producción ${grupo.numero} · Emitida: ${new Date().toLocaleDateString('es-AR')}</div>
    </div>
    <div class="grid">
      <div class="campo"><div class="campo-label">Fecha programada</div><div class="campo-val">${grupo.fecha || '—'}</div></div>
      <div class="campo"><div class="campo-label">Operario asignado</div><div class="campo-val">${grupo.operario || '—'}</div></div>
    </div>
    <table>
      <thead><tr><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Estado</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    ${obs ? `<div class="campo" style="margin-bottom:20px"><div class="campo-label">Observaciones</div><div style="font-size:11px">${obs}</div></div>` : ''}
    ${mpHTML}
    <div class="firma-area">
      <div class="firma">Supervisor</div>
      <div class="firma">Operario / Fecha</div>
      <div class="firma">Control de Calidad</div>
    </div>
    </body></html>`)
    w.document.close()
    w.onload = () => w.print()
  }

  async function imprimirListaMP(grupo, item) {
    const w = window.open('', '_blank')

    let ctx = { sabores, bases, saborIngredientes, baseIngredientes, insumosStock }
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
        <td style="text-align:right">${fmtNum(m.necesario)}</td>
        <td>${m.unidad}</td>
        <td style="text-align:right">${m.estado === 'sinlimite' ? '—' : `${fmtNum(m.disponible)} ${m.unidad}`}</td>
        <td>${m.estado === 'sinlimite' ? '♾️ Sin límite' : m.estado === 'ok' ? '✅ OK' : '❌ INSUFICIENTE'}</td>
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
      <thead><tr><th>Ingrediente</th><th>Cantidad necesaria</th><th>Unidad</th><th>Stock actual</th><th>Estado</th><th>Entregado ✓</th></tr></thead>
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
    let ctx = { sabores, bases, saborIngredientes, baseIngredientes, insumosStock }
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

    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()

    try {
      const logoData = await toDataURL(logoUrl)
      doc.addImage(logoData, 'PNG', 14, 10, 36, 13)
    } catch {
      // si no se puede cargar el logo, se continúa sin él
    }

    doc.setFontSize(11)
    doc.setTextColor(40, 40, 40)
    doc.text(`Orden de Producción ${grupo.numero}`, pageWidth - 14, 14, { align: 'right' })

    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text(`Emitida: ${new Date().toLocaleDateString('es-AR')}`, pageWidth - 14, 19, { align: 'right' })

    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    doc.text(`Fecha programada: ${grupo.fecha || '—'}`, 14, 28)
    doc.text(`Operario asignado: ${grupo.operario || '—'}`, 14, 33)

    autoTable(doc, {
      startY: 40,
      head: [['Producto', 'Tipo', 'Cantidad', 'Estado']],
      body: grupo.items.map(it => [
        it.sabor_nombre,
        it.tipo_producto === 'impulsivo' ? 'Impulsivo/Postre' : 'Helado',
        it.tipo_producto === 'impulsivo'
          ? `${it.cantidad_unidades} u`
          : `${it.batches} batch${it.batches !== 1 ? 'es' : ''} (${it.litros_total} L)`,
        estadoInfo(it.estado).label,
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [212, 82, 26], textColor: 255 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    })

    let finalY = (doc.lastAutoTable?.finalY || 40) + 10

    const obs = grupo.items.find(i => i.observaciones)?.observaciones
    if (obs) {
      doc.setFontSize(8)
      doc.setTextColor(120, 120, 120)
      doc.text('Observaciones:', 14, finalY)
      doc.setFontSize(9)
      doc.setTextColor(40, 40, 40)
      doc.text(obs, 14, finalY + 5, { maxWidth: pageWidth - 28 })
      finalY += 15
    }

    // Sección de materias primas por cada helado
    const mpSecciones = grupo.items
      .filter(it => it.tipo_producto === 'helado')
      .map(it => ({ it, mp: computeMateriasPrimas(it, ctx) }))
      .filter(s => s.mp.length > 0)

    for (const { it, mp } of mpSecciones) {
      if (finalY > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage()
        finalY = 20
      }
      doc.setFontSize(9)
      doc.setTextColor(55, 65, 81)
      doc.setFont(undefined, 'bold')
      doc.text(`Materias Primas — ${it.sabor_nombre} (${it.batches} batches)`, 14, finalY)
      doc.setFont(undefined, 'normal')
      finalY += 4
      autoTable(doc, {
        startY: finalY,
        head: [['Ingrediente', 'Cantidad', 'Unidad', 'Stock', 'Estado', 'Entregado ✓']],
        body: mp.map(m => [
          m.nombre,
          fmtNum(m.necesario),
          m.unidad,
          m.estado === 'sinlimite' ? '♾️' : `${fmtNum(m.disponible)} ${m.unidad}`,
          m.estado === 'sinlimite' ? '♾️ Sin límite' : m.estado === 'ok' ? '✅ OK' : '❌ INSUFICIENTE',
          '',
        ]),
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [212, 82, 26], textColor: 255 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
      })
      finalY = (doc.lastAutoTable?.finalY || finalY) + 8
    }

    finalY += 20
    if (finalY > doc.internal.pageSize.getHeight() - 10) {
      doc.addPage()
      finalY = 20
    }

    const firmas = [
      { label: 'Supervisor', x: 14 },
      { label: 'Operario / Fecha', x: pageWidth / 2 - 28 },
      { label: 'Control de Calidad', x: pageWidth - 70 },
    ]
    doc.setFontSize(8)
    doc.setTextColor(80, 80, 80)
    firmas.forEach(f => {
      doc.line(f.x, finalY - 4, f.x + 56, finalY - 4)
      doc.text(f.label, f.x, finalY)
    })

    doc.save(`orden_${grupo.numero}.pdf`)
    setPdfLoadingGrupo(null)
  }

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Órdenes</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Órdenes de producción · {LITROS_BATCH} L/batch</p>
        </div>
        <Button variant="primary" onClick={() => setModal(true)}>
          <Plus size={15} /> Nueva orden
        </Button>
      </div>

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
                            {completada95 && <Badge variant="success">✅ COMPLETADA</Badge>}
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
                          {item.tipo_producto === 'impulsivo' ? (
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
                      {item.estado === ESTADO_EN_PROCESO && item.fecha_inicio && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: colors.textMuted }}>
                          <Clock size={12} />
                          <span>Tiempo transcurrido: <strong style={{ color: colors.textPrimary }}><TiempoTranscurrido fechaInicio={item.fecha_inicio} /></strong>
                            {item.horas_estimadas > 0 && ` (estimado: ${fmtNum(item.horas_estimadas)}h)`}
                          </span>
                        </div>
                      )}
                      {item.estado === ESTADO_COMPLETADA && (item.horas_estimadas > 0 || item.horas_reales > 0) && (
                        <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                          <span className="flex items-center gap-1.5 text-xs" style={{ color: colors.textMuted }}>
                            <Clock size={12} />
                            Estimado: {fmtNum(item.horas_estimadas)}h · Real: {fmtNum(item.horas_reales)}h
                          </span>
                          <Badge variant={eficienciaVariant(item.eficiencia_tiempo)}>
                            ⏱ {fmtNum(item.eficiencia_tiempo)}% tiempo
                          </Badge>
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
                                      <Td className="text-right">{fmtNum(m.necesario)} {m.unidad}</Td>
                                      <Td className="text-right">{m.estado === 'sinlimite' ? '—' : `${fmtNum(m.disponible)} ${m.unidad}`}</Td>
                                      <Td>{m.estado === 'sinlimite' ? '♾️ Sin límite' : m.estado === 'ok' ? '✅ OK' : '❌ INSUFICIENTE'}</Td>
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
        onClose={() => setModal(false)}
        title="Nueva Orden de Producción"
        maxWidth="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)} disabled={saving} className="flex-1">
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
            <label className="block text-sm font-medium text-[#374151] mb-1.5">Observaciones</label>
            <textarea value={form.observaciones} onChange={e => upd('observaciones', e.target.value)}
              rows={2} className={textareaClass} />
          </div>

          <div className="pt-2" style={{ borderTop: `1px solid ${colors.border}` }}>
            <p className="text-sm font-medium text-[#374151] mb-2 mt-3">Agregar producto</p>

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
                  <Input label="Tiempo estimado (h)" type="number" min="0" step="0.5" placeholder="ej: 4.5"
                    value={lineaHoras} onChange={e => setLineaHoras(e.target.value)} />
                </div>

                {tabProducto === 'SABORES' && productoSelEsHelado && (
                  <div className="mt-3 space-y-2 pt-3" style={{ borderTop: `1px solid ${colors.border}` }}>
                    <p className="text-xs font-semibold uppercase" style={{ color: colors.textMuted }}>Base a usar (Etapa 1)</p>
                    <Select
                      label="Base disponible"
                      value={baseSel}
                      onChange={e => { setBaseSel(e.target.value); setKgBaseAUsar('') }}
                    >
                      <option value="">— Sin base (elaboración directa) —</option>
                      {stockBases.filter(b => b.kg_disponible > 0).map(b => (
                        <option key={b.id} value={String(b.id)}>
                          {b.base_nombre} — {fmtNum(b.kg_disponible)} kg disponibles
                        </option>
                      ))}
                    </Select>
                    {baseSel && (() => {
                      const batches = parseFloat(lineaCantidad || '1') || 1
                      const { litrosBase } = calcularKgObjetivo(productoSel?.nombre || '', batches)
                      const kgDefault = (litrosBase * batches).toFixed(1)
                      const baseSelObj = stockBases.find(b => String(b.id) === baseSel)
                      return (
                        <>
                          {baseSelObj && (
                            <p className="text-xs" style={{ color: colors.textMuted }}>
                              Disponible: <strong style={{ color: colors.brand }}>{fmtNum(baseSelObj.kg_disponible)} kg</strong>
                            </p>
                          )}
                          <Input
                            label={`Kg de base a usar (default: ${kgDefault} kg)`}
                            type="number" min="0.1" step="0.1"
                            placeholder={`${kgDefault}`}
                            value={kgBaseAUsar}
                            onChange={e => setKgBaseAUsar(e.target.value)}
                          />
                        </>
                      )
                    })()}
                  </div>
                )}
              </>
            )}

            {faltaStockSel && (
              <div className="flex items-start gap-2 px-3 py-2.5 mt-2 text-xs" style={{ backgroundColor: colors.warningBg, border: `1px solid ${colors.warning}40`, borderRadius: radius.md, color: colors.warning }}>
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>Stock bajo para este sabor ({stockActualSel} baldes). Se puede agregar igual — verificá disponibilidad.</span>
              </div>
            )}
          </div>

          {lineas.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[#374151]">Productos en esta orden</label>
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

            {ordenDetalle.estado === ESTADO_EN_PROCESO && ordenDetalle.fecha_inicio && (
              <div className="flex items-center gap-1.5 text-sm" style={{ color: colors.textMuted }}>
                <Clock size={14} />
                <span>Tiempo transcurrido: <strong style={{ color: colors.textPrimary }}><TiempoTranscurrido fechaInicio={ordenDetalle.fecha_inicio} /></strong>
                  {ordenDetalle.horas_estimadas > 0 && ` (estimado: ${fmtNum(ordenDetalle.horas_estimadas)}h)`}
                </span>
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
                          <Td className="text-right">{fmtNum(m.necesario)}</Td>
                          <Td>{m.unidad}</Td>
                          <Td className="text-right">{m.estado === 'sinlimite' ? '—' : `${fmtNum(m.disponible)} ${m.unidad}`}</Td>
                          <Td>{m.estado === 'sinlimite' ? '♾️ Sin límite' : m.estado === 'ok' ? '✅ OK' : '❌ INSUFICIENTE'}</Td>
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
    </div>
  )
}
