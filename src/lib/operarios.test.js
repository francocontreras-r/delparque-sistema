import { describe, it, expect } from 'vitest'
import { deduplicarOperarios } from './operarios'

describe('deduplicarOperarios', () => {
  it('elimina duplicados por nombre (ignorando espacios)', () => {
    const r = deduplicarOperarios([
      { nombre: 'Ana ', activo: true },
      { nombre: 'Ana', activo: true },
      { nombre: 'Beto', activo: true },
    ])
    expect(r.map(o => o.nombre.trim())).toEqual(['Ana', 'Beto'])
  })

  it('filtra inactivos (activo === false)', () => {
    const r = deduplicarOperarios([
      { nombre: 'Ana', activo: true },
      { nombre: 'Carlos', activo: false },
    ])
    expect(r.map(o => o.nombre)).toEqual(['Ana'])
  })

  it('ordena alfabéticamente', () => {
    const r = deduplicarOperarios([
      { nombre: 'Zoe', activo: true },
      { nombre: 'Ana', activo: true },
      { nombre: 'Marco', activo: true },
    ])
    expect(r.map(o => o.nombre)).toEqual(['Ana', 'Marco', 'Zoe'])
  })

  it('maneja entrada vacía o nula', () => {
    expect(deduplicarOperarios(null)).toEqual([])
    expect(deduplicarOperarios([])).toEqual([])
  })
})
