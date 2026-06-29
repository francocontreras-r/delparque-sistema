const _logo = new Image()
_logo.src = '/logo-byn.png'
export const LOGO_PDF = _logo

// Logo horizontal (con margen) — ideal para membretes
const _logoH = new Image()
_logoH.src = '/logo-horizontal-black-v2.png'
export const LOGO_PDF_HORIZONTAL = _logoH

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
// Proporción del logo horizontal (archivo 4200×1440) — para membretes
export const PDF_LOGO_H_RATIO = 4200 / 1440

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

// ── Encabezado de página interior (membrete profesional) ──────────────────────
// Logo horizontal izquierda · Módulo + Título derecha · Regla negra gruesa
export function dibujarEncabezado(doc, pw, modulo, titulo, hoy) {
  // Logo horizontal a la izquierda
  try { doc.addImage(_logoH, 'PNG', 14, 9.5, 15.5 * PDF_LOGO_H_RATIO, 15.5) } catch {}
  // Etiqueta de módulo (gris, con tracking). Compensamos el anchor por el
  // char-spacing para que el texto termine exactamente en el margen (sin cortarse).
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...PDF_GRIS_OSC)
  {
    const cs = 0.8, lbl = modulo.toUpperCase()
    doc.setCharSpace(cs)
    doc.text(lbl, pw - 14 - (lbl.length - 1) * cs, 13, { align: 'right' })
    doc.setCharSpace(0)
  }
  // Título
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...PDF_NEGRO)
  doc.text(titulo.toUpperCase(), pw - 14, 19.5, { align: 'right' })
  // Fecha de emisión
  if (hoy) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...PDF_GRIS_OSC)
    doc.text(`Emitido: ${hoy}`, pw - 14, 24.5, { align: 'right' })
  }
  // Regla negra gruesa
  doc.setDrawColor(...PDF_NEGRO)
  doc.setLineWidth(0.8)
  doc.line(14, 28, pw - 14, 28)
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

// ── Portada estándar (membrete profesional limpio) ────────────────────────────
// Logo horizontal · Módulo · Regla gruesa · Título grande · Período
export function dibujarPortada(doc, pw, ph, modulo, titulo, periodo, hoy) {
  // Logo horizontal arriba a la izquierda
  try { doc.addImage(_logoH, 'PNG', 14, 24, 24 * PDF_LOGO_H_RATIO, 24) } catch {}
  // Etiqueta de módulo arriba a la derecha. Anchor compensado por el tracking
  // para que no se corte contra el borde de la hoja.
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...PDF_GRIS_OSC)
  {
    const cs = 1.0, lbl = modulo.toUpperCase()
    doc.setCharSpace(cs)
    doc.text(lbl, pw - 14 - (lbl.length - 1) * cs, 34, { align: 'right' })
    doc.setCharSpace(0)
  }
  // Regla divisoria negra gruesa
  doc.setDrawColor(...PDF_NEGRO)
  doc.setLineWidth(1)
  doc.line(14, 52, pw - 14, 52)
  // Título principal — grande, bold, alineado a la izquierda
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...PDF_NEGRO)
  const titleLines = doc.splitTextToSize(titulo.toUpperCase(), pw - 28)
  doc.text(titleLines, 14, 66)
  // Período y fecha de emisión
  const yMeta = 66 + titleLines.length * 9 + 3
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

// ── KPI card con borde y acento superior de color ─────────────────────────────
// Estilo unificado de los informes (Finanzas/Mermas/Rendimiento).
export function dibujarKpiCard(doc, x, y, w, h, label, valor, accent = PDF_NEGRO) {
  doc.setDrawColor(...PDF_NEGRO); doc.setLineWidth(0.3); doc.rect(x, y, w, h)
  doc.setFillColor(...accent); doc.rect(x, y, w, 1.4, 'F')
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(90, 90, 90)
  doc.text(String(label).toUpperCase(), x + 3, y + 7)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...PDF_NEGRO)
  doc.text(doc.splitTextToSize(String(valor), w - 5)[0], x + 3, y + 15)
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
