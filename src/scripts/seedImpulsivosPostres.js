// Ejecutar con: node --env-file=.env src/scripts/seedImpulsivosPostres.js
// Requiere que existan las columnas stock_camaras.tipo_producto y stock_camaras.lote
// (ver migración SQL provista para las tareas de Cámaras / Depósito).
import { createClient } from '@supabase/supabase-js'

const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!process.env.SUPABASE_SERVICE_KEY) {
  console.warn('Aviso: SUPABASE_SERVICE_KEY no está definida en .env, se usará VITE_SUPABASE_ANON_KEY (puede fallar si hay RLS activo).')
}
const supabase = createClient(process.env.VITE_SUPABASE_URL, key)

const productos = [
  // ── Impulsivos ──────────────────────────────────────────────────────────────
  { nombre: 'CUBANITO',                  tipo: 'Impulsivo', tipo_producto: 'impulsivo', baldes: 60, kg: 0, costo_kg:  797, precio_kg: 1800, stock_minimo_baldes: 12 },
  { nombre: 'PALITO BOMBON DDL',         tipo: 'Impulsivo', tipo_producto: 'impulsivo', baldes: 48, kg: 0, costo_kg: 1007, precio_kg: 2200, stock_minimo_baldes: 12 },
  { nombre: 'PALITO BOMBON FRUTILLA',    tipo: 'Impulsivo', tipo_producto: 'impulsivo', baldes: 48, kg: 0, costo_kg:  989, precio_kg: 2200, stock_minimo_baldes: 12 },
  { nombre: 'PALITO BOMBON AMERICANA',   tipo: 'Impulsivo', tipo_producto: 'impulsivo', baldes: 36, kg: 0, costo_kg:  825, precio_kg: 1900, stock_minimo_baldes: 12 },
  { nombre: 'PALITO FRUTILLA AGUA',      tipo: 'Impulsivo', tipo_producto: 'impulsivo', baldes: 72, kg: 0, costo_kg:  478, precio_kg: 1100, stock_minimo_baldes: 12 },
  { nombre: 'PALITO LIMON AGUA',         tipo: 'Impulsivo', tipo_producto: 'impulsivo', baldes: 60, kg: 0, costo_kg:  448, precio_kg: 1100, stock_minimo_baldes: 12 },
  { nombre: 'ALFAJOR DDL',               tipo: 'Impulsivo', tipo_producto: 'impulsivo', baldes: 24, kg: 0, costo_kg:  659, precio_kg: 1500, stock_minimo_baldes: 12 },
  { nombre: 'ALFAJOR FRUTILLA',          tipo: 'Impulsivo', tipo_producto: 'impulsivo', baldes: 24, kg: 0, costo_kg:  652, precio_kg: 1500, stock_minimo_baldes: 12 },
  { nombre: 'ALFAJOR AMERICANA',         tipo: 'Impulsivo', tipo_producto: 'impulsivo', baldes: 18, kg: 0, costo_kg:  587, precio_kg: 1400, stock_minimo_baldes: 12 },
  { nombre: 'BOMBON ESCOCES AMERICANA',  tipo: 'Impulsivo', tipo_producto: 'impulsivo', baldes: 12, kg: 0, costo_kg: 1112, precio_kg: 2400, stock_minimo_baldes: 12 },
  { nombre: 'BOMBON ESCOCES FRUTILLA',   tipo: 'Impulsivo', tipo_producto: 'impulsivo', baldes: 12, kg: 0, costo_kg: 1197, precio_kg: 2400, stock_minimo_baldes: 12 },
  { nombre: 'BOMBON CHOMP CHOCOLATE',    tipo: 'Impulsivo', tipo_producto: 'impulsivo', baldes:  8, kg: 0, costo_kg: 3191, precio_kg: 4500, stock_minimo_baldes: 12 },

  // ── Postres ─────────────────────────────────────────────────────────────────
  { nombre: 'PIONONO',                   tipo: 'Postre', tipo_producto: 'postre', baldes: 6, kg: 18, costo_kg: 3944, precio_kg: 8000,  stock_minimo_baldes: 2 },
  { nombre: 'BARRA TRICOLOR',            tipo: 'Postre', tipo_producto: 'postre', baldes: 4, kg: 12, costo_kg: 3877, precio_kg: 8000,  stock_minimo_baldes: 2 },
  { nombre: 'BARRA ALMENDRADO',          tipo: 'Postre', tipo_producto: 'postre', baldes: 5, kg: 15, costo_kg: 4021, precio_kg: 8500,  stock_minimo_baldes: 2 },
  { nombre: 'TORTA HELADA',              tipo: 'Postre', tipo_producto: 'postre', baldes: 3, kg: 9,  costo_kg: 4000, precio_kg: 9000,  stock_minimo_baldes: 2 },
  { nombre: 'HELADO LIGHT (POTE 500)',   tipo: 'Postre', tipo_producto: 'postre', baldes: 10, kg: 5, costo_kg: 7498, precio_kg: 14000, stock_minimo_baldes: 2 },
  { nombre: 'HELADO VEGANO (POTE 500)',  tipo: 'Postre', tipo_producto: 'postre', baldes: 8,  kg: 4, costo_kg: 9668, precio_kg: 18000, stock_minimo_baldes: 2 },
]

async function main() {
  const nombres = productos.map(p => p.nombre)
  const { data: existentes, error: errCheck } = await supabase
    .from('stock_camaras')
    .select('id,nombre')
    .in('nombre', nombres)

  if (errCheck) {
    console.error('Error al revisar registros existentes:', errCheck.message)
    console.error('Detalle:', errCheck.details ?? errCheck.hint ?? '')
    if (errCheck.message?.includes('tipo_producto') || errCheck.message?.includes('lote')) {
      console.error('')
      console.error('Faltan las columnas "lote"/"tipo_producto" en stock_camaras. Ejecutá primero la migración SQL.')
    }
    process.exit(1)
  }

  if (existentes && existentes.length > 0) {
    console.log(`Ya existen ${existentes.length} de estos productos en stock_camaras (${existentes.map(e => e.nombre).join(', ')}). No se insertó nada para evitar duplicados.`)
    process.exit(0)
  }

  const { data, error } = await supabase
    .from('stock_camaras')
    .insert(productos)
    .select('id')

  if (error) {
    console.error('Error al insertar:', error.message)
    console.error('Detalle:', error.details ?? error.hint ?? '')
    if (error.message?.includes('tipo_producto') || error.message?.includes('lote')) {
      console.error('')
      console.error('Faltan las columnas "lote"/"tipo_producto" en stock_camaras. Ejecutá primero la migración SQL.')
    }
    process.exit(1)
  }

  console.log(`Insertados ${data.length} productos (impulsivos/postres) en stock_camaras.`)
}

main()
