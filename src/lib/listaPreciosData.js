// ════════════════════════════════════════════════════════════════════════════
// Lista de precios (Franquicia + Público) — datos semilla y modelo.
// Fuente: PDF "Lista de precios Heladería — Junio 2026".
//
// Los precios de FRANQUICIA · HELADOS son por TIER (categoría), no por sabor.
// El campo `tier` los vincula con la clasificación que ya tiene cada sabor en el
// sistema (Cámara → tipo, más Pistacho/Rocher por nombre), y así el margen de
// cada sabor sale solo: margen = (precio del tier − costo del sabor) / precio.
//
// Estos valores son la SEMILLA. Si existe la tabla `precios_lista`, se leen y
// editan desde ahí; si no, se usan estos (modo lectura). Ver sql/precios_lista.sql
// ════════════════════════════════════════════════════════════════════════════

// Precio por KG de cada tier de helado (franquicia). La clave es el tier tal como
// lo devuelve tierDeSabor() en Finanzas: Agua, Lisa, Con Agregado, Especial,
// Pistacho, Rocher.
export const TIER_LABEL = {
  Agua: 'Sabores agua',
  Lisa: 'Sabores crema',
  'Con Agregado': 'Sabores crema con agregado',
  Especial: 'Especiales',
  Rocher: 'Chocolate Rocher',
  Pistacho: 'Pistacho',
}
// Orden de aparición en la lista/PDF.
export const TIER_ORDEN = ['Agua', 'Lisa', 'Con Agregado', 'Especial', 'Rocher', 'Pistacho']

export const SEED_LISTA_PRECIOS = {
  vigencia: 'JUNIO 2026',
  franquicia: {
    // HELADOS por tier (precio POR KG). `tier` es la clave de vínculo con sabores.
    HELADOS: [
      { producto: 'Sabores agua', tier: 'Agua', precio: 10500 },
      { producto: 'Sabores crema', tier: 'Lisa', precio: 11000 },
      { producto: 'Sabores crema con agregado', tier: 'Con Agregado', precio: 11500 },
      { producto: 'Especiales', tier: 'Especial', precio: 12500 },
      { producto: 'Chocolate Rocher', tier: 'Rocher', precio: 12900 },
      { producto: 'Pistacho', tier: 'Pistacho', precio: 13900 },
    ],
    UNITARIOS: [
      { producto: 'Alfajor', precio: 2000 },
      { producto: 'Bocaditos helados', precio: 7100 },
      { producto: 'Bombón escocés', precio: 2250 },
      { producto: 'Bombón suizo', precio: 2100 },
      { producto: 'Almendrado porción', precio: 2250 },
      { producto: 'Cubanitos', precio: 2250 },
      { producto: 'Palito agua', precio: 2000 },
      { producto: 'Paletas del parque', precio: 2700 },
      { producto: 'Pote helado dos sabores light', precio: 7700 },
      { producto: 'Pote helado Vegano', precio: 7700 },
    ],
    // Tortas: precio POR KG.
    TORTAS: [
      { producto: 'Barra tricolor helada', precio: 17700 },
      { producto: 'Torta helada', precio: 17700 },
      { producto: 'Barra almendrado', precio: 18200 },
      { producto: 'Pionono helado', precio: 17200 },
    ],
  },
  publico: {
    // precio = PÚBLICO, precio2 = PEDIDOS YA (null = sin precio, muestra "—").
    HELADOS: [
      { producto: '1 sabor', precio: 4200, precio2: null },
      { producto: '2 sabores', precio: 6200, precio2: null },
      { producto: '3 sabores', precio: 7500, precio2: null },
      { producto: 'Barquillón grande', precio: 11900, precio2: null },
      { producto: 'Copa', precio: 12500, precio2: null },
      { producto: '1/4 kg', precio: 7500, precio2: 9300 },
      { producto: '1/2 kg', precio: 14000, precio2: 17500 },
      { producto: '3/4 kg', precio: 19000, precio2: 23900 },
      { producto: '1 kg', precio: 23500, precio2: 28500 },
      { producto: '2,5 kg', precio: 57000, precio2: 71900 },
      { producto: '4 kg', precio: 89000, precio2: 98000 },
    ],
    UNITARIOS: [
      { producto: 'Palito agua', precio: 4200, precio2: 5000 },
      { producto: 'Paletas del Parque', precio: 4800, precio2: 5800 },
      { producto: 'Vegano o light', precio: 14000, precio2: 17500 },
      { producto: 'Bocaditos helados', precio: 13000, precio2: 16200 },
      { producto: 'Cubanito helado', precio: 4500, precio2: 5600 },
      { producto: 'Bombón escocés', precio: 4500, precio2: 5600 },
      { producto: 'Alfajor helado', precio: 4000, precio2: 5100 },
      { producto: 'Bombón suizo', precio: 4200, precio2: 5600 },
      { producto: 'Almendrado en porciones', precio: 4500, precio2: 5600 },
      { producto: 'Cubanito helado x 4', precio: 17000, precio2: 21700 },
      { producto: 'Bombón escocés x 4', precio: 17000, precio2: 21700 },
      { producto: 'Alfajor helado x 6', precio: 23000, precio2: 29400 },
      { producto: 'Paletas del Parque x 6', precio: 27000, precio2: 34200 },
      { producto: 'Almendrado x 10', precio: 42000, precio2: 53000 },
    ],
    // Tortas: precio POR KG (solo público).
    TORTAS: [
      { producto: 'Barra almendrada', precio: 24900, precio2: null },
      { producto: 'Barra tricolor', precio: 24800, precio2: null },
      { producto: 'Torta helada', precio: 24800, precio2: null },
      { producto: 'Pionono helado', precio: 23500, precio2: null },
    ],
    BEBIDAS: [
      { producto: 'Batidos', precio: 8200, precio2: null },
      { producto: 'Malteadas', precio: 8700, precio2: null },
    ],
    OTROS: [
      { producto: 'Baño de chocolate', precio: 1500, precio2: null },
      { producto: 'Cucuruchos por 3 unidades', precio: 2500, precio2: 3000 },
    ],
  },
}

// Copia profunda de la semilla (para no mutar la constante al editar en memoria).
export function clonarSemilla() {
  return JSON.parse(JSON.stringify(SEED_LISTA_PRECIOS))
}

// Mapa tier → precio de franquicia (para calcular el margen de cada sabor).
export function preciosPorTier(lista) {
  const m = {}
  ;(lista?.franquicia?.HELADOS || []).forEach(r => { if (r.tier) m[r.tier] = Number(r.precio) || 0 })
  return m
}
