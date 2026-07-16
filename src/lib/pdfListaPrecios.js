// ════════════════════════════════════════════════════════════════════════════
// PDF "Lista de Precios" — documento LIMPIO para clientes y franquicias.
// Diseño alineado al MANUAL DE MARCA Del Parque:
//   · Color primario  #FF4713 (Pantone 172 C)
//   · Tipografía       Raleway (texto general) — embebida, sin fuentes ajenas
//   · Estilo de carta  títulos grandes en Raleway Black, como la carta genérica
// SIN costos ni márgenes. Firma intacta: generarPdfListaPrecios(lista, opts).
// ════════════════════════════════════════════════════════════════════════════
import { jsPDF } from 'jspdf'
import { RALEWAY_REGULAR, RALEWAY_SEMIBOLD, RALEWAY_BOLD, RALEWAY_BLACK } from './ralewayFonts'

// ── Paleta de marca ──────────────────────────────────────────────────────────
const ORANGE    = [255, 71, 19]     // #FF4713 — primario del manual
const ORANGE_DK = [214, 52, 8]
const INK       = [43, 36, 32]       // espresso cálido (neutro oscuro de marca)
const TEXT      = [58, 50, 45]
const CREAM     = [251, 247, 243]
const MUTE      = [150, 141, 133]
const HAIR      = [232, 225, 219]
const WHITE     = [255, 255, 255]

// Familias registradas (jsPDF sólo maneja normal/bold/italic por familia, así que
// los pesos extra van como familias propias).
const R  = 'Raleway'        // normal + bold (400 / 700)
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

// ── Hero de marca ────────────────────────────────────────────────────────────
function hero(doc, ctx, vigencia, logo) {
  const { pw } = ctx
  const H = 76
  doc.setFillColor(...ORANGE); doc.rect(0, 0, pw, H, 'F')
  conAlpha(doc, 0.32, () => { doc.setFillColor(...ORANGE_DK); doc.rect(0, H - 11, pw, 11, 'F') })
  conAlpha(doc, 0.08, () => {
    doc.setDrawColor(...WHITE); doc.setLineWidth(2.2)
    doc.circle(11, 11, 26, 'S'); doc.circle(11, 11, 17, 'S')
    doc.circle(pw - 9, H - 5, 30, 'S'); doc.circle(pw - 9, H - 5, 20, 'S')
  })
  // Festón inferior (guiño heladería)
  const r = 3.4, paso = r * 2
  doc.setFillColor(...WHITE)
  for (let x = -r; x < pw + paso; x += paso) doc.circle(x + r, H, r, 'F')

  const cx = pw / 2
  const logoData = typeof logo === 'string' ? logo : logo?.data
  const ratio = (logo && logo.ratio) || 3.61
  if (logoData) {
    const w = 52, h = w / (ratio || 3.61)
    try { doc.addImage(logoData, 'PNG', cx - w / 2, 14, w, h, undefined, 'FAST') }
    catch { doc.setFont(RB, 'normal'); doc.setFontSize(24); doc.setTextColor(...WHITE); doc.text('DEL PARQUE', cx, 26, { align: 'center' }) }
  } else { doc.setFont(RB, 'normal'); doc.setFontSize(24); doc.setTextColor(...WHITE); doc.text('DEL PARQUE', cx, 26, { align: 'center' }) }

  doc.setFont(R, 'bold'); doc.setFontSize(7); doc.setTextColor(...WHITE)
  conAlpha(doc, 0.9, () => tracked(doc, '#ESTÁBUENÍSIMO', cx - trackedWidth(doc, '#ESTÁBUENÍSIMO', 2.4) / 2, 35, { cs: 2.4 }))
  doc.setFont(R, 'bold'); doc.setFontSize(8)
  conAlpha(doc, 0.92, () => tracked(doc, 'LISTA DE PRECIOS', cx - trackedWidth(doc, 'LISTA DE PRECIOS', 3) / 2, 45, { cs: 3 }))
  // Título grande estilo carta (Raleway Black)
  doc.setFont(RB, 'normal'); doc.setFontSize(30); doc.setTextColor(...WHITE)
  tracked(doc, 'HELADERÍA', cx - trackedWidth(doc, 'HELADERÍA', 3.5) / 2, 63, { cs: 3.5 })

  // ── Píldora de vigencia ──
  let y = H + 13
  const etq = 'VIGENCIA', val = String(vigencia || '').toUpperCase()
  doc.setFont(R, 'bold'); doc.setFontSize(7.5); const wEtq = trackedWidth(doc, etq, 1.5)
  doc.setFont(RB, 'normal'); doc.setFontSize(12); const wVal = trackedWidth(doc, val, 1)
  const padX = 7, gap = 5, sep = 5
  const pillW = wEtq + gap + sep + wVal + padX * 2, pillH = 12, px = cx - pillW / 2
  doc.setFillColor(...CREAM); doc.roundedRect(px, y, pillW, pillH, 6, 6, 'F')
  doc.setDrawColor(...ORANGE); doc.setLineWidth(0.5); doc.roundedRect(px, y, pillW, pillH, 6, 6, 'S')
  const yb = y + pillH / 2
  doc.setFont(R, 'bold'); doc.setFontSize(7.5); doc.setTextColor(...ORANGE)
  tracked(doc, etq, px + padX, yb, { cs: 1.5, baseline: 'middle' })
  doc.setDrawColor(...ORANGE); doc.setLineWidth(0.4)
  const sx = px + padX + wEtq + gap
  doc.line(sx, y + 3.2, sx, y + pillH - 3.2)
  doc.setFont(RB, 'normal'); doc.setFontSize(12); doc.setTextColor(...INK)
  tracked(doc, val, sx + sep, yb, { cs: 1, baseline: 'middle' })

  doc.setFont(R, 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTE)
  tracked(doc, 'FRANQUICIA  ·  PÚBLICO  ·  PEDIDOS YA', cx - trackedWidth(doc, 'FRANQUICIA  ·  PÚBLICO  ·  PEDIDOS YA', 0.6) / 2, y + pillH + 7, { cs: 0.6 })
  ctx.y = y + pillH + 16
}

function encabezadoCont(doc, ctx) {
  const { ml, mr, pw } = ctx
  doc.setFillColor(...ORANGE); doc.rect(0, 0, pw, 3, 'F')
  doc.setFont(RB, 'normal'); doc.setFontSize(11); doc.setTextColor(...ORANGE)
  doc.text('DEL PARQUE', ml, 13)
  const wMarca = trackedWidth(doc, 'DEL PARQUE', 0)
  doc.setFont(R, 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTE)
  doc.text('Lista de precios · Heladería', ml + wMarca + 5, 13)
  if (ctx.fecha) doc.text(ctx.fecha, pw - mr, 13, { align: 'right' })
  doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(ml, 17, pw - mr, 17)
  ctx.y = 26
}

function nuevaPagina(doc, ctx) { doc.addPage(); ctx.pagina += 1; encabezadoCont(doc, ctx) }
function saltoSiHaceFalta(doc, ctx, alto) { if (ctx.y + alto > ctx.ph - 20) nuevaPagina(doc, ctx) }

// ── Divisor de sección: título grande Raleway Black + subrayado naranja ───────
function divisorSeccion(doc, ctx, texto, subtitulo) {
  saltoSiHaceFalta(doc, ctx, subtitulo ? 30 : 24)
  const { pw } = ctx, cx = pw / 2
  const T = String(texto).toUpperCase()
  doc.setFont(RB, 'normal'); doc.setFontSize(20)
  doc.setTextColor(...INK)
  const wT = trackedWidth(doc, T, 1.2)
  const yT = ctx.y + 6
  tracked(doc, T, cx - wT / 2, yT, { cs: 1.2 })
  // subrayado naranja corto y grueso
  doc.setFillColor(...ORANGE); doc.roundedRect(cx - 11, yT + 2.6, 22, 1.6, 0.8, 0.8, 'F')
  ctx.y = yT + 6
  if (subtitulo) {
    doc.setFont(R, 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTE)
    doc.text(String(subtitulo), cx, ctx.y + 3, { align: 'center' })
    ctx.y += 7
  }
  ctx.y += 6
}

// ── Encabezado de categoría ──────────────────────────────────────────────────
function categoria(doc, ctx, titulo, subtitulo) {
  const { ml, mr, pw } = ctx
  saltoSiHaceFalta(doc, ctx, 22)
  const y = ctx.y
  doc.setFillColor(...ORANGE); doc.rect(ml, y - 2.8, 2.6, 3, 'F')
  const T = String(titulo).toUpperCase()
  doc.setFont(RS, 'normal'); doc.setFontSize(10.5); doc.setTextColor(...INK)
  tracked(doc, T, ml + 5.5, y, { cs: 1.2 })
  let xEnd = ml + 5.5 + trackedWidth(doc, T, 1.2)
  if (subtitulo) {
    doc.setFont(R, 'bold'); doc.setFontSize(6.5); doc.setTextColor(...ORANGE)
    tracked(doc, String(subtitulo).toUpperCase(), xEnd + 5, y - 0.4, { cs: 0.8 })
    xEnd += 5 + trackedWidth(doc, String(subtitulo).toUpperCase(), 0.8)
  }
  doc.setDrawColor(...HAIR); doc.setLineWidth(0.4); doc.line(xEnd + 5, y - 1, pw - mr, y - 1)
  ctx.y = y + 5.5

  doc.setFont(R, 'bold'); doc.setFontSize(6.3); doc.setTextColor(...MUTE)
  tracked(doc, 'PRODUCTO', ml + 5.5, ctx.y, { cs: 0.6 })
  if (ctx.twoCol) {
    doc.text('PÚBLICO', ctx.xP1, ctx.y, { align: 'right' })
    doc.text('PEDIDOS YA', ctx.xP2, ctx.y, { align: 'right' })
  } else {
    doc.text('PRECIO', ctx.xP2, ctx.y, { align: 'right' })
  }
  ctx.y += 3.6
}

function leaderDots(doc, x1, x2, y) {
  if (x2 - x1 < 5) return
  doc.setDrawColor(...MUTE); doc.setLineWidth(0.01)
  doc.setLineDashPattern([0.3, 1.5], 0)
  doc.line(x1, y, x2, y)
  doc.setLineDashPattern([], 0)
}

function precio(doc, valor, xRight, y, opts = {}) {
  if (valor == null || valor === '') {
    doc.setFont(R, 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTE)
    doc.text('—', xRight, y, { align: 'right', baseline: 'middle' })
    return xRight - doc.getTextWidth('—')
  }
  const num = numARS(valor), size = opts.size || 11
  doc.setFont(R, 'bold'); doc.setFontSize(size)
  doc.setTextColor(...(opts.mute ? MUTE : INK))
  const wn = doc.getTextWidth(num)
  doc.text(num, xRight, y, { align: 'right', baseline: 'middle' })
  doc.setFont(R, 'bold'); doc.setTextColor(...(opts.mute ? MUTE : ORANGE))
  doc.text('$', xRight - wn - 1.4, y, { align: 'right', baseline: 'middle' })
  return xRight - wn - doc.getTextWidth('$') - 2.4
}

function dibujarSecciones(doc, ctx, secciones, twoCol) {
  const { ml, mr, pw } = ctx
  const xIzq = ml + 5.5
  ctx.twoCol = twoCol
  ctx.xP2 = pw - mr - 3
  ctx.xP1 = twoCol ? ctx.xP2 - 34 : ctx.xP2
  const rowH = 9.2

  secciones.forEach(([titulo, subtitulo, filas]) => {
    if (!filas || !filas.length) return
    categoria(doc, ctx, titulo, subtitulo)
    filas.forEach((f, i) => {
      if (ctx.y + rowH > ctx.ph - 20) { nuevaPagina(doc, ctx); categoria(doc, ctx, titulo + ' (cont.)', subtitulo) }
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
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.5); doc.line(ml, ctx.y, pw - mr, ctx.y)
    ctx.y += 9
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
// opts:  { logo?, fecha?, incluirPublico? }
export function generarPdfListaPrecios(lista, opts = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  registrarFuentes(doc)
  const ctx = {
    ml: 16, mr: 16, pw: doc.internal.pageSize.getWidth(), ph: doc.internal.pageSize.getHeight(),
    y: 20, pagina: 1, fecha: opts.fecha || '',
  }
  const F = lista.franquicia || {}
  const P = lista.publico || {}

  hero(doc, ctx, lista.vigencia, opts.logo)

  divisorSeccion(doc, ctx, 'Precios Franquicia', 'Valores mayoristas para la red de franquicias')
  dibujarSecciones(doc, ctx, [
    ['Helados', 'Precio por kg', F.HELADOS],
    ['Unitarios', null, F.UNITARIOS],
    ['Tortas', 'Precio por kg', F.TORTAS],
  ], false)

  if (opts.incluirPublico !== false) {
    nuevaPagina(doc, ctx)
    divisorSeccion(doc, ctx, 'Precios al Público', 'Precios sugeridos de venta · Pedidos Ya de referencia')
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
