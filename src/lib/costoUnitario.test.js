import { describe, it, expect } from 'vitest'
import { crearCostoUnitario } from './costoUnitario'

// Base "Neutra" cuesta $120.000 el batch de 120 L → $1.000/L
// Sabor "Vainilla": 120 L de base + 20 kg de azúcar ($10/kg = $200) + MOD $2.800
//   rinde = 120 + 20 = 140 kg ; total = 120*1000 + 200 + 2800 = 123.000 → $878,57/kg
const ctx = {
  insumos: [{ nombre: 'Leche', costo_unitario: 1000, unidad: 'L' }, { nombre: 'Azucar', costo_unitario: 10, unidad: 'kg' }, { nombre: 'Oblea', costo_unitario: 5, unidad: 'u' }],
  bases: [{ id: 1, nombre: 'Neutra', litros_batch: 120 }],
  baseIngredientes: [{ base_id: 1, insumo_nombre: 'Leche', cantidad: 120, unidad: 'L' }],
  sabores: [{ id: 10, nombre: 'Vainilla', base_nombre: 'Neutra', litros_base: 120, mano_de_obra: 2800 }],
  saborIngredientes: [
    { sabor_id: 10, insumo_nombre: 'Neutra', cantidad: 120, unidad: 'L' },
    { sabor_id: 10, insumo_nombre: 'Azucar', cantidad: 20, unidad: 'kg' },
  ],
  impulsivos: [{ id: 20, nombre: 'Cubanito', mano_de_obra: 100 }, { id: 21, nombre: 'Barra', mano_de_obra: 500 }],
  impulsivoIngredientes: [
    { impulsivo_id: 20, insumo_nombre: 'Oblea', cantidad: 2, unidad: 'u' },
    { impulsivo_id: 21, insumo_nombre: 'Vainilla', cantidad: 1.5, unidad: 'kg' },
  ],
  tiposMap: { CUBANITO: 'impulsivo', BARRA: 'postre' },
}

describe('crearCostoUnitario', () => {
  const c = crearCostoUnitario(ctx)

  it('sabor: costo por kg = (base + agregados + MOD) / rinde', () => {
    const r = c.infoDe('Vainilla')
    expect(r.unidad).toBe('kg')
    // (120*1000 + 20*10 + 2800) / 140 = 123000/140 = 878.57...
    expect(Math.round(r.costo)).toBe(879)
  })

  it('impulsivo: costo por unidad (materia prima + MOD)', () => {
    const r = c.infoDe('Cubanito')
    expect(r.unidad).toBe('u')
    // 2 obleas * $5 + MOD 100 = 110
    expect(Math.round(r.costo)).toBe(110)
  })

  it('postre: costo por kg = (materia prima + MOD) / kg que pesa', () => {
    const r = c.infoDe('Barra')
    expect(r.unidad).toBe('kg')
    // Vainilla se costea a MATERIALES (rollup, sin MOD) = 858,57/kg (igual que Finanzas).
    // 1.5 kg * 858.57 = 1287.86 + MOD postre 500 = 1787.86 ; / 1.5 kg = 1191.9
    expect(r.tipo).toBe('postre')
    expect(Math.round(r.costo)).toBe(1192)
  })

  it('nombre desconocido → costo 0', () => {
    expect(c.costoUnitDe('NoExiste')).toBe(0)
  })
})
