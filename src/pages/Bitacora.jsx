import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import KpiCard from '../components/ui/KpiCard'
import Button from '../components/ui/Button'
import { PageHeader } from '../components/PageHeader'
import Badge from '../components/ui/Badge'
import Table, { Thead, Tbody, Tr, Th, Td } from '../components/ui/Table'
import { colors, radius, shadow } from '../styles/design-system'
import { exportarCSV } from '../lib/exportar'
import { History, FileDown, Search } from 'lucide-react'

const LIMITE = 150
const MODULOS = ['Todos', 'Cámaras', 'Depósito', 'Órdenes', 'Mermas', 'Producción']
const MOD_VARIANT = {
  'Cámaras': 'info', 'Depósito': 'warning', 'Órdenes': 'neutral',
  'Mermas': 'danger', 'Producción': 'success',
}

function fmtFechaHora(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return String(ts)
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function num(n, dec = 1) { return Number(n || 0).toFixed(dec) }

export default function Bitacora() {
  const [loading, setLoading] = useState(true)
  const [eventos, setEventos] = useState([])
  const [modulo, setModulo]   = useState('Todos')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const [cam, dep, ord, mer, prod] = await Promise.all([
      supabase.from('movimientos_camara').select('*').order('created_at', { ascending: false }).limit(LIMITE),
      supabase.from('movimientos_deposito').select('*').order('created_at', { ascending: false }).limit(LIMITE),
      supabase.from('ordenes_produccion').select('*').order('created_at', { ascending: false }).limit(LIMITE),
      supabase.from('mermas').select('*').order('created_at', { ascending: false }).limit(LIMITE),
      supabase.from('producciones').select('*').order('created_at', { ascending: false }).limit(LIMITE),
    ])

    const ev = []
    ;(cam.data || []).forEach(m => ev.push({
      ts: m.created_at || m.fecha, modulo: 'Cámaras',
      accion: m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
      detalle: `${m.baldes || 0} ${m.tipo_producto === 'helado' ? 'bal.' : 'u.'} de ${m.sabor_nombre || m.producto_nombre || '—'}${m.motivo ? ` · ${m.motivo}` : ''}`,
      usuario: m.operario_nombre || '—',
    }))
    ;(dep.data || []).forEach(m => ev.push({
      ts: m.created_at || m.fecha, modulo: 'Depósito',
      accion: m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
      detalle: `${m.cantidad ?? ''} ${m.unidad || ''} de ${m.producto_nombre || '—'}${m.motivo ? ` · ${m.motivo}` : (m.destino ? ` · ${m.destino}` : '')}`,
      usuario: m.controlo || m.operario_recibe || m.operario_nombre || '—',
    }))
    ;(ord.data || []).forEach(o => ev.push({
      ts: o.created_at || o.fecha_produccion, modulo: 'Órdenes',
      accion: `Orden ${o.numero || ''} · ${o.estado || ''}`,
      detalle: o.sabor_nombre || o.producto_nombre || o.tipo_producto || '—',
      usuario: o.operario_nombre || o.usuario_email || '—',
    }))
    ;(mer.data || []).forEach(m => ev.push({
      ts: m.created_at || m.fecha, modulo: 'Mermas',
      accion: 'Merma registrada',
      detalle: `${m.sabor_nombre || '—'} · ${num(m.diferencia, 2)} kg${m.unidades ? ` / ${m.unidades} u` : ''}${m.causa ? ` · ${m.causa}` : ''}`,
      usuario: m.operario_nombre || m.usuario_email || '—',
    }))
    ;(prod.data || []).forEach(p => ev.push({
      ts: p.created_at || p.fecha, modulo: 'Producción',
      accion: 'Registro de producción',
      detalle: `${p.producto_nombre || '—'} · ${num(p.peso_kg, 2)}`,
      usuario: p.operario_nombre || p.usuario_email || '—',
    }))

    ev.sort((a, b) => new Date(b.ts) - new Date(a.ts))
    setEventos(ev)
    setLoading(false)
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return eventos.filter(e =>
      (modulo === 'Todos' || e.modulo === modulo) &&
      (!q || `${e.accion} ${e.detalle} ${e.usuario}`.toLowerCase().includes(q))
    )
  }, [eventos, modulo, busqueda])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bitácora"
        subtitle="Trazabilidad: quién hizo qué y cuándo, en todos los módulos"
        actions={
          <Button variant="secondary" disabled={filtrados.length === 0}
            onClick={() => exportarCSV('bitacora', [
              { header: 'Fecha y hora', get: e => fmtFechaHora(e.ts) },
              { header: 'Módulo', get: e => e.modulo },
              { header: 'Acción', get: e => e.accion },
              { header: 'Detalle', get: e => e.detalle },
              { header: 'Usuario', get: e => e.usuario },
            ], filtrados)}>
            <FileDown size={15} /> Excel
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {MODULOS.filter(m => m !== 'Todos').map(m => (
          <KpiCard key={m} label={m} value={eventos.filter(e => e.modulo === m).length}
            onClick={() => setModulo(modulo === m ? 'Todos' : m)} />
        ))}
      </div>

      <div className="p-3 flex flex-wrap gap-3 items-center" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
        <div className="flex gap-1.5 flex-wrap">
          {MODULOS.map(m => (
            <button key={m} onClick={() => setModulo(m)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border"
              style={{ backgroundColor: modulo === m ? colors.brand : 'transparent', borderColor: modulo === m ? colors.brand : colors.border, color: modulo === m ? 'white' : colors.textSecondary }}>
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto rounded-lg border px-2.5 py-1.5" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
          <Search size={14} style={{ color: colors.textMuted }} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto, operario…"
            className="bg-transparent outline-none text-sm" style={{ color: colors.textPrimary, minWidth: 180 }} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-14"><Spinner size={28} /></div>
      ) : filtrados.length === 0 ? (
        <EmptyState icon={History} title="Sin actividad" subtitle="No hay eventos para el filtro seleccionado" />
      ) : (
        <div className="overflow-hidden" style={{ backgroundColor: colors.surface, borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadow.sm }}>
          <Table className="min-w-[720px]">
            <Thead>
              <Tr><Th>Fecha y hora</Th><Th>Módulo</Th><Th>Acción</Th><Th>Detalle</Th><Th>Usuario</Th></Tr>
            </Thead>
            <Tbody>
              {filtrados.slice(0, 300).map((e, i) => (
                <Tr key={i}>
                  <Td className="text-xs whitespace-nowrap" style={{ color: colors.textSecondary }}>{fmtFechaHora(e.ts)}</Td>
                  <Td><Badge variant={MOD_VARIANT[e.modulo] || 'neutral'}>{e.modulo}</Badge></Td>
                  <Td className="text-xs font-medium">{e.accion}</Td>
                  <Td className="text-xs" style={{ color: colors.textSecondary }}>{e.detalle}</Td>
                  <Td className="text-xs" style={{ color: colors.textMuted }}>{e.usuario}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </div>
  )
}
