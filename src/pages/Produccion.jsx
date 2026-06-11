import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import KpiCard from '../components/ui/KpiCard'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Badge from '../components/ui/Badge'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import { Package, Users, Scale, Hash, ScanLine, PenLine, FileText, Printer } from 'lucide-react'
import logoUrl from '../assets/logo.png'

function decodearEAN(code) {
  if (!code || code.length !== 13 || !code.startsWith('200')) return null
  const prod = parseInt(code.substring(3, 7), 10)
  const peso = prod === 100
    ? parseInt(code.substring(9, 13), 10) / 1000
    : parseInt(code.substring(7, 11), 10) / 1000
  return { prod, peso }
}

const OPERARIOS_SEED = [
  'Silvia Escalona', 'Alejandra Reus', 'Claudia Carrizo', 'Patricia Escudero',
  'Patricia Reus', 'Matias Torres', 'Matias Tapia', 'Nicolas Molina',
  'Nicolas Bunda', 'Gabriela Marinero', 'Natalia Diaz', 'Joan Michetti',
  'Guillermo Valle',
]

const PRODUCTOS_SEED = [
  { codigo: 100, nombre: 'BARRA ALMENDRADO', categoria: 'IMPULSIVO' },
  { codigo: 101, nombre: 'BARRA HELADA',     categoria: 'IMPULSIVO' },
  { codigo: 102, nombre: 'PIONONO',          categoria: 'IMPULSIVO' },
  { codigo: 116, nombre: 'TORTA HELADA KG',  categoria: 'IMPULSIVO' },
]

const textareaClass = 'w-full rounded-lg border border-[#d1d5db] text-sm text-[#111827] placeholder:text-[#9ca3af] bg-white outline-none transition-colors duration-150 px-3 py-2 resize-none focus:ring-2 focus:ring-[#D4521A]/30 focus:border-[#D4521A]'

function fmtNum(n) {
  return Number((n || 0).toFixed(2)).toString()
}

function unidadDe(r) {
  if (r.origen !== 'manual') return 'kg'
  const c = (r.categoria || '').toLowerCase()
  return (c.includes('impulsiv') || c.includes('postre')) ? 'u' : 'kg'
}

export default function Produccion() {
  const [operarios, setOperarios]     = useState([])
  const [productos, setProductos]     = useState([])
  const [registros, setRegistros]     = useState([])
  const [saboresCamara, setSaboresCamara] = useState([])
  const [impulsivosList, setImpulsivosList] = useState([])
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState(null)
  const [codigo, setCodigo]           = useState('')
  const [preview, setPreview]         = useState(null)
  const [operarioSel, setOperarioSel] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando]     = useState(false)
  const inputRef = useRef(null)

  const [modo, setModo] = useState('escaneo')
  const [manualProducto, setManualProducto] = useState('')
  const [manualCantidad, setManualCantidad] = useState('')
  const [manualLote, setManualLote] = useState('')
  const [manualObservaciones, setManualObservaciones] = useState('')
  const [guardandoManual, setGuardandoManual] = useState(false)

  const [modalInforme, setModalInforme] = useState(false)
  const [cargandoInforme, setCargandoInforme] = useState(false)
  const [informeData, setInformeData] = useState([])

  const fechaHoy = new Date().toISOString().split('T')[0]
  const hoyDate  = new Date()
  const lote = `${String(hoyDate.getDate()).padStart(2,'0')}${String(hoyDate.getMonth()+1).padStart(2,'0')}${hoyDate.getFullYear()}`

  useEffect(() => {
    inicializar()
    const ch = supabase.channel('producciones_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'producciones' },
        ({ new: row }) => {
          if (row.fecha === fechaHoy) setRegistros(prev => [row, ...prev].slice(0, 50))
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [fechaHoy])

  async function inicializar() {
    let [{ data: ops }, { data: prods }, { data: regs }, { data: sab }, { data: imp }] = await Promise.all([
      supabase.from('operarios').select('*').order('nombre'),
      supabase.from('productos_produccion').select('*').order('nombre'),
      supabase.from('producciones').select('*').eq('fecha', fechaHoy)
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('stock_camaras').select('id,nombre').order('nombre'),
      supabase.from('impulsivos').select('id,nombre').order('nombre'),
    ])
    if (!ops || ops.length === 0) {
      const { data: s } = await supabase.from('operarios')
        .insert(OPERARIOS_SEED.map(nombre => ({ nombre, activo: true }))).select()
      ops = s || []
    }
    if (!prods || prods.length === 0) {
      const { data: s } = await supabase.from('productos_produccion').insert(PRODUCTOS_SEED).select()
      prods = s || []
    }
    setOperarios(ops || [])
    setProductos(prods || [])
    setRegistros(regs || [])
    setSaboresCamara(sab || [])
    setImpulsivosList(imp || [])
    if (ops && ops.length > 0) setOperarioSel(String(ops[0].id))
    setManualLote(lote)
    setLoading(false)
  }

  function handleKey(e) {
    if (e.key !== 'Enter') return
    const val = e.target.value.trim()
    if (!val) return
    const decoded = decodearEAN(val)
    if (!decoded) {
      toast2('Código inválido — debe ser EAN-13 Del Parque (200…)', 'error')
      setCodigo('')
      return
    }
    const producto = productos.find(p => p.codigo === decoded.prod)
    setPreview({
      prod: decoded.prod,
      peso: decoded.peso,
      nombre: producto?.nombre || `Producto #${decoded.prod}`,
      categoria: producto?.categoria || '—',
    })
  }

  async function registrar() {
    if (!preview || !operarioSel) return
    setGuardando(true)
    const operario = operarios.find(o => String(o.id) === operarioSel)
    const { error } = await supabase.from('producciones').insert({
      fecha: fechaHoy,
      producto_codigo: preview.prod,
      producto_nombre: preview.nombre,
      categoria: preview.categoria !== '—' ? preview.categoria : null,
      origen: 'escaneo',
      peso_kg: preview.peso,
      lote,
      operario_id: operario?.id || null,
      operario_nombre: operario?.nombre || '—',
      observaciones: observaciones.trim() || null,
    })
    setGuardando(false)
    if (error) { toast2('Error: ' + error.message, 'error'); return }
    setPreview(null)
    setCodigo('')
    setObservaciones('')
    toast2('Registrado correctamente')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function registrarManual() {
    if (!operarioSel || !manualProducto || !manualCantidad) {
      toast2('Completá operario, producto y cantidad', 'error'); return
    }
    const cantidad = parseFloat(manualCantidad)
    if (!(cantidad > 0)) { toast2('La cantidad debe ser mayor a 0', 'error'); return }
    const [tipo, id] = manualProducto.split(':')
    let nombre = '', categoria = ''
    if (tipo === 'sabor') {
      nombre = saboresCamara.find(s => String(s.id) === id)?.nombre || ''
      categoria = 'Helado'
    } else {
      nombre = impulsivosList.find(i => String(i.id) === id)?.nombre || ''
      categoria = 'Impulsivo/Postre'
    }
    const operario = operarios.find(o => String(o.id) === operarioSel)
    setGuardandoManual(true)
    const { error } = await supabase.from('producciones').insert({
      fecha: fechaHoy,
      producto_codigo: null,
      producto_nombre: nombre,
      categoria,
      origen: 'manual',
      peso_kg: cantidad,
      lote: manualLote || lote,
      operario_id: operario?.id || null,
      operario_nombre: operario?.nombre || '—',
      observaciones: manualObservaciones.trim() || null,
    })
    setGuardandoManual(false)
    if (error) { toast2('Error: ' + error.message, 'error'); return }
    setManualCantidad('')
    setManualObservaciones('')
    toast2('Registrado correctamente')
  }

  async function abrirInforme() {
    setModalInforme(true)
    setCargandoInforme(true)
    const { data } = await supabase.from('producciones').select('*').eq('fecha', fechaHoy)
      .order('created_at', { ascending: true })
    setInformeData(data || [])
    setCargandoInforme(false)
  }

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const kpiKg  = registros.reduce((a, r) => a + (r.peso_kg || 0), 0)
  const kpiOps = new Set(registros.map(r => r.operario_nombre).filter(Boolean)).size

  const subtotales = useMemo(() => {
    const m = {}
    informeData.forEach(r => {
      const key = r.operario_nombre || '—'
      if (!m[key]) m[key] = { operario: key, registros: 0, cantidad: 0 }
      m[key].registros += 1
      m[key].cantidad += r.peso_kg || 0
    })
    return Object.values(m).sort((a, b) => b.cantidad - a.cantidad)
  }, [informeData])

  const manualTipo = manualProducto.split(':')[0]
  const cantidadLabel = manualTipo === 'impulsivo' ? 'Cantidad (unidades) *' : 'Cantidad (kg) *'

  function imprimirInforme() {
    const w = window.open('', '_blank')
    const filas = informeData.map(r => `
      <tr>
        <td>${new Date(r.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
        <td>${r.producto_nombre}</td>
        <td>${r.categoria || '—'}</td>
        <td>${r.operario_nombre || '—'}</td>
        <td style="text-align:right">${fmtNum(r.peso_kg)} ${unidadDe(r)}</td>
        <td>${r.lote || '—'}</td>
        <td>${r.observaciones || ''}</td>
      </tr>`).join('')
    const subfilas = subtotales.map(s => `
      <tr>
        <td>${s.operario}</td>
        <td style="text-align:right">${s.registros}</td>
        <td style="text-align:right">${fmtNum(s.cantidad)}</td>
      </tr>`).join('')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Informe de producción ${fechaHoy}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11px;padding:24px}
      .header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px}
      .logo-img{height:32px;display:block}
      .sub{font-size:10px;color:#666}
      h2{font-size:13px;margin:18px 0 8px}
      table{width:100%;border-collapse:collapse;margin-bottom:8px}
      th{background:#f3f4f6;font-size:9px;font-weight:700;text-transform:uppercase;padding:6px 8px;text-align:left;border-bottom:2px solid ${colors.brand}}
      td{padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:11px}
      .firma-area{display:flex;gap:48px;margin-top:48px}
      .firma{flex:1;border-top:1px solid #374151;padding-top:8px;font-size:9px;color:#6b7280}
      @media print{body{padding:0}}
    </style></head><body>
    <div class="header">
      <img src="${logoUrl}" class="logo-img" alt="Del Parque" />
      <div class="sub">Informe de producción del día · ${fechaHoy} · Lote ${lote}</div>
    </div>
    <h2>Detalle de registros</h2>
    <table>
      <thead><tr><th>Hora</th><th>Producto</th><th>Categoría</th><th>Operario</th><th>Cantidad</th><th>Lote</th><th>Observaciones</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <h2>Subtotales por operario</h2>
    <table>
      <thead><tr><th>Operario</th><th>Registros</th><th>Cantidad total</th></tr></thead>
      <tbody>${subfilas}</tbody>
    </table>
    <div class="firma-area">
      <div class="firma">Supervisor</div>
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
          <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Producción</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Escaneo EAN-13 y carga manual · Lote {lote}</p>
        </div>
        <Button variant="secondary" onClick={abrirInforme}>
          <FileText size={15} /> Ver informe del día
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Unidades hoy" value={loading ? '—' : registros.length} icon={Package} />
        <KpiCard label="KG totales"   value={loading ? '—' : kpiKg.toFixed(2)} icon={Scale} />
        <KpiCard label="Operarios"    value={loading ? '—' : kpiOps}           icon={Users} />
        <KpiCard label="Lote"         value={lote} color={colors.brand}        icon={Hash} />
      </div>

      {/* Registro */}
      <div className="p-6" style={{ backgroundColor: colors.surface, borderRadius: radius.xl, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${colors.brand}18` }}>
              {modo === 'escaneo' ? <ScanLine size={16} style={{ color: colors.brand }} /> : <PenLine size={16} style={{ color: colors.brand }} />}
            </div>
            <h2 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Registrar producción</h2>
          </div>
          <div className="flex gap-1.5">
            {[{ key: 'escaneo', label: 'Escanear código' }, { key: 'manual', label: 'Carga manual' }].map(m => (
              <button key={m.key} onClick={() => setModo(m.key)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border"
                style={{
                  backgroundColor: modo === m.key ? colors.brand : 'transparent',
                  borderColor: modo === m.key ? colors.brand : colors.border,
                  color: modo === m.key ? 'white' : colors.textSecondary,
                }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-xs mb-4">
          <Select label="Operario *" value={operarioSel} onChange={e => setOperarioSel(e.target.value)}
            error={!operarioSel ? 'Seleccioná un operario para poder registrar' : undefined}>
            <option value="">Seleccionar operario...</option>
            {operarios.map(o => (
              <option key={o.id} value={String(o.id)}>{o.nombre}</option>
            ))}
          </Select>
        </div>

        {modo === 'escaneo' ? (
          <>
            <input
              ref={inputRef}
              type="text"
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Escanear código de barra..."
              autoFocus
              className="w-full font-mono tracking-wide text-center outline-none transition-colors"
              style={{ padding: '20px 24px', fontSize: 18, borderRadius: radius.lg, border: `2px solid ${colors.border}`, color: colors.textPrimary }}
              onFocus={e => { e.target.style.borderColor = colors.brand }}
              onBlur={e => { e.target.style.borderColor = colors.border }}
            />

            {preview && (
              <div className="mt-4 p-5 space-y-3" style={{ backgroundColor: `${colors.brand}0d`, border: `1px solid ${colors.brand}30`, borderRadius: radius.lg, animation: 'slide-down 220ms ease-out' }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold" style={{ color: colors.textPrimary }}>{preview.nombre}</p>
                      <Badge variant="info">{preview.categoria}</Badge>
                    </div>
                    <p className="text-xs mt-1" style={{ color: colors.textMuted }}>Código #{preview.prod} · Lote {lote}</p>
                  </div>
                  <span className="text-2xl font-extrabold flex-shrink-0" style={{ color: colors.brand }}>
                    {preview.peso} kg
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1.5">Observaciones</label>
                  <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)}
                    placeholder="Observaciones (opcional)" rows={2} className={textareaClass} />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="secondary" onClick={() => { setPreview(null); setCodigo(''); setObservaciones('') }}>
                    Cancelar
                  </Button>
                  <Button variant="primary" onClick={registrar} loading={guardando} disabled={!operarioSel}>
                    {guardando ? 'Guardando…' : 'Registrar'}
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select label="Producto *" value={manualProducto} onChange={e => setManualProducto(e.target.value)}>
                <option value="">Seleccionar producto...</option>
                <optgroup label="Helados">
                  {saboresCamara.map(s => <option key={`sabor:${s.id}`} value={`sabor:${s.id}`}>{s.nombre}</option>)}
                </optgroup>
                <optgroup label="Impulsivos y Postres">
                  {impulsivosList.map(i => <option key={`impulsivo:${i.id}`} value={`impulsivo:${i.id}`}>{i.nombre}</option>)}
                </optgroup>
              </Select>
              <Input label={cantidadLabel} type="number" min="0" step="0.01" value={manualCantidad}
                onChange={e => setManualCantidad(e.target.value)} placeholder="0" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Lote" value={manualLote} onChange={e => setManualLote(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Observaciones</label>
              <textarea value={manualObservaciones} onChange={e => setManualObservaciones(e.target.value)}
                placeholder="Observaciones (opcional)" rows={2} className={textareaClass} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="primary" onClick={registrarManual} loading={guardandoManual} disabled={!operarioSel}>
                {guardandoManual ? 'Guardando…' : 'Registrar'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Timeline de registros */}
      <div style={{ backgroundColor: colors.surface, borderRadius: radius.xl, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <h2 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Registros de hoy</h2>
          <span className="text-xs" style={{ color: colors.textMuted }}>últimos 50</span>
        </div>
        {loading ? (
          <div className="p-10 flex justify-center"><Spinner size={24} /></div>
        ) : registros.length === 0 ? (
          <EmptyState icon={Package} title="Sin registros hoy" subtitle="Escaneá un código o cargá manualmente para comenzar" />
        ) : (
          <div className="px-5 py-4">
            {registros.map((r, i) => (
              <div key={r.id} className="relative pl-7" style={{ paddingBottom: i === registros.length - 1 ? 0 : 18 }}>
                {i !== registros.length - 1 && (
                  <div className="absolute w-px" style={{ left: 6, top: 16, bottom: -2, backgroundColor: colors.border }} />
                )}
                <div className="absolute rounded-full" style={{ left: 0, top: 3, width: 13, height: 13, backgroundColor: colors.surface, border: `2.5px solid ${colors.brand}` }} />
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>{r.producto_nombre}</p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {r.categoria && <Badge variant="neutral">{r.categoria}</Badge>}
                      {r.origen === 'manual' && <Badge variant="info">Manual</Badge>}
                      <span className="text-xs" style={{ color: colors.textMuted }}>
                        {r.operario_nombre} · {new Date(r.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <span className="text-base font-bold flex-shrink-0" style={{ color: colors.brand }}>{fmtNum(r.peso_kg)} {unidadDe(r)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Informe del día */}
      <Modal
        open={modalInforme}
        onClose={() => setModalInforme(false)}
        title={`Informe del día — ${fechaHoy}`}
        maxWidth="max-w-3xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalInforme(false)} className="flex-1">Cerrar</Button>
            <Button variant="primary" onClick={imprimirInforme} disabled={informeData.length === 0} className="flex-1">
              <Printer size={14} /> Imprimir A4
            </Button>
          </>
        }
      >
        {cargandoInforme ? (
          <div className="flex justify-center py-10"><Spinner size={24} /></div>
        ) : informeData.length === 0 ? (
          <EmptyState icon={FileText} title="Sin registros" subtitle="Todavía no hay producción registrada hoy" />
        ) : (
          <div className="space-y-5">
            <div className="overflow-x-auto max-h-72 overflow-y-auto" style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md }}>
              <Table className="min-w-[560px]">
                <Thead>
                  <Tr>
                    <Th>Hora</Th><Th>Producto</Th><Th>Categoría</Th><Th>Operario</Th><Th>Cantidad</Th><Th>Lote</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {informeData.map(r => (
                    <Tr key={r.id}>
                      <Td>{new Date(r.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</Td>
                      <Td className="font-medium">{r.producto_nombre}</Td>
                      <Td>{r.categoria || '—'}</Td>
                      <Td>{r.operario_nombre || '—'}</Td>
                      <Td className="text-right">{fmtNum(r.peso_kg)} {unidadDe(r)}</Td>
                      <Td>{r.lote || '—'}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: colors.textPrimary }}>Subtotales por operario</p>
              <div className="overflow-hidden" style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md }}>
                <Table>
                  <Thead>
                    <Tr><Th>Operario</Th><Th>Registros</Th><Th>Cantidad total</Th></Tr>
                  </Thead>
                  <Tbody>
                    {subtotales.map(s => (
                      <Tr key={s.operario}>
                        <Td className="font-medium">{s.operario}</Td>
                        <Td>{s.registros}</Td>
                        <Td className="text-right font-semibold" style={{ color: colors.brand }}>{fmtNum(s.cantidad)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
