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

// Horas reales transcurridas entre el inicio y el fin de una orden.
export function calcularHorasReales(fechaInicio, fechaFin) {
  if (!fechaInicio || !fechaFin) return 0
  const inicio = new Date(fechaInicio).getTime()
  const fin = new Date(fechaFin).getTime()
  if (isNaN(inicio) || isNaN(fin) || fin <= inicio) return 0
  return (fin - inicio) / (1000 * 60 * 60)
}

// Producción sin kg_objetivo (p.ej. impulsivos) no se penaliza: rinde 100%.
export function calcularEficienciaKg(kgProducido, kgObjetivo) {
  if (!kgObjetivo || kgObjetivo <= 0) return 100
  return (kgProducido / kgObjetivo) * 100
}

// Sin tiempo estimado o sin datos de inicio/fin no se penaliza: rinde 100%.
export function calcularEficienciaTiempo(horasEstimadas, horasReales) {
  if (!horasEstimadas || horasEstimadas <= 0) return 100
  if (!horasReales || horasReales <= 0) return 100
  return (horasEstimadas / horasReales) * 100
}

export function calcularRendimientoFinal(eficienciaKg, eficienciaTiempo) {
  return (eficienciaKg || 0) * 0.6 + (eficienciaTiempo || 0) * 0.4
}

export function eficienciaColor(pct, colors) {
  if ((pct || 0) >= 90) return colors.success
  if ((pct || 0) >= 70) return colors.warning
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

  const seFinaliza = nuevoEstado === ESTADO_COMPLETADA && orden.estado !== ESTADO_COMPLETADA
  if (seFinaliza) {
    const fechaFin = new Date().toISOString()
    const horasReales = calcularHorasReales(orden.fecha_inicio, fechaFin)
    const eficienciaKg = calcularEficienciaKg(kgProducido, kgObjetivo)
    const eficienciaTiempo = calcularEficienciaTiempo(orden.horas_estimadas, horasReales)
    update.fecha_fin = fechaFin
    update.horas_reales = horasReales
    update.eficiencia_kg = eficienciaKg
    update.eficiencia_tiempo = eficienciaTiempo
    update.rendimiento_final = calcularRendimientoFinal(eficienciaKg, eficienciaTiempo)
  }

  const { error } = await supabase.from('ordenes_produccion').update(update).eq('id', orden.id)
  if (error) return { error }

  let mermaError = null
  if (seFinaliza) {
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

  const seFinaliza = orden.estado !== ESTADO_COMPLETADA
  if (seFinaliza) {
    const fechaFin = new Date().toISOString()
    const horasReales = calcularHorasReales(orden.fecha_inicio, fechaFin)
    const eficienciaKg = calcularEficienciaKg(kgProducido, kgObjetivo)
    const eficienciaTiempo = calcularEficienciaTiempo(orden.horas_estimadas, horasReales)
    update.fecha_fin = fechaFin
    update.horas_reales = horasReales
    update.eficiencia_kg = eficienciaKg
    update.eficiencia_tiempo = eficienciaTiempo
    update.rendimiento_final = calcularRendimientoFinal(eficienciaKg, eficienciaTiempo)
  }

  const { error } = await supabase.from('ordenes_produccion').update(update).eq('id', orden.id)
  if (error) return { error }

  const { error: mermaError } = await registrarMermaAutomatica(orden, kgProducido)
  return { pct, mermaError }
}
