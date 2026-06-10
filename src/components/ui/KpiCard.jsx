import { colors, radius, shadow } from '../../styles/design-system'

export default function KpiCard({ label, value, sub, color, icon: Icon, active, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`transition-all duration-200 ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        border: active ? `2px solid ${colors.brand}` : `1px solid ${colors.border}`,
        boxShadow: active ? `0 0 0 3px ${colors.brand}20, ${shadow.sm}` : shadow.sm,
        padding: '16px 20px',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-semibold uppercase mb-2.5"
            style={{ color: colors.textMuted, letterSpacing: '0.07em' }}
          >
            {label}
          </p>
          <p className="text-2xl font-bold leading-none" style={{ color: color || colors.textPrimary }}>
            {value}
          </p>
          {sub && (
            <p className="text-xs mt-1.5" style={{ color: colors.textMuted }}>{sub}</p>
          )}
        </div>
        {Icon && (
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${color || colors.brand}18` }}
          >
            <Icon size={18} style={{ color: color || colors.brand }} />
          </div>
        )}
      </div>
    </div>
  )
}
