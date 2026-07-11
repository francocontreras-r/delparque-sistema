import { describe, it, expect } from 'vitest'
import { movimientosSinGemelo } from './dedupeProduccion'

// Un registro de producciones (con peso_kg) y su movimiento de cámara gemelo
// (kg, sin peso_kg) del mismo día/producto.
const prod = (nombre, kg, fecha) => ({ producto_nombre: nombre, peso_kg: kg, fecha })
const mov  = (nombre, kg, fecha, extra = {}) => ({ producto_nombre: nombre, kg, fecha, motivo: 'Producción', ...extra })

describe('movimientosSinGemelo', () => {
  it('elimina el movimiento gemelo del módulo Producción (no doble conteo)', () => {
    const producciones = [prod('MINI BARRA TRICOLOR', 18.82, '2026-07-10')]
    const movimientos  = [mov('MINI BARRA TRICOLOR', 18.82, '2026-07-10')]
    expect(movimientosSinGemelo(producciones, movimientos)).toHaveLength(0)
  })

  it('conserva un ingreso cargado directo en Cámaras (sin gemelo en producciones)', () => {
    const producciones = []
    const movimientos  = [mov('DULCE DE LECHE', 10, '2026-07-10')]
    expect(movimientosSinGemelo(producciones, movimientos)).toHaveLength(1)
  })

  it('con módulo + cámara-directo del mismo producto/kg/día: deja pasar solo el extra', () => {
    // 1 producción por Producción (gemelo) + 1 ingreso directo en Cámaras.
    const producciones = [prod('MINI BARRA TRICOLOR', 18.82, '2026-07-10')]
    const movimientos  = [
      mov('MINI BARRA TRICOLOR', 18.82, '2026-07-10'),   // gemelo → se quita
      mov('MINI BARRA TRICOLOR', 18.82, '2026-07-10'),   // directo → se conserva
    ]
    expect(movimientosSinGemelo(producciones, movimientos)).toHaveLength(1)
  })

  it('no confunde días distintos', () => {
    const producciones = [prod('HELADO X', 5, '2026-07-10')]
    const movimientos  = [mov('HELADO X', 5, '2026-07-11')]  // otro día → se conserva
    expect(movimientosSinGemelo(producciones, movimientos)).toHaveLength(1)
  })

  it('matchea aunque el nombre difiera en acentos/mayúsculas', () => {
    const producciones = [prod('Crema Rusa', 12, '2026-07-10')]
    const movimientos  = [mov('CREMA RUSA', 12, '2026-07-10')]
    expect(movimientosSinGemelo(producciones, movimientos)).toHaveLength(0)
  })

  it('impulsivos: gemelo por baldes (unidades) también se elimina', () => {
    const producciones = [{ producto_nombre: 'CONITO', peso_kg: 120, fecha: '2026-07-10' }]
    const movimientos  = [{ producto_nombre: 'CONITO', baldes: 120, tipo_producto: 'impulsivo', fecha: '2026-07-10' }]
    expect(movimientosSinGemelo(producciones, movimientos)).toHaveLength(0)
  })

  it('dos producciones iguales el mismo día quitan sus dos gemelos', () => {
    const producciones = [prod('X', 4.09, '2026-07-10'), prod('X', 4.09, '2026-07-10')]
    const movimientos  = [mov('X', 4.09, '2026-07-10'), mov('X', 4.09, '2026-07-10')]
    expect(movimientosSinGemelo(producciones, movimientos)).toHaveLength(0)
  })
})
