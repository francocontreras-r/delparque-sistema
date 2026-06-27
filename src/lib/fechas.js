const TZ = 'America/Argentina/Buenos_Aires'

export function hoyAR() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ })
}

export function inicioDelDiaAR(fecha) {
  return `${fecha}T03:00:00.000Z`
}

export function finDelDiaAR(fecha) {
  const [y, m, d] = fecha.split('-').map(Number)
  const siguiente = new Date(Date.UTC(y, m - 1, d + 1))
  return siguiente.toISOString().replace('T00:00:00.000Z', 'T02:59:59.999Z')
}
