// ════════════════════════════════════════════════════════════════════════════
// Costeo de recetas con rollup de intermedios
// Un ingrediente de receta puede ser:
//   - Materia prima cruda (insumo del depósito) → costo = costo_unitario.
//   - Intermedio (base o sabor del proceso anterior) → costo = el de SU receta,
//     resuelto recursivamente (un sabor suma su base; un postre sus sabores).
//   - Agua → gratis (no se almacena).
// Devuelve costo POR UNIDAD del ingrediente (por kg/L/u según corresponda).
// ════════════════════════════════════════════════════════════════════════════
import { normalizarNombre as norm } from './texto'

const LITROS_BATCH = 120
const esAgua = n => norm(n || '').includes('agua')

export function crearCosteador({ insumos = [], bases = [], baseIngredientes = [], sabores = [], saborIngredientes = [] } = {}) {
  const costoInsumo = {}; insumos.forEach(i => { costoInsumo[norm(i.nombre)] = Number(i.costo_unitario) || 0 })
  const basePorNombre = {}; bases.forEach(b => { basePorNombre[norm(b.nombre)] = b })
  const saborPorNombre = {}; sabores.forEach(s => { saborPorNombre[norm(s.nombre)] = s })
  const cache = {}

  const esBase = n => !!basePorNombre[norm(n)]
  const esSabor = n => !!saborPorNombre[norm(n)]
  // "Agua libre" = agua de red (gratis, no se almacena). Excluye bases/sabores
  // que tengan "agua" en el nombre (ej. "Base Neutra Agua"), que SÍ tienen costo
  // propio. Sin esto, cualquier producto con "agua" en el nombre costaba $0.
  const esAguaLibre = n => esAgua(n) && !esBase(n) && !esSabor(n)

  // Costo por L de una base = Σ(materia prima del batch) / litros_batch
  function costoBaseL(base, visit) {
    const k = 'b:' + norm(base.nombre)
    if (k in cache) return cache[k]
    if (visit.has(k)) return 0 // corta ciclos
    visit.add(k)
    const ings = baseIngredientes.filter(i => i.base_id === base.id)
    const litros = Number(base.litros_batch) || LITROS_BATCH
    let total = 0
    ings.forEach(i => { if (!esAguaLibre(i.insumo_nombre)) total += (Number(i.cantidad) || 0) * costoDe(i.insumo_nombre, visit) })
    visit.delete(k)
    const r = litros > 0 ? total / litros : 0
    cache[k] = r
    return r
  }

  // Costo por kg de un sabor = (base + saborizantes) / rinde del batch
  function costoSaborKg(sabor, visit) {
    const k = 's:' + norm(sabor.nombre)
    if (k in cache) return cache[k]
    if (visit.has(k)) return 0
    visit.add(k)
    const ings = saborIngredientes.filter(i => i.sabor_id === sabor.id)
    // ¿La base está cargada como ingrediente? (ej. "Neutra Leche" 120 L)
    let litrosBase = 0, baseEnIngs = false
    ings.forEach(i => { if (esBase(i.insumo_nombre)) { baseEnIngs = true; litrosBase += Number(i.cantidad) || 0 } })
    if (!baseEnIngs) litrosBase = Number(sabor.litros_base) || LITROS_BATCH
    const extraKg = ings
      .filter(i => (i.unidad || '').toLowerCase() === 'kg' && !esAgua(i.insumo_nombre) && !esBase(i.insumo_nombre) && !esSabor(i.insumo_nombre))
      .reduce((a, i) => a + (Number(i.cantidad) || 0), 0)
    const rinde = litrosBase + extraKg
    let total = 0
    ings.forEach(i => { if (!esAguaLibre(i.insumo_nombre)) total += (Number(i.cantidad) || 0) * costoDe(i.insumo_nombre, visit) })
    // Si la base no estaba como ingrediente, se suma vía base_nombre
    if (!baseEnIngs) {
      const b = basePorNombre[norm(sabor.base_nombre || '')]
      if (b) total += litrosBase * costoBaseL(b, visit)
    }
    visit.delete(k)
    const r = rinde > 0 ? total / rinde : 0
    cache[k] = r
    return r
  }

  // Costo por unidad de cualquier ingrediente (resuelve su tipo). Primero base/
  // sabor (una base con "agua" en el nombre tiene su costo), recién después el
  // agua de red gratis.
  function costoDe(nombre, visit = new Set()) {
    const b = basePorNombre[norm(nombre)]; if (b) return costoBaseL(b, visit)
    const s = saborPorNombre[norm(nombre)]; if (s) return costoSaborKg(s, visit)
    if (esAgua(nombre)) return 0
    return costoInsumo[norm(nombre)] || 0
  }

  function tipoDe(nombre) {
    if (esBase(nombre) || esSabor(nombre)) return 'intermedio'
    if (esAgua(nombre)) return 'agua'
    return 'insumo'
  }

  return { costoDe, tipoDe }
}
