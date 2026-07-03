import { describe, it, expect } from 'vitest'
import { construirPrecioMapCamara, valorizarItemCamara, valorTotalCamara } from './valorCamara'

describe('construirPrecioMapCamara', () => {
  it('sabor usa costo_final; si no hay, costo_total/rinde', () => {
    const map = construirPrecioMapCamara({
      sabores: [
        { id: 1, nombre: 'VAINILLA', costo_final: 900, precio_venta: 2500, litros_base: 120 },
        { id: 2, nombre: 'CANELA', costo_final: 0, costo_total: 140000, litros_base: 120 },
      ],
      saborIngredientes: [{ sabor_id: 2, cantidad: 20, unidad: 'kg' }], // rinde CANELA = 140
    })
    expect(map.vainilla.costo).toBe(900)
    expect(map.canela.costo).toBeCloseTo(1000, 5) // 140000 / 140
  })

  it('impulsivo usa costo_final o costo_total', () => {
    const map = construirPrecioMapCamara({ impulsivos: [{ nombre: 'CUBANITO', costo_final: 300, precio_venta: 800 }] })
    expect(map.cubanito).toEqual({ costo: 300, precio: 800 })
  })
})

describe('valorizarItemCamara', () => {
  const map = { vainilla: { costo: 900, precio: 2500 }, cubanito: { costo: 300, precio: 800 } }
  it('helado se valoriza por kg', () => {
    const v = valorizarItemCamara({ nombre: 'VAINILLA', tipo_producto: 'helado', kg: 50, baldes: 5 }, map)
    expect(v.valorCosto).toBe(45000) // 50 × 900
    expect(v.valorVenta).toBe(125000)
  })
  it('impulsivo/postre se valoriza por unidad (baldes)', () => {
    const v = valorizarItemCamara({ nombre: 'CUBANITO', tipo_producto: 'impulsivo', kg: 0, baldes: 10 }, map)
    expect(v.valorCosto).toBe(3000) // 10 × 300
  })
  it('cae al fallback por tipo si el producto no está en Finanzas', () => {
    const v = valorizarItemCamara({ nombre: 'DESCONOCIDO', tipo_producto: 'helado', tipo: 'Lisa', kg: 10 }, {})
    expect(v.costoUnit).toBe(1200) // TIPO_PRECIOS_CAMARA.Lisa
  })
})

describe('valorTotalCamara', () => {
  it('agrupa por nombre y suma el valor a costo', () => {
    const map = { vainilla: { costo: 900, precio: 2500 } }
    const stock = [
      { nombre: 'VAINILLA', tipo_producto: 'helado', kg: 30, baldes: 3 },
      { nombre: 'vainilla', tipo_producto: 'helado', kg: 20, baldes: 2 }, // mismo producto → suma 50 kg
    ]
    const r = valorTotalCamara(stock, map)
    expect(r.valorCosto).toBe(45000) // 50 × 900
  })
})
