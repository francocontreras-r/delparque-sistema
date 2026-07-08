import { colors } from '../styles/design-system'

// Encabezado único de página: título + subtítulo + acciones. Fuente de verdad
// para que todas las pantallas tengan el mismo tamaño, color y espaciado.
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-3 mb-6 pb-4"
      style={{ borderBottom: `1px solid ${colors.border}` }}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary, margin: 0 }}>{title}</h1>
        {subtitle && (
          <p className="text-sm" style={{ color: colors.textMuted, margin: '4px 0 0' }}>{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">{actions}</div>
      )}
    </div>
  )
}
