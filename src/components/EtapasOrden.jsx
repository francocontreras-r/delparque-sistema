import { useState, useEffect } from 'react'
import { colors, radius } from '../styles/design-system'
import Spinner from './ui/Spinner'
import {
  cargarEtapasOrden, crearEtapasOrden, iniciarEtapa, finalizarEtapa,
  esperaDe, activoDe, estandarDe, eficienciaDe, leadTimeDe, fmtMin,
} from '../lib/etapas'

const hora = ts => ts ? new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—'

// Captura del proceso multi-etapa de un postre/impulsivo. Cada operario marca
// las etapas que hace; el abatidor/cámara es "espera" y no suma a su tiempo.
export default function EtapasOrden({ orden, operarios = [], onChange }) {
  const [etapas, setEtapas]   = useState([])
  const [loading, setLoading] = useState(true)
  const [disponible, setDisponible] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [picks, setPicks]     = useState({}) // etapaId -> operario_nombre elegido

  useEffect(() => { cargar() }, [orden?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function cargar() {
    if (!orden?.id) return
    setLoading(true)
    let r = await cargarEtapasOrden(orden.id)
    if (r.disponible && r.etapas.length === 0) {
      // Primera vez que se abre la orden: generar sus etapas desde la config.
      r = await crearEtapasOrden(orden)
    }
    setDisponible(r.disponible)
    setEtapas(r.etapas)
    setLoading(false)
  }

  async function onIniciar(etapa) {
    const operario = picks[etapa.id] || orden.operario_nombre || operarios[0]?.nombre
    if (!operario) return
    setSavingId(etapa.id)
    try {
      const upd = await iniciarEtapa(etapa.id, operario)
      setEtapas(prev => prev.map(e => e.id === etapa.id ? { ...e, ...upd } : e))
      onChange?.()
    } catch (e) { console.warn(e) } finally { setSavingId(null) }
  }

  async function onFinalizar(etapa) {
    setSavingId(etapa.id)
    try {
      const upd = await finalizarEtapa(etapa)
      setEtapas(prev => prev.map(e => e.id === etapa.id ? { ...e, ...upd } : e))
      onChange?.()
    } catch (e) { console.warn(e) } finally { setSavingId(null) }
  }

  if (loading) return <div className="flex justify-center py-6"><Spinner size={20} /></div>

  if (!disponible) return (
    <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: `${colors.warning}1a`, border: `1px solid ${colors.warning}`, color: colors.warning }}>
      Para registrar etapas de proceso, corré primero <b>sql/etapas_produccion.sql</b> en Supabase.
    </div>
  )

  const activo = activoDe(etapas), espera = esperaDe(etapas), lead = leadTimeDe(etapas)
  const std = estandarDe(etapas), efic = eficienciaDe(etapas)

  return (
    <div>
      {/* KPIs de tiempo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[
          { l: 'Mano de obra activa', v: fmtMin(activo), c: colors.success, s: 'etapas activas (sin espera)' },
          { l: 'Espera de proceso',   v: fmtMin(espera), c: colors.textSecondary, s: 'abatidor — no cuenta al operario' },
          { l: 'Lead time (ciclo)',   v: fmtMin(lead),   c: colors.info, s: 'de la 1ª a la última etapa' },
          { l: 'Eficiencia parcial',  v: efic != null ? `${efic}%` : '—', c: efic == null ? colors.textMuted : efic >= 100 ? colors.success : colors.warning, s: std > 0 ? `estándar ${fmtMin(std)} / real ${fmtMin(activo)}` : 'sin etapas activas cerradas' },
        ].map(k => (
          <div key={k.l} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: '10px 12px' }}>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: colors.textSecondary }}>{k.l}</div>
            <div className="text-lg font-extrabold mt-0.5" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[10px] mt-0.5" style={{ color: colors.textMuted }}>{k.s}</div>
          </div>
        ))}
      </div>

      <div className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: colors.textSecondary }}>Etapas del proceso</div>

      <div className="space-y-2">
        {etapas.map(e => {
          const enCurso = e.inicio && !e.fin
          const hecha = !!e.fin
          const eficE = (e.es_activa && e.fin && e.tiempo_min > 0 && e.estandar_min > 0)
            ? Math.round((e.estandar_min / e.tiempo_min) * 100) : null
          const num = e.es_activa ? (hecha ? colors.success : enCurso ? colors.brand : colors.textMuted) : colors.textSecondary
          return (
            <div key={e.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{
              border: `1px solid ${enCurso ? colors.brand : colors.border}`,
              background: enCurso ? `${colors.brand}14` : !e.es_activa ? colors.bg : colors.surface,
              opacity: !e.es_activa && !hecha ? 0.85 : 1,
            }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0"
                style={{ backgroundColor: `${num}22`, color: num }}>{e.etapa_orden}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold flex items-center gap-2" style={{ color: e.es_activa ? colors.textPrimary : colors.textSecondary }}>
                  {e.etapa_nombre}
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={e.es_activa
                      ? { background: enCurso ? `${colors.brand}33` : `${colors.success}22`, color: enCurso ? '#ffb38a' : colors.success }
                      : { background: `${colors.textSecondary}22`, color: colors.textSecondary }}>
                    {e.es_activa ? (enCurso ? 'ACTIVA · EN CURSO' : hecha ? 'ACTIVA' : 'ACTIVA · PENDIENTE') : 'ESPERA'}
                  </span>
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>
                  {hecha
                    ? <>{e.operario_nombre || (e.es_activa ? 'Sin operario' : 'Sin operario')} · {hora(e.inicio)} → {hora(e.fin)} · <b style={{ color: colors.textPrimary }}>{fmtMin(e.tiempo_min)}</b>{e.es_activa && e.estandar_min > 0 ? ` (estándar ${fmtMin(e.estandar_min)})` : !e.es_activa ? ' de proceso' : ''}</>
                    : enCurso
                      ? <>{e.operario_nombre} · iniciado {hora(e.inicio)}{e.estandar_min > 0 ? ` · estándar ${fmtMin(e.estandar_min)}` : ''}</>
                      : <>{e.es_activa ? `Pendiente${e.estandar_min > 0 ? ` · estándar ${fmtMin(e.estandar_min)}` : ''}` : 'Pendiente · proceso de espera'}</>}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {eficE != null && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${eficE >= 100 ? colors.success : colors.warning}22`, color: eficE >= 100 ? colors.success : colors.warning }}>
                    {eficE}%
                  </span>
                )}
                {!hecha && !enCurso && (
                  <>
                    {e.es_activa && (
                      <select value={picks[e.id] || orden.operario_nombre || ''} onChange={ev => setPicks(p => ({ ...p, [e.id]: ev.target.value }))}
                        className="text-xs rounded px-1.5 py-1" style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary, maxWidth: 130 }}>
                        {!orden.operario_nombre && <option value="">Operario…</option>}
                        {operarios.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
                      </select>
                    )}
                    <button onClick={() => onIniciar(e)} disabled={savingId === e.id}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: 'transparent', color: colors.info, border: `1px solid ${colors.info}55` }}>
                      ▸ Iniciar
                    </button>
                  </>
                )}
                {enCurso && (
                  <button onClick={() => onFinalizar(e)} disabled={savingId === e.id}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: colors.brand }}>
                    Finalizar
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
