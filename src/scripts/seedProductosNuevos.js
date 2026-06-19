// Ejecutar con: node --env-file=.env src/scripts/seedProductosNuevos.js
import { createClient } from '@supabase/supabase-js'

const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!process.env.SUPABASE_SERVICE_KEY) {
  console.warn('Aviso: SUPABASE_SERVICE_KEY no está definida en .env, se usará VITE_SUPABASE_ANON_KEY (puede fallar si hay RLS activo).')
}
const supabase = createClient(process.env.VITE_SUPABASE_URL, key)

const productos = [
  { nombre: 'Baño Bombon Cobertura con Leche x10kg', categoria: 'COBERTURAS', unidad: 'u', stock_actual: 0 },
  { nombre: 'COBL Cobertura Leche x5kg', categoria: 'COBERTURAS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Aceite x5L', categoria: 'OTROS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Cereza Trozada x10kg', categoria: 'FRUTAS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Limon xkg', categoria: 'FRUTAS', unidad: 'kg', stock_actual: 0 },
  { nombre: 'Bolsa Polipropileno Cubanitos', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Caja Empanadas MM3', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Caja Empanadas MM1', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Sorbete x1000', categoria: 'REVENTA', unidad: 'u', stock_actual: 0 },
  { nombre: 'Folex con Logo', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Folex Fiambrerita', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Rollos de Film', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Pote Polipapel Bocaditos', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Pote Polipapel Light', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Pote Polipapel Verano', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Dulce de Leche Repostero x10kg', categoria: 'VARIEGATOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Caja con Logo', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Etiquetas para Cubanitos', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Banana xkg', categoria: 'FRUTAS', unidad: 'kg', stock_actual: 0 },
  { nombre: 'Cereza Carleti x3100', categoria: 'FRUTAS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Balde Marroc', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Balde Chocotorta', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Balde Polonesa', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Balde Pionono', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Balde Kinder', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Balde Brownie', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Cascara de Naranja en Almibar', categoria: 'FRUTAS', unidad: 'kg', stock_actual: 0 },
  { nombre: 'Pasta Maptellina Helado x4kg', categoria: 'PASTAS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Pasta Maptellina Sembrar x4kg', categoria: 'PASTAS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Pasta Ovo King x3.5kg', categoria: 'PASTAS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Pasta Pistacho x4kg', categoria: 'PASTAS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Fragolina x10kg', categoria: 'VARIEGATOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Variegatto Tiramisu x4kg', categoria: 'VARIEGATOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Salsa Chocolate', categoria: 'VARIEGATOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Cafe al Coñac x750', categoria: 'OTROS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Papel para Pionono Grande', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Papel para Pionono Chico', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Veteado Pistacho con Granela', categoria: 'VARIEGATOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Pote Polipapel Bocaditos San Juanino', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Mangas Descartables', categoria: 'LIMPIEZA', unidad: 'u', stock_actual: 0 },
  { nombre: 'Manteca x5kg', categoria: 'LÁCTEOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Harina x25kg', categoria: 'OTROS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Galletas xkg', categoria: 'OTROS', unidad: 'kg', stock_actual: 0 },
  { nombre: 'Cubiertas para Palitos', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'CREAMWHIP x3kg', categoria: 'LÁCTEOS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Pasta de Nuez x3.5kg', categoria: 'PASTAS', unidad: 'u', stock_actual: 0 },
  { nombre: 'Palitos de Madera x10000', categoria: 'TERMICOS', unidad: 'u', stock_actual: 0 },
]

async function main() {
  const { data: existentes, error: errFetch } = await supabase
    .from('insumos')
    .select('nombre')

  if (errFetch) {
    console.error('Error consultando insumos existentes:', errFetch.message)
    console.error('Detalle:', errFetch.details ?? errFetch.hint ?? '')
    process.exit(1)
  }

  const nombresExistentes = new Set(existentes.map(i => i.nombre.trim().toLowerCase()))
  const aInsertar = productos.filter(p => !nombresExistentes.has(p.nombre.trim().toLowerCase()))

  if (aInsertar.length === 0) {
    console.log(`Sin cambios: los ${productos.length} productos ya existen en la tabla.`)
    return
  }

  const { error } = await supabase.from('insumos').insert(aInsertar)
  if (error) {
    console.error('Error insertando productos:', error.message)
    console.error('Detalle:', error.details ?? error.hint ?? '')
    process.exit(1)
  }

  const omitidos = productos.length - aInsertar.length
  console.log(`Listo: ${aInsertar.length} productos insertados, ${omitidos} ya existían y fueron ignorados.`)
}

main()
