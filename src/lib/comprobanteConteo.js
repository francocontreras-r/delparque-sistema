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
  PDF_CONTENT_Y,
} from './pdfEstilos'
import { resumenSemanal } from './conteos'

const money = n => `$${(Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const num = n => (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })

// rows: filas de conteos_stock de UN ciclo. meta: { area, fecha, responsable }
export function generarComprobanteConteo({ rows = [], area = '', fecha = '', responsable = '' } = {}) {
  const R = resumenSemanal(rows)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const N = [20, 20, 20]
  const areaLbl = area === 'camara' ? 'Cámara' : area === 'deposito' ? 'Depósito' : (area || '')
  const MOD = (areaLbl || 'STOCK').toUpperCase()
  const TIT = 'COMPROBANTE DE CONTEO'
  const hoy = new Date().toLocaleString('es-AR')
  const encab = () => dibujarEncabezado(doc, pw, MOD, TIT, hoy)
  const BW_HEAD = { fillColor: [35, 35, 35], textColor: [255, 255, 255], halign: 'center', fontStyle: 'bold', lineWidth: 0.1, lineColor: [180, 180, 180] }
  const BW_BODY = { textColor: [25, 25, 25], halign: 'center', lineWidth: 0.1, lineColor: [210, 210, 210] }
  const tabla = (opts) => autoTable(doc, {
    headStyles: BW_HEAD, bodyStyles: BW_BODY, alternateRowStyles: { fillColor: [244, 244, 244] }, footStyles: BW_HEAD,
    styles: { fontSize: 8, cellPadding: 2, halign: 'center', valign: 'middle' },
    margin: { top: PDF_CONTENT_Y, left: 14, right: 14 }, didDrawPage: encab, ...opts,
  })
  const fmtDif = r => `${(Number(r.diferencia) || 0) > 0 ? '+' : ''}${num(r.diferencia)}`
  const fmtVal = r => r.valor_impacto == null ? '—' : money(Math.abs(Number(r.valor_impacto)))

  // Portada
  dibujarPortada(doc, pw, ph, MOD, 'Comprobante de Conteo', `${areaLbl}${fecha ? ' · ' + fecha : ''}`, hoy)

  // Resumen
  doc.addPage(); encab()
  let y = PDF_CONTENT_Y
  y = dibujarSeccion(doc, pw, 'Resumen del conteo', y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...N)
  const linea = `Área: ${areaLbl}   ·   Fecha: ${fecha || hoy}   ·   Responsable: ${responsable || '—'}`
  doc.text(linea, 14, y + 2); y += 8
  const resumen = `Se contaron ${R.totalContados} productos: ${R.faltantes.length} con faltante y ${R.sobrantes.length} con sobrante. ` +
    `Faltante valorizado $${num(R.valorFaltante)} · Sobrante valorizado $${num(R.valorSobrante)} · ` +
    `Neto ${R.impactoNeto >= 0 ? '+' : '-'}$${num(Math.abs(R.impactoNeto))}.`
  doc.splitTextToSize(resumen, pw - 28).forEach((l, i) => doc.text(l, 14, y + i * 5))
  y += doc.splitTextToSize(resumen, pw - 28).length * 5 + 6

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
