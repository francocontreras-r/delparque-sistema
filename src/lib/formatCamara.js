// Helpers globales para mostrar cantidades de cámaras según tipo_producto.
// Regla: helado → baldes + kg | impulsivo → solo unidades | postre → unidades + kg

export function formatStock(item) {
  const tipo   = item.tipo_producto || 'helado'
  const baldes = Number(item.baldes) || 0
  const kg     = Number(item.kg)     || 0
  if (tipo === 'impulsivo') return `${baldes} unidades`
  if (tipo === 'postre')    return `${baldes} unidades / ${kg.toFixed(1)} kg`
  return `${baldes} baldes / ${kg.toFixed(1)} kg`
}

export function labelUnidad(tipo_producto) {
  if (tipo_producto === 'impulsivo') return 'Unidades'
  if (tipo_producto === 'postre')    return 'Unidades'
  return 'Baldes'
}

export function labelDetalle(tipo_producto) {
  if (tipo_producto === 'impulsivo') return 'unidades'
  if (tipo_producto === 'postre')    return 'unidades / kg'
  return 'baldes / kg'
}

// Formatea la cantidad de un registro de producciones según tipo
export function formatCantidadProduccion(item) {
  const cat = (item.categoria || '').toLowerCase()
  const esPostre    = cat === 'postre'
  const esImpulsivo = cat.includes('impulsiv')
  const kg = Number(item.peso_kg) || 0

  if (esImpulsivo) return `${Math.round(item._unidades ?? kg)} u`
  if (esPostre) {
    const u = item._unidades ? `${Math.round(item._unidades)} u` : null
    const kgStr = kg > 0 ? `${kg.toFixed(1)} kg` : null
    if (u && kgStr) return `${u} / ${kgStr}`
    return kgStr || u || '—'
  }
  return `${kg.toFixed(3)} kg`
}
