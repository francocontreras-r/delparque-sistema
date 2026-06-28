import { describe, it, expect } from 'vitest'
import { formatStock, labelUnidad, labelDetalle } from './formatCamara'

describe('formatStock', () => {
  it('impulsivo muestra solo unidades', () => {
    expect(formatStock({ tipo_producto: 'impulsivo', baldes: 5, kg: 0 })).toBe('5 unidades')
  })

  it('postre muestra unidades y kg', () => {
    expect(formatStock({ tipo_producto: 'postre', baldes: 3, kg: 2.5 })).toBe('3 unidades / 2.5 kg')
  })

  it('helado muestra baldes y kg (kg con 1 decimal)', () => {
    expect(formatStock({ tipo_producto: 'helado', baldes: 8, kg: 58.75 })).toBe('8 baldes / 58.8 kg')
  })

  it('sin tipo asume helado', () => {
    expect(formatStock({ baldes: 2, kg: 10 })).toBe('2 baldes / 10.0 kg')
  })

  it('valores nulos no rompen', () => {
    expect(formatStock({ tipo_producto: 'helado' })).toBe('0 baldes / 0.0 kg')
  })
})

describe('labelUnidad / labelDetalle', () => {
  it('labelUnidad', () => {
    expect(labelUnidad('impulsivo')).toBe('Unidades')
    expect(labelUnidad('postre')).toBe('Unidades')
    expect(labelUnidad('helado')).toBe('Baldes')
  })
  it('labelDetalle', () => {
    expect(labelDetalle('impulsivo')).toBe('unidades')
    expect(labelDetalle('helado')).toBe('baldes / kg')
  })
})
