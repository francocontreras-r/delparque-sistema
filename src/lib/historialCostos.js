// ════════════════════════════════════════════════════════════════════════════
// Historial de costos — captura la evolución del costo de la materia prima.
// El costo_unitario de un insumo se pisa en cada compra; sin esto se pierde la
// historia (y con inflación, esa historia ES el dato). Cada cambio real de costo
// se guarda en costos_historicos.
//
// DEGRADACIÓN SEGURA: si todavía no se corrió sql/costos_historicos.sql, las
// funciones no rompen nada (registrar no hace nada; cargar devuelve disponible:false).
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from './supabase'

function tablaFaltante(error) {
  if (!error) return false
  return error.code === '42P01' || /relation .* does not exist|could not find the table/i.test(error.message || '')
}

// Registra un cambio de costo SOLO si es real (varió y el nuevo es > 0).
// costoAnterior null/0 => primera carga (se guarda sin % de variación).
export async function registrarCambioCosto({ tipo = 'insumo', itemNombre, costoAnterior, costoNuevo, origen = 'compra' }) {
  const nuevo = Number(costoNuevo) || 0
  const anterior = costoAnterior == null ? null : (Number(costoAnterior) || 0)
  if (!(nuevo > 0) || !itemNombre) return { ok: false }
  // Sin cambio significativo → no ensuciamos el historial.
  if (anterior != null && anterior > 0 && Math.abs(nuevo - anterior) < 0.005) return { ok: false }
  const variacion = (anterior != null && anterior > 0) ? ((nuevo - anterior) / anterior * 100) : null
  try {
    const { error } = await supabase.from('costos_historicos').insert({
      tipo,
      item_nombre: itemNombre,
      costo_anterior: anterior,
      costo_nuevo: nuevo,
      variacion_pct: variacion == null ? null : Number(variacion.toFixed(2)),
      origen,
    })
    if (error && !tablaFaltante(error)) console.warn('registrarCambioCosto:', error.message)
    return { ok: !error }
  } catch (e) {
    console.warn('registrarCambioCosto:', e.message)
    return { ok: false }
  }
}

// Trae el historial (más reciente primero). Devuelve { disponible, rows }.
export async function cargarHistorialCostos({ desde = null, hasta = null, tipo = null } = {}) {
  try {
    let q = supabase.from('costos_historicos').select('*')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    if (desde) q = q.gte('fecha', desde)
    if (hasta) q = q.lte('fecha', hasta)
    if (tipo)  q = q.eq('tipo', tipo)
    const { data, error } = await q.limit(2000)
    if (error) {
      if (tablaFaltante(error)) return { disponible: false, rows: [] }
      throw error
    }
    return { disponible: true, rows: data || [] }
  } catch (e) {
    console.warn('cargarHistorialCostos:', e.message)
    return { disponible: false, rows: [] }
  }
}
