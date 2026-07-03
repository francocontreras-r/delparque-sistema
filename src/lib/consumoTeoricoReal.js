// ════════════════════════════════════════════════════════════════════════════
// Control de consumo — Teórico vs Real (varianza de materia prima)
// El control de merma "de verdad": compara la materia prima que la producción
// DEBERÍA haber consumido (backflush de lo que entró a cámara, vía recetas)
// contra lo que REALMENTE salió del depósito (egresos). La diferencia es merma,
// robo, error de receta o egreso mal registrado.
//
//   variación = real − teórico
//     > 0  → se usó MÁS de lo que la receta justifica (pérdida / fuga)
//     < 0  → se usó MENOS (egreso sin registrar, o el stock miente)
//
// Puro y testeable: reusa costearProduccion (el mismo backflush del sistema).
// ════════════════════════════════════════════════════════════════════════════
import { costearProduccion } from './costeoProduccion'
import { normalizarNombre as norm } from './texto'

// camaraIngresos: ingresos a cámara del período [{ sabor_nombre|producto_nombre, tipo_producto, kg, baldes }]
// ctx: { sabores, saborIngredientes, bases, baseIngredientes, impulsivos, impulsivoIngredientes, insumos }
// egresos: egresos de depósito del período [{ producto_nombre, cantidad }]
export function compararConsumo({ camaraIngresos = [], ctx = {}, egresos = [] } = {}) {
  const { porInsumo, sinReceta } = costearProduccion(camaraIngresos, ctx)

  const teo = {}, nombreDe = {}
  porInsumo.forEach(p => { const k = norm(p.nombre); teo[k] = (teo[k] || 0) + (Number(p.cantidad) || 0); nombreDe[k] = p.nombre })

  const real = {}
  egresos.forEach(e => {
    const k = norm(e.producto_nombre)
    real[k] = (real[k] || 0) + (Number(e.cantidad) || 0)
    if (!nombreDe[k]) nombreDe[k] = e.producto_nombre
  })

  const costo = {}
  ;(ctx.insumos || []).forEach(i => { costo[norm(i.nombre)] = Number(i.costo_unitario) || 0 })

  const claves = new Set([...Object.keys(teo), ...Object.keys(real)])
  const filas = [...claves].map(k => {
    const t = teo[k] || 0, r = real[k] || 0, dif = r - t, cu = costo[k] || 0
    return {
      nombre: nombreDe[k] || k,
      teorico: t, real: r, variacion: dif,
      variacionPct: t > 0 ? (dif / t) * 100 : (r > 0 ? 100 : 0),
      costoUnitario: cu,
      valorVariacion: dif * cu,
    }
  }).sort((a, b) => Math.abs(b.valorVariacion) - Math.abs(a.valorVariacion))

  const totalTeorico = filas.reduce((a, f) => a + f.teorico * f.costoUnitario, 0)
  const totalReal = filas.reduce((a, f) => a + f.real * f.costoUnitario, 0)
  const totalVariacion = totalReal - totalTeorico
  // "de más" = lo que se fue por encima de lo teórico (el foco del control).
  const valorDeMas = filas.filter(f => f.valorVariacion > 0).reduce((a, f) => a + f.valorVariacion, 0)

  return { filas, totalTeorico, totalReal, totalVariacion, valorDeMas, sinReceta }
}
