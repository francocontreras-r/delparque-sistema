import { describe, it, expect } from 'vitest'
import { normalizarNombre } from './texto'

describe('normalizarNombre', () => {
  it('saca acentos, mayúsculas y espacios de más', () => {
    expect(normalizarNombre('Leche  en Polvó')).toBe('leche en polvo')
    expect(normalizarNombre('  AZÚCAR ')).toBe('azucar')
    expect(normalizarNombre('Dulce de Leche')).toBe('dulce de leche')
  })

  it('hace coincidir variantes que antes fallaban', () => {
    // Estos dos representan el mismo insumo escrito distinto:
    expect(normalizarNombre('Leche en polvo')).toBe(normalizarNombre('LECHE  EN  POLVO'))
    expect(normalizarNombre('Crémor')).toBe(normalizarNombre('cremor'))
  })

  it('maneja null/undefined/vacío sin romper', () => {
    expect(normalizarNombre(null)).toBe('')
    expect(normalizarNombre(undefined)).toBe('')
    expect(normalizarNombre('')).toBe('')
  })
})
