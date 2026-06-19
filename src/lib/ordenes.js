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

// Cuando una orden de sabor se finaliza, compara kg_producido vs kg_objetivo:
// - Sobrante (> 0.5 kg de diferencia positiva): registra y avisa en verde
// - Merma    (> 0.5 kg de diferencia negativa):  registra y avisa en amarillo
// - Exacto   (diferencia < 0.5 kg):              solo avisa, no registra
export async function registrarMermaAutomatica(orden, kgProducidoFinal) {
  const kgObjetivo = orden.kg_objetivo || 0
  const fecha = new Date().toISOString().split('T')[0]
  const saborNombre = orden.sabor_nombre || orden.producto_nombre

  if (kgObjetivo <= 0) {
    return { error: null, toastMsg: '✅ Orden completada', toastType: 'ok' }
  }

  const diferencia = kgProducidoFinal - kgObjetivo // positivo = sobrante, negativo = merma
  const absDif = Math.abs(diferencia)

  // CASO C — Exacto
  if (absDif < 0.5) {
    return { error: null, toastMsg: '✅ Orden completada — Producción exacta', toastType: 'ok' }
  }

  // CASO A — Sobrante
  if (diferencia > 0) {
    const { error } = await supabase.from('mermas').insert({
      fecha,
      sabor_nombre: saborNombre,
      operario_nombre: orden.operario_nombre || null,
      kg_teoricos: kgObjetivo,
      kg_reales: kgProducidoFinal,
      diferencia,
      porcentaje: (diferencia / kgObjetivo) * 100,
      causa: 'Sobrante de producción',
      observaciones: `Se produjeron ${diferencia.toFixed(2)} kg más de lo esperado. Orden ${orden.numero}`,
    })
    if (error) return { error }
    return { error: null, toastMsg: `✅ Orden completada — Sobrante: ${diferencia.toFixed(2)} kg`, toastType: 'ok' }
  }

  // CASO B — Merma
  const merma = absDif
  const { error } = await supabase.from('mermas').insert({
    fecha,
    sabor_nombre: saborNombre,
    operario_nombre: orden.operario_nombre || null,
    kg_teoricos: kgObjetivo,
    kg_reales: kgProducidoFinal,
    diferencia: -merma,
    porcentaje: (merma / kgObjetivo) * 100,
    causa: 'Merma de elaboración',
    observaciones: `Se produjeron ${merma.toFixed(2)} kg menos de lo esperado. Orden ${orden.numero}`,
  })
  if (error) return { error }
  return { error: null, toastMsg: `⚠️ Orden completada — Merma: ${merma.toFixed(2)} kg`, toastType: 'warn' }
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

  let mermaError = null, toastMsg = null, toastType = 'ok'
  if (seFinaliza) {
    const resultado = await registrarMermaAutomatica(orden, kgProducido)
    mermaError = resultado.error
    toastMsg = resultado.toastMsg || null
    toastType = resultado.toastType || 'ok'
  }
  return { kgProducido, pct, estado: nuevoEstado, mermaError, toastMsg, toastType }
}

export async function finalizarOrdenManual(orden, fechaFinParam = null) {
  const kgObjetivo = orden.kg_objetivo || 0
  const kgProducido = orden.kg_producido || 0
  const pct = pctCompletitud(kgProducido, kgObjetivo)

  const update = {
    estado: ESTADO_COMPLETADA,
    porcentaje_completitud: pct,
  }

  const seFinaliza = orden.estado !== ESTADO_COMPLETADA
  if (seFinaliza) {
    const fechaFin = fechaFinParam || new Date().toISOString()
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

  const { error: mermaError, toastMsg, toastType } = await registrarMermaAutomatica(orden, kgProducido)
  return { pct, mermaError, toastMsg, toastType }
}
