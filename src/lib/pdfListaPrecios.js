// ════════════════════════════════════════════════════════════════════════════
// PDF "Lista de Precios" (Franquicia + Público) — documento LIMPIO para entregar.
// Replica el diseño original (banner naranja, "Heladería", barras de sección,
// chips de categoría, columnas Público/Pedidos Ya) SIN costos ni márgenes.
// Mejoras: sello "Generado por el sistema · fecha" y numeración de página.
// ════════════════════════════════════════════════════════════════════════════
import { jsPDF } from 'jspdf'

const NARANJA = [244, 80, 30]
const NEGRO = [26, 26, 26]
const CAT_BG = [250, 243, 240]
const GRIS = [154, 154, 154]
const GRIS_CLARO = [176, 176, 176]
const BORDE = [236, 236, 236]

const money = n => (n == null || n === '') ? '—' : `$ ${(Number(n) || 0).toLocaleString('es-AR')}`

// dibuja las categorías de una sección. `secciones` = [[titulo, subtitulo, filas]].
// dosColumnas = true → columnas PÚBLICO y PEDIDOS YA; false → una sola FRANQUICIA.
function dibujarSecciones(doc, ctx, secciones, dosColumnas) {
  const { ml, mr, pw } = ctx
  const xIzq = ml + 4
  const xP2 = pw - mr - 2            // borde derecho (pedidos ya / franquicia)
  const xP1 = dosColumnas ? xP2 - 40 : xP2  // público
  const rowH = 8.6

  secciones.forEach(([titulo, subtitulo, filas]) => {
    if (!filas || !filas.length) return
    dibujarChip(doc, ctx, titulo, subtitulo)
    // Cabecera de columnas
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...GRIS)
    doc.text('PRODUCTO', xIzq, ctx.y)
    if (dosColumnas) {
      doc.text('PÚBLICO', xP1, ctx.y, { align: 'right' })
      doc.text('PEDIDOS YA', xP2, ctx.y, { align: 'right' })
    } else {
      doc.text('FRANQUICIA', xP2, ctx.y, { align: 'right' })
    }
    ctx.y += 4
    // Filas
    filas.forEach(f => {
      if (ctx.y + rowH > ctx.ph - 18) { nuevaPagina(doc, ctx); ctx.y += 2 }
      const yTxt = ctx.y + rowH / 2
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...NEGRO)
      doc.text(String(f.producto), xIzq, yTxt, { baseline: 'middle' })
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...NEGRO)
      doc.text(money(f.precio), xP1, yTxt, { align: 'right', baseline: 'middle' })
      if (dosColumnas) {
        doc.setTextColor(...GRIS_CLARO)
        doc.text(f.precio2 == null ? '—' : money(f.precio2), xP2, yTxt, { align: 'right', baseline: 'middle' })
      }
      // Línea inferior tenue
      doc.setDrawColor(...BORDE); doc.setLineWidth(0.2); doc.line(ml, ctx.y + rowH, pw - mr, ctx.y + rowH)
      ctx.y += rowH
    })
    ctx.y += 8
  })
}

// Chip de categoría (fondo tenue + barrita naranja + título, subtítulo opcional).
function dibujarChip(doc, ctx, titulo, subtitulo) {
  const { ml, mr, pw } = ctx
  if (ctx.y + 22 > ctx.ph - 18) nuevaPagina(doc, ctx)
  const chipY = ctx.y
  doc.setFillColor(...CAT_BG); doc.roundedRect(ml, chipY, pw - ml - mr, 9, 1.6, 1.6, 'F')
  doc.setFillColor(...NARANJA); doc.roundedRect(ml, chipY + 1.6, 1.4, 5.8, 0.7, 0.7, 'F')
  const T = String(titulo).toUpperCase()
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NEGRO)
  doc.text(T, ml + 5, chipY + 4.9, { baseline: 'middle' })
  if (subtitulo) {
    const wT = doc.getTextWidth(T)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...NARANJA)
    doc.text(String(subtitulo).toUpperCase(), ml + 5 + wT + 5, chipY + 5.1, { baseline: 'middle' })
  }
  ctx.y = chipY + 13
}

function saltoSiHaceFalta(doc, ctx, alto) {
  if (ctx.y + alto > ctx.ph - 18) { nuevaPagina(doc, ctx) }
}

function nuevaPagina(doc, ctx) {
  doc.addPage()
  ctx.pagina += 1
  ctx.y = 18
  // Sello arriba a la derecha (mejora): de cuándo es esta emisión.
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(200, 200, 200)
  doc.text(`Generado por el sistema · ${ctx.fecha}`, ctx.pw - ctx.mr, 12, { align: 'right' })
  ctx.y = 20
}

// Barra de sección (negra, redondeada): "PRECIOS FRANQUICIA" / "PRECIOS AL PÚBLICO"
function barraSeccion(doc, ctx, texto) {
  saltoSiHaceFalta(doc, ctx, 20)
  doc.setFillColor(...NEGRO); doc.roundedRect(ctx.ml, ctx.y, ctx.pw - ctx.ml - ctx.mr, 10, 2, 2, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255)
  doc.text(String(texto).toUpperCase().split('').join(' '), ctx.pw / 2, ctx.y + 5.4, { align: 'center', baseline: 'middle' })
  ctx.y += 16
}

function dibujarBanner(doc, ctx, vigencia, logo) {
  const { ml, mr, pw } = ctx
  const bx = ml, by = 14, bw = pw - ml - mr, bh = 42
  doc.setFillColor(...NARANJA); doc.roundedRect(bx, by, bw, bh, 6, 6, 'F')
  const cx = pw / 2
  if (logo) {
    try { doc.addImage(logo, 'PNG', cx - 26, by + 6, 52, 9, undefined, 'FAST') }
    catch { /* si el logo no carga, seguimos con texto */ doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(255, 255, 255); doc.text('Del Parque', cx, by + 12, { align: 'center' }) }
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(255, 255, 255)
    doc.text('Del Parque', cx, by + 12, { align: 'center' })
  }
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
  doc.text('#ESTÁBUENÍSIMO'.split('').join(' '), cx, by + 19, { align: 'center' })
  doc.setFontSize(8.5)
  doc.text('LISTA DE PRECIOS'.split('').join(' '), cx, by + 26, { align: 'center' })
  doc.setFont('times', 'italic'); doc.setFontSize(26)
  doc.text('Heladería', cx, by + 37, { align: 'center' })

  // Bloque de vigencia
  let y = by + bh + 9
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NARANJA)
  doc.text('—  VIGENCIA  —', cx, y, { align: 'center' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...NEGRO)
  doc.text(String(vigencia || '').toUpperCase(), cx, y + 7, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS)
  doc.text('FRANQUICIA · PÚBLICO · PEDIDOS YA', cx, y + 12.5, { align: 'center' })
  ctx.y = y + 20
}

function pieDeTodas(doc, ctx) {
  const total = doc.internal.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS_CLARO)
    doc.text(`#ESTÁBUENÍSIMO   ·   Lista de precios Heladería   ·   Pág. ${p}`, ctx.pw / 2, ctx.ph - 10, { align: 'center' })
  }
}

// lista: objeto con { vigencia, franquicia:{HELADOS,UNITARIOS,TORTAS}, publico:{...} }
// opts: { logo?: dataURL, fecha?: 'dd/mm/aaaa', incluirPublico?: bool }
export function generarPdfListaPrecios(lista, opts = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const ctx = {
    ml: 16, mr: 16, pw: doc.internal.pageSize.getWidth(), ph: doc.internal.pageSize.getHeight(),
    y: 20, pagina: 1, fecha: opts.fecha || '',
  }
  const F = lista.franquicia || {}
  const P = lista.publico || {}

  dibujarBanner(doc, ctx, lista.vigencia, opts.logo)

  barraSeccion(doc, ctx, 'Precios Franquicia')
  dibujarSecciones(doc, ctx, [
    ['Helados', null, F.HELADOS],
    ['Unitarios', null, F.UNITARIOS],
    ['Tortas', 'Precio por kg', F.TORTAS],
  ], false)

  if (opts.incluirPublico !== false) {
    nuevaPagina(doc, ctx)
    barraSeccion(doc, ctx, 'Precios al Público')
    dibujarSecciones(doc, ctx, [
      ['Helados', null, P.HELADOS],
      ['Unitarios', null, P.UNITARIOS],
      ['Tortas', 'Precio por kg', P.TORTAS],
      ['Bebidas', null, P.BEBIDAS],
      ['Otros', null, P.OTROS],
    ], true)
  }

  pieDeTodas(doc, ctx)
  return doc
}
