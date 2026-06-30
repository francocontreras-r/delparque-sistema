// ════════════════════════════════════════════════════════════════════════════
// Etapas de producción — helpers compartidos
// Modela el proceso multi-etapa de postres/impulsivos y mide el tiempo ACTIVO
// del operario contra un estándar, separando la espera de proceso (abatidor).
//
// DEGRADACIÓN SEGURA: si todavía no se corrió sql/etapas_produccion.sql, todas
// las funciones devuelven { disponible: false } y la app sigue funcionando.
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from './supabase'

// Config por defecto si la tabla producto_etapas está vacía (mismos valores que
// la semilla del SQL). Permite previsualizar el flujo antes de personalizar.
export const ETAPAS_DEFAULT = {
  postre: [
    { etapa_orden: 1, etapa_nombre: 'Moldeado',          es_activa: true,  estandar_min_unidad: 0.75 },
    { etapa_orden: 2, etapa_nombre: 'Abatidor / Cámara', es_activa: false, estandar_min_unidad: 0 },
    { etapa_orden: 3, etapa_nombre: 'Desmolde',          es_activa: true,  estandar_min_unidad: 0.5 },
    { etapa_orden: 4, etapa_nombre: 'Baño',              es_activa: true,  estandar_min_unidad: 0.375 },
    { etapa_orden: 5, etapa_nombre: 'Decoración',        es_activa: true,  estandar_min_unidad: 0.55 },
  ],
  impulsivo: [
    { etapa_orden: 1, etapa_nombre: 'Elaboración',       es_activa: true,  estandar_min_unidad: 0.4 },
    { etapa_orden: 2, etapa_nombre: 'Abatidor / Cámara', es_activa: false, estandar_min_unidad: 0 },
    { etapa_orden: 3, etapa_nombre: 'Empaque',           es_activa: true,  estandar_min_unidad: 0.25 },
  ],
}

// Un producto se mide en unidades (y por ende lleva etapas) si es postre o impulsivo.
export const usaEtapas = tipo => tipo === 'postre' || tipo === 'impulsivo'

// Error típico de "tabla inexistente" en PostgREST/Postgres.
function tablaFaltante(error) {
  if (!error) return false
  return error.code === '42P01' || /relation .* does not exist|could not find the table/i.test(error.message || '')
}

// Trae la config de etapas para un tipo de producto (con override por nombre si
// existe). Devuelve { disponible, etapas } — cae a los defaults si la tabla está
// vacía, y a { disponible:false } si la tabla no existe todavía.
export async function cargarConfigEtapas(tipoProducto, productoNombre = null) {
  const fallback = ETAPAS_DEFAULT[tipoProducto] || []
  try {
    const { data, error } = await supabase
      .from('producto_etapas')
      .select('*')
      .eq('tipo_producto', tipoProducto)
      .eq('activo', true)
      .order('etapa_orden')
    if (error) {
      if (tablaFaltante(error)) return { disponible: false, etapas: fallback }
      throw error
    }
    const propias = (data || []).filter(e => (e.producto_nombre || '').toUpperCase() === (productoNombre || '').toUpperCase())
    const generales = (data || []).filter(e => !e.producto_nombre)
    const etapas = (propias.length > 0 ? propias : generales)
    return { disponible: true, etapas: etapas.length > 0 ? etapas : fallback }
  } catch (e) {
    console.warn('cargarConfigEtapas:', e.message)
    return { disponible: false, etapas: fallback }
  }
}

// Trae las etapas registradas de una orden.
export async function cargarEtapasOrden(ordenId) {
  try {
    const { data, error } = await supabase
      .from('orden_etapas')
      .select('*')
      .eq('orden_id', ordenId)
      .order('etapa_orden')
    if (error) {
      if (tablaFaltante(error)) return { disponible: false, etapas: [] }
      throw error
    }
    return { disponible: true, etapas: data || [] }
  } catch (e) {
    console.warn('cargarEtapasOrden:', e.message)
    return { disponible: false, etapas: [] }
  }
}

// Crea las filas de etapas de una orden a partir de la config (si aún no existen).
// El estándar se fotografía: estandar_min = estandar_min_unidad × unidades.
export async function crearEtapasOrden(orden) {
  const tipo = orden.tipo_producto
  const unidades = Number(orden.cantidad_unidades) || 0
  const { disponible, etapas: cfg } = await cargarConfigEtapas(tipo, orden.sabor_nombre || orden.producto_nombre)
  if (!disponible) return { disponible: false, etapas: [] }
  const activas = cfg.filter(e => e.es_activa).map(e => e.etapa_orden)
  const ultimaActiva = activas.length ? Math.max(...activas) : null
  const filas = cfg.map(e => ({
    orden_id: orden.id,
    orden_numero: orden.numero || null,
    tipo_producto: tipo,
    etapa_orden: e.etapa_orden,
    etapa_nombre: e.etapa_nombre,
    es_activa: e.es_activa,
    es_cierre: e.es_activa && e.etapa_orden === ultimaActiva,
    unidades,
    estandar_min: e.es_activa ? Math.round((Number(e.estandar_min_unidad) || 0) * unidades * 100) / 100 : 0,
  }))
  const { data, error } = await supabase.from('orden_etapas').insert(filas).select().order('etapa_orden')
  if (error) {
    if (tablaFaltante(error)) return { disponible: false, etapas: [] }
    throw error
  }
  return { disponible: true, etapas: data || [] }
}

// Inicia una etapa: marca operario + hora de inicio.
export async function iniciarEtapa(etapaId, operarioNombre, fecha = null) {
  const inicio = fecha || new Date().toISOString()
  const { data, error } = await supabase
    .from('orden_etapas')
    .update({ operario_nombre: operarioNombre, inicio })
    .eq('id', etapaId).select().maybeSingle()
  if (error) throw error
  return data
}

// Finaliza una etapa: marca fin y calcula el tiempo real en minutos.
export async function finalizarEtapa(etapa, fecha = null) {
  const fin = fecha || new Date().toISOString()
  const tiempoMin = etapa.inicio ? Math.max(0, (new Date(fin) - new Date(etapa.inicio)) / 60000) : null
  const { data, error } = await supabase
    .from('orden_etapas')
    .update({ fin, tiempo_min: tiempoMin != null ? Math.round(tiempoMin * 10) / 10 : null })
    .eq('id', etapa.id).select().maybeSingle()
  if (error) throw error
  return data
}

// ── Cálculos de tiempo / eficiencia ─────────────────────────────────────────
export const esperaDe   = etapas => etapas.filter(e => !e.es_activa && e.tiempo_min != null).reduce((a, e) => a + Number(e.tiempo_min), 0)
export const activoDe    = etapas => etapas.filter(e => e.es_activa  && e.fin && e.tiempo_min != null).reduce((a, e) => a + Number(e.tiempo_min), 0)
export const estandarDe  = etapas => etapas.filter(e => e.es_activa  && e.fin).reduce((a, e) => a + (Number(e.estandar_min) || 0), 0)

export function eficienciaDe(etapas) {
  const real = activoDe(etapas)
  const std  = estandarDe(etapas)
  if (real <= 0 || std <= 0) return null
  return Math.round((std / real) * 100)
}

// Lead time (ciclo) en minutos: de la primera etapa iniciada a la última finalizada.
export function leadTimeDe(etapas) {
  const inicios = etapas.filter(e => e.inicio).map(e => new Date(e.inicio).getTime())
  const fines   = etapas.filter(e => e.fin).map(e => new Date(e.fin).getTime())
  if (!inicios.length || !fines.length) return null
  return Math.max(0, (Math.max(...fines) - Math.min(...inicios)) / 60000)
}

// "1 h 09 m" / "35 min"
export function fmtMin(min) {
  if (min == null) return '—'
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`
}
