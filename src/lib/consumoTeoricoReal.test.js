import { describe, it, expect } from 'vitest'
import { compararConsumo } from './consumoTeoricoReal'

// Escenario: 1 tanda de VAINILLA (rinde 140 kg = 120 L base + 20 kg azúcar).
// La base NEUTRA lleva 100 L de LECHE por batch de 120 L.
// Backflush de 140 kg → LECHE 100, AZÚCAR 20.
const ctx = {
  insumos: [{ nombre: 'LECHE', costo_unitario: 2 }, { nombre: 'AZUCAR', costo_unitario: 10 }],
  bases: [{ id: 1, nombre: 'NEUTRA', litros_batch: 120 }],
  baseIngredientes: [{ base_id: 1, insumo_nombre: 'LECHE', cantidad: 100, unidad: 'L' }],
  sabores: [{ id: 1, nombre: 'VAINILLA', litros_base: 120, base_nombre: 'NEUTRA' }],
  saborIngredientes: [{ sabor_id: 1, insumo_nombre: 'AZUCAR', cantidad: 20, unidad: 'kg' }],
  impulsivos: [], impulsivoIngredientes: [],
}
const camaraIngresos = [{ sabor_nombre: 'VAINILLA', tipo_producto: 'helado', kg: 140, baldes: 0 }]

describe('compararConsumo', () => {
  it('calcula teórico desde el backflush y lo compara con egresos reales', () => {
    const r = compararConsumo({
      camaraIngresos, ctx,
      egresos: [{ producto_nombre: 'LECHE', cantidad: 110 }, { producto_nombre: 'AZUCAR', cantidad: 20 }],
    })
    const leche = r.filas.find(f => f.nombre === 'LECHE')
    const azucar = r.filas.find(f => f.nombre === 'AZUCAR')
    expect(leche.teorico).toBeCloseTo(100, 5)
    expect(leche.real).toBe(110)
    expect(leche.variacion).toBeCloseTo(10, 5)      // 10 L de más
    expect(leche.valorVariacion).toBeCloseTo(20, 5) // 10 × $2
    expect(azucar.variacion).toBeCloseTo(0, 5)
    expect(r.totalVariacion).toBeCloseTo(20, 5)
    expect(r.valorDeMas).toBeCloseTo(20, 5)
  })

  it('ordena por impacto absoluto en $', () => {
    const r = compararConsumo({
      camaraIngresos, ctx,
      egresos: [{ producto_nombre: 'LECHE', cantidad: 105 }, { producto_nombre: 'AZUCAR', cantidad: 25 }],
    })
    // AZÚCAR: +5 × $10 = $50 ; LECHE: +5 × $2 = $10 → azúcar primero
    expect(r.filas[0].nombre).toBe('AZUCAR')
  })

  it('egreso sin producción → variación negativa (se registró de menos en teórico)', () => {
    const r = compararConsumo({ camaraIngresos: [], ctx, egresos: [{ producto_nombre: 'LECHE', cantidad: 30 }] })
    const leche = r.filas.find(f => f.nombre === 'LECHE')
    expect(leche.teorico).toBe(0)
    expect(leche.real).toBe(30)
    expect(leche.variacion).toBe(30)
  })

  it('producción sin egreso registrado → teórico > 0, real 0', () => {
    const r = compararConsumo({ camaraIngresos, ctx, egresos: [] })
    const leche = r.filas.find(f => f.nombre === 'LECHE')
    expect(leche.teorico).toBeCloseTo(100, 5)
    expect(leche.real).toBe(0)
    expect(leche.variacion).toBeCloseTo(-100, 5)
  })

  it('sin datos → todo en cero', () => {
    const r = compararConsumo({})
    expect(r.filas).toEqual([])
    expect(r.totalVariacion).toBe(0)
  })
})
