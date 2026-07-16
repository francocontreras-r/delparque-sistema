// ════════════════════════════════════════════════════════════════════════════
// Mapa de íconos de marca (liviano, sin imágenes) — compartido por el editor de la
// Lista de precios y el generador del PDF. Las imágenes viven en:
//   · public/iconos/<key>.png  → preview en la UI
//   · src/lib/iconosLista.js    → base64 embebido para el PDF
// ════════════════════════════════════════════════════════════════════════════

// Claves disponibles con su etiqueta legible (orden del selector).
export const ICONOS_LABELS = {
  cono: 'Cono 1 sabor',
  cono2: 'Cono 2 sabores',
  cono3: 'Cono 3 sabores',
  barquillon: 'Barquillón',
  copa: 'Copa',
  pote: 'Pote / Balde',
  paleta: 'Palito / Paleta',
  cubanito: 'Cubanito',
  bocaditos: 'Bocaditos',
  escoces: 'Bombón escocés',
  suizo: 'Bombón suizo (barra)',
  almendrado: 'Almendrado (barra)',
  porcion: 'Porción de torta',
  torta: 'Torta helada',
  tricolor: 'Barra tricolor',
  alfajor: 'Alfajor',
  chocolate: 'Chocolate',
  batido: 'Batido / Malteada',
  bebida: 'Botella / Bebida',
}
export const ICON_KEYS = Object.keys(ICONOS_LABELS)

// Normaliza un nombre para comparar (minúsculas, sin acentos).
export function normNombre(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

// Sugerencia automática de ícono a partir del nombre + categoría. El envase manda
// sobre el sabor (un "pote dos sabores" es un pote). Es solo el DEFAULT: el usuario
// puede fijar otro desde el editor.
export function iconoDe(nombre, cat) {
  const n = normNombre(nombre)
  const has = s => n.includes(s)
  const esKg = /\bkg\b/.test(n) || has('1/4') || has('1/2') || has('3/4') || has('2,5') || has(' kg')
  if (has('pote')) return 'pote'
  if (has('1 sabor') || has('un sabor')) return 'cono'
  if (has('2 sabor') || has('dos sabor')) return 'cono2'
  if (has('3 sabor') || has('tres sabor')) return 'cono3'
  if (has('barquillon')) return 'barquillon'
  if (has('cucurucho')) return 'cono'
  if (has('copa')) return 'copa'
  if (esKg) return 'pote'
  if (cat === 'HELADOS') return 'cono'
  if (has('cubanito')) return 'cubanito'
  if (has('bocadito')) return 'bocaditos'
  if (has('escoces')) return 'escoces'
  if (has('suizo')) return 'suizo'
  if (has('pionono')) return 'porcion'
  if (has('tricolor')) return 'tricolor'
  if (has('almendrad')) return 'almendrado'
  if (has('torta')) return 'torta'
  if (has('alfajor')) return 'alfajor'
  if (has('palito') || has('paleta')) return 'paleta'
  if (has('vegano') || has('light')) return 'pote'
  if (has('bano') || has('chocolate')) return 'chocolate'
  if (has('batido') || has('malteada')) return 'batido'
  if (has('bebida')) return 'bebida'
  const fb = { UNITARIOS: 'paleta', TORTAS: 'torta', BEBIDAS: 'batido', OTROS: 'chocolate' }
  return fb[cat] || 'cono'
}

// Resuelve el ícono final: override manual (por nombre) > sugerencia automática.
export function resolverIcono(nombre, cat, overrides) {
  const ov = overrides && overrides[normNombre(nombre)]
  return ov || iconoDe(nombre, cat)
}
