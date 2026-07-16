// ════════════════════════════════════════════════════════════════════════════
// PDF "Lista de Precios" — documento LIMPIO para clientes y franquicias.
// Calcado del lenguaje visual OFICIAL de Del Parque (manual de marca, pág. 71):
//   · Fondo blanco, logo a color arriba (isologotipo naranja + wordmark espresso)
//   · Barras de categoría ESPRESSO con texto blanco centrado — firma de la marca
//   · Color primario #FF4713 (Pantone 172 C) · Tipografía Raleway EMBEBIDA
//   · Watermark del isotipo, filas estilo carta con líneas guía y precios en naranja
// SIN costos ni márgenes. Firma intacta: generarPdfListaPrecios(lista, opts).
// ════════════════════════════════════════════════════════════════════════════
import { jsPDF } from 'jspdf'
import { RALEWAY_REGULAR, RALEWAY_SEMIBOLD, RALEWAY_BOLD, RALEWAY_BLACK } from './ralewayFonts'

// ── Paleta de marca ──────────────────────────────────────────────────────────
const ORANGE  = [255, 71, 19]      // #FF4713 — primario del manual
const ESPRESSO = [38, 32, 29]      // neutro oscuro de marca (barras/tiles)
const INK     = [43, 36, 32]
const TEXT    = [64, 56, 50]
const CREAM   = [250, 246, 242]
const MUTE    = [150, 141, 133]
const HAIR    = [230, 223, 217]
const WHITE   = [255, 255, 255]

const R  = 'Raleway'        // 400 / 700
const RB = 'RalewayBlack'   // 900
const RS = 'RalewaySemi'    // 600

function registrarFuentes(doc) {
  doc.addFileToVFS('Raleway-Regular.ttf', RALEWAY_REGULAR); doc.addFont('Raleway-Regular.ttf', R, 'normal')
  doc.addFileToVFS('Raleway-Bold.ttf', RALEWAY_BOLD);       doc.addFont('Raleway-Bold.ttf', R, 'bold')
  doc.addFileToVFS('Raleway-Black.ttf', RALEWAY_BLACK);     doc.addFont('Raleway-Black.ttf', RB, 'normal')
  doc.addFileToVFS('Raleway-SemiBold.ttf', RALEWAY_SEMIBOLD); doc.addFont('Raleway-SemiBold.ttf', RS, 'normal')
}

const numARS = n => (Number(n) || 0).toLocaleString('es-AR')

function conAlpha(doc, a, fn) {
  try { doc.saveGraphicsState(); doc.setGState(doc.GState({ opacity: a })); fn(); doc.restoreGraphicsState() }
  catch { fn() }
}
function tracked(doc, texto, x, y, opts = {}) {
  const cs = opts.cs ?? 1.2
  doc.setCharSpace(cs)
  doc.text(String(texto), x, y, { align: opts.align || 'left', baseline: opts.baseline || 'alphabetic' })
  doc.setCharSpace(0)
}
function trackedWidth(doc, texto, cs = 1.2) {
  return doc.getTextWidth(String(texto)) + Math.max(0, String(texto).length - 1) * cs
}

// Watermark del isotipo (naranja, muy tenue) abajo a la derecha, sangrado.
function watermark(doc, ctx) {
  if (!ctx.marca) return
  const w = 78, h = w
  conAlpha(doc, 0.05, () => {
    try { doc.addImage(ctx.marca, 'PNG', ctx.pw - w + 22, ctx.ph - h + 20, w, h, undefined, 'FAST') } catch { /* noop */ }
  })
}

// ── Cabecera de la primera página ────────────────────────────────────────────
function cabecera(doc, ctx, vigencia, logo) {
  const { pw } = ctx, cx = pw / 2
  // filete superior naranja de marca
  doc.setFillColor(...ORANGE); doc.rect(0, 0, pw, 4, 'F')
  let y = 20
  // logo a color (isologotipo + wordmark)
  const logoData = typeof logo === 'string' ? logo : logo?.data
  const ratio = (logo && logo.ratio) || 2.917
  if (logoData) {
    const w = 66, h = w / (ratio || 2.917)
    try { doc.addImage(logoData, 'PNG', cx - w / 2, y, w, h, undefined, 'FAST'); y += h + 5 }
    catch { doc.setFont(RB, 'normal'); doc.setFontSize(26); doc.setTextColor(...INK); doc.text('DEL PARQUE', cx, y + 10, { align: 'center' }); y += 20 }
  } else { doc.setFont(RB, 'normal'); doc.setFontSize(26); doc.setTextColor(...INK); doc.text('DEL PARQUE', cx, y + 10, { align: 'center' }); y += 20 }
  // tagline
  doc.setFont(R, 'bold'); doc.setFontSize(7); doc.setTextColor(...ORANGE)
  tracked(doc, '#ESTÁBUENÍSIMO', cx - trackedWidth(doc, '#ESTÁBUENÍSIMO', 2.6) / 2, y, { cs: 2.6 })
  y += 9
  // título
  doc.setFont(RB, 'normal'); doc.setFontSize(23); doc.setTextColor(...INK)
  tracked(doc, 'LISTA DE PRECIOS', cx - trackedWidth(doc, 'LISTA DE PRECIOS', 1.5) / 2, y + 3, { cs: 1.5 })
  y += 9
  // píldora de vigencia
  const etq = 'VIGENCIA', val = String(vigencia || '').toUpperCase()
  doc.setFont(R, 'bold'); doc.setFontSize(7.5); const wEtq = trackedWidth(doc, etq, 1.5)
  doc.setFont(RS, 'normal'); doc.setFontSize(11); const wVal = trackedWidth(doc, val, 1)
  const padX = 7, gap = 5, sep = 5
  const pillW = wEtq + gap + sep + wVal + padX * 2, pillH = 11, px = cx - pillW / 2
  doc.setFillColor(...ORANGE); doc.roundedRect(px, y, pillW, pillH, 5.5, 5.5, 'F')
  const yb = y + pillH / 2
  doc.setFont(R, 'bold'); doc.setFontSize(7.5); doc.setTextColor(...WHITE)
  tracked(doc, etq, px + padX, yb, { cs: 1.5, baseline: 'middle' })
  conAlpha(doc, 0.55, () => { doc.setDrawColor(...WHITE); doc.setLineWidth(0.4); const sx = px + padX + wEtq + gap; doc.line(sx, y + 3, sx, y + pillH - 3) })
  doc.setFont(RS, 'normal'); doc.setFontSize(11); doc.setTextColor(...WHITE)
  tracked(doc, val, px + padX + wEtq + gap + sep, yb, { cs: 1, baseline: 'middle' })
  ctx.y = y + pillH + 12
}

function encabezadoCont(doc, ctx) {
  const { ml, mr, pw } = ctx
  doc.setFillColor(...ORANGE); doc.rect(0, 0, pw, 3, 'F')
  let xTxt = ml
  // Logo real de marca (no texto): wordmark + isologotipo a color.
  if (ctx.logo) {
    const h = 7.5, w = h * (ctx.logoRatio || 2.917)
    try { doc.addImage(ctx.logo, 'PNG', ml, 8.5, w, h, undefined, 'FAST'); xTxt = ml + w + 5 }
    catch { doc.setFont(RB, 'normal'); doc.setFontSize(11); doc.setTextColor(...ESPRESSO); doc.text('Del Parque', ml, 14); xTxt = ml + doc.getTextWidth('Del Parque') + 5 }
  } else {
    doc.setFont(RB, 'normal'); doc.setFontSize(11); doc.setTextColor(...ESPRESSO); doc.text('Del Parque', ml, 14); xTxt = ml + doc.getTextWidth('Del Parque') + 5
  }
  doc.setFont(R, 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTE)
  doc.text('Lista de precios · Heladería', xTxt, 13.5)
  if (ctx.fecha) doc.text(ctx.fecha, pw - mr, 13.5, { align: 'right' })
  doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(ml, 18, pw - mr, 18)
  ctx.y = 26
  watermark(doc, ctx)
}

function nuevaPagina(doc, ctx) { doc.addPage(); ctx.pagina += 1; encabezadoCont(doc, ctx) }
function saltoSiHaceFalta(doc, ctx, alto) { if (ctx.y + alto > ctx.ph - 20) nuevaPagina(doc, ctx) }

// ── Título de sección: grande, Raleway Black, con acento naranja ──────────────
function tituloSeccion(doc, ctx, texto, subtitulo) {
  saltoSiHaceFalta(doc, ctx, subtitulo ? 26 : 20)
  const { pw } = ctx, cx = pw / 2
  const T = String(texto).toUpperCase()
  doc.setFont(RB, 'normal'); doc.setFontSize(19); doc.setTextColor(...INK)
  const wT = trackedWidth(doc, T, 1)
  const yT = ctx.y + 5
  tracked(doc, T, cx - wT / 2, yT, { cs: 1 })
  doc.setFillColor(...ORANGE); doc.roundedRect(cx - 10, yT + 2.4, 20, 1.6, 0.8, 0.8, 'F')
  ctx.y = yT + 5.5
  if (subtitulo) {
    doc.setFont(R, 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTE)
    doc.text(String(subtitulo), cx, ctx.y + 3, { align: 'center' })
    ctx.y += 7
  }
  ctx.y += 5
}

// ── Barra de categoría ESPRESSO (firma de marca): texto blanco centrado ───────
function barraCategoria(doc, ctx, titulo, subtitulo) {
  const { ml, mr, pw } = ctx
  saltoSiHaceFalta(doc, ctx, 24)
  const bw = pw - ml - mr, bh = 8.6
  doc.setFillColor(...ESPRESSO); doc.roundedRect(ml, ctx.y, bw, bh, 4.3, 4.3, 'F')
  const yb = ctx.y + bh / 2
  const T = String(titulo).toUpperCase()
  doc.setFont(RS, 'normal'); doc.setFontSize(9); doc.setTextColor(...WHITE)
  const wT = trackedWidth(doc, T, 2)
  let sub = subtitulo ? `   ·   ${String(subtitulo).toUpperCase()}` : ''
  doc.setFont(R, 'bold'); doc.setFontSize(6.5)
  const wSub = sub ? trackedWidth(doc, sub, 1) : 0
  const startX = pw / 2 - (wT + wSub) / 2
  doc.setFont(RS, 'normal'); doc.setFontSize(9); doc.setTextColor(...WHITE)
  tracked(doc, T, startX, yb, { cs: 2, baseline: 'middle' })
  if (sub) {
    doc.setFont(R, 'bold'); doc.setFontSize(6.5); doc.setTextColor(255, 176, 150)
    tracked(doc, sub, startX + wT, yb, { cs: 1, baseline: 'middle' })
  }
  ctx.y += bh + 4.5
  // encabezados de columna
  doc.setFont(R, 'bold'); doc.setFontSize(6.3); doc.setTextColor(...MUTE)
  tracked(doc, 'PRODUCTO', ml + 4, ctx.y, { cs: 0.6 })
  if (ctx.twoCol) { doc.text('PÚBLICO', ctx.xP1, ctx.y, { align: 'right' }); doc.text('PEDIDOS YA', ctx.xP2, ctx.y, { align: 'right' }) }
  else { doc.text('PRECIO', ctx.xP2, ctx.y, { align: 'right' }) }
  ctx.y += 3.4
}

function leaderDots(doc, x1, x2, y) {
  if (x2 - x1 < 5) return
  doc.setDrawColor(...MUTE); doc.setLineWidth(0.01)
  doc.setLineDashPattern([0.3, 1.5], 0); doc.line(x1, y, x2, y); doc.setLineDashPattern([], 0)
}

function precio(doc, valor, xRight, y, opts = {}) {
  if (valor == null || valor === '') {
    doc.setFont(R, 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTE)
    doc.text('—', xRight, y, { align: 'right', baseline: 'middle' })
    return xRight - doc.getTextWidth('—')
  }
  const num = numARS(valor), size = opts.size || 11
  doc.setFont(R, 'bold'); doc.setFontSize(size); doc.setTextColor(...(opts.mute ? MUTE : INK))
  const wn = doc.getTextWidth(num)
  doc.text(num, xRight, y, { align: 'right', baseline: 'middle' })
  doc.setFont(R, 'bold'); doc.setTextColor(...(opts.mute ? MUTE : ORANGE))
  doc.text('$', xRight - wn - 1.4, y, { align: 'right', baseline: 'middle' })
  return xRight - wn - doc.getTextWidth('$') - 2.4
}

function dibujarSecciones(doc, ctx, secciones, twoCol) {
  const { ml, mr, pw } = ctx
  const xIzq = ml + 4
  ctx.twoCol = twoCol
  ctx.xP2 = pw - mr - 3
  ctx.xP1 = twoCol ? ctx.xP2 - 34 : ctx.xP2
  const rowH = 9

  secciones.forEach(([titulo, subtitulo, filas]) => {
    if (!filas || !filas.length) return
    barraCategoria(doc, ctx, titulo, subtitulo)
    filas.forEach((f, i) => {
      if (ctx.y + rowH > ctx.ph - 20) { nuevaPagina(doc, ctx); barraCategoria(doc, ctx, titulo + ' (cont.)', subtitulo) }
      const yMid = ctx.y + rowH / 2
      if (i % 2 === 1) { doc.setFillColor(...CREAM); doc.rect(ml, ctx.y, pw - ml - mr, rowH, 'F') }
      doc.setFont(R, 'normal'); doc.setFontSize(10.2); doc.setTextColor(...TEXT)
      const nombre = String(f.producto)
      doc.text(nombre, xIzq, yMid, { baseline: 'middle' })
      const wNom = doc.getTextWidth(nombre)
      const xTras = precio(doc, f.precio, ctx.xP1, yMid)
      leaderDots(doc, xIzq + wNom + 3, xTras - 2, yMid + 0.6)
      if (twoCol) precio(doc, f.precio2, ctx.xP2, yMid, { mute: true, size: 10 })
      ctx.y += rowH
    })
    ctx.y += 8
  })
}

function pieDeTodas(doc, ctx) {
  const total = doc.internal.getNumberOfPages()
  const { ml, mr, pw, ph } = ctx
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(ml, ph - 13, pw - mr, ph - 13)
    doc.setFont(R, 'bold'); doc.setFontSize(7); doc.setTextColor(...ORANGE)
    tracked(doc, '#ESTÁBUENÍSIMO', ml, ph - 8.5, { cs: 1 })
    doc.setFont(R, 'normal'); doc.setTextColor(...MUTE)
    doc.text('Helados del Parque · Lista de precios', pw / 2, ph - 8.5, { align: 'center' })
    doc.text(`Pág. ${p} / ${total}`, pw - mr, ph - 8.5, { align: 'right' })
  }
}

// lista: { vigencia, franquicia:{HELADOS,UNITARIOS,TORTAS}, publico:{...} }
// opts:  { logo?, marca?, fecha?, incluirPublico? }
export function generarPdfListaPrecios(lista, opts = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  registrarFuentes(doc)
  const ctx = {
    ml: 16, mr: 16, pw: doc.internal.pageSize.getWidth(), ph: doc.internal.pageSize.getHeight(),
    y: 20, pagina: 1, fecha: opts.fecha || '',
    marca: (typeof opts.marca === 'string' ? opts.marca : opts.marca?.data) || null,
    logo: (typeof opts.logo === 'string' ? opts.logo : opts.logo?.data) || null,
    logoRatio: (opts.logo && opts.logo.ratio) || 2.917,
  }
  const F = lista.franquicia || {}
  const P = lista.publico || {}

  cabecera(doc, ctx, lista.vigencia, opts.logo)
  watermark(doc, ctx)

  tituloSeccion(doc, ctx, 'Precios Franquicia', 'Valores mayoristas para la red de franquicias')
  dibujarSecciones(doc, ctx, [
    ['Helados', 'Precio por kg', F.HELADOS],
    ['Unitarios', null, F.UNITARIOS],
    ['Tortas', 'Precio por kg', F.TORTAS],
  ], false)

  if (opts.incluirPublico !== false) {
    nuevaPagina(doc, ctx)
    tituloSeccion(doc, ctx, 'Precios al Público', 'Precios sugeridos de venta · Pedidos Ya de referencia')
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
