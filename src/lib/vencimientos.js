// Clasifica una fecha de vencimiento respecto a hoy.
export function clasificarVencimiento(fechaVencISO) {
  if (!fechaVencISO) return null
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const fv  = new Date(String(fechaVencISO).slice(0, 10) + 'T00:00:00')
  const dias = Math.round((fv - hoy) / 86400000)

  if (dias < 0)  return { estado: 'vencido',    label: '🔴 VENCIDO',          dias, color: '#ef4444', badge: 'danger'  }
  if (dias <= 2) return { estado: 'hoy_manana', label: '🟠 HOY/MAÑANA',       dias, color: '#f97316', badge: 'danger'  }
  if (dias <= 7) return { estado: 'pronto',     label: '🟡 VENCE PRONTO',     dias, color: '#f59e0b', badge: 'warning' }
  return               { estado: 'ok',          label: '🟢 OK',                dias, color: '#22c55e', badge: 'success' }
}

export function esAlertaVencimiento(clasificacion) {
  return clasificacion != null && clasificacion.estado !== 'ok'
}

export function labelDias(dias) {
  if (dias < 0) return `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}`
  if (dias === 0) return 'Vence hoy'
  if (dias === 1) return 'Vence mañana'
  return `Vence en ${dias} días`
}
