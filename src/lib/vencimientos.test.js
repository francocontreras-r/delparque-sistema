import { describe, it, expect } from 'vitest'
import { clasificarVencimiento, esAlertaVencimiento, labelDias } from './vencimientos'

// Devuelve una fecha YYYY-MM-DD desplazada `dias` respecto a hoy (hora local)
function fechaRelativa(dias) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + dias)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

describe('clasificarVencimiento', () => {
  it('null devuelve null', () => {
    expect(clasificarVencimiento(null)).toBeNull()
  })
  it('fecha pasada → vencido', () => {
    expect(clasificarVencimiento(fechaRelativa(-5)).estado).toBe('vencido')
  })
  it('hoy → hoy_manana', () => {
    expect(clasificarVencimiento(fechaRelativa(0)).estado).toBe('hoy_manana')
  })
  it('en 5 días → pronto', () => {
    expect(clasificarVencimiento(fechaRelativa(5)).estado).toBe('pronto')
  })
  it('en 30 días → ok', () => {
    expect(clasificarVencimiento(fechaRelativa(30)).estado).toBe('ok')
  })
})

describe('esAlertaVencimiento', () => {
  it('ok no es alerta', () => {
    expect(esAlertaVencimiento({ estado: 'ok' })).toBe(false)
  })
  it('vencido es alerta', () => {
    expect(esAlertaVencimiento({ estado: 'vencido' })).toBe(true)
  })
  it('null no es alerta', () => {
    expect(esAlertaVencimiento(null)).toBe(false)
  })
})

describe('labelDias', () => {
  it('vencido', () => {
    expect(labelDias(-3)).toBe('Vencido hace 3 días')
    expect(labelDias(-1)).toBe('Vencido hace 1 día')
  })
  it('hoy / mañana', () => {
    expect(labelDias(0)).toBe('Vence hoy')
    expect(labelDias(1)).toBe('Vence mañana')
  })
  it('futuro', () => {
    expect(labelDias(5)).toBe('Vence en 5 días')
  })
})
