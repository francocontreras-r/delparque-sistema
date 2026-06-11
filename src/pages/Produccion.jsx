import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import KpiCard from '../components/ui/KpiCard'
import EmptyState from '../components/ui/EmptyState'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import Badge from '../components/ui/Badge'
import { colors, radius, shadow } from '../styles/design-system'
import { Package, Users, Scale, Hash, ScanLine } from 'lucide-react'

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

export default function Produccion() {
  const [operarios, setOperarios]     = useState([])
  const [productos, setProductos]     = useState([])
  const [registros, setRegistros]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState(null)
  const [codigo, setCodigo]           = useState('')
  const [preview, setPreview]         = useState(null)
  const [operarioSel, setOperarioSel] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando]     = useState(false)
  const inputRef = useRef(null)

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
    let [{ data: ops }, { data: prods }, { data: regs }] = await Promise.all([
      supabase.from('operarios').select('*').order('nombre'),
      supabase.from('productos_produccion').select('*').order('nombre'),
      supabase.from('producciones').select('*').eq('fecha', fechaHoy)
        .order('created_at', { ascending: false }).limit(50),
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
    if (ops && ops.length > 0) setOperarioSel(String(ops[0].id))
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

  function toast2(msg, type = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const kpiKg  = registros.reduce((a, r) => a + (r.peso_kg || 0), 0)
  const kpiOps = new Set(registros.map(r => r.operario_nombre).filter(Boolean)).size

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      <div>
        <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Producción</h1>
        <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>Escaneo EAN-13 · Lote {lote}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Unidades hoy" value={loading ? '—' : registros.length} icon={Package} />
        <KpiCard label="KG totales"   value={loading ? '—' : kpiKg.toFixed(2)} icon={Scale} />
        <KpiCard label="Operarios"    value={loading ? '—' : kpiOps}           icon={Users} />
        <KpiCard label="Lote"         value={lote} color={colors.brand}        icon={Hash} />
      </div>

      {/* Scan bar */}
      <div className="p-6" style={{ backgroundColor: colors.surface, borderRadius: radius.xl, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${colors.brand}18` }}>
            <ScanLine size={16} style={{ color: colors.brand }} />
          </div>
          <h2 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Escanear código de barras</h2>
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
          <EmptyState icon={Package} title="Sin registros hoy" subtitle="Escaneá un código para comenzar" />
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
                      <span className="text-xs" style={{ color: colors.textMuted }}>
                        {r.operario_nombre} · {new Date(r.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <span className="text-base font-bold flex-shrink-0" style={{ color: colors.brand }}>{r.peso_kg} kg</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
