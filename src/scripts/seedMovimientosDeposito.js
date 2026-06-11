// Ejecutar con: node --env-file=.env src/scripts/seedMovimientosDeposito.js
// Requiere SUPABASE_SERVICE_KEY en .env (Settings → API → service_role key) para saltear RLS
import { createClient } from '@supabase/supabase-js'

const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!process.env.SUPABASE_SERVICE_KEY) {
  console.warn('Aviso: SUPABASE_SERVICE_KEY no está definida en .env, se usará VITE_SUPABASE_ANON_KEY (puede fallar si hay RLS activo).')
}
const supabase = createClient(process.env.VITE_SUPABASE_URL, key)

const movimientos = [
  { tipo:'egreso', fecha:'2026-06-01', producto_nombre:'Arandanos xkg', marca:'Fresh', presentacion:'Bolsa', cantidad:1, unidad:'u', lote:'L01986FA', fecha_vencimiento:'2027-10-30', controlo:'Valle', operario_recibe:'Omar (Reparto)' },
  { tipo:'egreso', fecha:'2026-06-01', producto_nombre:'Frambuesa x250gr', marca:'Fresh', presentacion:'Bolsa', cantidad:2, unidad:'u', lote:'L02122FB', fecha_vencimiento:'2027-10-30', controlo:'Valle', operario_recibe:'Omar (Reparto)' },
  { tipo:'egreso', fecha:'2026-06-01', producto_nombre:'Cereza x3.1kg', marca:'Carleti', presentacion:'Lata', cantidad:2, unidad:'u', lote:'532', fecha_vencimiento:'2028-04-30', controlo:'Valle', operario_recibe:'Omar (Reparto)' },
  { tipo:'egreso', fecha:'2026-06-01', producto_nombre:'Chocolinas x250gr', marca:'Bagley', presentacion:'Bolsa', cantidad:50, unidad:'u', lote:'14323', fecha_vencimiento:'2026-11-06', controlo:'Valle', operario_recibe:'Omar (Reparto)' },
  { tipo:'egreso', fecha:'2026-06-01', producto_nombre:'Dulce de Leche Repostero x10kg', marca:'El Nativo', presentacion:'Balde', cantidad:2, unidad:'u', lote:'089-31 300203', fecha_vencimiento:'2026-09-26', controlo:'Valle', operario_recibe:'Omar (Reparto)' },
  { tipo:'egreso', fecha:'2026-06-04', producto_nombre:'Crocante de Mani x1kg', marca:'Caviwa', presentacion:'Bolsa', cantidad:6, unidad:'u', lote:'37', fecha_vencimiento:'2026-08-06', controlo:'Valle', operario_recibe:'Claudia Carrizo' },
  { tipo:'egreso', fecha:'2026-06-04', producto_nombre:'Queso Crema x4kg', marca:'La Paulina', presentacion:'Bolsa', cantidad:2, unidad:'u', lote:'RAP6122007', fecha_vencimiento:'2026-08-30', controlo:'Valle', operario_recibe:'Omar (Reparto)' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Cereza x3.1kg', marca:'Carleti', presentacion:'Lata', cantidad:4, unidad:'u', lote:'532', fecha_vencimiento:'2028-04-30', controlo:'Valle', operario_recibe:'Omar (Reparto)' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Crema de Leche x5kg', marca:'Ramolac', presentacion:'Balde', cantidad:24, unidad:'u', lote:'212', fecha_vencimiento:'2026-07-15', controlo:'Valle', operario_recibe:'Nico Bunda' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Leche en polvo x25kg', marca:'Molfino', presentacion:'Bolsa', cantidad:4, unidad:'u', lote:'7904', fecha_vencimiento:'2028-02-26', controlo:'Valle', operario_recibe:'Nico Bunda' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Azucar x50kg', marca:'La Florido', presentacion:'Bolsa', cantidad:2, unidad:'u', lote:'2025', fecha_vencimiento:'2028-07-31', controlo:'Valle', operario_recibe:'Nico Bunda' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Dextrosa x25kg', marca:'Hylen', presentacion:'Bolsa', cantidad:1, unidad:'u', lote:'10069946-3', fecha_vencimiento:'2027-02-02', controlo:'Valle', operario_recibe:'Nico Bunda' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'DPO Master 50C x2kg', marca:'Aromitalia', presentacion:'Bolsa', cantidad:32, unidad:'u', lote:'260649020', fecha_vencimiento:'2028-09-30', controlo:'Valle', operario_recibe:'Nico Bunda' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'COBB Blanco x5kg', marca:'Mapsa', presentacion:'Bolsa', cantidad:1, unidad:'u', lote:'86520R', fecha_vencimiento:'2027-04-20', controlo:'Valle', operario_recibe:'Nico Bunda' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Pasta Chocolate Blanco x3.5kg', marca:'Aromitalia', presentacion:'Balde', cantidad:2, unidad:'u', lote:'252572012', fecha_vencimiento:'2028-05-30', controlo:'Valle', operario_recibe:'Nico Bunda' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Fructosoft x3kg', marca:'Aromitalia', presentacion:'Bolsa', cantidad:4, unidad:'u', lote:'252893141', fecha_vencimiento:'2028-06-30', controlo:'Valle', operario_recibe:'Nico Bunda' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Dulce de Leche Heladero x10kg', marca:'San Ignacio', presentacion:'Balde', cantidad:8, unidad:'u', lote:'042-42 300167', fecha_vencimiento:'2026-11-08', controlo:'Valle', operario_recibe:'Nico Bunda' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Dulce de Leche Suave x10kg', marca:'San Ignacio', presentacion:'Balde', cantidad:7, unidad:'u', lote:'356-32 300389', fecha_vencimiento:'2026-07-20', controlo:'Valle', operario_recibe:'Nico Bunda' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Mielina x10kg', marca:'Aromitalia', presentacion:'Balde', cantidad:1, unidad:'u', lote:'260097003', fecha_vencimiento:'2026-01-30', controlo:'Valle', operario_recibe:'Nico Bunda' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'COBB Amargo x5kg', marca:'Mapsa', presentacion:'Bolsa', cantidad:2, unidad:'u', lote:'85960R', fecha_vencimiento:'2027-02-20', controlo:'Valle', operario_recibe:'Nico Bunda' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Cacao Heladero 22/24 x2.5kg', marca:'Aromitalia', presentacion:'Bolsa', cantidad:4, unidad:'u', lote:'240600333', fecha_vencimiento:'2027-12-31', controlo:'Valle', operario_recibe:'Nico Bunda' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Pasta Frutilla x4kg', marca:'Aromitalia', presentacion:'Balde', cantidad:1, unidad:'u', lote:'260354014', fecha_vencimiento:'2028-07-30', controlo:'Valle', operario_recibe:'Natalia Diaz' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Frutilla para Sembrar x4.3kg', marca:'MendoCor', presentacion:'Lata', cantidad:8, unidad:'u', lote:'26/2/26', fecha_vencimiento:'2027-02-26', controlo:'Valle', operario_recibe:'Natalia Diaz' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Kinder picado xkg', marca:'Elaboracion Propia', presentacion:'Balde', cantidad:3.48, unidad:'u', lote:null, fecha_vencimiento:null, controlo:'Valle', operario_recibe:'Natalia Diaz' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Dulce de Leche para Sembrar x10kg', marca:'San Ignacio', presentacion:'Balde', cantidad:1, unidad:'u', lote:'006-32 300266', fecha_vencimiento:'2026-07-05', controlo:'Valle', operario_recibe:'Natalia Diaz' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Rhum x720ml', marca:'La Negrita', presentacion:'Botella', cantidad:1, unidad:'u', lote:null, fecha_vencimiento:null, controlo:'Valle', operario_recibe:'Natalia Diaz' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Pasta Chantilly x4kg', marca:'Aromitalia', presentacion:'Balde', cantidad:2, unidad:'u', lote:'260810011', fecha_vencimiento:'2028-09-30', controlo:'Valle', operario_recibe:'Natalia Diaz' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Stracciatella x10kg', marca:'Mapricoa', presentacion:'Balde', cantidad:3, unidad:'u', lote:'7950', fecha_vencimiento:'2027-03-30', controlo:'Valle', operario_recibe:'Natalia Diaz' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Cremix x3kg', marca:'Aromitalia', presentacion:'Bolsa', cantidad:1, unidad:'u', lote:'251638004', fecha_vencimiento:'2028-01-30', controlo:'Valle', operario_recibe:'Nico Bunda' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Amoretta Dubai x4kg', marca:'Aromitalia', presentacion:'Balde', cantidad:1, unidad:'u', lote:'252731017', fecha_vencimiento:'2028-03-30', controlo:'Valle', operario_recibe:'Nico Bunda' },
  { tipo:'egreso', fecha:'2026-06-05', producto_nombre:'Amoretta Pistacho x4kg', marca:'Aromitalia', presentacion:'Balde', cantidad:2, unidad:'u', lote:'252015009', fecha_vencimiento:'2028-03-30', controlo:'Valle', operario_recibe:'Nico Bunda' },
]

function claveMov(m) {
  return [m.tipo, m.fecha, m.producto_nombre, m.lote ?? '', m.cantidad].join('|')
}

async function main() {
  const fechas = movimientos.map(m => m.fecha).sort()
  const desde = fechas[0]
  const hasta = fechas[fechas.length - 1]

  const { data: existentes, error: errCheck } = await supabase
    .from('movimientos_deposito')
    .select('tipo,fecha,producto_nombre,lote,cantidad')
    .gte('fecha', desde)
    .lte('fecha', hasta)

  if (errCheck) {
    console.error('Error al revisar movimientos existentes:', errCheck.message)
    console.error('Detalle:', errCheck.details ?? errCheck.hint ?? '')
    process.exit(1)
  }

  const clavesExistentes = new Set((existentes || []).map(claveMov))
  const nuevos = movimientos.filter(m => !clavesExistentes.has(claveMov(m)))
  const omitidos = movimientos.length - nuevos.length

  if (nuevos.length === 0) {
    console.log(`No hay registros nuevos para insertar (los ${movimientos.length} ya existen en movimientos_deposito).`)
    return
  }

  const payload = nuevos.map(m => ({
    tipo: m.tipo,
    fecha: m.fecha,
    producto_nombre: m.producto_nombre,
    marca: m.marca ?? null,
    presentacion: m.presentacion ?? null,
    cantidad: m.cantidad,
    unidad: m.unidad ?? 'kg',
    lote: m.lote ?? null,
    fecha_vencimiento: m.fecha_vencimiento ?? null,
    proveedor: m.tipo === 'ingreso' ? (m.proveedor ?? null) : null,
    controlo: m.controlo ?? null,
    destino: m.tipo === 'egreso' ? (m.destino ?? null) : null,
    operario_recibe: m.tipo === 'egreso' ? (m.operario_recibe ?? null) : null,
    observaciones: m.observaciones ?? null,
  }))

  const { data, error } = await supabase
    .from('movimientos_deposito')
    .insert(payload)
    .select('id')

  if (error) {
    console.error('Error al insertar:', error.message)
    console.error('Detalle:', error.details ?? error.hint ?? '')
    process.exit(1)
  }

  console.log(`Insertados ${data.length} movimientos en movimientos_deposito.${omitidos > 0 ? ` (${omitidos} ya existían y se omitieron)` : ''}`)
}

main()
