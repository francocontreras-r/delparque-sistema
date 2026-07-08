import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  dibujarPortada, dibujarEncabezado, dibujarPie, dibujarSeccion,
  getEstiloInforme, PDF_CONTENT_Y, PDF_NEGRO, PDF_BLANCO,
  PDF_SEM_NEG, PDF_SEM_CRIT, PDF_SEM_OK,
} from '../lib/pdfEstilos'
import { useUser } from '../context/UserContext'
import { deduplicarOperarios } from '../lib/operarios'
import { POSTRES } from '../lib/postres'
import { exportarCSV } from '../lib/exportar'
import { compararConsumo } from '../lib/consumoTeoricoReal'
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
import { colors, radius, shadow } from '../styles/design-system'
import { TrendingDown, Plus, DollarSign, User, FileDown } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const TABS   = ['Por Sabor', 'Por Operario', 'Por Causa', 'Historial']
const MESES  = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const CAUSAS = [
  'Derrame accidental', 'Falla de equipo', 'Producto fuera de norma',
  'Vencimiento', 'Error de pesaje', 'Limpieza de línea', 'Otra',
]

function OrigenBadge({ causa }) {
  const c = causa || ''
  if (c.includes('base→sabor'))
    return <Badge variant="info" className="whitespace-nowrap">BASE→SABOR</Badge>
  if (CAUSAS.some(m => c.includes(m)))
    return <Badge variant="neutral">MANUAL</Badge>
  return <Badge variant="success">AUTO</Badge>
}

const TIPO_PRECIOS = {
  Lisa:           { costo_kg: 1200, precio_kg: 2800 },
  'Con Agregado': { costo_kg: 1500, precio_kg: 3200 },
  Agua:           { costo_kg:  900, precio_kg: 2200 },
  Especial:       { costo_kg: 2000, precio_kg: 4500 },
}

const textareaClass = 'w-full rounded-lg border border-[#334155] text-sm text-[#F1F5F9] placeholder:text-[#64748B] bg-[#0F172A] outline-none transition-colors duration-150 px-3 py-2 resize-none focus:ring-2 focus:ring-[#FF4713]/25 focus:border-[#FF4713]'

function pctColor(pct) {
  if (pct < 3)  return colors.success
  if (pct < 8)  return colors.warning
  return colors.danger
}

function pctVariant(pct) {
  if (pct < 3)  return 'success'
  if (pct < 8)  return 'warning'
  return 'danger'
}

// Veredicto de tolerancia fija: <3% aceptable · 3-8% moderada · >8% excesiva
function evalMermaLabel(pct) {
  if (pct < 3)  return 'Aceptable'
  if (pct < 8)  return 'Moderada'
  return 'Excesiva'
}

// Veredicto contra el estándar de la receta (merma esperada del sabor).
// Si no hay estándar cargado, cae a la tolerancia fija.
function evalEstandarLabel(pct, esp) {
  if (esp == null || esp <= 0) return evalMermaLabel(pct)
  const r = pct / esp
  if (r <= 1.05) return 'En estándar'
  if (r <= 1.5)  return 'Sobre estándar'
  return 'Excesiva'
}
function evalEstandarVariant(pct, esp) {
  if (esp == null || esp <= 0) return pctVariant(pct)
  const r = pct / esp
  if (r <= 1.05) return 'success'
  if (r <= 1.5)  return 'warning'
  return 'danger'
}

function pesos(n) { return Math.round(n || 0).toLocaleString('es-AR') }

// Las mermas automáticas guardan el número de orden en "observaciones" como "Orden <numero>".
function ordenNumero(m) {
  const match = (m.observaciones || '').match(/^Orden (.+)$/)
  return match ? match[1] : '—'
}

function EsperadaInput({ value, onCommit }) {
  const [val, setVal] = useState(value ?? '')
  useEffect(() => { setVal(value ?? '') }, [value])
  return (
    <div className="flex items-center gap-1">
      <input type="number" min="0" step="0.1" value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => onCommit(val)}
        placeholder="5"
        className="w-20 rounded-md border border-[#334155] bg-[#0F172A] text-[#F1F5F9] text-sm px-2 py-1.5 outline-none transition-colors focus:border-[#FF4713]" />
      <span className="text-xs" style={{ color: colors.textMuted }}>%</span>
    </div>
  )
}

function AgrupacionList({ filas }) {
  if (filas.length === 0) return <EmptyState icon={TrendingDown} title="Sin datos" subtitle="Registrá mermas para ver el análisis" />
  return (
    <div className="space-y-2">
      {filas.map(f => (
        <div key={f.nombre} className="p-4 flex items-center gap-3" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: pctColor(f.pct) }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>{f.nombre}</p>
            <p className="text-xs" style={{ color: colors.textMuted }}>
              {f.cnt} registro{f.cnt !== 1 ? 's' : ''} · {f.teo.toFixed(1)} kg teóricos
              {f.esperada != null && ` · esperada ${f.esperada}%`}
            </p>
          </div>
          <span className="text-sm font-bold flex-shrink-0" style={{ color: colors.danger }}>{f.dif.toFixed(2)} kg</span>
          <Badge variant={f.esperada != null ? evalEstandarVariant(f.pct, f.esperada) : pctVariant(f.pct)}>
            {f.esperada != null ? evalEstandarLabel(f.pct, f.esperada) : evalMermaLabel(f.pct)} · {f.pct.toFixed(1)}%
          </Badge>
        </div>
      ))}
    </div>
  )
}

export default function Mermas() {
  const { isAdmin, user } = useUser()
  const [tab, setTab]             = useState('Por Sabor')
  const [mermas, setMermas]       = useState([])
  const [sabores, setSabores]     = useState([])
  const [operarios, setOperarios] = useState([])
  const [impulsivos, setImpulsivos] = useState([])
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)
  const [modal, setModal]         = useState(false)
  const [saving, setSaving]       = useState(false)
  const [generandoPDF, setGenerandoPDF] = useState(false)
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    sabor_nombre: '', operario_nombre: '',
    kg_teoricos: '', kg_reales: '',
    causa: CAUSAS[0], observaciones: '',
  })

  // ── Teórico vs Real (control de consumo) ────────────────────────────────────
  const ahora = new Date()
  const [tvrMes, setTvrMes]   = useState(ahora.getMonth() + 1)
  const [tvrAnio, setTvrAnio] = useState(ahora.getFullYear())
  const [tvrCtx, setTvrCtx]   = useState(null)
  const [tvrIngresos, setTvrIngresos] = useState([])
  const [tvrEgresos, setTvrEgresos]   = useState([])
  const [tvrLoading, setTvrLoading]   = useState(false)

  useEffect(() => { cargar() }, [])

  // Carga perezosa: solo cuando se abre la pestaña o cambia el período.
  useEffect(() => {
    if (tab !== 'Teórico vs Real') return
    let vivo = true
    ;(async () => {
      setTvrLoading(true)
      const mm = String(tvrMes).padStart(2, '0')
      const desde = `${tvrAnio}-${mm}-01`
      const ultimo = new Date(tvrAnio, tvrMes, 0).getDate()
      const hasta = `${tvrAnio}-${mm}-${String(ultimo).padStart(2, '0')}`
      const [sab, si, bas, bi, imp, ii, ins, cam, egr] = await Promise.all([
        supabase.from('sabores').select('*'),
        supabase.from('sabor_ingredientes').select('*'),
        supabase.from('bases').select('*'),
        supabase.from('base_ingredientes').select('*'),
        supabase.from('impulsivos').select('*'),
        supabase.from('impulsivo_ingredientes').select('*'),
        supabase.from('insumos').select('nombre,costo_unitario'),
        supabase.from('movimientos_camara').select('producto_nombre,sabor_nombre,tipo_producto,kg,baldes,fecha').eq('tipo', 'ingreso').gte('fecha', desde).lte('fecha', hasta).limit(5000),
        supabase.from('movimientos_deposito').select('producto_nombre,cantidad,fecha').eq('tipo', 'egreso').gte('fecha', desde).lte('fecha', hasta).limit(5000),
      ])
      if (!vivo) return
      setTvrCtx({
        sabores: sab.data || [], saborIngredientes: si.data || [],
        bases: bas.data || [], baseIngredientes: bi.data || [],
        impulsivos: imp.data || [], impulsivoIngredientes: ii.data || [],
        insumos: ins.data || [],
      })
      setTvrIngresos(cam.data || [])
      setTvrEgresos(egr.data || [])
      setTvrLoading(false)
    })()
    return () => { vivo = false }
  }, [tab, tvrMes, tvrAnio])

  const tvr = useMemo(
    () => tvrCtx ? compararConsumo({ camaraIngresos: tvrIngresos, ctx: tvrCtx, egresos: tvrEgresos }) : null,
    [tvrCtx, tvrIngresos, tvrEgresos]
  )

  async function cargar() {
    const [{ data: m }, { data: s }, { data: o }, { data: imp }] = await Promise.all([
      supabase.from('mermas').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('stock_camaras').select('*').order('nombre'),
      supabase.from('operarios').select('*').order('nombre'),
      supabase.from('impulsivos').select('nombre,costo_total'),
    ])
    setMermas(m || [])
    setSabores(s || [])
    setOperarios(deduplicarOperarios(o))
    setImpulsivos(imp || [])
    setLoading(false)
  }

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const diferencia = useMemo(() => {
    const t = parseFloat(form.kg_teoricos) || 0
    const r = parseFloat(form.kg_reales) || 0
    return t > 0 ? { dif: t - r, pct: ((t - r) / t) * 100 } : null
  }, [form.kg_teoricos, form.kg_reales])

  async function guardar() {
    if (!form.sabor_nombre || !form.kg_teoricos || !form.kg_reales) {
      toast2('Completa los campos obligatorios', 'error'); return
    }
    setSaving(true)
    const t = parseFloat(form.kg_teoricos)
    const r = parseFloat(form.kg_reales)
    const dif = t - r
    const pct = t > 0 ? (dif / t) * 100 : 0
    const { error } = await supabase.from('mermas').insert({
      fecha: form.fecha, sabor_nombre: form.sabor_nombre,
      operario_nombre: (form.operario_nombre || '').toUpperCase() || null,
      kg_teoricos: t, kg_reales: r, diferencia: dif, porcentaje: pct,
      causa: form.causa, observaciones: form.observaciones || null,
      usuario_email: user?.email || null,
    })
    setSaving(false)
    if (error) { toast2(error.message, 'error'); return }
    toast2('Merma registrada')
    setModal(false)
    setForm(f => ({ ...f, sabor_nombre: '', kg_teoricos: '', kg_reales: '', observaciones: '' }))
    cargar()
  }

  async function guardarEsperada(saborId, value) {
    const v = parseFloat(value)
    const nuevo = (value === '' || isNaN(v)) ? null : v
    const { error } = await supabase.from('stock_camaras').update({ merma_esperada: nuevo }).eq('id', saborId)
    if (error) { toast2(error.message, 'error'); return }
    setSabores(prev => prev.map(s => s.id === saborId ? { ...s, merma_esperada: nuevo } : s))
    toast2('Estándar actualizado')
  }

  function agrupar(keyFn) {
    const m = {}
    mermas.forEach(r => {
      const k = keyFn(r) || 'Sin especificar'
      if (!m[k]) m[k] = { nombre: k, dif: 0, teo: 0, cnt: 0 }
      m[k].dif += r.diferencia || 0
      m[k].teo += r.kg_teoricos || 0
      m[k].cnt++
    })
    return Object.values(m).map(s => ({ ...s, pct: s.teo > 0 ? (s.dif / s.teo) * 100 : 0 })).sort((a, b) => b.pct - a.pct)
  }

  const costoKgPorSabor = useMemo(() => {
    const m = {}
    sabores.forEach(s => {
      const costo = s.costo_kg ?? TIPO_PRECIOS[s.tipo]?.costo_kg ?? 0
      m[(s.nombre || '').trim().toLowerCase()] = costo
    })
    return m
  }, [sabores])

  // Costo por UNIDAD de impulsivos y postres (para costear sus mermas en unidades)
  const costoUnidadPorNombre = useMemo(() => {
    const m = {}
    impulsivos.forEach(i => { m[(i.nombre || '').trim().toLowerCase()] = i.costo_total || 0 })
    POSTRES.forEach(p => { m[(p.nombre || '').trim().toLowerCase()] = p.costo_total || 0 })
    return m
  }, [impulsivos])

  function costoMerma(m) {
    // Impulsivos/postres: la merma viene en unidades → costo unitario × unidades
    if (m.unidades != null && m.unidades > 0) {
      const cu = costoUnidadPorNombre[(m.sabor_nombre || '').trim().toLowerCase()] || 0
      return m.unidades * cu
    }
    // Resto (helados/sabores): costo por kg
    const costoKg = costoKgPorSabor[(m.sabor_nombre || '').trim().toLowerCase()] || 0
    return (m.diferencia || 0) * costoKg
  }

  const esperadaPorSabor = useMemo(() => {
    const m = {}
    sabores.forEach(s => {
      if (s.merma_esperada != null && s.merma_esperada !== '') {
        m[(s.nombre || '').trim().toLowerCase()] = Number(s.merma_esperada)
      }
    })
    return m
  }, [sabores])

  const porSabor    = useMemo(() => agrupar(r => r.sabor_nombre).map(f => ({
    ...f, esperada: esperadaPorSabor[(f.nombre || '').trim().toLowerCase()] ?? null,
  })), [mermas, esperadaPorSabor])
  const porOperario = useMemo(() => agrupar(r => r.operario_nombre), [mermas])
  const porCausa    = useMemo(() => {
    const m = {}
    mermas.forEach(r => {
      const k = r.causa || 'Sin especificar'
      if (!m[k]) m[k] = { causa: k, dif: 0, costo: 0, cnt: 0 }
      m[k].dif += r.diferencia || 0
      m[k].costo += costoMerma(r)
      m[k].cnt++
    })
    return Object.values(m).sort((a, b) => b.dif - a.dif)
  }, [mermas, costoKgPorSabor])

  const totalDif  = mermas.reduce((a, m) => a + (m.diferencia || 0), 0)
  const totalTeo  = mermas.reduce((a, m) => a + (m.kg_teoricos || 0), 0)
  const pctGlobal = totalTeo > 0 ? (totalDif / totalTeo) * 100 : 0
  const totalCostoMermas = useMemo(() => (
    mermas.reduce((a, m) => a + costoMerma(m), 0)
  ), [mermas, costoKgPorSabor])

  const mermaDelMes = useMemo(() => {
    const ahora = new Date()
    const ym = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
    return mermas.filter(m => (m.fecha || '').startsWith(ym)).reduce((a, m) => a + (m.diferencia || 0), 0)
  }, [mermas])

  const operarioMasMerma = useMemo(() => {
    if (porOperario.length === 0) return null
    return [...porOperario].sort((a, b) => b.dif - a.dif)[0]
  }, [porOperario])

  function generarPDF() {
    if (mermas.length === 0) { toast2('No hay mermas para exportar', 'error'); return }
    setGenerandoPDF(true)
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pw  = doc.internal.pageSize.getWidth()
      const ph  = doc.internal.pageSize.getHeight()
      const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      const MOD = 'Mermas'
      const EST = getEstiloInforme()

      // jsPDF (Helvetica) solo soporta Latin-1: reemplaza flechas y descarta
      // caracteres fuera de rango que se verían como "códigos raros".
      const safe = s => [...String(s ?? '').replace(/[→➜➡]/g, '->').replace(/[←]/g, '<-')]
        .filter(ch => ch.charCodeAt(0) <= 255).join('').trim() || '—'

      // Color semántico y veredicto por % de merma (tolerancia: <3% ok · 3-8% media · >8% alta)
      const semPct = p => p < 3 ? PDF_SEM_OK : p < 8 ? PDF_SEM_CRIT : PDF_SEM_NEG
      const evalInfo = p => p < 3 ? { label: 'ACEPTABLE', col: PDF_SEM_OK } : p < 8 ? { label: 'MODERADA', col: PDF_SEM_CRIT } : { label: 'EXCESIVA', col: PDF_SEM_NEG }
      // Veredicto contra el estándar de la receta (si hay merma esperada cargada)
      const evalEstandar = (p, esp) => {
        if (esp == null || esp <= 0) return evalInfo(p)
        const r = p / esp
        if (r <= 1.05) return { label: 'EN ESTÁNDAR', col: PDF_SEM_OK }
        if (r <= 1.5)  return { label: 'SOBRE ESTÁNDAR', col: PDF_SEM_CRIT }
        return { label: 'EXCESIVA', col: PDF_SEM_NEG }
      }
      const tint = (c, fr) => [Math.round(c[0] + (255 - c[0]) * fr), Math.round(c[1] + (255 - c[1]) * fr), Math.round(c[2] + (255 - c[2]) * fr)]
      const esClaro = c => (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) > 150
      // Estándar global ponderado por kg teórico (para el veredicto general)
      const conEsp = porSabor.filter(s => s.esperada != null)
      const totEspTeo = conEsp.reduce((a, s) => a + s.teo, 0)
      const espGlobal = totEspTeo > 0 ? conEsp.reduce((a, s) => a + s.teo * s.esperada, 0) / totEspTeo : null

      // Período a partir del rango de fechas registradas
      const fechasOrden = mermas.map(m => m.fecha).filter(Boolean).sort()
      const periodo = fechasOrden.length
        ? `${fechasOrden[0]} a ${fechasOrden[fechasOrden.length - 1]}`
        : null

      // ── Pág 1: Portada ──
      dibujarPortada(doc, pw, ph, MOD, 'Informe de Mermas y Pérdidas',
        periodo ? `${periodo} · ${mermas.length} registros` : `${mermas.length} registros`, fecha)

      // ── Pág 2: Resumen ──
      doc.addPage()
      dibujarEncabezado(doc, pw, MOD, 'Resumen de Mermas', fecha)
      dibujarPie(doc, pw, ph, 2)

      // KPI cards con acento semántico superior
      const cards = [
        { l: 'Registros',     v: String(mermas.length),            c: PDF_NEGRO },
        { l: 'Kg perdidos',   v: `${totalDif.toFixed(1)} kg`,       c: totalDif > 0 ? PDF_SEM_NEG : PDF_SEM_OK },
        { l: '% global',      v: `${pctGlobal.toFixed(1)}%`,        c: semPct(pctGlobal) },
        { l: 'Costo estimado', v: `$${pesos(totalCostoMermas)}`,    c: totalCostoMermas > 0 ? PDF_SEM_NEG : PDF_SEM_OK },
      ]
      const gap = 4
      const cardW = (pw - 28 - gap * 3) / 4
      const cardH = 24
      const cardY = PDF_CONTENT_Y - 2
      cards.forEach((c, i) => {
        const x = 14 + i * (cardW + gap)
        doc.setDrawColor(...PDF_NEGRO); doc.setLineWidth(0.3); doc.rect(x, cardY, cardW, cardH)
        doc.setFillColor(...c.c); doc.rect(x, cardY, cardW, 1.4, 'F')
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(90, 90, 90)
        doc.text(c.l.toUpperCase(), x + 3, cardY + 8)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...PDF_NEGRO)
        doc.text(c.v, x + 3, cardY + 17)
      })

      // Banner de veredicto global (¿la merma es aceptable?)
      const evG = evalEstandar(pctGlobal, espGlobal)
      const banSub = espGlobal != null
        ? `Merma global ${pctGlobal.toFixed(1)}%  vs  estándar de receta ${espGlobal.toFixed(1)}%   ·   En estándar / Sobre estándar (hasta 1,5x) / Excesiva`
        : `Merma global ${pctGlobal.toFixed(1)}%   ·   Tolerancia:  <3% aceptable   ·   3-8% moderada   ·   >8% excesiva`
      const banY = cardY + cardH + 6
      doc.setFillColor(...tint(evG.col, 0.86)); doc.setDrawColor(...evG.col); doc.setLineWidth(0.3)
      doc.rect(14, banY, pw - 28, 9, 'FD')
      doc.setFillColor(...evG.col); doc.rect(14, banY, 2, 9, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...evG.col)
      doc.text(`EVALUACIÓN GLOBAL: ${evG.label}`, 18, banY + 5.6)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(70, 70, 70)
      doc.text(banSub, 72, banY + 5.6)

      // Tabla: Mermas por sabor
      let y = dibujarSeccion(doc, pw, 'Mermas por sabor', banY + 9 + 6)
      autoTable(doc, {
        ...EST,
        startY: y,
        head: [['Producto', 'Reg.', 'Kg teórico', 'Kg real', 'Merma', '%', 'Esperada', 'Evaluación']],
        body: porSabor.map(s => [
          safe(s.nombre), String(s.cnt),
          s.teo.toFixed(1), (s.teo - s.dif).toFixed(1),
          `${s.dif.toFixed(1)} kg`, `${s.pct.toFixed(1)}%`,
          s.esperada != null ? `${s.esperada}%` : '—', evalEstandar(s.pct, s.esperada).label,
        ]),
        columnStyles: {
          0: { cellWidth: 40 },
          1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
          4: { halign: 'right' }, 5: { halign: 'right' },
          6: { halign: 'right' }, 7: { halign: 'center', cellWidth: 26 },
        },
        didParseCell: d => {
          if (d.section !== 'body') return
          const s = porSabor[d.row.index]
          const pct = s?.pct ?? 0
          if (d.column.index === 4) { d.cell.styles.textColor = PDF_SEM_NEG; d.cell.styles.fontStyle = 'bold' }
          if (d.column.index === 5) { d.cell.styles.textColor = semPct(pct); d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = tint(semPct(pct), 0.82) }
          if (d.column.index === 6) { d.cell.styles.textColor = [110, 110, 110] }
          if (d.column.index === 7) { const e = evalEstandar(pct, s?.esperada); d.cell.styles.fillColor = e.col; d.cell.styles.textColor = esClaro(e.col) ? PDF_NEGRO : PDF_BLANCO; d.cell.styles.fontStyle = 'bold' }
        },
        didDrawPage: () => {
          dibujarEncabezado(doc, pw, MOD, 'Resumen de Mermas', fecha)
          dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
        },
      })

      // Tabla: Mermas por operario
      y = dibujarSeccion(doc, pw, 'Mermas por operario', doc.lastAutoTable.finalY + 8)
      autoTable(doc, {
        ...EST,
        startY: y,
        head: [['Operario', 'Reg.', 'Kg teórico', 'Merma', '%', 'Evaluación']],
        body: porOperario.map(o => [
          safe(o.nombre), String(o.cnt),
          o.teo.toFixed(1), `${o.dif.toFixed(1)} kg`, `${o.pct.toFixed(1)}%`, evalInfo(o.pct).label,
        ]),
        columnStyles: {
          0: { cellWidth: 56 },
          1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
          5: { halign: 'center', cellWidth: 24 },
        },
        didParseCell: d => {
          if (d.section !== 'body') return
          const pct = porOperario[d.row.index]?.pct ?? 0
          if (d.column.index === 3) { d.cell.styles.textColor = PDF_SEM_NEG; d.cell.styles.fontStyle = 'bold' }
          if (d.column.index === 4) { d.cell.styles.textColor = semPct(pct); d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = tint(semPct(pct), 0.82) }
          if (d.column.index === 5) { const e = evalInfo(pct); d.cell.styles.fillColor = e.col; d.cell.styles.textColor = esClaro(e.col) ? PDF_NEGRO : PDF_BLANCO; d.cell.styles.fontStyle = 'bold' }
        },
        didDrawPage: () => {
          dibujarEncabezado(doc, pw, MOD, 'Resumen de Mermas', fecha)
          dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
        },
      })

      // Tabla: Mermas por causa
      y = dibujarSeccion(doc, pw, 'Mermas por causa', doc.lastAutoTable.finalY + 8)
      autoTable(doc, {
        ...EST,
        startY: y,
        head: [['Causa', 'Reg.', 'Kg perdidos', '% del total', 'Costo']],
        body: porCausa.map(c => [
          safe(c.causa), String(c.cnt),
          `${c.dif.toFixed(1)} kg`,
          `${totalDif > 0 ? ((c.dif / totalDif) * 100).toFixed(1) : '0.0'}%`,
          `$${pesos(c.costo)}`,
        ]),
        columnStyles: {
          0: { cellWidth: 60 },
          1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
        },
        didParseCell: d => {
          if (d.section !== 'body') return
          if (d.column.index === 2 || d.column.index === 4) { d.cell.styles.textColor = PDF_SEM_NEG; d.cell.styles.fontStyle = 'bold' }
        },
        didDrawPage: () => {
          dibujarEncabezado(doc, pw, MOD, 'Resumen de Mermas', fecha)
          dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
        },
      })

      doc.save(`Mermas_${fecha.replace(/\//g, '-')}.pdf`)
    } catch (e) {
      toast2(`Error al generar PDF: ${e.message}`, 'error')
    } finally {
      setGenerandoPDF(false)
    }
  }

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      <PageHeader
        title="Mermas"
        subtitle="Tolerancia: <3% verde · 3-8% amarillo · >8% rojo"
        actions={<>
          <Button variant="secondary" onClick={() => exportarCSV('mermas', [
            { header: 'Fecha', get: m => m.fecha || '' },
            { header: 'Orden', get: m => ordenNumero(m) },
            { header: 'Producto', get: m => m.sabor_nombre || '' },
            { header: 'Operario', get: m => m.operario_nombre || '' },
            { header: 'Kg teórico', get: m => m.kg_teoricos ?? '' },
            { header: 'Kg real', get: m => m.kg_reales ?? '' },
            { header: 'Diferencia kg', get: m => (m.diferencia || 0).toFixed(2) },
            { header: 'Unidades', get: m => m.unidades ?? '' },
            { header: '% Merma', get: m => (m.porcentaje || 0).toFixed(1) },
            { header: 'Costo $', get: m => Math.round(costoMerma(m)) },
            { header: 'Causa', get: m => m.causa || '' },
          ], mermas)} disabled={loading || mermas.length === 0}>
            <FileDown size={15} /> Excel
          </Button>
          <Button variant="secondary" onClick={generarPDF} loading={generandoPDF} disabled={loading || mermas.length === 0}>
            <FileDown size={15} /> Informe PDF
          </Button>
          <Button variant="primary" onClick={() => setModal(true)}>
            <Plus size={15} /> Registrar
          </Button>
        </>}
      />

      <div className={`grid grid-cols-2 sm:grid-cols-3 ${isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3`}>
        <KpiCard label="KG perdidos" value={loading ? '—' : totalDif.toFixed(1)} color={totalDif > 0 ? colors.danger : undefined} icon={TrendingDown} />
        <KpiCard label="KG merma del mes" value={loading ? '—' : mermaDelMes.toFixed(1)} color={mermaDelMes > 0 ? colors.danger : undefined} icon={TrendingDown} />
        <KpiCard label="% global"    value={loading ? '—' : pctGlobal.toFixed(1) + '%'} color={pctColor(pctGlobal)} />
        <KpiCard label="Operario con más merma"
          value={loading ? '—' : (operarioMasMerma?.nombre || '—')}
          sub={operarioMasMerma ? `${operarioMasMerma.dif.toFixed(1)} kg perdidos` : undefined}
          icon={User} />
        {isAdmin && (
          <KpiCard label="Costo total mermas" value={loading ? '—' : `$${pesos(totalCostoMermas)}`} color={colors.danger} icon={DollarSign} />
        )}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {(isAdmin ? [...TABS, 'Teórico vs Real', 'Estándares'] : TABS).map(t => (
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
      ) : (
        <>
          {tab === 'Por Sabor'    && <AgrupacionList filas={porSabor} />}
          {tab === 'Por Operario' && <AgrupacionList filas={porOperario} />}

          {tab === 'Teórico vs Real' && (
            <div className="space-y-3">
              <div className="flex items-start justify-between flex-wrap gap-3 p-3 rounded-lg"
                style={{ backgroundColor: 'rgba(59,130,246,0.06)', border: `1px solid ${colors.border}` }}>
                <p className="text-xs max-w-2xl" style={{ color: colors.textSecondary }}>
                  Compara la materia prima que la producción <b>debería</b> haber consumido (según las recetas, a partir de lo que entró a cámara) contra lo que <b>realmente salió</b> del depósito.{' '}
                  <b style={{ color: colors.danger }}>Variación &gt; 0</b> = se usó de más (posible merma/robo/error de receta).{' '}
                  <b style={{ color: colors.warning }}>&lt; 0</b> = se produjo sin registrar el egreso.
                </p>
                <div className="flex gap-2">
                  <Select value={tvrMes} onChange={e => setTvrMes(Number(e.target.value))}>
                    {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </Select>
                  <Select value={tvrAnio} onChange={e => setTvrAnio(Number(e.target.value))}>
                    {[ahora.getFullYear(), ahora.getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
                  </Select>
                </div>
              </div>

              {tvrLoading || !tvr ? (
                <div className="flex justify-center py-14"><Spinner size={28} /></div>
              ) : tvr.filas.length === 0 ? (
                <EmptyState icon={TrendingDown} title="Sin datos en el período" subtitle="No hay producción en cámara ni egresos de depósito para comparar en este mes." />
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiCard label="Consumo teórico" value={`$${pesos(tvr.totalTeorico)}`} color={colors.info} icon={DollarSign} />
                    <KpiCard label="Consumo real" value={`$${pesos(tvr.totalReal)}`} color={colors.brand} icon={DollarSign} />
                    <KpiCard label="Variación total"
                      value={`${tvr.totalVariacion >= 0 ? '+' : '-'}$${pesos(Math.abs(tvr.totalVariacion))}`}
                      color={tvr.totalVariacion > 0 ? colors.danger : colors.success} icon={TrendingDown} />
                    <KpiCard label="Consumo de más" value={`$${pesos(tvr.valorDeMas)}`}
                      sub="por encima de lo teórico" color={colors.danger} icon={TrendingDown} />
                  </div>

                  {tvr.sinReceta.length > 0 && (
                    <div className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
                      Sin receta (no se pudo calcular su consumo teórico): {tvr.sinReceta.join(', ')}
                    </div>
                  )}

                  <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                    <div className="overflow-x-auto">
                      <Table className="min-w-[620px]">
                        <Thead>
                          <Tr>
                            <Th>Insumo</Th>
                            <Th className="text-right">Teórico</Th>
                            <Th className="text-right">Real</Th>
                            <Th className="text-right">Variación</Th>
                            <Th className="text-right">%</Th>
                            <Th className="text-right">$ Variación</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {tvr.filas.map(f => {
                            const col = f.variacion > 0.001 ? colors.danger : f.variacion < -0.001 ? colors.warning : colors.textMuted
                            return (
                              <Tr key={f.nombre}>
                                <Td className="font-medium">{f.nombre}</Td>
                                <Td className="text-right text-xs">{f.teorico.toFixed(2)}</Td>
                                <Td className="text-right text-xs">{f.real.toFixed(2)}</Td>
                                <Td className="text-right font-semibold" style={{ color: col }}>{f.variacion > 0 ? '+' : ''}{f.variacion.toFixed(2)}</Td>
                                <Td className="text-right text-xs" style={{ color: col }}>{f.teorico > 0 ? `${f.variacionPct > 0 ? '+' : ''}${f.variacionPct.toFixed(0)}%` : '—'}</Td>
                                <Td className="text-right font-semibold" style={{ color: f.valorVariacion > 0.5 ? colors.danger : f.valorVariacion < -0.5 ? colors.success : colors.textMuted }}>
                                  {f.valorVariacion >= 0 ? '+' : '-'}${pesos(Math.abs(f.valorVariacion))}
                                </Td>
                              </Tr>
                            )
                          })}
                        </Tbody>
                      </Table>
                    </div>
                  </div>
                  <p className="text-[11px]" style={{ color: colors.textMuted }}>
                    Requiere que los <b>egresos de depósito</b> estén registrados para ser exacto. Si un insumo sale con variación negativa grande, suele ser producción sin egreso cargado.
                  </p>
                </>
              )}
            </div>
          )}

          {tab === 'Por Causa' && (
            porCausa.length === 0
              ? <EmptyState icon={TrendingDown} title="Sin registros" />
              : (
                <div className="space-y-3">
                  <div className="p-4" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={porCausa} margin={{ top: 8, right: 8, left: -16, bottom: 48 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
                        <XAxis dataKey="causa" tick={{ fontSize: 10, fill: colors.textMuted }} angle={-30} textAnchor="end" interval={0} height={70} />
                        <YAxis tick={{ fontSize: 11, fill: colors.textMuted }} />
                        <Tooltip
                          contentStyle={{ borderRadius: radius.md, border: `1px solid ${colors.border}`, fontSize: 12 }}
                          formatter={v => [`${Number(v).toFixed(2)} kg`, 'Pérdida']}
                        />
                        <Bar dataKey="dif" radius={[6, 6, 0, 0]}>
                          {porCausa.map((_, i) => <Cell key={i} fill={colors.danger} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>Causa</Th>
                          <Th>Registros</Th>
                          <Th>KG perdidos</Th>
                          <Th>% del total</Th>
                          <Th>Costo total</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {porCausa.map(c => (
                          <Tr key={c.causa}>
                            <Td className="font-medium">{c.causa}</Td>
                            <Td>{c.cnt}</Td>
                            <Td className="font-bold" style={{ color: colors.danger }}>{c.dif.toFixed(2)} kg</Td>
                            <Td>{totalDif > 0 ? ((c.dif / totalDif) * 100).toFixed(1) : '0.0'}%</Td>
                            <Td className="font-semibold" style={{ color: colors.danger }}>${pesos(c.costo)}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </div>
                </div>
              )
          )}

          {tab === 'Historial' && (
            mermas.length === 0
              ? <EmptyState icon={TrendingDown} title="Sin historial" subtitle="Los registros aparecen aquí" />
              : (
                <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <Table className="min-w-[760px]">
                    <Thead>
                      <Tr>
                        <Th>Fecha</Th>
                        <Th>Orden N°</Th>
                        <Th>Producto</Th>
                        <Th>Operario</Th>
                        <Th>Kg Teórico</Th>
                        <Th>Kg Real</Th>
                        <Th>Diferencia</Th>
                        <Th>% Merma</Th>
                        <Th>Costo merma $</Th>
                        <Th>Causa</Th>
                        <Th>Origen</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {mermas.map(m => (
                        <Tr key={m.id}>
                          <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{m.fecha}</Td>
                          <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{ordenNumero(m)}</Td>
                          <Td className="font-medium">{m.sabor_nombre}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{m.operario_nombre || '—'}</Td>
                          <Td className="text-xs text-right" style={{ color: colors.textSecondary }}>{m.kg_teoricos}</Td>
                          <Td className="text-xs text-right" style={{ color: colors.textSecondary }}>{m.kg_reales}</Td>
                          <Td className="font-semibold text-right" style={{ color: colors.danger }}>{(m.diferencia || 0).toFixed(2)}</Td>
                          <Td><Badge variant={pctVariant(m.porcentaje || 0)}>{(m.porcentaje || 0).toFixed(1)}%</Badge></Td>
                          <Td className="font-semibold text-right" style={{ color: colors.danger }}>${pesos(costoMerma(m))}</Td>
                          <Td className="text-xs" style={{ color: colors.textMuted }}>{m.causa}</Td>
                          <Td><OrigenBadge causa={m.causa} /></Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )
          )}

          {tab === 'Estándares' && (
            <div className="space-y-3">
              <div className="p-4 text-xs" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, color: colors.textSecondary }}>
                <b style={{ color: colors.textPrimary }}>Merma esperada por sabor.</b> Cada sabor tiene una merma "normal" propia (un sabor liso al agua merma poco; uno con trozos, repostería o dulce de leche merma más).
                El análisis <i>Por Sabor</i> y el informe PDF evalúan la merma real contra este estándar: <span style={{ color: colors.success }}>En estándar</span> (≤ esperada), <span style={{ color: colors.warning }}>Sobre estándar</span> (hasta 1,5×) o <span style={{ color: colors.danger }}>Excesiva</span> (&gt; 1,5×). Si lo dejás vacío, se usa la tolerancia fija 3% / 8%.
              </div>
              <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                <Table>
                  <Thead>
                    <Tr><Th>Sabor / Producto</Th><Th>Tipo</Th><Th>Merma esperada</Th></Tr>
                  </Thead>
                  <Tbody>
                    {sabores.map(s => (
                      <Tr key={s.id}>
                        <Td className="font-medium">{s.nombre}</Td>
                        <Td className="text-xs" style={{ color: colors.textMuted }}>{s.tipo || '—'}</Td>
                        <Td><EsperadaInput value={s.merma_esperada ?? ''} onCommit={v => guardarEsperada(s.id, v)} /></Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
                {sabores.length === 0 && <EmptyState icon={TrendingDown} title="Sin sabores" subtitle="No hay productos en cámara para configurar" />}
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Registrar Merma"
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)} disabled={saving} className="flex-1">
              Cancelar
            </Button>
            <Button variant="primary" onClick={guardar} loading={saving} className="flex-1">
              {saving ? 'Guardando…' : 'Registrar'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha *" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            <div>
              <Input label="Sabor *" type="text" value={form.sabor_nombre} onChange={e => setForm(f => ({ ...f, sabor_nombre: e.target.value }))}
                list="sabores-list" placeholder="Nombre del sabor" />
              <datalist id="sabores-list">{sabores.map(s => <option key={s.id} value={s.nombre} />)}</datalist>
            </div>
          </div>
          <Select label="Operario" value={form.operario_nombre} onChange={e => setForm(f => ({ ...f, operario_nombre: e.target.value }))}>
            <option value="">— Sin asignar —</option>
            {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="KG Teóricos *" type="number" step="0.01" value={form.kg_teoricos} onChange={e => setForm(f => ({ ...f, kg_teoricos: e.target.value }))} />
            <Input label="KG Reales *" type="number" step="0.01" value={form.kg_reales} onChange={e => setForm(f => ({ ...f, kg_reales: e.target.value }))} />
          </div>
          {diferencia && (
            <div className="flex gap-4 px-4 py-2.5" style={{ backgroundColor: colors.bg, borderRadius: radius.md }}>
              <div className="text-center flex-1">
                <p className="text-xs" style={{ color: colors.textMuted }}>Diferencia</p>
                <p className="text-sm font-bold" style={{ color: colors.danger }}>{diferencia.dif.toFixed(2)} kg</p>
              </div>
              <div className="text-center flex-1">
                <p className="text-xs" style={{ color: colors.textMuted }}>Porcentaje</p>
                <p className="text-sm font-bold" style={{ color: pctColor(diferencia.pct) }}>{diferencia.pct.toFixed(1)}%</p>
              </div>
            </div>
          )}
          <Select label="Causa" value={form.causa} onChange={e => setForm(f => ({ ...f, causa: e.target.value }))}>
            {CAUSAS.map(c => <option key={c}>{c}</option>)}
          </Select>
          <div>
            <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Observaciones</label>
            <textarea value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
              rows={2} className={textareaClass} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
