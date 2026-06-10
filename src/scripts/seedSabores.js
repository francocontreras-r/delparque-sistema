// Ejecutar con: node --env-file=.env src/scripts/seedSabores.js
// Requiere SUPABASE_SERVICE_KEY en .env (Settings → API → service_role key) para saltear RLS
import { createClient } from '@supabase/supabase-js'

const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!process.env.SUPABASE_SERVICE_KEY) {
  console.warn('Aviso: SUPABASE_SERVICE_KEY no está definida en .env, se usará VITE_SUPABASE_ANON_KEY (puede fallar si hay RLS activo).')
}
const supabase = createClient(process.env.VITE_SUPABASE_URL, key)

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS sabores (
  id bigserial primary key,
  nombre text not null,
  base_nombre text,
  litros_base numeric default 120,
  notas text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS sabor_ingredientes (
  id bigserial primary key,
  sabor_id bigint references sabores(id),
  insumo_nombre text,
  cantidad numeric,
  unidad text
);
`.trim()

const sabores = [
  { nombre: 'Chocolate', base_nombre: 'Chocolate', litros_base: 120, extras: [] },
  { nombre: 'Chocolate del parque', base_nombre: 'Chocolate', litros_base: 120, extras: [
    { insumo_nombre: 'Pionono', cantidad: 8, unidad: 'kg' },
    { insumo_nombre: 'DDL con rhum', cantidad: 20, unidad: 'kg' },
  ]},
  { nombre: 'Chocolate selva negra', base_nombre: 'Chocolate', litros_base: 120, extras: [
    { insumo_nombre: 'Rhum', cantidad: 1, unidad: 'L' },
    { insumo_nombre: 'Frutilla para sembrar', cantidad: 10, unidad: 'kg' },
    { insumo_nombre: 'Cereza partidas', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'Chocolate con almendras', base_nombre: 'Chocolate', litros_base: 120, extras: [
    { insumo_nombre: 'Almendra', cantidad: 7, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 3, unidad: 'kg' },
    { insumo_nombre: 'Whisky', cantidad: 1, unidad: 'L' },
  ]},
  { nombre: 'Chocolate suizo', base_nombre: 'Chocolate', litros_base: 120, extras: [
    { insumo_nombre: 'Granizado SupLay', cantidad: 8, unidad: 'kg' },
    { insumo_nombre: 'DDL con rhum', cantidad: 30, unidad: 'kg' },
    { insumo_nombre: 'Rhum', cantidad: 1, unidad: 'L' },
  ]},
  { nombre: 'Chocolate amargo', base_nombre: 'Chocolate Amargo', litros_base: 120, extras: [] },
  { nombre: 'Chocolate Kinder', base_nombre: 'Chocolate Blanco', litros_base: 120, extras: [
    { insumo_nombre: 'Chocolate kinder', cantidad: 8, unidad: 'kg' },
    { insumo_nombre: 'Veteado Ovo King', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'Chocolate toffi blanco', base_nombre: 'Chocolate Blanco', litros_base: 120, extras: [
    { insumo_nombre: 'Chocolate granulado blanco', cantidad: 8, unidad: 'kg' },
    { insumo_nombre: 'DDL con rhum', cantidad: 30, unidad: 'kg' },
  ]},
  { nombre: 'Chocotorta', base_nombre: 'Chocotorta', litros_base: 120, extras: [
    { insumo_nombre: 'Chocotorta sembrar', cantidad: 20, unidad: 'kg' },
  ]},
  { nombre: 'DDL Crema', base_nombre: 'Dulce de Leche', litros_base: 120, extras: [] },
  { nombre: 'DDL brownie', base_nombre: 'Dulce de Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Brownie Panaderia', cantidad: 11, unidad: 'kg' },
  ]},
  { nombre: 'DDL Nuez', base_nombre: 'Dulce de Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Nuez', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'DDL granizado', base_nombre: 'Dulce de Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Granizado SupLay', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'DDL marroc', base_nombre: 'Dulce de Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Chocolate marroc Panaderia', cantidad: 13, unidad: 'kg' },
  ]},
  { nombre: 'DDL tentacion', base_nombre: 'Dulce de Leche', litros_base: 120, extras: [
    { insumo_nombre: 'DDL para sembrar', cantidad: 30, unidad: 'kg' },
  ]},
  { nombre: 'Frutilla agua', base_nombre: 'Neutra Agua', litros_base: 90, extras: [
    { insumo_nombre: 'Frutilla natural', cantidad: 30, unidad: 'kg' },
    { insumo_nombre: 'Jugo limon', cantidad: 1, unidad: 'L' },
    { insumo_nombre: 'Pasta frutilla', cantidad: 8, unidad: 'kg' },
  ]},
  { nombre: 'Frutos Patagonicos', base_nombre: 'Neutra Agua', litros_base: 120, extras: [
    { insumo_nombre: 'Frambuesa', cantidad: 8, unidad: 'kg' },
    { insumo_nombre: 'Moras', cantidad: 8, unidad: 'kg' },
    { insumo_nombre: 'Arandanos', cantidad: 8, unidad: 'kg' },
    { insumo_nombre: 'Jugo limon', cantidad: 1, unidad: 'L' },
  ]},
  { nombre: 'Durazno', base_nombre: 'Neutra Agua', litros_base: 90, extras: [
    { insumo_nombre: 'Durazno natural', cantidad: 30, unidad: 'kg' },
    { insumo_nombre: 'Pasta durazno', cantidad: 6, unidad: 'kg' },
  ]},
  { nombre: 'Anana', base_nombre: 'Neutra Agua', litros_base: 90, extras: [
    { insumo_nombre: 'Anana Rodajas', cantidad: 27, unidad: 'kg' },
    { insumo_nombre: 'Pasta anana', cantidad: 6, unidad: 'kg' },
  ]},
  { nombre: 'Naranja', base_nombre: 'Neutra Agua', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta naranja', cantidad: 5, unidad: 'kg' },
    { insumo_nombre: 'Acido Naranja', cantidad: 5, unidad: 'kg' },
    { insumo_nombre: 'Cascara naranja', cantidad: 15, unidad: 'kg' },
  ]},
  { nombre: 'Maracuya', base_nombre: 'Neutra Agua', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta maracuya', cantidad: 10, unidad: 'kg' },
    { insumo_nombre: 'Veteado maracuya', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'Pomelo', base_nombre: 'Neutra Agua', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta pomelo', cantidad: 5, unidad: 'kg' },
    { insumo_nombre: 'Acido pomelo', cantidad: 5, unidad: 'kg' },
  ]},
  { nombre: 'Limon agua', base_nombre: 'Neutra Agua', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta limon', cantidad: 3, unidad: 'kg' },
    { insumo_nombre: 'Acido limon', cantidad: 2, unidad: 'kg' },
    { insumo_nombre: 'Jugo limon', cantidad: 4, unidad: 'L' },
  ]},
  { nombre: 'Canela', base_nombre: 'Neutra Agua', litros_base: 120, extras: [
    { insumo_nombre: 'Jugo limon', cantidad: 1, unidad: 'L' },
    { insumo_nombre: 'Canela en rama', cantidad: 3, unidad: 'kg' },
  ]},
  { nombre: 'Manzana', base_nombre: 'Neutra Agua', litros_base: 90, extras: [
    { insumo_nombre: 'Pasta Manzana Verde', cantidad: 10, unidad: 'kg' },
    { insumo_nombre: 'Manzana Verde', cantidad: 20, unidad: 'kg' },
  ]},
  { nombre: 'Almendrado', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta Almendra', cantidad: 6, unidad: 'kg' },
    { insumo_nombre: 'Almendra', cantidad: 7, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 3, unidad: 'kg' },
  ]},
  { nombre: 'Alcayota C/Nuez', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Alcayota', cantidad: 15, unidad: 'kg' },
    { insumo_nombre: 'Nuez', cantidad: 6, unidad: 'kg' },
  ]},
  { nombre: 'Alfajor del Parque', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Alfajor (Plancha)', cantidad: 5, unidad: 'kg' },
    { insumo_nombre: 'DPO Master 50 SE', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'LPE', cantidad: 7, unidad: 'kg' },
    { insumo_nombre: 'DDL Heladero', cantidad: 18, unidad: 'kg' },
    { insumo_nombre: 'Veteado Ovo King', cantidad: 11, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 10, unidad: 'kg' },
    { insumo_nombre: 'Dextroza', cantidad: 3, unidad: 'kg' },
    { insumo_nombre: 'Cacao 2224', cantidad: 2, unidad: 'kg' },
    { insumo_nombre: 'Cobertura Amarga 99', cantidad: 2, unidad: 'kg' },
  ]},
  { nombre: 'Americana', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta chantilly', cantidad: 8, unidad: 'kg' },
  ]},
  { nombre: 'Baileys', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta Crema whisky', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Crema de Leche', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Veteado whisky', cantidad: 9, unidad: 'kg' },
  ]},
  { nombre: 'Banana Split', base_nombre: 'Neutra Leche', litros_base: 90, extras: [
    { insumo_nombre: 'Pasta banana', cantidad: 8, unidad: 'kg' },
    { insumo_nombre: 'Bananas', cantidad: 30, unidad: 'kg' },
    { insumo_nombre: 'DDL para sembrar', cantidad: 20, unidad: 'kg' },
  ]},
  { nombre: 'Bananita Dolca', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta bananita', cantidad: 6, unidad: 'kg' },
    { insumo_nombre: 'Veteado Bananita', cantidad: 9, unidad: 'kg' },
  ]},
  { nombre: 'Cafe Irlandes', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Cafe instantaneo', cantidad: 3, unidad: 'kg' },
    { insumo_nombre: 'Whisky', cantidad: 2, unidad: 'L' },
  ]},
  { nombre: 'Cereza', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta Cereza', cantidad: 1, unidad: 'kg' },
    { insumo_nombre: 'Cereza partidas', cantidad: 15, unidad: 'kg' },
  ]},
  { nombre: 'Chocolate rocher', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta rocher', cantidad: 9, unidad: 'kg' },
    { insumo_nombre: 'Mielina', cantidad: 2.4, unidad: 'kg' },
    { insumo_nombre: 'Veteado Rocher', cantidad: 9, unidad: 'kg' },
  ]},
  { nombre: 'Coco', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Coco rallado', cantidad: 5, unidad: 'kg' },
    { insumo_nombre: 'Mielina', cantidad: 3, unidad: 'kg' },
    { insumo_nombre: 'Pasta coco', cantidad: 6, unidad: 'kg' },
  ]},
  { nombre: 'Coco con almendras', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Coco rallado', cantidad: 5, unidad: 'kg' },
    { insumo_nombre: 'Pasta coco', cantidad: 6, unidad: 'kg' },
    { insumo_nombre: 'Mielina', cantidad: 2.4, unidad: 'kg' },
    { insumo_nombre: 'Almendra', cantidad: 7, unidad: 'kg' },
    { insumo_nombre: 'Azucar', cantidad: 3, unidad: 'kg' },
  ]},
  { nombre: 'Crema cookies', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Oreo', cantidad: 6, unidad: 'kg' },
  ]},
  { nombre: 'Crema rusa', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta rusa', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Nuez', cantidad: 15, unidad: 'kg' },
    { insumo_nombre: 'Whisky', cantidad: 2, unidad: 'L' },
  ]},
  { nombre: 'Flan', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta vainilla', cantidad: 2, unidad: 'kg' },
    { insumo_nombre: 'Polvo Flan', cantidad: 5, unidad: 'kg' },
    { insumo_nombre: 'Pasta Caramelo Salado', cantidad: 4, unidad: 'kg' },
  ]},
  { nombre: 'Frutilla crema', base_nombre: 'Neutra Leche', litros_base: 90, extras: [
    { insumo_nombre: 'Pasta frutilla', cantidad: 6, unidad: 'kg' },
    { insumo_nombre: 'Frutilla para sembrar', cantidad: 30, unidad: 'kg' },
  ]},
  { nombre: 'Frutilla reina', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Frutilla para sembrar', cantidad: 30, unidad: 'kg' },
  ]},
  { nombre: 'Frutos del bosque', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta frutos del bosque', cantidad: 6, unidad: 'kg' },
    { insumo_nombre: 'Veteado Frutos del Bosque', cantidad: 10.5, unidad: 'kg' },
  ]},
  { nombre: 'Frutos rojos', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Nuez', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Frutilla para sembrar', cantidad: 5, unidad: 'kg' },
    { insumo_nombre: 'Moras natural', cantidad: 3, unidad: 'kg' },
    { insumo_nombre: 'Cereza Partidas', cantidad: 5, unidad: 'kg' },
    { insumo_nombre: 'Arandanos', cantidad: 3, unidad: 'kg' },
  ]},
  { nombre: 'Granizado', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Granizado SupLay', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'Higos al coñac', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Higos', cantidad: 20, unidad: 'kg' },
    { insumo_nombre: 'Rhum', cantidad: 1, unidad: 'L' },
  ]},
  { nombre: 'Lemon pie', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta lemon pie', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Veteado lemon pie', cantidad: 7, unidad: 'kg' },
    { insumo_nombre: 'Acido lemon pie', cantidad: 6, unidad: 'kg' },
  ]},
  { nombre: 'Limon crema', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta limon', cantidad: 3, unidad: 'kg' },
    { insumo_nombre: 'Jugo limon', cantidad: 4, unidad: 'L' },
  ]},
  { nombre: 'Vainilla Crema', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta vainilla', cantidad: 5, unidad: 'kg' },
  ]},
  { nombre: 'Mantecol', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta mantecol', cantidad: 20, unidad: 'kg' },
    { insumo_nombre: 'Mielina', cantidad: 2.4, unidad: 'kg' },
    { insumo_nombre: 'Veteado mapcol', cantidad: 12, unidad: 'kg' },
  ]},
  { nombre: 'Mascarpone', base_nombre: 'Mascarpone', litros_base: 120, extras: [
    { insumo_nombre: 'Veteado frutos del bosque', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'Menta granizada', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta menta', cantidad: 6, unidad: 'kg' },
    { insumo_nombre: 'Granizado SupLay', cantidad: 10, unidad: 'kg' },
  ]},
  { nombre: 'Moscatel al rhum', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta malaga', cantidad: 10, unidad: 'kg' },
    { insumo_nombre: 'Veteado malaga', cantidad: 12, unidad: 'kg' },
  ]},
  { nombre: 'Polonesa', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Durazno para sembrar', cantidad: 20, unidad: 'kg' },
    { insumo_nombre: 'Polonesa para sembrar', cantidad: 7, unidad: 'kg' },
  ]},
  { nombre: 'Quinotos al whisky', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Quinotos', cantidad: 20, unidad: 'kg' },
    { insumo_nombre: 'Whisky', cantidad: 2, unidad: 'L' },
  ]},
  { nombre: 'Strudell manzana', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta tarta manzana', cantidad: 6, unidad: 'kg' },
    { insumo_nombre: 'Veteado tarta manzana', cantidad: 12, unidad: 'kg' },
  ]},
  { nombre: 'Tiramisu', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta tiramisu', cantidad: 8.4, unidad: 'kg' },
    { insumo_nombre: 'Pionono', cantidad: 6, unidad: 'kg' },
    { insumo_nombre: 'Cacao 2224', cantidad: 1, unidad: 'kg' },
  ]},
  { nombre: 'Tramontana', base_nombre: 'Neutra Leche', litros_base: 120, extras: [
    { insumo_nombre: 'Pasta chantilly', cantidad: 4, unidad: 'kg' },
    { insumo_nombre: 'Microgalletas', cantidad: 8, unidad: 'kg' },
    { insumo_nombre: 'DDL para sembrar', cantidad: 30, unidad: 'kg' },
  ]},
  { nombre: 'Pistacho', base_nombre: 'Pistacho Selección Especial', litros_base: 120, extras: [
    { insumo_nombre: 'Pistacho X Kg', cantidad: 7, unidad: 'kg' },
  ]},
  { nombre: 'Sambayon', base_nombre: 'Sambayon', litros_base: 120, extras: [] },
  { nombre: 'Americana Light', base_nombre: 'Americana Light', litros_base: 30, extras: [
    { insumo_nombre: 'LPE', cantidad: 1, unidad: 'kg' },
    { insumo_nombre: 'Pronto SENZA Chantilli', cantidad: 2, unidad: 'kg' },
    { insumo_nombre: 'Agua', cantidad: 4, unidad: 'L' },
  ]},
  { nombre: 'Chocolate Light', base_nombre: 'Chocolate Light', litros_base: 30, extras: [
    { insumo_nombre: 'LPE', cantidad: 1, unidad: 'kg' },
    { insumo_nombre: 'Pronto Senza Cacao', cantidad: 2, unidad: 'kg' },
    { insumo_nombre: 'Agua', cantidad: 4, unidad: 'L' },
  ]},
  { nombre: 'Chocolate vegano', base_nombre: 'Chocolate vegano', litros_base: 30, extras: [
    { insumo_nombre: 'Chocolate Black', cantidad: 3, unidad: 'kg' },
    { insumo_nombre: 'Agua', cantidad: 3, unidad: 'L' },
  ]},
]

// PostgREST no permite DDL directo. Probamos una función RPC "exec_sql" si existe;
// si no, avisamos cómo crearla (o cómo crear las tablas a mano) y abortamos.
async function ensureTables() {
  const { error: rpcError } = await supabase.rpc('exec_sql', { sql: CREATE_TABLES_SQL })
  if (!rpcError) return

  const { error: checkError } = await supabase.from('sabores').select('id').limit(1)
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
    console.error('Luego volvé a correr: node --env-file=.env src/scripts/seedSabores.js')
    process.exit(1)
  }
}

async function main() {
  await ensureTables()

  // Reseed: borramos sabores existentes con estos nombres (y sus ingredientes) para evitar duplicados
  const nombres = sabores.map(s => s.nombre)
  const { data: existentes, error: errExistentes } = await supabase
    .from('sabores')
    .select('id')
    .in('nombre', nombres)

  if (errExistentes) {
    console.error('Error al revisar sabores existentes:', errExistentes.message)
    console.error('Detalle:', errExistentes.details ?? errExistentes.hint ?? '')
    process.exit(1)
  }

  if (existentes && existentes.length > 0) {
    const idsExistentes = existentes.map(s => s.id)
    const { error: errDelIng } = await supabase.from('sabor_ingredientes').delete().in('sabor_id', idsExistentes)
    if (errDelIng) {
      console.error('Error al limpiar ingredientes existentes:', errDelIng.message)
      console.error('Detalle:', errDelIng.details ?? errDelIng.hint ?? '')
      process.exit(1)
    }
    const { error: errDelSabores } = await supabase.from('sabores').delete().in('id', idsExistentes)
    if (errDelSabores) {
      console.error('Error al limpiar sabores existentes:', errDelSabores.message)
      console.error('Detalle:', errDelSabores.details ?? errDelSabores.hint ?? '')
      process.exit(1)
    }
  }

  const { data: saboresInsertados, error: errSabores } = await supabase
    .from('sabores')
    .insert(sabores.map(({ nombre, base_nombre, litros_base }) => ({ nombre, base_nombre, litros_base })))
    .select('id, nombre')

  if (errSabores) {
    console.error('Error al insertar sabores:', errSabores.message)
    console.error('Detalle:', errSabores.details ?? errSabores.hint ?? '')
    process.exit(1)
  }

  const idPorNombre = Object.fromEntries(saboresInsertados.map(s => [s.nombre, s.id]))

  const ingredientes = []
  for (const sabor of sabores) {
    const saborId = idPorNombre[sabor.nombre]
    if (!saborId) {
      console.warn(`Sabor "${sabor.nombre}" no encontrado entre los insertados, se omiten sus ingredientes.`)
      continue
    }
    for (const ing of sabor.extras) {
      ingredientes.push({ sabor_id: saborId, ...ing })
    }
  }

  let ingredientesInsertados = []
  if (ingredientes.length > 0) {
    const { data, error: errIng } = await supabase
      .from('sabor_ingredientes')
      .insert(ingredientes)
      .select('id')

    if (errIng) {
      console.error('Error al insertar ingredientes:', errIng.message)
      console.error('Detalle:', errIng.details ?? errIng.hint ?? '')
      process.exit(1)
    }
    ingredientesInsertados = data
  }

  console.log(`${saboresInsertados.length} sabores insertados, ${ingredientesInsertados.length} ingredientes insertados`)
}

main()
