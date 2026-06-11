import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Badge from '../components/ui/Badge'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import { Warehouse, ArrowUp, ArrowDown, Search, Printer } from 'lucide-react'
import logoUrl from '../assets/logo.png'

const TABS         = ['Movimientos', 'Stock', 'Trazabilidad']
const DESTINOS     = ['Bases', 'Sabores', 'Postres', 'Impulsivos', 'Escocés', 'Bombones']
const PRESENTACIONES = ['Balde', 'Bolsa', 'Lata', 'Caja', 'Frasco', 'Bidón']
const UNIDADES     = ['kg', 'litros', 'unidades', 'g']
const PERIODOS_TRZ = ['semana', 'mes', 'todo']
const SEM = { verde: colors.success, amarillo: colors.warning, rojo: colors.danger, gris: colors.textMuted }

const textareaClass = 'w-full rounded-lg border border-[#d1d5db] text-sm text-[#111827] placeholder:text-[#9ca3af] bg-white outline-none transition-colors duration-150 px-3 py-2 resize-none focus:ring-2 focus:ring-[#D4521A]/30 focus:border-[#D4521A]'

function semaforo(actual, minimo) {
  if (!minimo || minimo <= 0) return 'gris'
  const r = actual / minimo
  if (r >= 1.5) return 'verde'
  if (r >= 0.75) return 'amarillo'
  return 'rojo'
}

function ModalMovimiento({ tipo, onClose, onSubmit, saving, insumos, operarios }) {
  const esIngreso = tipo === 'ingreso'
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    producto_nombre: '', marca: '', presentacion: 'Balde',
    cantidad: '', unidad: 'kg', lote: '', fecha_vencimiento: '',
    proveedor: '', controlo: '', destino: 'Bases', operario_recibe: '',
    observaciones: '',
  })
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal
      open
      onClose={onClose}
      title={esIngreso ? '↑ Registrar Ingreso' : '↓ Registrar Egreso'}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1">
            Cancelar
          </Button>
          <Button variant={esIngreso ? 'success' : 'danger'} onClick={() => onSubmit(form)} loading={saving} className="flex-1">
            {saving ? 'Guardando…' : 'Registrar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Fecha *" type="date" value={form.fecha} onChange={e => upd('fecha', e.target.value)} />
        <div>
          <Input label="Producto *" type="text" value={form.producto_nombre} onChange={e => upd('producto_nombre', e.target.value)}
            list="insumos-dl" placeholder="Nombre del insumo" />
          <datalist id="insumos-dl">{insumos.map(i => <option key={i.id} value={i.nombre} />)}</datalist>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Marca" type="text" value={form.marca} onChange={e => upd('marca', e.target.value)} />
          <Select label="Presentación" value={form.presentacion} onChange={e => upd('presentacion', e.target.value)}>
            {PRESENTACIONES.map(p => <option key={p}>{p}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Cantidad *" type="number" step="0.01" value={form.cantidad} onChange={e => upd('cantidad', e.target.value)} />
          {esIngreso
            ? <Select label="Unidad" value={form.unidad} onChange={e => upd('unidad', e.target.value)}>
                {UNIDADES.map(u => <option key={u}>{u}</option>)}
              </Select>
            : <Select label="Destino" value={form.destino} onChange={e => upd('destino', e.target.value)}>
                {DESTINOS.map(d => <option key={d}>{d}</option>)}
              </Select>
          }
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Lote" type="text" value={form.lote} onChange={e => upd('lote', e.target.value)} />
          <Input label="Vencimiento" type="date" value={form.fecha_vencimiento} onChange={e => upd('fecha_vencimiento', e.target.value)} />
        </div>
        {esIngreso ? (
          <Input label="Proveedor" type="text" value={form.proveedor} onChange={e => upd('proveedor', e.target.value)} />
        ) : (
          <Select label="Operario que recibe" value={form.operario_recibe} onChange={e => upd('operario_recibe', e.target.value)}>
            <option value="">— Seleccionar —</option>
            {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
          </Select>
        )}
        <Input label="Controló" type="text" value={form.controlo} onChange={e => upd('controlo', e.target.value)}
          placeholder={esIngreso ? '' : 'Valle'} />
        <div>
          <label className="block text-sm font-medium text-[#374151] mb-1.5">Observaciones</label>
          <textarea value={form.observaciones} onChange={e => upd('observaciones', e.target.value)}
            rows={2} className={textareaClass} />
        </div>
      </div>
    </Modal>
  )
}

export default function Deposito() {
  const [tab, setTab]             = useState('Movimientos')
  const [movimientos, setMovimientos] = useState([])
  const [insumos, setInsumos]     = useState([])
  const [operarios, setOperarios] = useState([])
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)
  const [modal, setModal]         = useState(null)
  const [saving, setSaving]       = useState(false)
  const [filtroTipo, setFiltroTipo]     = useState('Todos')
  const [busqueda, setBusqueda]         = useState('')
  const [filtroPeriodo, setFiltroPeriodo] = useState('mes')
  const [filtroDestino, setFiltroDestino] = useState('Todos')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [{ data: m }, { data: i }, { data: o }] = await Promise.all([
      supabase.from('movimientos_deposito').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('insumos').select('*').order('nombre'),
      supabase.from('operarios').select('*').order('nombre'),
    ])
    setMovimientos(m || [])
    setInsumos(i || [])
    setOperarios(o || [])
    setLoading(false)
  }

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleSubmit(form) {
    if (!form.producto_nombre || !form.cantidad) {
      toast2('Completa producto y cantidad', 'error'); return
    }
    setSaving(true)
    const payload = {
      tipo: modal,
      fecha: form.fecha,
      producto_nombre: form.producto_nombre,
      marca: form.marca || null,
      presentacion: form.presentacion,
      cantidad: parseFloat(form.cantidad),
      unidad: form.unidad || 'kg',
      lote: form.lote || null,
      fecha_vencimiento: form.fecha_vencimiento || null,
      proveedor: modal === 'ingreso' ? (form.proveedor || null) : null,
      controlo: form.controlo || null,
      destino: modal === 'egreso' ? form.destino : null,
      operario_recibe: modal === 'egreso' ? (form.operario_recibe || null) : null,
      observaciones: form.observaciones || null,
    }
    const { error } = await supabase.from('movimientos_deposito').insert(payload)
    setSaving(false)
    if (error) { toast2(error.message, 'error'); return }
    toast2(modal === 'ingreso' ? 'Ingreso registrado' : 'Egreso registrado')
    setModal(null)
    cargar()
  }

  const movsFiltrados = useMemo(() => (
    filtroTipo === 'Todos' ? movimientos : movimientos.filter(m => m.tipo === filtroTipo)
  ), [movimientos, filtroTipo])

  const insumosFiltrados = useMemo(() => (
    busqueda ? insumos.filter(i => i.nombre?.toLowerCase().includes(busqueda.toLowerCase())) : insumos
  ), [insumos, busqueda])

  const porCategoria = useMemo(() => {
    const m = {}
    insumosFiltrados.forEach(i => {
      const c = i.categoria || 'General'
      if (!m[c]) m[c] = []
      m[c].push(i)
    })
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]))
  }, [insumosFiltrados])

  const egresos = useMemo(() => {
    return movimientos.filter(m => {
      if (m.tipo !== 'egreso') return false
      if (filtroDestino !== 'Todos' && m.destino !== filtroDestino) return false
      if (filtroPeriodo !== 'todo') {
        const dias = filtroPeriodo === 'semana' ? 7 : 30
        const limite = new Date(); limite.setDate(limite.getDate() - dias)
        const fecha = new Date(m.fecha || m.created_at)
        if (fecha < limite) return false
      }
      return true
    })
  }, [movimientos, filtroDestino, filtroPeriodo])

  function imprimirTrazabilidad() {
    const w = window.open('', '_blank')
    const filas = egresos.map(e => `
      <tr>
        <td>${e.fecha || ''}</td><td>${e.producto_nombre || ''}</td><td>${e.marca || ''}</td>
        <td>${e.presentacion || ''}</td><td style="text-align:right">${e.cantidad || ''}</td>
        <td>${e.lote || ''}</td><td>${e.fecha_vencimiento || ''}</td>
        <td>${e.controlo || ''}</td><td>${e.observaciones || ''}</td>
        <td>${e.destino || ''}</td>
      </tr>`).join('')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Trazabilidad — Del Parque</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:10px;padding:20px}
      .header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:16px}
      .logo-img{height:32px;display:block}
      .sub{font-size:10px;color:#666}
      table{width:100%;border-collapse:collapse}
      th{background:#f3f4f6;font-size:8px;font-weight:700;text-transform:uppercase;padding:5px 6px;text-align:left;border-bottom:2px solid ${colors.brand}}
      td{padding:4px 6px;border-bottom:1px solid #f3f4f6;font-size:9px}
      .firmas{display:flex;gap:48px;margin-top:48px}
      .firma{flex:1;border-top:1px solid #374151;padding-top:6px;font-size:9px;color:#6b7280}
      @media print{body{padding:0}}
    </style></head><body>
    <div class="header">
      <img src="${logoUrl}" class="logo-img" alt="Del Parque" />
      <div class="sub">Planilla de Trazabilidad — Egreso de Materiales · ${new Date().toLocaleDateString('es-AR')}</div>
    </div>
    <table>
      <thead><tr>
        <th>Fecha</th><th>Producto</th><th>Marca</th><th>Presentación</th><th>Cant.</th>
        <th>Lote</th><th>Venc.</th><th>Controló</th><th>Observ.</th><th>Destino</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="firmas">
      <div class="firma">Responsable de Depósito</div>
      <div class="firma">Jefe de Producción</div>
      <div class="firma">Gerencia / Calidad</div>
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
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Depósito</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Control de materia prima</p>
        </div>
        <div className="flex gap-2">
          {tab === 'Movimientos' && (
            <>
              <Button variant="success" onClick={() => setModal('ingreso')}>
                <ArrowUp size={14} /> Ingreso
              </Button>
              <Button variant="danger" onClick={() => setModal('egreso')}>
                <ArrowDown size={14} /> Egreso
              </Button>
            </>
          )}
          {tab === 'Trazabilidad' && (
            <Button variant="secondary" onClick={imprimirTrazabilidad}>
              <Printer size={15} /> Imprimir A4
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
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

      {loading ? (
        <div className="flex justify-center py-14"><Spinner size={28} /></div>
      ) : (
        <>
          {tab === 'Movimientos' && (
            <div className="space-y-3">
              <div className="flex gap-1.5 flex-wrap">
                {['Todos', 'ingreso', 'egreso'].map(t => (
                  <button key={t} onClick={() => setFiltroTipo(t)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all duration-150 border"
                    style={{
                      backgroundColor: filtroTipo === t ? colors.brand : 'transparent',
                      borderColor: filtroTipo === t ? colors.brand : colors.border,
                      color: filtroTipo === t ? 'white' : colors.textSecondary,
                    }}>
                    {t === 'Todos' ? 'Todos' : t === 'ingreso' ? '↑ Ingresos' : '↓ Egresos'}
                  </button>
                ))}
              </div>
              {movsFiltrados.length === 0 ? (
                <EmptyState icon={Warehouse} title="Sin movimientos" subtitle="Registrá ingresos o egresos para comenzar" />
              ) : (
                <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <Table className="min-w-[560px]">
                    <Thead>
                      <Tr>
                        <Th>Tipo / Fecha</Th>
                        <Th>Producto</Th>
                        <Th>Marca · Lote</Th>
                        <Th>Cantidad</Th>
                        <Th>Destino / Proveedor</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {movsFiltrados.map(m => (
                        <Tr key={m.id}>
                          <Td>
                            <Badge variant={m.tipo === 'ingreso' ? 'success' : 'danger'}>
                              {m.tipo === 'ingreso' ? '↑' : '↓'} {m.fecha}
                            </Badge>
                          </Td>
                          <Td className="font-medium">{m.producto_nombre}</Td>
                          <Td className="text-xs" style={{ color: colors.textMuted }}>{[m.marca, m.lote].filter(Boolean).join(' · ') || '—'}</Td>
                          <Td className="font-bold whitespace-nowrap">{m.cantidad} {m.unidad}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{m.destino || m.proveedor || '—'}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {tab === 'Stock' && (
            <div className="space-y-4">
              <Input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar insumo…" icon={Search} />
              {insumos.length === 0 ? (
                <EmptyState icon={Warehouse} title="Sin insumos cargados" subtitle="Agrega insumos en la tabla 'insumos' de Supabase" />
              ) : porCategoria.map(([cat, items]) => (
                <div key={cat} className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <div className="px-4 py-2.5" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>{cat}</span>
                  </div>
                  <div>
                    {items.map((ins, idx) => {
                      const niv = semaforo(ins.stock_actual || 0, ins.stock_minimo || 0)
                      const pct = ins.stock_minimo ? Math.min(100, ((ins.stock_actual || 0) / (ins.stock_minimo * 1.5)) * 100) : 50
                      return (
                        <div key={ins.id} className="px-4 py-3 flex items-center gap-3"
                          style={{ borderBottom: idx === items.length - 1 ? 'none' : `1px solid ${colors.border}` }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: colors.textPrimary }}>{ins.nombre}</p>
                            <p className="text-xs" style={{ color: colors.textMuted }}>{ins.stock_actual ?? '—'} {ins.unidad}</p>
                          </div>
                          <div className="w-20 flex flex-col gap-1">
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.bg }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: SEM[niv] }} />
                            </div>
                            <p className="text-[10px] text-right" style={{ color: colors.textMuted }}>mín {ins.stock_minimo ?? '—'}</p>
                          </div>
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SEM[niv] }} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'Trazabilidad' && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap items-center">
                <div className="flex gap-1.5">
                  {PERIODOS_TRZ.map(p => (
                    <button key={p} onClick={() => setFiltroPeriodo(p)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all duration-150 border"
                      style={{
                        backgroundColor: filtroPeriodo === p ? colors.brand : 'transparent',
                        borderColor: filtroPeriodo === p ? colors.brand : colors.border,
                        color: filtroPeriodo === p ? 'white' : colors.textSecondary,
                      }}>
                      {p === 'semana' ? 'Semana' : p === 'mes' ? 'Mes' : 'Todo'}
                    </button>
                  ))}
                </div>
                <div className="ml-auto w-44">
                  <Select value={filtroDestino} onChange={e => setFiltroDestino(e.target.value)}>
                    <option value="Todos">Todos los destinos</option>
                    {DESTINOS.map(d => <option key={d}>{d}</option>)}
                  </Select>
                </div>
              </div>
              {egresos.length === 0 ? (
                <EmptyState icon={Warehouse} title="Sin egresos en este período" />
              ) : (
                <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                  <Table className="min-w-[820px]">
                    <Thead>
                      <Tr>
                        <Th>Fecha</Th>
                        <Th>Producto</Th>
                        <Th>Marca</Th>
                        <Th>Present.</Th>
                        <Th>Cant.</Th>
                        <Th>Lote</Th>
                        <Th>Venc.</Th>
                        <Th>Controló</Th>
                        <Th>Observ.</Th>
                        <Th>Destino</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {egresos.map(e => (
                        <Tr key={e.id}>
                          <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{e.fecha}</Td>
                          <Td className="text-xs font-medium">{e.producto_nombre}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{e.marca || '—'}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{e.presentacion || '—'}</Td>
                          <Td className="text-xs font-bold text-right">{e.cantidad}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{e.lote || '—'}</Td>
                          <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{e.fecha_vencimiento || '—'}</Td>
                          <Td className="text-xs" style={{ color: colors.textSecondary }}>{e.controlo || '—'}</Td>
                          <Td className="text-xs max-w-[100px] truncate" style={{ color: colors.textMuted }}>{e.observaciones || '—'}</Td>
                          <Td><Badge variant="info">{e.destino}</Badge></Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {modal && (
        <ModalMovimiento
          tipo={modal}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
          saving={saving}
          insumos={insumos}
          operarios={operarios}
        />
      )}
    </div>
  )
}
