// ════════════════════════════════════════════════════════════════════════════
// Comprobante de Conteo — PDF de UN conteo puntual (cámara o depósito).
// Lee las filas de ese conteo (mismas que guarda conteos_stock) y arma un
// comprobante profesional B&N: contados, faltantes y sobrantes con su motivo y
// su costo valorizado, y el neto. Sirve para el momento del conteo Y para
// reimprimir cualquier conteo pasado desde el Historial.
// ════════════════════════════════════════════════════════════════════════════
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  dibujarPortada, dibujarEncabezado, dibujarPie, dibujarSeccion, dibujarFirmas,
  dibujarKpiCard, dibujarKpiCardDestacada,
  PDF_CONTENT_Y, PDF_SEM_NEG, PDF_SEM_OK,
} from './pdfEstilos'
import { resumenSemanal } from './conteos'
import { normalizarNombre } from './texto'

const money = n => `$${(Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const num = n => (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })

// La fecha del ciclo llega como timestamp ISO (ej. 2026-07-04T16:36:19+00:00).
// La mostramos legible: "04/07/2026 13:36 hs". Si no es una fecha válida,
// devolvemos el texto recortado al día.
const fmtFechaConteo = f => {
  if (!f) return ''
  const d = new Date(f)
  if (isNaN(d.getTime())) return String(f).slice(0, 10)
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' hs'
}

// rows: filas de conteos_stock de UN ciclo. meta: { area, fecha, responsable }.
// precios: mapa normalizarNombre(producto) → costo unitario ACTUAL. Se usa para
// re-valorizar las diferencias cuyo valor_impacto quedó en 0/null (porque el
// precio no estaba cargado al momento del conteo), así el comprobante refleja el
// costo real aunque el precio se haya cargado después.
export function generarComprobanteConteo({ rows = [], area = '', fecha = '', responsable = '', precios = {} } = {}) {
  const rowsVal = rows.map(r => {
    const vi = Number(r.valor_impacto) || 0
    if (vi !== 0) return r
    const dif = Number(r.diferencia) || 0
    const precio = Number(precios[normalizarNombre(r.producto_nombre || '')]) || 0
    return (dif !== 0 && precio > 0) ? { ...r, valor_impacto: dif * precio } : r
  })
  const R = resumenSemanal(rowsVal)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const N = [20, 20, 20]
  const areaLbl = area === 'camara' ? 'Cámara' : area === 'deposito' ? 'Depósito' : (area || '')
  const MOD = (areaLbl || 'STOCK').toUpperCase()
  const TIT = 'COMPROBANTE DE CONTEO'
  const hoy = new Date().toLocaleString('es-AR')
  const fechaLbl = fmtFechaConteo(fecha)
  const encab = () => dibujarEncabezado(doc, pw, MOD, TIT, hoy)
  const BW_HEAD = { fillColor: [35, 35, 35], textColor: [255, 255, 255], halign: 'center', fontStyle: 'bold', lineWidth: 0.1, lineColor: [180, 180, 180] }
  const BW_BODY = { textColor: [25, 25, 25], halign: 'center', lineWidth: 0.1, lineColor: [210, 210, 210] }
  const tabla = (opts) => autoTable(doc, {
    headStyles: BW_HEAD, bodyStyles: BW_BODY, alternateRowStyles: { fillColor: [244, 244, 244] }, footStyles: BW_HEAD,
    styles: { fontSize: 8, cellPadding: 2, halign: 'center', valign: 'middle' },
    margin: { top: PDF_CONTENT_Y, left: 14, right: 14 }, didDrawPage: encab, ...opts,
  })
  const fmtDif = r => {
    const d0 = Math.round((Number(r.diferencia) || 0) * 1000) / 1000
    const d = d0 === 0 ? 0 : d0   // normaliza -0 → 0 (evita el "-0" poco profesional)
    return `${d > 0 ? '+' : ''}${num(d)}`
  }
  const fmtVal = r => r.valor_impacto == null ? '—' : money(Math.abs(Number(r.valor_impacto)))

  // Portada
  dibujarPortada(doc, pw, ph, MOD, 'Comprobante de Conteo', `${areaLbl}${fechaLbl ? ' · ' + fechaLbl : ''}`, hoy)

  // ── Resumen ────────────────────────────────────────────────────────────────
  doc.addPage(); encab()
  let y = PDF_CONTENT_Y
  y = dibujarSeccion(doc, pw, 'Resumen del conteo', y)

  // Metadatos del conteo
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90, 90, 90)
  doc.text(`Área: ${areaLbl}      ·      Fecha: ${fechaLbl || hoy}      ·      Responsable: ${responsable || '—'}`, 14, y + 1)
  y += 10

  // Tarjetas: faltante (rojo), sobrante (verde) y ajuste neto (destacado, verde/rojo)
  const gap = 6
  const cardW = (pw - 28 - 2 * gap) / 3
  const cardH = 23
  const netoColor = R.impactoNeto >= 0 ? PDF_SEM_OK : PDF_SEM_NEG
  dibujarKpiCard(doc, 14, y, cardW, cardH, 'Faltante valorizado', `$${num(R.valorFaltante)}`, PDF_SEM_NEG)
  dibujarKpiCard(doc, 14 + cardW + gap, y, cardW, cardH, 'Sobrante valorizado', `$${num(R.valorSobrante)}`, PDF_SEM_OK)
  dibujarKpiCardDestacada(doc, 14 + 2 * (cardW + gap), y, cardW, cardH, 'Ajuste neto',
    `${R.impactoNeto >= 0 ? '+' : '-'}$${num(Math.abs(R.impactoNeto))}`, netoColor)
  y += cardH + 10

  // ── Redacción profesional: propósito + resultado + exactitud ────────────────
  const sinDif = Math.max(0, R.totalContados - R.faltantes.length - R.sobrantes.length)
  const plN = R.totalContados === 1 ? 'producto' : 'productos'
  const exactitud = R.totalContados > 0 ? Math.round((sinDif / R.totalContados) * 100) : 100
  const netoTxt = R.impactoNeto > 0 ? 'positivo (sobrante)' : R.impactoNeto < 0 ? 'negativo (faltante)' : 'nulo'
  const narrativa =
    `El conteo físico contrasta las existencias reales contra el inventario del sistema: permite corregir desvíos y valorizar pérdidas o excedentes originados en merma, error de carga, producción o consumo no registrados. ` +
    `En este relevamiento se contaron ${R.totalContados} ${plN} del área de ${areaLbl}, con una exactitud del ${exactitud}% (coincidencia con el sistema): ${sinDif} sin diferencias, ${R.faltantes.length} con faltante y ${R.sobrantes.length} con sobrante. ` +
    `El faltante implica una pérdida valorizada de $${num(R.valorFaltante)} y el sobrante un excedente de $${num(R.valorSobrante)}, con un ajuste neto ${netoTxt} de $${num(Math.abs(R.impactoNeto))} sobre el inventario valorizado.`
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...N)
  const lineasNar = doc.splitTextToSize(narrativa, pw - 28)
  lineasNar.forEach((l, i) => doc.text(l, 14, y + i * 5)); y += lineasNar.length * 5 + 5

  // ── Diagnóstico y recomendaciones (según los datos del conteo) ──────────────
  const recos = []
  if (exactitud >= 98) recos.push(`Exactitud alta (${exactitud}%): el control de stock es confiable. Sostené la frecuencia de conteo para mantenerla.`)
  else if (exactitud >= 90) recos.push(`Exactitud aceptable (${exactitud}%), con margen de mejora. Reforzá el registro de ingresos y egresos para acercarla al 100%.`)
  else recos.push(`Exactitud baja (${exactitud}%): revisá el circuito de cargas (movimientos sin registrar) y priorizá recontar los productos con mayor desvío.`)
  const sinPrecio = R.faltantes.filter(r => (Number(r.valor_impacto) || 0) === 0).length
  if (sinPrecio > 0) recos.push(`${sinPrecio} ${sinPrecio === 1 ? 'producto con faltante no tiene' : 'productos con faltante no tienen'} precio cargado: cargá su costo en Depósito para valorizar correctamente la pérdida.`)
  if (R.impactoNeto < 0) recos.push(`El faltante neto de $${num(Math.abs(R.impactoNeto))} debe investigarse (merma, consumo sin registrar o error de carga) y dejar asentado el motivo de cada diferencia.`)
  else if (R.impactoNeto > 0) recos.push(`Los sobrantes suelen indicar producción o ingresos no registrados: cargalos en el sistema para que el stock refleje la realidad.`)
  recos.push('Documentar el motivo de cada diferencia es la base para reducir los desvíos en los próximos conteos y sostener la trazabilidad del inventario.')

  y = dibujarSeccion(doc, pw, 'Diagnóstico y recomendaciones', y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60)
  recos.forEach(t => {
    if (y > ph - 30) { doc.addPage(); encab(); y = PDF_CONTENT_Y }
    const ls = doc.splitTextToSize(t, pw - 34)
    doc.text('•', 15, y)
    ls.forEach((l, i) => doc.text(l, 19, y + i * 4.6))
    y += ls.length * 4.6 + 2
  })
  y += 5

  if (R.totalContados === 0) {
    doc.setTextColor(120, 120, 120); doc.text('Sin diferencias registradas en este conteo.', 14, y + 2)
    dibujarPie(doc, pw, ph, doc.internal.getCurrentPageInfo().pageNumber)
    return doc
  }

  const drawTabla = (titulo, filas) => {
    if (!filas.length) return
    if (y + 24 > ph - 20) { doc.addPage(); encab(); y = PDF_CONTENT_Y }
    y = dibujarSeccion(doc, pw, titulo, y)
    tabla({
      startY: y,
      head: [['PRODUCTO', 'SISTEMA', 'FÍSICO', 'DIF.', 'COSTO $', 'MOTIVO']],
      body: filas.map(r => [r.producto_nombre, num(r.stock_sistema), num(r.stock_fisico), fmtDif(r), fmtVal(r), r.motivo || '—']),
      columnStyles: { 0: { halign: 'left' }, 5: { halign: 'left', cellWidth: 46 } },
    })
    y = doc.lastAutoTable.finalY + 8
  }
  drawTabla(`Faltantes — total $${num(R.valorFaltante)}`, R.faltantes)
  drawTabla(`Sobrantes — total $${num(R.valorSobrante)}`, R.sobrantes)

  if (y + 24 > ph - 20) { doc.addPage(); encab(); y = PDF_CONTENT_Y }
  dibujarFirmas(doc, pw, ph, y, MOD, hoy, ['Responsable del conteo', 'Supervisor'])
  const total = doc.internal.getNumberOfPages()
  for (let p = 2; p <= total; p++) { doc.setPage(p); dibujarPie(doc, pw, ph, p) }
  return doc
}
