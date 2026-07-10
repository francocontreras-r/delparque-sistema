// Conversión de movimientos de depósito a la unidad del stock del insumo.
//
// Cada insumo lleva su stock en UNA unidad (insumo.unidad: 'kg', 'L' o 'u').
// El operario, en cambio, suele cargar en la presentación real (ej. 7 baldes).
// Estas funciones traducen la cantidad del movimiento a la unidad del stock para
// no mezclar unidades: si el stock está en kg y el movimiento viene en baldes,
// se convierte con el peso por unidad.
//
// Origen del bug que arreglan: un egreso de "7 baldes x 10 kg" se descontaba como
// 7 (kg) en vez de 70, porque el peso por unidad era opcional y no se aplicaba.

// ¿El movimiento necesita el peso por unidad para descontar bien el stock?
// (stock en kg/L pero el operario carga en presentación/unidades).
export function requiereConversionKg(unidadMov, unidadStock) {
  return unidadMov === 'u' && (unidadStock === 'kg' || unidadStock === 'L')
}

// Devuelve la cantidad del movimiento EXPRESADA EN LA UNIDAD DEL STOCK.
// Devuelve null cuando la conversión es necesaria pero falta el peso por unidad:
// el llamador DEBE bloquear en vez de descontar mal.
export function deltaEnUnidadStock({ cantidad, unidadMov, unidadStock, pesoPorUnidad }) {
  const c = Number(cantidad) || 0
  const uStock = unidadStock || unidadMov || 'u'
  if (unidadMov === uStock) return c                     // misma unidad → directo
  if (requiereConversionKg(unidadMov, uStock)) {
    const f = Number(pesoPorUnidad) || 0
    return f > 0 ? c * f : null                          // baldes → kg (peso obligatorio)
  }
  // Combinaciones inusuales (kg→u, L→kg, etc.): no adivinamos, dejamos la cantidad
  // tal cual. En la práctica no se dan porque la unidad del stock manda.
  return c
}
