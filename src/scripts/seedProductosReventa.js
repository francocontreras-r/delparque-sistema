import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const productos = [
  // BOLSAS
  { nombre: 'Bolsa impresa para torta 55x45x60 mic PG', categoria: 'BOLSAS', stock_actual: 1217, unidad: 'u' },
  { nombre: 'Bolsas Camiseta 30x40', categoria: 'BOLSAS', stock_actual: 219, unidad: 'u' },
  { nombre: 'Bolsas Camiseta 40x50', categoria: 'BOLSAS', stock_actual: 234, unidad: 'u' },
  // CUCURUCHOS
  { nombre: 'Caja Capelina', categoria: 'CUCURUCHOS', stock_actual: 0, unidad: 'u' },
  { nombre: 'Caja Cono N°00', categoria: 'CUCURUCHOS', stock_actual: 0, unidad: 'u' },
  { nombre: 'Caja Cono N°1', categoria: 'CUCURUCHOS', stock_actual: 12, unidad: 'u' },
  { nombre: 'Caja Cono N°2', categoria: 'CUCURUCHOS', stock_actual: 5, unidad: 'u' },
  { nombre: 'Caja Cono Pasta 70', categoria: 'CUCURUCHOS', stock_actual: 2, unidad: 'u' },
  { nombre: 'Caja Cono Pasta Doble', categoria: 'CUCURUCHOS', stock_actual: 15, unidad: 'u' },
  { nombre: 'Caja de Oblea de Decoracion', categoria: 'CUCURUCHOS', stock_actual: 0, unidad: 'u' },
  { nombre: 'Caja Vaso de pasta 90 Hexagonal', categoria: 'CUCURUCHOS', stock_actual: 0, unidad: 'u' },
  { nombre: 'Caja Vaso Pasta 125', categoria: 'CUCURUCHOS', stock_actual: 6, unidad: 'u' },
  { nombre: 'Cucuruchon Barquillo Doble', categoria: 'CUCURUCHOS', stock_actual: 0, unidad: 'u' },
  // LIMPIEZA
  { nombre: 'Bactericida 30l', categoria: 'LIMPIEZA', stock_actual: 0, unidad: 'l' },
  { nombre: 'Bobina industrial x 200mts', categoria: 'LIMPIEZA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Bobina industrial x 360mts', categoria: 'LIMPIEZA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Citronella x L', categoria: 'LIMPIEZA', stock_actual: 30, unidad: 'l' },
  { nombre: 'Cloro x L', categoria: 'LIMPIEZA', stock_actual: 30, unidad: 'l' },
  { nombre: 'Desengrasante 30l', categoria: 'LIMPIEZA', stock_actual: 0, unidad: 'l' },
  { nombre: 'Desgrass 30l', categoria: 'LIMPIEZA', stock_actual: 0, unidad: 'l' },
  { nombre: 'Desinfectante 30l', categoria: 'LIMPIEZA', stock_actual: 3, unidad: 'l' },
  { nombre: 'Desmold Send 10l', categoria: 'LIMPIEZA', stock_actual: 0, unidad: 'l' },
  { nombre: 'Detergente 20 L', categoria: 'LIMPIEZA', stock_actual: 0, unidad: 'l' },
  { nombre: 'E-F 200 30l', categoria: 'LIMPIEZA', stock_actual: 3, unidad: 'l' },
  { nombre: 'Perasend 5 20l', categoria: 'LIMPIEZA', stock_actual: 0, unidad: 'l' },
  { nombre: 'Rollo Papel Higienico SCOTT', categoria: 'LIMPIEZA', stock_actual: 6, unidad: 'u' },
  { nombre: 'Sani-T-10 5l', categoria: 'LIMPIEZA', stock_actual: 0, unidad: 'l' },
  { nombre: 'Sendeco Acido 20l', categoria: 'LIMPIEZA', stock_actual: 0, unidad: 'l' },
  { nombre: 'Speed Gel x10 l', categoria: 'LIMPIEZA', stock_actual: 0, unidad: 'l' },
  { nombre: 'Jabon SCOTT en Spray x 400', categoria: 'LIMPIEZA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Guantes descartable x100', categoria: 'LIMPIEZA', stock_actual: 4, unidad: 'u' },
  { nombre: 'Cofias descartable x 100 un', categoria: 'LIMPIEZA', stock_actual: 2, unidad: 'u' },
  { nombre: 'Papel Higienico jumbo x 250 mts', categoria: 'LIMPIEZA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Toalla Ecorol x 300 mts', categoria: 'LIMPIEZA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Extra Wash Clorado x 30 Lt', categoria: 'LIMPIEZA', stock_actual: 1, unidad: 'u' },
  { nombre: 'Bolsa de Residuo Chica 45x60', categoria: 'LIMPIEZA', stock_actual: 1, unidad: 'u' },
  { nombre: 'Bolsa de Residuo Grande 90x120', categoria: 'LIMPIEZA', stock_actual: 7, unidad: 'u' },
  { nombre: 'Barbijo x 50 un', categoria: 'LIMPIEZA', stock_actual: 11, unidad: 'u' },
  { nombre: 'Esponja x unidad', categoria: 'LIMPIEZA', stock_actual: 2, unidad: 'u' },
  { nombre: 'Cepillo para Escobillon', categoria: 'LIMPIEZA', stock_actual: 4, unidad: 'u' },
  { nombre: 'Toalla para mano x 25 cm Petroquin x 2 unidades', categoria: 'LIMPIEZA', stock_actual: 2, unidad: 'u' },
  { nombre: 'Secador de piso grande', categoria: 'LIMPIEZA', stock_actual: 4, unidad: 'u' },
  { nombre: 'Secador de piso chico', categoria: 'LIMPIEZA', stock_actual: 5, unidad: 'u' },
  { nombre: 'Cepillo Chicos', categoria: 'LIMPIEZA', stock_actual: 1, unidad: 'u' },
  { nombre: 'Citrisend STD Liquido x10Lts', categoria: 'LIMPIEZA', stock_actual: 1, unidad: 'u' },
  // REVENTA
  { nombre: 'Balde con manija x 10 l', categoria: 'REVENTA', stock_actual: 2852, unidad: 'u' },
  { nombre: 'Caja Servilletas Servitas con logo 17X16 Blancas Caja X 2000', categoria: 'REVENTA', stock_actual: 16, unidad: 'u' },
  { nombre: 'Cinta transparente impresa D.P 24ml x 50mts', categoria: 'REVENTA', stock_actual: 477, unidad: 'u' },
  { nombre: 'Copa Helada Venecia', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Cuchara para Helado Italiana x 1kg', categoria: 'REVENTA', stock_actual: 0, unidad: 'kg' },
  { nombre: 'Cucharas esmeriladas por kg', categoria: 'REVENTA', stock_actual: 3, unidad: 'kg' },
  { nombre: 'Cucharas Sundae x 1000', categoria: 'REVENTA', stock_actual: 2, unidad: 'u' },
  { nombre: 'Ecovaso', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Pajita Negra caja x 1000U', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Porta cono x 75 U', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Portavaso cafe', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Pote impreso DELPARQUE 120 Blanco', categoria: 'REVENTA', stock_actual: 7600, unidad: 'u' },
  { nombre: 'Pote impreso DELPARQUE 120 Negro', categoria: 'REVENTA', stock_actual: 8200, unidad: 'u' },
  { nombre: 'Pote impreso DELPARQUE 250 Blanco', categoria: 'REVENTA', stock_actual: 5150, unidad: 'u' },
  { nombre: 'Pote impreso DELPARQUE 250 Negro', categoria: 'REVENTA', stock_actual: 5200, unidad: 'u' },
  { nombre: 'Roclets x Kg', categoria: 'REVENTA', stock_actual: 0, unidad: 'kg' },
  { nombre: 'Salsa caramelo eureka pomo x 840 gr', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Salsa caramelo pomo x 900 gr', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Salsa Chocolate Eureka 840gr', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Salsa dulce de leche Eureka 840gr', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Salsa dulce de leche Jamer 900 gr', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Salsa Frutilla Eureka 840gr', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Salsa Frutilla Jamer 900 gr', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Salsa Frutos del Bosque Jamer 900 gr', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Tapa de Balde', categoria: 'REVENTA', stock_actual: 2580, unidad: 'u' },
  { nombre: 'Tapa Estisol 240 cc', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Tapa Estisol 360 cc', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'TAPA POLIPAPEL 97mm ESTISOL', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'TAPA POLIPAPEL 97mm NEGRA', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'TAPA PS DOMO SORBETE NAT 88mm', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Tapas de Batido x 50 u', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Toalla scott Basic Blanca Rollo x 400 mts', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'TOALLA SCOTT Essential 2 Rollos x 177 MTS KCK', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Vaso Batido S/Tapa x 50 u Icardi', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Vaso Polipapel 240 cc', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Vaso Polipapel 360 cc', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'VASO PS 180cc BLANCO x 100 UN AMERICAN PLAST', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'VASO PS 325cc TOLEDO x 100 unid', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Vaso Ps 370 cc Milano x 100', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Vaso Telgopor x 180 cc x 100', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Cuchara Automatica Acero INOX 40gr x 1', categoria: 'REVENTA', stock_actual: 1, unidad: 'u' },
  { nombre: 'Cuchara Automatica Acero INOX 80gr x 1', categoria: 'REVENTA', stock_actual: 10, unidad: 'u' },
  { nombre: 'Espatula Aluminio Mango Corto x1', categoria: 'REVENTA', stock_actual: 20, unidad: 'u' },
  { nombre: 'Pote Polipapel x 120 Ml', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Pote Poliopapel x 250 Ml', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  { nombre: 'Cuchara para Helado Italiana Color x 1kg', categoria: 'REVENTA', stock_actual: 0, unidad: 'u' },
  // TERMICOS
  { nombre: 'Envase de Helado 3 lt redondo', categoria: 'TERMICOS', stock_actual: 70, unidad: 'u' },
  { nombre: 'Envase de Helado 5 lt redondo', categoria: 'TERMICOS', stock_actual: 16, unidad: 'u' },
  { nombre: 'Envase para Barra', categoria: 'TERMICOS', stock_actual: 240, unidad: 'u' },
  { nombre: 'Envase para Mini Barra', categoria: 'TERMICOS', stock_actual: 160, unidad: 'u' },
  { nombre: 'Envase plastico x 4 kg', categoria: 'TERMICOS', stock_actual: 642, unidad: 'u' },
  { nombre: 'Termico c/ tapa 1 kg', categoria: 'TERMICOS', stock_actual: 0, unidad: 'u' },
  { nombre: 'Termico c/ tapa 1/2 kg', categoria: 'TERMICOS', stock_actual: 500, unidad: 'u' },
  { nombre: 'Termico c/ tapa 1/4kg', categoria: 'TERMICOS', stock_actual: 491, unidad: 'u' },
  { nombre: 'Termico c/ tapa 3/4 kg', categoria: 'TERMICOS', stock_actual: 0, unidad: 'u' },
  { nombre: 'Papel puntos VERDES Pistacho', categoria: 'TERMICOS', stock_actual: 2800, unidad: 'u' },
  { nombre: 'Papel puntos MARRON Rocher', categoria: 'TERMICOS', stock_actual: 2000, unidad: 'u' },
  { nombre: 'Papel puntos NEGROS Americana', categoria: 'TERMICOS', stock_actual: 0, unidad: 'u' },
  { nombre: 'Papel puntos AMARILLOS Limon Agua', categoria: 'TERMICOS', stock_actual: 1000, unidad: 'u' },
  { nombre: 'Papel puntos ROJOS Frutilla Agua', categoria: 'TERMICOS', stock_actual: 750, unidad: 'u' },
  { nombre: 'Papel triangulos NARANJA Block', categoria: 'TERMICOS', stock_actual: 2500, unidad: 'u' },
  { nombre: 'Papel cuadrados NEGROS Toffi', categoria: 'TERMICOS', stock_actual: 500, unidad: 'u' },
  { nombre: 'Papel rayas CELESTE Dulce de Leche', categoria: 'TERMICOS', stock_actual: 2500, unidad: 'u' },
  { nombre: 'Papel rayas ROJOS Frutilla Crema', categoria: 'TERMICOS', stock_actual: 0, unidad: 'u' },
  { nombre: 'Papel Del Parque MARRON', categoria: 'TERMICOS', stock_actual: 200, unidad: 'u' },
  { nombre: 'Papel Del Parque NEGRO', categoria: 'TERMICOS', stock_actual: 0, unidad: 'u' },
  { nombre: 'Envase Plastico 2.5kg', categoria: 'TERMICOS', stock_actual: 45, unidad: 'u' },
]

async function seed() {
  console.log(`Procesando ${productos.length} productos...`)

  // Traer nombres existentes
  const { data: existentes, error: errEx } = await supabase
    .from('insumos').select('id, nombre, categoria')
  if (errEx) { console.error('Error al leer insumos:', errEx.message); process.exit(1) }

  const mapExistente = {}
  existentes.forEach(i => { mapExistente[(i.nombre || '').trim().toLowerCase()] = i })

  const nuevos = []
  const actualizar = []
  productos.forEach(p => {
    const key = p.nombre.trim().toLowerCase()
    if (mapExistente[key]) {
      actualizar.push({ id: mapExistente[key].id, ...p })
    } else {
      nuevos.push(p)
    }
  })

  // Insertar nuevos en lotes de 50
  let insertados = 0
  for (let i = 0; i < nuevos.length; i += 50) {
    const lote = nuevos.slice(i, i + 50)
    const { error } = await supabase.from('insumos').insert(lote)
    if (error) { console.error('Error al insertar:', error.message); process.exit(1) }
    insertados += lote.length
  }

  // Actualizar existentes (categoria + unidad + stock_actual)
  let actualizados = 0
  for (const p of actualizar) {
    const { error } = await supabase.from('insumos')
      .update({ categoria: p.categoria, unidad: p.unidad, stock_actual: p.stock_actual })
      .eq('id', p.id)
    if (error) { console.error(`Error al actualizar "${p.nombre}":`, error.message) }
    else actualizados++
  }

  console.log(`Insertados: ${insertados} nuevos | Actualizados: ${actualizados} existentes`)
  nuevos.forEach(r => console.log(`  + ${r.categoria.padEnd(12)} ${r.nombre}`))
  actualizar.forEach(r => console.log(`  ~ ${r.categoria.padEnd(12)} ${r.nombre}`))
}

seed()
