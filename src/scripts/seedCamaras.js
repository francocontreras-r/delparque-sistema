// Ejecutar con: node --env-file=.env src/scripts/seedCamaras.js
// Requiere SUPABASE_SERVICE_KEY en .env (Settings → API → service_role key)
import { createClient } from '@supabase/supabase-js'

const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(process.env.VITE_SUPABASE_URL, key)

const sabores = [
  { nombre: 'AMERICANA',                   tipo: 'Lisa',         baldes: 9,  kg: 63,  costo_kg: 1200, precio_kg: 2800, stock_minimo_baldes: 3 },
  { nombre: 'DULCE DE LECHE',              tipo: 'Lisa',         baldes: 30, kg: 210, costo_kg: 1200, precio_kg: 2800, stock_minimo_baldes: 3 },
  { nombre: 'CHOCOLATE',                   tipo: 'Lisa',         baldes: 30, kg: 210, costo_kg: 1200, precio_kg: 2800, stock_minimo_baldes: 3 },
  { nombre: 'VAINILLA',                    tipo: 'Lisa',         baldes: 0,  kg: 0,   costo_kg: 1200, precio_kg: 2800, stock_minimo_baldes: 3 },
  { nombre: 'LIMON CREMA',                 tipo: 'Lisa',         baldes: 12, kg: 84,  costo_kg: 1200, precio_kg: 2800, stock_minimo_baldes: 3 },
  { nombre: 'GRANIZADO',                   tipo: 'Con Agregado', baldes: 12, kg: 84,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'ALFAJOR DEL PARQUE',          tipo: 'Con Agregado', baldes: 17, kg: 119, costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'COOKIE',                      tipo: 'Con Agregado', baldes: 13, kg: 91,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'DULCE DE LECHE GRANIZADO',    tipo: 'Con Agregado', baldes: 13, kg: 91,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'FRUTILLA CREMA',              tipo: 'Con Agregado', baldes: 13, kg: 91,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'MASCARPONE',                  tipo: 'Con Agregado', baldes: 17, kg: 119, costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'FRUTOS ROJOS',               tipo: 'Con Agregado', baldes: 13, kg: 91,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'BANANITA DOLCA',             tipo: 'Con Agregado', baldes: 12, kg: 84,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'QUINOTOS AL WHISKY',         tipo: 'Con Agregado', baldes: 11, kg: 77,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'DULCE DE LECHE BROWNIE',     tipo: 'Con Agregado', baldes: 10, kg: 70,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'RUSA',                        tipo: 'Con Agregado', baldes: 9,  kg: 63,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'BAILEYS',                     tipo: 'Con Agregado', baldes: 3,  kg: 21,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'CHOCOLATE DUBAI',            tipo: 'Con Agregado', baldes: 15, kg: 105, costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'CHOCOLATE TOFFI',            tipo: 'Con Agregado', baldes: 6,  kg: 42,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'DULCE DE LECHE CON NUEZ',   tipo: 'Con Agregado', baldes: 2,  kg: 14,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'FRUTOS DEL BOSQUE',         tipo: 'Con Agregado', baldes: 2,  kg: 14,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'TIRAMIZU',                   tipo: 'Con Agregado', baldes: 2,  kg: 14,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'DULCE DE LECHE TENTACION',  tipo: 'Con Agregado', baldes: 2,  kg: 14,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'DULCE DE LECHE MARROC',     tipo: 'Con Agregado', baldes: 7,  kg: 49,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'ALMENDRADO',                 tipo: 'Con Agregado', baldes: 5,  kg: 35,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'CHOC. C/ALMENDRAS',         tipo: 'Con Agregado', baldes: 5,  kg: 35,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'ALCAYOTA C/NUEZ',           tipo: 'Con Agregado', baldes: 4,  kg: 28,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'CHOCOLATE SUIZO',           tipo: 'Con Agregado', baldes: 4,  kg: 28,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'TRAMONTANA',                 tipo: 'Con Agregado', baldes: 4,  kg: 28,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'HIGOS AL COGÑAC',           tipo: 'Con Agregado', baldes: 6,  kg: 42,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'MENTA GRANIZADA',           tipo: 'Con Agregado', baldes: 8,  kg: 56,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'POLONESA',                   tipo: 'Con Agregado', baldes: 6,  kg: 42,  costo_kg: 1500, precio_kg: 3200, stock_minimo_baldes: 3 },
  { nombre: 'ANANA',                      tipo: 'Agua',         baldes: 15, kg: 105, costo_kg: 900,  precio_kg: 2200, stock_minimo_baldes: 3 },
  { nombre: 'DURAZNO',                    tipo: 'Agua',         baldes: 14, kg: 98,  costo_kg: 900,  precio_kg: 2200, stock_minimo_baldes: 3 },
  { nombre: 'FRUTOS PATAGONICOS',        tipo: 'Agua',         baldes: 10, kg: 70,  costo_kg: 900,  precio_kg: 2200, stock_minimo_baldes: 3 },
  { nombre: 'CANELA',                     tipo: 'Agua',         baldes: 9,  kg: 63,  costo_kg: 900,  precio_kg: 2200, stock_minimo_baldes: 3 },
  { nombre: 'LIMON AL AGUA',             tipo: 'Agua',         baldes: 2,  kg: 14,  costo_kg: 900,  precio_kg: 2200, stock_minimo_baldes: 3 },
  { nombre: 'MANZANA',                    tipo: 'Agua',         baldes: 1,  kg: 7,   costo_kg: 900,  precio_kg: 2200, stock_minimo_baldes: 3 },
  { nombre: 'FRUTILLA AL AGUA',          tipo: 'Agua',         baldes: 0,  kg: 0,   costo_kg: 900,  precio_kg: 2200, stock_minimo_baldes: 3 },
  { nombre: 'NARANJA',                    tipo: 'Agua',         baldes: 0,  kg: 0,   costo_kg: 900,  precio_kg: 2200, stock_minimo_baldes: 3 },
  { nombre: 'LEMON PIE',                 tipo: 'Especial',     baldes: 1,  kg: 7,   costo_kg: 2000, precio_kg: 4500, stock_minimo_baldes: 3 },
  { nombre: 'PISTACHO',                   tipo: 'Especial',     baldes: 0,  kg: 0,   costo_kg: 2000, precio_kg: 4500, stock_minimo_baldes: 3 },
  { nombre: 'MANTECOL',                   tipo: 'Especial',     baldes: 0,  kg: 0,   costo_kg: 2000, precio_kg: 4500, stock_minimo_baldes: 3 },
  { nombre: 'CHOCOLATE AMARGO',          tipo: 'Especial',     baldes: 0,  kg: 0,   costo_kg: 2000, precio_kg: 4500, stock_minimo_baldes: 3 },
  { nombre: 'CHOCOLATE ROCHER',          tipo: 'Especial',     baldes: 0,  kg: 0,   costo_kg: 2000, precio_kg: 4500, stock_minimo_baldes: 3 },
]

const { data, error } = await supabase
  .from('stock_camaras')
  .insert(sabores)
  .select('id')

if (error) {
  console.error('Error al insertar:', error.message)
  console.error('Detalle:', error.details ?? error.hint ?? '')
  process.exit(1)
}

console.log(`Insertados ${data.length} registros en stock_camaras.`)
