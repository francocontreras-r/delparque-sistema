import { describe, it, expect } from 'vitest'
import { planAMovs, calcularPlanCompras, pendienteDeOrden } from './mrp'

describe('planAMovs', () => {
  it('helado → kg; impulsivo/postre → baldes; ignora cantidad 0', () => {
    const movs = planAMovs([
      { nombre: 'VAINILLA', tipo_producto: 'helado', cantidad: 10 },
      { nombre: 'CUBANITO', tipo_producto: 'impulsivo', cantidad: 20 },
      { nombre: 'TORTA', tipo_producto: 'postre', cantidad: 0 }, // se ignora
    ])
    expect(movs).toHaveLength(2)
    expect(movs[0]).toMatchObject({ tipo_producto: 'helado', kg: 10, baldes: 0 })
    expect(movs[1]).toMatchObject({ tipo_producto: 'impulsivo', kg: 0, baldes: 20 })
  })
})

describe('pendienteDeOrden', () => {
  it('helado: kg objetivo menos producido', () => {
    const r = pendienteDeOrden({ tipo_producto: 'helado', sabor_nombre: 'VAINILLA', kg_objetivo: 100, kg_producido: 30 })
    expect(r).toEqual({ nombre: 'VAINILLA', tipo_producto: 'helado', cantidad: 70 })
  })
  it('unidad: cantidad por (1 - % completitud)', () => {
    const r = pendienteDeOrden({ tipo_producto: 'impulsivo', sabor_nombre: 'CUBANITO', cantidad_unidades: 100, porcentaje_completitud: 25 })
    expect(r.cantidad).toBe(75)
  })
  it('nunca negativo', () => {
    const r = pendienteDeOrden({ tipo_producto: 'helado', sabor_nombre: 'X', kg_objetivo: 10, kg_producido: 40 })
    expect(r.cantidad).toBe(0)
  })
})

describe('calcularPlanCompras', () => {
  const ctx = {
    sabores: [], saborIngredientes: [], bases: [], baseIngredientes: [],
    impulsivos: [{ id: 1, nombre: 'CUBANITO' }],
    impulsivoIngredientes: [{ impulsivo_id: 1, insumo_nombre: 'OBLEA', cantidad: 2, unidad: 'u' }],
    insumos: [{ nombre: 'OBLEA', stock_actual: 10, stock_minimo: 5, costo_unitario: 5, unidad: 'u' }],
  }

  it('calcula faltante y costo de compra', () => {
    const r = calcularPlanCompras({
      planItems: [{ nombre: 'CUBANITO', tipo_producto: 'impulsivo', cantidad: 20 }],
      ctx,
    })
    const oblea = r.items.find(i => i.nombre === 'OBLEA')
    expect(oblea.necesario).toBe(40)   // 2 × 20
    expect(oblea.disponible).toBe(10)
    expect(oblea.faltante).toBe(30)
    expect(oblea.costoCompra).toBe(150) // 30 × 5
    expect(r.totalCompra).toBe(150)
    expect(r.aComprar).toHaveLength(1)
  })

  it('si el stock cubre, no hay que comprar', () => {
    const r = calcularPlanCompras({
      planItems: [{ nombre: 'CUBANITO', tipo_producto: 'impulsivo', cantidad: 3 }], // necesita 6, hay 10
      ctx,
    })
    expect(r.aComprar).toHaveLength(0)
    expect(r.cubiertos).toHaveLength(1)
    expect(r.totalCompra).toBe(0)
  })

  it('agrupa por proveedor', () => {
    const r = calcularPlanCompras({
      planItems: [{ nombre: 'CUBANITO', tipo_producto: 'impulsivo', cantidad: 20 }],
      ctx,
      ultimoProveedor: { oblea: 'Distribuidora Sur' },
    })
    expect(r.grupos).toHaveLength(1)
    expect(r.grupos[0].proveedor).toBe('Distribuidora Sur')
    expect(r.grupos[0].total).toBe(150)
  })

  it('plan vacío → nada que comprar', () => {
    const r = calcularPlanCompras({ planItems: [], ctx })
    expect(r.totalCompra).toBe(0)
    expect(r.aComprar).toHaveLength(0)
  })
})
