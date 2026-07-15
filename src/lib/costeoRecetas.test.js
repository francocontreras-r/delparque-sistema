import { describe, it, expect } from 'vitest'
import { crearCosteador } from './costeoRecetas'

describe('crearCosteador — agua vs. base "agua"', () => {
  const ctx = {
    insumos: [
      { nombre: 'Azúcar', costo_unitario: 800 },
      { nombre: 'Estabilizante', costo_unitario: 5000 },
      { nombre: 'Agua', costo_unitario: 0 },
    ],
    bases: [{ id: 1, nombre: 'Base Neutra Agua', litros_batch: 120 }],
    baseIngredientes: [
      { base_id: 1, insumo_nombre: 'Azúcar', cantidad: 30, unidad: 'kg' },
      { base_id: 1, insumo_nombre: 'Estabilizante', cantidad: 1, unidad: 'kg' },
      { base_id: 1, insumo_nombre: 'Agua', cantidad: 90, unidad: 'L' },
    ],
    sabores: [], saborIngredientes: [],
  }

  it('una base con "agua" en el nombre SÍ tiene costo (no la trata como agua de red)', () => {
    const c = crearCosteador(ctx)
    // (30 × 800 + 1 × 5000 + agua gratis) / 120 = 29000 / 120 ≈ 241.67
    expect(c.costoDe('Base Neutra Agua')).toBeCloseTo(29000 / 120, 2)
    expect(c.tipoDe('Base Neutra Agua')).toBe('intermedio')
  })

  it('el agua de red sigue siendo gratis', () => {
    const c = crearCosteador(ctx)
    expect(c.costoDe('Agua')).toBe(0)
    expect(c.tipoDe('Agua')).toBe('agua')
  })

  it('un sabor que usa la base "agua" cuenta su costo', () => {
    const c = crearCosteador({
      ...ctx,
      sabores: [{ id: 9, nombre: 'Limón al agua', litros_base: 120, base_nombre: 'Base Neutra Agua' }],
      saborIngredientes: [
        { sabor_id: 9, insumo_nombre: 'Base Neutra Agua', cantidad: 120, unidad: 'L' },
        { sabor_id: 9, insumo_nombre: 'Jugo de limón', cantidad: 2, unidad: 'kg' },
      ],
    })
    // La base aporta 120 × (29000/120) = 29000; el sabor no queda en base $0.
    expect(c.costoDe('Limón al agua')).toBeGreaterThan(0)
  })
})
