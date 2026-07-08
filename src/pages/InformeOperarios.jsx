import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { colors } from '../styles/design-system'
import { normalizarNombre } from '../lib/texto'
import { PageHeader } from '../components/PageHeader'
import Spinner from '../components/ui/Spinner'
import KpiCard from '../components/ui/KpiCard'
import Button from '../components/ui/Button'
import {
  getEstiloInforme, dibujarPortada, dibujarEncabezado, dibujarPie,
  dibujarKpi, dibujarSeccion, dibujarFirmas,
  PDF_CONTENT_Y, PDF_NEGRO, PDF_BLANCO,
} from '../lib/pdfEstilos'
import { fmtMin } from '../lib/etapas'

const ACCENT = colors.brand
const CARD = { background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '20px', marginBottom: '16px' }
const PERIODOS = [['semana', 'Semana'], ['mes', 'Mes'], ['trimestre', 'Trimestre']]
const TABS = [['equipo', '👥 Equipo'], ['operario', '👤 Por Operario'], ['ranking', '🏆 Ranking'], ['pdf', '📄 Informe PDF']]

// Un producto se mide en UNIDADES (postres / impulsivos) y no en kg.
const esUnidad = o => o.tipo_producto === 'postre' || o.tipo_producto === 'impulsivo'

// Nivel sobre el % de cumplimiento de producción (kg real vs objetivo de receta).
function nivel(pct) {
  if (pct === null || pct === undefined) return { label: 'Sin datos', color: '#64748b', bg: '#64748b22' }
  if (pct >= 90) return { label: 'EXCELENTE', color: '#10b981', bg: '#10b98122' }
  if (pct >= 75) return { label: 'BUENO',     color: '#3b82f6', bg: '#3b82f622' }
  if (pct >= 60) return { label: 'REGULAR',   color: '#f59e0b', bg: '#f59e0b22' }
  return                 { label: 'BAJO',       color: '#ef4444', bg: '#ef444422' }
}

// Texto + flecha de tendencia. La flecha se usa SOLO en pantalla (HTML); en el
// PDF se imprime el texto plano porque Helvetica de jsPDF no tiene ↑ ↓ →.
function flechaTendencia(dir) {
  return dir === 'up' ? '↑' : dir === 'down' ? '↓' : dir === 'flat' ? '→' : '·'
}

function Barra({ pct, color }) {
  return (
    <div style={{ background: '#334155', borderRadius: '4px', height: '8px', flex: 1 }}>
      <div style={{ width: Math.min(pct || 0, 100) + '%', background: color, borderRadius: '4px', height: '8px', transition: 'width 0.3s' }} />
    </div>
  )
}

export default function InformeOperarios() {
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [tab, setTab]               = useState('equipo')
  const [periodo, setPeriodo]       = useState('mes')
  const [operarioSel, setOperarioSel] = useState('')
  const [datos, setDatos] = useState({ operarios: [], ordenes: [], ranking: [], comparativas: {} })
  const chartRefEvol = useRef(null)

  useEffect(() => { cargar() }, [periodo]) // eslint-disable-line react-hooks/exhaustive-deps

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const hoy = new Date()
      const desde = new Date()
      if (periodo === 'semana')    desde.setDate(hoy.getDate() - 7)
      else if (periodo === 'mes')  desde.setMonth(hoy.getMonth() - 1)
      else                         desde.setMonth(hoy.getMonth() - 3)

      const desdeStr = desde.toISOString().slice(0, 10)
      const [
        { data: ops, error: e1 }, { data: ords, error: e2 },
        { data: etps }, { data: camMovs }, { data: depMovs }, { data: mermasData },
        { data: prodData },
      ] = await Promise.all([
        supabase.from('operarios').select('id,nombre').eq('activo', true).order('nombre'),
        supabase.from('ordenes_produccion').select('*').gte('created_at', desde.toISOString()).order('created_at', { ascending: false }),
        // orden_etapas puede no existir todavía (degradación segura) → data null
        supabase.from('orden_etapas').select('*').gte('created_at', desde.toISOString()),
        supabase.from('movimientos_camara').select('operario_nombre,tipo,created_at').gte('created_at', desde.toISOString()),
        supabase.from('movimientos_deposito').select('operario_recibe,tipo,fecha').gte('fecha', desdeStr),
        supabase.from('mermas').select('operario_nombre,diferencia,fecha').gte('fecha', desdeStr),
        // Cargas reales de producción: acá está QUIÉN produjo cada kg (una orden
        // puede haberla hecho más de un operario). Es la base del rendimiento.
        supabase.from('producciones').select('producto_nombre,peso_kg,operario_nombre,fecha').gte('fecha', desdeStr),
      ])
      if (e1) throw e1
      if (e2) throw e2

      const operarios = [...new Map((ops || []).map(o => [o.nombre.toUpperCase(), { ...o, nombre: o.nombre.toUpperCase() }])).values()]
      const ordenes = (ords || []).map(o => ({
        ...o,
        operario_nombre: (o.operario_nombre || '').toUpperCase(),
        sabor_nombre: (o.sabor_nombre || o.producto_nombre || '').toUpperCase(),
      }))
      const etapas = (etps || []).map(e => ({ ...e, operario_nombre: (e.operario_nombre || '').toUpperCase() }))

      // KG REALES producidos por cada operario (de las cargas de producción).
      // Solo helados: filtramos por los nombres de sabor que aparecen en órdenes
      // de helado. Así, si Juan y Pedro comparten una orden, cada uno suma SUS kg.
      const nombresHelado = new Set(ordenes.filter(o => !esUnidad(o)).map(o => normalizarNombre(o.sabor_nombre)))
      const kgRealPorOp = {}
      ;(prodData || []).forEach(p => {
        if (!nombresHelado.has(normalizarNombre(p.producto_nombre || ''))) return
        const N = (p.operario_nombre || '').toUpperCase()
        if (!N) return
        kgRealPorOp[N] = (kgRealPorOp[N] || 0) + (Number(p.peso_kg) || 0)
      })

      // Reparto del OBJETIVO por operario: proporcional a lo que cargó cada uno en
      // cada orden. Así el % de cumplimiento también se reparte por persona (no se
      // le imputa la orden entera a una sola). Cada uno rinde contra SU parte.
      const objAtribPorOp = {}   // kg de objetivo atribuibles a cada operario
      const contribCountPorOp = {} // en cuántas órdenes participó (para ponderar)
      ordenes.filter(o => !esUnidad(o) && o.estado === 'completada' && Number(o.kg_objetivo) > 0).forEach(o => {
        const objN = normalizarNombre(o.sabor_nombre)
        const recs = (prodData || []).filter(p => p.fecha === o.fecha_produccion && normalizarNombre(p.producto_nombre || '') === objN)
        const totalCargado = recs.reduce((a, p) => a + (Number(p.peso_kg) || 0), 0)
        if (totalCargado <= 0) return
        const objetivo = Number(o.kg_objetivo) || 0
        const porOp = {}
        recs.forEach(p => { const N = (p.operario_nombre || '').toUpperCase(); if (N) porOp[N] = (porOp[N] || 0) + (Number(p.peso_kg) || 0) })
        Object.entries(porOp).forEach(([N, kg]) => {
          objAtribPorOp[N] = (objAtribPorOp[N] || 0) + (kg / totalCargado) * objetivo
          contribCountPorOp[N] = (contribCountPorOp[N] || 0) + 1
        })
      })

      // Actividad operativa por operario (cámara, depósito, mermas).
      const actividadDe = nombre => {
        const N = (nombre || '').toUpperCase()
        const camara   = (camMovs || []).filter(m => (m.operario_nombre || '').toUpperCase() === N).length
        const deposito = (depMovs || []).filter(m => (m.operario_recibe || '').toUpperCase() === N).length
        const misMermas = (mermasData || []).filter(m => (m.operario_nombre || '').toUpperCase() === N)
        return { camara, deposito, mermas: misMermas.length }
      }

      const ranking = operarios.map(op => {
        const misOrdenes  = ordenes.filter(o => o.operario_nombre === op.nombre)
        const completadas = misOrdenes.filter(o => o.estado === 'completada')

        // ── Helado (kg) — el rendimiento se mide acá ──────────────────────────
        const heladoCompl = completadas.filter(o => !esUnidad(o))
        // Solo cuentan las órdenes con objetivo de receta Y kg realmente registrados.
        // Una orden "completada" sin kg cargados NO se castiga como 0%; se marca aparte.
        const conProd = heladoCompl.filter(o => Number(o.kg_objetivo) > 0 && Number(o.kg_producido) > 0)
        const sinRegistroKg = heladoCompl.filter(o => Number(o.kg_objetivo) > 0 && !(Number(o.kg_producido) > 0)).length

        // Cumplimiento de helado POR OPERARIO: sus kg reales cargados vs SU parte
        // del objetivo (repartida proporcionalmente). Cuenta a cualquiera que haya
        // cargado, aunque la orden figure a nombre de otro.
        const kgRealOp   = kgRealPorOp[op.nombre] || 0
        const objAtribOp = objAtribPorOp[op.nombre] || 0
        const contribOrdenes = contribCountPorOp[op.nombre] || 0
        const pctHeladoProd = objAtribOp > 0
          ? Math.round(Math.min((kgRealOp / objAtribOp) * 100, 120))
          : null

        // ── Postres / impulsivos (unidades) — circuito propio ────────────────
        const unidadAsignadas = misOrdenes.filter(esUnidad).length
        const unidadCompl     = completadas.filter(esUnidad)
        const postresLotes    = unidadCompl.length
        const postresUnidades = unidadCompl.reduce((a, o) => a + (Number(o.cantidad_unidades) || 0), 0)
        // Cumplimiento de postres = lotes terminados / asignados.
        const pctPostreCompl = unidadAsignadas > 0 ? Math.round((postresLotes / unidadAsignadas) * 100) : null

        // ── Eficiencia de mano de obra (etapas) — el tiempo, medido bien ─────
        // Solo etapas ACTIVAS finalizadas que hizo este operario; estándar/real.
        const misEtapas = etapas.filter(e => e.operario_nombre === op.nombre && e.es_activa && e.fin && Number(e.tiempo_min) > 0)
        const stdMin  = misEtapas.reduce((a, e) => a + (Number(e.estandar_min) || 0), 0)
        const realMin = misEtapas.reduce((a, e) => a + (Number(e.tiempo_min) || 0), 0)
        const pctEficiencia = (stdMin > 0 && realMin > 0) ? Math.round((stdMin / realMin) * 100) : null
        const unidadesTerminadas = etapas.filter(e => e.operario_nombre === op.nombre && e.es_cierre && e.fin)
          .reduce((a, e) => a + (Number(e.unidades) || 0), 0)

        // ── Cumplimiento de producción combinado (helado kg + postres lotes) ─
        const prodParts = []
        if (pctHeladoProd !== null) prodParts.push({ v: pctHeladoProd, w: contribOrdenes || 1 })
        if (pctPostreCompl !== null) prodParts.push({ v: pctPostreCompl, w: unidadAsignadas })
        const pesoTot = prodParts.reduce((a, p) => a + p.w, 0)
        const pctProduccion = pesoTot > 0 ? Math.round(prodParts.reduce((a, p) => a + p.v * p.w, 0) / pesoTot) : null

        // ── Rendimiento = 60% producción + 40% eficiencia (lo que haya) ──────
        let rendimiento = null
        if (pctProduccion !== null && pctEficiencia !== null) rendimiento = Math.round(pctProduccion * 0.6 + pctEficiencia * 0.4)
        else if (pctProduccion !== null) rendimiento = pctProduccion
        else if (pctEficiencia !== null) rendimiento = pctEficiencia

        const ultimas10 = heladoCompl.filter(o => Number(o.kg_objetivo) > 0).slice(0, 10).map(o => ({
          nombre:    (o.sabor_nombre || '?').slice(0, 12),
          objetivo:  Number(o.kg_objetivo)  || 0,
          producido: Number(o.kg_producido) || 0,
        })).reverse()

        // Tendencia: compara la primera mitad vs la segunda mitad del cumplimiento.
        const mitad = Math.floor(conProd.length / 2)
        const primera = conProd.slice(mitad)
        const segunda = conProd.slice(0, mitad)
        const prom = arr => arr.length > 0 ? arr.reduce((a, o) => a + Number(o.kg_producido) / Number(o.kg_objetivo) * 100, 0) / arr.length : null
        const avgP = prom(primera), avgS = prom(segunda)
        let tendDir = 'none', tendencia = 'Sin datos'
        if (avgP !== null && avgS !== null) {
          if (avgS > avgP + 3)      { tendDir = 'up';   tendencia = 'Mejorando' }
          else if (avgS < avgP - 3) { tendDir = 'down'; tendencia = 'Bajando' }
          else                      { tendDir = 'flat'; tendencia = 'Estable' }
        }

        return {
          ...op,
          misOrdenes: misOrdenes.length,
          completadas: completadas.length,
          heladoCompletadas: heladoCompl.length,
          conProd: conProd.length,
          sinRegistroKg,
          pctHeladoProd, pctPostreCompl, pctProduccion, pctEficiencia, rendimiento,
          unidadAsignadas, postresLotes, postresUnidades, unidadesTerminadas,
          stdMin, realMin,
          ultimas10, tendencia, tendDir,
          actividad: actividadDe(op.nombre),
          // KG reales que produjo esta persona (de sus cargas), no la orden entera.
          totalKgProducido: Math.round((kgRealPorOp[op.nombre] || 0) * 10) / 10,
          // Objetivo atribuible a esta persona (su parte proporcional del objetivo).
          totalKgObjetivo:  Math.round(objAtribOp * 10) / 10,
        }
      }).sort((a, b) => (b.rendimiento ?? -1) - (a.rendimiento ?? -1))

      // Comparativa entre operarios por producto (solo helado: requiere kg objetivo).
      const comparativas = {}
      ordenes.filter(o => o.estado === 'completada' && !esUnidad(o) && Number(o.kg_objetivo) > 0 && Number(o.kg_producido) > 0).forEach(o => {
        const prod = o.sabor_nombre || '?'
        if (!comparativas[prod]) comparativas[prod] = []
        comparativas[prod].push({
          operario: o.operario_nombre,
          pct: Math.round((Number(o.kg_producido) || 0) / Number(o.kg_objetivo) * 100),
        })
      })

      setDatos({ operarios, ordenes, ranking, comparativas })
      if (!operarioSel && ranking.length > 0) setOperarioSel(ranking[0].nombre)
    } catch (err) {
      console.error('Error InformeOperarios:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function generarPDF(tipo) {
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pw  = doc.internal.pageSize.getWidth()
      const ph  = doc.internal.pageSize.getHeight()
      const hoy = new Date().toLocaleString('es-AR')
      const MOD = 'RENDIMIENTO'
      const periodoLabel = periodo === 'semana' ? 'Última semana' : periodo === 'mes' ? 'Último mes' : 'Último trimestre'
      const EST = getEstiloInforme()

      const didDP = (titulo) => () => {
        dibujarEncabezado(doc, pw, MOD, titulo, hoy)
        dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
      }

      // P1 — Portada
      dibujarPortada(doc, pw, ph, MOD, 'INFORME DE RENDIMIENTO', periodoLabel, hoy)

      const hexRgb = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
      const nivelRgb = pct => hexRgb(nivel(pct).color)
      const esClaro = c => (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) > 150

      // ════════════════════════ INFORME DEL EQUIPO ════════════════════════
      if (tipo === 'equipo') {
        doc.addPage()
        const ranking  = datos.ranking
        const conDatos = ranking.filter(r => r.rendimiento !== null)
        const promRend = conDatos.length > 0
          ? Math.round(conDatos.reduce((a, r) => a + r.rendimiento, 0) / conDatos.length) : null
        const completadasTot = ranking.reduce((a, r) => a + r.completadas, 0)
        const mejor = conDatos[0] || null

        const cards = [
          { l: 'Operarios',        v: String(ranking.length),                       c: PDF_NEGRO },
          { l: 'Con datos',        v: String(conDatos.length),                      c: PDF_NEGRO },
          { l: 'Rendim. promedio', v: promRend !== null ? `${promRend}%` : '—',     c: promRend !== null ? nivelRgb(promRend) : PDF_NEGRO },
          { l: 'Órdenes complet.', v: String(completadasTot),                       c: PDF_NEGRO },
          { l: 'Mejor operario',   v: mejor ? mejor.nombre.split(' ')[0] : '—',     c: hexRgb('#16a34a') },
        ]
        const gap = 4, cardW = (pw - 28 - gap * 4) / 5, cardH = 22, cardY = PDF_CONTENT_Y - 2
        cards.forEach((c, i) => {
          const x = 14 + i * (cardW + gap)
          doc.setDrawColor(...PDF_NEGRO); doc.setLineWidth(0.3); doc.rect(x, cardY, cardW, cardH)
          doc.setFillColor(...c.c); doc.rect(x, cardY, cardW, 1.4, 'F')
          doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(90, 90, 90)
          doc.text(c.l.toUpperCase(), x + 2.5, cardY + 7)
          doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...PDF_NEGRO)
          doc.text(doc.splitTextToSize(String(c.v), cardW - 5)[0], x + 2.5, cardY + 15)
        })
        let y = cardY + cardH + 9

        // Distribución del equipo por nivel (barra apilada)
        y = dibujarSeccion(doc, pw, 'Distribución del equipo por nivel', y)
        const nivBands = [
          ['Excelente', r => r.rendimiento !== null && r.rendimiento >= 90, hexRgb('#10b981')],
          ['Bueno',     r => r.rendimiento !== null && r.rendimiento >= 75 && r.rendimiento < 90, hexRgb('#3b82f6')],
          ['Regular',   r => r.rendimiento !== null && r.rendimiento >= 60 && r.rendimiento < 75, hexRgb('#f59e0b')],
          ['Bajo',      r => r.rendimiento !== null && r.rendimiento < 60, hexRgb('#ef4444')],
          ['Sin datos', r => r.rendimiento === null, [120, 120, 120]],
        ]
        const nb = nivBands.map(([label, fn, col]) => ({ label, n: ranking.filter(fn).length, col }))
        const totB = nb.reduce((a, b) => a + b.n, 0) || 1
        const bW = pw - 28, bH = 7; let bx = 14
        nb.forEach(b => {
          const w = (b.n / totB) * bW; if (w <= 0) return
          doc.setFillColor(...b.col); doc.rect(bx, y, w, bH, 'F')
          if (w > 6) {
            doc.setTextColor(...(esClaro(b.col) ? PDF_NEGRO : PDF_BLANCO))
            doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5)
            doc.text(String(b.n), bx + w / 2, y + bH / 2 + 1.4, { align: 'center' })
          }
          bx += w
        })
        y += bH + 5
        let lx = 14; doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
        nb.forEach(b => {
          const txt = `${b.label} (${b.n})`
          doc.setFillColor(...b.col); doc.rect(lx, y - 2.6, 3, 3, 'F')
          doc.setTextColor(70, 70, 70); doc.text(txt, lx + 4.5, y)
          lx += 4.5 + doc.getTextWidth(txt) + 6
        })
        y += 10

        // Ranking por rendimiento (barras horizontales)
        if (conDatos.length > 0) {
          y = dibujarSeccion(doc, pw, 'Ranking por cumplimiento de producción', y)
          const top = conDatos.slice(0, 10)
          const labelW = 38, axisX = 14 + labelW, axisRight = pw - 18, axisW = axisRight - axisX, rowH = 5.8
          top.forEach((r, i) => {
            const ry = y + i * rowH
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(50, 50, 50)
            const nm = r.nombre.length > 22 ? r.nombre.slice(0, 20) + '…' : r.nombre
            doc.text(nm, axisX - 3, ry + 2.4, { align: 'right' })
            const w = (Math.min(r.rendimiento, 100) / 100) * axisW
            doc.setFillColor(...nivelRgb(r.rendimiento)); doc.rect(axisX, ry, Math.max(w, 0.4), 3, 'F')
            doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...nivelRgb(r.rendimiento))
            doc.text(`${r.rendimiento}%`, axisX + w + 1.5, ry + 2.3)
          })
          y += top.length * rowH + 6
        }

        // Detalle del ranking (tabla)
        if (y > ph - 50) { doc.addPage(); y = PDF_CONTENT_Y }
        y = dibujarSeccion(doc, pw, 'Detalle del ranking', y)
        autoTable(doc, {
          ...EST, startY: y,
          head: [['POS', 'OPERARIO', 'ÓRDENES', 'COMPLET.', 'CUMPL. PROD.', 'EFIC.', 'POSTRES', 'RENDIM.', 'NIVEL']],
          body: ranking.map((r, i) => [
            `${i + 1}°`,
            r.nombre,
            String(r.misOrdenes),
            String(r.completadas),
            r.pctProduccion !== null ? r.pctProduccion + '%' : '—',
            r.pctEficiencia !== null ? r.pctEficiencia + '%' : '—',
            r.postresLotes > 0 ? `${r.postresLotes} lote(s) · ${r.postresUnidades} u` : '—',
            r.rendimiento   !== null ? r.rendimiento   + '%' : '—',
            nivel(r.rendimiento).label,
          ]),
          columnStyles: {
            0: { halign: 'center', cellWidth: 12 },
            2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
            5: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'center' },
          },
          didParseCell(data) {
            if (data.section !== 'body') return
            const r = ranking[data.row.index]
            if (!r) return
            if (data.column.index === 7 || data.column.index === 8) {
              data.cell.styles.textColor = nivelRgb(r.rendimiento)
              data.cell.styles.fontStyle = 'bold'
            }
          },
          didDrawPage: didDP('RANKING DEL EQUIPO'),
        })

      // ════════════════════════ INFORME INDIVIDUAL ════════════════════════
      } else {
        const op = datos.ranking.find(r => r.nombre === operarioSel)
        if (!op) return

        doc.addPage()
        const kpiW = (pw - 28 - 4) / 2
        dibujarKpi(doc, 14,          PDF_CONTENT_Y,      kpiW, 18, 'Órdenes asignadas',  op.misOrdenes)
        dibujarKpi(doc, 14 + kpiW+2, PDF_CONTENT_Y,      kpiW, 18, 'Órdenes completadas', op.completadas)
        dibujarKpi(doc, 14,          PDF_CONTENT_Y + 22, kpiW, 18, 'KG total producidos', `${op.totalKgProducido.toFixed(1)} kg`)
        dibujarKpi(doc, 14 + kpiW+2, PDF_CONTENT_Y + 22, kpiW, 18, 'Rendimiento',         op.rendimiento !== null ? `${op.rendimiento}%` : '—')

        let y = PDF_CONTENT_Y + 48
        y = dibujarSeccion(doc, pw, `Perfil — ${op.nombre}`, y)
        const perfil = [
          ['Órdenes asignadas',              String(op.misOrdenes)],
          ['Órdenes completadas',            String(op.completadas)],
          ['Cumplimiento de producción',     op.pctProduccion !== null ? op.pctProduccion + '%' : '—'],
          ['Eficiencia de mano de obra',     op.pctEficiencia !== null ? `${op.pctEficiencia}%  (estándar ${fmtMin(op.stdMin)} / real ${fmtMin(op.realMin)})` : '—'],
          ['Rendimiento global',             op.rendimiento !== null ? `${op.rendimiento}%` : '—'],
          ['KG total producidos',            op.totalKgProducido.toFixed(1) + ' kg'],
          ['Nivel',                          nivel(op.rendimiento).label],
          ['Tendencia',                      op.tendencia],
        ]
        if (op.postresLotes > 0 || op.unidadAsignadas > 0)
          perfil.push(['Postres / impulsivos', `${op.postresLotes} de ${op.unidadAsignadas} lotes · ${op.postresUnidades} u plan. · ${op.unidadesTerminadas} u terminadas`])
        if (op.actividad)
          perfil.push(['Actividad operativa', `${op.actividad.camara} cámara · ${op.actividad.deposito} depósito · ${op.actividad.mermas} mermas`])
        if (op.sinRegistroKg > 0)
          perfil.push(['Órdenes sin kg registrado', `${op.sinRegistroKg} (revisar carga en Producción)`])
        autoTable(doc, {
          ...EST, startY: y,
          body: perfil,
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 }, 1: { halign: 'right' } },
          didParseCell(data) {
            if (data.section === 'body' && data.row.index === perfil.length - 1 && op.sinRegistroKg > 0) {
              data.cell.styles.textColor = hexRgb('#b45309')
            }
          },
          didDrawPage: didDP(`OPERARIO: ${op.nombre}`),
        })
        // Cursor propio: NO usar doc.lastAutoTable.finalY tras el gráfico (no es
        // una tabla) — eso provocaba que las secciones se dibujaran encima.
        let cursor = doc.lastAutoTable.finalY + 8

        // Gráfico evolución (kg objetivo vs producido)
        if (chartRefEvol.current && op.ultimas10.length > 0) {
          try {
            if (cursor > ph - 70) { doc.addPage(); cursor = PDF_CONTENT_Y }
            cursor = dibujarSeccion(doc, pw, 'Evolución de producción (kg)', cursor)
            const canvasEvol = await html2canvas(chartRefEvol.current, { backgroundColor: '#1e293b', scale: 2, logging: false, useCORS: true })
            const imgEvol = canvasEvol.toDataURL('image/png')
            const imgEvolH = (canvasEvol.height * (pw - 28)) / canvasEvol.width
            doc.setDrawColor(51, 65, 85); doc.setLineWidth(0.3)
            doc.rect(14, cursor, pw - 28, imgEvolH)
            doc.addImage(imgEvol, 'PNG', 14, cursor, pw - 28, imgEvolH)
            cursor += imgEvolH + 4
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139)
            doc.text('KG objetivo vs producido — últimas órdenes de helado', 14, cursor)
            cursor += 6
          } catch (e) { console.warn('chart evol:', e) }
        }

        // Historial de órdenes
        const ords = datos.ordenes.filter(o => o.operario_nombre === op.nombre)
        if (ords.length > 0) {
          if (cursor > ph - 50) { doc.addPage(); cursor = PDF_CONTENT_Y }
          cursor = dibujarSeccion(doc, pw, 'Historial de órdenes', cursor)
          autoTable(doc, {
            ...EST, styles: { ...EST.styles, fontSize: 7 }, startY: cursor,
            head: [['FECHA', 'PRODUCTO', 'TIPO', 'OBJETIVO', 'PRODUCIDO', 'CUMPL.', 'ESTADO']],
            body: ords.map(o => {
              const unidad = esUnidad(o)
              const compl = o.estado === 'completada'
              const kgObj  = Number(o.kg_objetivo)  || 0
              const kgReal = Number(o.kg_producido) || 0
              const uds = Number(o.cantidad_unidades) || 0
              return [
                o.fecha_produccion || (o.created_at || '').slice(0, 10) || '—',
                (o.sabor_nombre || '—').slice(0, 22),
                unidad ? (o.tipo_producto === 'postre' ? 'Postre' : 'Impulsivo') : 'Helado',
                unidad ? (uds > 0 ? `${uds} u` : '—') : (kgObj > 0 ? `${kgObj.toFixed(1)} kg` : '—'),
                unidad ? (compl && uds > 0 ? `${uds} u` : '—') : (kgReal > 0 ? `${kgReal.toFixed(1)} kg` : '—'),
                unidad ? (compl ? '100%' : '—') : (kgObj > 0 && kgReal > 0 ? Math.round(kgReal / kgObj * 100) + '%' : '—'),
                compl ? 'Completada' : (o.estado === 'en_proceso' ? 'En proceso' : 'Pendiente'),
              ]
            }),
            columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
            didDrawPage: didDP(`OPERARIO: ${op.nombre}`),
          })
        }
      }

      // Firmas (al final del contenido; salta de hoja solo si no entran)
      dibujarFirmas(doc, pw, ph, doc.lastAutoTable?.finalY, MOD, hoy, ['Supervisor de Producción', 'Gerencia', 'Fecha'])

      doc.save(`rendimiento_${tipo}_${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (err) {
      console.error('Error PDF:', err)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-14"><Spinner size={28} /></div>
  )
  if (error) return (
    <div className="p-6 rounded-xl" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}` }}>
      <p style={{ color: colors.danger }}>Error: {error}</p>
      <Button variant="primary" onClick={cargar} className="mt-3">Reintentar</Button>
    </div>
  )

  const opActual = datos.ranking.find(r => r.nombre === operarioSel) || null

  return (
    <div className="space-y-5" style={{ color: colors.textPrimary }}>

      {/* Header */}
      <PageHeader
        title="Rendimiento Operativo"
        subtitle="Cumplimiento de producción · Del Parque"
        actions={PERIODOS.map(([k, l]) => (
          <button key={k} onClick={() => setPeriodo(k)}
            style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', background: periodo === k ? ACCENT : '#1e293b', color: periodo === k ? 'white' : '#94a3b8' }}>
            {l}
          </button>
        ))}
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: `1px solid ${colors.border}` }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: tab === k ? '700' : '400', background: 'transparent', color: tab === k ? ACCENT : colors.textSecondary, borderBottom: tab === k ? `2px solid ${ACCENT}` : '2px solid transparent' }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── TAB EQUIPO ── */}
      {tab === 'equipo' && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Operarios activos',    value: datos.operarios.length, color: colors.info },
              { label: 'Órdenes completadas',  value: datos.ordenes.filter(o => o.estado === 'completada').length, color: colors.success },
              { label: 'Rendimiento promedio', value: (() => { const con = datos.ranking.filter(r => r.rendimiento !== null); return con.length > 0 ? Math.round(con.reduce((a, r) => a + r.rendimiento, 0) / con.length) + '%' : '—' })(), color: ACCENT },
              { label: 'Mejor operario',       value: datos.ranking[0]?.nombre.split(' ')[0] || '—', color: colors.warning },
            ].map(k => (
              <KpiCard key={k.label} label={k.label} value={k.value} color={k.color} />
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '16px' }}>
            {datos.ranking.map((op, idx) => {
              const nv = nivel(op.rendimiento)
              return (
                <div key={op.nombre} onClick={() => { setOperarioSel(op.nombre); setTab('operario') }}
                  style={{ ...CARD, marginBottom: 0, cursor: 'pointer', borderTop: `3px solid ${nv.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: nv.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '800', color: 'white' }}>
                        {idx < 3 ? ['🥇', '🥈', '🥉'][idx] : op.nombre[0]}
                      </div>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '15px' }}>{op.nombre}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{op.completadas} de {op.misOrdenes} órdenes</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '28px', fontWeight: '900', color: nv.color }}>{op.rendimiento ?? '—'}{op.rendimiento !== null ? '%' : ''}</div>
                      <span style={{ background: nv.bg, color: nv.color, padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700' }}>{nv.label}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                      <span style={{ color: '#64748b', width: '80px', flexShrink: 0 }}>Producción</span>
                      <Barra pct={op.pctProduccion} color="#10b981" />
                      <span style={{ color: nivel(op.pctProduccion).color, fontWeight: '700', width: '42px', textAlign: 'right' }}>
                        {op.pctProduccion !== null ? op.pctProduccion + '%' : '—'}
                      </span>
                    </div>
                    {op.pctEficiencia !== null && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <span style={{ color: '#64748b', width: '80px', flexShrink: 0 }}>Eficiencia</span>
                        <Barra pct={op.pctEficiencia} color="#60a5fa" />
                        <span style={{ color: nivel(op.pctEficiencia).color, fontWeight: '700', width: '42px', textAlign: 'right' }}>
                          {op.pctEficiencia + '%'}
                        </span>
                      </div>
                    )}
                    {(op.postresLotes > 0 || op.unidadAsignadas > 0) && (
                      <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>🍰 Postres</span>
                        <span>{op.postresLotes} lote(s) · {op.postresUnidades} u</span>
                      </div>
                    )}
                    {op.sinRegistroKg > 0 && (
                      <div style={{ fontSize: '11px', color: '#f59e0b' }}>⚠ {op.sinRegistroKg} orden(es) sin kg registrado</div>
                    )}
                  </div>
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
                    <span>{flechaTendencia(op.tendDir)} {op.tendencia}</span>
                    <span>{op.totalKgProducido.toFixed(0)} kg</span>
                  </div>
                </div>
              )
            })}
          </div>
          {datos.ranking.length === 0 && <div style={{ ...CARD, textAlign: 'center', color: '#64748b' }}>Sin datos en el período seleccionado</div>}
        </div>
      )}

      {/* ── TAB POR OPERARIO ── */}
      {tab === 'operario' && (
        <div>
          <select value={operarioSel} onChange={e => setOperarioSel(e.target.value)}
            style={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', padding: '10px 16px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px', minWidth: '250px' }}>
            {datos.ranking.map(r => <option key={r.nombre} value={r.nombre}>{r.nombre}</option>)}
          </select>

          {opActual ? (
            <div>
              {/* Encabezado */}
              <div style={{ ...CARD, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: nivel(opActual.rendimiento).color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '900', color: 'white' }}>
                    {opActual.nombre[0]}
                  </div>
                  <div>
                    <div style={{ fontSize: '22px', fontWeight: '800' }}>{opActual.nombre}</div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>{flechaTendencia(opActual.tendDir)} {opActual.tendencia} en el período</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Órdenes totales', value: opActual.misOrdenes },
                    { label: 'Completadas',     value: opActual.completadas },
                    { label: 'KG producidos',   value: opActual.totalKgProducido.toFixed(0) + ' kg' },
                  ].map(k => (
                    <div key={k.label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '22px', fontWeight: '800', color: ACCENT }}>{k.value}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Producción (helado) */}
              <div style={CARD}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', color: ACCENT, margin: '0 0 16px' }}>📦 Cumplimiento de producción (helado)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '12px', marginBottom: '16px' }}>
                  {[
                    { label: 'Cumplimiento vs objetivo', value: opActual.pctHeladoProd !== null ? opActual.pctHeladoProd + '%' : 'Sin datos', sub: opActual.totalKgObjetivo > 0 ? `${opActual.totalKgProducido.toFixed(0)} de ${opActual.totalKgObjetivo.toFixed(0)} kg` : '', color: nivel(opActual.pctHeladoProd).color },
                    { label: 'Órdenes al 95%+', value: opActual.conProd > 0 ? datos.ordenes.filter(o => o.operario_nombre === opActual.nombre && o.estado === 'completada' && !esUnidad(o) && Number(o.kg_objetivo) > 0 && Number(o.kg_producido) > 0 && (Number(o.kg_producido) / Number(o.kg_objetivo)) >= 0.95).length + ' de ' + opActual.conProd : '—', color: '#10b981' },
                    { label: 'Promedio kg/orden', value: opActual.conProd > 0 ? (opActual.totalKgProducido / opActual.heladoCompletadas).toFixed(1) + ' kg' : '—', color: '#3b82f6' },
                  ].map(k => (
                    <div key={k.label} style={{ background: '#0f172a', borderRadius: '6px', padding: '14px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: k.color }}>{k.value}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{k.label}</div>
                      {k.sub && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{k.sub}</div>}
                    </div>
                  ))}
                </div>
                {opActual.sinRegistroKg > 0 && (
                  <div style={{ background: '#f59e0b1a', border: '1px solid #f59e0b', borderRadius: '6px', padding: '10px 12px', fontSize: '12px', color: '#fbbf24', marginBottom: '12px' }}>
                    ⚠ {opActual.sinRegistroKg} orden(es) completada(s) sin kg registrado — no se computan en el cumplimiento. Conviene cargar la producción en el módulo Producción.
                  </div>
                )}
                {opActual.ultimas10.length > 0 && (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={opActual.ultimas10}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="nombre" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: '12px' }} />
                      <Legend />
                      <Bar dataKey="objetivo" name="Kg objetivo" fill="#334155" />
                      <Bar dataKey="producido" name="Kg producido" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Eficiencia de mano de obra (etapas) */}
              <div style={CARD}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: ACCENT, margin: '0 0 16px' }}>⏱ Eficiencia de mano de obra</h3>
                {opActual.pctEficiencia !== null ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '12px' }}>
                    {[
                      { label: 'Eficiencia (estándar / real)', value: opActual.pctEficiencia + '%', color: nivel(opActual.pctEficiencia).color },
                      { label: 'Tiempo estándar', value: fmtMin(opActual.stdMin), color: '#64748b' },
                      { label: 'Tiempo real activo', value: fmtMin(opActual.realMin), color: opActual.realMin > opActual.stdMin ? '#ef4444' : '#10b981' },
                    ].map(k => (
                      <div key={k.label} style={{ background: '#0f172a', borderRadius: '6px', padding: '14px', border: '1px solid #334155' }}>
                        <div style={{ fontSize: '20px', fontWeight: '800', color: k.color }}>{k.value}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', background: '#0f172a', borderRadius: '6px' }}>
                    Sin etapas registradas en el período. La eficiencia se calcula cuando el operario carga sus etapas (moldeado, desmolde, baño…) en el detalle de la orden. La espera del abatidor no cuenta como trabajo.
                  </div>
                )}
              </div>

              {/* Postres / impulsivos — circuito propio */}
              {(opActual.unidadAsignadas > 0 || opActual.unidadesTerminadas > 0) && (
                <div style={CARD}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: ACCENT, margin: '0 0 16px' }}>🍰 Postres y especiales</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '12px' }}>
                    {[
                      { label: 'Lotes completados', value: `${opActual.postresLotes} de ${opActual.unidadAsignadas}`, color: '#10b981' },
                      { label: 'Unidades planificadas', value: `${opActual.postresUnidades} u`, color: ACCENT },
                      { label: 'Unidades terminadas (sus etapas)', value: `${opActual.unidadesTerminadas} u`, color: '#3b82f6' },
                    ].map(k => (
                      <div key={k.label} style={{ background: '#0f172a', borderRadius: '6px', padding: '14px', border: '1px solid #334155' }}>
                        <div style={{ fontSize: '20px', fontWeight: '800', color: k.color }}>{k.value}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actividad operativa (cámara / depósito / mermas) */}
              <div style={CARD}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: ACCENT, margin: '0 0 16px' }}>🗂 Actividad operativa</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '12px' }}>
                  {[
                    { label: 'Movimientos de cámara', value: opActual.actividad?.camara ?? 0, color: '#60a5fa' },
                    { label: 'Retiros de depósito', value: opActual.actividad?.deposito ?? 0, color: '#a78bfa' },
                    { label: 'Mermas registradas', value: opActual.actividad?.mermas ?? 0, color: (opActual.actividad?.mermas ?? 0) > 0 ? '#f59e0b' : '#64748b' },
                  ].map(k => (
                    <div key={k.label} style={{ background: '#0f172a', borderRadius: '6px', padding: '14px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: k.color }}>{k.value}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{k.label}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '11px', color: '#64748b', marginTop: '10px' }}>Actividad del operario fuera de producción, para tener el panorama completo de su jornada.</p>
              </div>

              {/* Comparativa */}
              <div style={CARD}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: ACCENT, margin: '0 0 16px' }}>👥 Comparativa con el equipo (helado)</h3>
                {(() => {
                  const misProductos = [...new Set(datos.ordenes.filter(o => o.operario_nombre === opActual.nombre && o.estado === 'completada' && !esUnidad(o) && Number(o.kg_objetivo) > 0 && Number(o.kg_producido) > 0).map(o => o.sabor_nombre))].filter(Boolean)
                  if (misProductos.length === 0) return <p style={{ color: '#64748b' }}>Sin órdenes de helado con kg registrado para comparar</p>
                  return (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: '#334155' }}>
                            {['Producto', 'Mi promedio', 'Prom. equipo', 'Mejor del equipo', 'Mi posición'].map(h => (
                              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {misProductos.slice(0, 10).map(prod => {
                            const todos = datos.comparativas[prod] || []
                            if (todos.length === 0) return null
                            const misPcts = todos.filter(x => x.operario === opActual.nombre).map(x => x.pct)
                            const miProm = misPcts.length > 0 ? Math.round(misPcts.reduce((a, b) => a + b, 0) / misPcts.length) : null
                            const promEquipo = Math.round(todos.reduce((a, x) => a + x.pct, 0) / todos.length)
                            const mejor = todos.reduce((best, x) => x.pct > best.pct ? x : best, todos[0])
                            const posiciones = [...new Set(todos.map(x => x.operario))].map(op => ({ op, avg: Math.round(todos.filter(x => x.operario === op).reduce((a, x) => a + x.pct, 0) / todos.filter(x => x.operario === op).length) })).sort((a, b) => b.avg - a.avg)
                            const miPos = posiciones.findIndex(p => p.op === opActual.nombre) + 1
                            return (
                              <tr key={prod} style={{ borderBottom: '1px solid #1e293b' }}>
                                <td style={{ padding: '10px 12px', fontWeight: '600' }}>{prod}</td>
                                <td style={{ padding: '10px 12px', color: miProm !== null && miProm >= promEquipo ? '#10b981' : '#f59e0b', fontWeight: '700' }}>{miProm !== null ? miProm + '%' : '—'}</td>
                                <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{promEquipo}%</td>
                                <td style={{ padding: '10px 12px', color: '#fbbf24' }}>{mejor.pct}% <span style={{ color: '#64748b', fontSize: '11px' }}>({mejor.operario.split(' ')[0]})</span></td>
                                <td style={{ padding: '10px 12px', color: miPos === 1 ? '#fbbf24' : miPos <= 3 ? '#10b981' : '#94a3b8', fontWeight: '700' }}>{miPos}° de {posiciones.length}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                })()}
              </div>

              {/* Historial */}
              <div style={CARD}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: ACCENT, margin: '0 0 16px' }}>📋 Historial de órdenes</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ background: '#334155' }}>
                        {['Fecha', 'Producto', 'Tipo', 'Objetivo', 'Producido', 'Cumpl.', 'Estado'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {datos.ordenes.filter(o => o.operario_nombre === opActual.nombre).map(o => {
                        const unidad = esUnidad(o)
                        const compl = o.estado === 'completada'
                        const kgObj  = Number(o.kg_objetivo)  || 0
                        const kgReal = Number(o.kg_producido) || 0
                        const uds = Number(o.cantidad_unidades) || 0
                        const pctP = !unidad && kgObj > 0 && kgReal > 0 ? Math.round(kgReal / kgObj * 100) : null
                        const cumpl = unidad ? (compl ? '100%' : '—') : (pctP !== null ? pctP + '%' : '—')
                        const cumplColor = unidad ? (compl ? '#10b981' : '#64748b') : (pctP === null ? '#64748b' : pctP >= 95 ? '#10b981' : pctP >= 75 ? '#f59e0b' : '#ef4444')
                        return (
                          <tr key={o.id} style={{ borderBottom: '1px solid #1e293b' }}>
                            <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{o.fecha_produccion || (o.created_at || '').slice(0, 10) || '—'}</td>
                            <td style={{ padding: '8px 10px', fontWeight: '600', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.sabor_nombre || '—'}</td>
                            <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{unidad ? (o.tipo_producto === 'postre' ? 'Postre' : 'Impulsivo') : 'Helado'}</td>
                            <td style={{ padding: '8px 10px', color: '#64748b' }}>{unidad ? (uds > 0 ? `${uds} u` : '—') : (kgObj > 0 ? kgObj.toFixed(1) + ' kg' : '—')}</td>
                            <td style={{ padding: '8px 10px' }}>{unidad ? (compl && uds > 0 ? `${uds} u` : '—') : (kgReal > 0 ? kgReal.toFixed(1) + ' kg' : '—')}</td>
                            <td style={{ padding: '8px 10px', color: cumplColor, fontWeight: '700' }}>{cumpl}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{ background: compl ? '#10b98122' : '#f59e0b22', color: compl ? '#10b981' : '#f59e0b', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>
                                {compl ? 'Completada' : (o.estado === 'en_proceso' ? 'En proceso' : 'Pendiente')}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {datos.ordenes.filter(o => o.operario_nombre === opActual.nombre).length === 0 && (
                    <p style={{ color: '#64748b', padding: '16px', textAlign: 'center' }}>Sin órdenes en el período</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p style={{ color: '#64748b' }}>Seleccioná un operario</p>
          )}
        </div>
      )}

      {/* ── TAB RANKING ── */}
      {tab === 'ranking' && (
        <div style={CARD}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 20px' }}>🏆 Tabla de posiciones</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#334155' }}>
                  {['Pos', 'Operario', 'Órdenes', 'Completadas', 'Cumpl. producción', 'Eficiencia', 'Postres', 'Rendimiento', 'Nivel'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datos.ranking.map((r, i) => {
                  const nv = nivel(r.rendimiento)
                  return (
                    <tr key={r.nombre} onClick={() => { setOperarioSel(r.nombre); setTab('operario') }}
                      style={{ borderBottom: '1px solid #1e293b', cursor: 'pointer', background: i === 0 ? 'rgba(251,191,36,0.05)' : i === 1 ? 'rgba(148,163,184,0.05)' : i === 2 ? 'rgba(205,124,47,0.05)' : 'transparent' }}>
                      <td style={{ padding: '12px', fontSize: '18px' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                      <td style={{ padding: '12px', fontWeight: '700' }}>{r.nombre}</td>
                      <td style={{ padding: '12px', color: '#64748b' }}>{r.misOrdenes}</td>
                      <td style={{ padding: '12px', color: '#64748b' }}>{r.completadas}</td>
                      <td style={{ padding: '12px', color: nivel(r.pctProduccion).color, fontWeight: '700' }}>{r.pctProduccion !== null ? r.pctProduccion + '%' : '—'}</td>
                      <td style={{ padding: '12px', color: r.pctEficiencia !== null ? nivel(r.pctEficiencia).color : '#64748b', fontWeight: '700' }}>{r.pctEficiencia !== null ? r.pctEficiencia + '%' : '—'}</td>
                      <td style={{ padding: '12px', color: '#94a3b8' }}>{r.postresLotes > 0 ? `${r.postresLotes} · ${r.postresUnidades} u` : '—'}</td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '70px', background: '#334155', borderRadius: '4px', height: '8px' }}>
                            <div style={{ width: Math.min(r.rendimiento || 0, 100) + '%', background: nv.color, borderRadius: '4px', height: '8px' }} />
                          </div>
                          <span style={{ color: nv.color, fontWeight: '800', minWidth: '38px' }}>{r.rendimiento !== null ? r.rendimiento + '%' : '—'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ background: nv.bg, color: nv.color, padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '700' }}>{nv.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {datos.ranking.length === 0 && <p style={{ color: '#64748b', padding: '16px', textAlign: 'center' }}>Sin datos en el período</p>}
        </div>
      )}

      {/* ── TAB PDF ── */}
      {tab === 'pdf' && (
        <div style={CARD}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 12px' }}>📄 Generar Informe PDF</h3>
          <p style={{ color: '#64748b', marginBottom: '20px', margin: '0 0 20px' }}>
            Informe ejecutivo listo para presentar a los dueños. Incluye ranking, detalle por operario e historial.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => generarPDF('equipo')}
              style={{ padding: '10px 20px', background: ACCENT, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
              📊 Informe del equipo
            </button>
            <select value={operarioSel} onChange={e => setOperarioSel(e.target.value)}
              style={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', padding: '10px', borderRadius: '6px' }}>
              {datos.ranking.map(r => <option key={r.nombre} value={r.nombre}>{r.nombre}</option>)}
            </select>
            <button onClick={() => generarPDF('operario')}
              style={{ padding: '10px 20px', background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
              👤 Informe individual
            </button>
          </div>
        </div>
      )}

      {/* Gráfico oculto evolución operario — captura PDF */}
      <div ref={chartRefEvol} style={{ position: 'fixed', left: '-9999px', top: '0', width: '760px', height: '260px', background: '#1e293b', padding: '16px 20px', zIndex: -1, borderRadius: '8px' }}>
        <BarChart width={720} height={228} data={opActual?.ultimas10 || []}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="nombre" stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 10 }} />
          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }} />
          <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 11 }} />
          <Bar dataKey="objetivo" fill="#334155" radius={[3, 3, 0, 0]} />
          <Bar dataKey="producido" fill="#FF4713" radius={[3, 3, 0, 0]} />
        </BarChart>
      </div>
    </div>
  )
}
