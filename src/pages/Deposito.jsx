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
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import { Warehouse, ArrowUp, ArrowDown, Search, Printer, DollarSign } from 'lucide-react'
import logoUrl from '../assets/logo.png'

const TABS         = ['Movimientos', 'Stock', 'Trazabilidad', 'Informes']
const DESTINOS     = ['Bases', 'Sabores', 'Postres', 'Impulsivos', 'Escocés', 'Bombones']
const PRESENTACIONES = ['Balde', 'Bolsa', 'Lata', 'Caja', 'Botella', 'Bidón', 'Pomo']
const UNIDADES     = ['u', 'kg', 'L']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const SEM = { verde: colors.success, amarillo: colors.warning, rojo: colors.danger, gris: colors.textMuted }
const ROLES = ['operario', 'admin']

const textareaClass = 'w-full rounded-lg border border-[#d1d5db] text-sm text-[#111827] placeholder:text-[#9ca3af] bg-white outline-none transition-colors duration-150 px-3 py-2 resize-none focus:ring-2 focus:ring-[#D4521A]/30 focus:border-[#D4521A]'

function semaforo(actual, minimo) {
  if (!minimo || minimo <= 0) return 'gris'
  const r = actual / minimo
  if (r >= 1.5) return 'verde'
  if (r >= 0.75) return 'amarillo'
  return 'rojo'
}

function pesos(n) { return Math.round(n || 0).toLocaleString('es-AR') }

function ModalMovimiento({ tipo, onClose, onSubmit, saving, insumos, operarios }) {
  const esIngreso = tipo === 'ingreso'
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    producto_nombre: '', marca: '', presentacion: 'Balde',
    cantidad: '', unidad: 'u', lote: '', fecha_vencimiento: '',
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
        <Select label="Producto *" value={form.producto_nombre} onChange={e => upd('producto_nombre', e.target.value)}>
          <option value="">— Seleccionar insumo —</option>
          {insumos.map(i => <option key={i.id} value={i.nombre}>{i.nombre}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Marca *" type="text" value={form.marca} onChange={e => upd('marca', e.target.value)} />
          <Select label="Presentación *" value={form.presentacion} onChange={e => upd('presentacion', e.target.value)}>
            {PRESENTACIONES.map(p => <option key={p}>{p}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Cantidad *" type="number" min="0.01" step="0.01" value={form.cantidad} onChange={e => upd('cantidad', e.target.value)} />
          <Select label="Unidad *" value={form.unidad} onChange={e => upd('unidad', e.target.value)}>
            {UNIDADES.map(u => <option key={u}>{u}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="N° de Lote *" type="text" value={form.lote} onChange={e => upd('lote', e.target.value)} />
          <Input label="Vencimiento *" type="date" value={form.fecha_vencimiento} onChange={e => upd('fecha_vencimiento', e.target.value)} />
        </div>
        <Select label="Controló *" value={form.controlo} onChange={e => upd('controlo', e.target.value)}>
          <option value="">— Seleccionar —</option>
          {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
        </Select>
        {esIngreso ? (
          <Input label="Proveedor *" type="text" value={form.proveedor} onChange={e => upd('proveedor', e.target.value)} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Select label="Destino *" value={form.destino} onChange={e => upd('destino', e.target.value)}>
              {DESTINOS.map(d => <option key={d}>{d}</option>)}
            </Select>
            <Select label="Retira / Solicita *" value={form.operario_recibe} onChange={e => upd('operario_recibe', e.target.value)}>
              <option value="">— Seleccionar —</option>
              {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
            </Select>
          </div>
        )}
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
  const [filtroMes, setFiltroMes]       = useState(0)
  const [filtroAnio, setFiltroAnio]     = useState(0)
  const [filtroDestino, setFiltroDestino] = useState('Todos')
  const [informeVista, setInformeVista] = useState('proveedores')
  const [informeMes, setInformeMes]     = useState(0)
  const [informeAnio, setInformeAnio]   = useState(0)
  const [userRole, setUserRole]         = useState('operario')

  const showVal = userRole === 'admin'

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const [{ data: m }, { data: i }, { data: o }] = await Promise.all([
      supabase.from('movimientos_deposito').select('*').order('id', { ascending: false }).limit(300),
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

  const operariosUnicos = useMemo(() => {
    const vistos = new Set()
    return operarios.filter(o => {
      if (vistos.has(o.nombre)) return false
      vistos.add(o.nombre)
      return true
    })
  }, [operarios])

  const CAMPOS_COMUNES = [
    ['fecha', 'la fecha'],
    ['producto_nombre', 'el producto'],
    ['marca', 'la marca'],
    ['presentacion', 'la presentación'],
    ['cantidad', 'la cantidad'],
    ['unidad', 'la unidad'],
    ['lote', 'el N° de lote'],
    ['fecha_vencimiento', 'la fecha de vencimiento'],
    ['controlo', 'quién controló'],
  ]
  const CAMPOS_INGRESO = [...CAMPOS_COMUNES, ['proveedor', 'el proveedor']]
  const CAMPOS_EGRESO = [...CAMPOS_COMUNES, ['destino', 'el destino'], ['operario_recibe', 'quién retira/solicita']]

  async function handleSubmit(form) {
    const campos = modal === 'ingreso' ? CAMPOS_INGRESO : CAMPOS_EGRESO
    for (const [campo, etiqueta] of campos) {
      if (!form[campo] || String(form[campo]).trim() === '') {
        toast2(`Falta completar: ${etiqueta}`, 'error'); return
      }
    }
    if (!(parseFloat(form.cantidad) > 0)) {
      toast2('La cantidad debe ser mayor a 0', 'error'); return
    }
    setSaving(true)
    const payload = {
      tipo: modal,
      fecha: form.fecha,
      producto_nombre: form.producto_nombre,
      marca: form.marca,
      presentacion: form.presentacion,
      cantidad: parseFloat(form.cantidad),
      unidad: form.unidad,
      lote: form.lote,
      fecha_vencimiento: form.fecha_vencimiento,
      proveedor: modal === 'ingreso' ? form.proveedor : null,
      controlo: form.controlo,
      destino: modal === 'egreso' ? form.destino : null,
      operario_recibe: modal === 'egreso' ? form.operario_recibe : null,
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

  const valorTotalDeposito = useMemo(() => (
    insumos.reduce((a, i) => a + (i.stock_actual || 0) * (i.costo_unitario || 0), 0)
  ), [insumos])

  const aniosDisponibles = useMemo(() => {
    const set = new Set(movimientos.map(m => m.fecha ? Number(m.fecha.split('-')[0]) : null).filter(Boolean))
    set.add(new Date().getFullYear())
    return Array.from(set).sort((a, b) => b - a)
  }, [movimientos])

  function dentroDePeriodo(fecha, mes, anio) {
    if (!fecha) return mes === 0 && anio === 0
    const [a, m] = fecha.split('-').map(Number)
    if (anio !== 0 && a !== anio) return false
    if (mes !== 0 && m !== mes) return false
    return true
  }

  const egresos = useMemo(() => {
    return movimientos.filter(m => {
      if (m.tipo !== 'egreso') return false
      if (filtroDestino !== 'Todos' && m.destino !== filtroDestino) return false
      if (!dentroDePeriodo(m.fecha, filtroMes, filtroAnio)) return false
      return true
    })
  }, [movimientos, filtroDestino, filtroMes, filtroAnio])

  const movsInforme = useMemo(() => (
    movimientos.filter(m => dentroDePeriodo(m.fecha, informeMes, informeAnio))
  ), [movimientos, informeMes, informeAnio])

  const comprasPorProveedor = useMemo(() => {
    const grupos = {}
    movsInforme.filter(m => m.tipo === 'ingreso').forEach(m => {
      const prov = m.proveedor || 'Sin proveedor'
      if (!grupos[prov]) grupos[prov] = { proveedor: prov, items: [], total: 0 }
      grupos[prov].items.push(m)
      grupos[prov].total += Number(m.cantidad) || 0
    })
    return Object.values(grupos).sort((a, b) => a.proveedor.localeCompare(b.proveedor))
  }, [movsInforme])

  const destinoMercaderia = useMemo(() => {
    const grupos = {}
    movsInforme.filter(m => m.tipo === 'egreso').forEach(m => {
      const dest = m.destino || 'Sin destino'
      if (!grupos[dest]) grupos[dest] = { destino: dest, items: [], total: 0 }
      grupos[dest].items.push(m)
      grupos[dest].total += Number(m.cantidad) || 0
    })
    return Object.values(grupos).sort((a, b) => a.destino.localeCompare(b.destino))
  }, [movsInforme])

  const entregasPorOperario = useMemo(() => {
    const grupos = {}
    movsInforme.filter(m => m.tipo === 'egreso').forEach(m => {
      const op = m.operario_recibe || 'Sin asignar'
      if (!grupos[op]) grupos[op] = { operario: op, items: [], total: 0 }
      grupos[op].items.push(m)
      grupos[op].total += Number(m.cantidad) || 0
    })
    return Object.values(grupos).sort((a, b) => b.total - a.total)
  }, [movsInforme])

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
        <div className="flex items-center gap-2">
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
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px dashed ${colors.border}` }} title="Vista dev">
            {ROLES.map(r => (
              <button key={r} onClick={() => setUserRole(r)}
                className="px-3 py-1.5 text-xs font-medium transition capitalize"
                style={{
                  backgroundColor: userRole === r ? colors.brand : 'transparent',
                  color: userRole === r ? 'white' : colors.textMuted,
                }}>
                {r}
              </button>
            ))}
          </div>
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
              {showVal && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <KpiCard label="Valor total depósito" value={`$${pesos(valorTotalDeposito)}`} icon={DollarSign} color={colors.brand} />
                </div>
              )}
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
                          {showVal && (
                            <div className="text-right flex-shrink-0 w-24">
                              <p className="text-sm font-bold" style={{ color: colors.brand }}>
                                ${pesos((ins.stock_actual || 0) * (ins.costo_unitario || 0))}
                              </p>
                              <p className="text-[10px]" style={{ color: colors.textMuted }}>Valor total</p>
                            </div>
                          )}
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
                <div className="w-40">
                  <Select value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))}>
                    <option value={0}>Todos los meses</option>
                    {MESES.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
                  </Select>
                </div>
                <div className="w-28">
                  <Select value={filtroAnio} onChange={e => setFiltroAnio(Number(e.target.value))}>
                    <option value={0}>Todos</option>
                    {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                  </Select>
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

          {tab === 'Informes' && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap items-center">
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { key: 'proveedores', label: 'Compras por proveedor' },
                    { key: 'destinos', label: 'Destino de mercadería' },
                    { key: 'operarios', label: 'Entregas por operario' },
                  ].map(v => (
                    <button key={v.key} onClick={() => setInformeVista(v.key)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border"
                      style={{
                        backgroundColor: informeVista === v.key ? colors.brand : 'transparent',
                        borderColor: informeVista === v.key ? colors.brand : colors.border,
                        color: informeVista === v.key ? 'white' : colors.textSecondary,
                      }}>
                      {v.label}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex gap-2">
                  <div className="w-40">
                    <Select value={informeMes} onChange={e => setInformeMes(Number(e.target.value))}>
                      <option value={0}>Todos los meses</option>
                      {MESES.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
                    </Select>
                  </div>
                  <div className="w-28">
                    <Select value={informeAnio} onChange={e => setInformeAnio(Number(e.target.value))}>
                      <option value={0}>Todos</option>
                      {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                    </Select>
                  </div>
                </div>
              </div>

              {informeVista === 'proveedores' && (
                comprasPorProveedor.length === 0 ? (
                  <EmptyState icon={Warehouse} title="Sin ingresos en este período" />
                ) : (
                  <div className="space-y-3">
                    {comprasPorProveedor.map(grupo => (
                      <div key={grupo.proveedor} className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                        <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>{grupo.proveedor}</span>
                          <Badge variant="success">{grupo.items.length} ingresos · Total: {grupo.total.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</Badge>
                        </div>
                        <Table>
                          <Thead>
                            <Tr><Th>Producto</Th><Th>Cantidad</Th><Th>Fecha</Th><Th>Lote</Th></Tr>
                          </Thead>
                          <Tbody>
                            {grupo.items.map(m => (
                              <Tr key={m.id}>
                                <Td className="font-medium">{m.producto_nombre}</Td>
                                <Td className="font-bold">{m.cantidad} {m.unidad}</Td>
                                <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{m.fecha}</Td>
                                <Td className="text-xs" style={{ color: colors.textSecondary }}>{m.lote || '—'}</Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </div>
                    ))}
                  </div>
                )
              )}

              {informeVista === 'destinos' && (
                destinoMercaderia.length === 0 ? (
                  <EmptyState icon={Warehouse} title="Sin egresos en este período" />
                ) : (
                  <div className="space-y-3">
                    {destinoMercaderia.map(grupo => (
                      <div key={grupo.destino} className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                        <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>{grupo.destino}</span>
                          <Badge variant="info">{grupo.items.length} egresos · Total: {grupo.total.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</Badge>
                        </div>
                        <Table>
                          <Thead>
                            <Tr><Th>Producto</Th><Th>Cantidad</Th><Th>Fecha</Th><Th>Recibió</Th></Tr>
                          </Thead>
                          <Tbody>
                            {grupo.items.map(m => (
                              <Tr key={m.id}>
                                <Td className="font-medium">{m.producto_nombre}</Td>
                                <Td className="font-bold">{m.cantidad} {m.unidad}</Td>
                                <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{m.fecha}</Td>
                                <Td className="text-xs" style={{ color: colors.textSecondary }}>{m.operario_recibe || '—'}</Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </div>
                    ))}
                  </div>
                )
              )}

              {informeVista === 'operarios' && (
                entregasPorOperario.length === 0 ? (
                  <EmptyState icon={Warehouse} title="Sin egresos en este período" />
                ) : (
                  <div className="space-y-3">
                    {entregasPorOperario.map((grupo, idx) => (
                      <div key={grupo.operario} className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
                        <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
                          <div className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white flex-shrink-0"
                              style={{ backgroundColor: idx === 0 ? colors.brand : colors.textMuted }}>
                              {idx + 1}
                            </span>
                            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>{grupo.operario}</span>
                          </div>
                          <Badge variant="warning">{grupo.items.length} retiros · Total: {grupo.total.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</Badge>
                        </div>
                        <Table>
                          <Thead>
                            <Tr><Th>Producto</Th><Th>Cantidad</Th><Th>Fecha</Th><Th>Destino</Th></Tr>
                          </Thead>
                          <Tbody>
                            {grupo.items.map(m => (
                              <Tr key={m.id}>
                                <Td className="font-medium">{m.producto_nombre}</Td>
                                <Td className="font-bold">{m.cantidad} {m.unidad}</Td>
                                <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{m.fecha}</Td>
                                <Td><Badge variant="info">{m.destino || '—'}</Badge></Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </div>
                    ))}
                  </div>
                )
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
          operarios={operariosUnicos}
        />
      )}
    </div>
  )
}
