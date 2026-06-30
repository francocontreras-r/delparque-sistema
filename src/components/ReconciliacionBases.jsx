import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { normalizarNombre } from '../lib/texto'
import { colors, radius } from '../styles/design-system'
import Modal from './ui/Modal'
import Spinner from './ui/Spinner'
import Badge from './ui/Badge'
import Table, { Thead, Tbody, Tr, Th, Td } from './ui/Table'

const kg = n => `${(Math.round((n || 0) * 10) / 10).toLocaleString('es-AR')} kg`

// Reconciliación de bases: ¿cada base rindió el helado que tenía que rendir?
// Cruza los lotes de base producidos con los sabores que se hicieron de cada
// base, y calcula el rinde POR SABOR (contra su propia receta) y el saldo.
//
// IMPORTANTE (honestidad del dato): el vínculo orden↔lote no existe en el
// histórico, así que esto es una reconciliación POR NOMBRE DE BASE, aproximada.
// Un saldo positivo puede ser base sin usar todavía O sabores cargados sin
// descontar la base: por eso se marca "a revisar", no "consumido".
export default function ReconciliacionBases({ onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [bases, setBases]     = useState([])
  const [operarios, setOperarios] = useState([])
  // Form de reconciliación inline: { nombre, modo:'faltante'|'consumir', kg, fecha, operario, saving }
  const [reconc, setReconc]   = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true); setError(null)
    try {
      const [
        { data: stock, error: e1 },
        { data: sabores },
        { data: ings },
        { data: ords },
        { data: ops },
      ] = await Promise.all([
        supabase.from('stock_bases').select('*'),
        supabase.from('sabores').select('id,nombre,litros_base,base_nombre'),
        supabase.from('sabor_ingredientes').select('sabor_id,unidad,cantidad'),
        supabase.from('ordenes_produccion').select('sabor_nombre,producto_nombre,batches,kg_producido,tipo_producto,estado,fecha_produccion')
          .eq('estado', 'completada'),
        supabase.from('operarios').select('id,nombre').eq('activo', true).order('nombre'),
      ])
      if (e1) throw e1

      // extra_kg por sabor (ingredientes en kg) → rinde esperado por sabor
      const extraPorSabor = {}
      ;(ings || []).forEach(i => {
        if ((i.unidad || '').toLowerCase() === 'kg') extraPorSabor[i.sabor_id] = (extraPorSabor[i.sabor_id] || 0) + (Number(i.cantidad) || 0)
      })
      const saborPorNombre = {}
      ;(sabores || []).forEach(s => { saborPorNombre[normalizarNombre(s.nombre)] = s })

      // Lotes de base producidos, agrupados por nombre de base
      const porBase = {}
      const getBase = nombre => {
        const k = normalizarNombre(nombre)
        if (!porBase[k]) porBase[k] = { nombre, producido: 0, disponible: 0, lotes: 0, consumido: 0, sabores: [] }
        return porBase[k]
      }
      ;(stock || []).forEach(l => {
        const b = getBase(l.base_nombre || '—')
        b.producido  += Number(l.kg_original)   || 0
        b.disponible += Number(l.kg_disponible) || 0
        b.lotes++
      })

      // Sabores de helado completados → consumo por base + rinde por sabor
      ;(ords || []).forEach(o => {
        if (o.tipo_producto && o.tipo_producto !== 'helado') return
        const nom = o.sabor_nombre || o.producto_nombre
        const s = saborPorNombre[normalizarNombre(nom)]
        if (!s || !s.base_nombre) return // sabor sin base vinculada en receta
        const litrosBase = Number(s.litros_base) || 0
        if (litrosBase <= 0) return
        const batches = Number(o.batches) || 0
        const baseConsumida = batches * litrosBase
        const helado = Number(o.kg_producido) || 0
        const extra = extraPorSabor[s.id] || 0
        const rindeEsp  = litrosBase > 0 ? Math.round(((litrosBase + extra) / litrosBase) * 100) : null
        const rindeReal = baseConsumida > 0 && helado > 0 ? Math.round((helado / baseConsumida) * 100) : null
        const b = getBase(s.base_nombre)
        b.consumido += baseConsumida
        b.sabores.push({ nombre: nom, batches, baseConsumida, helado, rindeEsp, rindeReal, fecha: o.fecha_produccion })
      })

      // Estado por base (honesto, con tolerancia).
      // Clave: comparar el STOCK DISPONIBLE contra lo que DEBERÍA quedar
      // (producido − consumido). Una base con sobrante en cámara que cuadra con
      // el stock está CONCILIADA (no es problema): es base sin usar todavía.
      const lista = Object.values(porBase).map(b => {
        const esperadoDisp = b.producido - b.consumido   // lo que debería quedar en stock
        const descuadre = b.disponible - esperadoDisp     // + = stock de más; − = stock de menos
        const faltanteBase = b.consumido - b.producido    // + = se consumió más de lo producido
        const tol = Math.max(5, b.producido * 0.05)
        let estado = 'conciliado'
        if (faltanteBase > tol) estado = 'base_no_reg'        // sabores de una base no cargada
        else if (descuadre > tol) estado = 'stock_fantasma'   // el sistema muestra stock de más
        else if (descuadre < -tol) estado = 'stock_faltante'  // falta stock vs lo esperado
        const rindeBajo = b.sabores.some(s => s.rindeEsp && s.rindeReal && s.rindeReal < s.rindeEsp - 10)
        return { ...b, esperadoDisp, descuadre, faltanteBase, estado, rindeBajo }
      }).filter(b => b.producido > 0 || b.sabores.length > 0)
        .sort((a, b) => {
          const sev = e => e === 'conciliado' ? 0 : 1
          return sev(b.estado) - sev(a.estado) || Math.abs(b.descuadre) - Math.abs(a.descuadre)
        })

      setBases(lista)
      setOperarios(ops || [])
    } catch (err) {
      console.error('ReconciliacionBases:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Registra la base que se hizo pero nunca se cargó (saldo negativo). Queda como
  // ya consumida (kg_disponible = lo que sobró respecto a lo consumido).
  async function registrarBaseFaltante(b) {
    const cant = parseFloat(reconc.kg)
    if (!(cant > 0)) return
    if (!reconc.fecha) return
    setReconc(r => ({ ...r, saving: true }))
    const fechaStr = reconc.fecha.slice(0, 10)
    const hoyStr = new Date().toISOString().slice(0, 10)
    const disponible = Math.max(0, cant - b.consumido) // lo consumido ya se fue
    const payload = {
      base_nombre: b.nombre,
      kg_original: cant,
      kg_disponible: disponible,
      orden_origen: `RECON-${fechaStr}`,
      operario_nombre: reconc.operario || null,
      fecha: fechaStr,
      es_retroactiva: fechaStr < hoyStr,
    }
    let { error } = await supabase.from('stock_bases').insert(payload)
    if (error && /es_retroactiva/i.test(error.message || '')) {
      const { es_retroactiva, ...sinCol } = payload // eslint-disable-line no-unused-vars
      ;({ error } = await supabase.from('stock_bases').insert(sinCol))
    }
    if (error) { setReconc(r => ({ ...r, saving: false })); setError(error.message); return }
    setReconc(null)
    await cargar()
  }

  // Marca como consumido el saldo disponible de una base (saldo positivo que en
  // realidad ya se usó). Vacía kg_disponible de sus lotes hasta absorber el saldo.
  async function marcarConsumida(b) {
    setReconc(r => ({ ...r, saving: true }))
    const { data: lotes } = await supabase.from('stock_bases')
      .select('id,kg_disponible').eq('base_nombre', b.nombre).gt('kg_disponible', 0)
      .order('fecha', { ascending: true })
    let restante = b.descuadre // solo el stock de MÁS (lo fantasma), no el sobrante legítimo
    for (const l of (lotes || [])) {
      if (restante <= 0) break
      const baja = Math.min(Number(l.kg_disponible) || 0, restante)
      const nuevo = Math.max(0, (Number(l.kg_disponible) || 0) - baja)
      await supabase.from('stock_bases').update({ kg_disponible: nuevo }).eq('id', l.id)
      restante -= baja
    }
    setReconc(null)
    await cargar()
  }

  const tot = bases.reduce((a, b) => ({
    producido: a.producido + b.producido,
    consumido: a.consumido + b.consumido,
    revisarKg: a.revisarKg + (b.estado === 'base_no_reg' ? b.faltanteBase : b.estado !== 'conciliado' ? Math.abs(b.descuadre) : 0),
    revisar: a.revisar + (b.estado !== 'conciliado' || b.rindeBajo ? 1 : 0),
  }), { producido: 0, consumido: 0, revisarKg: 0, revisar: 0 })

  const ESTADOS = {
    conciliado:     { label: '✓ Conciliada',         variant: 'success' },
    stock_fantasma: { label: '⚠ Stock de más',       variant: 'warning' },
    stock_faltante: { label: '⚠ Stock de menos',     variant: 'warning' },
    base_no_reg:    { label: '⚠ Base no registrada', variant: 'warning' },
  }

  return (
    <Modal open onClose={onClose} title="Rendimiento y reconciliación de bases" maxWidth="max-w-4xl">
      {loading ? (
        <div className="flex justify-center py-10"><Spinner size={26} /></div>
      ) : error ? (
        <p style={{ color: colors.danger }}>Error: {error}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: colors.textMuted }}>
            ¿Cada base rindió el helado que tenía que rendir? Reconciliación aproximada por nombre de base
            (el vínculo exacto orden↔lote se construye al producir, de ahora en más).
          </p>

          {/* KPIs — sin promedio de rinde global (no es comparable entre sabores) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { l: 'Base producida', v: kg(tot.producido), c: colors.info },
              { l: 'Consumida en sabores', v: kg(tot.consumido), c: colors.success },
              { l: 'A revisar', v: kg(tot.revisarKg), c: tot.revisarKg > 5 ? colors.warning : colors.textMuted },
              { l: 'Bases a revisar', v: String(tot.revisar), c: tot.revisar > 0 ? colors.warning : colors.success },
            ].map(k => (
              <div key={k.l} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: '12px 14px' }}>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: colors.textSecondary }}>{k.l}</div>
                <div className="text-xl font-extrabold mt-1" style={{ color: k.c }}>{k.v}</div>
              </div>
            ))}
          </div>

          {bases.length === 0 && (
            <p className="text-sm py-6 text-center" style={{ color: colors.textMuted }}>Sin datos de bases en el sistema.</p>
          )}

          {bases.map(b => {
            const est = ESTADOS[b.estado] || ESTADOS.conciliado
            return (
              <div key={b.nombre} className="overflow-hidden" style={{ background: colors.surface, border: `1px solid ${b.estado !== 'conciliado' ? colors.warning + '66' : colors.border}`, borderRadius: radius.lg }}>
                <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ background: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>{b.nombre}</span>
                    <span className="text-xs" style={{ color: colors.textMuted }}>· {b.lotes} lote(s) · {kg(b.producido)} producido · {kg(b.disponible)} en stock</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.rindeBajo && <Badge variant="danger">rinde bajo</Badge>}
                    <Badge variant={est.variant}>{est.label}</Badge>
                  </div>
                </div>

                {b.sabores.length > 0 ? (
                  <Table>
                    <Thead><Tr><Th>Sabor producido</Th><Th>Batches</Th><Th>Base consumida</Th><Th>Helado producido</Th><Th>Rinde (real / esperado)</Th></Tr></Thead>
                    <Tbody>
                      {b.sabores.map((s, i) => {
                        const bajo = s.rindeEsp && s.rindeReal && s.rindeReal < s.rindeEsp - 10
                        return (
                          <Tr key={i}>
                            <Td className="font-medium">{s.nombre}</Td>
                            <Td className="text-right">{s.batches}</Td>
                            <Td className="text-right">{kg(s.baseConsumida)}</Td>
                            <Td className="text-right">{kg(s.helado)}</Td>
                            <Td className="text-right font-bold" style={{ color: s.rindeReal == null ? colors.textMuted : bajo ? colors.danger : colors.success }}>
                              {s.rindeReal != null ? `${s.rindeReal}%` : '—'} <span style={{ color: colors.textMuted, fontWeight: 400 }}>/ {s.rindeEsp != null ? `${s.rindeEsp}%` : '—'}</span>
                            </Td>
                          </Tr>
                        )
                      })}
                      <Tr>
                        <Td className="font-bold">Total</Td>
                        <Td></Td>
                        <Td className="text-right font-bold">{kg(b.consumido)}</Td>
                        <Td className="text-right font-bold">{kg(b.sabores.reduce((a, s) => a + s.helado, 0))}</Td>
                        <Td className="text-right font-bold" style={{ color: b.estado === 'conciliado' ? colors.success : colors.warning }}>
                          {b.estado === 'conciliado' ? '✓ cuadra'
                            : b.estado === 'base_no_reg' ? `falta base ${kg(b.faltanteBase)}`
                            : b.estado === 'stock_fantasma' ? `stock +${kg(b.descuadre)}`
                            : `stock ${kg(b.descuadre)}`}
                        </Td>
                      </Tr>
                    </Tbody>
                  </Table>
                ) : (
                  <div className="px-4 py-3 text-sm" style={{ color: colors.textMuted }}>
                    Sin sabores vinculados a esta base en el período. {kg(b.disponible)} figuran en stock.
                  </div>
                )}

                {b.estado === 'conciliado' && b.disponible > 5 && (
                  <div className="px-4 py-2 text-xs" style={{ color: colors.success, borderTop: `1px solid ${colors.border}` }}>
                    Cuadra: quedan {kg(b.disponible)} de base sin usar todavía (stock legítimo).
                  </div>
                )}
                {b.estado === 'base_no_reg' && (
                  <div className="px-4 py-2.5 text-xs flex items-center justify-between gap-3 flex-wrap" style={{ color: colors.warning, borderTop: `1px solid ${colors.border}` }}>
                    <span>Se consumió {kg(b.faltanteBase)} más de base que la producida: se hicieron sabores de una base que nunca se cargó como orden.</span>
                    {reconc?.nombre !== b.nombre && (
                      <button onClick={() => setReconc({ nombre: b.nombre, modo: 'faltante', kg: String(Math.round(b.faltanteBase)), fecha: new Date().toISOString().slice(0, 16), operario: '' })}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg text-white flex-shrink-0" style={{ background: colors.brand }}>
                        Registrar base faltante →
                      </button>
                    )}
                  </div>
                )}
                {b.estado === 'stock_fantasma' && (
                  <div className="px-4 py-2.5 text-xs flex items-center justify-between gap-3 flex-wrap" style={{ color: colors.warning, borderTop: `1px solid ${colors.border}` }}>
                    <span>El sistema muestra {kg(b.descuadre)} de más en stock: se hicieron sabores sin descontar la base.</span>
                    {reconc?.nombre !== b.nombre && (
                      <button onClick={() => setReconc({ nombre: b.nombre, modo: 'consumir', saving: false })}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'transparent', color: colors.brand, border: `1px solid ${colors.brand}55` }}>
                        Marcar como consumida
                      </button>
                    )}
                  </div>
                )}
                {b.estado === 'stock_faltante' && (
                  <div className="px-4 py-2 text-xs" style={{ color: colors.warning, borderTop: `1px solid ${colors.border}` }}>
                    Falta {kg(-b.descuadre)} de stock vs lo esperado: posible merma de cámara o base consumida sin registrar. Revisar con un conteo físico.
                  </div>
                )}

                {/* Formulario de reconciliación inline */}
                {reconc?.nombre === b.nombre && reconc.modo === 'faltante' && (
                  <div className="px-4 py-3 space-y-2" style={{ background: colors.bg, borderTop: `1px solid ${colors.border}` }}>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Registrá la base <b style={{ color: colors.textPrimary }}>{b.nombre}</b> que se hizo y no se cargó. Queda como ya consumida (con su fecha real).</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="text-xs" style={{ color: colors.textMuted }}>Kg de base que se hizo
                        <input type="number" value={reconc.kg} onChange={e => setReconc(r => ({ ...r, kg: e.target.value }))}
                          className="w-full mt-1 rounded px-2 py-1.5 text-sm" style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                      </label>
                      <label className="text-xs" style={{ color: colors.textMuted }}>Fecha en que se hizo
                        <input type="datetime-local" value={reconc.fecha} onChange={e => setReconc(r => ({ ...r, fecha: e.target.value }))}
                          className="w-full mt-1 rounded px-2 py-1.5 text-sm" style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }} />
                      </label>
                      <label className="text-xs" style={{ color: colors.textMuted }}>Operario
                        <select value={reconc.operario} onChange={e => setReconc(r => ({ ...r, operario: e.target.value }))}
                          className="w-full mt-1 rounded px-2 py-1.5 text-sm" style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                          <option value="">— Seleccionar —</option>
                          {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setReconc(null)} disabled={reconc.saving} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ color: colors.textSecondary, border: `1px solid ${colors.border}` }}>Cancelar</button>
                      <button onClick={() => registrarBaseFaltante(b)} disabled={reconc.saving || !(parseFloat(reconc.kg) > 0)} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: colors.brand, opacity: reconc.saving ? 0.6 : 1 }}>
                        {reconc.saving ? 'Guardando…' : 'Registrar base'}
                      </button>
                    </div>
                  </div>
                )}
                {reconc?.nombre === b.nombre && reconc.modo === 'consumir' && (
                  <div className="px-4 py-3 space-y-2" style={{ background: colors.bg, borderTop: `1px solid ${colors.border}` }}>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>¿Confirmás que esos <b style={{ color: colors.textPrimary }}>{kg(b.descuadre)}</b> ya se usaron (sabores hechos sin descontar la base)? Se quita ese stock disponible.</p>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setReconc(null)} disabled={reconc.saving} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ color: colors.textSecondary, border: `1px solid ${colors.border}` }}>Cancelar</button>
                      <button onClick={() => marcarConsumida(b)} disabled={reconc.saving} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: colors.brand, opacity: reconc.saving ? 0.6 : 1 }}>
                        {reconc.saving ? 'Guardando…' : 'Sí, marcar consumida'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
