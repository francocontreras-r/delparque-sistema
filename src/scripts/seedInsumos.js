// Ejecutar con: node --env-file=.env src/scripts/seedInsumos.js
// Requiere SUPABASE_SERVICE_KEY en .env (Settings → API → service_role key) para saltear RLS
import { createClient } from '@supabase/supabase-js'

const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!process.env.SUPABASE_SERVICE_KEY) {
  console.warn('Aviso: SUPABASE_SERVICE_KEY no está definida en .env, se usará VITE_SUPABASE_ANON_KEY (puede fallar si hay RLS activo).')
}
const supabase = createClient(process.env.VITE_SUPABASE_URL, key)

const insumos = [
  { nombre:'Azucar', categoria:'BASES', unidad:'kg', stock_actual:450, stock_minimo:100 },
  { nombre:'DPO Master 50 SE', categoria:'BASES', unidad:'kg', stock_actual:0, stock_minimo:8 },
  { nombre:'Cacao 2224', categoria:'BASES', unidad:'kg', stock_actual:12.5, stock_minimo:10 },
  { nombre:'Coco Rallado', categoria:'BASES', unidad:'kg', stock_actual:25, stock_minimo:5 },
  { nombre:'Cremix', categoria:'BASES', unidad:'kg', stock_actual:6, stock_minimo:6 },
  { nombre:'Dextroza', categoria:'BASES', unidad:'kg', stock_actual:175, stock_minimo:50 },
  { nombre:'Fructosoft', categoria:'BASES', unidad:'kg', stock_actual:4, stock_minimo:4 },
  { nombre:'Mielina', categoria:'BASES', unidad:'kg', stock_actual:10, stock_minimo:8 },
  { nombre:'Estabilizador de Cereza', categoria:'BASES', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Estabilizador de vainilla', categoria:'BASES', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Pronto Senza Cacao', categoria:'BASES', unidad:'kg', stock_actual:0, stock_minimo:3 },
  { nombre:'Pronto SENZA Chantilli', categoria:'BASES', unidad:'kg', stock_actual:0, stock_minimo:3 },
  { nombre:'Queso Crema', categoria:'BASES', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'LPE', categoria:'BASES', unidad:'kg', stock_actual:0, stock_minimo:50 },
  { nombre:'Crema de Leche', categoria:'BASES', unidad:'kg', stock_actual:25, stock_minimo:20 },
  { nombre:'Jugo de Limon', categoria:'BASES', unidad:'L', stock_actual:28, stock_minimo:5 },
  { nombre:'Chocolate Black', categoria:'BASES', unidad:'kg', stock_actual:12, stock_minimo:6 },
  { nombre:'Vino Marsala', categoria:'BEBIDAS', unidad:'L', stock_actual:540, stock_minimo:20 },
  { nombre:'Whisky', categoria:'BEBIDAS', unidad:'L', stock_actual:15, stock_minimo:5 },
  { nombre:'Rhum', categoria:'BEBIDAS', unidad:'L', stock_actual:0, stock_minimo:2 },
  { nombre:'Chocolate granulado blanco', categoria:'CHOCOLATE', unidad:'kg', stock_actual:1, stock_minimo:2 },
  { nombre:'Cobertura Amarga 99', categoria:'COBERTURA', unidad:'kg', stock_actual:20, stock_minimo:10 },
  { nombre:'Chocolate cobertura Blanco', categoria:'COBERTURA', unidad:'kg', stock_actual:5, stock_minimo:5 },
  { nombre:'Granizado SupLay', categoria:'COBERTURA', unidad:'kg', stock_actual:0, stock_minimo:10 },
  { nombre:'DDL Heladero Suave', categoria:'DULCE DE LECHE', unidad:'kg', stock_actual:150, stock_minimo:50 },
  { nombre:'DDL Heladero', categoria:'DULCE DE LECHE', unidad:'kg', stock_actual:160, stock_minimo:50 },
  { nombre:'DDL para sembrar', categoria:'DULCE DE LECHE', unidad:'kg', stock_actual:0, stock_minimo:20 },
  { nombre:'DDL con rhum', categoria:'DULCE DE LECHE', unidad:'kg', stock_actual:0, stock_minimo:10 },
  { nombre:'Almendra', categoria:'FRUTOS SECOS', unidad:'kg', stock_actual:5, stock_minimo:10 },
  { nombre:'Nuez', categoria:'FRUTOS SECOS', unidad:'kg', stock_actual:2.296, stock_minimo:5 },
  { nombre:'Pistacho X Kg', categoria:'FRUTOS SECOS', unidad:'kg', stock_actual:3.144, stock_minimo:5 },
  { nombre:'Crocante Mani Almendra', categoria:'FRUTOS SECOS', unidad:'kg', stock_actual:24, stock_minimo:5 },
  { nombre:'Mani', categoria:'FRUTOS SECOS', unidad:'kg', stock_actual:16.768, stock_minimo:5 },
  { nombre:'Alcayota', categoria:'LATAS Y PULPAS', unidad:'kg', stock_actual:20, stock_minimo:5 },
  { nombre:'Arandanos', categoria:'LATAS Y PULPAS', unidad:'kg', stock_actual:14, stock_minimo:5 },
  { nombre:'Canela en rama', categoria:'LATAS Y PULPAS', unidad:'kg', stock_actual:4, stock_minimo:2 },
  { nombre:'Cereza partidas', categoria:'LATAS Y PULPAS', unidad:'kg', stock_actual:30, stock_minimo:5 },
  { nombre:'Frutilla natural', categoria:'LATAS Y PULPAS', unidad:'kg', stock_actual:14, stock_minimo:10 },
  { nombre:'Anana Rodajas', categoria:'LATAS Y PULPAS', unidad:'kg', stock_actual:23.35, stock_minimo:5 },
  { nombre:'Durazno para sembrar', categoria:'LATAS Y PULPAS', unidad:'kg', stock_actual:31.66, stock_minimo:5 },
  { nombre:'Quinotos', categoria:'LATAS Y PULPAS', unidad:'kg', stock_actual:35, stock_minimo:5 },
  { nombre:'Higos', categoria:'LATAS Y PULPAS', unidad:'kg', stock_actual:40, stock_minimo:5 },
  { nombre:'Frutilla para sembrar', categoria:'LATAS Y PULPAS', unidad:'kg', stock_actual:0, stock_minimo:10 },
  { nombre:'Frambuesa', categoria:'LATAS Y PULPAS', unidad:'kg', stock_actual:4, stock_minimo:3 },
  { nombre:'Moras', categoria:'LATAS Y PULPAS', unidad:'kg', stock_actual:0, stock_minimo:3 },
  { nombre:'Mix Frutos Tucumanos', categoria:'LATAS Y PULPAS', unidad:'kg', stock_actual:18, stock_minimo:5 },
  { nombre:'Alfajor (Plancha)', categoria:'PANADERIA', unidad:'u', stock_actual:0, stock_minimo:10 },
  { nombre:'Brownie Panaderia', categoria:'PANADERIA', unidad:'u', stock_actual:0, stock_minimo:5 },
  { nombre:'Chocolate kinder', categoria:'PANADERIA', unidad:'kg', stock_actual:15.52, stock_minimo:5 },
  { nombre:'Pionono', categoria:'PANADERIA', unidad:'kg', stock_actual:2.576, stock_minimo:2 },
  { nombre:'Almendra caramelizada', categoria:'PANADERIA Y SEMBRADO', unidad:'kg', stock_actual:27.792, stock_minimo:5 },
  { nombre:'Chocolinas', categoria:'PANADERIA Y SEMBRADO', unidad:'kg', stock_actual:30.25, stock_minimo:5 },
  { nombre:'Oreo', categoria:'PANADERIA Y SEMBRADO', unidad:'kg', stock_actual:48.6, stock_minimo:5 },
  { nombre:'Microgalletas', categoria:'PANADERIA Y SEMBRADO', unidad:'kg', stock_actual:50, stock_minimo:5 },
  { nombre:'Acido Limon', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:32, stock_minimo:5 },
  { nombre:'Acido Naranja', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:12, stock_minimo:4 },
  { nombre:'Pasta Mapcol', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:8, stock_minimo:4 },
  { nombre:'Veteado mapcol', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:4, stock_minimo:4 },
  { nombre:'Pasta Anana', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:8, stock_minimo:4 },
  { nombre:'Pasta Bananita', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:4, stock_minimo:4 },
  { nombre:'Pasta Caramelo Salado', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:8, stock_minimo:4 },
  { nombre:'Pasta Cereza', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:14, stock_minimo:4 },
  { nombre:'Pasta chantilly', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:4, stock_minimo:4 },
  { nombre:'Pasta chocolate cobertura blanco', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:35, stock_minimo:4 },
  { nombre:'Pasta coco', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:10.5, stock_minimo:4 },
  { nombre:'Pasta Crema whisky', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:4, stock_minimo:4 },
  { nombre:'Pasta Durazno', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:16, stock_minimo:4 },
  { nombre:'Pasta frutilla', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:4, stock_minimo:4 },
  { nombre:'Pasta frutos del bosque', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:32, stock_minimo:4 },
  { nombre:'Pasta limon', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:8, stock_minimo:4 },
  { nombre:'Pasta Manzana Verde', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:12, stock_minimo:4 },
  { nombre:'Pasta menta', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:24, stock_minimo:4 },
  { nombre:'Pasta naranja', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:20, stock_minimo:4 },
  { nombre:'Pasta Pistakion', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:10.5, stock_minimo:4 },
  { nombre:'Pasta Sambayon', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:8, stock_minimo:4 },
  { nombre:'Pasta Vainilla', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:4, stock_minimo:4 },
  { nombre:'Veteado Frutos del Bosque', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:9, stock_minimo:4 },
  { nombre:'Veteado tarta manzana', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:4, stock_minimo:4 },
  { nombre:'Veteado whisky', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:4, stock_minimo:4 },
  { nombre:'Pasta rusa', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:14, stock_minimo:4 },
  { nombre:'Pasta Frambuesa', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:4, stock_minimo:4 },
  { nombre:'Veteado Frambuesa', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:12, stock_minimo:4 },
  { nombre:'Amoretta Dubai', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Amoretta Pistacho', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:20, stock_minimo:4 },
  { nombre:'Veteado Ovo King', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:24.5, stock_minimo:4 },
  { nombre:'Stracciatella', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Veteado Bananita', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Veteado Rocher', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Pasta Almendra', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Pasta lemon pie', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Veteado lemon pie', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Acido lemon pie', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Pasta malaga', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Veteado malaga', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Pasta tarta manzana', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Pasta maracuya', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Veteado maracuya', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Pasta pomelo', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Pasta tiramisu', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Pasta rocher', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Pasta banana', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Pasta Mascarpone', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Pasta mantecol', categoria:'PASTAS Y VARIEGATTOS', unidad:'kg', stock_actual:0, stock_minimo:4 },
  { nombre:'Polvo Flan', categoria:'BASES', unidad:'kg', stock_actual:0, stock_minimo:5 },
  { nombre:'Protomilk', categoria:'PRUEBA', unidad:'kg', stock_actual:9, stock_minimo:0 },
]

async function main() {
  const { data: existentes, error: errFetch } = await supabase.from('insumos').select('id, nombre')
  if (errFetch) {
    console.error('Error consultando insumos existentes:', errFetch.message)
    console.error('Detalle:', errFetch.details ?? errFetch.hint ?? '')
    process.exit(1)
  }

  const idPorNombre = new Map(existentes.map(i => [i.nombre.trim().toLowerCase(), i.id]))

  const aActualizar = []
  const aInsertar = []
  for (const ins of insumos) {
    const id = idPorNombre.get(ins.nombre.trim().toLowerCase())
    if (id) aActualizar.push({ id, ...ins })
    else aInsertar.push(ins)
  }

  if (aActualizar.length > 0) {
    const { error } = await supabase.from('insumos').upsert(aActualizar, { onConflict: 'id' })
    if (error) {
      console.error('Error actualizando insumos:', error.message)
      console.error('Detalle:', error.details ?? error.hint ?? '')
      process.exit(1)
    }
  }

  if (aInsertar.length > 0) {
    const { error } = await supabase.from('insumos').insert(aInsertar)
    if (error) {
      console.error('Error insertando insumos nuevos:', error.message)
      console.error('Detalle:', error.details ?? error.hint ?? '')
      process.exit(1)
    }
  }

  console.log(`Listo: ${aActualizar.length} insumos actualizados, ${aInsertar.length} insumos nuevos insertados (total ${insumos.length}).`)
}

main()
