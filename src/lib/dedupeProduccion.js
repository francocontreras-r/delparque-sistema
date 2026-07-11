import { normalizarNombre } from './texto'

// El módulo Producción escribe cada elaboración en DOS tablas: `producciones`
// (con lote) y `movimientos_camara` (motivo 'Producción', sin lote). Son el mismo
// hecho. Si el informe suma las dos, cada producción aparece repetida.
//
// Estas funciones quitan de los movimientos de cámara los que ya tienen su gemelo
// en producciones (mismo producto, kg y día), conservando los ingresos cargados
// DIRECTO desde Cámaras (que no dejan registro en producciones). El match es por
// conteo exacto: por cada fila de producciones se descuenta a lo sumo un movimiento.

// Cantidad comparable: producciones ya trae peso_kg; un movimiento de cámara crudo
// trae kg (helado/postre) o baldes (impulsivo).
function cantidadDe(r) {
  if (r.peso_kg != null) return r.peso_kg
  return (r.tipo_producto || 'helado') === 'impulsivo' ? (r.baldes || 0) : (r.kg || 0)
}

function clave(r) {
  const nombre = normalizarNombre(r.producto_nombre || r.sabor_nombre || '')
  const cant = Math.round(cantidadDe(r) * 1000)
  const dia = r.fecha || (r.created_at || '').split('T')[0] || ''
  return `${nombre}|${cant}|${dia}`
}

// Devuelve los movimientos de cámara SIN los que ya están representados en
// `producciones`. No modifica los arrays de entrada.
export function movimientosSinGemelo(producciones, movimientos) {
  const conteo = {}
  ;(producciones || []).forEach(r => { const k = clave(r); conteo[k] = (conteo[k] || 0) + 1 })
  return (movimientos || []).filter(m => {
    const k = clave(m)
    if (conteo[k] > 0) { conteo[k]--; return false }  // consume un gemelo
    return true
  })
}
