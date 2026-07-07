// ════════════════════════════════════════════════════════════════════════════
// Centro de control — motor de excepciones
// Convierte los datos crudos (stock, cámara, márgenes, vencimientos, órdenes) en
// una lista PRIORIZADA de cosas que requieren acción hoy. Es el corazón que
// transforma el sistema de "registro" en "control": no espera que alguien mire
// las tablas, junta lo que está mal y lo ordena por urgencia.
//
// Puro y testeable: no toca la DB. El Dashboard le pasa los datos ya cargados.
// ════════════════════════════════════════════════════════════════════════════
import { clasificarVencimiento, esAlertaVencimiento } from './vencimientos'
import { discrepanciasSinResolver } from './conteos'

// Menor número = más urgente (para ordenar).
export const SEVERIDAD = { critico: 0, alto: 1, medio: 2, info: 3 }

// Margen "sano" por defecto: por debajo de esto, avisamos.
export const MARGEN_MINIMO = 15

// Arma el texto "A, B, C y N más" a partir de una lista de nombres.
function listar(nombres, max = 3) {
  const arr = nombres.filter(Boolean)
  const cabeza = arr.slice(0, max).join(', ')
  const extra = arr.length > max ? ` y ${arr.length - max} más` : ''
  return cabeza + extra
}

const plural = (n, sing, plur) => `${n} ${n === 1 ? sing : plur}`

// margenes: [{ nombre, costo, precio }] — costo y precio por unidad de venta.
// vencimientos: [{ producto_nombre, lote, fecha_vencimiento }] (ya deduplicado).
export function construirAlertas({
  insumos = [], camaras = [], ordenesPendientes = [], vencimientos = [],
  margenes = [], conteos = [], hoy = null, margenMinimo = MARGEN_MINIMO,
} = {}) {
  const A = []
  const push = (a) => A.push(a)

  // 1. Insumos SIN stock (con mínimo definido → se usan de verdad).
  const sinStock = insumos.filter(i => (Number(i.stock_actual) || 0) <= 0 && (Number(i.stock_minimo) || 0) > 0)
  if (sinStock.length) push({
    id: 'insumo-sin-stock', severidad: 'critico', categoria: 'Depósito', emoji: '🔴',
    titulo: `${plural(sinStock.length, 'insumo sin stock', 'insumos sin stock')}`,
    detalle: listar(sinStock.map(i => i.nombre)), count: sinStock.length, to: '/deposito?foco=sin_stock',
    items: sinStock.map(i => i.nombre),
  })

  // 2. Insumos bajo el mínimo (hay algo, pero menos que el mínimo).
  const bajoMin = insumos.filter(i => { const s = Number(i.stock_actual) || 0, m = Number(i.stock_minimo) || 0; return s > 0 && s < m })
  if (bajoMin.length) push({
    id: 'insumo-bajo-minimo', severidad: 'alto', categoria: 'Depósito', emoji: '🟡',
    titulo: `${plural(bajoMin.length, 'insumo bajo el mínimo', 'insumos bajo el mínimo')}`,
    detalle: listar(bajoMin.map(i => i.nombre)), count: bajoMin.length, to: '/deposito?foco=bajo_minimo',
    items: bajoMin.map(i => i.nombre),
  })

  // 3. Productos que se venden A PÉRDIDA (precio < costo). Lo más caro de no ver.
  const perdida = margenes.filter(m => (Number(m.precio) || 0) > 0 && (Number(m.costo) || 0) > 0 && Number(m.precio) < Number(m.costo))
  if (perdida.length) push({
    id: 'margen-negativo', severidad: 'critico', categoria: 'Finanzas', emoji: '📉',
    titulo: `${plural(perdida.length, 'producto se vende a pérdida', 'productos se venden a pérdida')}`,
    detalle: listar(perdida.map(m => m.nombre)), count: perdida.length, to: '/finanzas?foco=perdida',
    items: perdida.map(m => m.nombre),
  })

  // 4. Margen bajo (rentable pero por debajo del umbral sano).
  const margenBajo = margenes.filter(m => {
    const c = Number(m.costo) || 0, p = Number(m.precio) || 0
    if (!(c > 0 && p > 0) || p < c) return false
    return ((p - c) / p) * 100 < margenMinimo
  })
  if (margenBajo.length) push({
    id: 'margen-bajo', severidad: 'medio', categoria: 'Finanzas', emoji: '⚠️',
    titulo: `${plural(margenBajo.length, 'producto con margen bajo', 'productos con margen bajo')} (<${margenMinimo}%)`,
    detalle: listar(margenBajo.map(m => m.nombre)), count: margenBajo.length, to: '/finanzas?foco=margen_bajo',
    items: margenBajo.map(m => m.nombre),
  })

  // 5/6. Cámara — sabores (helados) agotados o con poco stock.
  const helados = camaras.filter(c => (c.tipo_producto || 'helado') === 'helado')
  const agotadas = helados.filter(c => (Number(c.baldes) || 0) === 0)
  if (agotadas.length) push({
    id: 'camara-agotada', severidad: 'alto', categoria: 'Cámara', emoji: '🔴',
    titulo: `${plural(agotadas.length, 'sabor agotado en cámara', 'sabores agotados en cámara')}`,
    detalle: listar(agotadas.map(c => c.nombre)), count: agotadas.length, to: '/camaras?foco=agotado',
    items: agotadas.map(c => c.nombre),
  })
  const pocas = helados.filter(c => { const b = Number(c.baldes) || 0; return b > 0 && b <= 3 })
  if (pocas.length) push({
    id: 'camara-poco', severidad: 'medio', categoria: 'Cámara', emoji: '🟡',
    titulo: `${plural(pocas.length, 'sabor con poco stock', 'sabores con poco stock')} (≤3 baldes)`,
    detalle: listar(pocas.map(c => c.nombre)), count: pocas.length, to: '/camaras?foco=poco',
    items: pocas.map(c => c.nombre),
  })

  // 7. Vencimientos — vencidos (crítico) y por vencer (alto).
  const vencClas = vencimientos.map(v => ({ ...v, clasif: clasificarVencimiento(v.fecha_vencimiento) })).filter(v => esAlertaVencimiento(v.clasif))
  const vencidos = vencClas.filter(v => v.clasif.estado === 'vencido')
  const porVencer = vencClas.filter(v => v.clasif.estado !== 'vencido')
  if (vencidos.length) push({
    id: 'venc-vencido', severidad: 'critico', categoria: 'Depósito', emoji: '🔴',
    titulo: `${plural(vencidos.length, 'lote vencido', 'lotes vencidos')}`,
    detalle: listar(vencidos.map(v => v.producto_nombre)), count: vencidos.length, to: '/deposito?foco=vencimientos',
    items: vencidos.map(v => v.producto_nombre),
  })
  if (porVencer.length) push({
    id: 'venc-pronto', severidad: 'alto', categoria: 'Depósito', emoji: '🟠',
    titulo: `${plural(porVencer.length, 'lote por vencer', 'lotes por vencer')}`,
    detalle: listar(porVencer.map(v => v.producto_nombre)), count: porVencer.length, to: '/deposito?foco=vencimientos',
    items: porVencer.map(v => v.producto_nombre),
  })

  // 7b. Conteos con diferencia SIN RESOLVER (faltante/sobrante sin motivo).
  const sinResolver = discrepanciasSinResolver(conteos)
  if (sinResolver.length) {
    const faltantes = sinResolver.filter(r => (Number(r.diferencia) || 0) < 0)
    const valorFaltante = faltantes.reduce((s, r) => s + Math.abs(Number(r.valor_impacto) || 0), 0)
    const areaDe = r => r.tipo === 'camara' ? 'Cámara' : 'Depósito'
    push({
      id: 'conteo-sin-resolver', severidad: 'alto', categoria: 'Conteo', emoji: '🧮',
      titulo: `${plural(sinResolver.length, 'diferencia de conteo sin resolver', 'diferencias de conteo sin resolver')}`,
      detalle: (valorFaltante > 0 ? `Faltante sin explicar $${Math.round(valorFaltante).toLocaleString('es-AR')} · ` : '') +
        listar(sinResolver.map(r => `${r.producto_nombre} (${areaDe(r)})`)),
      count: sinResolver.length, to: '/deposito?foco=conteo', items: sinResolver.map(r => r.producto_nombre),
    })
  }

  // 8. Órdenes programadas hace más de 1 día que siguen sin iniciar.
  if (hoy) {
    const hoyMs = new Date(hoy + 'T00:00:00').getTime()
    const atrasadas = ordenesPendientes.filter(o => {
      if (!o.fecha_produccion) return false
      const f = new Date(o.fecha_produccion + 'T00:00:00').getTime()
      return (hoyMs - f) / 86400000 > 1
    })
    if (atrasadas.length) push({
      id: 'orden-atrasada', severidad: 'medio', categoria: 'Producción', emoji: '📋',
      titulo: `${plural(atrasadas.length, 'orden sin iniciar', 'órdenes sin iniciar')}`,
      detalle: `Programadas hace más de 1 día: ${listar(atrasadas.map(o => '#' + o.numero))}`,
      count: atrasadas.length, to: '/ordenes', items: atrasadas.map(o => '#' + o.numero),
    })
  }

  return A.sort((a, b) => SEVERIDAD[a.severidad] - SEVERIDAD[b.severidad])
}

// Totales por severidad para el encabezado del centro de control.
export function resumenSeveridad(alertas = []) {
  const sum = (sev) => alertas.filter(a => a.severidad === sev).reduce((s, a) => s + a.count, 0)
  return {
    critico: sum('critico'), alto: sum('alto'), medio: sum('medio'),
    total: alertas.reduce((s, a) => s + a.count, 0),
    peor: alertas[0]?.severidad || null,
  }
}
