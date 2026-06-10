import { colors } from '../../styles/design-system'

const BG = {
  ok:    colors.success,
  error: colors.danger,
  warn:  colors.warning,
}

export default function Toast({ toast }) {
  if (!toast) return null
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 text-sm font-semibold text-white pointer-events-none whitespace-nowrap"
      style={{
        backgroundColor: BG[toast.type] || BG.ok,
        borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        animation: 'slide-up 200ms ease-out',
      }}
    >
      {toast.msg}
    </div>
  )
}
