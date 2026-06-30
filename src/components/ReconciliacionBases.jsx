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

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true); setError(null)
    try {
      const [
        { data: stock, error: e1 },
        { data: sabores },
        { data: ings },
        { data: ords },
      ] = await Promise.all([
        supabase.from('stock_bases').select('*'),
        supabase.from('sabores').select('id,nombre,litros_base,base_nombre'),
        supabase.from('sabor_ingredientes').select('sabor_id,unidad,cantidad'),
        supabase.from('ordenes_produccion').select('sabor_nombre,producto_nombre,batches,kg_producido,tipo_producto,estado,fecha_produccion')
          .eq('estado', 'completada'),
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

      // Estado por base (honesto, con tolerancia)
      const lista = Object.values(porBase).map(b => {
        const saldo = b.producido - b.consumido
        const tol = Math.max(3, b.producido * 0.05)
        let estado = 'conciliado'
        if (saldo > tol) estado = 'revisar_saldo'       // base figura / sin vincular
        else if (saldo < -tol) estado = 'base_no_reg'   // sabores sin base en sistema
        // rinde bajo real en algún sabor (posible merma)
        const rindeBajo = b.sabores.some(s => s.rindeEsp && s.rindeReal && s.rindeReal < s.rindeEsp - 10)
        return { ...b, saldo, estado, rindeBajo }
      }).filter(b => b.producido > 0 || b.sabores.length > 0)
        .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo))

      setBases(lista)
    } catch (err) {
      console.error('ReconciliacionBases:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const tot = bases.reduce((a, b) => ({
    producido: a.producido + b.producido,
    consumido: a.consumido + b.consumido,
    saldo: a.saldo + Math.max(0, b.saldo),
    revisar: a.revisar + (b.estado !== 'conciliado' || b.rindeBajo ? 1 : 0),
  }), { producido: 0, consumido: 0, saldo: 0, revisar: 0 })

  const ESTADOS = {
    conciliado:    { label: '✓ Conciliada',        variant: 'success' },
    revisar_saldo: { label: '⚠ Saldo a revisar',   variant: 'warning' },
    base_no_reg:   { label: '⚠ Base no registrada', variant: 'warning' },
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
              { l: 'Saldo a revisar', v: kg(tot.saldo), c: tot.saldo > 3 ? colors.warning : colors.textMuted },
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
                        <Td className="text-right font-bold" style={{ color: Math.abs(b.saldo) > Math.max(3, b.producido * 0.05) ? colors.warning : colors.textMuted }}>
                          saldo {kg(b.saldo)}
                        </Td>
                      </Tr>
                    </Tbody>
                  </Table>
                ) : (
                  <div className="px-4 py-3 text-sm" style={{ color: colors.textMuted }}>
                    Sin sabores vinculados a esta base en el período. {kg(b.disponible)} figuran en stock — revisar si están sin usar o si se hicieron sabores sin descontarla.
                  </div>
                )}

                {b.estado === 'revisar_saldo' && (
                  <div className="px-4 py-2 text-xs" style={{ color: colors.warning, borderTop: `1px solid ${colors.border}` }}>
                    Quedan {kg(b.saldo)} sin justificar: puede ser base sin usar todavía, o sabores cargados sin descontar la base. No es merma — revisar.
                  </div>
                )}
                {b.estado === 'base_no_reg' && (
                  <div className="px-4 py-2 text-xs" style={{ color: colors.warning, borderTop: `1px solid ${colors.border}` }}>
                    Se consumió {kg(-b.saldo)} más de base que la producida en el sistema: se hicieron sabores de una base que nunca se cargó como orden.
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
