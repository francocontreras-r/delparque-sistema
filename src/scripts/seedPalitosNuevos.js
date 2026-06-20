// Ejecutar con: node --env-file=.env src/scripts/seedPalitosNuevos.js
import { createClient } from '@supabase/supabase-js'

const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!process.env.SUPABASE_SERVICE_KEY) {
  console.warn('Aviso: SUPABASE_SERVICE_KEY no está definida, se usará VITE_SUPABASE_ANON_KEY (puede fallar si hay RLS activo).')
}
const supabase = createClient(process.env.VITE_SUPABASE_URL, key)

const palitos = [
  { nombre: 'Palito Pistacho',          costo_materiales: 1688.13, mano_de_obra: 183.33, costo_total: 1871.46 },
  { nombre: 'Palito Chocolate Toffi',   costo_materiales: 1268.40, mano_de_obra: 183.33, costo_total: 1451.73 },
  { nombre: 'Palito Block',             costo_materiales: 1554.60, mano_de_obra: 183.33, costo_total: 1737.93 },
  { nombre: 'Palito Chocolate Rocher',  costo_materiales: 1757.55, mano_de_obra: 183.33, costo_total: 1940.88 },
  { nombre: 'Palito Vainilla Crema',    costo_materiales: 1221.29, mano_de_obra: 183.33, costo_total: 1404.62 },
  { nombre: 'Palito Argentina Americana', costo_materiales: 542.32, mano_de_obra: 183.33, costo_total: 725.65 },
  { nombre: 'Palito Argentina DDL',     costo_materiales:  646.75, mano_de_obra:  93.33, costo_total:  740.08 },
]

async function main() {
  let ok = 0, fail = 0
  for (const p of palitos) {
    const { error } = await supabase.from('impulsivos').insert(p)
    if (error) { console.error('✗', p.nombre, '-', error.message); fail++ }
    else       { console.log('✓', p.nombre); ok++ }
  }
  console.log(`\nListo: ${ok} insertados, ${fail} errores.`)
}
main()
