import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function InformeOperarios() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('resumen')
  const [operarios, setOperarios] = useState([])
  const [ordenes, setOrdenes] = useState([])
  const [operarioSel, setOperarioSel] = useState('')
  const [periodo, setPeriodo] = useState('mes')

  useEffect(() => {
    cargar()
  }, [periodo]) // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = async () => {
    setLoading(true)
    setError(null)
    try {
      const hoy = new Date()
      const desde = new Date()
      if (periodo === 'semana') desde.setDate(hoy.getDate() - 7)
      else if (periodo === 'mes') desde.setMonth(hoy.getMonth() - 1)
      else if (periodo === 'trimestre') desde.setMonth(hoy.getMonth() - 3)

      const [{ data: ops }, { data: ords }] = await Promise.all([
        supabase.from('operarios').select('id, nombre').eq('activo', true).order('nombre'),
        supabase.from('ordenes_produccion')
          .select('*')
          .gte('created_at', desde.toISOString())
          .order('created_at', { ascending: false }),
      ])

      const operariosUnicos = [...new Map((ops || []).map(o => [o.nombre, o])).values()]
      setOperarios(operariosUnicos)
      setOrdenes(ords || [])
      if (operariosUnicos.length > 0 && !operarioSel) {
        setOperarioSel(operariosUnicos[0].nombre)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', color: '#D4521A', fontSize: '18px' }}>
      Cargando rendimiento...
    </div>
  )

  if (error) return (
    <div style={{ padding: '24px', color: '#ef4444' }}>
      <p>Error: {error}</p>
      <button onClick={cargar} style={{ marginTop: '12px', padding: '8px 16px', background: '#D4521A', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
        Reintentar
      </button>
    </div>
  )

  const ranking = operarios.map(op => {
    const misOrdenes = ordenes.filter(o =>
      (o.operario_nombre || '').toUpperCase() === op.nombre.toUpperCase()
    )
    const completadas = misOrdenes.filter(o => o.estado === 'completada')
    const totalKgObj  = completadas.reduce((a, o) => a + (Number(o.kg_objetivo)  || 0), 0)
    const totalKgProd = completadas.reduce((a, o) => a + (Number(o.kg_producido) || 0), 0)
    const efKg = totalKgObj > 0 ? Math.round((totalKgProd / totalKgObj) * 100) : 0
    const ordsConTiempo = completadas.filter(o => Number(o.eficiencia_tiempo) > 0)
    const efTiempo = ordsConTiempo.length > 0
      ? Math.round(ordsConTiempo.reduce((a, o) => a + Number(o.eficiencia_tiempo), 0) / ordsConTiempo.length)
      : 100
    const rendimiento = Math.round(efKg * 0.6 + efTiempo * 0.4)
    return { nombre: op.nombre, ordenes: misOrdenes.length, completadas: completadas.length, efKg, efTiempo, rendimiento }
  }).sort((a, b) => b.rendimiento - a.rendimiento)

  const datosOperario = ordenes.filter(o =>
    (o.operario_nombre || '').toUpperCase() === operarioSel.toUpperCase()
  )

  const chartData = ranking.slice(0, 10).map(r => ({
    nombre: r.nombre.split(' ')[0],
    'Ef. KG': r.efKg,
    'Ef. Tiempo': r.efTiempo,
    'Rendimiento': r.rendimiento,
  }))

  const nivelBadge = (r) => {
    if (r >= 80) return { label: 'EXCELENTE', color: '#10b981' }
    if (r >= 60) return { label: 'BUENO',     color: '#3b82f6' }
    if (r >= 40) return { label: 'REGULAR',   color: '#f59e0b' }
    return              { label: 'BAJO',       color: '#ef4444' }
  }

  const ACCENT = '#D4521A'
  const CARD = { background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '20px', marginBottom: '16px' }

  return (
    <div style={{ padding: '24px', background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f1f5f9' }}>Rendimiento de Operarios</h1>
          <p style={{ color: '#64748b', fontSize: '14px' }}>Análisis de productividad y eficiencia</p>
        </div>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)}
          style={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', padding: '8px 12px', borderRadius: '6px', fontSize: '14px' }}>
          <option value="semana">Última semana</option>
          <option value="mes">Último mes</option>
          <option value="trimestre">Último trimestre</option>
        </select>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {[['resumen', 'Resumen'], ['operario', 'Por Operario'], ['ranking', 'Ranking']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: tab === k ? ACCENT : '#1e293b',
              color: tab === k ? 'white' : '#94a3b8', fontWeight: tab === k ? '700' : '400' }}>
            {l}
          </button>
        ))}
      </div>

      {/* TAB RESUMEN */}
      {tab === 'resumen' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'Órdenes completadas', value: ordenes.filter(o => o.estado === 'completada').length },
              { label: 'Rendimiento promedio', value: ranking.length > 0 ? Math.round(ranking.reduce((a, r) => a + r.rendimiento, 0) / ranking.length) + '%' : '—' },
              { label: 'Operario destacado', value: ranking[0]?.nombre.split(' ')[0] || '—' },
              { label: 'Operarios activos', value: operarios.length },
            ].map(kpi => (
              <div key={kpi.label} style={CARD}>
                <div style={{ fontSize: '28px', fontWeight: '800', color: ACCENT }}>{kpi.value}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', textTransform: 'uppercase' }}>{kpi.label}</div>
              </div>
            ))}
          </div>

          {chartData.length > 0 && (
            <div style={CARD}>
              <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600' }}>Rendimiento del equipo</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="nombre" stroke="#64748b" />
                  <YAxis domain={[0, 100]} stroke="#64748b" />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
                  <Legend />
                  <Bar dataKey="Ef. KG" fill="#3b82f6" />
                  <Bar dataKey="Ef. Tiempo" fill={ACCENT} />
                  <Bar dataKey="Rendimiento" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {ranking.length === 0 && (
            <div style={{ ...CARD, textAlign: 'center', color: '#64748b' }}>Sin datos en el período seleccionado</div>
          )}
        </div>
      )}

      {/* TAB POR OPERARIO */}
      {tab === 'operario' && (
        <div>
          <select value={operarioSel} onChange={e => setOperarioSel(e.target.value)}
            style={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', padding: '8px 12px', borderRadius: '6px', marginBottom: '16px', width: '300px' }}>
            {operarios.map(o => <option key={o.nombre} value={o.nombre}>{o.nombre}</option>)}
          </select>

          {(() => {
            const r = ranking.find(r => r.nombre.toUpperCase() === operarioSel.toUpperCase())
            if (!r) return <p style={{ color: '#64748b' }}>Sin datos para este operario en el período</p>
            const badge = nivelBadge(r.rendimiento)
            return (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '16px' }}>
                  {[
                    { label: 'Órdenes totales', value: r.ordenes },
                    { label: 'Completadas',     value: r.completadas },
                    { label: 'Ef. KG',          value: r.efKg + '%' },
                    { label: 'Ef. Tiempo',       value: r.efTiempo + '%' },
                  ].map(k => (
                    <div key={k.label} style={CARD}>
                      <div style={{ fontSize: '24px', fontWeight: '800', color: ACCENT }}>{k.value}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>{k.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ ...CARD, display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ fontSize: '48px', fontWeight: '900', color: badge.color }}>{r.rendimiento}%</div>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: badge.color }}>{badge.label}</div>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>Rendimiento general del período</div>
                  </div>
                </div>

                <div style={CARD}>
                  <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '600' }}>Historial de órdenes</h3>
                  {datosOperario.length === 0 ? (
                    <p style={{ color: '#64748b', padding: '16px' }}>Sin órdenes en el período</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: '#334155' }}>
                            {['Fecha', 'Producto', 'Kg Obj', 'Kg Real', '% Kg', 'Hs Est', 'Hs Real', '% Tiempo', 'Rend.'].map(h => (
                              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {datosOperario.slice(0, 20).map(o => {
                            const kgObj = Number(o.kg_objetivo) || 0
                            const kgProd = Number(o.kg_producido) || 0
                            const efKgRow = kgObj > 0 ? Math.round((kgProd / kgObj) * 100) : 0
                            const efTiempoRow = Number(o.eficiencia_tiempo) || 100
                            const rend = Math.round(efKgRow * 0.6 + efTiempoRow * 0.4)
                            const b = nivelBadge(rend)
                            return (
                              <tr key={o.id} style={{ borderBottom: '1px solid #1e293b' }}>
                                <td style={{ padding: '8px 12px' }}>{o.fecha_produccion || (o.created_at || '').slice(0, 10) || '—'}</td>
                                <td style={{ padding: '8px 12px' }}>{o.sabor_nombre || o.producto_nombre || '—'}</td>
                                <td style={{ padding: '8px 12px' }}>{kgObj.toFixed(1)}</td>
                                <td style={{ padding: '8px 12px' }}>{kgProd.toFixed(1)}</td>
                                <td style={{ padding: '8px 12px', color: efKgRow >= 95 ? '#10b981' : '#f59e0b' }}>{efKgRow}%</td>
                                <td style={{ padding: '8px 12px' }}>{Number(o.horas_estimadas || 0).toFixed(1)}</td>
                                <td style={{ padding: '8px 12px' }}>{Number(o.horas_reales || 0).toFixed(1)}</td>
                                <td style={{ padding: '8px 12px' }}>{efTiempoRow.toFixed(0)}%</td>
                                <td style={{ padding: '8px 12px', color: b.color, fontWeight: '700' }}>{rend}%</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* TAB RANKING */}
      {tab === 'ranking' && (
        <div style={CARD}>
          <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600' }}>Ranking del equipo</h3>
          {ranking.length === 0 ? (
            <p style={{ color: '#64748b', padding: '16px' }}>Sin datos en el período</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#334155' }}>
                    {['Pos', 'Operario', 'Órdenes', 'Completadas', 'Ef. KG', 'Ef. Tiempo', 'Rendimiento', 'Nivel'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => {
                    const badge = nivelBadge(r.rendimiento)
                    return (
                      <tr key={r.nombre} style={{ borderBottom: '1px solid #1e293b', background: i < 3 ? 'rgba(212,82,26,0.05)' : 'transparent' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontWeight: '700', fontSize: '16px' }}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: '600' }}>{r.nombre}</td>
                        <td style={{ padding: '10px 12px', color: '#64748b' }}>{r.ordenes}</td>
                        <td style={{ padding: '10px 12px', color: '#64748b' }}>{r.completadas}</td>
                        <td style={{ padding: '10px 12px', color: '#3b82f6' }}>{r.efKg}%</td>
                        <td style={{ padding: '10px 12px', color: ACCENT }}>{r.efTiempo}%</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, background: '#334155', borderRadius: '4px', height: '8px', minWidth: '80px' }}>
                              <div style={{ width: r.rendimiento + '%', background: badge.color, borderRadius: '4px', height: '8px' }} />
                            </div>
                            <span style={{ color: badge.color, fontWeight: '700', minWidth: '40px' }}>{r.rendimiento}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ background: badge.color + '22', color: badge.color, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700' }}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
