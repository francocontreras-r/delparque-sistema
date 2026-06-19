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

// Al finalizar una orden:
// - Si es SABOR con base: compara kg_producido vs kg_base_teorica (batches × litros_base),
//   descuenta stock_bases (FIFO) y registra merma si corresponde.
// - Si no tiene base (base pura u otro): compara kg_producido vs kg_objetivo.
export async function registrarMermaAutomatica(orden, kgProducidoFinal) {
  const fecha = new Date().toISOString().split('T')[0]
  const saborNombre = orden.sabor_nombre || orden.producto_nombre
  const kgObjetivo = orden.kg_objetivo || 0

  if (kgObjetivo <= 0) {
    return { error: null, toastMsg: '✅ Orden completada', toastType: 'ok' }
  }

  // Buscar si es un sabor con base asociada
  const { data: saborData } = await supabase
    .from('sabores')
    .select('base_nombre, litros_base')
    .ilike('nombre', saborNombre)
    .maybeSingle()

  if (saborData?.base_nombre) {
    // ── FLUJO SABOR CON BASE ─────────────────────────────────────────────────
    const litrosBase = saborData.litros_base || 120
    const kgBaseTeorica = (orden.batches || 0) * litrosBase
    const diferencia = kgProducidoFinal - kgBaseTeorica

    // Descontar de stock_bases (FIFO: más antiguo primero)
    const { data: baseRows } = await supabase
      .from('stock_bases')
      .select('id, kg_disponible')
      .eq('base_nombre', saborData.base_nombre)
      .gt('kg_disponible', 0)
      .order('fecha', { ascending: true })
      .limit(1)

    if (baseRows && baseRows.length > 0) {
      const row = baseRows[0]
      const nuevosKg = Math.max(0, row.kg_disponible - kgBaseTeorica)
      await supabase.from('stock_bases').update({ kg_disponible: nuevosKg }).eq('id', row.id)
    }

    if (Math.abs(diferencia) <= 0.5) {
      return { error: null, toastMsg: `✅ Producción exacta: ${kgProducidoFinal.toFixed(1)} kg`, toastType: 'ok' }
    }

    if (diferencia > 0.5) {
      return {
        error: null,
        toastMsg: `✅ Producción: ${kgProducidoFinal.toFixed(1)} kg — Sobrante: ${diferencia.toFixed(2)} kg vs base teórica`,
        toastType: 'ok',
      }
    }

    // Merma base→sabor
    const absDif = Math.abs(diferencia)
    const { error } = await supabase.from('mermas').insert({
      fecha,
      sabor_nombre: saborNombre,
      operario_nombre: orden.operario_nombre || null,
      kg_teoricos: kgBaseTeorica,
      kg_reales: kgProducidoFinal,
      diferencia: absDif,
      porcentaje: (absDif / kgBaseTeorica) * 100,
      causa: 'Merma de elaboración base→sabor',
      observaciones: `Base: ${saborData.base_nombre}. Teórico: ${kgBaseTeorica.toFixed(1)} kg. Real: ${kgProducidoFinal.toFixed(1)} kg.`,
    })
    if (error) return { error }
    return {
      error: null,
      toastMsg: `⚠️ Merma registrada: ${absDif.toFixed(2)} kg (${((absDif / kgBaseTeorica) * 100).toFixed(1)}%)`,
      toastType: 'warn',
    }
  }

  // ── FLUJO GENERAL (base pura, sabor sin base, etc.) ──────────────────────
  const diferencia = kgProducidoFinal - kgObjetivo
  const absDif = Math.abs(diferencia)

  if (absDif < 0.5) {
    return { error: null, toastMsg: '✅ Orden completada — Producción exacta', toastType: 'ok' }
  }

  if (diferencia > 0) {
    return { error: null, toastMsg: `✅ Orden completada — Sobrante: ${diferencia.toFixed(2)} kg`, toastType: 'ok' }
  }

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
