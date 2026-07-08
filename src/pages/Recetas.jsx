import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useUser } from '../context/UserContext'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import { PageHeader } from '../components/PageHeader'
import Toast from '../components/ui/Toast'
import { colors, radius, shadow } from '../styles/design-system'
import { BookOpen, Search, Edit2, RefreshCw, X, AlertTriangle, ChevronDown, ChevronUp, FileDown, Plus } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { POSTRES } from '../lib/postres'
import { normalizarNombre } from '../lib/texto'
import { crearCosteador } from '../lib/costeoRecetas'
import { crearCostoUnitario } from '../lib/costoUnitario'
import { dibujarPortada, dibujarEncabezado, dibujarPie, dibujarSeccion, PDF_CONTENT_Y } from '../lib/pdfEstilos'

// Un ingrediente de receta puede ser materia prima cruda (depósito), un
// intermedio (base/sabor, del proceso anterior) o agua (no se almacena, gratis).
const esAgua = nombre => normalizarNombre(nombre).includes('agua')
function tipoIngrediente(nombre, intermedios) {
  if (esAgua(nombre)) return 'agua'
  if (intermedios && intermedios.has(normalizarNombre(nombre))) return 'intermedio'
  return 'insumo'
}


const TABS = ['Bases', 'Sabores', 'Impulsivos', 'Postres']
const UNIDADES = ['kg', 'L', 'u', 'g', 'ml']
const SURFACE = { backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }

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

function pesos(n) { return Math.round(n || 0).toLocaleString('es-AR') }

function fmtFecha(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Modal renombrar ───────────────────────────────────────────────────────────
function ModalRenombrar({ receta, onClose, onSubmit, saving }) {
  const [nombre, setNombre] = useState(receta.nombre)
  return (
    <Modal open onClose={onClose} title={`Renombrar — ${receta.nombre}`} maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1">Cancelar</Button>
          <Button variant="primary" onClick={() => onSubmit(nombre.trim())} loading={saving}
            disabled={!nombre.trim() || nombre.trim() === receta.nombre} className="flex-1">
            {saving ? 'Guardando…' : 'Guardar nombre'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Nuevo nombre *" value={nombre} onChange={e => setNombre(e.target.value)} />
        <p className="text-xs" style={{ color: colors.textMuted }}>
          También se actualizará en Stock de Cámaras y en Producciones.
        </p>
      </div>
    </Modal>
  )
}

function ModalConfEliminar({ receta, onClose, onConfirm, saving }) {
  return (
    <Modal open onClose={onClose} title="Eliminar receta" maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1">Cancelar</Button>
          <Button variant="danger" onClick={onConfirm} loading={saving} className="flex-1">
            {saving ? 'Eliminando…' : 'Sí, eliminar'}
          </Button>
        </>
      }
    >
      <p className="text-sm" style={{ color: colors.textPrimary }}>
        ¿Eliminar receta <strong>{receta.nombre}</strong>? Se eliminarán todos sus ingredientes.
        Esta acción no se puede deshacer.
      </p>
    </Modal>
  )
}

// ── Modal de edición ──────────────────────────────────────────────────────────
function ModalEditarReceta({ receta, tipo, rawIngs, onClose, onSaved, insumos, bases = [], sabores = [], intermedios, costeador, showToast }) {
  const [ings, setIngs] = useState(() =>
    rawIngs.map((i, idx) => ({
      _key: idx,
      _id: i.id ?? null,             // id de la fila de receta (null = nuevo)
      insumo_id: i.insumo_id ?? null, // vínculo al insumo del depósito
      nombre: i.insumo_nombre,
      cantidad: i.cantidad,
      unidad: i.unidad || 'kg',
    }))
  )
  const [vinculandoKey, setVinculandoKey] = useState(null)
  const [deletedIds, setDeletedIds] = useState([])
  const [mano, setMano]     = useState(receta.manoDeObra || 0)
  const [saving, setSaving] = useState(false)
  const [busq, setBusq]     = useState('')

  function handleClose() {
    if (!window.confirm('¿Seguro que querés cancelar? Se perderán los cambios no guardados.')) return
    onClose()
  }
  const [showAC, setShowAC] = useState(false)

  const insumoPorNombre = useMemo(() => {
    const m = {}
    insumos.forEach(i => { m[normalizarNombre(i.nombre || '')] = i })
    return m
  }, [insumos])

  const insumoPorId = useMemo(() => {
    const m = {}
    insumos.forEach(i => { if (i.id != null) m[i.id] = i })
    return m
  }, [insumos])

  // Fuentes para agregar ingredientes: insumos del depósito + bases + sabores
  // (bases se miden en L, sabores en kg). Al vincular con depósito solo insumos.
  const fuentes = useMemo(() => {
    const self = normalizarNombre(receta.nombre || '')
    const ins = insumos.map(i => ({ id: i.id, nombre: i.nombre, unidad: i.unidad || 'kg', clase: 'insumo' }))
    const bas = bases.map(b => ({ id: null, nombre: b.nombre, unidad: 'L', clase: 'base' }))
    const sab = sabores.map(s => ({ id: null, nombre: s.nombre, unidad: 'kg', clase: 'sabor' }))
    return [...ins, ...bas, ...sab].filter(x => normalizarNombre(x.nombre || '') !== self)
  }, [insumos, bases, sabores, receta.nombre])

  const sugerencias = useMemo(() => {
    if (!busq.trim()) return []
    const q = normalizarNombre(busq)
    // Al vincular un ingrediente con el depósito, solo mostramos insumos reales.
    const fuente = vinculandoKey != null ? fuentes.filter(x => x.clase === 'insumo') : fuentes
    return fuente.filter(x => normalizarNombre(x.nombre).includes(q)).slice(0, 10)
  }, [busq, fuentes, vinculandoKey])

  const ingsConCosto = useMemo(() =>
    ings.map(i => {
      const tIng = costeador ? costeador.tipoDe(i.nombre) : tipoIngrediente(i.nombre, intermedios)
      // Prioridad: vínculo por ID; si no hay, cae al nombre (compatibilidad)
      const porId = i.insumo_id != null ? insumoPorId[i.insumo_id] : null
      const ins = porId || insumoPorNombre[normalizarNombre(i.nombre || '')]
      // Costo: si es un insumo vinculado, sale de ESE insumo del depósito (aunque
      // el nombre no matchee el costeador). Intermedios y no vinculados: rollup por nombre.
      const cu = (tIng === 'insumo' && ins) ? (Number(ins.costo_unitario) || 0)
        : (costeador ? costeador.costoDe(i.nombre) : (ins?.costo_unitario || 0))
      // "tienePreco": tiene costo real cargado. Insumo con $0 → falta cargar precio.
      const tienePreco = tIng === 'agua' ? true : cu > 0
      return { ...i, tIng, costoUnit: cu, costoTotal: (Number(i.cantidad) || 0) * cu, tienePreco, vinculado: !!porId, insumoVinc: porId?.nombre || null }
    }),
    [ings, insumoPorNombre, insumoPorId, intermedios, costeador]
  )

  const subtotalMP  = ingsConCosto.reduce((a, i) => a + i.costoTotal, 0)
  const costoFinal  = subtotalMP + (Number(mano) || 0)
  // "Sin precio" solo aplica a materia prima cruda: agua e intermedios (base/sabor)
  // no se vinculan al depósito a propósito.
  const sinPrecio   = ingsConCosto.some(i => i.tIng === 'insumo' && !i.tienePreco && (i.cantidad || 0) > 0)

  function upd(key, field, val) {
    setIngs(p => p.map(i => i._key === key ? { ...i, [field]: val } : i))
  }
  function rem(key) {
    const ing = ings.find(i => i._key === key)
    if (ing?._id) setDeletedIds(d => [...d, ing._id])
    setIngs(p => p.filter(i => i._key !== key))
  }
  function add(ins) {
    setIngs(p => [...p, { _key: Date.now(), _id: null, insumo_id: ins.id ?? null, nombre: ins.nombre, cantidad: 1, unidad: ins.unidad || 'kg' }])
    setBusq(''); setShowAC(false)
  }
  // Vincular (o re-vincular) una fila existente a un insumo del depósito
  function vincular(key, ins) {
    setIngs(p => p.map(i => i._key === key
      ? { ...i, insumo_id: ins.id ?? null, nombre: ins.nombre, unidad: ins.unidad || i.unidad }
      : i))
    setVinculandoKey(null); setBusq(''); setShowAC(false)
  }

  async function guardar() {
    const tablaIng = tipo === 'Bases' ? 'base_ingredientes' : tipo === 'Sabores' ? 'sabor_ingredientes' : 'impulsivo_ingredientes'
    const tablaP   = tipo === 'Bases' ? 'bases'             : tipo === 'Sabores' ? 'sabores'             : 'impulsivos'
    const fk       = tipo === 'Bases' ? 'base_id'           : tipo === 'Sabores' ? 'sabor_id'            : 'impulsivo_id'

    console.log('Guardando ingredientes:', ingsConCosto)
    setSaving(true)

    // 1. DELETE eliminados
    for (const id of deletedIds) {
      const { data, error } = await supabase.from(tablaIng).delete().eq('id', id).select()
      console.log(`Resultado DELETE id=${id}:`, data, error)
      if (error) {
        setSaving(false)
        showToast(`Error al eliminar ingrediente: ${error.message}`, 'error')
        return
      }
    }

    // 2. UPDATE modificados (tienen _id)
    for (const ing of ingsConCosto.filter(i => i._id)) {
      const { data, error } = await supabase.from(tablaIng)
        .update({ cantidad: Number(ing.cantidad) || 0, unidad: ing.unidad, costo_unitario: ing.costoUnit, insumo_id: ing.insumo_id ?? null })
        .eq('id', ing._id)
        .select()
      console.log(`Resultado UPDATE "${ing.nombre}":`, data, error)
      if (error) {
        setSaving(false)
        showToast(`Error al actualizar "${ing.nombre}": ${error.message}`, 'error')
        return
      }
    }

    // 3. INSERT nuevos (sin _id)
    const nuevos = ingsConCosto.filter(i => !i._id)
    if (nuevos.length > 0) {
      const { data, error } = await supabase.from(tablaIng)
        .insert(nuevos.map(i => ({
          [fk]: receta.id,
          insumo_id: i.insumo_id ?? null,
          insumo_nombre: i.nombre,
          cantidad: Number(i.cantidad) || 0,
          unidad: i.unidad,
          costo_unitario: i.costoUnit,
        })))
        .select()
      console.log('Resultado INSERT:', data, error)
      if (error) {
        setSaving(false)
        showToast(`Error al agregar ingredientes: ${error.message}`, 'error')
        return
      }
    }

    // 4. UPDATE tabla padre (costo_total + mano_de_obra)
    const { error: errP } = await supabase.from(tablaP).update({
      costo_materiales: subtotalMP,
      mano_de_obra: Number(mano) || 0,
      costo_total: costoFinal,
    }).eq('id', receta.id)
    if (errP) {
      setSaving(false)
      showToast(`Error al actualizar costo: ${errP.message}`, 'error')
      return
    }

    // 5. Verificar: recargar desde Supabase antes de confirmar
    const { data: verificados, error: errV } = await supabase
      .from(tablaIng).select('*').eq(fk, receta.id)
    console.log('Resultado verificación:', verificados, errV)
    setSaving(false)
    if (errV) {
      showToast(`Error al verificar guardado: ${errV.message}`, 'error')
      return
    }

    showToast(`"${receta.nombre}" guardada — ${verificados.length} ingrediente${verificados.length !== 1 ? 's' : ''} confirmados en DB`)
    onSaved()
    onClose()
  }

  return (
    <Modal open onClose={handleClose} title={`Editar receta — ${receta.nombre}`} maxWidth="max-w-2xl"
      disableBackdropClose
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={saving}>Guardar cambios</Button>
        </>
      }
    >
      <div className="space-y-4">

        {/* Lista de ingredientes */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: colors.textMuted }}>
            Ingredientes
          </p>
          {ingsConCosto.length === 0 && (
            <p className="text-sm text-center py-4" style={{ color: colors.textMuted }}>Sin ingredientes. Buscá uno abajo para agregar.</p>
          )}
          <div className="space-y-2">
            {ingsConCosto.map(ing => (
              <div key={ing._key} className="flex items-center gap-2 p-2.5 rounded-lg"
                style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}>
                {/* Nombre + vínculo + precio */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: colors.textPrimary }}>{ing.nombre}</p>
                  <div className="text-xs flex items-center gap-2 flex-wrap">
                    {ing.tIng === 'agua' ? (
                      <span style={{ color: colors.info }}>💧 Sin costo (no se almacena)</span>
                    ) : ing.tIng === 'intermedio' ? (
                      <span style={{ color: ing.costoUnit > 0 ? colors.info : colors.warning }}>
                        🧩 Intermedio · {ing.costoUnit > 0 ? `$${pesos(ing.costoUnit)}/${ing.unidad || 'u'} · $${pesos(ing.costoTotal)}` : 'completá su receta para costearlo'}
                      </span>
                    ) : (
                      <>
                        {ing.vinculado
                          ? <span className="flex items-center gap-1" style={{ color: ing.tienePreco ? colors.success : colors.warning }}>🔗 {ing.tienePreco ? 'Vinculado' : 'Vinculado (sin costo)'}{ing.insumoVinc && normalizarNombre(ing.insumoVinc) !== normalizarNombre(ing.nombre || '') ? ` a "${ing.insumoVinc}"` : ''}</span>
                          : <button type="button"
                              onMouseDown={() => { setVinculandoKey(ing._key); setBusq(''); setShowAC(true) }}
                              className="flex items-center gap-1 underline" style={{ color: colors.warning }}>
                              <AlertTriangle size={10} /> Vincular insumo
                            </button>}
                        {ing.tienePreco
                          ? <span style={{ color: colors.textMuted }}>${pesos(ing.costoUnit)}/{ing.unidad || 'u'} · ${pesos(ing.costoTotal)}</span>
                          : <span style={{ color: colors.warning }}>⚠️ cargá el costo en Depósito</span>}
                      </>
                    )}
                  </div>
                </div>
                {/* Cantidad */}
                <input type="number" min="0" step="0.001" value={ing.cantidad}
                  onChange={e => upd(ing._key, 'cantidad', e.target.value)}
                  className="w-20 text-right rounded-md border text-sm px-2 py-1 outline-none focus:ring-2 focus:ring-orange-300"
                  style={{ borderColor: colors.border }} />
                {/* Unidad */}
                <select value={ing.unidad} onChange={e => upd(ing._key, 'unidad', e.target.value)}
                  className="rounded-md border text-sm px-2 py-1 outline-none"
                  style={{ borderColor: colors.border }}>
                  {UNIDADES.map(u => <option key={u}>{u}</option>)}
                </select>
                {/* Eliminar */}
                <button onClick={() => rem(ing._key)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-[rgba(239,68,68,0.12)] flex-shrink-0"
                  style={{ color: colors.danger }}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Autocomplete agregar / vincular */}
        <div className="relative">
          {vinculandoKey != null && (
            <div className="flex items-center justify-between mb-1 text-xs px-1" style={{ color: colors.warning }}>
              <span>Vinculando <b>{ings.find(i => i._key === vinculandoKey)?.nombre}</b> — elegí el insumo real del depósito</span>
              <button type="button" className="underline" onMouseDown={() => { setVinculandoKey(null); setBusq('') }}>cancelar</button>
            </div>
          )}
          <input type="text"
            placeholder={vinculandoKey != null ? 'Elegí el insumo del depósito…' : 'Buscar insumo para agregar…'}
            value={busq}
            onChange={e => { setBusq(e.target.value); setShowAC(true) }}
            onFocus={() => setShowAC(true)}
            onBlur={() => setTimeout(() => setShowAC(false), 150)}
            className="w-full rounded-md border text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-orange-300"
            style={{ borderColor: vinculandoKey != null ? colors.warning : colors.border }}
          />
          {showAC && sugerencias.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-lg border shadow-lg overflow-hidden"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              {sugerencias.map(ins => {
                const costo = costeador ? costeador.costoDe(ins.nombre) : 0
                const badge = ins.clase === 'base' ? { t: '🧱 base', c: colors.info } : ins.clase === 'sabor' ? { t: '🧊 sabor', c: colors.brand } : null
                return (
                  <button key={`${ins.clase}-${ins.id ?? ins.nombre}`}
                    onMouseDown={() => vinculandoKey != null ? vincular(vinculandoKey, ins) : add(ins)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors"
                    style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <span className="flex items-center gap-1.5" style={{ color: colors.textPrimary }}>
                      {ins.nombre}
                      {badge && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: badge.c, backgroundColor: `${badge.c}18` }}>{badge.t}</span>}
                    </span>
                    <span className="text-xs" style={{ color: costo ? colors.success : colors.warning }}>
                      {costo ? `$${pesos(costo)}/${ins.unidad}` : '⚠️ Sin precio'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Mano de obra */}
        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}>
          <label className="text-sm font-medium flex-1" style={{ color: colors.textSecondary }}>Mano de obra ($)</label>
          <input type="number" min="0" step="1" value={mano}
            onChange={e => setMano(e.target.value)}
            className="w-36 text-right rounded-md border text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-orange-300"
            style={{ borderColor: colors.border }} />
        </div>

        {/* Resumen de costos */}
        <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa' }}>
          <div className="flex justify-between text-sm">
            <span style={{ color: colors.textMuted }}>Subtotal materia prima</span>
            <span style={{ color: colors.textSecondary }}>${pesos(subtotalMP)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: colors.textMuted }}>Mano de obra</span>
            <span style={{ color: colors.textSecondary }}>${pesos(mano)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold pt-2" style={{ borderTop: '1px solid #fed7aa' }}>
            <span style={{ color: colors.textPrimary }}>COSTO TOTAL</span>
            <span style={{ color: colors.brand }}>${pesos(costoFinal)}</span>
          </div>
          {sinPrecio && (
            <p className="text-xs flex items-center gap-1 pt-1" style={{ color: colors.warning }}>
              <AlertTriangle size={12} /> Algunos ingredientes sin precio — el costo puede ser menor al real.
            </p>
          )}
        </div>

      </div>
    </Modal>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function Recetas() {
  const [tab, setTab]           = useState('Bases')
  const [bases, setBases]       = useState([])
  const [baseIngs, setBaseIngs] = useState([])
  const [sabores, setSabores]   = useState([])
  const [saborIngs, setSaborIngs] = useState([])
  const [stockCamaras, setStockCamaras] = useState([])
  const [postres, setPostres]         = useState([])
  const [impulsivos, setImpulsivos] = useState([])
  const [impIngs, setImpIngs]   = useState([])
  const [insumos, setInsumos]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [expandida, setExpandida] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState(null)   // { receta, tipo, rawIngs }
  const [recalculando, setRecalculando] = useState(false)
  const [toast, setToast]       = useState(null)
  const { isAdmin } = useUser()
  const [renombrando, setRenombrando] = useState(null) // { receta, tipo }
  const [savingRename, setSavingRename] = useState(false)
  const [eliminando, setEliminando] = useState(null)   // { receta, tipo }
  const [savingDelete, setSavingDelete] = useState(false)
  const [nuevaReceta, setNuevaReceta] = useState(null) // { tipo, nombre, litros }
  const [savingNueva, setSavingNueva] = useState(false)
  const [exportOpen, setExportOpen]   = useState(false)
  const [selExport, setSelExport]     = useState(() => new Set()) // claves `${tipo}:${id}`
  const [generandoPDF, setGenerandoPDF] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [
      { data: b }, { data: bi },
      { data: s }, { data: si },
      { data: sc },
      { data: imp }, { data: ii },
      { data: ins },
      { data: post },
    ] = await Promise.all([
      supabase.from('bases').select('*').order('nombre'),
      supabase.from('base_ingredientes').select('*'),
      supabase.from('sabores').select('*').order('nombre'),
      supabase.from('sabor_ingredientes').select('*'),
      supabase.from('stock_camaras').select('id,nombre,tipo,tipo_producto'),
      supabase.from('impulsivos').select('*').order('nombre'),
      supabase.from('impulsivo_ingredientes').select('*'),
      supabase.from('insumos').select('id,nombre,costo_unitario,unidad'),
      supabase.from('stock_camaras').select('id,nombre,tipo_producto').eq('tipo_producto', 'postre').order('nombre'),
    ])
    setBases(b || [])
    setBaseIngs(bi || [])
    setSabores(s || [])
    setSaborIngs(si || [])
    setStockCamaras(sc || [])
    setImpulsivos(imp || [])
    setImpIngs(ii || [])
    setInsumos(ins || [])
    setPostres(post || [])
    setLoading(false)
  }

  function showToast(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const insumoPorNombre = useMemo(() => {
    const m = {}
    insumos.forEach(i => { m[normalizarNombre(i.nombre || '')] = i })
    return m
  }, [insumos])

  // Costeador con rollup: el costo de un sabor incluye su base; el de un postre,
  // sus sabores. Resuelve intermedios (base/sabor) recursivamente; el agua es gratis.
  const costeador = useMemo(
    () => crearCosteador({ insumos, bases, baseIngredientes: baseIngs, sabores, saborIngredientes: saborIngs }),
    [insumos, bases, baseIngs, sabores, saborIngs]
  )

  // Costo UNITARIO exacto (mismo motor que Finanzas): sabor $/kg = (MP del batch
  // con la base rolleada + mano de obra) / rinde; impulsivo $/u; postre $/kg.
  // Es "el precio exacto de cada kg que vendo" del sabor. tiposMap marca cuáles
  // impulsivos son en realidad postres (se costean por kg y no por unidad).
  const costoUnitario = useMemo(() => {
    const tiposMap = {}; postres.forEach(p => { tiposMap[(p.nombre || '').toUpperCase()] = 'postre' })
    return crearCostoUnitario({
      insumos, bases, baseIngredientes: baseIngs, sabores, saborIngredientes: saborIngs,
      impulsivos, impulsivoIngredientes: impIngs, tiposMap,
    })
  }, [insumos, bases, baseIngs, sabores, saborIngs, impulsivos, impIngs, postres])

  function enrichIngs(rawList, nombreField = 'insumo_nombre') {
    return rawList.map(i => {
      const nombre = i[nombreField]
      const tIng = costeador.tipoDe(nombre)
      const cu = costeador.costoDe(nombre) // incluye rollup de intermedios
      return {
        insumo: nombre,
        cantidad: i.cantidad,
        unidad: i.unidad,
        tIng,
        costoUnit: cu,
        costoTotal: (Number(i.cantidad) || 0) * cu,
        // tiene costo real: agua siempre; el resto necesita costo > 0 (insumo $0 = falta precio)
        tienePreco: tIng === 'agua' ? true : cu > 0,
      }
    })
  }

  const datosActivos = useMemo(() => {
    const baseIngsPor  = {}; baseIngs.forEach(i  => { (baseIngsPor[i.base_id]         ||= []).push(i) })
    const saborIngsPor = {}; saborIngs.forEach(i => { (saborIngsPor[i.sabor_id]       ||= []).push(i) })
    const impIngsPor   = {}; impIngs.forEach(i   => { (impIngsPor[i.impulsivo_id]     ||= []).push(i) })
    const tipoPorNombre = {}; stockCamaras.forEach(c => { tipoPorNombre[c.nombre] = c.tipo })

    // Mapa de ingredientes de postres desde lib/postres.js (fallback / semilla)
    const postresLibMap = {}
    POSTRES.forEach(p => { postresLibMap[normalizarNombre(p.nombre || '')] = p.ingredientes || [] })
    // Recetas de postres viven en la tabla `impulsivos` (igual que producción).
    const impPorNombre = {}; impulsivos.forEach(im => { impPorNombre[normalizarNombre(im.nombre || '')] = im })
    // Nombres que son postres (para no mostrarlos en la pestaña Impulsivos).
    const postreNombres = new Set(postres.map(p => normalizarNombre(p.nombre || '')))

    return {
      Bases: bases.map(b => {
        const ings = enrichIngs(baseIngsPor[b.id] || [])
        const subtotalMP = ings.reduce((a, i) => a + i.costoTotal, 0)
        const litrosBatch = b.litros_batch || 0
        const costoUnit = litrosBatch > 0 ? (subtotalMP + (b.mano_de_obra || 0)) / litrosBatch : 0
        return {
          id: b.id, nombre: (b.nombre || '').toUpperCase(), tipo: 'Base',
          litros_batch: b.litros_batch || 0,
          manoDeObra: b.mano_de_obra || 0,
          costoTotal: b.costo_total || 0,
          costoUnit, unidadUnit: 'L',
          subtotalMP, ingredientes: ings,
          sinPrecio: ings.some(i => i.tIng === 'insumo' && !i.tienePreco),
          updatedAt: b.updated_at,
        }
      }),
      Sabores: sabores.map(s => {
        const ings = enrichIngs(saborIngsPor[s.id] || [])
        const subtotalMP = ings.reduce((a, i) => a + i.costoTotal, 0)
        const info = costoUnitario.infoDe(s.nombre) // $/kg exacto (MP rolleada + MOD / rinde)
        return {
          id: s.id, nombre: (s.nombre || '').toUpperCase(),
          tipo: tipoPorNombre[s.nombre] || 'Sabor',
          baseNombre: s.base_nombre,
          litros_batch: s.litros_base || 0,
          notas: s.notas,
          manoDeObra: s.mano_de_obra || 0,
          costoTotal: s.costo_total || 0,
          costoUnit: info.costo, unidadUnit: 'kg',
          subtotalMP, ingredientes: ings,
          sinPrecio: ings.some(i => i.tIng === 'insumo' && !i.tienePreco),
          updatedAt: s.updated_at,
        }
      }),
      Impulsivos: impulsivos.filter(i => !postreNombres.has(normalizarNombre(i.nombre || ''))).map(i => {
        const ings = enrichIngs(impIngsPor[i.id] || [])
        const subtotalMP = ings.reduce((a, i2) => a + i2.costoTotal, 0)
        const info = costoUnitario.infoDe(i.nombre)
        return {
          id: i.id, nombre: (i.nombre || '').toUpperCase(), tipo: 'Impulsivo',
          litros_batch: 0,
          manoDeObra: i.mano_de_obra || 0,
          costoTotal: i.costo_total || 0,
          costoUnit: info.costo, unidadUnit: info.unidad,
          subtotalMP, ingredientes: ings,
          sinPrecio: ings.some(i2 => i2.tIng === 'insumo' && !i2.tienePreco),
          updatedAt: i.updated_at,
        }
      }),
      Postres: postres.map(p => {
        const key = normalizarNombre(p.nombre || '')
        const imp = impPorNombre[key]
        const dbIngs = imp ? (impIngsPor[imp.id] || []) : []
        // Prioriza la receta editada en DB; si no hay, usa el catálogo como base.
        const ings = dbIngs.length > 0
          ? enrichIngs(dbIngs)
          : enrichIngs(postresLibMap[key] || [], 'nombre')
        const subtotalMP = ings.reduce((a, i) => a + i.costoTotal, 0)
        const info = costoUnitario.infoDe(p.nombre)
        return {
          id: p.id, nombre: (p.nombre || '').toUpperCase(), tipo: 'Postre',
          litros_batch: 0, manoDeObra: imp?.mano_de_obra || 0, costoTotal: imp?.costo_total || 0,
          costoUnit: info.costo, unidadUnit: info.unidad || 'kg',
          subtotalMP, ingredientes: ings,
          sinPrecio: ings.some(i => i.tIng === 'insumo' && !i.tienePreco),
        }
      }),
    }
  }, [bases, baseIngs, sabores, saborIngs, stockCamaras, impulsivos, impIngs, postres, insumoPorNombre, costoUnitario])

  const recetasTab = useMemo(() => {
    const lista = datosActivos[tab] || []
    if (!busqueda) return lista
    return lista.filter(r => r.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  }, [tab, busqueda, datosActivos])

  // Nombres de productos intermedios (bases + sabores): no son insumos del
  // depósito, son del proceso anterior. Se usan para clasificar ingredientes.
  const nombresIntermedios = useMemo(() => {
    const s = new Set()
    bases.forEach(b => s.add(normalizarNombre(b.nombre)))
    sabores.forEach(sa => s.add(normalizarNombre(sa.nombre)))
    return s
  }, [bases, sabores])

  async function recalcularCostos() {
    setRecalculando(true)
    let n = 0
    try {
      // Usamos el costeador (rollup): así el costo de materiales de un SABOR
      // incluye su base explotada, y no queda subvaluado por ignorar el intermedio.
      for (const s of sabores) {
        const ings = saborIngs.filter(si => si.sabor_id === s.id)
        const costoMat = ings.reduce((a, i) => a + (Number(i.cantidad) || 0) * costeador.costoDe(i.insumo_nombre), 0)
        await supabase.from('sabores').update({ costo_materiales: costoMat, costo_total: costoMat + (s.mano_de_obra || 0) }).eq('id', s.id)
        n++
      }
      for (const b of bases) {
        const ings = baseIngs.filter(bi => bi.base_id === b.id)
        const costoMat = ings.reduce((a, i) => a + (Number(i.cantidad) || 0) * costeador.costoDe(i.insumo_nombre), 0)
        await supabase.from('bases').update({ costo_materiales: costoMat, costo_total: costoMat + (b.mano_de_obra || 0) }).eq('id', b.id)
        n++
      }
      for (const i of impulsivos) {
        const ings = impIngs.filter(ii => ii.impulsivo_id === i.id)
        const costoMat = ings.reduce((a, ing) => a + (Number(ing.cantidad) || 0) * costeador.costoDe(ing.insumo_nombre), 0)
        await supabase.from('impulsivos').update({ costo_materiales: costoMat, costo_total: costoMat + (i.mano_de_obra || 0) }).eq('id', i.id)
        n++
      }
      await cargar()
      showToast(`${n} recetas actualizadas con precios actuales del depósito`)
    } catch {
      showToast('Error al recalcular costos', 'error')
    } finally {
      setRecalculando(false)
    }
  }

  // Crea una receta vacía del tipo elegido y abre el editor para cargar sus
  // ingredientes. Bases/Sabores llevan litros de tanda; impulsivos/postres, no.
  async function crearNuevaReceta() {
    if (!nuevaReceta) return
    const nom = (nuevaReceta.nombre || '').trim().toUpperCase()
    if (!nom) { showToast('Poné un nombre', 'error'); return }
    const litros = Number(nuevaReceta.litros) || 120
    setSavingNueva(true)
    try {
      const t = nuevaReceta.tipo
      if (t === 'Bases') {
        const { data, error } = await supabase.from('bases').insert({ nombre: nom, litros_batch: litros, costo_materiales: 0, mano_de_obra: 0, costo_total: 0 }).select().single()
        if (error) throw error
        await cargar(); setTab('Bases'); setEditando({ receta: { ...data, nombre: nom, manoDeObra: 0 }, tipo: 'Bases', rawIngs: [] })
      } else if (t === 'Sabores') {
        const { data, error } = await supabase.from('sabores').insert({ nombre: nom, litros_base: litros, costo_materiales: 0, mano_de_obra: 0, costo_total: 0 }).select().single()
        if (error) throw error
        await cargar(); setTab('Sabores'); setEditando({ receta: { ...data, nombre: nom, manoDeObra: 0 }, tipo: 'Sabores', rawIngs: [] })
      } else if (t === 'Impulsivos') {
        const { data, error } = await supabase.from('impulsivos').insert({ nombre: nom, costo_materiales: 0, mano_de_obra: 0, costo_total: 0 }).select().single()
        if (error) throw error
        await cargar(); setTab('Impulsivos'); setEditando({ receta: { ...data, nombre: nom, manoDeObra: 0 }, tipo: 'Impulsivos', rawIngs: [] })
      } else { // Postres: viven en stock_camaras (tipo_producto=postre); receta en impulsivos.
        const { error: e1 } = await supabase.from('stock_camaras').insert({ nombre: nom, tipo_producto: 'postre', tipo: 'Con Agregado', baldes: 0, kg: 0, ultima_actualizacion: new Date().toISOString() })
        if (e1) throw e1
        const { data: imp, error: e2 } = await supabase.from('impulsivos').insert({ nombre: nom, costo_materiales: 0, mano_de_obra: 0, costo_total: 0 }).select().single()
        if (e2) throw e2
        await cargar(); setTab('Postres'); setEditando({ receta: { ...imp, nombre: nom, manoDeObra: 0 }, tipo: 'Postres', rawIngs: [] })
      }
      setNuevaReceta(null)
    } catch (err) {
      showToast(err.message || 'No se pudo crear la receta', 'error')
    } finally {
      setSavingNueva(false)
    }
  }

  // Exporta a PDF las recetas seleccionadas, SIN costos — solo fórmulas — en
  // formato profesional con logo y leyenda de uso confidencial. Para compartir
  // con el maestro heladero.
  async function generarPDFRecetas() {
    setGenerandoPDF(true)
    try {
      const GRUPOS = ['Bases', 'Sabores', 'Impulsivos', 'Postres']
      const elegidas = GRUPOS.flatMap(g => (datosActivos[g] || [])
        .filter(r => selExport.has(`${g}:${r.id}`))
        .map(r => ({ ...r, _grupo: g })))
      if (elegidas.length === 0) { showToast('Elegí al menos una receta', 'error'); setGenerandoPDF(false); return }

      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pw = doc.internal.pageSize.getWidth()
      const ph = doc.internal.pageSize.getHeight()
      const hoy = new Date().toLocaleString('es-AR')
      const MOD = 'RECETARIO'
      const TIT = 'RECETARIO DE PRODUCCIÓN'

      // Portada + nota de confidencialidad
      dibujarPortada(doc, pw, ph, MOD, TIT, 'Documento confidencial', hoy)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(150, 40, 40)
      doc.text('CONFIDENCIAL — USO EXCLUSIVO', pw / 2, ph - 46, { align: 'center' })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 120, 120)
      doc.text('Propiedad de Helados del Parque. Prohibida su reproducción, copia o divulgación total o parcial.', pw / 2, ph - 40, { align: 'center' })

      const encab = () => dibujarEncabezado(doc, pw, MOD, TIT, hoy)
      const HEAD = { fillColor: [35, 35, 35], textColor: [255, 255, 255], halign: 'left', fontStyle: 'bold', lineWidth: 0.1, lineColor: [180, 180, 180] }
      const BODY = { textColor: [25, 25, 25], lineWidth: 0.1, lineColor: [215, 215, 215] }
      const grpLabel = { Bases: '🧱 BASES', Sabores: '🧊 SABORES', Impulsivos: '📦 IMPULSIVOS', Postres: '🍰 POSTRES' }

      doc.addPage(); encab()
      let y = PDF_CONTENT_Y

      GRUPOS.forEach(g => {
        const items = elegidas.filter(r => r._grupo === g)
        if (!items.length) return
        if (y + 16 > ph - 20) { doc.addPage(); encab(); y = PDF_CONTENT_Y }
        y = dibujarSeccion(doc, pw, `${grpLabel[g]}  (${items.length})`, y)

        items.forEach(r => {
          if (y + 24 > ph - 20) { doc.addPage(); encab(); y = PDF_CONTENT_Y }
          // Título de la receta
          doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20, 20, 20)
          doc.text(r.nombre, 14, y + 4)
          // Meta (sin costos): base, tanda, rinde
          const meta = []
          if (g === 'Bases') meta.push(`Tanda: ${r.litros_batch || 120} L`)
          if (g === 'Sabores') { if (r.baseNombre) meta.push(`Base: ${r.baseNombre}`); meta.push(`Tanda base: ${r.litros_batch || 120} L`) }
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 110, 110)
          if (meta.length) doc.text(meta.join('   ·   '), 14, y + 9)
          y += meta.length ? 12 : 8

          const filas = (r.ingredientes || []).map(i => [i.insumo, String(i.cantidad ?? ''), i.unidad || ''])
          if (!filas.length) {
            doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(150, 150, 150)
            doc.text('Sin ingredientes cargados.', 16, y + 2); y += 8
            return
          }
          autoTable(doc, {
            startY: y,
            head: [['INGREDIENTE', 'CANTIDAD', 'UNIDAD']],
            body: filas,
            headStyles: HEAD, bodyStyles: BODY, alternateRowStyles: { fillColor: [245, 245, 245] },
            styles: { fontSize: 8.5, cellPadding: 1.8, valign: 'middle' },
            columnStyles: { 0: { halign: 'left', cellWidth: 110 }, 1: { halign: 'right' }, 2: { halign: 'center' } },
            margin: { top: PDF_CONTENT_Y, left: 14, right: 14 }, didDrawPage: encab,
          })
          y = doc.lastAutoTable.finalY + 7
        })
        y += 2
      })

      const total = doc.internal.getNumberOfPages()
      for (let p = 2; p <= total; p++) { doc.setPage(p); dibujarPie(doc, pw, ph, p) }
      doc.save(`recetario_delparque_${new Date().toISOString().split('T')[0]}.pdf`)
      setExportOpen(false)
    } catch (err) {
      showToast(err.message || 'No se pudo generar el PDF', 'error')
    } finally {
      setGenerandoPDF(false)
    }
  }

  async function abrirEditor(receta) {
    if (tab === 'Postres') {
      // Postres viven en stock_camaras pero sus recetas están en tabla impulsivos
      const { data: impMatch } = await supabase
        .from('impulsivos').select('*').ilike('nombre', receta.nombre).maybeSingle()
      if (impMatch) {
        const rawIngs = impIngs.filter(i => i.impulsivo_id === impMatch.id)
        setEditando({ receta: { ...impMatch, nombre: (receta.nombre || '').toUpperCase() }, tipo: 'Postres', rawIngs })
      } else {
        // Crear registro en impulsivos para poder guardar ingredientes
        const { data: nuevo, error } = await supabase
          .from('impulsivos')
          .insert({ nombre: (receta.nombre || '').toUpperCase(), costo_materiales: 0, mano_de_obra: 0, costo_total: 0 })
          .select().single()
        if (error) { showToast(error.message, 'error'); return }
        setImpulsivos(prev => [...prev, nuevo])
        // Sembrar con la receta del catálogo (lib/postres.js) para no arrancar vacío.
        const cat = POSTRES.find(pp => normalizarNombre(pp.nombre || '') === normalizarNombre(receta.nombre || ''))
        let rawIngs = []
        if (cat?.ingredientes?.length) {
          const filas = cat.ingredientes.map(i => ({ impulsivo_id: nuevo.id, insumo_nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad }))
          const { data: ins } = await supabase.from('impulsivo_ingredientes').insert(filas).select()
          rawIngs = ins || []
          if (ins?.length) setImpIngs(prev => [...prev, ...ins])
        }
        setEditando({ receta: nuevo, tipo: 'Postres', rawIngs })
      }
      return
    }
    const rawMap = {
      Bases:      baseIngs.filter(i => i.base_id === receta.id),
      Sabores:    saborIngs.filter(i => i.sabor_id === receta.id),
      Impulsivos: impIngs.filter(i => i.impulsivo_id === receta.id),
    }
    setEditando({ receta, tipo: tab, rawIngs: rawMap[tab] || [] })
  }

  async function renombrarReceta(nuevoNombre) {
    if (!renombrando) return
    const { receta, tipo } = renombrando
    const nombreAntiguo = receta.nombre
    setSavingRename(true)
    if (tipo === 'Postres') {
      // Postres live in stock_camaras
      const { error } = await supabase.from('stock_camaras').update({ nombre: nuevoNombre.toUpperCase() }).eq('id', receta.id)
      if (error) { setSavingRename(false); showToast(error.message, 'error'); return }
    } else {
      const tablaP = tipo === 'Bases' ? 'bases' : tipo === 'Sabores' ? 'sabores' : 'impulsivos'
      const { error } = await supabase.from(tablaP).update({ nombre: nuevoNombre }).eq('id', receta.id)
      if (error) { setSavingRename(false); showToast(error.message, 'error'); return }
      await supabase.from('stock_camaras').update({ nombre: nuevoNombre.toUpperCase() }).ilike('nombre', nombreAntiguo)
    }
    await supabase.from('producciones').update({ producto_nombre: nuevoNombre.toUpperCase() }).ilike('producto_nombre', nombreAntiguo)
    setSavingRename(false)
    setRenombrando(null)
    showToast('Nombre actualizado en recetas y cámaras')
    cargar()
  }

  async function eliminarReceta() {
    if (!eliminando) return
    const { receta, tipo } = eliminando
    setSavingDelete(true)
    if (tipo === 'Postres') {
      const { error } = await supabase.from('stock_camaras').delete().eq('id', receta.id)
      setSavingDelete(false)
      if (error) { showToast(error.message, 'error'); return }
    } else {
      const tablaIng = tipo === 'Bases' ? 'base_ingredientes' : tipo === 'Sabores' ? 'sabor_ingredientes' : 'impulsivo_ingredientes'
      const tablaP   = tipo === 'Bases' ? 'bases'             : tipo === 'Sabores' ? 'sabores'             : 'impulsivos'
      const fk       = tipo === 'Bases' ? 'base_id'           : tipo === 'Sabores' ? 'sabor_id'            : 'impulsivo_id'
      await supabase.from(tablaIng).delete().eq(fk, receta.id)
      const { error } = await supabase.from(tablaP).delete().eq('id', receta.id)
      setSavingDelete(false)
      if (error) { showToast(error.message, 'error'); return }
    }
    setEliminando(null)
    showToast(`"${receta.nombre}" eliminada`)
    cargar()
  }

  return (
    <div className="space-y-5">
      <Toast toast={toast} />

      <PageHeader
        title="Recetas"
        subtitle="Catálogo de fórmulas Del Parque"
        actions={<>
          {isAdmin && (
            <>
              <Button variant="primary" onClick={() => setNuevaReceta({ tipo: tab, nombre: '', litros: '120' })}>
                <Plus size={14} /> Nueva receta
              </Button>
              <Button variant="secondary" onClick={() => { setSelExport(new Set()); setExportOpen(true) }}>
                <FileDown size={14} /> Exportar recetas
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={recalcularCostos} loading={recalculando} disabled={recalculando}>
            <RefreshCw size={14} /> Recalcular costos
          </Button>
        </>}
      />

      {/* Tabs */}
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
          {recetasTab.map(r => {
            const key = `${tab}-${r.id}`
            const abierta = expandida === key
            const ings = r.ingredientes
            const costoUnit = r.costoUnit || 0          // $/kg (sabor/postre), $/L (base), $/u (impulsivo)
            const unidadUnit = r.unidadUnit || 'u'
            const partes = []
            if (r.litros_batch > 0) partes.push(`${r.litros_batch} L/batch`)
            if (r.baseNombre) partes.push(`Base: ${r.baseNombre}`)

            return (
              <div key={key} className="overflow-hidden" style={SURFACE}>
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-3 cursor-pointer"
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = colors.bg }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  onClick={() => setExpandida(abierta ? null : key)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm" style={{ color: colors.textPrimary }}>{r.nombre}</p>
                      <Badge variant={tipoVariant(r.tipo)}>{r.tipo}</Badge>
                      {r.sinPrecio && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)', color: colors.warning }}>
                          <AlertTriangle size={9} /> Sin precio
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {partes.length > 0 && (
                        <p className="text-xs" style={{ color: colors.textMuted }}>{partes.join(' · ')}</p>
                      )}
                      {costoUnit > 0 && (
                        <p className="text-xs font-bold" style={{ color: colors.brand }}>
                          ${pesos(costoUnit)}/{unidadUnit}
                          <span className="font-normal" style={{ color: colors.textMuted }}> · costo por {unidadUnit === 'kg' ? 'kg' : unidadUnit === 'L' ? 'litro' : 'unidad'}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); abrirEditor(r) }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
                      style={{ backgroundColor: '#fff7ed', color: colors.brand, border: `1px solid #fed7aa` }}>
                      <Edit2 size={11} /> Editar
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); setRenombrando({ receta: r, tipo: tab }) }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
                          style={{ backgroundColor: 'rgba(96,165,250,0.1)', color: '#60A5FA', border: '1px solid rgba(96,165,250,0.3)' }}>
                          ✏️ Renombrar
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setEliminando({ receta: r, tipo: tab }) }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
                          style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: colors.danger, border: '1px solid rgba(239,68,68,0.3)' }}>
                          🗑️ Eliminar
                        </button>
                      </>
                    )}
                    {abierta
                      ? <ChevronUp size={16} style={{ color: colors.textMuted }} />
                      : <ChevronDown size={16} style={{ color: colors.textMuted }} />
                    }
                  </div>
                </div>

                {/* Expandido */}
                {abierta && (
                  <div style={{ borderTop: `1px solid ${colors.border}` }}>
                    {/* Header tabla */}
                    <div className="px-4 py-2 flex items-center justify-between" style={{ backgroundColor: colors.bg }}>
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                        Ingredientes
                      </span>
                      <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                        <span className="w-20 text-right">Cantidad</span>
                        <span className="w-10 text-right">Ud.</span>
                        <span className="w-20 text-right">$/ud</span>
                        <span className="w-24 text-right">Subtotal</span>
                      </div>
                    </div>

                    {ings.length === 0 ? (
                      <p className="px-4 py-3 text-sm" style={{ color: colors.textMuted }}>Sin ingredientes cargados</p>
                    ) : (
                      <div>
                        {ings.map((ing, i) => (
                          <div key={i} className="flex items-center justify-between px-4 py-2.5"
                            style={{ borderBottom: i === ings.length - 1 ? 'none' : `1px solid ${colors.border}` }}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {!ing.tienePreco && <AlertTriangle size={12} style={{ color: colors.warning, flexShrink: 0 }} />}
                              <span className="text-sm" style={{ color: colors.textSecondary }}>{ing.insumo}</span>
                            </div>
                            <div className="flex gap-4 items-center text-sm tabular-nums flex-shrink-0">
                              <span className="w-20 text-right font-semibold" style={{ color: colors.brand }}>
                                {ing.cantidad}
                              </span>
                              <span className="w-10 text-right" style={{ color: colors.textMuted }}>{ing.unidad}</span>
                              <span className="w-20 text-right" style={{ color: ing.tienePreco ? colors.textSecondary : colors.textMuted }}>
                                {ing.tienePreco ? `$${pesos(ing.costoUnit)}` : '—'}
                              </span>
                              <span className="w-24 text-right font-semibold" style={{ color: ing.tienePreco ? colors.textPrimary : colors.textMuted }}>
                                {ing.tienePreco ? `$${pesos(ing.costoTotal)}` : '—'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Resumen costos */}
                    <div className="px-4 py-3 space-y-1" style={{ borderTop: `1px solid ${colors.border}`, backgroundColor: '#fffbf5' }}>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: colors.textMuted }}>Subtotal materia prima</span>
                        <span style={{ color: colors.textSecondary }}>${pesos(r.subtotalMP)}</span>
                      </div>
                      {r.manoDeObra > 0 && (
                        <div className="flex justify-between text-xs">
                          <span style={{ color: colors.textMuted }}>Mano de obra</span>
                          <span style={{ color: colors.textSecondary }}>${pesos(r.manoDeObra)}</span>
                        </div>
                      )}
                      {r.litros_batch > 0 && (
                        <div className="flex justify-between text-xs">
                          <span style={{ color: colors.textMuted }}>
                            Costo del batch {costoUnit > 0 && `(rinde ≈ ${(((r.subtotalMP + r.manoDeObra) / costoUnit) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })} ${unidadUnit})`}
                          </span>
                          <span style={{ color: colors.textSecondary }}>${pesos(r.subtotalMP + r.manoDeObra)}</span>
                        </div>
                      )}
                      {costoUnit > 0 && (
                        <div className="flex justify-between items-center text-base font-bold pt-1.5 mt-1" style={{ borderTop: `1px solid #fed7aa` }}>
                          <span style={{ color: colors.textPrimary }}>
                            COSTO POR {unidadUnit === 'kg' ? 'KG' : unidadUnit === 'L' ? 'LITRO' : 'UNIDAD'}
                          </span>
                          <span style={{ color: colors.brand }}>${pesos(costoUnit)}/{unidadUnit}</span>
                        </div>
                      )}
                      <p className="text-[10px] pt-1" style={{ color: colors.textMuted }}>
                        Costo receta = materia prima + mano de obra. Los CIF se suman en Finanzas para el costo final.
                      </p>
                      {r.updatedAt && (
                        <p className="text-[10px] pt-1" style={{ color: colors.textMuted }}>
                          Última actualización: {fmtFecha(r.updatedAt)}
                        </p>
                      )}
                    </div>

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

      {editando && (
        <ModalEditarReceta
          receta={editando.receta}
          tipo={editando.tipo}
          rawIngs={editando.rawIngs}
          insumos={insumos}
          bases={bases}
          sabores={sabores}
          intermedios={nombresIntermedios}
          costeador={costeador}
          onClose={() => setEditando(null)}
          onSaved={() => cargar()}
          showToast={showToast}
        />
      )}
      {renombrando && (
        <ModalRenombrar
          receta={renombrando.receta}
          onClose={() => setRenombrando(null)}
          onSubmit={renombrarReceta}
          saving={savingRename}
        />
      )}
      {eliminando && (
        <ModalConfEliminar
          receta={eliminando.receta}
          onClose={() => setEliminando(null)}
          onConfirm={eliminarReceta}
          saving={savingDelete}
        />
      )}

      {nuevaReceta && (
        <Modal open onClose={() => setNuevaReceta(null)} title="Nueva receta" maxWidth="max-w-sm" disableBackdropClose>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold" style={{ color: colors.textSecondary }}>Tipo</label>
              <div className="flex gap-1.5 flex-wrap mt-1">
                {TABS.map(t => (
                  <button key={t} onClick={() => setNuevaReceta(p => ({ ...p, tipo: t }))}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                    style={{
                      backgroundColor: nuevaReceta.tipo === t ? colors.brand : 'transparent',
                      borderColor: nuevaReceta.tipo === t ? colors.brand : colors.border,
                      color: nuevaReceta.tipo === t ? 'white' : colors.textSecondary,
                    }}>{t}</button>
                ))}
              </div>
            </div>
            <Input label="Nombre *" type="text" value={nuevaReceta.nombre} autoFocus
              onChange={e => setNuevaReceta(p => ({ ...p, nombre: e.target.value }))}
              placeholder={nuevaReceta.tipo === 'Bases' ? 'Ej: NEUTRA LECHE' : nuevaReceta.tipo === 'Sabores' ? 'Ej: DULCE DE LECHE' : 'Nombre del producto'} />
            {(nuevaReceta.tipo === 'Bases' || nuevaReceta.tipo === 'Sabores') && (
              <Input label={nuevaReceta.tipo === 'Bases' ? 'Litros por tanda' : 'Litros de base por tanda'} type="number" min="0"
                value={nuevaReceta.litros} onChange={e => setNuevaReceta(p => ({ ...p, litros: e.target.value }))} />
            )}
            <p className="text-[11px]" style={{ color: colors.textMuted }}>
              Se crea la receta y se abre el editor para cargar los ingredientes.
            </p>
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={() => setNuevaReceta(null)} className="flex-1">Cancelar</Button>
              <Button variant="primary" onClick={crearNuevaReceta} loading={savingNueva} className="flex-1">Crear y editar</Button>
            </div>
          </div>
        </Modal>
      )}

      {exportOpen && (() => {
        const GRUPOS = ['Bases', 'Sabores', 'Impulsivos', 'Postres']
        const total = GRUPOS.reduce((a, g) => a + (datosActivos[g] || []).length, 0)
        const toggle = (key) => setSelExport(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
        const toggleGrupo = (g) => setSelExport(prev => {
          const n = new Set(prev)
          const keys = (datosActivos[g] || []).map(r => `${g}:${r.id}`)
          const allSel = keys.every(k => n.has(k))
          keys.forEach(k => allSel ? n.delete(k) : n.add(k))
          return n
        })
        const selAll = () => setSelExport(new Set(GRUPOS.flatMap(g => (datosActivos[g] || []).map(r => `${g}:${r.id}`))))
        return (
          <Modal open onClose={() => setExportOpen(false)} title="Exportar recetas (PDF)" maxWidth="max-w-2xl" disableBackdropClose={false}>
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs" style={{ color: colors.textMuted }}>
                  Elegí qué recetas exportar. Salen <b style={{ color: colors.textSecondary }}>sin costos</b>, solo las fórmulas, en formato profesional y confidencial.
                </p>
                <div className="flex gap-2">
                  <button onClick={selAll} className="text-xs px-2 py-1 rounded-md border" style={{ borderColor: colors.border, color: colors.textSecondary }}>Todas</button>
                  <button onClick={() => setSelExport(new Set())} className="text-xs px-2 py-1 rounded-md border" style={{ borderColor: colors.border, color: colors.textSecondary }}>Ninguna</button>
                </div>
              </div>
              <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
                {GRUPOS.map(g => {
                  const items = datosActivos[g] || []
                  if (!items.length) return null
                  const keys = items.map(r => `${g}:${r.id}`)
                  const allSel = keys.every(k => selExport.has(k))
                  const someSel = keys.some(k => selExport.has(k))
                  return (
                    <div key={g} className="rounded-lg border overflow-hidden" style={{ borderColor: colors.border }}>
                      <label className="flex items-center gap-2 px-3 py-2 cursor-pointer" style={{ backgroundColor: colors.bg }}>
                        <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel && !allSel }} onChange={() => toggleGrupo(g)} />
                        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>{g}</span>
                        <span className="text-xs" style={{ color: colors.textMuted }}>({items.length})</span>
                      </label>
                      <div className="grid sm:grid-cols-2 gap-x-4">
                        {items.map(r => {
                          const key = `${g}:${r.id}`
                          return (
                            <label key={key} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm"
                              style={{ color: colors.textSecondary }}>
                              <input type="checkbox" checked={selExport.has(key)} onChange={() => toggle(key)} />
                              <span className="truncate">{r.nombre}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {total === 0 && <p className="text-sm text-center py-6" style={{ color: colors.textMuted }}>No hay recetas cargadas.</p>}
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs" style={{ color: colors.textMuted }}>{selExport.size} receta{selExport.size !== 1 ? 's' : ''} seleccionada{selExport.size !== 1 ? 's' : ''}</span>
                <Button variant="primary" onClick={generarPDFRecetas} loading={generandoPDF} disabled={selExport.size === 0}>
                  <FileDown size={14} /> Generar PDF
                </Button>
              </div>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}
