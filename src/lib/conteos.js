// ════════════════════════════════════════════════════════════════════════════
// Conteo de stock — modelo unificado (depósito + cámara)
// `conteos_stock` es la única fuente de verdad del control semanal. Los dos
// módulos (Depósito y Cámara) escriben acá; el informe semanal lee de acá.
//
// Anti-"dibujo": el conteo a ciegas oculta el stock del sistema mientras se
// carga el físico (modo='ciego'), y toda diferencia > umbral exige un motivo.
//
// DEGRADACIÓN SEGURA: si faltan las columnas nuevas (no se corrió
// sql/conteo_semanal.sql), el insert reintenta sin ellas para no romper el conteo.
// ════════════════════════════════════════════════════════════════════════════
import { normalizarNombre as norm } from './texto'

// supabase se importa de forma perezosa dentro de las funciones que tocan la DB,
// así este módulo se puede testear (las funciones puras) sin credenciales.

// Una diferencia se considera relevante si supera este % del stock del sistema.
export const UMBRAL_CONTEO = 0.05

export function esDiscrepancia(sistema, fisico, umbral = UMBRAL_CONTEO) {
  const s = Number(sistema) || 0
  // '' / null / undefined = físico no ingresado (Number('') sería 0, engañoso).
  if (fisico === '' || fisico == null) return false
  const f = Number(fisico)
  if (isNaN(f)) return false
  if (s === 0) return f !== 0
  return Math.abs(f - s) / Math.abs(s) > umbral
}

// Genera un id de ciclo (una sesión de conteo). crypto.randomUUID está en todos
// los navegadores modernos; el fallback cubre entornos sin crypto.
export function nuevoCiclo() {
  try { return crypto.randomUUID() } catch { return `ciclo-${Date.now()}-${Math.round(Math.random() * 1e6)}` }
}

function columnaFaltante(error) {
  if (!error) return false
  return error.code === '42703' || /column .* does not exist|could not find the .* column/i.test(error.message || '')
}

// Registra las filas de un conteo en conteos_stock.
// filas: [{ producto_nombre, stock_sistema, stock_fisico, motivo?, valor_impacto? }]
// area: 'deposito' | 'camara'
export async function registrarConteoStock({ area, filas, responsable, modo = 'normal', cicloId }) {
  if (!filas || filas.length === 0) return { ok: true, n: 0 }
  const ciclo = cicloId || nuevoCiclo()
  const base = filas.map(f => ({
    tipo: area,
    producto_nombre: f.producto_nombre,
    stock_sistema: Number(f.stock_sistema) || 0,
    stock_fisico: Number(f.stock_fisico) || 0,
    diferencia: (Number(f.stock_fisico) || 0) - (Number(f.stock_sistema) || 0),
    responsable: responsable || 'Sistema',
  }))
  const conExtra = base.map((row, i) => ({
    ...row,
    motivo: filas[i].motivo || null,
    valor_impacto: filas[i].valor_impacto == null ? null : Number(filas[i].valor_impacto),
    ciclo_id: ciclo,
    modo,
  }))
  try {
    const { supabase } = await import('./supabase')
    let { error } = await supabase.from('conteos_stock').insert(conExtra)
    if (error && columnaFaltante(error)) {
      // Columnas nuevas ausentes → guardamos lo básico para no perder el conteo.
      ;({ error } = await supabase.from('conteos_stock').insert(base))
    }
    if (error) { console.warn('registrarConteoStock:', error.message); return { ok: false, n: 0 } }
    return { ok: true, n: conExtra.length, cicloId: ciclo }
  } catch (e) {
    console.warn('registrarConteoStock:', e.message)
    return { ok: false, n: 0 }
  }
}

// Trae los conteos de un período (para el informe semanal). Devuelve filas crudas.
export async function cargarConteosPeriodo({ desde, hasta }) {
  try {
    const { supabase } = await import('./supabase')
    let q = supabase.from('conteos_stock').select('*')
    if (desde) q = q.gte('fecha', desde)
    if (hasta) q = q.lte('fecha', hasta)
    const { data, error } = await q.order('fecha', { ascending: false }).limit(5000)
    if (error) { console.warn('cargarConteosPeriodo:', error.message); return [] }
    return data || []
  } catch (e) {
    console.warn('cargarConteosPeriodo:', e.message)
    return []
  }
}

// Trae las filas de UN ciclo de conteo (para reimprimir su comprobante).
export async function cargarConteosCiclo(cicloId) {
  if (!cicloId) return []
  try {
    const { supabase } = await import('./supabase')
    const { data, error } = await supabase.from('conteos_stock').select('*').eq('ciclo_id', cicloId)
    if (error) { console.warn('cargarConteosCiclo:', error.message); return [] }
    return data || []
  } catch (e) { console.warn('cargarConteosCiclo:', e.message); return [] }
}

// Lista los conteos (agrupados por ciclo) de un período, para el Historial.
export async function cargarCiclos({ desde = null, hasta = null } = {}) {
  const rows = await cargarConteosPeriodo({ desde, hasta })
  const porCiclo = {}
  rows.forEach(r => {
    const k = r.ciclo_id || `${r.fecha}-${r.tipo}-${r.responsable}` // respaldo si no hay ciclo
    if (!porCiclo[k]) porCiclo[k] = { ciclo_id: r.ciclo_id || null, clave: k, fecha: r.fecha, area: r.tipo, responsable: r.responsable, modo: r.modo, n: 0, faltantes: 0, sobrantes: 0, valorFaltante: 0 }
    const g = porCiclo[k]; g.n++
    const d = Number(r.diferencia) || 0
    if (d < 0) { g.faltantes++; g.valorFaltante += Math.abs(Number(r.valor_impacto) || 0) }
    else if (d > 0) g.sobrantes++
    if (r.fecha > g.fecha) g.fecha = r.fecha
  })
  return Object.values(porCiclo).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
}

// ¿`r` debe reemplazar a `prev` como conteo autoritativo del mismo producto?
// Prioridad: id de inserción (una RECONTADA nueva pisa a la vieja, así una
// corrección se refleja en el informe) → fecha → a igual fecha, la que tiene
// motivo (aprobada) supera al conteo crudo.
function masAutoritativa(r, prev) {
  const ri = r.id != null ? Number(r.id) : null
  const pi = prev.id != null ? Number(prev.id) : null
  if (ri != null && pi != null && ri !== pi) return ri > pi
  const rf = r.fecha || '', pf = prev.fecha || ''
  if (rf !== pf) return rf > pf
  const rm = !!(r.motivo && String(r.motivo).trim())
  const pm = !!(prev.motivo && String(prev.motivo).trim())
  return !pm && rm
}

// Discrepancias SIN RESOLVER: de un lote de conteos, se queda con el último por
// (área, producto) y devuelve las que tienen diferencia ≠ 0 y NINGÚN motivo
// cargado. Es "el faltante/sobrante que nadie explicó ni reconcilió todavía".
// Puro: sirve para el Centro de control sin tocar la DB.
export function discrepanciasSinResolver(rows = []) {
  const latest = {}
  rows.forEach(r => {
    const k = `${r.tipo}::${norm(r.producto_nombre)}`
    if (!latest[k] || masAutoritativa(r, latest[k])) latest[k] = r
  })
  return Object.values(latest).filter(r =>
    (Number(r.diferencia) || 0) !== 0 && !(r.motivo && String(r.motivo).trim())
  )
}

// Re-valoriza las filas cuyo valor_impacto quedó en 0/null (porque el precio no
// estaba cargado al momento del conteo) usando el precio ACTUAL del producto:
// valor = diferencia × costo. precios: normalizarNombre(nombre) → costo unitario.
// Así los informes reflejan el costo real aunque el precio se cargue después.
export function revalorizarConteo(rows = [], precios = {}) {
  return (rows || []).map(r => {
    const vi = Number(r.valor_impacto) || 0
    if (vi !== 0) return r
    const d = Number(r.diferencia) || 0
    const p = Number(precios[norm(r.producto_nombre || '')]) || 0
    return (d !== 0 && p > 0) ? { ...r, valor_impacto: d * p } : r
  })
}

// Consolida los conteos de la semana: se queda con el ÚLTIMO conteo por
// (área, producto) para no duplicar si algo se contó en dos lugares, y separa
// faltantes (dif<0) de sobrantes (dif>0). Devuelve totales valorizados.
export function resumenSemanal(rows) {
  const ultimoPorClave = {}
  rows.forEach(r => {
    const clave = `${r.tipo}::${norm(r.producto_nombre)}`
    // Nos quedamos con el conteo autoritativo: una recontada más nueva (id mayor)
    // pisa a la vieja, así una corrección se refleja y no queda el dato erróneo.
    if (!ultimoPorClave[clave] || masAutoritativa(r, ultimoPorClave[clave])) ultimoPorClave[clave] = r
  })
  const items = Object.values(ultimoPorClave)
  // Diferencia redondeada a 3 decimales: elimina el ruido de punto flotante
  // (ej. 10.1 − 10.100000000000001 = -1e-15) que hacía que un producto SIN
  // diferencia real figurara como faltante "-0" con costo $0. Ahora esas colitas
  // se tratan como 0 (sin diferencia) y no ensucian el informe.
  const dif = r => { const d = Math.round((Number(r.diferencia) || 0) * 1000) / 1000; return d === 0 ? 0 : d }
  const faltantes = items.filter(r => dif(r) < 0)
    .sort((a, b) => (Number(a.valor_impacto) || 0) - (Number(b.valor_impacto) || 0))
  const sobrantes = items.filter(r => dif(r) > 0)
    .sort((a, b) => (Number(b.valor_impacto) || 0) - (Number(a.valor_impacto) || 0))
  const sinDif = items.filter(r => dif(r) === 0)
  const valorFaltante = faltantes.reduce((a, r) => a + Math.abs(Number(r.valor_impacto) || 0), 0)
  const valorSobrante = sobrantes.reduce((a, r) => a + Math.abs(Number(r.valor_impacto) || 0), 0)
  const porArea = { deposito: { faltantes: 0, sobrantes: 0, contados: 0 }, camara: { faltantes: 0, sobrantes: 0, contados: 0 } }
  items.forEach(r => {
    const a = porArea[r.tipo] || (porArea[r.tipo] = { faltantes: 0, sobrantes: 0, contados: 0 })
    a.contados += 1
    const d = dif(r)
    if (d < 0) a.faltantes += 1
    else if (d > 0) a.sobrantes += 1
  })
  return {
    items, faltantes, sobrantes, sinDif,
    valorFaltante, valorSobrante, impactoNeto: valorSobrante - valorFaltante,
    totalContados: items.length, porArea,
  }
}
