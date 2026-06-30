// ─────────────────────────────────────────────────────────────────────────────
// Exportar listados a CSV (se abre directo en Excel / Google Sheets).
// Usa ";" como separador (Excel en español lo respeta) y BOM UTF-8 para que los
// acentos salgan bien.
//   columns: [{ header: 'Producto', get: r => r.nombre }]  // o { header, key }
// ─────────────────────────────────────────────────────────────────────────────
export function exportarCSV(filename, columns, rows) {
  const esc = v => {
    const s = v == null ? '' : String(v)
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = columns.map(c => esc(c.header)).join(';')
  const body = (rows || []).map(r =>
    columns.map(c => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(';')
  ).join('\r\n')
  const csv = '﻿' + head + '\r\n' + body
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
