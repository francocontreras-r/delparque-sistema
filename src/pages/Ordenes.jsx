import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Badge from '../components/ui/Badge'
import { colors, radius, shadow } from '../styles/design-system'
import { ClipboardList, Plus, Printer, AlertTriangle, CheckCircle2, Warehouse, X } from 'lucide-react'
import logoUrl from '../assets/logo.png'

const LITROS_BATCH = 120

const ESTADOS = [
  { key: 'pendiente',  label: 'Pendiente',  color: colors.warning,   variant: 'warning' },
  { key: 'en_proceso', label: 'En proceso', color: colors.info,      variant: 'info'    },
  { key: 'completada', label: 'Completada', color: colors.success,   variant: 'success' },
  { key: 'cancelada',  label: 'Cancelada',  color: colors.textMuted, variant: 'neutral' },
]

const textareaClass = 'w-full rounded-lg border border-[#d1d5db] text-sm text-[#111827] placeholder:text-[#9ca3af] bg-white outline-none transition-colors duration-150 px-3 py-2 resize-none focus:ring-2 focus:ring-[#D4521A]/30 focus:border-[#D4521A]'

function estadoInfo(estado) {
  return ESTADOS.find(e => e.key === estado) || ESTADOS[0]
}

function fmtNum(n) {
  return Number((n || 0).toFixed(2)).toString()
}

function pad3(n) {
  return String(n).padStart(3, '0')
}

export default function Ordenes() {
  const navigate = useNavigate()
  const [ordenes, setOrdenes]         = useState([])
  const [saboresCamara, setSaboresCamara] = useState([])
  const [impulsivos, setImpulsivos]   = useState([])
  const [operarios, setOperarios]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState(null)
  const [modal, setModal]             = useState(false)
  const [saving, setSaving]           = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [stockAlert, setStockAlert]   = useState(null)
  const [checkingId, setCheckingId]   = useState(null)

  const [tipoActivo, setTipoActivo]   = useState('helado')
  const [lineaSel, setLineaSel]       = useState('')
  const [lineaCantidad, setLineaCantidad] = useState('1')
  const [lineas, setLineas]           = useState([])
  const [form, setForm] = useState({
    fecha_produccion: new Date().toISOString().split('T')[0],
    operario_id: '', operario_nombre: '', observaciones: '',
  })

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [{ data: ord }, { data: sab }, { data: imp }, { data: ops }] = await Promise.all([
      supabase.from('ordenes_produccion').select('*').order('id', { ascending: false }).limit(300),
      supabase.from('stock_camaras').select('id,nombre,tipo,baldes').order('nombre'),
      supabase.from('impulsivos').select('id,nombre').order('nombre'),
      supabase.from('operarios').select('*').order('nombre'),
    ])
    setOrdenes(ord || [])
    setSaboresCamara(sab || [])
    setImpulsivos(imp || [])
    setOperarios(ops || [])
    if (sab && sab.length > 0) setLineaSel(String(sab[0].id))
    if (ops && ops.length > 0) setForm(f => ({ ...f, operario_id: String(ops[0].id), operario_nombre: ops[0].nombre }))
    setLoading(false)
  }

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function upd(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function cambiarTipoActivo(tipo) {
    setTipoActivo(tipo)
    setLineaCantidad('1')
    if (tipo === 'helado') {
      setLineaSel(saboresCamara[0] ? String(saboresCamara[0].id) : '')
    } else {
      setLineaSel(impulsivos[0] ? String(impulsivos[0].id) : '')
    }
  }

  const opcionesActivas = tipoActivo === 'helado' ? saboresCamara : impulsivos
  const productoSel = opcionesActivas.find(p => String(p.id) === lineaSel)
  const stockActualSel = tipoActivo === 'helado' ? (productoSel?.baldes || 0) : null
  const faltaStockSel  = tipoActivo === 'helado' && stockActualSel < 2

  function agregarLinea() {
    if (!productoSel) { toast2('Seleccioná un producto', 'error'); return }
    const cantidad = parseInt(lineaCantidad || '1', 10)
    if (!(cantidad > 0)) { toast2('La cantidad debe ser mayor a 0', 'error'); return }
    if (tipoActivo === 'helado') {
      setLineas(ls => [...ls, {
        tipo: 'helado', producto_id: productoSel.id, producto_nombre: productoSel.nombre,
        cantidad, litros: cantidad * LITROS_BATCH,
      }])
    } else {
      setLineas(ls => [...ls, {
        tipo: 'impulsivo', producto_id: productoSel.id, producto_nombre: productoSel.nombre,
        cantidad,
      }])
    }
    setLineaCantidad('1')
  }

  function quitarLinea(idx) {
    setLineas(ls => ls.filter((_, i) => i !== idx))
  }

  async function crearOrden() {
    if (lineas.length === 0) { toast2('Agregá al menos un producto', 'error'); return }
    if (!form.fecha_produccion) { toast2('Completá la fecha de producción', 'error'); return }
    setSaving(true)

    const ymd = form.fecha_produccion.replaceAll('-', '')
    const { data: existentes } = await supabase.from('ordenes_produccion')
      .select('numero').like('numero', `OP-${ymd}-%`)
    const numerosUnicos = new Set((existentes || []).map(o => o.numero).filter(Boolean))
    const numero = `OP-${ymd}-${pad3(numerosUnicos.size + 1)}`

    const filas = lineas.map(l => ({
      numero,
      tipo_producto: l.tipo,
      sabor_id: l.producto_id,
      sabor_nombre: l.producto_nombre,
      batches: l.tipo === 'helado' ? l.cantidad : null,
      litros_total: l.tipo === 'helado' ? l.litros : null,
      cantidad_unidades: l.tipo === 'impulsivo' ? l.cantidad : null,
      operario_id: form.operario_id ? parseInt(form.operario_id, 10) : null,
      operario_nombre: form.operario_nombre || null,
      estado: 'pendiente',
      fecha_produccion: form.fecha_produccion,
      observaciones: form.observaciones || null,
    }))

    const { error } = await supabase.from('ordenes_produccion').insert(filas)
    setSaving(false)
    if (error) { toast2(error.message, 'error'); return }
    toast2(`Orden ${numero} creada con ${filas.length} producto${filas.length !== 1 ? 's' : ''}`)
    setModal(false)
    setLineas([])
    setForm(f => ({ ...f, observaciones: '' }))
    cargar()
  }

  async function cambiarEstado(id, estado) {
    const { error } = await supabase.from('ordenes_produccion').update({ estado }).eq('id', id)
    if (error) { toast2(error.message, 'error'); return }
    setOrdenes(prev => prev.map(o => o.id === id ? { ...o, estado } : o))
    toast2('Estado actualizado')
  }

  async function intentarCambiarEstado(item, estado) {
    if (estado !== 'en_proceso') {
      cambiarEstado(item.id, estado)
      return
    }
    setCheckingId(item.id)

    let ings = []
    if (item.tipo_producto === 'impulsivo') {
      const { data } = await supabase.from('impulsivo_ingredientes').select('*').eq('impulsivo_id', item.sabor_id)
      ings = (data || []).map(i => ({ ...i, factor: item.cantidad_unidades || 1 }))
    } else {
      const { data: recetas } = await supabase.from('sabores').select('id,nombre')
      const receta = (recetas || []).find(r => r.nombre.trim().toLowerCase() === (item.sabor_nombre || '').trim().toLowerCase())
      if (receta) {
        const { data } = await supabase.from('sabor_ingredientes').select('*').eq('sabor_id', receta.id)
        ings = (data || []).map(i => ({ ...i, factor: item.batches || 1 }))
      }
    }

    if (ings.length === 0) {
      setCheckingId(null)
      setStockAlert({ orden: item, items: [], ok: true })
      return
    }

    const { data: insumos } = await supabase.from('insumos').select('nombre,stock_actual,unidad')
    const insumoPorNombre = {}
    ;(insumos || []).forEach(i => { insumoPorNombre[i.nombre.trim().toLowerCase()] = i })

    const faltantes = []
    for (const ing of ings) {
      const requerido = (ing.cantidad || 0) * ing.factor
      const insumo = insumoPorNombre[(ing.insumo_nombre || '').trim().toLowerCase()]
      const disponible = insumo?.stock_actual ?? 0
      if (disponible < requerido) {
        const faltan = requerido - disponible
        faltantes.push({
          nombre: ing.insumo_nombre,
          requerido, disponible, faltan,
          unidad: ing.unidad,
          severo: requerido > 0 && (faltan / requerido) >= 0.5,
        })
      }
    }
    setCheckingId(null)
    setStockAlert({ orden: item, items: faltantes, ok: faltantes.length === 0 })
  }

  function confirmarInicio() {
    if (!stockAlert) return
    cambiarEstado(stockAlert.orden.id, 'en_proceso')
    setStockAlert(null)
  }

  const grupos = useMemo(() => {
    const m = {}
    ordenes.forEach(o => {
      const key = o.numero || `#${o.id}`
      if (!m[key]) m[key] = { numero: o.numero, fecha: o.fecha_produccion, operario: o.operario_nombre, items: [] }
      m[key].items.push(o)
    })
    return Object.values(m).sort((a, b) => (b.numero || '').localeCompare(a.numero || ''))
  }, [ordenes])

  const gruposFiltrados = useMemo(() => (
    filtroEstado === 'Todos' ? grupos : grupos.filter(g => g.items.some(i => i.estado === filtroEstado))
  ), [grupos, filtroEstado])

  const kpiPendientes  = ordenes.filter(o => o.estado === 'pendiente').length
  const kpiEnProceso   = ordenes.filter(o => o.estado === 'en_proceso').length
  const kpiCompletadas = ordenes.filter(o => o.estado === 'completada').length

  function imprimirOrden(grupo) {
    const w = window.open('', '_blank')
    const obs = grupo.items.find(i => i.observaciones)?.observaciones
    const filas = grupo.items.map(it => `
      <tr>
        <td>${it.sabor_nombre}</td>
        <td>${it.tipo_producto === 'impulsivo' ? 'Impulsivo/Postre' : 'Helado'}</td>
        <td style="text-align:right">${it.tipo_producto === 'impulsivo' ? `${it.cantidad_unidades} u` : `${it.batches} batch${it.batches !== 1 ? 'es' : ''} (${it.litros_total} L)`}</td>
        <td>${estadoInfo(it.estado).label}</td>
      </tr>`).join('')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Orden ${grupo.numero}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11px;padding:24px}
      .header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px}
      .logo-img{height:32px;display:block}
      .sub{font-size:10px;color:#666}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
      .campo{background:#f9fafb;border-radius:8px;padding:10px}
      .campo-label{font-size:8px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:2px}
      .campo-val{font-size:14px;font-weight:700;color:#111827}
      table{width:100%;border-collapse:collapse;margin-bottom:20px}
      th{background:#f3f4f6;font-size:9px;font-weight:700;text-transform:uppercase;padding:6px 8px;text-align:left;border-bottom:2px solid ${colors.brand}}
      td{padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:11px}
      .firma-area{display:flex;gap:48px;margin-top:48px}
      .firma{flex:1;border-top:1px solid #374151;padding-top:8px;font-size:9px;color:#6b7280}
      @media print{body{padding:0}}
    </style></head><body>
    <div class="header">
      <img src="${logoUrl}" class="logo-img" alt="Del Parque" />
      <div class="sub">Orden de Producción ${grupo.numero} · Emitida: ${new Date().toLocaleDateString('es-AR')}</div>
    </div>
    <div class="grid">
      <div class="campo"><div class="campo-label">Fecha programada</div><div class="campo-val">${grupo.fecha || '—'}</div></div>
      <div class="campo"><div class="campo-label">Operario asignado</div><div class="campo-val">${grupo.operario || '—'}</div></div>
    </div>
    <table>
      <thead><tr><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Estado</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    ${obs ? `<div class="campo" style="margin-bottom:20px"><div class="campo-label">Observaciones</div><div style="font-size:11px">${obs}</div></div>` : ''}
    <div class="firma-area">
      <div class="firma">Supervisor</div>
      <div class="firma">Operario / Fecha</div>
      <div class="firma">Control de Calidad</div>
    </div>
    </body></html>`)
    w.document.close()
    w.onload = () => w.print()
  }

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Órdenes</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Órdenes de producción · {LITROS_BATCH} L/batch</p>
        </div>
        <Button variant="primary" onClick={() => setModal(true)}>
          <Plus size={15} /> Nueva orden
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Pendientes"  value={loading ? '—' : kpiPendientes}  color={colors.warning} />
        <KpiCard label="En proceso"  value={loading ? '—' : kpiEnProceso}   color={colors.info} />
        <KpiCard label="Completadas" value={loading ? '—' : kpiCompletadas} color={colors.success} />
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {['Todos', ...ESTADOS.map(e => e.key)].map(f => (
          <button key={f} onClick={() => setFiltroEstado(f)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all duration-150 border"
            style={{
              backgroundColor: filtroEstado === f ? colors.brand : 'transparent',
              borderColor: filtroEstado === f ? colors.brand : colors.border,
              color: filtroEstado === f ? 'white' : colors.textSecondary,
            }}>
            {f === 'Todos' ? 'Todas' : ESTADOS.find(e => e.key === f)?.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-14"><Spinner size={28} /></div>
      ) : gruposFiltrados.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Sin órdenes" subtitle="Creá una orden de producción para comenzar" />
      ) : (
        <div className="space-y-3">
          {gruposFiltrados.map(grupo => (
            <div key={grupo.numero} className="p-4 space-y-3"
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.lg,
                border: `1px solid ${colors.border}`,
                boxShadow: shadow.sm,
              }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-bold" style={{ color: colors.textPrimary }}>{grupo.numero}</p>
                  <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                    {grupo.fecha} · {grupo.operario || 'Sin asignar'} · {grupo.items.length} producto{grupo.items.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => imprimirOrden(grupo)}>
                  <Printer size={12} /> Imprimir
                </Button>
              </div>

              <div className="space-y-2">
                {grupo.items.map(item => {
                  const e = estadoInfo(item.estado)
                  return (
                    <div key={item.id} className="p-3"
                      style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderLeft: `4px solid ${e.color}` }}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm" style={{ color: colors.textPrimary }}>{item.sabor_nombre}</p>
                            <Badge variant="neutral">{item.tipo_producto === 'impulsivo' ? 'Impulsivo/Postre' : 'Helado'}</Badge>
                            <Badge variant={e.variant}>{e.label}</Badge>
                          </div>
                          {item.observaciones && (
                            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>{item.observaciones}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          {item.tipo_producto === 'impulsivo' ? (
                            <p className="text-lg font-extrabold" style={{ color: colors.brand }}>{item.cantidad_unidades} u</p>
                          ) : (
                            <>
                              <p className="text-lg font-extrabold" style={{ color: colors.brand }}>{item.litros_total} L</p>
                              <p className="text-xs" style={{ color: colors.textMuted }}>{item.batches} batch{item.batches !== 1 ? 'es' : ''}</p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap items-center mt-2">
                        {ESTADOS.filter(es => es.key !== item.estado && es.key !== 'cancelada').map(es => (
                          <Button key={es.key} variant="ghost" size="sm" onClick={() => intentarCambiarEstado(item, es.key)}
                            loading={checkingId === item.id} disabled={checkingId !== null && checkingId !== item.id}
                            className="!border" style={{ borderColor: es.color, color: es.color }}>
                            → {es.label}
                          </Button>
                        ))}
                        {item.estado !== 'cancelada' && (
                          <Button variant="ghost" size="sm" onClick={() => cambiarEstado(item.id, 'cancelada')}
                            className="!border" style={{ borderColor: colors.border, color: colors.textMuted }}>
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Nueva Orden de Producción"
        maxWidth="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)} disabled={saving} className="flex-1">
              Cancelar
            </Button>
            <Button variant="primary" onClick={crearOrden} loading={saving} className="flex-1">
              {saving ? 'Creando…' : `Crear orden (${lineas.length})`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha de producción *" type="date" value={form.fecha_produccion} onChange={e => upd('fecha_produccion', e.target.value)} />
            <Select label="Operario" value={form.operario_id} onChange={e => {
              const o = operarios.find(o => String(o.id) === e.target.value)
              upd('operario_id', e.target.value)
              upd('operario_nombre', o?.nombre || '')
            }}>
              <option value="">— Sin asignar —</option>
              {operarios.map(o => <option key={o.id} value={String(o.id)}>{o.nombre}</option>)}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#374151] mb-1.5">Observaciones</label>
            <textarea value={form.observaciones} onChange={e => upd('observaciones', e.target.value)}
              rows={2} className={textareaClass} />
          </div>

          <div className="pt-2" style={{ borderTop: `1px solid ${colors.border}` }}>
            <div className="flex gap-1.5 mb-3 mt-3">
              {[{ key: 'helado', label: 'Helados' }, { key: 'impulsivo', label: 'Impulsivos y Postres' }].map(t => (
                <button key={t.key} onClick={() => cambiarTipoActivo(t.key)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border"
                  style={{
                    backgroundColor: tipoActivo === t.key ? colors.brand : 'transparent',
                    borderColor: tipoActivo === t.key ? colors.brand : colors.border,
                    color: tipoActivo === t.key ? 'white' : colors.textSecondary,
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {opcionesActivas.length === 0 ? (
              <p className="text-sm" style={{ color: colors.textMuted }}>
                {tipoActivo === 'helado' ? 'No hay sabores cargados en cámaras.' : 'No hay impulsivos cargados.'}
              </p>
            ) : (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Select label={tipoActivo === 'helado' ? 'Sabor' : 'Impulsivo / Postre'} value={lineaSel} onChange={e => setLineaSel(e.target.value)}>
                    {opcionesActivas.map(p => <option key={p.id} value={String(p.id)}>{p.nombre}</option>)}
                  </Select>
                </div>
                <div className="w-28">
                  <Input label={tipoActivo === 'helado' ? 'Batches' : 'Unidades'} type="number" min="1" value={lineaCantidad}
                    onChange={e => setLineaCantidad(e.target.value)} />
                </div>
                <Button variant="secondary" onClick={agregarLinea}>
                  <Plus size={14} /> Agregar
                </Button>
              </div>
            )}

            {faltaStockSel && (
              <div className="flex items-start gap-2 px-3 py-2.5 mt-2 text-xs" style={{ backgroundColor: colors.warningBg, border: `1px solid ${colors.warning}40`, borderRadius: radius.md, color: colors.warning }}>
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>Stock bajo para este sabor ({stockActualSel} baldes). Se puede agregar igual — verificá disponibilidad.</span>
              </div>
            )}
          </div>

          {lineas.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-[#374151]">Productos en esta orden</label>
              {lineas.map((l, idx) => (
                <div key={idx} className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: colors.bg, borderRadius: radius.md }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>{l.producto_nombre}</p>
                    <p className="text-xs" style={{ color: colors.textMuted }}>
                      {l.tipo === 'helado'
                        ? `${l.cantidad} batch${l.cantidad !== 1 ? 'es' : ''} · ${l.litros} L`
                        : `${l.cantidad} unidad${l.cantidad !== 1 ? 'es' : ''}`}
                    </p>
                  </div>
                  <button onClick={() => quitarLinea(idx)} className="w-7 h-7 flex items-center justify-center rounded-full transition-colors hover:bg-slate-200" style={{ color: colors.textMuted }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!stockAlert}
        onClose={() => setStockAlert(null)}
        title={stockAlert?.ok ? 'Confirmar inicio de producción' : 'Stock insuficiente en depósito'}
        maxWidth="max-w-md"
        footer={
          stockAlert?.ok ? (
            <>
              <Button variant="secondary" onClick={() => setStockAlert(null)} className="flex-1">Cancelar</Button>
              <Button variant="primary" onClick={confirmarInicio} className="flex-1">Iniciar producción</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => navigate('/deposito')} className="flex-1">
                <Warehouse size={14} /> Ver depósito
              </Button>
              <Button variant="primary" onClick={() => setStockAlert(null)} className="flex-1">Entendido</Button>
            </>
          )
        }
      >
        {stockAlert && (
          stockAlert.ok ? (
            <div className="flex items-start gap-2.5 px-3 py-3" style={{ backgroundColor: colors.successBg, border: `1px solid ${colors.success}40`, borderRadius: radius.md }}>
              <CheckCircle2 size={18} style={{ color: colors.success }} className="flex-shrink-0 mt-0.5" />
              <p className="text-sm" style={{ color: colors.textPrimary }}>
                Hay stock suficiente de todos los ingredientes para <strong>{stockAlert.orden.sabor_nombre}</strong>. ¿Confirmás el inicio de la producción?
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                No se puede iniciar <strong>{stockAlert.orden.sabor_nombre}</strong>: faltan los siguientes insumos en depósito.
              </p>
              <div className="space-y-1.5">
                {stockAlert.items.map((it, i) => (
                  <div key={i} className="text-sm px-3 py-2" style={{ backgroundColor: it.severo ? colors.dangerBg : colors.warningBg, borderRadius: radius.md, color: it.severo ? colors.danger : colors.warning }}>
                    {it.severo ? '❌' : '⚠️'} {it.nombre}: necesitás {fmtNum(it.requerido)} {it.unidad}, tenés {fmtNum(it.disponible)} {it.unidad} (faltan {fmtNum(it.faltan)} {it.unidad})
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </Modal>
    </div>
  )
}
