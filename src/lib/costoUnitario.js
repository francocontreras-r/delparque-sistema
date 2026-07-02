// ════════════════════════════════════════════════════════════════════════════
// Costo UNITARIO de productos terminados — fuente única para Finanzas e Informes.
// Evita que cada módulo calcule distinto (y "no coincidan" los márgenes).
//
//  - Sabor (helado)  → $/kg  = (materia prima del batch + mano de obra) / rinde
//                              rinde = litros_base + kg de agregados de la receta.
//  - Impulsivo       → $/u   = materia prima por unidad + mano de obra.
//  - Postre          → $/kg  = (materia prima por unidad + MOD) / kg que pesa.
//
// La materia prima se costea EN VIVO con el rollup de recetas (crearCosteador),
// así no depende de un costo_total guardado que pueda estar desactualizado.
// ════════════════════════════════════════════════════════════════════════════
import { crearCosteador } from './costeoRecetas'
import { normalizarNombre as norm } from './texto'

const LITROS_BATCH = 120

export function crearCostoUnitario(ctx = {}) {
  const {
    insumos = [], bases = [], baseIngredientes = [],
    sabores = [], saborIngredientes = [],
    impulsivos = [], impulsivoIngredientes = [], tiposMap = {},
  } = ctx
  const costeador = crearCosteador({ insumos, bases, baseIngredientes, sabores, saborIngredientes })

  const saborPorNombre = {}; sabores.forEach(s => { saborPorNombre[norm(s.nombre)] = s })
  const impPorNombre = {}; impulsivos.forEach(i => { impPorNombre[norm(i.nombre)] = i })
  const tipoProd = nombre => tiposMap[(nombre || '').toUpperCase()] || tiposMap[norm(nombre)] || null

  // rinde/peso a partir de los kg de la receta
  const extraKg = {}; saborIngredientes.forEach(i => { if ((i.unidad || '').toLowerCase() === 'kg') extraKg[i.sabor_id] = (extraKg[i.sabor_id] || 0) + (Number(i.cantidad) || 0) })
  const pesoImp = {}; impulsivoIngredientes.forEach(i => { if ((i.unidad || '').toLowerCase() === 'kg') pesoImp[i.impulsivo_id] = (pesoImp[i.impulsivo_id] || 0) + (Number(i.cantidad) || 0) })

  const matSabor = s => saborIngredientes.filter(i => i.sabor_id === s.id)
    .reduce((a, i) => a + (Number(i.cantidad) || 0) * costeador.costoDe(i.insumo_nombre), 0)
  const matImp = im => impulsivoIngredientes.filter(i => i.impulsivo_id === im.id)
    .reduce((a, i) => a + (Number(i.cantidad) || 0) * costeador.costoDe(i.insumo_nombre), 0)

  function infoDe(nombre) {
    const s = saborPorNombre[norm(nombre)]
    if (s) {
      const rinde = (Number(s.litros_base) || LITROS_BATCH) + (extraKg[s.id] || 0)
      const total = matSabor(s) + (Number(s.mano_de_obra) || 0)
      return { costo: rinde > 0 ? total / rinde : total, unidad: 'kg', tipo: 'sabor' }
    }
    const im = impPorNombre[norm(nombre)]
    if (im) {
      const total = matImp(im) + (Number(im.mano_de_obra) || 0)
      if (tipoProd(im.nombre) === 'postre') {
        const peso = pesoImp[im.id] || 1
        return { costo: peso > 0 ? total / peso : total, unidad: 'kg', tipo: 'postre' }
      }
      return { costo: total, unidad: 'u', tipo: 'impulsivo' }
    }
    return { costo: 0, unidad: 'u', tipo: null }
  }

  return {
    infoDe,
    costoUnitDe: n => infoDe(n).costo,
    unidadDe: n => infoDe(n).unidad,
    tipoDe: n => infoDe(n).tipo,
  }
}
