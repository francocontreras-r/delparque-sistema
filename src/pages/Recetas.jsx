import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import Toast from '../components/ui/Toast'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Badge from '../components/ui/Badge'
import { colors, radius, shadow } from '../styles/design-system'
import { BookOpen, ChevronDown, ChevronUp, ClipboardList, Search } from 'lucide-react'
import { POSTRES } from '../lib/postres'

const TABS = ['Bases', 'Sabores', 'Impulsivos', 'Postres']

function tipoVariant(tipo) {
  switch (tipo) {
    case 'Lisa':         return 'info'
    case 'Con Agregado': return 'warning'
    case 'Agua':         return 'success'
    case 'Especial':     return 'danger'
    case 'Postre':       return 'warning'
    default:             return 'neutral'
  }
}

export default function Recetas() {
  const [tab, setTab]                 = useState('Bases')
  const [bases, setBases]             = useState([])
  const [baseIngs, setBaseIngs]       = useState([])
  const [sabores, setSabores]         = useState([])
  const [saborIngs, setSaborIngs]     = useState([])
  const [stockCamaras, setStockCamaras] = useState([])
  const [impulsivos, setImpulsivos]   = useState([])
  const [impIngs, setImpIngs]         = useState([])
  const [operarios, setOperarios]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [expandida, setExpandida]     = useState(null)
  const [toast, setToast]             = useState(null)
  const [busqueda, setBusqueda]       = useState('')
  const [modalOrden, setModalOrden]   = useState(null)
  const [savingOrden, setSavingOrden] = useState(false)
  const [formOrden, setFormOrden]     = useState({ operario_id: '', operario_nombre: '', batches: '1', fecha_produccion: new Date().toISOString().split('T')[0] })

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [
      { data: b }, { data: bi },
      { data: s }, { data: si },
      { data: sc },
      { data: imp }, { data: ii },
      { data: o },
    ] = await Promise.all([
      supabase.from('bases').select('*').order('nombre'),
      supabase.from('base_ingredientes').select('*'),
      supabase.from('sabores').select('*').order('nombre'),
      supabase.from('sabor_ingredientes').select('*'),
      supabase.from('stock_camaras').select('id,nombre,tipo'),
      supabase.from('impulsivos').select('*').order('nombre'),
      supabase.from('impulsivo_ingredientes').select('*'),
      supabase.from('operarios').select('*').order('nombre'),
    ])
    setBases(b || [])
    setBaseIngs(bi || [])
    setSabores(s || [])
    setSaborIngs(si || [])
    setStockCamaras(sc || [])
    setImpulsivos(imp || [])
    setImpIngs(ii || [])
    setOperarios(o || [])
    if (o && o.length > 0) setFormOrden(f => ({ ...f, operario_id: String(o[0].id), operario_nombre: o[0].nombre }))
    setLoading(false)
  }

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const datosActivos = useMemo(() => {
    const baseIngsPor = {}
    baseIngs.forEach(i => { (baseIngsPor[i.base_id] ||= []).push(i) })
    const saborIngsPor = {}
    saborIngs.forEach(i => { (saborIngsPor[i.sabor_id] ||= []).push(i) })
    const impIngsPor = {}
    impIngs.forEach(i => { (impIngsPor[i.impulsivo_id] ||= []).push(i) })
    const tipoPorNombre = {}
    stockCamaras.forEach(c => { tipoPorNombre[c.nombre] = c.tipo })

    const norm = (lista) => lista.map(i => ({ insumo: i.insumo_nombre, cantidad: i.cantidad, unidad: i.unidad }))

    return {
      Bases: bases.map(b => ({
        id: b.id, nombre: b.nombre, tipo: 'Base', litros_batch: b.litros_batch || 0,
        ingredientes: norm(baseIngsPor[b.id] || []),
      })),
      Sabores: sabores.map(s => ({
        id: s.id, nombre: s.nombre, tipo: tipoPorNombre[s.nombre] || 'Sabor',
        baseNombre: s.base_nombre, litros_batch: s.litros_base || 0, notas: s.notas,
        ingredientes: norm(saborIngsPor[s.id] || []),
      })),
      Impulsivos: impulsivos.map(i => ({
        id: i.id, nombre: i.nombre, tipo: 'Impulsivo', litros_batch: 0, costoTotal: i.costo_total,
        ingredientes: norm(impIngsPor[i.id] || []),
      })),
      Postres: POSTRES.map((p, idx) => ({
        id: `postre-${idx}`, nombre: p.nombre, tipo: 'Postre', litros_batch: 0,
        costoTotal: p.costo_total, manoDeObra: p.mano_de_obra,
        ingredientes: p.ingredientes.map(i => ({ insumo: i.nombre, cantidad: i.cantidad, unidad: i.unidad })),
      })),
    }
  }, [bases, baseIngs, sabores, saborIngs, stockCamaras, impulsivos, impIngs])

  const recetasTab = useMemo(() => {
    const lista = datosActivos[tab] || []
    if (!busqueda) return lista
    return lista.filter(r => r.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  }, [tab, busqueda, datosActivos])

  async function crearOrden() {
    if (!modalOrden) return
    setSavingOrden(true)
    const numero = `OP-${Date.now().toString().slice(-6)}`
    const litros = parseInt(formOrden.batches, 10) * (modalOrden.litros_batch || 120)
    const { error } = await supabase.from('ordenes_produccion').insert({
      numero,
      sabor_nombre: modalOrden.nombre,
      operario_id: formOrden.operario_id ? parseInt(formOrden.operario_id, 10) : null,
      operario_nombre: formOrden.operario_nombre || null,
      batches: parseInt(formOrden.batches, 10),
      litros_total: litros,
      estado: 'pendiente',
      fecha_produccion: formOrden.fecha_produccion,
    })
    setSavingOrden(false)
    if (error) { toast2(error.message, 'error'); return }
    toast2(`Orden ${numero} creada para ${modalOrden.nombre}`)
    setModalOrden(null)
  }

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      <div>
        <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Recetas</h1>
        <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Catálogo de fórmulas Del Parque</p>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setExpandida(null); setBusqueda('') }}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border"
            style={{
              backgroundColor: tab === t ? colors.brand : 'transparent',
              borderColor: tab === t ? colors.brand : colors.border,
              color: tab === t ? 'white' : colors.textSecondary,
            }}>
            {t}
          </button>
        ))}
      </div>

      <Input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar receta…" icon={Search} />

      {loading ? (
        <div className="flex justify-center py-14"><Spinner size={28} /></div>
      ) : recetasTab.length === 0 ? (
        <EmptyState icon={BookOpen} title="Sin recetas" subtitle="No se encontraron recetas para esta sección" />
      ) : (
        <div className="space-y-3">
          {recetasTab.map((r) => {
            const key = `${tab}-${r.id}`
            const abierta = expandida === key
            const ings = r.ingredientes
            const partes = []
            if (r.litros_batch > 0) partes.push(`${r.litros_batch} L/batch`)
            if (r.baseNombre) partes.push(`Base: ${r.baseNombre}`)
            if (r.costoTotal > 0) partes.push(`Costo: $${Number(r.costoTotal).toFixed(2)}`)
            if (r.manoDeObra > 0) partes.push(`Mano de obra: $${Number(r.manoDeObra).toFixed(2)}`)
            return (
              <div key={key} className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                <button
                  onClick={() => setExpandida(abierta ? null : key)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.bg }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm" style={{ color: colors.textPrimary }}>{r.nombre}</p>
                      <Badge variant={tipoVariant(r.tipo)}>{r.tipo}</Badge>
                    </div>
                    {partes.length > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>{partes.join(' · ')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {tab !== 'Postres' && (
                      <Button variant="primary" size="sm" onClick={e => { e.stopPropagation(); setModalOrden(r) }}>
                        <ClipboardList size={12} /> Crear orden
                      </Button>
                    )}
                    {abierta ? <ChevronUp size={16} style={{ color: colors.textMuted }} /> : <ChevronDown size={16} style={{ color: colors.textMuted }} />}
                  </div>
                </button>

                {abierta && (
                  <div style={{ borderTop: `1px solid ${colors.border}` }}>
                    <div className="px-4 py-2" style={{ backgroundColor: colors.bg }}>
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Ingredientes</span>
                    </div>
                    {ings.length === 0 ? (
                      <p className="px-4 py-3 text-sm" style={{ color: colors.textMuted }}>Sin ingredientes cargados</p>
                    ) : (
                      <div>
                        {ings.map((ing, i) => (
                          <div key={i} className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: i === ings.length - 1 ? 'none' : `1px solid ${colors.border}` }}>
                            <span className="text-sm" style={{ color: colors.textSecondary }}>{ing.insumo}</span>
                            <span className="text-sm font-semibold tabular-nums" style={{ color: colors.brand }}>
                              {ing.cantidad} <span className="font-normal" style={{ color: colors.textMuted }}>{ing.unidad}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.notas && (
                      <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${colors.border}` }}>
                        <span className="text-xs italic" style={{ color: colors.textMuted }}>{r.notas}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={!!modalOrden}
        onClose={() => setModalOrden(null)}
        title="Crear orden de producción"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOrden(null)} disabled={savingOrden} className="flex-1">
              Cancelar
            </Button>
            <Button variant="primary" onClick={crearOrden} loading={savingOrden} className="flex-1">
              {savingOrden ? 'Creando…' : 'Crear orden'}
            </Button>
          </>
        }
      >
        {modalOrden && (
          <div className="space-y-3">
            <div className="px-4 py-2.5" style={{ backgroundColor: `${colors.brand}0d`, border: `1px solid ${colors.brand}30`, borderRadius: radius.md }}>
              <p className="text-xs" style={{ color: colors.textMuted }}>Sabor</p>
              <p className="font-bold" style={{ color: colors.textPrimary }}>{modalOrden.nombre}</p>
              <p className="text-xs" style={{ color: colors.textMuted }}>{modalOrden.tipo}</p>
            </div>
            <Input label="Fecha de producción" type="date" value={formOrden.fecha_produccion}
              onChange={e => setFormOrden(f => ({ ...f, fecha_produccion: e.target.value }))} />
            <Select label="Operario" value={formOrden.operario_id} onChange={e => {
              const o = operarios.find(o => String(o.id) === e.target.value)
              setFormOrden(f => ({ ...f, operario_id: e.target.value, operario_nombre: o?.nombre || '' }))
            }}>
              <option value="">— Sin asignar —</option>
              {operarios.map(o => <option key={o.id} value={String(o.id)}>{o.nombre}</option>)}
            </Select>
            <Input label="Batches" type="number" min="1" max="20" value={formOrden.batches}
              onChange={e => setFormOrden(f => ({ ...f, batches: e.target.value }))} />
            {modalOrden.litros_batch > 0 && (
              <p className="text-center text-sm" style={{ color: colors.textSecondary }}>
                Total: <strong style={{ color: colors.brand }}>{parseInt(formOrden.batches || '1', 10) * modalOrden.litros_batch} L</strong>
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
