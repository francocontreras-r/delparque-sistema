const _logo = new Image()
_logo.src = '/logo-byn.png'
export const LOGO_PDF = _logo

// ── Constantes globales de diseño ─────────────────────────────────────────────
export const PDF_NEGRO      = [20, 20, 20]
export const PDF_BLANCO     = [255, 255, 255]
export const PDF_GRIS_CLARO = [245, 245, 245]
export const PDF_GRIS_MED   = [210, 210, 210]
export const PDF_GRIS_OSC   = [80, 80, 80]
export const PDF_CONTENT_Y  = 35   // Y donde arranca el contenido tras el encabezado
export const PDF_PIE_H      = 12   // Altura del pie de página

// Proporción real del logo (archivo 906×521)
export const PDF_LOGO_RATIO = 906 / 521

// ── Paleta semántica ──────────────────────────────────────────────────────────
// El documento es monocromo; el color se usa SOLO en datos (gráficos, KPIs, estados)
export const PDF_SEM_NEG  = [198, 40, 40]    // negativo / pérdida
export const PDF_SEM_CRIT = [224, 134, 0]    // crítico
export const PDF_SEM_LOW  = [245, 179, 1]    // bajo
export const PDF_SEM_OK   = [102, 187, 106]  // saludable
export const PDF_SEM_EXC  = [46, 125, 50]    // excelente

// ── Estilos reutilizables para autoTable ──────────────────────────────────────
export function getEstiloInforme() {
  return {
    headStyles: {
      fillColor: PDF_NEGRO,
      textColor: PDF_BLANCO,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 3,
      lineColor: PDF_NEGRO,
      lineWidth: 0.1,
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2.5,
      textColor: [40, 40, 40],
      lineColor: PDF_GRIS_MED,
      lineWidth: 0.1,
      font: 'helvetica',
    },
    alternateRowStyles: {
      fillColor: PDF_GRIS_CLARO,
    },
    footStyles: {
      fillColor: [232, 232, 232],
      textColor: PDF_NEGRO,
      fontStyle: 'bold',
      fontSize: 7.5,
      lineColor: [180, 180, 180],
      lineWidth: 0.1,
    },
    margin: {
      top: PDF_CONTENT_Y,
      bottom: PDF_PIE_H + 4,
      left: 14,
      right: 14,
    },
  }
}

// ── Banda superior negra con nombre del módulo ────────────────────────────────
function _banda(doc, pw, modulo) {
  doc.setFillColor(...PDF_NEGRO)
  doc.rect(0, 0, pw, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(...PDF_BLANCO)
  doc.text(modulo.toUpperCase(), 14, 6.8)
}

// ── Encabezado de página interior ─────────────────────────────────────────────
// Logo izquierda · Título derecha · Línea negra · Fecha
export function dibujarEncabezado(doc, pw, modulo, titulo, hoy) {
  _banda(doc, pw, modulo)
  try { doc.addImage(_logo, 'PNG', 14, 12, 9 * PDF_LOGO_RATIO, 9) } catch {}
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...PDF_NEGRO)
  doc.text(titulo.toUpperCase(), pw - 14, 18, { align: 'right' })
  doc.setDrawColor(...PDF_NEGRO)
  doc.setLineWidth(0.5)
  doc.line(14, 23, pw - 14, 23)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...PDF_GRIS_OSC)
  if (hoy) doc.text(`Emitido: ${hoy}`, pw - 14, 27, { align: 'right' })
}

// ── Pie de página ─────────────────────────────────────────────────────────────
// Línea negra · "Confidencial — Del Parque" izq · N° de página der
export function dibujarPie(doc, pw, ph, pagina) {
  const y = ph - 10
  doc.setDrawColor(...PDF_NEGRO)
  doc.setLineWidth(0.3)
  doc.line(14, y, pw - 14, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...PDF_GRIS_OSC)
  doc.text('Sistema de Gestión Del Parque  —  Información de uso confidencial', 14, y + 4)
  if (pagina != null) doc.text(`Página ${pagina}`, pw - 14, y + 4, { align: 'right' })
}

// ── Portada estándar ──────────────────────────────────────────────────────────
// Banda superior · Franja izquierda · Logo · Línea · Título grande · Período
export function dibujarPortada(doc, pw, ph, modulo, titulo, periodo, hoy) {
  _banda(doc, pw, modulo)
  // Franja vertical izquierda decorativa
  doc.setFillColor(...PDF_NEGRO)
  doc.rect(0, 10, 4, ph - 10, 'F')
  // Logo
  try { doc.addImage(_logo, 'PNG', 14, 26, 18 * PDF_LOGO_RATIO, 18) } catch {}
  // Línea divisoria negra
  doc.setDrawColor(...PDF_NEGRO)
  doc.setLineWidth(1)
  doc.line(14, 46, pw - 14, 46)
  // Título principal — grande, bold, alineado a la derecha
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...PDF_NEGRO)
  const titleLines = doc.splitTextToSize(titulo.toUpperCase(), pw - 28)
  doc.text(titleLines, pw - 14, 58, { align: 'right' })
  // Período y fecha de emisión
  const yMeta = 58 + titleLines.length * 8
  doc.setFont('helvetica', 'normal')
  if (periodo) {
    doc.setFontSize(9)
    doc.setTextColor(55, 55, 55)
    doc.text(`Período: ${periodo}`, 14, yMeta)
    doc.setFontSize(7.5)
    doc.setTextColor(...PDF_GRIS_OSC)
    doc.text(`Fecha de emisión: ${hoy}`, 14, yMeta + 7)
  } else {
    doc.setFontSize(7.5)
    doc.setTextColor(...PDF_GRIS_OSC)
    doc.text(`Fecha de emisión: ${hoy}`, 14, yMeta)
  }
  // Pie sin número de página
  dibujarPie(doc, pw, ph, null)
}

// ── KPI box con borde izquierdo negro ─────────────────────────────────────────
export function dibujarKpi(doc, x, y, w, h, label, valor) {
  doc.setFillColor(...PDF_GRIS_CLARO)
  doc.rect(x, y, w, h, 'F')
  doc.setFillColor(...PDF_NEGRO)
  doc.rect(x, y, 1.5, h, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...PDF_GRIS_OSC)
  doc.text(label.toUpperCase(), x + 4, y + 5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...PDF_NEGRO)
  doc.text(String(valor), x + 4, y + 13)
}

// ── Título de sección (H2 dentro de una página) ───────────────────────────────
// Devuelve el nuevo Y después del título
export function dibujarSeccion(doc, pw, texto, y) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...PDF_NEGRO)
  doc.text(texto, 14, y)
  doc.setDrawColor(...PDF_GRIS_MED)
  doc.setLineWidth(0.2)
  doc.line(14, y + 2, pw - 14, y + 2)
  return y + 9
}

// ── Página de firmas estandarizada ────────────────────────────────────────────
export function dibujarPaginaFirmas(doc, pw, ph, modulo, hoy, roles) {
  dibujarEncabezado(doc, pw, modulo, 'CONFORMIDAD Y FIRMAS', hoy)
  dibujarPie(doc, pw, ph, null)
  const gap = (pw - 28) / roles.length
  const yBase = ph / 2 - 10
  roles.forEach((rol, i) => {
    const x = 14 + i * gap
    doc.setDrawColor(...PDF_NEGRO)
    doc.setLineWidth(0.3)
    doc.line(x, yBase, x + gap - 8, yBase)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...PDF_GRIS_OSC)
    doc.text(rol, x, yBase + 5)
    doc.setFontSize(6.5)
    doc.text('Nombre y apellido:', x, yBase + 11)
    doc.setDrawColor(...PDF_GRIS_MED)
    doc.setLineWidth(0.2)
    doc.line(x, yBase + 22, x + gap - 8, yBase + 22)
  })
}
