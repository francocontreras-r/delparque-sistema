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

  it('un insumo con "agua" al final del nombre NO es agua de red (packaging con costo)', () => {
    const c = crearCosteador({
      ...ctx,
      insumos: [...ctx.insumos, { nombre: 'Papel puntos amarillos limón agua', costo_unitario: 450 }],
    })
    expect(c.tipoDe('Papel puntos amarillos limón agua')).toBe('insumo')
    expect(c.costoDe('Papel puntos amarillos limón agua')).toBe(450)
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

describe('crearCosteador — rinde en kg por densidad de la base', () => {
  const base = { id: 1, nombre: 'Base Crema', litros_batch: 120 }
  const sabor = { id: 9, nombre: 'Sambayón', litros_base: 120, base_nombre: 'Base Crema' }
  const ctx = (peso_kg) => ({
    insumos: [{ nombre: 'Azúcar', costo_unitario: 800 }, { nombre: 'Yema', costo_unitario: 3000 }],
    bases: [{ ...base, peso_kg }],
    baseIngredientes: [{ base_id: 1, insumo_nombre: 'Azúcar', cantidad: 30, unidad: 'kg' }],
    sabores: [sabor],
    saborIngredientes: [{ sabor_id: 9, insumo_nombre: 'Yema', cantidad: 6, unidad: 'kg' }],
  })

  it('sin peso_kg: rinde = litros (comportamiento previo)', () => {
    const c = crearCosteador(ctx(null))
    const sinDens = c.costoDe('Sambayón')
    // costo total / (120 + 6)
    expect(sinDens).toBeGreaterThan(0)
    // con peso_kg mayor, el $/kg baja (más kg para repartir)
    const conDens = crearCosteador(ctx(132)).costoDe('Sambayón')
    expect(conDens).toBeLessThan(sinDens)
  })

  it('peso_kg 132: la base rinde 132 kg, no 120', () => {
    const c = crearCosteador(ctx(132))
    // rinde = 120 × (132/120) + 6 = 138 kg
    // total materia prima = base(30×800/120 ×120) + yema(6×3000) = 24000 + 18000 = 42000
    expect(c.costoDe('Sambayón')).toBeCloseTo(42000 / 138, 1)
  })
})
