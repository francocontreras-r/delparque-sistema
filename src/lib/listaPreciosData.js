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

// Helpers para armar presentaciones (una misma bocha en distinto envase).
// SERVIDA: envase + servilleta + cuchara (helados servidos: 1/2/3 sabores, copa).
function presServida(nombre, envase) {
  return { nombre, packaging: [
    { nombre: envase, cantidad: 1 },
    { nombre: 'Servilletas Servitas', cantidad: 1 },
    { nombre: 'Cucharas esmeriladas', cantidad: 1 },
  ] }
}
// POTE: envase térmico + servilleta + bolsa (helados por kg para llevar).
function presPote(nombre, envase, bolsa) {
  return { nombre, packaging: [
    { nombre: envase, cantidad: 1 },
    { nombre: 'Servilletas Servitas', cantidad: 1 },
    { nombre: bolsa, cantidad: 1 },
  ] }
}

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

  // Insumos de REVENTA: packaging que la fábrica le vende a la franquicia. Cada
  // uno tiene DOS valores: el costo (automático = precio de Depósito ÷ unidades
  // por paquete) y el precio de franquicia/reventa (editable, lo que le cobrás).
  // `nombre` debe coincidir con el insumo en Depósito para tomar su costo en vivo.
  // `unidadesPorPaquete` sale del Excel de costos (Q por caja).
  reventa: [
    { nombre: 'Caja Cono N°00', unidadesPorPaquete: 190, precioFranquicia: 0 },
    { nombre: 'Caja Cono N°1', unidadesPorPaquete: 220, precioFranquicia: 0 },
    { nombre: 'Caja Cono N°2', unidadesPorPaquete: 220, precioFranquicia: 0 },
    { nombre: 'Caja Cono Pasta 70', unidadesPorPaquete: 180, precioFranquicia: 0 },
    { nombre: 'Caja Cono Pasta Doble', unidadesPorPaquete: 90, precioFranquicia: 0 },
    { nombre: 'Caja Vaso de pasta 90 Hexagonal', unidadesPorPaquete: 261, precioFranquicia: 0 },
    { nombre: 'Caja Vaso Pasta 125', unidadesPorPaquete: 174, precioFranquicia: 0 },
    { nombre: 'Cucuruchon Barquillo Doble', unidadesPorPaquete: 100, precioFranquicia: 0 },
    { nombre: 'Pote impreso DELPARQUE 120', unidadesPorPaquete: 1, precioFranquicia: 0 },
    { nombre: 'Vaso Polipapel 250', unidadesPorPaquete: 1, precioFranquicia: 0 },
    { nombre: 'Copa Helada(envase)', unidadesPorPaquete: 1, precioFranquicia: 0 },
    { nombre: 'Servilletas Servitas', unidadesPorPaquete: 2000, precioFranquicia: 0 },
    { nombre: 'Cucharas esmeriladas', unidadesPorPaquete: 900, precioFranquicia: 0 },
    { nombre: 'Bolsas chicas 30x40', unidadesPorPaquete: 1, precioFranquicia: 0 },
    { nombre: 'Bolsas Grandes 40x50', unidadesPorPaquete: 1, precioFranquicia: 0 },
    { nombre: 'Bolsa para Postre', unidadesPorPaquete: 1, precioFranquicia: 0 },
    { nombre: 'Térmico c/ tapa 1/4kg', unidadesPorPaquete: 1, precioFranquicia: 0 },
    { nombre: 'Térmico c/ tapa 1/2 kg', unidadesPorPaquete: 1, precioFranquicia: 0 },
    { nombre: 'Térmico c/ tapa 3/4 kg', unidadesPorPaquete: 1, precioFranquicia: 0 },
    { nombre: 'Térmico c/ tapa 1 kg', unidadesPorPaquete: 1, precioFranquicia: 0 },
    { nombre: 'Térmico c/ tapa 2,5 kg', unidadesPorPaquete: 1, precioFranquicia: 0 },
    { nombre: 'Térmico c/ tapa 4 kg', unidadesPorPaquete: 1, precioFranquicia: 0 },
  ],

  // Recetas de FORMATO de venta al público (lado FRANQUICIADO). Cada producto:
  //  - kg de helado (bocha) y precioVenta (lo que cobra el franquiciado al público),
  //  - varias PRESENTACIONES: el mismo helado servido en distinto envase. Cada una
  //    tiene su propio packaging → su propio costo → su propio margen.
  // `packaging[].nombre` referencia un insumo de `reventa`. Datos del Excel de
  // costos de franquicia (2809): ajustá kg/precio a tu realidad cuando cambien.
  formatos: [
    { producto: 'Helado 1 sabor', kg: 0.12, precioVenta: 1900, presentaciones: [
      presServida('Cono N°00', 'Caja Cono N°00'),
      presServida('Cono Pasta 70', 'Caja Cono Pasta 70'),
      presServida('Vaso Hexagonal 90', 'Caja Vaso de pasta 90 Hexagonal'),
      presServida('Pote impreso 120', 'Pote impreso DELPARQUE 120'),
    ] },
    { producto: 'Helado 2 sabores', kg: 0.19, precioVenta: 3400, presentaciones: [
      presServida('Cono N°1', 'Caja Cono N°1'),
      presServida('Cono N°2', 'Caja Cono N°2'),
      presServida('Vaso Pasta 125', 'Caja Vaso Pasta 125'),
      presServida('Cono Pasta Doble', 'Caja Cono Pasta Doble'),
      presServida('Pote impreso 120', 'Pote impreso DELPARQUE 120'),
    ] },
    { producto: 'Helado 3 sabores', kg: 0.25, precioVenta: 4100, presentaciones: [
      presServida('Cucuruchón Doble', 'Cucuruchon Barquillo Doble'),
      presServida('Cono N°2', 'Caja Cono N°2'),
      presServida('Vaso Polipapel 250', 'Vaso Polipapel 250'),
    ] },
    { producto: 'Copa Helada', kg: 0.25, precioVenta: 5800, presentaciones: [
      presServida('Copa', 'Copa Helada(envase)'),
    ] },
    { producto: '1/4 Kg Helado', kg: 0.25, precioVenta: 3700, presentaciones: [
      presPote('Térmico 1/4', 'Térmico c/ tapa 1/4kg', 'Bolsas chicas 30x40'),
    ] },
    { producto: '1/2 Kg Helado', kg: 0.50, precioVenta: 6900, presentaciones: [
      presPote('Térmico 1/2', 'Térmico c/ tapa 1/2 kg', 'Bolsas chicas 30x40'),
    ] },
    { producto: '3/4 Kg Helado', kg: 0.75, precioVenta: 10300, presentaciones: [
      presPote('Térmico 3/4', 'Térmico c/ tapa 3/4 kg', 'Bolsas Grandes 40x50'),
    ] },
    { producto: '1 Kg Helado', kg: 1.00, precioVenta: 13200, presentaciones: [
      presPote('Térmico 1 kg', 'Térmico c/ tapa 1 kg', 'Bolsas Grandes 40x50'),
    ] },
    { producto: '2,5 Kg Helado', kg: 2.50, precioVenta: 25500, presentaciones: [
      presPote('Térmico 2,5 kg', 'Térmico c/ tapa 2,5 kg', 'Bolsa para Postre'),
    ] },
    { producto: '4 Kg Helado', kg: 4.00, precioVenta: 40000, presentaciones: [
      presPote('Térmico 4 kg', 'Térmico c/ tapa 4 kg', 'Bolsa para Postre'),
    ] },
  ],

  // Comparativa de precio de venta al público contra la competencia. `competidores`
  // son los nombres de las columnas; cada fila tiene el precio propio y el de cada
  // competidor (0 = sin dato). Datos de la hoja "Comparativa competencia" del Excel.
  competencia: {
    competidores: ['Portho Gelatto', 'DIROMA'],
    filas: [
      { producto: '1 sabor', propio: 300, comp: [300, 280] },
      { producto: '2 sabores', propio: 400, comp: [400, 360] },
      { producto: '3 sabores', propio: 500, comp: [500, 440] },
      { producto: 'Cucuruchón', propio: 700, comp: [700, 0] },
      { producto: 'Capelina', propio: 0, comp: [700, 460] },
      { producto: 'Copa Helada', propio: 650, comp: [0, 660] },
      { producto: '1/4 Kg', propio: 500, comp: [500, 480] },
      { producto: '1/2 Kg', propio: 850, comp: [850, 800] },
      { producto: '3/4 Kg', propio: 1150, comp: [1150, 1000] },
      { producto: '1 Kg', propio: 1600, comp: [1600, 1380] },
      { producto: '2,5 Kg', propio: 3400, comp: [3400, 3000] },
      { producto: '4 Kg', propio: 5400, comp: [0, 0] },
    ],
  },
}

// Migra listas guardadas con el modelo viejo (un packaging por formato) al nuevo
// (varias presentaciones). Idempotente: si ya tiene presentaciones, no toca nada.
export function migrarLista(lista) {
  if (!lista || !Array.isArray(lista.formatos)) return lista
  lista.formatos.forEach(f => {
    if (!Array.isArray(f.presentaciones)) {
      f.presentaciones = [{ nombre: f.presentacion || 'Única', packaging: f.packaging || [] }]
    }
    if (f.precioVenta == null) f.precioVenta = 0
    delete f.packaging
  })
  // Listas guardadas antes de la comparativa de competencia: sembrar la estructura.
  if (!lista.competencia || !Array.isArray(lista.competencia.filas)) {
    lista.competencia = JSON.parse(JSON.stringify(SEED_LISTA_PRECIOS.competencia))
  }
  return lista
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
