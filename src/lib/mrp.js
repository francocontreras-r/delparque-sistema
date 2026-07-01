// ════════════════════════════════════════════════════════════════════════════
// Mini-MRP — plan de compras a partir de la producción planificada
// Toma lo que se PLANEA producir (órdenes abiertas + ajustes manuales), explota
// las recetas hasta la materia prima cruda (reusa costearProduccion), la compara
// con el stock del depósito y dice QUÉ y CUÁNTO comprar, agrupado por proveedor.
//
// Todo acá es puro y testeable (la parte de DB vive en Deposito.jsx).
// ════════════════════════════════════════════════════════════════════════════
import { costearProduccion } from './costeoProduccion'
import { normalizarNombre as norm } from './texto'

// Convierte los ítems del plan (sabor/impulsivo/postre + cantidad) al formato que
// espera costearProduccion: helado en kg, impulsivo/postre en unidades (baldes).
export function planAMovs(planItems) {
  return (planItems || [])
    .filter(p => (Number(p.cantidad) || 0) > 0)
    .map(p => {
      const tp = p.tipo_producto || 'helado'
      const nombre = p.nombre
      if (tp === 'helado') {
        return { sabor_nombre: nombre, producto_nombre: nombre, tipo_producto: 'helado', kg: Number(p.cantidad) || 0, baldes: 0 }
      }
      return { sabor_nombre: nombre, producto_nombre: nombre, tipo_producto: tp, kg: 0, baldes: Number(p.cantidad) || 0 }
    })
}

// planItems: [{ nombre, tipo_producto, cantidad }]
// ctx: { sabores, saborIngredientes, bases, baseIngredientes, impulsivos, impulsivoIngredientes, insumos }
// ultimoProveedor: { [normNombre]: proveedor }
export function calcularPlanCompras({ planItems, ctx, ultimoProveedor = {} }) {
  const movs = planAMovs(planItems)
  const { porInsumo, sinReceta, sinCosto } = costearProduccion(movs, ctx)

  const insumoPorNombre = {}
  ;(ctx.insumos || []).forEach(i => { insumoPorNombre[norm(i.nombre)] = i })

  const items = porInsumo.map(p => {
    const ins = insumoPorNombre[norm(p.nombre)] || {}
    const disponible = Number(ins.stock_actual) || 0
    const necesario = Number(p.cantidad) || 0
    const faltante = Math.max(0, necesario - disponible)
    const costoUnitario = Number(ins.costo_unitario) || 0
    return {
      nombre: p.nombre,
      unidad: ins.unidad || 'u',
      necesario, disponible, faltante,
      stockMinimo: Number(ins.stock_minimo) || 0,
      costoUnitario,
      costoCompra: faltante * costoUnitario,
      proveedor: ultimoProveedor[norm(p.nombre)] || 'Sin proveedor',
      cubierto: faltante <= 0,
      sinCosto: costoUnitario <= 0,
    }
  }).sort((a, b) => b.faltante - a.faltante)

  const aComprar = items.filter(i => i.faltante > 0).sort((a, b) => b.costoCompra - a.costoCompra)
  const cubiertos = items.filter(i => i.faltante <= 0)

  // Agrupar lo que hay que comprar por proveedor
  const porProveedor = {}
  aComprar.forEach(i => {
    if (!porProveedor[i.proveedor]) porProveedor[i.proveedor] = { proveedor: i.proveedor, items: [], total: 0 }
    porProveedor[i.proveedor].items.push(i)
    porProveedor[i.proveedor].total += i.costoCompra
  })
  const grupos = Object.values(porProveedor).sort((a, b) => b.total - a.total)
  const totalCompra = aComprar.reduce((a, i) => a + i.costoCompra, 0)

  return { items, aComprar, cubiertos, grupos, totalCompra, sinReceta, sinCosto }
}

// Deriva de una orden abierta la cantidad que FALTA producir (para sembrar el plan).
// helado → kg pendientes; impulsivo/postre → unidades pendientes.
export function pendienteDeOrden(orden) {
  const tp = orden.tipo_producto || 'helado'
  if (tp === 'helado') {
    const obj = Number(orden.kg_objetivo) || 0
    const hecho = Number(orden.kg_producido) || 0
    return { nombre: orden.sabor_nombre, tipo_producto: 'helado', cantidad: Math.max(0, obj - hecho) }
  }
  const obj = Number(orden.cantidad_unidades) || 0
  const pct = Number(orden.porcentaje_completitud) || 0
  const pendiente = Math.max(0, Math.round(obj * (1 - pct / 100)))
  return { nombre: orden.sabor_nombre, tipo_producto: tp, cantidad: pendiente }
}
