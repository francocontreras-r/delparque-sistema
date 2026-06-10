// Ejecutar con: node --env-file=.env src/scripts/seedBases.js
// Requiere SUPABASE_SERVICE_KEY en .env (Settings → API → service_role key) para saltear RLS
import { createClient } from '@supabase/supabase-js'

const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!process.env.SUPABASE_SERVICE_KEY) {
  console.warn('Aviso: SUPABASE_SERVICE_KEY no está definida en .env, se usará VITE_SUPABASE_ANON_KEY (puede fallar si hay RLS activo).')
}
const supabase = createClient(process.env.VITE_SUPABASE_URL, key)

const CREATE_TABLES_SQL = `
create table if not exists bases (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  litros_batch integer not null default 120
);

create table if not exists base_ingredientes (
  id bigint generated always as identity primary key,
  base_id bigint not null references bases(id) on delete cascade,
  insumo_nombre text not null,
  cantidad numeric not null,
  unidad text not null
);
`.trim()

const bases = [
  { nombre: 'Alfajor del Parque', litros_batch: 120 },
  { nombre: 'Cereza', litros_batch: 120 },
  { nombre: 'Chocolate', litros_batch: 120 },
  { nombre: 'Chocolate Amargo', litros_batch: 120 },
  { nombre: 'Chocolate Blanco', litros_batch: 120 },
  { nombre: 'Chocotorta', litros_batch: 120 },
  { nombre: 'Dulce de Leche', litros_batch: 120 },
  { nombre: 'Mascarpone', litros_batch: 120 },
  { nombre: 'Neutra Agua', litros_batch: 120 },
  { nombre: 'Neutra Leche', litros_batch: 120 },
  { nombre: 'Pistacho Selección Especial', litros_batch: 120 },
  { nombre: 'Sambayon', litros_batch: 120 },
  { nombre: 'Flan', litros_batch: 120 },
  { nombre: 'Vainilla', litros_batch: 120 },
]

const ingredientesPorBase = {
  'Alfajor del Parque': [
    { insumo_nombre: 'Alfajor (Plancha)', cantidad: 5, unidad: 'kg' },
    { insumo_nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'LPE', cantidad: 7.2, unidad: 'kg' },
    { insumo_nombre: 'Crema de Leche', cantidad: 13, unidad: 'kg' },
    { insumo_nombre: 'DDL Heladero', cantidad: 9, unidad: 'kg' },
    { insumo_nombre: 'DDL Heladero Suave', cantidad: 9, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 9.6, unidad: 'kg' },
    { insumo_nombre: 'Dextroza', cantidad: 2.6, unidad: 'kg' },
    { insumo_nombre: 'Cacao 2224', cantidad: 1.5, unidad: 'kg' },
    { insumo_nombre: 'Cobertura Amarga 99', cantidad: 1.5, unidad: 'kg' },
    { insumo_nombre: 'Agua', cantidad: 57, unidad: 'L' },
  ],
  'Cereza': [
    { insumo_nombre: 'LPE', cantidad: 18, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 15.6, unidad: 'kg' },
    { insumo_nombre: 'Dextroza', cantidad: 6, unidad: 'kg' },
    { insumo_nombre: 'Cremix', cantidad: 3.6, unidad: 'kg' },
    { insumo_nombre: 'Crema de Leche', cantidad: 9.6, unidad: 'L' },
    { insumo_nombre: 'Agua', cantidad: 64.8, unidad: 'L' },
    { insumo_nombre: 'Estabilizador de Cereza', cantidad: 2, unidad: 'kg' },
  ],
  'Chocolate': [
    { insumo_nombre: 'Mielina', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Agua', cantidad: 60, unidad: 'L' },
    { insumo_nombre: 'LPE', cantidad: 11.6, unidad: 'kg' },
    { insumo_nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 18, unidad: 'kg' },
    { insumo_nombre: 'Cobertura Amarga 99', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Cacao 2224', cantidad: 5, unidad: 'kg' },
    { insumo_nombre: 'Dextroza', cantidad: 2, unidad: 'kg' },
    { insumo_nombre: 'Crema de Leche', cantidad: 12, unidad: 'L' },
  ],
  'Chocolate Amargo': [
    { insumo_nombre: 'Crema de Leche', cantidad: 11, unidad: 'L' },
    { insumo_nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 18, unidad: 'kg' },
    { insumo_nombre: 'Dextroza', cantidad: 2, unidad: 'kg' },
    { insumo_nombre: 'Mielina', cantidad: 5.5, unidad: 'kg' },
    { insumo_nombre: 'Cacao 2224', cantidad: 6.5, unidad: 'kg' },
    { insumo_nombre: 'LPE', cantidad: 8, unidad: 'kg' },
    { insumo_nombre: 'Agua', cantidad: 60, unidad: 'L' },
    { insumo_nombre: 'Cobertura Amarga 99', cantidad: 5, unidad: 'kg' },
  ],
  'Chocolate Blanco': [
    { insumo_nombre: 'Crema de Leche', cantidad: 12, unidad: 'L' },
    { insumo_nombre: 'LPE', cantidad: 15.4, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 15.6, unidad: 'kg' },
    { insumo_nombre: 'Dextroza', cantidad: 3.6, unidad: 'kg' },
    { insumo_nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Chocolate cobertura Blanco', cantidad: 5, unidad: 'kg' },
    { insumo_nombre: 'Agua', cantidad: 66, unidad: 'L' },
    { insumo_nombre: 'Pasta chocolate cobertura blanco', cantidad: 3, unidad: 'kg' },
  ],
  'Chocotorta': [
    { insumo_nombre: 'Crema de Leche', cantidad: 6, unidad: 'L' },
    { insumo_nombre: 'LPE', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Queso Crema', cantidad: 8, unidad: 'kg' },
    { insumo_nombre: 'DPO Master 50 SE', cantidad: 3.2, unidad: 'kg' },
    { insumo_nombre: 'Fructosoft', cantidad: 2.4, unidad: 'kg' },
    { insumo_nombre: 'DDL Heladero', cantidad: 25.6, unidad: 'kg' },
    { insumo_nombre: 'Pasta chantilly', cantidad: 4.6, unidad: 'kg' },
    { insumo_nombre: 'Agua', cantidad: 60, unidad: 'L' },
    { insumo_nombre: 'Chocolinas', cantidad: 3, unidad: 'kg' },
  ],
  'Dulce de Leche': [
    { insumo_nombre: 'Crema de Leche', cantidad: 15, unidad: 'L' },
    { insumo_nombre: 'Agua', cantidad: 54, unidad: 'L' },
    { insumo_nombre: 'Fructosoft', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'DDL Heladero', cantidad: 24, unidad: 'kg' },
    { insumo_nombre: 'DDL Heladero Suave', cantidad: 22, unidad: 'kg' },
    { insumo_nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
  ],
  'Mascarpone': [
    { insumo_nombre: 'Crema de Leche', cantidad: 12, unidad: 'L' },
    { insumo_nombre: 'LPE', cantidad: 15.4, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 15.6, unidad: 'kg' },
    { insumo_nombre: 'Agua', cantidad: 66, unidad: 'L' },
    { insumo_nombre: 'Dextroza', cantidad: 3.6, unidad: 'kg' },
    { insumo_nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Queso Crema', cantidad: 10, unidad: 'kg' },
    { insumo_nombre: 'Pasta Mascarpone', cantidad: 6, unidad: 'kg' },
  ],
  'Neutra Agua': [
    { insumo_nombre: 'Prestigio', cantidad: 2, unidad: 'kg' },
    { insumo_nombre: 'Agua', cantidad: 78, unidad: 'L' },
    { insumo_nombre: 'Dextroza', cantidad: 11, unidad: 'kg' },
    { insumo_nombre: 'Fructosoft', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 22, unidad: 'kg' },
  ],
  'Neutra Leche': [
    { insumo_nombre: 'Crema de Leche', cantidad: 12, unidad: 'L' },
    { insumo_nombre: 'LPE', cantidad: 15.4, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 15.6, unidad: 'kg' },
    { insumo_nombre: 'Agua', cantidad: 66, unidad: 'L' },
    { insumo_nombre: 'Dextroza', cantidad: 3.6, unidad: 'kg' },
    { insumo_nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
  ],
  'Pistacho Selección Especial': [
    { insumo_nombre: 'LPE', cantidad: 19, unidad: 'kg' },
    { insumo_nombre: 'Agua', cantidad: 84, unidad: 'L' },
    { insumo_nombre: 'DPO Master 50 SE', cantidad: 5, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 16, unidad: 'kg' },
    { insumo_nombre: 'Dextroza', cantidad: 4.6, unidad: 'kg' },
    { insumo_nombre: 'Mielina', cantidad: 2.4, unidad: 'kg' },
    { insumo_nombre: 'Pasta Pistakion', cantidad: 9, unidad: 'kg' },
  ],
  'Sambayon': [
    { insumo_nombre: 'Crema de Leche', cantidad: 50, unidad: 'L' },
    { insumo_nombre: 'Huevo', cantidad: 52, unidad: 'u' },
    { insumo_nombre: 'Vino Marsala', cantidad: 24.6, unidad: 'L' },
    { insumo_nombre: 'Pasta Sambayon', cantidad: 3.6, unidad: 'kg' },
    { insumo_nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 4, unidad: 'kg' },
  ],
  'Flan': [
    { insumo_nombre: 'Agua', cantidad: 66, unidad: 'L' },
    { insumo_nombre: 'LPE', cantidad: 18, unidad: 'kg' },
    { insumo_nombre: 'Crema de Leche', cantidad: 9.6, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 15.6, unidad: 'kg' },
    { insumo_nombre: 'Dextroza', cantidad: 3.4, unidad: 'kg' },
    { insumo_nombre: 'Cremix', cantidad: 3.4, unidad: 'kg' },
    { insumo_nombre: 'Estabilizador de vainilla', cantidad: 1.8, unidad: 'kg' },
    { insumo_nombre: 'Pasta Vainilla', cantidad: 1, unidad: 'kg' },
  ],
  'Vainilla': [
    { insumo_nombre: 'Agua', cantidad: 66, unidad: 'L' },
    { insumo_nombre: 'LPE', cantidad: 18, unidad: 'kg' },
    { insumo_nombre: 'Crema de Leche', cantidad: 9.6, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 15.6, unidad: 'kg' },
    { insumo_nombre: 'Dextroza', cantidad: 3.4, unidad: 'kg' },
    { insumo_nombre: 'Cremix', cantidad: 3.4, unidad: 'kg' },
    { insumo_nombre: 'Estabilizador de vainilla', cantidad: 2, unidad: 'kg' },
    { insumo_nombre: 'Pasta Vainilla', cantidad: 2, unidad: 'kg' },
  ],
}

// PostgREST no permite DDL directo. Probamos una función RPC "exec_sql" si existe;
// si no, avisamos cómo crearla (o cómo crear las tablas a mano) y abortamos.
async function ensureTables() {
  const { error: rpcError } = await supabase.rpc('exec_sql', { sql: CREATE_TABLES_SQL })
  if (!rpcError) return

  const { error: checkError } = await supabase.from('bases').select('id').limit(1)
  if (checkError) {
    console.error('No se pudieron crear las tablas automáticamente: la función RPC "exec_sql" no está disponible.')
    console.error('')
    console.error('Opción A: creá esa función una sola vez desde el SQL Editor de Supabase:')
    console.error('')
    console.error('  create or replace function exec_sql(sql text) returns void as $$')
    console.error('  begin')
    console.error('    execute sql;')
    console.error('  end;')
    console.error('  $$ language plpgsql security definer;')
    console.error('')
    console.error('Opción B: ejecutá directamente este SQL en el SQL Editor de Supabase:')
    console.error('')
    console.error(CREATE_TABLES_SQL)
    console.error('')
    console.error('Luego volvé a correr: node --env-file=.env src/scripts/seedBases.js')
    process.exit(1)
  }
}

async function main() {
  await ensureTables()

  // Reseed: borramos bases existentes con estos nombres (cascada borra sus ingredientes)
  const nombres = bases.map(b => b.nombre)
  const { error: errDelete } = await supabase.from('bases').delete().in('nombre', nombres)
  if (errDelete) {
    console.error('Error al limpiar bases existentes:', errDelete.message)
    console.error('Detalle:', errDelete.details ?? errDelete.hint ?? '')
    process.exit(1)
  }

  const { data: basesInsertadas, error: errBases } = await supabase
    .from('bases')
    .insert(bases)
    .select('id, nombre')

  if (errBases) {
    console.error('Error al insertar bases:', errBases.message)
    console.error('Detalle:', errBases.details ?? errBases.hint ?? '')
    process.exit(1)
  }

  const idPorNombre = Object.fromEntries(basesInsertadas.map(b => [b.nombre, b.id]))

  const ingredientes = []
  for (const [nombreBase, lista] of Object.entries(ingredientesPorBase)) {
    const baseId = idPorNombre[nombreBase]
    if (!baseId) {
      console.warn(`Base "${nombreBase}" no encontrada entre las insertadas, se omiten sus ingredientes.`)
      continue
    }
    for (const ing of lista) {
      ingredientes.push({ base_id: baseId, ...ing })
    }
  }

  const { data: ingredientesInsertados, error: errIng } = await supabase
    .from('base_ingredientes')
    .insert(ingredientes)
    .select('id')

  if (errIng) {
    console.error('Error al insertar ingredientes:', errIng.message)
    console.error('Detalle:', errIng.details ?? errIng.hint ?? '')
    process.exit(1)
  }

  console.log(`${basesInsertadas.length} bases insertadas, ${ingredientesInsertados.length} ingredientes insertados`)
}

main()
