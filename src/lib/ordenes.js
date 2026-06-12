import { supabase } from './supabase'

export const ESTADO_EN_PROCESO = 'en_proceso'
export const ESTADO_COMPLETADA = 'completada'

export function pctCompletitud(kgProducido, kgObjetivo) {
  if (!kgObjetivo || kgObjetivo <= 0) return 0
  return (kgProducido / kgObjetivo) * 100
}

export function progresoColor(pct, colors) {
  if ((pct || 0) >= 95) return colors.success
  if ((pct || 0) >= 50) return colors.warning
  return colors.danger
}

// Cuando una orden se finaliza (manual o automáticamente al alcanzar el 95%),
// se registra un movimiento en "mermas" con el resultado de la producción
// (diferencia entre lo planificado y lo producido) para mantener trazabilidad.
export async function registrarMermaAutomatica(orden, kgProducidoFinal) {
  console.log('registrarMermaAutomatica → orden:', orden.numero, 'kgProducidoFinal:', kgProducidoFinal)
  const kgObjetivo = orden.kg_objetivo || 0
  if (kgObjetivo <= 0) {
    console.log('registrarMermaAutomatica → orden sin kg_objetivo, no se registra merma')
    return { error: null }
  }
  const diferencia = kgObjetivo - kgProducidoFinal
  const porcentaje = (diferencia / kgObjetivo) * 100
  console.log('registrarMermaAutomatica → kg_objetivo:', kgObjetivo, 'diferencia:', diferencia, 'porcentaje:', porcentaje)

  const payload = {
    fecha: new Date().toISOString().split('T')[0],
    sabor_nombre: orden.sabor_nombre || orden.producto_nombre,
    operario_nombre: orden.operario_nombre || null,
    kg_teoricos: kgObjetivo,
    kg_reales: kgProducidoFinal,
    diferencia,
    porcentaje,
    causa: 'Producción finalizada - registro automático',
    observaciones: `Orden ${orden.numero}`,
  }
  console.log('registrarMermaAutomatica → insertando en mermas:', payload)
  const { error } = await supabase.from('mermas').insert(payload)
  if (error) {
    console.error('registrarMermaAutomatica → error al insertar:', error)
    return { error }
  }
  console.log('registrarMermaAutomatica → merma registrada correctamente')
  return { error: null }
}

export async function aplicarProduccionAOrden(orden, kgIncremento) {
  const kgObjetivo = orden.kg_objetivo || 0
  const kgProducido = (orden.kg_producido || 0) + kgIncremento
  const pct = pctCompletitud(kgProducido, kgObjetivo)
  const nuevoEstado = pct >= 95 ? ESTADO_COMPLETADA : orden.estado

  const update = {
    kg_producido: kgProducido,
    porcentaje_completitud: pct,
    estado: nuevoEstado,
  }
  if (nuevoEstado === ESTADO_COMPLETADA && orden.estado !== ESTADO_COMPLETADA) {
    update.fecha_fin = new Date().toISOString().split('T')[0]
  }

  const { error } = await supabase.from('ordenes_produccion').update(update).eq('id', orden.id)
  if (error) return { error }

  let mermaError = null
  if (nuevoEstado === ESTADO_COMPLETADA && orden.estado !== ESTADO_COMPLETADA) {
    const resultado = await registrarMermaAutomatica(orden, kgProducido)
    mermaError = resultado.error
  }
  return { kgProducido, pct, estado: nuevoEstado, mermaError }
}

export async function finalizarOrdenManual(orden) {
  const kgObjetivo = orden.kg_objetivo || 0
  const kgProducido = orden.kg_producido || 0
  const pct = pctCompletitud(kgProducido, kgObjetivo)

  const update = {
    estado: ESTADO_COMPLETADA,
    porcentaje_completitud: pct,
  }
  if (orden.estado !== ESTADO_COMPLETADA) {
    update.fecha_fin = new Date().toISOString().split('T')[0]
  }

  const { error } = await supabase.from('ordenes_produccion').update(update).eq('id', orden.id)
  if (error) return { error }

  const { error: mermaError } = await registrarMermaAutomatica(orden, kgProducido)
  return { pct, mermaError }
}
