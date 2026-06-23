import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { deduplicarOperarios } from '../lib/operarios'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import KpiCard from '../components/ui/KpiCard'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { aplicarProduccionAOrden, ESTADO_EN_PROCESO } from '../lib/ordenes'
import { useUser } from '../context/UserContext'
import { colors, radius, shadow } from '../styles/design-system'
import { Package, Users, Scale, Hash, ScanLine, PenLine, FileText, Printer, X, Plus, ClipboardCheck, Settings } from 'lucide-react'
const logoUrl = '/logo_delparque.png'

function decodearEAN(code) {
  if (!code || code.length !== 13 || !code.startsWith('200')) return null
  if (code.startsWith('20000')) {
    const prod = parseInt(code.substring(5, 7), 10)
    const rawPeso6 = parseInt(code.substring(7, 13), 10) / 1000
    const rawPeso4 = parseInt(code.substring(7, 11), 10) / 1000
    // Si rawPeso6 > 50 kg es irreal → usar rawPeso4; si rawPeso4 < 0.1 kg es irreal → usar rawPeso6
    const peso = rawPeso6 > 50 ? rawPeso4 : (rawPeso4 < 0.1 ? rawPeso6 : rawPeso6)
    console.log('[EAN decode] prod=', prod,
      '| rawPeso4=', rawPeso4.toFixed(3), 'kg | rawPeso6=', rawPeso6.toFixed(3), 'kg → usando', peso.toFixed(3), 'kg')
    return { prod, peso }
  }
  // Formato viejo: prefijo "200" + código de producto (4 dígitos) + peso (4 dígitos)
  const prod = parseInt(code.substring(3, 7), 10)
  const peso = prod === 100
    ? parseInt(code.substring(9, 13), 10) / 1000
    : parseInt(code.substring(7, 11), 10) / 1000
  return { prod, peso }
}

const OPERARIOS_SEED = [
  'Silvia Escalona', 'Alejandra Reus', 'Claudia Carrizo', 'Patricia Escudero',
  'Patricia Reus', 'Matias Torres', 'Matias Tapia', 'Nicolas Molina',
  'Nicolas Bunda', 'Gabriela Marinero', 'Natalia Diaz', 'Joan Michetti',
  'Guillermo Valle',
]

const PRODUCTOS_SEED = [
  { codigo: 100, nombre: 'BARRA ALMENDRADO', categoria: 'IMPULSIVO' },
  { codigo: 101, nombre: 'BARRA HELADA',     categoria: 'IMPULSIVO' },
  { codigo: 102, nombre: 'PIONONO',          categoria: 'IMPULSIVO' },
  { codigo: 116, nombre: 'TORTA HELADA KG',  categoria: 'IMPULSIVO' },
]

const textareaClass = 'w-full rounded-lg border border-[#334155] text-sm text-[#F1F5F9] placeholder:text-[#64748B] bg-[#0F172A] outline-none transition-colors duration-150 px-3 py-2 resize-none focus:ring-2 focus:ring-[#D4521A]/25 focus:border-[#D4521A]'
const obsInputClass  = 'w-full min-w-[160px] rounded-md border border-[#334155] text-xs text-[#F1F5F9] placeholder:text-[#64748B] bg-[#0F172A] outline-none transition-colors duration-150 px-2 py-1.5 focus:ring-2 focus:ring-[#D4521A]/25 focus:border-[#D4521A]'

function fmtNum(n) {
  return Number((n || 0).toFixed(2)).toString()
}

function fmtPeso(n, unidad) {
  if (unidad === 'u') return fmtNum(n)
  return Number((n || 0).toFixed(3)).toString()
}

function unidadDe(r) {
  if (r.origen !== 'manual') return 'kg'
  const c = (r.categoria || '').toLowerCase()
  return (c.includes('impulsiv') || c.includes('postre')) ? 'u' : 'kg'
}

let preCargaSeq = 0

const PRECARGA_KEY = 'delparque_precarga'

function guardarPreCargaLS(lista) {
  localStorage.setItem(PRECARGA_KEY, JSON.stringify(lista))
}

export default function Produccion() {
  const { user } = useUser()
  const [operarios, setOperarios]     = useState([])
  const [productos, setProductos]     = useState([])
  const [registros, setRegistros]     = useState([])
  const [saboresCamara, setSaboresCamara] = useState([])
  const [impulsivosList, setImpulsivosList] = useState([])
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState(null)
  const [codigo, setCodigo]           = useState('')
  const [preCarga, setPreCarga]       = useState([])
  const [confirmando, setConfirmando] = useState(false)
  const [operarioSel, setOperarioSel] = useState('')
  const inputRef = useRef(null)

  const [modo, setModo] = useState('escaneo')
  const [manualProducto, setManualProducto] = useState('')
  const [manualCantidad, setManualCantidad] = useState('')
  const [manualPesoTotal, setManualPesoTotal] = useState('')
  const [manualLote, setManualLote] = useState('')
  const [manualObservaciones, setManualObservaciones] = useState('')

  const [modalInforme, setModalInforme] = useState(false)
  const [cargandoInforme, setCargandoInforme] = useState(false)
  const [informeData, setInformeData] = useState([])

  const [modalOperarios, setModalOperarios] = useState(false)
  const [nuevoOpNombre, setNuevoOpNombre] = useState('')
  const [savingOp, setSavingOp] = useState(false)

  const [debugRaw, setDebugRaw]     = useState('')
  const [debugClean, setDebugClean] = useState('')

  const fechaHoy = new Date().toISOString().split('T')[0]
  const hoyDate  = new Date()
  const lote = `${String(hoyDate.getDate()).padStart(2,'0')}${String(hoyDate.getMonth()+1).padStart(2,'0')}${hoyDate.getFullYear()}`

  useEffect(() => {
    if (modo === 'escaneo') inputRef.current?.focus()
  }, [modo])

  useEffect(() => {
    const saved = localStorage.getItem(PRECARGA_KEY)
    if (saved) {
      try {
        setPreCarga(JSON.parse(saved))
      } catch {
        localStorage.removeItem(PRECARGA_KEY)
      }
    }
  }, [])

  useEffect(() => {
    inicializar()
    const ch = supabase.channel('producciones_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'producciones' },
        ({ new: row }) => {
          if (row.fecha !== fechaHoy) return
          setRegistros(prev => prev.some(r => r.id === row.id) ? prev : [row, ...prev].slice(0, 50))
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [fechaHoy])

  async function inicializar() {
    let [{ data: ops }, { data: prods }, { data: regs }, { data: sab }, { data: imp }] = await Promise.all([
      supabase.from('operarios').select('*').eq('activo', true).order('nombre'),
      supabase.from('productos_produccion').select('*').order('nombre'),
      supabase.from('producciones').select('*').eq('fecha', fechaHoy)
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('stock_camaras').select('id,nombre,tipo_producto').order('nombre'),
      supabase.from('impulsivos').select('id,nombre').order('nombre'),
    ])
    if (!ops || ops.length === 0) {
      const { data: s } = await supabase.from('operarios')
        .insert(OPERARIOS_SEED.map(nombre => ({ nombre, activo: true }))).select()
      ops = s || []
    }
    if (!prods || prods.length === 0) {
      const { data: s } = await supabase.from('productos_produccion').insert(PRODUCTOS_SEED).select()
      prods = s || []
    }
    const opsDedup = deduplicarOperarios(ops)
    setOperarios(opsDedup)
    setProductos(prods || [])
    setRegistros(regs || [])
    setSaboresCamara(sab || [])
    setImpulsivosList(imp || [])
    if (opsDedup.length > 0) setOperarioSel(String(opsDedup[0].id))
    setManualLote(lote)
    setLoading(false)
  }

  function agregarAPreCarga(item) {
    setPreCarga(prev => {
      const next = [...prev, { ...item, _id: `pc-${Date.now()}-${preCargaSeq++}` }]
      guardarPreCargaLS(next)
      return next
    })
  }

  function quitarDePreCarga(id) {
    setPreCarga(prev => {
      const next = prev.filter(it => it._id !== id)
      guardarPreCargaLS(next)
      return next
    })
  }

  async function agregarOperario() {
    const nombre = nuevoOpNombre.trim()
    if (!nombre) return
    setSavingOp(true)
    const { data, error } = await supabase.from('operarios')
      .insert({ nombre, activo: true }).select().single()
    setSavingOp(false)
    if (error) { toast2(error.message, 'error'); return }
    setOperarios(prev => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setNuevoOpNombre('')
    toast2(`Operario "${nombre}" agregado`)
  }

  async function eliminarOperario(id) {
    const { error } = await supabase.from('operarios').update({ activo: false }).eq('id', id)
    if (error) { toast2(error.message, 'error'); return }
    setOperarios(prev => prev.filter(o => o.id !== id))
    if (operarioSel === String(id)) setOperarioSel('')
    toast2('Operario eliminado')
  }

  function actualizarObsPreCarga(id, value) {
    setPreCarga(prev => {
      const next = prev.map(it => it._id === id ? { ...it, observaciones: value } : it)
      guardarPreCargaLS(next)
      return next
    })
  }

  function procesarCodigo(rawValue) {
    const raw = rawValue ?? ''
    const clean = raw.trim().replace(/\D/g, '')

    console.log('Código raw recibido:', JSON.stringify(raw))
    console.log('Código limpio:', clean)
    console.log('Longitud:', clean.length)
    console.log('Primeros 5 dígitos:', clean.substring(0, 5))

    setDebugRaw(raw)
    setDebugClean(clean)

    if (!clean) return
    if (!operarioSel) {
      toast2('Seleccioná un operario antes de escanear', 'error')
      setCodigo('')
      return
    }

    const decoded = decodearEAN(clean)
    if (!decoded) {
      toast2(`Código inválido (${clean.length} dígitos) — debe ser EAN-13 Del Parque (200…)`, 'error')
      setCodigo('')
      setTimeout(() => inputRef.current?.focus(), 50)
      return
    }

    const productoPP = productos.find(p => p.codigo === decoded.prod)
    console.log('Producto encontrado:', productoPP || null)
    const operario = operarios.find(o => String(o.id) === operarioSel)
    const nombreProd = productoPP?.nombre || `Producto #${decoded.prod}`
    // Determinar tipo_producto desde stock_camaras para mostrar correctamente en pre-carga
    const camaraMatch = saboresCamara.find(s => (s.nombre || '').trim().toUpperCase() === nombreProd.trim().toUpperCase())
    const tipoProdScan = camaraMatch?.tipo_producto || (productoPP?.categoria?.toLowerCase().includes('postre') ? 'postre' : productoPP?.categoria?.toLowerCase().includes('impulsiv') ? 'impulsivo' : 'helado')
    agregarAPreCarga({
      fecha: fechaHoy,
      producto_codigo: decoded.prod,
      producto_nombre: nombreProd,
      categoria: productoPP?.categoria || null,
      tipo_producto: tipoProdScan,
      origen: 'escaneo',
      peso_kg: decoded.peso,
      _unidades: 1,        // cada escaneo = 1 unidad/balde
      lote,
      operario_id: operario?.id || null,
      operario_nombre: (operario?.nombre || '—').toUpperCase(),
      observaciones: '',
    })
    setCodigo('')
    setDebugRaw('')
    setDebugClean('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleKey(e) {
    if (e.key !== 'Enter') return
    procesarCodigo(e.target.value)
  }

  function handleChangeCodigo(e) {
    const val = e.target.value
    setCodigo(val)
    const clean = val.trim().replace(/\D/g, '')
    setDebugRaw(val)
    setDebugClean(clean)
    if (clean.length >= 13) {
      procesarCodigo(val)
    }
  }

  function agregarManualALista() {
    if (!operarioSel || !manualProducto || !manualCantidad) {
      toast2('Completá operario, producto y cantidad', 'error'); return
    }
    const cantidad = parseFloat(manualCantidad)
    if (!(cantidad > 0)) { toast2('La cantidad debe ser mayor a 0', 'error'); return }
    if (manualTipoCamara === 'helado' && !(parseFloat(manualPesoTotal) > 0)) {
      toast2('El peso total (kg) es obligatorio para helados', 'error'); return
    }

    const nombre = manualTipo === 'sabor'
      ? saboresCamara.find(s => String(s.id) === manualId)?.nombre || ''
      : impulsivosList.find(i => String(i.id) === manualId)?.nombre || ''

    const operario = operarios.find(o => String(o.id) === operarioSel)

    // Valores según tipo_producto real en stock_camaras
    let peso_kg = 0, _unidades = 0, _pesoTotalKg = 0
    if (manualTipoCamara === 'helado') {
      _unidades   = Math.round(cantidad)              // cantidad de BALDES
      peso_kg     = parseFloat(manualPesoTotal) || 0 // kg reales producidos
      _pesoTotalKg = peso_kg
    } else if (manualTipoCamara === 'impulsivo') {
      _unidades = Math.round(cantidad)               // unidades
      peso_kg   = Math.round(cantidad)               // backward compat en producciones
    } else {
      // postre
      _unidades   = Math.round(cantidad)             // unidades
      _pesoTotalKg = parseFloat(manualPesoTotal) || 0
      peso_kg      = _pesoTotalKg                   // kg en producciones
    }

    agregarAPreCarga({
      fecha: fechaHoy,
      producto_codigo: null,
      producto_nombre: nombre,
      categoria: manualTipoCamara === 'helado' ? 'Helado' : manualTipoCamara === 'postre' ? 'Postre' : 'Impulsivo',
      tipo_producto: manualTipoCamara,
      origen: 'manual',
      peso_kg,
      _unidades,
      _pesoTotalKg,
      lote: manualLote || lote,
      operario_id: operario?.id || null,
      operario_nombre: (operario?.nombre || '—').toUpperCase(),
      observaciones: manualObservaciones.trim(),
    })
    setManualCantidad('')
    setManualPesoTotal('')
    setManualObservaciones('')
  }

  async function confirmarYRegistrarTodo() {
    if (preCarga.length === 0) return
    setConfirmando(true)

    console.log('Iniciando confirmación, items:', preCarga)

    // 1. Insertar en producciones (excluir campos internos)
    const payload = preCarga.map(({ _id, _pesoTotalKg, _unidades, tipo_producto, categoria, ...item }) => ({
      ...item,
      observaciones: item.observaciones?.trim() || null,
      usuario_email: user?.email || null,
    }))
    const { error } = await supabase.from('producciones').insert(payload)
    if (error) {
      setConfirmando(false)
      toast2('Error: ' + error.message, 'error')
      return
    }
    const cantidad = preCarga.length

    // 2. Agrupar por producto para acumular kg/unidades antes de tocar cámaras
    const sumasPorProducto = {}
    preCarga.forEach(item => {
      const nombre = (item.producto_nombre || '').trim()
      if (!nombre) return
      const key = nombre.toLowerCase()
      const esUnidad = unidadDe(item) === 'u'
      if (!sumasPorProducto[key]) {
        sumasPorProducto[key] = {
          nombre, kg: 0, unidades: 0, esUnidad,
          lote: item.lote, operario: item.operario_nombre,
          categoria: item.categoria,
        }
      }
      if (esUnidad) sumasPorProducto[key].unidades += item.peso_kg || 0
      else sumasPorProducto[key].kg += item.peso_kg || 0
    })

    // 3. Actualizar stock_camaras y registrar movimientos (por item)
    let camarasActualizadas = 0
    const noEncontrados = []

    for (const item of preCarga) {
      const nombre = (item.producto_nombre || '').trim()
      if (!nombre) continue

      // Búsqueda exacta en stock_camaras (con tipo_producto)
      let { data: camaras } = await supabase
        .from('stock_camaras')
        .select('id, nombre, kg, baldes, tipo_producto')
        .ilike('nombre', nombre)
        .limit(1)

      // Fallback: búsqueda parcial
      if (!camaras || camaras.length === 0) {
        const { data: flex } = await supabase
          .from('stock_camaras')
          .select('id, nombre, kg, baldes, tipo_producto')
          .ilike('nombre', `%${nombre}%`)
          .limit(1)
        camaras = flex
      }

      const camara = camaras?.[0]
      // Prioridad: tipo del item (manual) > tipo del camara > inferir de categoria
      const tipoCam = item.tipo_producto
        || camara?.tipo_producto
        || (item.categoria?.toLowerCase() === 'helado' ? 'helado' : item.categoria?.toLowerCase() === 'postre' ? 'postre' : 'impulsivo')

      // escaneo: cada código escaneado = 1 balde; manual: usar _unidades explícito
      const unidades = item.origen === 'escaneo' ? 1 : (Number(item._unidades) || 0)
      const kgItem   = Number(item.peso_kg) || 0

      // Calcular nuevos valores según tipo_producto
      let nuevoKg, nuevosBaldes
      if (tipoCam === 'helado') {
        // baldes explícito + kg explícito
        nuevosBaldes = (Number(camara?.baldes) || 0) + unidades
        nuevoKg      = (Number(camara?.kg)     || 0) + kgItem
      } else if (tipoCam === 'impulsivo') {
        nuevosBaldes = (Number(camara?.baldes) || 0) + unidades
        nuevoKg      = Number(camara?.kg) || 0  // no tocar kg para impulsivos
      } else {
        // postre
        nuevosBaldes = (Number(camara?.baldes) || 0) + unidades
        nuevoKg      = (Number(camara?.kg)     || 0) + kgItem
      }

      const movPayload = {
        sabor_nombre:    nombre,
        producto_nombre: nombre,
        tipo:            'ingreso',
        tipo_producto:   tipoCam,
        kg:     kgItem,
        baldes: unidades,
        lote:            item.lote || null,
        operario_nombre: item.operario_nombre || null,
        fecha:           new Date().toISOString().split('T')[0],
        created_at:      new Date().toISOString(),
        usuario_email:   user?.email || null,
      }

      if (!camara) {
        // Crear nuevo registro en stock_camaras
        if (!noEncontrados.includes(nombre)) noEncontrados.push(nombre)
        const { data: nuevo, error: errIns } = await supabase
          .from('stock_camaras')
          .insert({ nombre, kg: nuevoKg, baldes: nuevosBaldes, tipo_producto: tipoCam, operario_nombre: item.operario_nombre || null, ultima_actualizacion: new Date().toISOString() })
          .select('id')
          .single()
        if (!errIns && nuevo) {
          camarasActualizadas++
          await supabase.from('movimientos_camara').insert(movPayload)
        }
        continue
      }

      const { error: errCam } = await supabase.from('stock_camaras')
        .update({ kg: nuevoKg, baldes: nuevosBaldes, operario_nombre: item.operario_nombre, ultima_actualizacion: new Date().toISOString() })
        .eq('id', camara.id)

      if (!errCam) {
        camarasActualizadas++
        await supabase.from('movimientos_camara').insert(movPayload)
      } else {
        console.log('Error al actualizar cámara:', errCam.message)
      }
    }

    // 4. Vincular con órdenes en curso
    const mensajesOrdenes = []
    const mermaErrores = []
    for (const { nombre, kg } of Object.values(sumasPorProducto)) {
      const { data: ords } = await supabase.from('ordenes_produccion')
        .select('*')
        .eq('estado', ESTADO_EN_PROCESO)
        .eq('fecha_produccion', fechaHoy)
        .eq('tipo_producto', 'helado')
        .gt('kg_objetivo', 0)
        .ilike('sabor_nombre', nombre)
        .order('id', { ascending: true })
        .limit(1)
      const orden = ords?.[0]
      if (!orden) continue
      const resultado = await aplicarProduccionAOrden(orden, kg, user?.email || null)
      if (resultado.error) continue
      mensajesOrdenes.push(`Orden ${orden.numero} actualizada: ${resultado.pct.toFixed(1)}% completada`)
      if (resultado.mermaError) mermaErrores.push(`Orden ${orden.numero}: ${resultado.mermaError.message}`)
    }

    setPreCarga([])
    localStorage.removeItem(PRECARGA_KEY)
    const { data: regs } = await supabase.from('producciones').select('*').eq('fecha', fechaHoy)
      .order('created_at', { ascending: false }).limit(50)
    setRegistros(regs || [])
    setConfirmando(false)

    // Toast detallado
    toast2(`✅ ${cantidad} registro${cantidad === 1 ? '' : 's'} guardado${cantidad === 1 ? '' : 's'} — ${camarasActualizadas} producto${camarasActualizadas === 1 ? '' : 's'} actualizado${camarasActualizadas === 1 ? '' : 's'} en cámara${mensajesOrdenes.length > 0 ? ' · ' + mensajesOrdenes.join(' · ') : ''}`)
    if (noEncontrados.length > 0) {
      setTimeout(() => toast2(`⚠️ No se encontró en cámara: ${noEncontrados.join(', ')}`, 'error'), 1500)
    }

    if (mermaErrores.length > 0) {
      setTimeout(() => toast2(`Error merma: ${mermaErrores.join(' · ')}`, 'error'), 3200)
    }
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function abrirInforme() {
    setModalInforme(true)
    setCargandoInforme(true)
    const { data } = await supabase.from('producciones').select('*').eq('fecha', fechaHoy)
      .order('created_at', { ascending: true })
    setInformeData(data || [])
    setCargandoInforme(false)
  }

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const kpiKgHelados = registros
    .filter(r => !((r.categoria || '').toLowerCase().includes('impulsiv') || (r.categoria || '').toLowerCase().includes('postre')))
    .reduce((a, r) => a + (r.peso_kg || 0), 0)
  const kpiUnidadesImpulsivos = registros
    .filter(r => (r.categoria || '').toLowerCase().includes('impulsiv'))
    .reduce((a, r) => a + Math.round(r.peso_kg || 0), 0)
  const kpiOps = new Set(registros.map(r => r.operario_nombre).filter(Boolean)).size

  const subtotales = useMemo(() => {
    const m = {}
    informeData.forEach(r => {
      const key = r.operario_nombre || '—'
      if (!m[key]) m[key] = { operario: key, registros: 0, cantidad: 0 }
      m[key].registros += 1
      m[key].cantidad += r.peso_kg || 0
    })
    return Object.values(m).sort((a, b) => b.cantidad - a.cantidad)
  }, [informeData])

  const manualTipo = manualProducto.split(':')[0]
  const manualId   = manualProducto.split(':')[1] || ''

  // Mapa nombre→tipo_producto desde stock_camaras (para lookup rápido)
  const tipoPorNombre = useMemo(() => {
    const m = {}
    saboresCamara.forEach(s => { m[(s.nombre || '').trim().toLowerCase()] = s.tipo_producto || 'helado' })
    return m
  }, [saboresCamara])

  // tipo_producto efectivo del producto seleccionado en carga manual
  const manualTipoCamara = useMemo(() => {
    if (!manualProducto) return 'helado'
    if (manualTipo === 'sabor') {
      const item = saboresCamara.find(s => String(s.id) === manualId)
      return item?.tipo_producto || 'helado'
    }
    // para impulsivos: buscar por nombre en stock_camaras
    const nombre = (impulsivosList.find(i => String(i.id) === manualId)?.nombre || '').toLowerCase()
    return tipoPorNombre[nombre] || 'impulsivo'
  }, [manualProducto, manualTipo, manualId, saboresCamara, impulsivosList, tipoPorNombre])

  const cantidadLabel = manualTipoCamara === 'helado'
    ? 'Cantidad (baldes) *'
    : 'Cantidad (unidades) *'

  function imprimirInforme() {
    const w = window.open('', '_blank')
    const filas = informeData.map(r => `
      <tr>
        <td>${new Date(r.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
        <td>${r.producto_nombre}</td>
        <td>${r.categoria || '—'}</td>
        <td>${r.operario_nombre || '—'}</td>
        <td style="text-align:right">${fmtPeso(r.peso_kg, unidadDe(r))} ${unidadDe(r)}</td>
        <td>${r.lote || '—'}</td>
        <td>${r.observaciones || ''}</td>
      </tr>`).join('')
    const subfilas = subtotales.map(s => `
      <tr>
        <td>${s.operario}</td>
        <td style="text-align:right">${s.registros}</td>
        <td style="text-align:right">${fmtNum(s.cantidad)}</td>
      </tr>`).join('')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Informe de producción ${fechaHoy}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11px;padding:24px}
      .header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px}
      .logo-img{height:32px;display:block}
      .sub{font-size:10px;color:#666}
      h2{font-size:13px;margin:18px 0 8px}
      table{width:100%;border-collapse:collapse;margin-bottom:8px}
      th{background:#f3f4f6;font-size:9px;font-weight:700;text-transform:uppercase;padding:6px 8px;text-align:left;border-bottom:2px solid ${colors.brand}}
      td{padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:11px}
      .firma-area{display:flex;gap:48px;margin-top:48px}
      .firma{flex:1;border-top:1px solid #374151;padding-top:8px;font-size:9px;color:#6b7280}
      @media print{body{padding:0}}
    </style></head><body>
    <div class="header">
      <img src="${logoUrl}" class="logo-img" alt="Del Parque" />
      <div class="sub">Informe de producción del día · ${fechaHoy} · Lote ${lote}</div>
    </div>
    <h2>Detalle de registros</h2>
    <table>
      <thead><tr><th>Hora</th><th>Producto</th><th>Categoría</th><th>Operario</th><th>Cantidad</th><th>Lote</th><th>Observaciones</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <h2>Subtotales por operario</h2>
    <table>
      <thead><tr><th>Operario</th><th>Registros</th><th>Cantidad total</th></tr></thead>
      <tbody>${subfilas}</tbody>
    </table>
    <div class="firma-area">
      <div class="firma">Supervisor</div>
      <div class="firma">Control de Calidad</div>
    </div>
    </body></html>`)
    w.document.close()
    w.onload = () => w.print()
  }

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Producción</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Escaneo EAN-13 y carga manual · Lote {lote}</p>
        </div>
        <Button variant="secondary" onClick={abrirInforme}>
          <FileText size={15} /> Ver informe del día
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="KG Helados" value={loading ? '—' : kpiKgHelados.toFixed(2)} icon={Scale} color={colors.brand} />
        <KpiCard label="Unidades Impulsivos" value={loading ? '—' : kpiUnidadesImpulsivos} icon={Package} color={colors.warning} />
        <KpiCard label="Operarios"  value={loading ? '—' : kpiOps} icon={Users} />
        <KpiCard label="Lote"       value={lote} color={colors.brand} icon={Hash} />
      </div>

      {/* Registro */}
      <div className="p-6" style={{ backgroundColor: colors.surface, borderRadius: radius.xl, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${colors.brand}18` }}>
              {modo === 'escaneo' ? <ScanLine size={16} style={{ color: colors.brand }} /> : <PenLine size={16} style={{ color: colors.brand }} />}
            </div>
            <h2 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Registrar producción</h2>
          </div>
          <div className="flex gap-1.5">
            {[{ key: 'escaneo', label: 'Escanear código' }, { key: 'manual', label: 'Carga manual' }].map(m => (
              <button key={m.key} onClick={() => setModo(m.key)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border"
                style={{
                  backgroundColor: modo === m.key ? colors.brand : 'transparent',
                  borderColor: modo === m.key ? colors.brand : colors.border,
                  color: modo === m.key ? 'white' : colors.textSecondary,
                }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-xs mb-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select label="Operario *" value={operarioSel} onChange={e => setOperarioSel(e.target.value)}
                error={!operarioSel ? 'Seleccioná un operario para poder registrar' : undefined}>
                <option value="">Seleccionar operario...</option>
                {operarios.map(o => (
                  <option key={o.id} value={String(o.id)}>{o.nombre}</option>
                ))}
              </Select>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setModalOperarios(true)} title="Gestionar operarios" style={{ marginBottom: '1px' }}>
              <Settings size={15} />
            </Button>
          </div>
        </div>

        {modo === 'escaneo' ? (
          <div>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={codigo}
              onChange={handleChangeCodigo}
              onKeyDown={handleKey}
              placeholder="Escanear código de barra..."
              autoFocus
              className="w-full font-mono tracking-wide text-center outline-none transition-colors"
              style={{ padding: '20px 24px', fontSize: 18, borderRadius: radius.lg, border: `2px solid ${colors.border}`, color: colors.textPrimary }}
              onFocus={e => { e.target.style.borderColor = colors.brand }}
              onBlur={e => { e.target.style.borderColor = colors.border }}
            />
            {(debugRaw || debugClean) && (
              <div className="mt-2 px-3 py-2 rounded-lg font-mono" style={{ fontSize: 11, color: '#555', backgroundColor: '#f8f8f8', border: '1px solid #e5e7eb', lineHeight: 1.8 }}>
                <div><strong>Raw:</strong> {JSON.stringify(debugRaw)}</div>
                <div><strong>Limpio:</strong> {debugClean} &nbsp;|&nbsp; <strong>Largo:</strong> {debugClean.length}</div>
                {debugClean.length >= 7 && (() => {
                  const rp4 = parseInt(debugClean.substring(7, 11), 10) / 1000
                  const rp6 = parseInt(debugClean.substring(7, 13), 10) / 1000
                  const usado = rp6 > 50 ? rp4 : (rp4 < 0.1 ? rp6 : rp6)
                  return (
                    <>
                      <div><strong>prod:</strong> sub(5,7) = {debugClean.substring(5, 7)} → #{parseInt(debugClean.substring(5, 7), 10) || '?'}</div>
                      <div><strong>rawPeso4:</strong> sub(7,11) = {debugClean.substring(7, 11)} → {rp4.toFixed(3)} kg</div>
                      <div><strong>rawPeso6:</strong> sub(7,13) = {debugClean.substring(7, 13)} → {rp6.toFixed(3)} kg</div>
                      <div style={{ color: '#16a34a' }}><strong>→ peso usado:</strong> {usado.toFixed(3)} kg {rp6 > 50 ? '(rawPeso6 irreal >50, usó rawPeso4)' : rp4 < 0.1 ? '(rawPeso4 irreal <0.1, usó rawPeso6)' : '(rawPeso6)'}</div>
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select label="Producto *" value={manualProducto} onChange={e => { setManualProducto(e.target.value); setManualCantidad(''); setManualPesoTotal('') }}>
                <option value="">Seleccionar producto...</option>
                <optgroup label="Helados">
                  {saboresCamara.filter(s => !s.tipo_producto || s.tipo_producto === 'helado').map(s => <option key={`sabor:${s.id}`} value={`sabor:${s.id}`}>{s.nombre.toUpperCase()}</option>)}
                </optgroup>
                <optgroup label="Impulsivos">
                  {impulsivosList.map(i => <option key={`impulsivo:${i.id}`} value={`impulsivo:${i.id}`}>{i.nombre.toUpperCase()}</option>)}
                </optgroup>
                {saboresCamara.filter(s => s.tipo_producto === 'postre').length > 0 && (
                  <optgroup label="Postres">
                    {saboresCamara.filter(s => s.tipo_producto === 'postre').map(s => <option key={`sabor:${s.id}`} value={`sabor:${s.id}`}>{s.nombre.toUpperCase()}</option>)}
                  </optgroup>
                )}
              </Select>
              <Input
                label={cantidadLabel}
                type="number" min="0" step="1"
                value={manualCantidad}
                onChange={e => setManualCantidad(e.target.value)}
                placeholder="0"
              />
            </div>

            {/* Peso total (kg) — para helados y postres */}
            {(manualTipoCamara === 'helado' || manualTipoCamara === 'postre') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label={manualTipoCamara === 'helado' ? 'Peso total (kg) *' : 'Peso total (kg)'}
                  type="number" min="0" step="0.001"
                  value={manualPesoTotal}
                  onChange={e => setManualPesoTotal(e.target.value)}
                  placeholder="0.000"
                />
                {manualCantidad && (
                  <div className="flex items-end pb-2">
                    <p className="text-xs font-semibold" style={{ color: colors.brand }}>
                      {manualTipoCamara === 'helado'
                        ? `${Math.round(parseFloat(manualCantidad) || 0)} baldes${parseFloat(manualPesoTotal) > 0 ? ` / ${parseFloat(manualPesoTotal).toFixed(1)} kg` : ''}`
                        : `${Math.round(parseFloat(manualCantidad) || 0)} unidades${parseFloat(manualPesoTotal) > 0 ? ` / ${parseFloat(manualPesoTotal).toFixed(1)} kg` : ''}`}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Preview para impulsivos */}
            {manualTipoCamara === 'impulsivo' && manualCantidad && (
              <p className="text-xs font-semibold" style={{ color: colors.brand }}>
                {Math.round(parseFloat(manualCantidad) || 0)} unidades
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Lote" value={manualLote} onChange={e => setManualLote(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Observaciones</label>
              <textarea value={manualObservaciones} onChange={e => setManualObservaciones(e.target.value)}
                placeholder="Observaciones (opcional)" rows={2} className={textareaClass} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={agregarManualALista} disabled={!operarioSel}>
                <Plus size={14} /> Agregar a lista
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Pre-carga */}
      {preCarga.length > 0 && (
        <div style={{ backgroundColor: colors.surface, borderRadius: radius.xl, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
          <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
            <h2 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Pre-carga ({preCarga.length})</h2>
            <Button variant="primary" onClick={confirmarYRegistrarTodo} loading={confirmando}>
              <ClipboardCheck size={14} /> {confirmando ? 'Guardando…' : `Confirmar y registrar todo (${preCarga.length})`}
            </Button>
          </div>
          <Table className="min-w-[680px]">
            <Thead>
              <Tr>
                <Th>Lote</Th><Th>Operario</Th><Th>Producto</Th><Th>Cantidad</Th><Th>Observaciones</Th><Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {preCarga.map(item => {
                const tp = item.tipo_producto || (item.categoria || '').toLowerCase()
                const esHelado    = tp === 'helado'
                const esImpulsivo = tp === 'impulsivo' || (!esHelado && (item.categoria || '').toLowerCase().includes('impulsiv'))
                const esPostre    = tp === 'postre'
                const unidades = Number(item._unidades) || 0
                const kgReal   = Number(item.peso_kg || 0)
                const displayCantidad = esHelado
                  ? `${unidades} balde${unidades !== 1 ? 's' : ''}${kgReal > 0 ? ` / ${kgReal.toFixed(1)} kg` : ''}`
                  : esImpulsivo
                    ? `${unidades} unidad${unidades !== 1 ? 'es' : ''}`
                    : esPostre
                      ? `${unidades} unidad${unidades !== 1 ? 'es' : ''}${kgReal > 0 ? ` / ${kgReal.toFixed(1)} kg` : ''}`
                      : `${kgReal.toFixed(3)} kg`
                return (
                <Tr key={item._id}>
                  <Td className="font-bold whitespace-nowrap" style={{ color: colors.brand }}>{item.lote}</Td>
                  <Td className="whitespace-nowrap">{item.operario_nombre}</Td>
                  <Td className="font-medium">{item.producto_nombre}</Td>
                  <Td className="text-right whitespace-nowrap">{displayCantidad}</Td>
                  <Td>
                    <input
                      type="text"
                      value={item.observaciones}
                      onChange={e => actualizarObsPreCarga(item._id, e.target.value)}
                      placeholder="Agregar observación..."
                      className={obsInputClass}
                    />
                  </Td>
                  <Td>
                    <button
                      onClick={() => quitarDePreCarga(item._id)}
                      title="Quitar de la lista"
                      className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[rgba(239,68,68,0.12)] transition-colors"
                      style={{ color: colors.danger }}
                    >
                      <X size={14} />
                    </button>
                  </Td>
                </Tr>
                )
              })}
            </Tbody>
          </Table>
        </div>
      )}

      {/* Feed de registros del día */}
      <div style={{ backgroundColor: colors.surface, borderRadius: radius.xl, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <h2 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Registros de hoy</h2>
          <span className="text-xs" style={{ color: colors.textMuted }}>últimos 50</span>
        </div>
        {loading ? (
          <div className="p-10 flex justify-center"><Spinner size={24} /></div>
        ) : registros.length === 0 ? (
          <EmptyState icon={Package} title="Sin registros hoy" subtitle="Escaneá un código o cargá manualmente para comenzar" />
        ) : (
          <Table className="min-w-[640px]">
            <Thead>
              <Tr>
                <Th>Lote</Th><Th>Operario</Th><Th>Producto</Th><Th>Kg</Th><Th>Observaciones</Th>
              </Tr>
            </Thead>
            <Tbody>
              {registros.map(r => (
                <Tr key={r.id}>
                  <Td className="font-bold whitespace-nowrap" style={{ color: colors.brand }}>{r.lote || '—'}</Td>
                  <Td className="whitespace-nowrap">{r.operario_nombre || '—'}</Td>
                  <Td className="font-medium">{r.producto_nombre}</Td>
                  <Td className="text-right whitespace-nowrap">{(() => {
                    const c = (r.categoria || '').toLowerCase()
                    if (c.includes('impulsiv')) return `${Math.round(r.peso_kg || 0)} u`
                    return `${fmtPeso(r.peso_kg, 'kg')} kg`
                  })()}</Td>
                  <Td>{r.observaciones || '—'}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>

      {/* Gestionar operarios */}
      <Modal
        open={modalOperarios}
        onClose={() => { setModalOperarios(false); setNuevoOpNombre('') }}
        title="Gestionar Operarios"
        maxWidth="max-w-md"
        footer={
          <Button variant="secondary" onClick={() => { setModalOperarios(false); setNuevoOpNombre('') }} className="w-full">
            Cerrar
          </Button>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: colors.textPrimary }}>Operarios activos</p>
            {operarios.length === 0 ? (
              <p className="text-sm" style={{ color: colors.textMuted }}>No hay operarios activos registrados</p>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {operarios.map(o => (
                  <div key={o.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: colors.bg }}>
                    <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>{o.nombre}</span>
                    <button
                      onClick={() => eliminarOperario(o.id)}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-[rgba(239,68,68,0.12)] transition-colors flex-shrink-0"
                      style={{ color: colors.danger }}
                      title="Eliminar operario"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '12px' }}>
            <p className="text-sm font-semibold mb-2" style={{ color: colors.textPrimary }}>Agregar nuevo operario</p>
            <div className="flex gap-2">
              <Input
                placeholder="Nombre completo..."
                value={nuevoOpNombre}
                onChange={e => setNuevoOpNombre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !savingOp && nuevoOpNombre.trim() && agregarOperario()}
              />
              <Button variant="primary" onClick={agregarOperario} loading={savingOp} disabled={!nuevoOpNombre.trim()}>
                <Plus size={14} />
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Informe del día */}
      <Modal
        open={modalInforme}
        onClose={() => setModalInforme(false)}
        title={`Informe del día — ${fechaHoy}`}
        maxWidth="max-w-3xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalInforme(false)} className="flex-1">Cerrar</Button>
            <Button variant="primary" onClick={imprimirInforme} disabled={informeData.length === 0} className="flex-1">
              <Printer size={14} /> Imprimir A4
            </Button>
          </>
        }
      >
        {cargandoInforme ? (
          <div className="flex justify-center py-10"><Spinner size={24} /></div>
        ) : informeData.length === 0 ? (
          <EmptyState icon={FileText} title="Sin registros" subtitle="Todavía no hay producción registrada hoy" />
        ) : (
          <div className="space-y-5">
            <div className="overflow-x-auto max-h-72 overflow-y-auto" style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md }}>
              <Table className="min-w-[560px]">
                <Thead>
                  <Tr>
                    <Th>Hora</Th><Th>Producto</Th><Th>Categoría</Th><Th>Operario</Th><Th>Cantidad</Th><Th>Lote</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {informeData.map(r => (
                    <Tr key={r.id}>
                      <Td>{new Date(r.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</Td>
                      <Td className="font-medium">{r.producto_nombre}</Td>
                      <Td>{r.categoria || '—'}</Td>
                      <Td>{r.operario_nombre || '—'}</Td>
                      <Td className="text-right">{fmtPeso(r.peso_kg, unidadDe(r))} {unidadDe(r)}</Td>
                      <Td>{r.lote || '—'}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: colors.textPrimary }}>Subtotales por operario</p>
              <div className="overflow-hidden" style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md }}>
                <Table>
                  <Thead>
                    <Tr><Th>Operario</Th><Th>Registros</Th><Th>Cantidad total</Th></Tr>
                  </Thead>
                  <Tbody>
                    {subtotales.map(s => (
                      <Tr key={s.operario}>
                        <Td className="font-medium">{s.operario}</Td>
                        <Td>{s.registros}</Td>
                        <Td className="text-right font-semibold" style={{ color: colors.brand }}>{fmtNum(s.cantidad)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
