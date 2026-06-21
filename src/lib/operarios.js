// Elimina duplicados por nombre (trim), filtra inactivos y ordena alfabéticamente.
export function deduplicarOperarios(data) {
  return [...new Map((data || []).map(o => [o.nombre.trim(), o])).values()]
    .filter(o => o.activo !== false)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
}
