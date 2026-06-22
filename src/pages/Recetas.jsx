import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useUser } from '../context/UserContext'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Toast from '../components/ui/Toast'
import { colors, radius, shadow } from '../styles/design-system'
import { BookOpen, Search, Edit2, RefreshCw, X, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { POSTRES } from '../lib/postres'

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
function ModalEditarReceta({ receta, tipo, rawIngs, onClose, onSaved, insumos, showToast }) {
  const [ings, setIngs] = useState(() =>
    rawIngs.map((i, idx) => ({
      _key: idx,
      _id: i.id ?? null,          // id de la DB (null = nuevo)
      nombre: i.insumo_nombre,
      cantidad: i.cantidad,
      unidad: i.unidad || 'kg',
    }))
  )
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
    insumos.forEach(i => { m[(i.nombre || '').trim().toLowerCase()] = i })
    return m
  }, [insumos])

  const sugerencias = useMemo(() => {
    if (!busq.trim()) return []
    const q = busq.trim().toLowerCase()
    return insumos.filter(i => (i.nombre || '').toLowerCase().includes(q)).slice(0, 8)
  }, [busq, insumos])

  const ingsConCosto = useMemo(() =>
    ings.map(i => {
      const ins = insumoPorNombre[(i.nombre || '').trim().toLowerCase()]
      const cu = ins?.costo_unitario || 0
      return { ...i, costoUnit: cu, costoTotal: (Number(i.cantidad) || 0) * cu, tienePreco: !!ins }
    }),
    [ings, insumoPorNombre]
  )

  const subtotalMP  = ingsConCosto.reduce((a, i) => a + i.costoTotal, 0)
  const costoFinal  = subtotalMP + (Number(mano) || 0)
  const sinPrecio   = ingsConCosto.some(i => !i.tienePreco && (i.cantidad || 0) > 0)

  function upd(key, field, val) {
    setIngs(p => p.map(i => i._key === key ? { ...i, [field]: val } : i))
  }
  function rem(key) {
    const ing = ings.find(i => i._key === key)
    if (ing?._id) setDeletedIds(d => [...d, ing._id])
    setIngs(p => p.filter(i => i._key !== key))
  }
  function add(ins) {
    setIngs(p => [...p, { _key: Date.now(), _id: null, nombre: ins.nombre, cantidad: 1, unidad: ins.unidad || 'kg' }])
    setBusq(''); setShowAC(false)
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
        .update({ cantidad: Number(ing.cantidad) || 0, unidad: ing.unidad, costo_unitario: ing.costoUnit })
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
                {/* Nombre + precio */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: colors.textPrimary }}>{ing.nombre}</p>
                  {ing.tienePreco
                    ? <p className="text-xs" style={{ color: colors.success }}>
                        Precio actualizado: ${pesos(ing.costoUnit)}/u · Subtotal: ${pesos(ing.costoTotal)}
                      </p>
                    : <p className="text-xs flex items-center gap-1" style={{ color: colors.warning }}>
                        <AlertTriangle size={10} /> Sin precio en depósito
                      </p>
                  }
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

        {/* Autocomplete agregar */}
        <div className="relative">
          <input type="text" placeholder="Buscar insumo para agregar…"
            value={busq}
            onChange={e => { setBusq(e.target.value); setShowAC(true) }}
            onFocus={() => setShowAC(true)}
            onBlur={() => setTimeout(() => setShowAC(false), 150)}
            className="w-full rounded-md border text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-orange-300"
            style={{ borderColor: colors.border }}
          />
          {showAC && sugerencias.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-lg border shadow-lg overflow-hidden"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
              {sugerencias.map(ins => (
                <button key={ins.nombre} onMouseDown={() => add(ins)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors"
                  style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <span style={{ color: colors.textPrimary }}>{ins.nombre}</span>
                  <span className="text-xs" style={{ color: ins.costo_unitario ? colors.success : colors.warning }}>
                    {ins.costo_unitario ? `$${pesos(ins.costo_unitario)}/u` : '⚠️ Sin precio'}
                  </span>
                </button>
              ))}
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

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [
      { data: b }, { data: bi },
      { data: s }, { data: si },
      { data: sc },
      { data: imp }, { data: ii },
      { data: ins },
    ] = await Promise.all([
      supabase.from('bases').select('*').order('nombre'),
      supabase.from('base_ingredientes').select('*'),
      supabase.from('sabores').select('*').order('nombre'),
      supabase.from('sabor_ingredientes').select('*'),
      supabase.from('stock_camaras').select('id,nombre,tipo'),
      supabase.from('impulsivos').select('*').order('nombre'),
      supabase.from('impulsivo_ingredientes').select('*'),
      supabase.from('insumos').select('nombre,costo_unitario,unidad'),
    ])
    setBases(b || [])
    setBaseIngs(bi || [])
    setSabores(s || [])
    setSaborIngs(si || [])
    setStockCamaras(sc || [])
    setImpulsivos(imp || [])
    setImpIngs(ii || [])
    setInsumos(ins || [])
    setLoading(false)
  }

  function showToast(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const insumoPorNombre = useMemo(() => {
    const m = {}
    insumos.forEach(i => { m[(i.nombre || '').trim().toLowerCase()] = i })
    return m
  }, [insumos])

  function enrichIngs(rawList, nombreField = 'insumo_nombre') {
    return rawList.map(i => {
      const ins = insumoPorNombre[(i[nombreField] || '').trim().toLowerCase()]
      const cu = ins?.costo_unitario || 0
      return {
        insumo: i[nombreField],
        cantidad: i.cantidad,
        unidad: i.unidad,
        costoUnit: cu,
        costoTotal: (Number(i.cantidad) || 0) * cu,
        tienePreco: !!ins,
      }
    })
  }

  const datosActivos = useMemo(() => {
    const baseIngsPor  = {}; baseIngs.forEach(i  => { (baseIngsPor[i.base_id]         ||= []).push(i) })
    const saborIngsPor = {}; saborIngs.forEach(i => { (saborIngsPor[i.sabor_id]       ||= []).push(i) })
    const impIngsPor   = {}; impIngs.forEach(i   => { (impIngsPor[i.impulsivo_id]     ||= []).push(i) })
    const tipoPorNombre = {}; stockCamaras.forEach(c => { tipoPorNombre[c.nombre] = c.tipo })

    return {
      Bases: bases.map(b => {
        const ings = enrichIngs(baseIngsPor[b.id] || [])
        const subtotalMP = ings.reduce((a, i) => a + i.costoTotal, 0)
        return {
          id: b.id, nombre: b.nombre, tipo: 'Base',
          litros_batch: b.litros_batch || 0,
          manoDeObra: b.mano_de_obra || 0,
          costoTotal: b.costo_total || 0,
          subtotalMP, ingredientes: ings,
          sinPrecio: ings.some(i => !i.tienePreco),
          updatedAt: b.updated_at,
        }
      }),
      Sabores: sabores.map(s => {
        const ings = enrichIngs(saborIngsPor[s.id] || [])
        const subtotalMP = ings.reduce((a, i) => a + i.costoTotal, 0)
        return {
          id: s.id, nombre: s.nombre,
          tipo: tipoPorNombre[s.nombre] || 'Sabor',
          baseNombre: s.base_nombre,
          litros_batch: s.litros_base || 0,
          notas: s.notas,
          manoDeObra: s.mano_de_obra || 0,
          costoTotal: s.costo_total || 0,
          subtotalMP, ingredientes: ings,
          sinPrecio: ings.some(i => !i.tienePreco),
          updatedAt: s.updated_at,
        }
      }),
      Impulsivos: impulsivos.map(i => {
        const ings = enrichIngs(impIngsPor[i.id] || [])
        const subtotalMP = ings.reduce((a, i2) => a + i2.costoTotal, 0)
        return {
          id: i.id, nombre: i.nombre, tipo: 'Impulsivo',
          litros_batch: 0,
          manoDeObra: i.mano_de_obra || 0,
          costoTotal: i.costo_total || 0,
          subtotalMP, ingredientes: ings,
          sinPrecio: ings.some(i2 => !i2.tienePreco),
          updatedAt: i.updated_at,
        }
      }),
      Postres: POSTRES.map((p, idx) => {
        const ings = enrichIngs(p.ingredientes, 'nombre')
        const subtotalMP = ings.reduce((a, i) => a + i.costoTotal, 0)
        return {
          id: `postre-${idx}`, nombre: p.nombre, tipo: 'Postre',
          litros_batch: 0,
          manoDeObra: p.mano_de_obra || 0,
          costoTotal: p.costo_total || 0,
          subtotalMP, ingredientes: ings,
          sinPrecio: ings.some(i => !i.tienePreco),
        }
      }),
    }
  }, [bases, baseIngs, sabores, saborIngs, stockCamaras, impulsivos, impIngs, insumoPorNombre])

  const recetasTab = useMemo(() => {
    const lista = datosActivos[tab] || []
    if (!busqueda) return lista
    return lista.filter(r => r.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  }, [tab, busqueda, datosActivos])

  async function recalcularCostos() {
    setRecalculando(true)
    let n = 0
    try {
      for (const s of sabores) {
        const ings = saborIngs.filter(si => si.sabor_id === s.id)
        const costoMat = ings.reduce((a, i) => {
          const cu = insumoPorNombre[(i.insumo_nombre || '').trim().toLowerCase()]?.costo_unitario || 0
          return a + (i.cantidad || 0) * cu
        }, 0)
        await supabase.from('sabores').update({ costo_materiales: costoMat, costo_total: costoMat + (s.mano_de_obra || 0) }).eq('id', s.id)
        n++
      }
      for (const b of bases) {
        const ings = baseIngs.filter(bi => bi.base_id === b.id)
        const costoMat = ings.reduce((a, i) => {
          const cu = insumoPorNombre[(i.insumo_nombre || '').trim().toLowerCase()]?.costo_unitario || 0
          return a + (i.cantidad || 0) * cu
        }, 0)
        await supabase.from('bases').update({ costo_materiales: costoMat, costo_total: costoMat + (b.mano_de_obra || 0) }).eq('id', b.id)
        n++
      }
      for (const i of impulsivos) {
        const ings = impIngs.filter(ii => ii.impulsivo_id === i.id)
        const costoMat = ings.reduce((a, ing) => {
          const cu = insumoPorNombre[(ing.insumo_nombre || '').trim().toLowerCase()]?.costo_unitario || 0
          return a + (ing.cantidad || 0) * cu
        }, 0)
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

  function abrirEditor(receta) {
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
    const tablaP = tipo === 'Bases' ? 'bases' : tipo === 'Sabores' ? 'sabores' : 'impulsivos'
    const nombreAntiguo = receta.nombre
    setSavingRename(true)
    const { error } = await supabase.from(tablaP).update({ nombre: nuevoNombre }).eq('id', receta.id)
    if (error) { setSavingRename(false); showToast(error.message, 'error'); return }
    await supabase.from('stock_camaras').update({ nombre: nuevoNombre.toUpperCase() }).ilike('nombre', nombreAntiguo)
    await supabase.from('producciones').update({ producto_nombre: nuevoNombre.toUpperCase() }).ilike('producto_nombre', nombreAntiguo)
    setSavingRename(false)
    setRenombrando(null)
    showToast('Nombre actualizado en recetas y cámaras')
    cargar()
  }

  async function eliminarReceta() {
    if (!eliminando) return
    const { receta, tipo } = eliminando
    const tablaIng = tipo === 'Bases' ? 'base_ingredientes' : tipo === 'Sabores' ? 'sabor_ingredientes' : 'impulsivo_ingredientes'
    const tablaP   = tipo === 'Bases' ? 'bases'             : tipo === 'Sabores' ? 'sabores'             : 'impulsivos'
    const fk       = tipo === 'Bases' ? 'base_id'           : tipo === 'Sabores' ? 'sabor_id'            : 'impulsivo_id'
    setSavingDelete(true)
    await supabase.from(tablaIng).delete().eq(fk, receta.id)
    const { error } = await supabase.from(tablaP).delete().eq('id', receta.id)
    setSavingDelete(false)
    if (error) { showToast(error.message, 'error'); return }
    setEliminando(null)
    showToast(`"${receta.nombre}" eliminada`)
    cargar()
  }

  return (
    <div className="space-y-5">
      <Toast toast={toast} />

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Recetas</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Catálogo de fórmulas Del Parque</p>
        </div>
        <Button variant="secondary" onClick={recalcularCostos} loading={recalculando} disabled={recalculando}>
          <RefreshCw size={14} /> Recalcular costos
        </Button>
      </div>

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
            const costoKg = r.litros_batch > 0 ? r.costoTotal / r.litros_batch : null
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
                      {r.costoTotal > 0 && (
                        <p className="text-xs font-semibold" style={{ color: colors.brand }}>
                          Costo: ${pesos(r.costoTotal)}
                          {costoKg != null && <span style={{ color: colors.textMuted }}> · ${pesos(costoKg)}/L</span>}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {tab !== 'Postres' && (
                      <button
                        onClick={e => { e.stopPropagation(); abrirEditor(r) }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
                        style={{ backgroundColor: '#fff7ed', color: colors.brand, border: `1px solid #fed7aa` }}>
                        <Edit2 size={11} /> Editar
                      </button>
                    )}
                    {tab !== 'Postres' && isAdmin && (
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
                      <div className="flex justify-between text-base font-bold pt-1.5" style={{ borderTop: `1px solid #fed7aa` }}>
                        <span style={{ color: colors.textPrimary }}>COSTO TOTAL</span>
                        <span style={{ color: colors.brand }}>${pesos(r.costoTotal)}</span>
                      </div>
                      {costoKg != null && (
                        <div className="flex justify-between text-xs">
                          <span style={{ color: colors.textMuted }}>Costo por litro</span>
                          <span style={{ color: colors.textSecondary }}>${pesos(costoKg)}/L</span>
                        </div>
                      )}
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
    </div>
  )
}
