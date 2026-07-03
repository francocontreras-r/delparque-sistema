import { describe, it, expect } from 'vitest'
import { construirAlertas, resumenSeveridad, SEVERIDAD } from './alertas'

// Fecha de hoy fija para los tests de vencimiento/órdenes.
const hoy = '2026-07-03'
const enDias = (d) => {
  const base = new Date('2026-07-03T00:00:00')
  base.setDate(base.getDate() + d)
  return base.toISOString().slice(0, 10)
}

describe('construirAlertas', () => {
  it('sin datos → sin alertas', () => {
    expect(construirAlertas({})).toEqual([])
  })

  it('insumo sin stock (con mínimo) es crítico; sin mínimo no cuenta', () => {
    const a = construirAlertas({ insumos: [
      { nombre: 'LECHE', stock_actual: 0, stock_minimo: 10 },
      { nombre: 'DECORACIÓN', stock_actual: 0, stock_minimo: 0 }, // sin mínimo → no se usa
    ] })
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ id: 'insumo-sin-stock', severidad: 'critico', count: 1 })
    expect(a[0].items).toEqual(['LECHE'])
  })

  it('insumo bajo mínimo es alto', () => {
    const a = construirAlertas({ insumos: [{ nombre: 'AZÚCAR', stock_actual: 3, stock_minimo: 10 }] })
    expect(a[0]).toMatchObject({ id: 'insumo-bajo-minimo', severidad: 'alto', count: 1 })
  })

  it('producto a pérdida es crítico; margen bajo es medio', () => {
    const a = construirAlertas({ margenes: [
      { nombre: 'VAINILLA', costo: 100, precio: 80 },   // pérdida
      { nombre: 'CHOCOLATE', costo: 90, precio: 100 },  // margen 10% < 15
      { nombre: 'DULCE', costo: 50, precio: 100 },      // margen 50% → OK
    ] })
    const perdida = a.find(x => x.id === 'margen-negativo')
    const bajo = a.find(x => x.id === 'margen-bajo')
    expect(perdida).toMatchObject({ severidad: 'critico', count: 1 })
    expect(perdida.items).toEqual(['VAINILLA'])
    expect(bajo).toMatchObject({ severidad: 'medio', count: 1 })
    expect(bajo.items).toEqual(['CHOCOLATE'])
  })

  it('ignora márgenes sin precio o sin costo', () => {
    const a = construirAlertas({ margenes: [
      { nombre: 'SIN PRECIO', costo: 100, precio: 0 },
      { nombre: 'SIN COSTO', costo: 0, precio: 100 },
    ] })
    expect(a).toEqual([])
  })

  it('cámara: agotado (alto) y poco stock ≤3 (medio)', () => {
    const a = construirAlertas({ camaras: [
      { nombre: 'MENTA', tipo_producto: 'helado', baldes: 0 },
      { nombre: 'FRUTILLA', tipo_producto: 'helado', baldes: 2 },
      { nombre: 'LIMÓN', tipo_producto: 'helado', baldes: 20 },
    ] })
    expect(a.find(x => x.id === 'camara-agotada')).toMatchObject({ severidad: 'alto', count: 1 })
    expect(a.find(x => x.id === 'camara-poco')).toMatchObject({ severidad: 'medio', count: 1 })
  })

  it('vencimientos: vencido crítico, por vencer alto', () => {
    const a = construirAlertas({ vencimientos: [
      { producto_nombre: 'CREMA', fecha_vencimiento: enDias(-2) },
      { producto_nombre: 'LECHE', fecha_vencimiento: enDias(3) },
      { producto_nombre: 'HARINA', fecha_vencimiento: enDias(60) }, // OK, no alerta
    ] })
    expect(a.find(x => x.id === 'venc-vencido')).toMatchObject({ severidad: 'critico', count: 1 })
    expect(a.find(x => x.id === 'venc-pronto')).toMatchObject({ severidad: 'alto', count: 1 })
  })

  it('conteos con diferencia sin motivo → alto; los que tienen motivo no cuentan', () => {
    const conteos = [
      { tipo: 'deposito', producto_nombre: 'LECHE', diferencia: -5, valor_impacto: -500, motivo: null, fecha: '2026-07-02' },
      { tipo: 'camara', producto_nombre: 'VAINILLA', diferencia: 3, valor_impacto: 900, motivo: '', fecha: '2026-07-02' },
      { tipo: 'deposito', producto_nombre: 'AZÚCAR', diferencia: -2, valor_impacto: -200, motivo: 'Rotura', fecha: '2026-07-02' }, // resuelta
    ]
    const a = construirAlertas({ conteos })
    const c = a.find(x => x.id === 'conteo-sin-resolver')
    expect(c).toMatchObject({ severidad: 'alto', count: 2 })
    expect(c.detalle).toContain('$500') // faltante valorizado sin explicar
  })

  it('órdenes atrasadas (>1 día sin iniciar) es medio; requiere hoy', () => {
    const ordenesPendientes = [
      { numero: 12, fecha_produccion: enDias(-3) }, // atrasada
      { numero: 13, fecha_produccion: hoy },        // de hoy → no
    ]
    expect(construirAlertas({ ordenesPendientes })).toEqual([]) // sin hoy no evalúa
    const a = construirAlertas({ ordenesPendientes, hoy })
    expect(a.find(x => x.id === 'orden-atrasada')).toMatchObject({ severidad: 'medio', count: 1 })
  })

  it('ordena por severidad: críticos primero', () => {
    const a = construirAlertas({
      insumos: [{ nombre: 'X', stock_actual: 0, stock_minimo: 5 }], // crítico
      camaras: [{ nombre: 'Y', tipo_producto: 'helado', baldes: 2 }], // medio
    })
    expect(a.map(x => x.severidad)).toEqual(['critico', 'medio'])
    expect(SEVERIDAD[a[0].severidad]).toBeLessThan(SEVERIDAD[a[1].severidad])
  })
})

describe('resumenSeveridad', () => {
  it('suma counts por severidad y detecta el peor', () => {
    const alertas = construirAlertas({
      insumos: [{ nombre: 'X', stock_actual: 0, stock_minimo: 5 }, { nombre: 'Z', stock_actual: 2, stock_minimo: 5 }],
      camaras: [{ nombre: 'Y', tipo_producto: 'helado', baldes: 2 }],
    })
    const r = resumenSeveridad(alertas)
    expect(r.critico).toBe(1)
    expect(r.alto).toBe(1)
    expect(r.medio).toBe(1)
    expect(r.total).toBe(3)
    expect(r.peor).toBe('critico')
  })

  it('sin alertas → peor null', () => {
    expect(resumenSeveridad([]).peor).toBeNull()
  })
})
