// ════════════════════════════════════════════════════════════════════════════
// Costeo de materia prima a producción (backflush)
// Toma lo que INGRESÓ a cámara en un período (producto terminado) y explota las
// recetas hasta la materia prima cruda del depósito, costeándola a valores
// actuales. Es la forma precisa de calcular cuánta MP se consumió en producción,
// independiente de si el egreso se registró a mano en Depósito.
//
// Reglas (sin doble conteo):
//  - SABOR (helado, en kg): saborizantes propios + la BASE explotada (la base no
//    entra a cámara, por eso hay que costearla). Prorrateado por el rinde del
//    batch = litros_base + extra_kg.
//  - IMPULSIVO/POSTRE (en unidades): solo la materia prima CRUDA de su receta.
//    Los componentes que son sabores/bases ya se contaron cuando esos sabores
//    entraron a cámara → se omiten (si no, se contarían dos veces).
// ════════════════════════════════════════════════════════════════════════════
import { normalizarNombre as norm } from './texto'
import { POSTRES } from './postres'

const LITROS_BATCH = 120

export function costearProduccion(movsIngreso, ctx) {
  const { sabores = [], saborIngredientes = [], bases = [], baseIngredientes = [],
    impulsivos = [], impulsivoIngredientes = [], insumos = [] } = ctx

  // Costo actual por insumo (un insumo "crudo" es el que existe en la tabla insumos)
  const costoIns = {}
  insumos.forEach(i => { costoIns[norm(i.nombre)] = Number(i.costo_unitario) || 0 })
  const esInsumo = nombre => Object.prototype.hasOwnProperty.call(costoIns, norm(nombre))

  const saborPorNombre = {}; sabores.forEach(s => { saborPorNombre[norm(s.nombre)] = s })
  const basePorNombre  = {}; bases.forEach(b => { basePorNombre[norm(b.nombre)] = b })
  const esAgua = nombre => norm(nombre).includes('agua')
  // Un ingrediente es intermedio si es una base o un sabor (no es MP del depósito).
  const esIntermedio = nombre => !!basePorNombre[norm(nombre)] || !!saborPorNombre[norm(nombre)]
  const impPorNombre   = {}; impulsivos.forEach(i => { impPorNombre[norm(i.nombre)] = i })
  const postrePorNombre = {}; POSTRES.forEach(p => { postrePorNombre[norm(p.nombre)] = p })

  const porInsumo = {}     // nombre -> { nombre, cantidad, valor }
  const sinCosto = new Set()
  const sinReceta = new Set()
  const intermedios = new Set() // componentes saltados (sabores dentro de impulsivos/postres)

  const addInsumo = (nombre, cantidad) => {
    if (!(cantidad > 0)) return
    const c = costoIns[norm(nombre)]
    if (!(c > 0)) sinCosto.add(nombre)
    if (!porInsumo[nombre]) porInsumo[nombre] = { nombre, cantidad: 0, valor: 0 }
    porInsumo[nombre].cantidad += cantidad
    porInsumo[nombre].valor += cantidad * (c || 0)
  }

  // Explota un sabor (en kg) → saborizantes + base
  const explotarSabor = (sabor, kg) => {
    if (!(kg > 0)) return
    const ings = saborIngredientes.filter(i => i.sabor_id === sabor.id)
    const extraKg = ings.filter(i => (i.unidad || '').toLowerCase() === 'kg').reduce((a, i) => a + (Number(i.cantidad) || 0), 0)
    const litrosBase = Number(sabor.litros_base) || LITROS_BATCH
    const rinde = litrosBase + extraKg
    if (rinde <= 0) return
    // Saborizantes propios (MP cruda): se omite el agua (gratis) y los
    // intermedios (la base se costea aparte vía base_nombre).
    ings.forEach(i => {
      if (esAgua(i.insumo_nombre) || esIntermedio(i.insumo_nombre)) return
      addInsumo(i.insumo_nombre, (Number(i.cantidad) || 0) / rinde * kg)
    })
    // Base: kg de base por kg de sabor = litros_base / rinde
    const base = basePorNombre[norm(sabor.base_nombre || '')]
    if (base) {
      const bings = baseIngredientes.filter(i => i.base_id === base.id)
      const litrosBatch = Number(base.litros_batch) || LITROS_BATCH
      const kgBasePorKgSabor = litrosBase / rinde
      bings.forEach(i => addInsumo(i.insumo_nombre, (Number(i.cantidad) || 0) / litrosBatch * kgBasePorKgSabor * kg))
    } else if (sabor.base_nombre) {
      // El sabor declara una base que no se pudo resolver: avisamos
      sinReceta.add(`base de ${sabor.nombre}`)
    }
  }

  // Explota un impulsivo/postre (en unidades) → solo MP cruda; omite intermedios
  const explotarUnidad = (ings, unidades) => {
    if (!(unidades > 0)) return
    ings.forEach(i => {
      const nombre = i.insumo_nombre || i.nombre
      if (esAgua(nombre)) return // gratis, no se almacena
      if (esInsumo(nombre)) addInsumo(nombre, (Number(i.cantidad) || 0) * unidades)
      else intermedios.add(nombre) // sabor/base ya contado en su propio ingreso a cámara
    })
  }

  movsIngreso.forEach(m => {
    const nombre = m.sabor_nombre || m.producto_nombre || ''
    const tp = (m.tipo_producto || 'helado')
    if (tp === 'helado') {
      const sabor = saborPorNombre[norm(nombre)]
      if (!sabor) { sinReceta.add(nombre); return }
      explotarSabor(sabor, Number(m.kg) || 0)
    } else {
      const unidades = Number(m.baldes) || 0
      const imp = impPorNombre[norm(nombre)]
      let ings = imp ? impulsivoIngredientes.filter(i => i.impulsivo_id === imp.id) : null
      if (!ings || !ings.length) {
        const postre = postrePorNombre[norm(nombre)]
        if (postre) ings = (postre.ingredientes || []).map(i => ({ insumo_nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad }))
      }
      if (!ings || !ings.length) { sinReceta.add(nombre); return }
      explotarUnidad(ings, unidades)
    }
  })

  const lista = Object.values(porInsumo).sort((a, b) => b.valor - a.valor)
  const total = lista.reduce((a, p) => a + p.valor, 0)
  return {
    total,
    porInsumo: lista,
    sinCosto: [...sinCosto].sort(),
    sinReceta: [...sinReceta].sort(),
    intermedios: [...intermedios].sort(),
  }
}
