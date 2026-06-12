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

// Si la orden cierra con kg_producido por debajo del objetivo, la diferencia
// se registra como merma automática para no perder esa trazabilidad.
export async function registrarMermaAutomatica(orden, kgProducidoFinal) {
  const kgObjetivo = orden.kg_objetivo || 0
  const merma = kgObjetivo - kgProducidoFinal
  if (merma <= 0) return
  await supabase.from('mermas').insert({
    fecha: orden.fecha_produccion,
    sabor_nombre: orden.sabor_nombre,
    operario_nombre: orden.operario_nombre || null,
    kg_teoricos: kgObjetivo,
    kg_reales: kgProducidoFinal,
    diferencia: merma,
    porcentaje: (merma / kgObjetivo) * 100,
    causa: 'Producción finalizada',
    observaciones: 'Registrado automáticamente al finalizar orden',
  })
}

export async function aplicarProduccionAOrden(orden, kgIncremento) {
  const kgObjetivo = orden.kg_objetivo || 0
  const kgProducido = (orden.kg_producido || 0) + kgIncremento
  const pct = pctCompletitud(kgProducido, kgObjetivo)
  const nuevoEstado = pct >= 95 ? ESTADO_COMPLETADA : orden.estado

  const { error } = await supabase.from('ordenes_produccion').update({
    kg_producido: kgProducido,
    porcentaje_completitud: pct,
    estado: nuevoEstado,
  }).eq('id', orden.id)
  if (error) return { error }

  if (nuevoEstado === ESTADO_COMPLETADA && orden.estado !== ESTADO_COMPLETADA) {
    await registrarMermaAutomatica(orden, kgProducido)
  }
  return { kgProducido, pct, estado: nuevoEstado }
}

export async function finalizarOrdenManual(orden) {
  const kgObjetivo = orden.kg_objetivo || 0
  const kgProducido = orden.kg_producido || 0
  const pct = pctCompletitud(kgProducido, kgObjetivo)

  const { error } = await supabase.from('ordenes_produccion').update({
    estado: ESTADO_COMPLETADA,
    porcentaje_completitud: pct,
  }).eq('id', orden.id)
  if (error) return { error }

  await registrarMermaAutomatica(orden, kgProducido)
  return { pct }
}
