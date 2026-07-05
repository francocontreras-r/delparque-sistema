import { describe, it, expect } from 'vitest'
import { esDiscrepancia, resumenSemanal, discrepanciasSinResolver, UMBRAL_CONTEO } from './conteos'

describe('esDiscrepancia', () => {
  it('sin diferencia → false', () => {
    expect(esDiscrepancia(100, 100)).toBe(false)
  })
  it('diferencia menor al umbral → false', () => {
    expect(esDiscrepancia(100, 103)).toBe(false) // 3% < 5%
  })
  it('diferencia mayor al umbral → true', () => {
    expect(esDiscrepancia(100, 90)).toBe(true) // 10% > 5%
  })
  it('sistema 0 y físico >0 → discrepancia', () => {
    expect(esDiscrepancia(0, 5)).toBe(true)
  })
  it('sistema 0 y físico 0 → sin discrepancia', () => {
    expect(esDiscrepancia(0, 0)).toBe(false)
  })
  it('físico no numérico → false', () => {
    expect(esDiscrepancia(100, '')).toBe(false)
  })
  it('umbral configurable', () => {
    expect(esDiscrepancia(100, 108, 0.1)).toBe(false) // 8% < 10%
    expect(esDiscrepancia(100, 108, 0.05)).toBe(true)
  })
})

describe('resumenSemanal', () => {
  const rows = [
    // más nuevo primero (como viene de la query desc por created_at)
    { tipo: 'camara', producto_nombre: 'Dulce de Leche', diferencia: -2, valor_impacto: -1000, created_at: '2026-07-03' },
    { tipo: 'camara', producto_nombre: 'dulce de leche', diferencia: -5, valor_impacto: -2500, created_at: '2026-07-01' }, // duplicado viejo → se ignora
    { tipo: 'deposito', producto_nombre: 'Azúcar', diferencia: 3, valor_impacto: 900, created_at: '2026-07-02' },
    { tipo: 'deposito', producto_nombre: 'Harina', diferencia: 0, valor_impacto: 0, created_at: '2026-07-02' },
  ]

  it('deduplica por área+producto quedándose con el más nuevo', () => {
    const r = resumenSemanal(rows)
    expect(r.totalContados).toBe(3) // DDL (1, el nuevo), Azúcar, Harina
    const ddl = r.faltantes.find(f => f.producto_nombre === 'Dulce de Leche')
    expect(ddl.diferencia).toBe(-2) // el nuevo, no el -5 viejo
  })

  it('separa faltantes y sobrantes y valoriza', () => {
    const r = resumenSemanal(rows)
    expect(r.faltantes).toHaveLength(1)
    expect(r.sobrantes).toHaveLength(1)
    expect(r.valorFaltante).toBe(1000)
    expect(r.valorSobrante).toBe(900)
    expect(r.impactoNeto).toBe(-100)
  })

  it('cuenta por área', () => {
    const r = resumenSemanal(rows)
    expect(r.porArea.camara.faltantes).toBe(1)
    expect(r.porArea.deposito.sobrantes).toBe(1)
    expect(r.porArea.deposito.contados).toBe(2)
  })

  it('sin filas → totales en cero', () => {
    const r = resumenSemanal([])
    expect(r.totalContados).toBe(0)
    expect(r.valorFaltante).toBe(0)
  })
})

describe('UMBRAL_CONTEO', () => {
  it('es 5%', () => expect(UMBRAL_CONTEO).toBe(0.05))
})

describe('discrepanciasSinResolver', () => {
  it('devuelve solo diferencias ≠ 0 sin motivo', () => {
    const rows = [
      { tipo: 'deposito', producto_nombre: 'LECHE', diferencia: -5, motivo: null, fecha: '2026-07-02' },
      { tipo: 'deposito', producto_nombre: 'AZÚCAR', diferencia: -2, motivo: 'Rotura', fecha: '2026-07-02' }, // resuelta
      { tipo: 'deposito', producto_nombre: 'SAL', diferencia: 0, motivo: null, fecha: '2026-07-02' },          // sin dif
    ]
    const r = discrepanciasSinResolver(rows)
    expect(r).toHaveLength(1)
    expect(r[0].producto_nombre).toBe('LECHE')
  })

  it('se queda con el último por área+producto; motivo posterior lo resuelve', () => {
    const rows = [
      { tipo: 'deposito', producto_nombre: 'LECHE', diferencia: -5, motivo: null, fecha: '2026-07-01' },
      { tipo: 'deposito', producto_nombre: 'LECHE', diferencia: -5, motivo: 'Ajuste', fecha: '2026-07-01' }, // mismo día, con motivo
    ]
    expect(discrepanciasSinResolver(rows)).toHaveLength(0)
  })

  it('mismo producto en distinta área cuenta por separado', () => {
    const rows = [
      { tipo: 'deposito', producto_nombre: 'DULCE', diferencia: -1, motivo: null, fecha: '2026-07-02' },
      { tipo: 'camara', producto_nombre: 'DULCE', diferencia: -1, motivo: null, fecha: '2026-07-02' },
    ]
    expect(discrepanciasSinResolver(rows)).toHaveLength(2)
  })

  it('una recontada más nueva (id mayor) pisa a la vieja aunque sea el mismo día', () => {
    const rows = [
      { id: 10, tipo: 'deposito', producto_nombre: 'LECHE', diferencia: -5, motivo: 'Merma', fecha: '2026-07-02' }, // vieja, aprobada
      { id: 20, tipo: 'deposito', producto_nombre: 'LECHE', diferencia: 0, motivo: null, fecha: '2026-07-02' },     // recontada OK
    ]
    // La corrección (id 20, sin diferencia) gana → ya no hay discrepancia.
    expect(discrepanciasSinResolver(rows)).toHaveLength(0)
  })
})

describe('resumenSemanal — recencia', () => {
  it('toma el conteo corregido (id mayor), no el viejo erróneo', () => {
    const rows = [
      { id: 5, tipo: 'deposito', producto_nombre: 'AZUCAR', diferencia: -20, valor_impacto: -2000, fecha: '2026-07-02' }, // erróneo
      { id: 9, tipo: 'deposito', producto_nombre: 'AZUCAR', diferencia: -2, valor_impacto: -200, fecha: '2026-07-02' },   // corregido
    ]
    const R = resumenSemanal(rows)
    expect(R.faltantes).toHaveLength(1)
    expect(R.valorFaltante).toBe(200) // el corregido, no 2000
  })
})
