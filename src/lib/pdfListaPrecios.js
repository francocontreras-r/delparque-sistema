// ════════════════════════════════════════════════════════════════════════════
// PDF "Lista de Precios" — documento LIMPIO, alto impacto, para clientes.
// Basado en el MANUAL DE MARCA Del Parque (lista de precios pág. 71 + iconografía):
//   · Portada de catálogo · fondo blanco · logo a color
//   · Barras de categoría ESPRESSO (firma de marca) con texto blanco
//   · GRILLA de productos con ÍCONOS de línea de marca + nombre + precio
//   · Color #FF4713 (Pantone 172 C) · Tipografía Raleway EMBEBIDA
// SIN costos ni márgenes. Firma intacta: generarPdfListaPrecios(lista, opts).
// ════════════════════════════════════════════════════════════════════════════
import { jsPDF } from 'jspdf'
import { RALEWAY_REGULAR, RALEWAY_SEMIBOLD, RALEWAY_BOLD, RALEWAY_BLACK } from './ralewayFonts'
import { ICONOS } from './iconosLista'
import { resolverIcono } from './iconosMapa'

// ── Paleta de marca ──────────────────────────────────────────────────────────
const ORANGE   = [255, 71, 19]      // #FF4713
const ESPRESSO = [38, 32, 29]
const INK      = [43, 36, 32]
const TEXT     = [64, 56, 50]
const MUTE     = [150, 141, 133]
const HAIR     = [230, 223, 217]
const WHITE    = [255, 255, 255]

const R  = 'Raleway'
const RB = 'RalewayBlack'
const RS = 'RalewaySemi'

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
function tracked(doc, texto, x, y, o = {}) {
  const cs = o.cs ?? 1.2
  doc.setCharSpace(cs)
  doc.text(String(texto), x, y, { align: o.align || 'left', baseline: o.baseline || 'alphabetic' })
  doc.setCharSpace(0)
}
function trackedWidth(doc, texto, cs = 1.2) {
  return doc.getTextWidth(String(texto)) + Math.max(0, String(texto).length - 1) * cs
}

// ── Íconos ───────────────────────────────────────────────────────────────────
const _iconURL = {}
function drawIcon(doc, key, x, y, size) {
  const b64 = ICONOS[key]; if (!b64) return
  const url = _iconURL[key] || (_iconURL[key] = 'data:image/png;base64,' + b64)
  try { doc.addImage(url, 'PNG', x, y, size, size, key, 'FAST') } catch { /* noop */ }
}
// El mapeo nombre→ícono (con override manual) vive en iconosMapa.js.

// Watermark del isotipo (naranja, muy tenue), sangrado abajo a la derecha.
function watermark(doc, ctx) {
  if (!ctx.marca) return
  const w = 78
  conAlpha(doc, 0.05, () => { try { doc.addImage(ctx.marca, 'PNG', ctx.pw - w + 22, ctx.ph - w + 20, w, w, 'wm', 'FAST') } catch { /* noop */ } })
}

// Píldora de vigencia (naranja). Devuelve el Y inferior.
function pillVigencia(doc, cx, y, vigencia) {
  const etq = 'VIGENCIA', val = String(vigencia || '').toUpperCase()
  doc.setFont(R, 'bold'); doc.setFontSize(7.5); const wEtq = trackedWidth(doc, etq, 1.5)
  doc.setFont(RS, 'normal'); doc.setFontSize(11); const wVal = trackedWidth(doc, val, 1)
  const padX = 7, gap = 5, sep = 5, pillW = wEtq + gap + sep + wVal + padX * 2, pillH = 11, px = cx - pillW / 2
  doc.setFillColor(...ORANGE); doc.roundedRect(px, y, pillW, pillH, 5.5, 5.5, 'F')
  const yb = y + pillH / 2
  doc.setFont(R, 'bold'); doc.setFontSize(7.5); doc.setTextColor(...WHITE)
  tracked(doc, etq, px + padX, yb, { cs: 1.5, baseline: 'middle' })
  conAlpha(doc, 0.55, () => { doc.setDrawColor(...WHITE); doc.setLineWidth(0.4); const sx = px + padX + wEtq + gap; doc.line(sx, y + 3, sx, y + pillH - 3) })
  doc.setFont(RS, 'normal'); doc.setFontSize(11); doc.setTextColor(...WHITE)
  tracked(doc, val, px + padX + wEtq + gap + sep, yb, { cs: 1, baseline: 'middle' })
  return y + pillH
}

// ── Portada (tapa de catálogo) ───────────────────────────────────────────────
function portada(doc, ctx, vigencia) {
  const { pw, ph } = ctx, cx = pw / 2
  doc.setFillColor(...ORANGE); doc.rect(0, 0, pw, 5, 'F')
  doc.setFillColor(...ORANGE); doc.rect(0, ph - 5, pw, 5, 'F')
  // isotipo grande y tenue detrás
  if (ctx.marca) conAlpha(doc, 0.05, () => { try { doc.addImage(ctx.marca, 'PNG', cx - 55, ph - 150, 110, 110, 'wmbig', 'FAST') } catch { /* noop */ } })
  let y = 54
  if (ctx.logo) {
    const w = 106, h = w / (ctx.logoRatio || 2.917)
    try { doc.addImage(ctx.logo, 'PNG', cx - w / 2, y, w, h, 'logo', 'FAST'); y += h + 16 }
    catch { doc.setFont(RB, 'normal'); doc.setFontSize(30); doc.setTextColor(...INK); doc.text('DEL PARQUE', cx, y + 12, { align: 'center' }); y += 26 }
  } else { doc.setFont(RB, 'normal'); doc.setFontSize(30); doc.setTextColor(...INK); doc.text('DEL PARQUE', cx, y + 12, { align: 'center' }); y += 26 }
  doc.setFont(R, 'bold'); doc.setFontSize(8); doc.setTextColor(...ORANGE)
  tracked(doc, '#ESTÁBUENÍSIMO', cx - trackedWidth(doc, '#ESTÁBUENÍSIMO', 3) / 2, y, { cs: 3 }); y += 20
  doc.setFont(RB, 'normal'); doc.setFontSize(40); doc.setTextColor(...INK)
  tracked(doc, 'LISTA DE', cx - trackedWidth(doc, 'LISTA DE', 1) / 2, y, { cs: 1 }); y += 16
  tracked(doc, 'PRECIOS', cx - trackedWidth(doc, 'PRECIOS', 1) / 2, y, { cs: 1 }); y += 7
  doc.setFillColor(...ORANGE); doc.roundedRect(cx - 17, y, 34, 2, 1, 1, 'F'); y += 16
  pillVigencia(doc, cx, y, vigencia)
  // friso de íconos de marca
  const deco = ['cono', 'copa', 'pote', 'paleta', 'torta', 'cubanito']
  const isz = 14, gap = 9, tot = deco.length * isz + (deco.length - 1) * gap
  let ix = cx - tot / 2, iy = ph - 42
  deco.forEach(k => { drawIcon(doc, k, ix, iy, isz); ix += isz + gap })
}

function encabezadoCont(doc, ctx) {
  const { ml, mr, pw } = ctx
  doc.setFillColor(...ORANGE); doc.rect(0, 0, pw, 3, 'F')
  let xTxt = ml
  if (ctx.logo) {
    const h = 8.5, w = h * (ctx.logoRatio || 2.917)
    try { doc.addImage(ctx.logo, 'PNG', ml, 8.5, w, h, 'logoc', 'FAST'); xTxt = ml + w + 5 }
    catch { doc.setFont(RB, 'normal'); doc.setFontSize(11); doc.setTextColor(...ESPRESSO); doc.text('Del Parque', ml, 14); xTxt = ml + doc.getTextWidth('Del Parque') + 5 }
  } else { doc.setFont(RB, 'normal'); doc.setFontSize(11); doc.setTextColor(...ESPRESSO); doc.text('Del Parque', ml, 14); xTxt = ml + doc.getTextWidth('Del Parque') + 5 }
  doc.setFont(R, 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTE)
  doc.text('Lista de precios · Heladería', xTxt, 13.5)
  if (ctx.fecha) doc.text(ctx.fecha, pw - mr, 13.5, { align: 'right' })
  doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(ml, 18, pw - mr, 18)
  ctx.y = 26
  watermark(doc, ctx)
}

function nuevaPagina(doc, ctx) { doc.addPage(); ctx.pagina += 1; encabezadoCont(doc, ctx) }
function saltoSiHaceFalta(doc, ctx, alto) { if (ctx.y + alto > ctx.ph - 18) nuevaPagina(doc, ctx) }

// ── Título de sección grande + acento naranja ────────────────────────────────
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

// ── Barra de categoría ESPRESSO (firma de marca) ─────────────────────────────
function barraCategoria(doc, ctx, titulo, subtitulo) {
  const { ml, mr, pw } = ctx
  saltoSiHaceFalta(doc, ctx, 30)
  const bw = pw - ml - mr, bh = 8.6
  doc.setFillColor(...ESPRESSO); doc.roundedRect(ml, ctx.y, bw, bh, 4.3, 4.3, 'F')
  const yb = ctx.y + bh / 2
  const T = String(titulo).toUpperCase()
  doc.setFont(RS, 'normal'); doc.setFontSize(9); const wT = trackedWidth(doc, T, 2)
  const sub = subtitulo ? `   ·   ${String(subtitulo).toUpperCase()}` : ''
  doc.setFont(R, 'bold'); doc.setFontSize(6.5); const wSub = sub ? trackedWidth(doc, sub, 1) : 0
  const startX = pw / 2 - (wT + wSub) / 2
  doc.setFont(RS, 'normal'); doc.setFontSize(9); doc.setTextColor(...WHITE)
  tracked(doc, T, startX, yb, { cs: 2, baseline: 'middle' })
  if (sub) { doc.setFont(R, 'bold'); doc.setFontSize(6.5); doc.setTextColor(255, 176, 150); tracked(doc, sub, startX + wT, yb, { cs: 1, baseline: 'middle' }) }
  ctx.y += bh + 5
}

// ── Celda de producto: ícono + nombre + precio ───────────────────────────────
function celda(doc, ctx, f, cat, x, top, cw, cellH, twoCol) {
  const midY = top + cellH / 2
  doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(x, top + cellH - 0.4, x + cw, top + cellH - 0.4)
  const isz = 12
  drawIcon(doc, resolverIcono(f.producto, cat, ctx.iconos), x + 1, midY - isz / 2, isz)
  const tx = x + 17
  doc.setFont(RS, 'normal'); doc.setFontSize(8.9); doc.setTextColor(...INK)
  const lines = doc.splitTextToSize(String(f.producto), cw - 19).slice(0, 2)
  const twoLine = lines.length > 1
  const nY = top + (twoLine ? 5.2 : 6.6)
  lines.forEach((ln, k) => doc.text(ln, tx, nY + k * 3.8, { baseline: 'middle' }))
  const pY = nY + (twoLine ? 3.8 * 2 : 0) + 4.8
  const pmain = f.precio == null || f.precio === '' ? '—' : `$ ${numARS(f.precio)}`
  doc.setFont(R, 'bold'); doc.setFontSize(11); doc.setTextColor(...ORANGE)
  doc.text(pmain, tx, pY, { baseline: 'middle' })
  if (twoCol && f.precio2 != null && f.precio2 !== '') {
    const w = doc.getTextWidth(pmain)
    doc.setFont(R, 'bold'); doc.setFontSize(7.3); doc.setTextColor(...MUTE)
    doc.text(`YA $ ${numARS(f.precio2)}`, tx + w + 4, pY, { baseline: 'middle' })
  }
}

// ── Grilla de una sección por categorías ─────────────────────────────────────
function dibujarSecciones(doc, ctx, secciones, twoCol) {
  const { ml, mr, pw } = ctx
  const gutter = 16                       // más aire entre columnas (evita que se vean encimadas)
  const cw = (pw - ml - mr - gutter) / 2
  const cellH = 17.5

  secciones.forEach(([titulo, subtitulo, filas]) => {
    if (!filas || !filas.length) return
    const cat = String(titulo).toUpperCase()
    barraCategoria(doc, ctx, titulo, subtitulo)
    let col = 0
    for (let i = 0; i < filas.length; i++) {
      if (col === 0 && ctx.y + cellH > ctx.ph - 16) { nuevaPagina(doc, ctx); barraCategoria(doc, ctx, titulo + ' (cont.)', subtitulo) }
      const x = ml + col * (cw + gutter)
      celda(doc, ctx, filas[i], cat, x, ctx.y, cw, cellH, twoCol)
      col++
      if (col === 2) { col = 0; ctx.y += cellH }
    }
    if (col === 1) ctx.y += cellH
    ctx.y += 8
  })
}

function pieDeTodas(doc, ctx) {
  const total = doc.internal.getNumberOfPages()
  const { ml, mr, pw, ph } = ctx
  for (let p = 2; p <= total; p++) {   // la portada (pág. 1) va sin pie
    doc.setPage(p)
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.3); doc.line(ml, ph - 13, pw - mr, ph - 13)
    doc.setFont(R, 'bold'); doc.setFontSize(7); doc.setTextColor(...ORANGE)
    tracked(doc, '#ESTÁBUENÍSIMO', ml, ph - 8.5, { cs: 1 })
    doc.setFont(R, 'normal'); doc.setTextColor(...MUTE)
    doc.text('Helados del Parque · Lista de precios', pw / 2, ph - 8.5, { align: 'center' })
    doc.text(`${p - 1} / ${total - 1}`, pw - mr, ph - 8.5, { align: 'right' })
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
    iconos: lista.iconos || {},   // override manual de íconos por nombre
  }
  const F = lista.franquicia || {}
  const P = lista.publico || {}

  portada(doc, ctx, lista.vigencia)

  nuevaPagina(doc, ctx)
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
