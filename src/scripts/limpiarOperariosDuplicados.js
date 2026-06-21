/**
 * Script de limpieza de operarios duplicados en Supabase.
 * Ejecutar desde la consola del navegador o con node + dotenv.
 *
 * Por cada nombre duplicado:
 *  1. Mantiene el registro con el id más bajo (el original).
 *  2. Reasigna producciones y ordenes al id canónico.
 *  3. Elimina los registros duplicados.
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

async function limpiarOperariosDuplicados() {
  console.log('Cargando operarios…')
  const { data: todos, error } = await supabase.from('operarios').select('*').order('id')
  if (error) { console.error('Error al cargar operarios:', error.message); return }

  // Agrupar por nombre normalizado
  const grupos = {}
  todos.forEach(o => {
    const key = (o.nombre || '').trim().toLowerCase()
    if (!grupos[key]) grupos[key] = []
    grupos[key].push(o)
  })

  const duplicados = Object.entries(grupos).filter(([, arr]) => arr.length > 1)
  if (duplicados.length === 0) { console.log('Sin duplicados. ✅'); return }

  console.log(`Encontrados ${duplicados.length} nombre(s) con duplicados:`)

  for (const [nombre, arr] of duplicados) {
    // El id más bajo es el canónico
    arr.sort((a, b) => a.id - b.id)
    const canonico = arr[0]
    const aEliminar = arr.slice(1)
    console.log(`\n"${nombre}" (${arr.length} registros)`)
    console.log(`  → Canónico: id=${canonico.id}`)
    console.log(`  → A eliminar: ids=${aEliminar.map(o => o.id).join(', ')}`)

    for (const dup of aEliminar) {
      // Reasignar producciones
      const { error: e1 } = await supabase
        .from('producciones')
        .update({ operario_id: canonico.id, operario_nombre: canonico.nombre })
        .eq('operario_id', dup.id)
      if (e1) console.warn(`  ⚠ producciones reasign id=${dup.id}:`, e1.message)

      // Reasignar ordenes_produccion
      const { error: e2 } = await supabase
        .from('ordenes_produccion')
        .update({ operario_id: canonico.id, operario_nombre: canonico.nombre })
        .eq('operario_id', dup.id)
      if (e2) console.warn(`  ⚠ ordenes_produccion reasign id=${dup.id}:`, e2.message)

      // Eliminar duplicado
      const { error: e3 } = await supabase.from('operarios').delete().eq('id', dup.id)
      if (e3) console.warn(`  ⚠ delete id=${dup.id}:`, e3.message)
      else console.log(`  ✓ Eliminado id=${dup.id}`)
    }
  }

  console.log('\n✅ Limpieza completada.')
}

limpiarOperariosDuplicados()
