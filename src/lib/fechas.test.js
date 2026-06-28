import { describe, it, expect } from 'vitest'
import { inicioDelDiaAR, finDelDiaAR } from './fechas'

describe('fechas', () => {
  it('inicioDelDiaAR devuelve las 03:00 UTC (00:00 AR) del día', () => {
    expect(inicioDelDiaAR('2026-06-28')).toBe('2026-06-28T03:00:00.000Z')
  })

  it('finDelDiaAR devuelve el fin del día AR (02:59:59.999 UTC del día siguiente)', () => {
    expect(finDelDiaAR('2026-06-28')).toBe('2026-06-29T02:59:59.999Z')
  })

  it('finDelDiaAR maneja correctamente fin de mes', () => {
    expect(finDelDiaAR('2026-01-31')).toBe('2026-02-01T02:59:59.999Z')
  })

  it('finDelDiaAR maneja correctamente fin de año', () => {
    expect(finDelDiaAR('2026-12-31')).toBe('2027-01-01T02:59:59.999Z')
  })
})
