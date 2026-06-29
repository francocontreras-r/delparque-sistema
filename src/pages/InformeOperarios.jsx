import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import {
  getEstiloInforme, dibujarPortada, dibujarEncabezado, dibujarPie,
  dibujarKpi, dibujarSeccion, dibujarFirmas,
  PDF_CONTENT_Y, PDF_NEGRO, PDF_BLANCO,
} from '../lib/pdfEstilos'

const ACCENT = '#D4521A'
const CARD = { background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '20px', marginBottom: '16px' }
const PERIODOS = [['semana', 'Semana'], ['mes', 'Mes'], ['trimestre', 'Trimestre']]
const TABS = [['equipo', '👥 Equipo'], ['operario', '👤 Por Operario'], ['ranking', '🏆 Ranking'], ['pdf', '📄 Informe PDF']]

function nivel(pct) {
  if (pct === null || pct === undefined) return { label: 'Sin datos', color: '#64748b', bg: '#64748b22' }
  if (pct >= 90) return { label: 'EXCELENTE', color: '#10b981', bg: '#10b98122' }
  if (pct >= 75) return { label: 'BUENO',     color: '#3b82f6', bg: '#3b82f622' }
  if (pct >= 60) return { label: 'REGULAR',   color: '#f59e0b', bg: '#f59e0b22' }
  return                 { label: 'BAJO',       color: '#ef4444', bg: '#ef444422' }
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

      const [{ data: ops, error: e1 }, { data: ords, error: e2 }] = await Promise.all([
        supabase.from('operarios').select('id,nombre').eq('activo', true).order('nombre'),
        supabase.from('ordenes_produccion').select('*').gte('created_at', desde.toISOString()).order('created_at', { ascending: false }),
      ])
      if (e1) throw e1
      if (e2) throw e2

      const operarios = [...new Map((ops || []).map(o => [o.nombre.toUpperCase(), { ...o, nombre: o.nombre.toUpperCase() }])).values()]
      const ordenes = (ords || []).map(o => ({
        ...o,
        operario_nombre: (o.operario_nombre || '').toUpperCase(),
        sabor_nombre: (o.sabor_nombre || o.producto_nombre || '').toUpperCase(),
      }))

      const ranking = operarios.map(op => {
        const misOrdenes  = ordenes.filter(o => o.operario_nombre === op.nombre)
        const completadas = misOrdenes.filter(o => o.estado === 'completada')
        const conKg       = completadas.filter(o => Number(o.kg_objetivo) > 0)
        const conTiempo   = completadas.filter(o => Number(o.horas_estimadas) > 0 && Number(o.horas_reales) > 0)

        const pctProduccion = conKg.length > 0
          ? Math.round(conKg.reduce((a, o) => a + Math.min((Number(o.kg_producido) || 0) / Number(o.kg_objetivo) * 100, 120), 0) / conKg.length)
          : null

        const pctTiempo = conTiempo.length > 0
          ? Math.round(conTiempo.reduce((a, o) => a + Math.min((Number(o.horas_estimadas) / Number(o.horas_reales)) * 100, 120), 0) / conTiempo.length)
          : null

        const pctCumplimiento = misOrdenes.length > 0
          ? Math.round((completadas.length / misOrdenes.length) * 100)
          : null

        const partes = []
        if (pctProduccion  !== null) partes.push({ v: pctProduccion,  w: 0.5 })
        if (pctTiempo      !== null) partes.push({ v: pctTiempo,      w: 0.3 })
        if (pctCumplimiento !== null) partes.push({ v: pctCumplimiento, w: 0.2 })
        const rendimiento = partes.length > 0
          ? Math.round(partes.reduce((a, p) => a + p.v * p.w, 0) / partes.reduce((a, p) => a + p.w, 0))
          : null

        const ultimas10 = completadas.slice(0, 10).map(o => ({
          nombre:    (o.sabor_nombre || '?').slice(0, 12),
          objetivo:  Number(o.kg_objetivo)  || 0,
          producido: Number(o.kg_producido) || 0,
        })).reverse()

        const mitad = Math.floor(completadas.length / 2)
        const primera = completadas.slice(mitad).filter(o => Number(o.kg_objetivo) > 0)
        const segunda = completadas.slice(0, mitad).filter(o => Number(o.kg_objetivo) > 0)
        const avgP = primera.length > 0 ? primera.reduce((a, o) => a + (Number(o.kg_producido) || 0) / Number(o.kg_objetivo) * 100, 0) / primera.length : null
        const avgS = segunda.length > 0 ? segunda.reduce((a, o) => a + (Number(o.kg_producido) || 0) / Number(o.kg_objetivo) * 100, 0) / segunda.length : null
        const tendencia = avgP !== null && avgS !== null
          ? avgS > avgP + 3 ? '↑ Mejorando' : avgS < avgP - 3 ? '↓ Bajando' : '→ Estable'
          : '— Sin datos'

        return {
          ...op,
          misOrdenes: misOrdenes.length,
          completadas: completadas.length,
          pctProduccion, pctTiempo, pctCumplimiento, rendimiento,
          ultimas10, tendencia,
          totalKgProducido: completadas.reduce((a, o) => a + (Number(o.kg_producido) || 0), 0),
          totalKgObjetivo:  completadas.reduce((a, o) => a + (Number(o.kg_objetivo)  || 0), 0),
          horasPromEst:  conTiempo.length > 0 ? conTiempo.reduce((a, o) => a + Number(o.horas_estimadas), 0) / conTiempo.length : null,
          horasPromReal: conTiempo.length > 0 ? conTiempo.reduce((a, o) => a + Number(o.horas_reales),     0) / conTiempo.length : null,
        }
      }).sort((a, b) => (b.rendimiento || 0) - (a.rendimiento || 0))

      const comparativas = {}
      ordenes.filter(o => o.estado === 'completada' && Number(o.kg_objetivo) > 0).forEach(o => {
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

      // Helpers para gráficos nativos (Power BI-style, sin html2canvas)
      const hexRgb = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
      const nivelRgb = pct => hexRgb(nivel(pct).color)
      const esClaro = c => (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) > 150

      // P3 — Tablero del equipo
      if (tipo === 'equipo') {
        doc.addPage()
        const ranking  = datos.ranking
        const conDatos = ranking.filter(r => r.rendimiento !== null)
        const promRend = conDatos.length > 0
          ? Math.round(conDatos.reduce((a, r) => a + r.rendimiento, 0) / conDatos.length) : null
        const completadasTot = ranking.reduce((a, r) => a + r.completadas, 0)
        const mejor = conDatos[0] || null

        // KPI cards con acento (consistente con Finanzas/Mermas)
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

        // Ranking por rendimiento (barras horizontales, color por nivel)
        if (conDatos.length > 0) {
          y = dibujarSeccion(doc, pw, 'Ranking por rendimiento', y)
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
          head: [['POS', 'OPERARIO', 'ÓRDENES', 'COMPLET.', '% PROD.', '% TIEMPO', 'RENDIM.', 'NIVEL']],
          body: ranking.map((r, i) => [
            `${i + 1}°`,
            r.nombre,
            String(r.misOrdenes),
            String(r.completadas),
            r.pctProduccion !== null ? r.pctProduccion + '%' : '—',
            r.pctTiempo     !== null ? r.pctTiempo     + '%' : '—',
            r.rendimiento   !== null ? r.rendimiento   + '%' : '—',
            nivel(r.rendimiento).label,
          ]),
          columnStyles: {
            0: { halign: 'center', cellWidth: 12 },
            2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
            5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'center' },
          },
          didParseCell(data) {
            if (data.section !== 'body') return
            const r = ranking[data.row.index]
            if (!r) return
            if (data.column.index === 6 || data.column.index === 7) {
              data.cell.styles.textColor = nivelRgb(r.rendimiento)
              data.cell.styles.fontStyle = 'bold'
            }
          },
          didDrawPage: didDP('RANKING DEL EQUIPO'),
        })

      } else {
        const op = datos.ranking.find(r => r.nombre === operarioSel)
        if (!op) return

        doc.addPage()
        // KPIs del operario
        const kpiW = (pw - 28 - 4) / 2
        dibujarKpi(doc, 14,          PDF_CONTENT_Y,      kpiW, 18, 'Órdenes asignadas',  op.misOrdenes)
        dibujarKpi(doc, 14 + kpiW+2, PDF_CONTENT_Y,      kpiW, 18, 'Órdenes completadas', op.completadas)
        dibujarKpi(doc, 14,          PDF_CONTENT_Y + 22, kpiW, 18, 'KG total producidos', `${op.totalKgProducido.toFixed(1)} kg`)
        dibujarKpi(doc, 14 + kpiW+2, PDF_CONTENT_Y + 22, kpiW, 18, 'Rendimiento',         op.rendimiento !== null ? `${op.rendimiento}%` : '—')

        let y = PDF_CONTENT_Y + 48
        y = dibujarSeccion(doc, pw, `Perfil — ${op.nombre}`, y)
        autoTable(doc, {
          ...EST, startY: y,
          body: [
            ['Órdenes asignadas',         String(op.misOrdenes)],
            ['Órdenes completadas',        String(op.completadas)],
            ['% Producción vs objetivo',   op.pctProduccion !== null ? op.pctProduccion + '%' : '—'],
            ['% Eficiencia de tiempo',     op.pctTiempo     !== null ? op.pctTiempo     + '%' : '—'],
            ['KG total producidos',        op.totalKgProducido.toFixed(1) + ' kg'],
            ['Rendimiento global',         op.rendimiento   !== null ? op.rendimiento   + '%' : '—'],
            ['Nivel',                      nivel(op.rendimiento).label],
            ['Tendencia',                  op.tendencia || '—'],
          ],
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 }, 1: { halign: 'right' } },
          didDrawPage: didDP(`OPERARIO: ${op.nombre}`),
        })

        // Gráfico evolución últimas 10 órdenes
        if (chartRefEvol.current && op.ultimas10.length > 0) {
          try {
            let yE = doc.lastAutoTable.finalY + 8
            if (yE > ph - 60) { doc.addPage(); yE = PDF_CONTENT_Y }
            yE = dibujarSeccion(doc, pw, 'Evolución últimas órdenes', yE)
            const canvasEvol = await html2canvas(chartRefEvol.current, { backgroundColor: '#1e293b', scale: 2, logging: false, useCORS: true })
            const imgEvol = canvasEvol.toDataURL('image/png')
            const imgEvolH = (canvasEvol.height * (pw - 28)) / canvasEvol.width
            doc.setDrawColor(51, 65, 85); doc.setLineWidth(0.3)
            doc.rect(14, yE, pw - 28, imgEvolH)
            doc.addImage(imgEvol, 'PNG', 14, yE, pw - 28, imgEvolH)
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139)
            doc.text('KG objetivo vs producido — últimas 10 órdenes completadas', 14, yE + imgEvolH + 3)
          } catch (e) { console.warn('chart evol:', e) }
        }

        const ords = datos.ordenes.filter(o => o.operario_nombre === op.nombre)
        if (ords.length > 0) {
          let yH = doc.lastAutoTable.finalY + 8
          if (yH > ph - 50) { doc.addPage(); yH = PDF_CONTENT_Y }
          yH = dibujarSeccion(doc, pw, 'Historial de órdenes', yH)
          autoTable(doc, {
            ...EST, styles: { ...EST.styles, fontSize: 7 }, startY: yH,
            head: [['FECHA', 'PRODUCTO', 'KG OBJ.', 'KG REAL', '% PROD.', 'HS EST.', 'HS REAL', '% TIEMPO']],
            body: ords.map(o => {
              const kgObj  = Number(o.kg_objetivo)  || 0
              const kgReal = Number(o.kg_producido) || 0
              return [
                o.fecha_produccion || (o.created_at || '').slice(0, 10) || '—',
                (o.sabor_nombre || '—').slice(0, 22),
                kgObj  > 0 ? kgObj.toFixed(1)  : '—',
                kgReal > 0 ? kgReal.toFixed(1) : '—',
                kgObj  > 0 ? Math.round(kgReal / kgObj * 100) + '%' : '—',
                Number(o.horas_estimadas) > 0 ? Number(o.horas_estimadas).toFixed(1) : '—',
                Number(o.horas_reales)    > 0 ? Number(o.horas_reales).toFixed(1)    : '—',
                Number(o.eficiencia_tiempo) > 0 ? Math.round(Number(o.eficiencia_tiempo)) + '%' : '—',
              ]
            }),
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
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', color: ACCENT, fontSize: '18px' }}>
      Cargando rendimiento...
    </div>
  )
  if (error) return (
    <div style={{ padding: '24px', color: '#ef4444' }}>
      <p>Error: {error}</p>
      <button onClick={cargar} style={{ marginTop: '12px', padding: '8px 16px', background: ACCENT, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
        Reintentar
      </button>
    </div>
  )

  const opActual = datos.ranking.find(r => r.nombre === operarioSel) || null

  return (
    <div style={{ padding: '24px', background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#f1f5f9', margin: 0 }}>Rendimiento Operativo</h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>Análisis de productividad • Del Parque</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {PERIODOS.map(([k, l]) => (
            <button key={k} onClick={() => setPeriodo(k)}
              style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', background: periodo === k ? ACCENT : '#1e293b', color: periodo === k ? 'white' : '#94a3b8' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #334155' }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: tab === k ? '700' : '400', background: 'transparent', color: tab === k ? ACCENT : '#94a3b8', borderBottom: tab === k ? `2px solid ${ACCENT}` : '2px solid transparent' }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── TAB EQUIPO ── */}
      {tab === 'equipo' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Operarios activos',    value: datos.operarios.length, color: '#3b82f6' },
              { label: 'Órdenes completadas',  value: datos.ordenes.filter(o => o.estado === 'completada').length, color: '#10b981' },
              { label: 'Rendimiento promedio', value: (() => { const con = datos.ranking.filter(r => r.rendimiento !== null); return con.length > 0 ? Math.round(con.reduce((a, r) => a + r.rendimiento, 0) / con.length) + '%' : '—' })(), color: ACCENT },
              { label: 'Mejor operario',       value: datos.ranking[0]?.nombre.split(' ')[0] || '—', color: '#fbbf24' },
            ].map(k => (
              <div key={k.label} style={{ ...CARD, marginBottom: 0, borderTop: `3px solid ${k.color}` }}>
                <div style={{ fontSize: '26px', fontWeight: '800', color: k.color }}>{k.value}</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{k.label}</div>
              </div>
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
                    {[
                      { label: 'Producción', pct: op.pctProduccion, color: '#10b981' },
                      { label: 'Tiempo',     pct: op.pctTiempo,     color: ACCENT },
                      { label: 'Cumplim.',   pct: op.pctCumplimiento, color: '#3b82f6' },
                    ].map(bar => (
                      <div key={bar.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <span style={{ color: '#64748b', width: '80px', flexShrink: 0 }}>{bar.label}</span>
                        <Barra pct={bar.pct} color={bar.color} />
                        <span style={{ color: nivel(bar.pct).color, fontWeight: '700', width: '42px', textAlign: 'right' }}>
                          {bar.pct !== null ? bar.pct + '%' : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
                    <span>{op.tendencia}</span>
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
                    <div style={{ fontSize: '13px', color: '#64748b' }}>{opActual.tendencia} en el período</div>
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

              {/* Producción */}
              <div style={CARD}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', color: ACCENT, margin: '0 0 16px' }}>📦 ¿Qué tan bien produce?</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '12px', marginBottom: '16px' }}>
                  {[
                    { label: '% Producción vs objetivo', value: opActual.pctProduccion !== null ? opActual.pctProduccion + '%' : 'Sin datos', sub: opActual.totalKgObjetivo > 0 ? `${opActual.totalKgProducido.toFixed(0)} de ${opActual.totalKgObjetivo.toFixed(0)} kg` : '', color: nivel(opActual.pctProduccion).color },
                    { label: 'Órdenes al 95%+', value: opActual.completadas > 0 ? datos.ordenes.filter(o => o.operario_nombre === opActual.nombre && o.estado === 'completada' && Number(o.kg_objetivo) > 0 && (Number(o.kg_producido) / Number(o.kg_objetivo)) >= 0.95).length + ' de ' + opActual.completadas : '—', color: '#10b981' },
                    { label: 'Promedio kg/orden', value: opActual.completadas > 0 ? (opActual.totalKgProducido / opActual.completadas).toFixed(1) + ' kg' : '—', color: '#3b82f6' },
                  ].map(k => (
                    <div key={k.label} style={{ background: '#0f172a', borderRadius: '6px', padding: '14px', border: '1px solid #334155' }}>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: k.color }}>{k.value}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{k.label}</div>
                      {k.sub && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{k.sub}</div>}
                    </div>
                  ))}
                </div>
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

              {/* Tiempo */}
              <div style={CARD}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: ACCENT, margin: '0 0 16px' }}>⏱ ¿Qué tan rápido trabaja?</h3>
                {opActual.pctTiempo !== null ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '12px' }}>
                    {[
                      { label: 'Eficiencia de tiempo',      value: opActual.pctTiempo + '%', color: nivel(opActual.pctTiempo).color },
                      { label: 'Horas estimadas promedio',  value: opActual.horasPromEst  !== null ? opActual.horasPromEst.toFixed(1)  + ' hs' : '—', color: '#64748b' },
                      { label: 'Horas reales promedio',     value: opActual.horasPromReal !== null ? opActual.horasPromReal.toFixed(1) + ' hs' : '—', color: opActual.horasPromReal > opActual.horasPromEst ? '#ef4444' : '#10b981' },
                    ].map(k => (
                      <div key={k.label} style={{ background: '#0f172a', borderRadius: '6px', padding: '14px', border: '1px solid #334155' }}>
                        <div style={{ fontSize: '20px', fontWeight: '800', color: k.color }}>{k.value}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', background: '#0f172a', borderRadius: '6px' }}>
                    Sin datos de tiempo — las órdenes necesitan horas estimadas y registrar inicio/fin
                  </div>
                )}
              </div>

              {/* Comparativa */}
              <div style={CARD}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: ACCENT, margin: '0 0 16px' }}>👥 Comparativa con el equipo</h3>
                {(() => {
                  const misProductos = [...new Set(datos.ordenes.filter(o => o.operario_nombre === opActual.nombre && o.estado === 'completada' && Number(o.kg_objetivo) > 0).map(o => o.sabor_nombre))].filter(Boolean)
                  if (misProductos.length === 0) return <p style={{ color: '#64748b' }}>Sin órdenes completadas para comparar</p>
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
                        {['Fecha', 'Producto', 'Kg Obj.', 'Kg Real', '% Prod.', 'Hs Est.', 'Hs Real', '% Tiempo', 'Rendimiento', 'Estado'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {datos.ordenes.filter(o => o.operario_nombre === opActual.nombre).map(o => {
                        const kgObj  = Number(o.kg_objetivo)  || 0
                        const kgReal = Number(o.kg_producido) || 0
                        const pctP = kgObj > 0 ? Math.round(kgReal / kgObj * 100) : null
                        const pctT = Number(o.eficiencia_tiempo) || null
                        const rend = pctP !== null || pctT !== null ? Math.round(((pctP || 100) * 0.6) + ((pctT || 100) * 0.4)) : null
                        const nv = nivel(rend)
                        return (
                          <tr key={o.id} style={{ borderBottom: '1px solid #1e293b' }}>
                            <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{o.fecha_produccion || (o.created_at || '').slice(0, 10) || '—'}</td>
                            <td style={{ padding: '8px 10px', fontWeight: '600', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.sabor_nombre || '—'}</td>
                            <td style={{ padding: '8px 10px', color: '#64748b' }}>{kgObj > 0 ? kgObj.toFixed(1) : '—'}</td>
                            <td style={{ padding: '8px 10px' }}>{kgReal > 0 ? kgReal.toFixed(1) : '—'}</td>
                            <td style={{ padding: '8px 10px', color: pctP >= 95 ? '#10b981' : pctP >= 75 ? '#f59e0b' : '#ef4444', fontWeight: '700' }}>{pctP !== null ? pctP + '%' : '—'}</td>
                            <td style={{ padding: '8px 10px', color: '#64748b' }}>{Number(o.horas_estimadas) > 0 ? Number(o.horas_estimadas).toFixed(1) + 'h' : '—'}</td>
                            <td style={{ padding: '8px 10px', color: '#64748b' }}>{Number(o.horas_reales) > 0 ? Number(o.horas_reales).toFixed(1) + 'h' : '—'}</td>
                            <td style={{ padding: '8px 10px', color: pctT >= 95 ? '#10b981' : pctT >= 75 ? '#f59e0b' : '#ef4444', fontWeight: '700' }}>{pctT !== null ? Math.round(pctT) + '%' : '—'}</td>
                            <td style={{ padding: '8px 10px', color: nv.color, fontWeight: '800' }}>{rend !== null ? rend + '%' : '—'}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{ background: o.estado === 'completada' ? '#10b98122' : '#f59e0b22', color: o.estado === 'completada' ? '#10b981' : '#f59e0b', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>
                                {o.estado || '—'}
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
                  {['Pos', 'Operario', 'Órdenes', 'Completadas', '% Producción', '% Tiempo', '% Cumplimiento', 'Rendimiento', 'Nivel'].map(h => (
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
                      <td style={{ padding: '12px', color: nivel(r.pctTiempo).color, fontWeight: '700' }}>{r.pctTiempo !== null ? r.pctTiempo + '%' : '—'}</td>
                      <td style={{ padding: '12px', color: nivel(r.pctCumplimiento).color, fontWeight: '700' }}>{r.pctCumplimiento !== null ? r.pctCumplimiento + '%' : '—'}</td>
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
          <Bar dataKey="producido" fill="#D4521A" radius={[3, 3, 0, 0]} />
        </BarChart>
      </div>
    </div>
  )
}
