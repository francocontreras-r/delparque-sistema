import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const productos = [
  { codigo: 1,   nombre: 'ALCAYOTA CON NUEZ',          categoria: 'helado' },
  { codigo: 2,   nombre: 'ALFAJOR DEL PARQUE',          categoria: 'helado' },
  { codigo: 3,   nombre: 'ALMENDRADO',                  categoria: 'helado' },
  { codigo: 4,   nombre: 'AMERICANA CREMA',             categoria: 'helado' },
  { codigo: 5,   nombre: 'BAILEYS',                     categoria: 'helado' },
  { codigo: 6,   nombre: 'BANANA SPLIT',                categoria: 'helado' },
  { codigo: 7,   nombre: 'BANANITA DOLCA',              categoria: 'helado' },
  { codigo: 9,   nombre: 'CEREZA',                      categoria: 'helado' },
  { codigo: 10,  nombre: 'CHANTILLY',                   categoria: 'helado' },
  { codigo: 11,  nombre: 'CHOCOLATE CREMA',             categoria: 'helado' },
  { codigo: 12,  nombre: 'CHOCOLATE AMARGO',            categoria: 'helado' },
  { codigo: 14,  nombre: 'CHOCOLATE CON ALMENDRA',      categoria: 'helado' },
  { codigo: 15,  nombre: 'CHOCOLATE DEL PARQUE',        categoria: 'helado' },
  { codigo: 16,  nombre: 'CHOCOLATE SELVA NEGRA',       categoria: 'helado' },
  { codigo: 17,  nombre: 'CHOCOLATE SUIZO',             categoria: 'helado' },
  { codigo: 18,  nombre: 'CHOCOLATE TOFFI BLANCO',      categoria: 'helado' },
  { codigo: 19,  nombre: 'COCO',                        categoria: 'helado' },
  { codigo: 20,  nombre: 'COCO CON ALMENDRAS',          categoria: 'helado' },
  { codigo: 21,  nombre: 'CREMA COOKIES',               categoria: 'helado' },
  { codigo: 22,  nombre: 'FRUTILLA CREMA',              categoria: 'helado' },
  { codigo: 23,  nombre: 'DULCE DE LECHE CREMA',        categoria: 'helado' },
  { codigo: 24,  nombre: 'DULCE DE LECHE BROWNIE',      categoria: 'helado' },
  { codigo: 25,  nombre: 'DULCE DE LECHE GRANIZADO',    categoria: 'helado' },
  { codigo: 26,  nombre: 'DULCE DE LECHE MARROC',       categoria: 'helado' },
  { codigo: 27,  nombre: 'DULCE DE LECHE CON NUEZ',     categoria: 'helado' },
  { codigo: 28,  nombre: 'DULCE DE LECHE TENTACION',    categoria: 'helado' },
  { codigo: 29,  nombre: 'FLAN',                        categoria: 'helado' },
  { codigo: 30,  nombre: 'FRUTILLA REINA',              categoria: 'helado' },
  { codigo: 31,  nombre: 'FRUTOS DEL BOSQUE',           categoria: 'helado' },
  { codigo: 32,  nombre: 'FRUTOS ROJOS',                categoria: 'helado' },
  { codigo: 33,  nombre: 'GRANIZADO',                   categoria: 'helado' },
  { codigo: 34,  nombre: 'HIGOS AL COÑAC',              categoria: 'helado' },
  { codigo: 35,  nombre: 'LEMON PIE',                   categoria: 'helado' },
  { codigo: 36,  nombre: 'LIMON CREMA',                 categoria: 'helado' },
  { codigo: 37,  nombre: 'MANTECOL',                    categoria: 'helado' },
  { codigo: 38,  nombre: 'MASCARPONE',                  categoria: 'helado' },
  { codigo: 39,  nombre: 'MENTA GRANIZADA',             categoria: 'helado' },
  { codigo: 40,  nombre: 'MOSCATEL AL RHUM',            categoria: 'helado' },
  { codigo: 41,  nombre: 'PISTACHO',                    categoria: 'helado' },
  { codigo: 42,  nombre: 'QUINOTOS AL WHISKY',          categoria: 'helado' },
  { codigo: 43,  nombre: 'CHOCOLATE ROCHER',            categoria: 'helado' },
  { codigo: 44,  nombre: 'CREMA RUSA',                  categoria: 'helado' },
  { codigo: 45,  nombre: 'SAMBAYON',                    categoria: 'helado' },
  { codigo: 46,  nombre: 'TIRAMISU',                    categoria: 'helado' },
  { codigo: 47,  nombre: 'TRAMONTANA',                  categoria: 'helado' },
  { codigo: 48,  nombre: 'VAINILLA CREMA',              categoria: 'helado' },
  { codigo: 50,  nombre: 'ANANA',                       categoria: 'helado' },
  { codigo: 51,  nombre: 'CANELA',                      categoria: 'helado' },
  { codigo: 52,  nombre: 'DURAZNO',                     categoria: 'helado' },
  { codigo: 53,  nombre: 'FRUTILLA AL AGUA',            categoria: 'helado' },
  { codigo: 54,  nombre: 'LIMON AGUA',                  categoria: 'helado' },
  { codigo: 55,  nombre: 'MANZANA',                     categoria: 'helado' },
  { codigo: 56,  nombre: 'MARACUYA',                    categoria: 'helado' },
  { codigo: 57,  nombre: 'NARANJA',                     categoria: 'helado' },
  { codigo: 58,  nombre: 'POMELO ROSADO',               categoria: 'helado' },
  { codigo: 100, nombre: 'BARRA ALMENDRADO',            categoria: 'impulsivo' },
  { codigo: 101, nombre: 'BARRA HELADA',                categoria: 'impulsivo' },
  { codigo: 102, nombre: 'PIONONO',                     categoria: 'impulsivo' },
  { codigo: 103, nombre: 'CHOMP GRANIZADO',             categoria: 'impulsivo' },
  { codigo: 104, nombre: 'CHOMP DDL',                   categoria: 'impulsivo' },
  { codigo: 105, nombre: 'CHOMP CHOCOLATE',             categoria: 'impulsivo' },
  { codigo: 106, nombre: 'BOMBON SUIZO',                categoria: 'impulsivo' },
  { codigo: 107, nombre: 'BOMBON ESCOCES',              categoria: 'impulsivo' },
  { codigo: 108, nombre: 'BOMBON AMERICANA',            categoria: 'impulsivo' },
  { codigo: 109, nombre: 'BOMBON FRUTILLA',             categoria: 'impulsivo' },
  { codigo: 110, nombre: 'BOMBON DDL',                  categoria: 'impulsivo' },
  { codigo: 111, nombre: 'PALITO AGUA LIMON',           categoria: 'impulsivo' },
  { codigo: 112, nombre: 'PALITO AGUA FRUTILLA',        categoria: 'impulsivo' },
  { codigo: 113, nombre: 'CUBANITOS',                   categoria: 'impulsivo' },
  { codigo: 114, nombre: 'CHOCOLATE KINDER',            categoria: 'helado' },
  { codigo: 115, nombre: 'STRUDELL MANZANA',            categoria: 'helado' },
  { codigo: 116, nombre: 'TORTA HELADA KG',             categoria: 'impulsivo' },
  { codigo: 117, nombre: 'ALMENDRADO PORCIONADO',       categoria: 'impulsivo' },
]

const { data, error } = await supabase
  .from('productos_produccion')
  .upsert(productos, { onConflict: 'codigo' })
  .select('codigo, nombre, categoria')

if (error) {
  console.error('Error:', error.message)
  process.exit(1)
}

console.log(`✓ ${data.length} productos actualizados`)
data.forEach(p => console.log(`  [${String(p.codigo).padStart(3)}] ${p.nombre} (${p.categoria})`))
