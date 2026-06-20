import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// Ejecuta una query de Supabase con timeout. Si tarda más de `ms` milisegundos
// resuelve con { data: null, error: { message: 'Tiempo de espera agotado' } }.
export function withTimeout(queryPromise, ms = 10000) {
  return Promise.race([
    queryPromise,
    new Promise(resolve =>
      setTimeout(
        () => resolve({ data: null, error: { message: 'Tiempo de espera agotado. Verificá tu conexión.' } }),
        ms
      )
    ),
  ])
}
