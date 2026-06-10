// Ejecutar con: node --env-file=.env src/scripts/seedImpulsivos.js
// Requiere SUPABASE_SERVICE_KEY en .env (Settings → API → service_role key) para saltear RLS
import { createClient } from '@supabase/supabase-js'

const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!process.env.SUPABASE_SERVICE_KEY) {
  console.warn('Aviso: SUPABASE_SERVICE_KEY no está definida en .env, se usará VITE_SUPABASE_ANON_KEY (puede fallar si hay RLS activo).')
}
const supabase = createClient(process.env.VITE_SUPABASE_URL, key)

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS impulsivos (
  id bigserial primary key,
  nombre text not null,
  costo_materiales numeric default 0,
  mano_de_obra numeric default 0,
  costo_total numeric default 0,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS impulsivo_ingredientes (
  id bigserial primary key,
  impulsivo_id bigint references impulsivos(id),
  insumo_nombre text,
  cantidad numeric,
  unidad text,
  costo_unitario numeric default 0,
  costo_total_ing numeric default 0
);
`.trim()

const impulsivos = [
  { nombre: 'Masa Cubanito', costo_materiales: 7427.16, mano_de_obra: 63.33, ingredientes: [
    { insumo_nombre: 'Huevo', cantidad: 6, unidad: 'u', costo_unitario: 223.33, costo_total: 1340 },
    { insumo_nombre: 'Harina 0000', cantidad: 1, unidad: 'kg', costo_unitario: 640, costo_total: 640 },
    { insumo_nombre: 'Manteca', cantidad: 0.5, unidad: 'kg', costo_unitario: 8000, costo_total: 4000 },
    { insumo_nombre: 'Leche Entera', cantidad: 1, unidad: 'L', costo_unitario: 1447.16, costo_total: 1447.16 },
  ]},
  { nombre: 'Cubanito', costo_materiales: 796.71, mano_de_obra: 253.33, ingredientes: [
    { insumo_nombre: 'DDL', cantidad: 0.075, unidad: 'kg', costo_unitario: 6358.03, costo_total: 476.85 },
    { insumo_nombre: 'Masa Cubanito', cantidad: 1, unidad: 'u', costo_unitario: 145.86, costo_total: 145.86 },
    { insumo_nombre: 'Papel de Balanza', cantidad: 1, unidad: 'u', costo_unitario: 1, costo_total: 1 },
    { insumo_nombre: 'Caja para postres grandes', cantidad: 1, unidad: 'u', costo_unitario: 6.50, costo_total: 6.50 },
    { insumo_nombre: 'Papel para Cubanito', cantidad: 1, unidad: 'u', costo_unitario: 96, costo_total: 96 },
    { insumo_nombre: 'Baño Stracciatella 56-78', cantidad: 0.005, unidad: 'kg', costo_unitario: 14101, costo_total: 70.51 },
  ]},
  { nombre: 'Palito Bombon Americana', costo_materiales: 825.29, mano_de_obra: 158.33, ingredientes: [
    { insumo_nombre: 'Americana', cantidad: 0.1, unidad: 'kg', costo_unitario: 5052.70, costo_total: 505.27 },
    { insumo_nombre: 'Baño Stracciatella 56-78', cantidad: 0.015, unidad: 'kg', costo_unitario: 14101, costo_total: 211.52 },
    { insumo_nombre: 'Caja para postres grandes', cantidad: 1, unidad: 'u', costo_unitario: 6.50, costo_total: 6.50 },
    { insumo_nombre: 'Palito de Madera', cantidad: 1, unidad: 'u', costo_unitario: 2, costo_total: 2 },
    { insumo_nombre: 'Caja Paletas', cantidad: 1, unidad: 'u', costo_unitario: 100, costo_total: 100 },
    { insumo_nombre: 'Papel para paletas', cantidad: 1, unidad: 'u', costo_unitario: 49.70, costo_total: 49.70 },
  ]},
  { nombre: 'Palito Bombon DDL', costo_materiales: 1006.52, mano_de_obra: 158.33, ingredientes: [
    { insumo_nombre: 'DDL', cantidad: 0.1, unidad: 'kg', costo_unitario: 6358.03, costo_total: 635.80 },
    { insumo_nombre: 'Baño Stracciatella 56-78', cantidad: 0.015, unidad: 'kg', costo_unitario: 14101, costo_total: 211.52 },
    { insumo_nombre: 'Palito de Madera', cantidad: 1, unidad: 'u', costo_unitario: 2, costo_total: 2 },
    { insumo_nombre: 'Papel de Balanza', cantidad: 1, unidad: 'u', costo_unitario: 1, costo_total: 1 },
    { insumo_nombre: 'Caja para postres grandes', cantidad: 1, unidad: 'u', costo_unitario: 6.50, costo_total: 6.50 },
    { insumo_nombre: 'Caja Paletas', cantidad: 1, unidad: 'u', costo_unitario: 100, costo_total: 100 },
    { insumo_nombre: 'Papel para paletas', cantidad: 1, unidad: 'u', costo_unitario: 49.70, costo_total: 49.70 },
  ]},
  { nombre: 'Palito Bombon Frutilla', costo_materiales: 989.22, mano_de_obra: 158.33, ingredientes: [
    { insumo_nombre: 'Frutilla Crema', cantidad: 0.1, unidad: 'kg', costo_unitario: 6220.03, costo_total: 622 },
    { insumo_nombre: 'Papel de Balanza', cantidad: 1, unidad: 'u', costo_unitario: 1, costo_total: 1 },
    { insumo_nombre: 'Palito de Madera', cantidad: 1, unidad: 'u', costo_unitario: 2, costo_total: 2 },
    { insumo_nombre: 'Caja para postres grandes', cantidad: 1, unidad: 'u', costo_unitario: 3, costo_total: 3 },
    { insumo_nombre: 'Caja Paletas', cantidad: 1, unidad: 'u', costo_unitario: 100, costo_total: 100 },
    { insumo_nombre: 'Papel para paletas', cantidad: 1, unidad: 'u', costo_unitario: 49.70, costo_total: 49.70 },
    { insumo_nombre: 'Baño Stracciatella 56-78', cantidad: 0.015, unidad: 'kg', costo_unitario: 14101, costo_total: 211.52 },
  ]},
  { nombre: 'Almendrado (postre)', costo_materiales: 857.20, mano_de_obra: 158.33, ingredientes: [
    { insumo_nombre: 'Almendrado', cantidad: 0.12, unidad: 'kg', costo_unitario: 6771.56, costo_total: 812.59 },
    { insumo_nombre: 'Papel para escoces', cantidad: 1, unidad: 'u', costo_unitario: 35, costo_total: 35 },
    { insumo_nombre: 'Papel de Balanza', cantidad: 1, unidad: 'u', costo_unitario: 1, costo_total: 1 },
    { insumo_nombre: 'Caja para postres grandes', cantidad: 1, unidad: 'u', costo_unitario: 2.50, costo_total: 2.50 },
    { insumo_nombre: 'Crocante Mani Almendra', cantidad: 0.001, unidad: 'kg', costo_unitario: 6110, costo_total: 6.11 },
  ]},
  { nombre: 'Bombon Suizo', costo_materiales: 1207.72, mano_de_obra: 158.33, ingredientes: [
    { insumo_nombre: 'DDL', cantidad: 0.15, unidad: 'kg', costo_unitario: 6358.03, costo_total: 953.70 },
    { insumo_nombre: 'Papel de Balanza', cantidad: 1, unidad: 'u', costo_unitario: 1, costo_total: 1 },
    { insumo_nombre: 'Baño Stracciatella 56-78', cantidad: 0.015, unidad: 'kg', costo_unitario: 14101, costo_total: 211.52 },
    { insumo_nombre: 'Caja para postres grandes', cantidad: 1, unidad: 'u', costo_unitario: 6.50, costo_total: 6.50 },
    { insumo_nombre: 'Papel para escoces', cantidad: 1, unidad: 'u', costo_unitario: 35, costo_total: 35 },
  ]},
  { nombre: 'Palito Frutilla Agua', costo_materiales: 478.32, mano_de_obra: 271.43, ingredientes: [
    { insumo_nombre: 'Frutilla agua', cantidad: 0.05, unidad: 'kg', costo_unitario: 4712.46, costo_total: 235.62 },
    { insumo_nombre: 'Palito de Madera', cantidad: 1, unidad: 'u', costo_unitario: 2, costo_total: 2 },
    { insumo_nombre: 'Papel de Balanza', cantidad: 1, unidad: 'u', costo_unitario: 1, costo_total: 1 },
    { insumo_nombre: 'Caja para postres chicas', cantidad: 1, unidad: 'u', costo_unitario: 90, costo_total: 90 },
    { insumo_nombre: 'Papel para paletas', cantidad: 1, unidad: 'u', costo_unitario: 49.70, costo_total: 49.70 },
    { insumo_nombre: 'Caja Paletas', cantidad: 1, unidad: 'u', costo_unitario: 100, costo_total: 100 },
  ]},
  { nombre: 'Palito Limon Agua', costo_materiales: 447.65, mano_de_obra: 271.43, ingredientes: [
    { insumo_nombre: 'Limon agua', cantidad: 0.05, unidad: 'kg', costo_unitario: 4099.04, costo_total: 204.95 },
    { insumo_nombre: 'Palito de Madera', cantidad: 1, unidad: 'u', costo_unitario: 2, costo_total: 2 },
    { insumo_nombre: 'Papel de Balanza', cantidad: 1, unidad: 'u', costo_unitario: 1, costo_total: 1 },
    { insumo_nombre: 'Caja para postres chicas', cantidad: 1, unidad: 'u', costo_unitario: 90, costo_total: 90 },
    { insumo_nombre: 'Papel para paletas', cantidad: 1, unidad: 'u', costo_unitario: 49.70, costo_total: 49.70 },
    { insumo_nombre: 'Caja Paletas', cantidad: 1, unidad: 'u', costo_unitario: 100, costo_total: 100 },
  ]},
  { nombre: 'Bombon Escoces Americana', costo_materiales: 1112, mano_de_obra: 228, ingredientes: [
    { insumo_nombre: 'DDL', cantidad: 0.0725, unidad: 'kg', costo_unitario: 6358.03, costo_total: 460.96 },
    { insumo_nombre: 'Americana', cantidad: 0.0725, unidad: 'kg', costo_unitario: 5052.70, costo_total: 366.32 },
    { insumo_nombre: 'Baño Stracciatella 56-78', cantidad: 0.015, unidad: 'kg', costo_unitario: 14101, costo_total: 211.52 },
    { insumo_nombre: 'DDL repostero', cantidad: 0.005, unidad: 'kg', costo_unitario: 2.60, costo_total: 0.01 },
    { insumo_nombre: 'Crema', cantidad: 0.005, unidad: 'kg', costo_unitario: 6.60, costo_total: 0.03 },
    { insumo_nombre: 'Caja para postres grandes', cantidad: 1, unidad: 'u', costo_unitario: 6.50, costo_total: 6.50 },
    { insumo_nombre: 'Papel Manteca', cantidad: 1, unidad: 'u', costo_unitario: 10, costo_total: 10 },
    { insumo_nombre: 'Cerezas Maraschino', cantidad: 0.01, unidad: 'kg', costo_unitario: 5666.08, costo_total: 56.66 },
  ]},
  { nombre: 'Bombon Escoces Frutilla', costo_materiales: 1196.60, mano_de_obra: 228, ingredientes: [
    { insumo_nombre: 'DDL', cantidad: 0.0725, unidad: 'kg', costo_unitario: 6358.03, costo_total: 460.96 },
    { insumo_nombre: 'Frutilla crema', cantidad: 0.0725, unidad: 'kg', costo_unitario: 6220.03, costo_total: 450.95 },
    { insumo_nombre: 'Baño Stracciatella 56-78', cantidad: 0.015, unidad: 'kg', costo_unitario: 14101, costo_total: 211.52 },
    { insumo_nombre: 'DDL repostero', cantidad: 0.005, unidad: 'kg', costo_unitario: 1.59, costo_total: 0.01 },
    { insumo_nombre: 'Crema', cantidad: 0.005, unidad: 'kg', costo_unitario: 1.74, costo_total: 0.01 },
    { insumo_nombre: 'Caja para postres grandes', cantidad: 1, unidad: 'u', costo_unitario: 6.50, costo_total: 6.50 },
    { insumo_nombre: 'Cerezas Maraschino', cantidad: 0.01, unidad: 'kg', costo_unitario: 5666.08, costo_total: 56.66 },
    { insumo_nombre: 'Papel Manteca', cantidad: 1, unidad: 'u', costo_unitario: 10, costo_total: 10 },
  ]},
  { nombre: 'Bombon Chomp Chocolate', costo_materiales: 3191.32, mano_de_obra: 570, ingredientes: [
    { insumo_nombre: 'Chocolate', cantidad: 0.24, unidad: 'kg', costo_unitario: 8075.99, costo_total: 1938.24 },
    { insumo_nombre: 'Baño Stracciatella 56-78', cantidad: 0.08, unidad: 'kg', costo_unitario: 14101, costo_total: 1128.08 },
    { insumo_nombre: 'Pote Impreso 500', cantidad: 1, unidad: 'u', costo_unitario: 125, costo_total: 125 },
  ]},
  { nombre: 'Bombon Chomp DDL', costo_materiales: 2779.01, mano_de_obra: 570, ingredientes: [
    { insumo_nombre: 'DDL', cantidad: 0.24, unidad: 'kg', costo_unitario: 6358.03, costo_total: 1525.93 },
    { insumo_nombre: 'Baño Stracciatella 56-78', cantidad: 0.08, unidad: 'kg', costo_unitario: 14101, costo_total: 1128.08 },
    { insumo_nombre: 'Pote Impreso 500', cantidad: 1, unidad: 'u', costo_unitario: 125, costo_total: 125 },
  ]},
  { nombre: 'Bombon Chomp Granizado', costo_materiales: 2625.27, mano_de_obra: 570, ingredientes: [
    { insumo_nombre: 'Granizado', cantidad: 0.24, unidad: 'kg', costo_unitario: 5717.45, costo_total: 1372.19 },
    { insumo_nombre: 'Baño Stracciatella 56-78', cantidad: 0.08, unidad: 'kg', costo_unitario: 14101, costo_total: 1128.08 },
    { insumo_nombre: 'Pote Impreso 500', cantidad: 1, unidad: 'u', costo_unitario: 125, costo_total: 125 },
  ]},
  { nombre: 'Alfajor Americana', costo_materiales: 587.46, mano_de_obra: 228, ingredientes: [
    { insumo_nombre: 'Galletas Para Alfajor', cantidad: 2, unidad: 'u', costo_unitario: 25.50, costo_total: 51 },
    { insumo_nombre: 'Americana', cantidad: 0.055, unidad: 'kg', costo_unitario: 5052.70, costo_total: 277.90 },
    { insumo_nombre: 'Baño Stracciatella 56-78', cantidad: 0.015, unidad: 'kg', costo_unitario: 14101, costo_total: 211.52 },
    { insumo_nombre: 'Crocante Mani Almendra', cantidad: 0.005, unidad: 'kg', costo_unitario: 6110, costo_total: 30.55 },
    { insumo_nombre: 'Papel Manteca', cantidad: 1, unidad: 'u', costo_unitario: 10, costo_total: 10 },
    { insumo_nombre: 'Caja para postres grandes', cantidad: 1, unidad: 'u', costo_unitario: 6.50, costo_total: 6.50 },
  ]},
  { nombre: 'Alfajor Frutilla', costo_materiales: 651.67, mano_de_obra: 228, ingredientes: [
    { insumo_nombre: 'Galletas Para Alfajor', cantidad: 2, unidad: 'u', costo_unitario: 25.50, costo_total: 51 },
    { insumo_nombre: 'Frutilla crema', cantidad: 0.055, unidad: 'kg', costo_unitario: 6220.03, costo_total: 342.10 },
    { insumo_nombre: 'Baño Stracciatella 56-78', cantidad: 0.015, unidad: 'kg', costo_unitario: 14101, costo_total: 211.52 },
    { insumo_nombre: 'Crocante Mani Almendra', cantidad: 0.005, unidad: 'kg', costo_unitario: 6110, costo_total: 30.55 },
    { insumo_nombre: 'Papel Manteca', cantidad: 1, unidad: 'u', costo_unitario: 10, costo_total: 10 },
    { insumo_nombre: 'Caja para postres grandes', cantidad: 1, unidad: 'u', costo_unitario: 6.50, costo_total: 6.50 },
  ]},
  { nombre: 'Alfajor DDL', costo_materiales: 659.26, mano_de_obra: 228, ingredientes: [
    { insumo_nombre: 'Galletas Para Alfajor', cantidad: 2, unidad: 'u', costo_unitario: 25.50, costo_total: 51 },
    { insumo_nombre: 'DDL', cantidad: 0.055, unidad: 'kg', costo_unitario: 6358.03, costo_total: 349.69 },
    { insumo_nombre: 'Baño Stracciatella 56-78', cantidad: 0.015, unidad: 'kg', costo_unitario: 14101, costo_total: 211.52 },
    { insumo_nombre: 'Crocante Mani Almendra', cantidad: 0.005, unidad: 'kg', costo_unitario: 6110, costo_total: 30.55 },
    { insumo_nombre: 'Papel Manteca', cantidad: 1, unidad: 'u', costo_unitario: 10, costo_total: 10 },
    { insumo_nombre: 'Caja para postres grandes', cantidad: 1, unidad: 'u', costo_unitario: 6.50, costo_total: 6.50 },
  ]},
  { nombre: 'Barra Tricolor', costo_materiales: 11631.86, mano_de_obra: 912, ingredientes: [
    { insumo_nombre: 'Frutilla crema', cantidad: 0.475, unidad: 'kg', costo_unitario: 6220.03, costo_total: 2954.51 },
    { insumo_nombre: 'DDL', cantidad: 0.475, unidad: 'kg', costo_unitario: 6358.03, costo_total: 3020.06 },
    { insumo_nombre: 'Americana', cantidad: 0.475, unidad: 'kg', costo_unitario: 5052.70, costo_total: 2400.03 },
    { insumo_nombre: 'Baño Stracciatella 56-78', cantidad: 0.1, unidad: 'kg', costo_unitario: 14101, costo_total: 1410.10 },
    { insumo_nombre: 'Baño cobertura COBLE', cantidad: 0.01, unidad: 'kg', costo_unitario: 16314.76, costo_total: 163.15 },
    { insumo_nombre: 'DDL Repostero', cantidad: 0.02, unidad: 'kg', costo_unitario: 4200, costo_total: 84 },
    { insumo_nombre: 'Molde para Postre', cantidad: 1, unidad: 'u', costo_unitario: 1600, costo_total: 1600 },
  ]},
  { nombre: 'Pionono', costo_materiales: 11832.84, mano_de_obra: 570, ingredientes: [
    { insumo_nombre: 'Pionono (plancha)', cantidad: 1, unidad: 'u', costo_unitario: 600, costo_total: 600 },
    { insumo_nombre: 'Frutilla crema', cantidad: 0.541, unidad: 'kg', costo_unitario: 6220.03, costo_total: 3365.03 },
    { insumo_nombre: 'Chocolate', cantidad: 0.541, unidad: 'kg', costo_unitario: 8075.99, costo_total: 4369.11 },
    { insumo_nombre: 'DDL', cantidad: 0.541, unidad: 'kg', costo_unitario: 6358.03, costo_total: 3439.69 },
    { insumo_nombre: 'Papel para Pionono', cantidad: 1, unidad: 'u', costo_unitario: 59, costo_total: 59 },
  ]},
  { nombre: 'Helado Light', costo_materiales: 3748.76, mano_de_obra: 253.33, ingredientes: [
    { insumo_nombre: 'Pote Impreso 500', cantidad: 1, unidad: 'u', costo_unitario: 125, costo_total: 125 },
    { insumo_nombre: 'Americana Light', cantidad: 0.175, unidad: 'kg', costo_unitario: 6122.48, costo_total: 1071.43 },
    { insumo_nombre: 'Chocolate Light', cantidad: 0.175, unidad: 'kg', costo_unitario: 14584.71, costo_total: 2552.32 },
  ]},
  { nombre: 'Helado Vegano', costo_materiales: 4833.92, mano_de_obra: 253.33, ingredientes: [
    { insumo_nombre: 'Naranja', cantidad: 0.175, unidad: 'kg', costo_unitario: 6203.40, costo_total: 1085.60 },
    { insumo_nombre: 'Chocolate Vegano', cantidad: 0.175, unidad: 'kg', costo_unitario: 20704.73, costo_total: 3623.33 },
    { insumo_nombre: 'Pote Impreso 500', cantidad: 1, unidad: 'u', costo_unitario: 125, costo_total: 125 },
  ]},
  { nombre: 'Barra Almendrado', costo_materiales: 12062.84, mano_de_obra: 570, ingredientes: [
    { insumo_nombre: 'Almendrado', cantidad: 1.5, unidad: 'kg', costo_unitario: 6771.56, costo_total: 10157.34 },
    { insumo_nombre: 'Crocante Mani Almendra', cantidad: 0.05, unidad: 'kg', costo_unitario: 6110, costo_total: 305.50 },
    { insumo_nombre: 'Molde para Postre', cantidad: 1, unidad: 'u', costo_unitario: 1600, costo_total: 1600 },
  ]},
]

// PostgREST no permite DDL directo. Probamos una función RPC "exec_sql" si existe;
// si no, avisamos cómo crearla (o cómo crear las tablas a mano) y abortamos.
async function ensureTables() {
  const { error: rpcError } = await supabase.rpc('exec_sql', { sql: CREATE_TABLES_SQL })
  if (!rpcError) return

  const { error: checkError } = await supabase.from('impulsivos').select('id').limit(1)
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
    console.error('Luego volvé a correr: node --env-file=.env src/scripts/seedImpulsivos.js')
    process.exit(1)
  }
}

async function main() {
  await ensureTables()

  // Reseed: borramos impulsivos existentes con estos nombres (y sus ingredientes) para evitar duplicados
  const nombres = impulsivos.map(i => i.nombre)
  const { data: existentes, error: errExistentes } = await supabase
    .from('impulsivos')
    .select('id')
    .in('nombre', nombres)

  if (errExistentes) {
    console.error('Error al revisar impulsivos existentes:', errExistentes.message)
    console.error('Detalle:', errExistentes.details ?? errExistentes.hint ?? '')
    process.exit(1)
  }

  if (existentes && existentes.length > 0) {
    const idsExistentes = existentes.map(i => i.id)
    const { error: errDelIng } = await supabase.from('impulsivo_ingredientes').delete().in('impulsivo_id', idsExistentes)
    if (errDelIng) {
      console.error('Error al limpiar ingredientes existentes:', errDelIng.message)
      console.error('Detalle:', errDelIng.details ?? errDelIng.hint ?? '')
      process.exit(1)
    }
    const { error: errDelImpulsivos } = await supabase.from('impulsivos').delete().in('id', idsExistentes)
    if (errDelImpulsivos) {
      console.error('Error al limpiar impulsivos existentes:', errDelImpulsivos.message)
      console.error('Detalle:', errDelImpulsivos.details ?? errDelImpulsivos.hint ?? '')
      process.exit(1)
    }
  }

  const { data: impulsivosInsertados, error: errImpulsivos } = await supabase
    .from('impulsivos')
    .insert(impulsivos.map(({ nombre, costo_materiales, mano_de_obra }) => ({
      nombre,
      costo_materiales,
      mano_de_obra,
      costo_total: costo_materiales + mano_de_obra,
    })))
    .select('id, nombre')

  if (errImpulsivos) {
    console.error('Error al insertar impulsivos:', errImpulsivos.message)
    console.error('Detalle:', errImpulsivos.details ?? errImpulsivos.hint ?? '')
    process.exit(1)
  }

  const idPorNombre = Object.fromEntries(impulsivosInsertados.map(i => [i.nombre, i.id]))

  const ingredientes = []
  for (const impulsivo of impulsivos) {
    const impulsivoId = idPorNombre[impulsivo.nombre]
    if (!impulsivoId) {
      console.warn(`Impulsivo "${impulsivo.nombre}" no encontrado entre los insertados, se omiten sus ingredientes.`)
      continue
    }
    for (const ing of impulsivo.ingredientes) {
      ingredientes.push({
        impulsivo_id: impulsivoId,
        insumo_nombre: ing.insumo_nombre,
        cantidad: ing.cantidad,
        unidad: ing.unidad,
        costo_unitario: ing.costo_unitario,
        costo_total_ing: ing.costo_total,
      })
    }
  }

  let ingredientesInsertados = []
  if (ingredientes.length > 0) {
    const { data, error: errIng } = await supabase
      .from('impulsivo_ingredientes')
      .insert(ingredientes)
      .select('id')

    if (errIng) {
      console.error('Error al insertar ingredientes:', errIng.message)
      console.error('Detalle:', errIng.details ?? errIng.hint ?? '')
      process.exit(1)
    }
    ingredientesInsertados = data
  }

  console.log(`${impulsivosInsertados.length} impulsivos insertados, ${ingredientesInsertados.length} ingredientes insertados`)
}

main()
