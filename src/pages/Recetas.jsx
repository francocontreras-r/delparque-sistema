import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import Toast from '../components/ui/Toast'
import Modal from '../components/ui/Modal'
import { colors, radius, shadow } from '../styles/design-system'
import { BookOpen, ChevronDown, ChevronUp, ClipboardList, Search } from 'lucide-react'

const TABS = ['Bases', 'Sabores', 'Impulsivos y Postres']

const fieldStyle = {
  width: '100%',
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  padding: '8px 12px',
  fontSize: 14,
  outline: 'none',
  color: colors.textPrimary,
  backgroundColor: colors.surface,
}

// Recetas estáticas de referencia — se muestran si no hay tabla 'recetas' en Supabase
const RECETAS_DEFAULT = {
  Bases: [
    {
      nombre: 'BASE CREMOSA ESTÁNDAR', tipo: 'Base', litros_batch: 120,
      ingredientes: [
        { insumo: 'Leche entera',        cantidad: 80,  unidad: 'litros' },
        { insumo: 'Crema de leche',      cantidad: 20,  unidad: 'litros' },
        { insumo: 'Azúcar',              cantidad: 18,  unidad: 'kg'     },
        { insumo: 'Leche en polvo',      cantidad: 4,   unidad: 'kg'     },
        { insumo: 'Neutro helado',       cantidad: 0.8, unidad: 'kg'     },
        { insumo: 'Glucosa',             cantidad: 6,   unidad: 'kg'     },
      ],
    },
    {
      nombre: 'BASE AGUA ESTÁNDAR', tipo: 'Base', litros_batch: 120,
      ingredientes: [
        { insumo: 'Agua',                cantidad: 90,  unidad: 'litros' },
        { insumo: 'Azúcar',              cantidad: 22,  unidad: 'kg'     },
        { insumo: 'Glucosa',             cantidad: 8,   unidad: 'kg'     },
        { insumo: 'Estabilizante',       cantidad: 0.4, unidad: 'kg'     },
        { insumo: 'Ácido cítrico',       cantidad: 0.1, unidad: 'kg'     },
      ],
    },
    {
      nombre: 'BASE ESPECIAL', tipo: 'Base', litros_batch: 120,
      ingredientes: [
        { insumo: 'Leche entera',        cantidad: 70,  unidad: 'litros' },
        { insumo: 'Crema de leche',      cantidad: 30,  unidad: 'litros' },
        { insumo: 'Azúcar',              cantidad: 20,  unidad: 'kg'     },
        { insumo: 'Leche en polvo',      cantidad: 5,   unidad: 'kg'     },
        { insumo: 'Neutro helado',       cantidad: 0.9, unidad: 'kg'     },
        { insumo: 'Glucosa',             cantidad: 7,   unidad: 'kg'     },
        { insumo: 'Yema de huevo',       cantidad: 2,   unidad: 'kg'     },
      ],
    },
  ],
  Sabores: [
    {
      nombre: 'DULCE DE LECHE', tipo: 'Cremoso', litros_batch: 120,
      ingredientes: [
        { insumo: 'Base cremosa',        cantidad: 100, unidad: 'litros' },
        { insumo: 'Dulce de leche',      cantidad: 22,  unidad: 'kg'     },
        { insumo: 'Esencia vainilla',    cantidad: 0.2, unidad: 'litros' },
      ],
    },
    {
      nombre: 'CHOCOLATE', tipo: 'Cremoso', litros_batch: 120,
      ingredientes: [
        { insumo: 'Base cremosa',        cantidad: 100, unidad: 'litros' },
        { insumo: 'Cacao amargo',        cantidad: 8,   unidad: 'kg'     },
        { insumo: 'Azúcar extra',        cantidad: 4,   unidad: 'kg'     },
        { insumo: 'Esencia chocolate',   cantidad: 0.3, unidad: 'litros' },
      ],
    },
    {
      nombre: 'FRUTILLA CREMA', tipo: 'Cremoso', litros_batch: 120,
      ingredientes: [
        { insumo: 'Base cremosa',        cantidad: 95,  unidad: 'litros' },
        { insumo: 'Pulpa frutilla',      cantidad: 18,  unidad: 'kg'     },
        { insumo: 'Azúcar extra',        cantidad: 2,   unidad: 'kg'     },
        { insumo: 'Colorante rojo',      cantidad: 0.02,unidad: 'kg'     },
      ],
    },
    {
      nombre: 'LIMÓN CREMA', tipo: 'Cremoso', litros_batch: 120,
      ingredientes: [
        { insumo: 'Base cremosa',        cantidad: 100, unidad: 'litros' },
        { insumo: 'Jugo de limón',       cantidad: 6,   unidad: 'litros' },
        { insumo: 'Ralladura limón',     cantidad: 0.3, unidad: 'kg'     },
        { insumo: 'Esencia limón',       cantidad: 0.2, unidad: 'litros' },
      ],
    },
    {
      nombre: 'GRANIZADO', tipo: 'Con Agregado', litros_batch: 120,
      ingredientes: [
        { insumo: 'Base cremosa',        cantidad: 100, unidad: 'litros' },
        { insumo: 'Chocolate cobertura', cantidad: 10,  unidad: 'kg'     },
      ],
    },
    {
      nombre: 'DULCE DE LECHE GRANIZADO', tipo: 'Con Agregado', litros_batch: 120,
      ingredientes: [
        { insumo: 'Base cremosa',        cantidad: 100, unidad: 'litros' },
        { insumo: 'Dulce de leche',      cantidad: 18,  unidad: 'kg'     },
        { insumo: 'Chocolate cobertura', cantidad: 8,   unidad: 'kg'     },
      ],
    },
    {
      nombre: 'MENTA GRANIZADA', tipo: 'Con Agregado', litros_batch: 120,
      ingredientes: [
        { insumo: 'Base cremosa',        cantidad: 100, unidad: 'litros' },
        { insumo: 'Esencia menta',       cantidad: 0.4, unidad: 'litros' },
        { insumo: 'Chocolate cobertura', cantidad: 10,  unidad: 'kg'     },
        { insumo: 'Colorante verde',     cantidad: 0.02,unidad: 'kg'     },
      ],
    },
    {
      nombre: 'ANANA', tipo: 'Agua', litros_batch: 120,
      ingredientes: [
        { insumo: 'Base agua',           cantidad: 90,  unidad: 'litros' },
        { insumo: 'Pulpa ananá',         cantidad: 25,  unidad: 'kg'     },
        { insumo: 'Azúcar extra',        cantidad: 3,   unidad: 'kg'     },
        { insumo: 'Ácido cítrico',       cantidad: 0.15,unidad: 'kg'     },
      ],
    },
    {
      nombre: 'DURAZNO', tipo: 'Agua', litros_batch: 120,
      ingredientes: [
        { insumo: 'Base agua',           cantidad: 90,  unidad: 'litros' },
        { insumo: 'Pulpa durazno',       cantidad: 25,  unidad: 'kg'     },
        { insumo: 'Azúcar extra',        cantidad: 3,   unidad: 'kg'     },
      ],
    },
  ],
  'Impulsivos y Postres': [
    {
      nombre: 'BARRA ALMENDRADO', tipo: 'Impulsivo', litros_batch: 0,
      ingredientes: [
        { insumo: 'Helado cremoso base', cantidad: 1,   unidad: 'kg'     },
        { insumo: 'Almendras trozadas',  cantidad: 0.15,unidad: 'kg'     },
        { insumo: 'Chocolate cobertura', cantidad: 0.12,unidad: 'kg'     },
        { insumo: 'Palito de madera',    cantidad: 1,   unidad: 'unidades'},
      ],
    },
    {
      nombre: 'BARRA HELADA', tipo: 'Impulsivo', litros_batch: 0,
      ingredientes: [
        { insumo: 'Helado cremoso base', cantidad: 0.9, unidad: 'kg'     },
        { insumo: 'Chocolate cobertura', cantidad: 0.15,unidad: 'kg'     },
        { insumo: 'Palito de madera',    cantidad: 1,   unidad: 'unidades'},
      ],
    },
    {
      nombre: 'PIONONO', tipo: 'Postre', litros_batch: 0,
      ingredientes: [
        { insumo: 'Helado cremoso',      cantidad: 2,   unidad: 'kg'     },
        { insumo: 'Bizcochuelo base',    cantidad: 0.4, unidad: 'kg'     },
        { insumo: 'Crema chantilly',     cantidad: 0.3, unidad: 'kg'     },
      ],
    },
    {
      nombre: 'TORTA HELADA KG', tipo: 'Postre', litros_batch: 0,
      ingredientes: [
        { insumo: 'Helado cremoso',      cantidad: 1,   unidad: 'kg'     },
        { insumo: 'Bizcochuelo',         cantidad: 0.2, unidad: 'kg'     },
        { insumo: 'Crema chantilly',     cantidad: 0.15,unidad: 'kg'     },
        { insumo: 'Cobertura',           cantidad: 0.1, unidad: 'kg'     },
      ],
    },
  ],
}

export default function Recetas() {
  const [tab, setTab]           = useState('Bases')
  const [recetas, setRecetas]   = useState(null)
  const [operarios, setOperarios] = useState([])
  const [loading, setLoading]   = useState(true)
  const [expandida, setExpandida] = useState(null)
  const [toast, setToast]       = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [modalOrden, setModalOrden] = useState(null)
  const [savingOrden, setSavingOrden] = useState(false)
  const [formOrden, setFormOrden] = useState({ operario_id: '', operario_nombre: '', batches: '1', fecha_produccion: new Date().toISOString().split('T')[0] })

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [{ data: r }, { data: o }] = await Promise.all([
      supabase.from('recetas').select('*').order('tipo').order('nombre'),
      supabase.from('operarios').select('*').order('nombre'),
    ])
    setRecetas(r && r.length > 0 ? r : null)
    setOperarios(o || [])
    if (o && o.length > 0) setFormOrden(f => ({ ...f, operario_id: String(o[0].id), operario_nombre: o[0].nombre }))
    setLoading(false)
  }

  // Si no hay tabla recetas, usar las estáticas
  const datosActivos = recetas
    ? {
        Bases:                 recetas.filter(r => r.tipo === 'Base'),
        Sabores:               recetas.filter(r => ['Cremoso', 'Con Agregado', 'Agua'].includes(r.tipo)),
        'Impulsivos y Postres': recetas.filter(r => ['Impulsivo', 'Postre'].includes(r.tipo)),
      }
    : RECETAS_DEFAULT

  const recetasTab = useMemo(() => {
    const lista = datosActivos[tab] || []
    if (!busqueda) return lista
    return lista.filter(r => r.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  }, [tab, busqueda, recetas])

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

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

  const ingredientesDe = (r) => {
    if (Array.isArray(r.ingredientes)) return r.ingredientes
    if (typeof r.ingredientes === 'string') {
      try { return JSON.parse(r.ingredientes) } catch { return [] }
    }
    return []
  }

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      <div>
        <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Recetas</h1>
        <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>
          Catálogo de fórmulas Del Parque {!recetas && <span className="italic">(datos de referencia)</span>}
        </p>
      </div>

      <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: colors.bg }}>
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setExpandida(null); setBusqueda('') }}
            className="flex-1 py-2 text-xs font-semibold rounded-lg transition-all leading-tight"
            style={{
              backgroundColor: tab === t ? colors.surface : 'transparent',
              color: tab === t ? colors.textPrimary : colors.textMuted,
              boxShadow: tab === t ? shadow.sm : 'none',
            }}>
            {t}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textMuted }} />
        <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar receta…"
          className="w-full pl-8 pr-3 py-2 text-sm transition"
          style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, outline: 'none', color: colors.textPrimary, backgroundColor: colors.surface }}
          onFocus={e => { e.target.style.borderColor = colors.brand }}
          onBlur={e => { e.target.style.borderColor = colors.border }}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-14"><Spinner size={28} /></div>
      ) : recetasTab.length === 0 ? (
        <EmptyState icon={BookOpen} title="Sin recetas" subtitle="No se encontraron recetas para esta sección" />
      ) : (
        <div className="space-y-3">
          {recetasTab.map((r) => {
            const key = r.id || r.nombre
            const abierta = expandida === key
            const ings = ingredientesDe(r)
            return (
              <div key={key} className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                <button
                  onClick={() => setExpandida(abierta ? null : key)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.bg }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm" style={{ color: colors.textPrimary }}>{r.nombre}</p>
                    <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                      {r.tipo}
                      {r.litros_batch > 0 && ` · ${r.litros_batch} L/batch`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); setModalOrden(r) }}
                      className="text-[10px] font-semibold px-2.5 py-1 rounded-lg text-white flex items-center gap-1 transition-all hover:opacity-85"
                      style={{ backgroundColor: colors.brand }}>
                      <ClipboardList size={11} /> Crear orden
                    </button>
                    {abierta ? <ChevronUp size={16} style={{ color: colors.textMuted }} /> : <ChevronDown size={16} style={{ color: colors.textMuted }} />}
                  </div>
                </button>

                {abierta && ings.length > 0 && (
                  <div style={{ borderTop: `1px solid ${colors.border}` }}>
                    <div className="px-4 py-2" style={{ backgroundColor: colors.bg }}>
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Ingredientes</span>
                    </div>
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
                    {r.tiempo_min && (
                      <div className="px-4 py-2.5" style={{ borderTop: `1px solid ${colors.border}` }}>
                        <span className="text-xs" style={{ color: colors.textMuted }}>Tiempo estimado: <strong style={{ color: colors.textSecondary }}>{r.tiempo_min} min</strong></span>
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
          <div className="flex gap-2">
            <button onClick={() => setModalOrden(null)} disabled={savingOrden}
              className="flex-1 py-2.5 text-sm font-medium transition-colors"
              style={{ borderRadius: radius.md, border: `1px solid ${colors.border}`, color: colors.textSecondary, backgroundColor: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.bg }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}>
              Cancelar
            </button>
            <button onClick={crearOrden} disabled={savingOrden}
              className="flex-1 py-2.5 text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
              style={{ borderRadius: radius.md, backgroundColor: colors.brand }}>
              {savingOrden && <Spinner size={14} />}
              {savingOrden ? 'Creando…' : 'Crear orden'}
            </button>
          </div>
        }
      >
        {modalOrden && (
          <div className="p-6 space-y-3">
            <div className="px-4 py-2.5" style={{ backgroundColor: `${colors.brand}0d`, border: `1px solid ${colors.brand}30`, borderRadius: radius.md }}>
              <p className="text-xs" style={{ color: colors.textMuted }}>Sabor</p>
              <p className="font-bold" style={{ color: colors.textPrimary }}>{modalOrden.nombre}</p>
              <p className="text-xs" style={{ color: colors.textMuted }}>{modalOrden.tipo}</p>
            </div>
            <Field label="Fecha de producción">
              <input type="date" value={formOrden.fecha_produccion}
                onChange={e => setFormOrden(f => ({ ...f, fecha_produccion: e.target.value }))}
                style={fieldStyle} />
            </Field>
            <Field label="Operario">
              <select value={formOrden.operario_id} onChange={e => {
                const o = operarios.find(o => String(o.id) === e.target.value)
                setFormOrden(f => ({ ...f, operario_id: e.target.value, operario_nombre: o?.nombre || '' }))
              }} style={fieldStyle}>
                <option value="">— Sin asignar —</option>
                {operarios.map(o => <option key={o.id} value={String(o.id)}>{o.nombre}</option>)}
              </select>
            </Field>
            <Field label="Batches">
              <input type="number" min="1" max="20" value={formOrden.batches}
                onChange={e => setFormOrden(f => ({ ...f, batches: e.target.value }))}
                style={fieldStyle} />
            </Field>
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

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>{label}</label>
      {children}
    </div>
  )
}
