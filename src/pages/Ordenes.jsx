import { useState, useEffect, useMemo } from 'react'
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
import { ClipboardList, Plus, Printer, AlertTriangle } from 'lucide-react'
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

export default function Ordenes() {
  const [ordenes, setOrdenes]     = useState([])
  const [sabores, setSabores]     = useState([])
  const [operarios, setOperarios] = useState([])
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)
  const [modal, setModal]         = useState(false)
  const [saving, setSaving]       = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [form, setForm] = useState({
    fecha_produccion: new Date().toISOString().split('T')[0],
    sabor_id: '', sabor_nombre: '', operario_id: '', operario_nombre: '',
    batches: '1', observaciones: '',
  })

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [{ data: ord }, { data: sab }, { data: ops }] = await Promise.all([
      supabase.from('ordenes_produccion').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('stock_camaras').select('id,nombre,tipo').order('nombre'),
      supabase.from('operarios').select('*').order('nombre'),
    ])
    setOrdenes(ord || [])
    setSabores(sab || [])
    setOperarios(ops || [])
    if (sab && sab.length > 0) setForm(f => ({ ...f, sabor_id: String(sab[0].id), sabor_nombre: sab[0].nombre }))
    if (ops && ops.length > 0) setForm(f => ({ ...f, operario_id: String(ops[0].id), operario_nombre: ops[0].nombre }))
    setLoading(false)
  }

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function upd(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const litrosTotal = parseInt(form.batches || '1', 10) * LITROS_BATCH

  const saborSelec  = sabores.find(s => String(s.id) === form.sabor_id)
  const stockActual = saborSelec?.baldes || 0
  const faltaStock  = stockActual < 2

  async function crearOrden() {
    if (!form.sabor_nombre || !form.batches) {
      toast2('Completa los campos obligatorios', 'error'); return
    }
    setSaving(true)
    const numero = `OP-${Date.now().toString().slice(-6)}`
    const { error } = await supabase.from('ordenes_produccion').insert({
      numero,
      sabor_id: form.sabor_id ? parseInt(form.sabor_id, 10) : null,
      sabor_nombre: form.sabor_nombre,
      operario_id: form.operario_id ? parseInt(form.operario_id, 10) : null,
      operario_nombre: form.operario_nombre || null,
      batches: parseInt(form.batches, 10),
      litros_total: litrosTotal,
      estado: 'pendiente',
      fecha_produccion: form.fecha_produccion,
      observaciones: form.observaciones || null,
    })
    setSaving(false)
    if (error) { toast2(error.message, 'error'); return }
    toast2('Orden creada')
    setModal(false)
    setForm(f => ({ ...f, batches: '1', observaciones: '' }))
    cargar()
  }

  async function cambiarEstado(id, estado) {
    const { error } = await supabase.from('ordenes_produccion').update({ estado }).eq('id', id)
    if (error) { toast2(error.message, 'error'); return }
    setOrdenes(prev => prev.map(o => o.id === id ? { ...o, estado } : o))
    toast2('Estado actualizado')
  }

  const ordenesFiltradas = useMemo(() => (
    filtroEstado === 'Todos' ? ordenes : ordenes.filter(o => o.estado === filtroEstado)
  ), [ordenes, filtroEstado])

  const kpiPendientes  = ordenes.filter(o => o.estado === 'pendiente').length
  const kpiEnProceso   = ordenes.filter(o => o.estado === 'en_proceso').length
  const kpiCompletadas = ordenes.filter(o => o.estado === 'completada').length

  function imprimirOrden(orden) {
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Orden ${orden.numero}</title>
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
      .firma-area{display:flex;gap:48px;margin-top:48px}
      .firma{flex:1;border-top:1px solid #374151;padding-top:8px;font-size:9px;color:#6b7280}
      @media print{body{padding:0}}
    </style></head><body>
    <div class="header">
      <img src="${logoUrl}" class="logo-img" alt="Del Parque" />
      <div class="sub">Orden de Producción ${orden.numero} · Emitida: ${new Date().toLocaleDateString('es-AR')}</div>
    </div>
    <div class="grid">
      <div class="campo"><div class="campo-label">Sabor</div><div class="campo-val">${orden.sabor_nombre}</div></div>
      <div class="campo"><div class="campo-label">Fecha programada</div><div class="campo-val">${orden.fecha_produccion || '—'}</div></div>
      <div class="campo"><div class="campo-label">Operario asignado</div><div class="campo-val">${orden.operario_nombre || '—'}</div></div>
      <div class="campo"><div class="campo-label">Estado</div><div class="campo-val">${orden.estado}</div></div>
      <div class="campo"><div class="campo-label">Batches</div><div class="campo-val">${orden.batches}</div></div>
      <div class="campo"><div class="campo-label">Litros totales</div><div class="campo-val" style="color:${colors.brand}">${orden.litros_total} L</div></div>
    </div>
    ${orden.observaciones ? `<div class="campo" style="margin-bottom:20px"><div class="campo-label">Observaciones</div><div style="font-size:11px">${orden.observaciones}</div></div>` : ''}
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
      ) : ordenesFiltradas.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Sin órdenes" subtitle="Creá una orden de producción para comenzar" />
      ) : (
        <div className="space-y-3">
          {ordenesFiltradas.map(orden => {
            const e = estadoInfo(orden.estado)
            return (
              <div key={orden.id} className="p-4 space-y-3"
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radius.lg,
                  border: `1px solid ${colors.border}`,
                  borderLeft: `4px solid ${e.color}`,
                  boxShadow: shadow.sm,
                }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold" style={{ color: colors.textPrimary }}>{orden.sabor_nombre}</p>
                      <Badge variant={e.variant}>{e.label}</Badge>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                      {orden.numero} · {orden.fecha_produccion} · {orden.operario_nombre || 'Sin asignar'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xl font-extrabold" style={{ color: colors.brand }}>{orden.litros_total} L</p>
                    <p className="text-xs" style={{ color: colors.textMuted }}>{orden.batches} batch{orden.batches !== 1 ? 'es' : ''}</p>
                  </div>
                </div>

                {orden.observaciones && (
                  <p className="text-xs px-3 py-2" style={{ color: colors.textSecondary, backgroundColor: colors.bg, borderRadius: radius.md }}>{orden.observaciones}</p>
                )}

                <div className="flex gap-2 flex-wrap items-center">
                  {ESTADOS.filter(es => es.key !== orden.estado && es.key !== 'cancelada').map(es => (
                    <Button key={es.key} variant="ghost" size="sm" onClick={() => cambiarEstado(orden.id, es.key)}
                      className="!border" style={{ borderColor: es.color, color: es.color }}>
                      → {es.label}
                    </Button>
                  ))}
                  {orden.estado !== 'cancelada' && (
                    <Button variant="ghost" size="sm" onClick={() => cambiarEstado(orden.id, 'cancelada')}
                      className="!border" style={{ borderColor: colors.border, color: colors.textMuted }}>
                      Cancelar
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => imprimirOrden(orden)} className="ml-auto">
                    <Printer size={12} /> Imprimir
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Nueva Orden de Producción"
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)} disabled={saving} className="flex-1">
              Cancelar
            </Button>
            <Button variant="primary" onClick={crearOrden} loading={saving} className="flex-1">
              {saving ? 'Creando…' : 'Crear orden'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Fecha de producción *" type="date" value={form.fecha_produccion} onChange={e => upd('fecha_produccion', e.target.value)} />
          <Select label="Sabor *" value={form.sabor_id} onChange={e => {
            const s = sabores.find(s => String(s.id) === e.target.value)
            upd('sabor_id', e.target.value)
            upd('sabor_nombre', s?.nombre || '')
          }}>
            {sabores.map(s => <option key={s.id} value={String(s.id)}>{s.nombre} ({s.tipo})</option>)}
          </Select>

          {faltaStock && (
            <div className="flex items-start gap-2 px-3 py-2.5 text-xs" style={{ backgroundColor: colors.warningBg, border: `1px solid ${colors.warning}40`, borderRadius: radius.md, color: colors.warning }}>
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>Stock bajo para este sabor ({stockActual} baldes). La orden se creará igualmente — verificá disponibilidad.</span>
            </div>
          )}

          <Select label="Operario asignado" value={form.operario_id} onChange={e => {
            const o = operarios.find(o => String(o.id) === e.target.value)
            upd('operario_id', e.target.value)
            upd('operario_nombre', o?.nombre || '')
          }}>
            <option value="">— Sin asignar —</option>
            {operarios.map(o => <option key={o.id} value={String(o.id)}>{o.nombre}</option>)}
          </Select>
          <Input label="Batches *" type="number" min="1" max="20" value={form.batches}
            onChange={e => upd('batches', e.target.value)} />
          <div className="px-4 py-3 text-center" style={{ backgroundColor: `${colors.brand}0d`, border: `1px solid ${colors.brand}30`, borderRadius: radius.lg }}>
            <p className="text-xs" style={{ color: colors.textMuted }}>Total a producir</p>
            <p className="text-2xl font-extrabold" style={{ color: colors.brand }}>
              {litrosTotal} litros
            </p>
            <p className="text-xs" style={{ color: colors.textMuted }}>{form.batches} batch{parseInt(form.batches) !== 1 ? 'es' : ''} × {LITROS_BATCH} L</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#374151] mb-1.5">Observaciones</label>
            <textarea value={form.observaciones} onChange={e => upd('observaciones', e.target.value)}
              rows={2} className={textareaClass} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
