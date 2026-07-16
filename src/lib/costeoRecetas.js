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
// Agua de red (gratis). SOLO el agua de verdad: nombre exacto "agua" o que EMPIECE
// con "agua " (ej. "agua potable"). Antes usaba includes('agua'), lo que tomaba como
// agua a cualquier insumo con esa palabra al final del nombre (ej. "Papel puntos
// amarillos limón agua", "Frutilla al agua") y los dejaba en $0 / "no se almacena".
const esAgua = n => {
  const x = norm(n || '')
  return x === 'agua' || x.startsWith('agua ')
}

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
  // Densidad de una base = kg reales por tanda / litros de la tanda. Convierte los
  // litros de base a los KG reales que rinde el helado. Si no hay peso_kg, vale 1.
  const densBase = nombre => {
    const b = basePorNombre[norm(nombre || '')]
    return (b && Number(b.peso_kg) > 0 && Number(b.litros_batch) > 0) ? Number(b.peso_kg) / Number(b.litros_batch) : 1
  }

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
    // litrosBase = litros de base (para el COSTO); kgBase = kg reales que rinde
    // esa base (litros × densidad), para el RINDE en kg.
    let litrosBase = 0, kgBase = 0, baseEnIngs = false
    ings.forEach(i => {
      if (esBase(i.insumo_nombre)) {
        baseEnIngs = true
        const lit = Number(i.cantidad) || 0
        litrosBase += lit
        kgBase += lit * densBase(i.insumo_nombre)
      }
    })
    if (!baseEnIngs) {
      litrosBase = Number(sabor.litros_base) || LITROS_BATCH
      kgBase = litrosBase * densBase(sabor.base_nombre)
    }
    const extraKg = ings
      .filter(i => (i.unidad || '').toLowerCase() === 'kg' && !esAgua(i.insumo_nombre) && !esBase(i.insumo_nombre) && !esSabor(i.insumo_nombre))
      .reduce((a, i) => a + (Number(i.cantidad) || 0), 0)
    // Rinde: si el sabor tiene peso_kg fijado a mano, manda (ej. una masa/intermedio
    // sin base). Si no, kg de base (litros × densidad) + kg de agregados.
    const rinde = Number(sabor.peso_kg) > 0 ? Number(sabor.peso_kg) : (kgBase + extraKg)
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
