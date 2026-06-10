import { colors, radius } from '../../styles/design-system'

export default function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div
          className="w-14 h-14 flex items-center justify-center mb-4"
          style={{ backgroundColor: colors.bg, borderRadius: radius.xl }}
        >
          <Icon size={22} style={{ color: colors.textMuted }} />
        </div>
      )}
      <p className="text-sm font-semibold" style={{ color: colors.textSecondary }}>{title}</p>
      {subtitle && (
        <p className="text-xs mt-1.5" style={{ color: colors.textMuted }}>{subtitle}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
