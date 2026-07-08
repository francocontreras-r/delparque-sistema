// ════════════════════════════════════════════════════════════════════════════
// Valuación del stock en cámara — FUENTE ÚNICA
// Antes cada módulo lo calculaba distinto (la pantalla Cámara y Finanzas no
// coincidían). Acá vive la única lógica: costo/precio por producto desde las
// tablas de Finanzas (costo_final; respaldo costo_total/rinde), y valuación del
// stock (helado y postre por kg; impulsivo por unidad), agrupando por nombre.
// Cámara y Finanzas importan esto → siempre dan el mismo número.
// ════════════════════════════════════════════════════════════════════════════
import { normalizarNombre as norm } from './texto'

const LITROS_BATCH = 120

// Respaldo si un producto no está en Finanzas (para no dar $0 al vuelo).
export const TIPO_PRECIOS_CAMARA = {
  Lisa:           { costo_kg: 1200, precio_kg: 2800 },
  'Con Agregado': { costo_kg: 1500, precio_kg: 3200 },
  Agua:           { costo_kg:  900, precio_kg: 2200 },
  Especial:       { costo_kg: 2000, precio_kg: 4500 },
}

// Mapa nombre→{costo, precio} desde las tablas de Finanzas.
// Sabor y postre: $/kg (costo_final o costo_total/rinde). Impulsivo: $/unidad.
export function construirPrecioMapCamara({ sabores = [], impulsivos = [], saborIngredientes = [] } = {}) {
  const extraKg = {}
  saborIngredientes.forEach(i => { if ((i.unidad || '').toLowerCase() === 'kg') extraKg[i.sabor_id] = (extraKg[i.sabor_id] || 0) + (Number(i.cantidad) || 0) })
  const map = {}
  sabores.forEach(s => {
    const rinde = (Number(s.litros_base) || LITROS_BATCH) + (extraKg[s.id] || 0)
    const costo = Number(s.costo_final) > 0 ? Number(s.costo_final) : (rinde > 0 ? (Number(s.costo_total) || 0) / rinde : 0)
    map[norm(s.nombre)] = { costo, precio: Number(s.precio_venta) || 0 }
  })
  impulsivos.forEach(i => {
    map[norm(i.nombre)] = { costo: Number(i.costo_final) > 0 ? Number(i.costo_final) : (Number(i.costo_total) || 0), precio: Number(i.precio_venta) || 0 }
  })
  return map
}

// Valoriza UN item de stock_camaras. Se valoriza por PESO (kg): helados Y postres
// (los postres se costean/venden por kg; las unidades son solo control de stock).
// Solo los IMPULSIVOS se valorizan por unidad.
export function valorizarItemCamara(item, precioMap = {}) {
  const m = precioMap[norm(item.nombre || '')] || {}
  const esUnid = item.tipo_producto === 'impulsivo'
  const costoUnit  = m.costo  || TIPO_PRECIOS_CAMARA[item.tipo]?.costo_kg  || 0
  const precioUnit = m.precio || TIPO_PRECIOS_CAMARA[item.tipo]?.precio_kg || 0
  const qty = esUnid ? (Number(item.baldes) || 0) : (Number(item.kg) || 0)
  return { costoUnit, precioUnit, valorCosto: qty * costoUnit, valorVenta: qty * precioUnit }
}

// Agrupa el stock por nombre (como la pantalla) y devuelve el valor total a
// costo y a precio de venta.
export function valorTotalCamara(stock = [], precioMap = {}) {
  const agrupados = {}
  stock.forEach(item => {
    const key = (item.nombre || '').trim().toUpperCase()
    if (agrupados[key]) {
      agrupados[key].kg += Number(item.kg) || 0
      agrupados[key].baldes += Number(item.baldes) || 0
    } else {
      agrupados[key] = { ...item, kg: Number(item.kg) || 0, baldes: Number(item.baldes) || 0 }
    }
  })
  return Object.values(agrupados).reduce((acc, item) => {
    const v = valorizarItemCamara(item, precioMap)
    acc.valorCosto += v.valorCosto
    acc.valorVenta += v.valorVenta
    return acc
  }, { valorCosto: 0, valorVenta: 0 })
}
