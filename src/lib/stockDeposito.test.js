import { describe, it, expect } from 'vitest'
import { deltaEnUnidadStock, requiereConversionKg } from './stockDeposito'

describe('requiereConversionKg', () => {
  it('exige conversión cuando el stock es kg/L y la carga es en unidades', () => {
    expect(requiereConversionKg('u', 'kg')).toBe(true)
    expect(requiereConversionKg('u', 'L')).toBe(true)
  })
  it('no exige conversión cuando las unidades coinciden', () => {
    expect(requiereConversionKg('kg', 'kg')).toBe(false)
    expect(requiereConversionKg('u', 'u')).toBe(false)
  })
})

describe('deltaEnUnidadStock', () => {
  it('BUG 7≠70: 7 baldes x 10 kg descuentan 70 kg de un stock en kg', () => {
    const delta = deltaEnUnidadStock({ cantidad: 7, unidadMov: 'u', unidadStock: 'kg', pesoPorUnidad: 10 })
    expect(delta).toBe(70)
  })

  it('sin peso por unidad, un movimiento en baldes contra stock en kg devuelve null (bloquea)', () => {
    const delta = deltaEnUnidadStock({ cantidad: 7, unidadMov: 'u', unidadStock: 'kg' })
    expect(delta).toBeNull()
  })

  it('misma unidad (kg → kg): se descuenta directo', () => {
    expect(deltaEnUnidadStock({ cantidad: 12.5, unidadMov: 'kg', unidadStock: 'kg' })).toBe(12.5)
  })

  it('stock en unidades (impulsivo): 7 baldes descuentan 7 aunque haya peso informado', () => {
    expect(deltaEnUnidadStock({ cantidad: 7, unidadMov: 'u', unidadStock: 'u', pesoPorUnidad: 10 })).toBe(7)
  })

  it('litros: 3 bidones x 5 L descuentan 15 L', () => {
    expect(deltaEnUnidadStock({ cantidad: 3, unidadMov: 'u', unidadStock: 'L', pesoPorUnidad: 5 })).toBe(15)
  })

  it('cantidad inválida → 0', () => {
    expect(deltaEnUnidadStock({ cantidad: '', unidadMov: 'kg', unidadStock: 'kg' })).toBe(0)
  })
})
