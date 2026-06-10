import { useEffect } from 'react'
import { X } from 'lucide-react'
import { colors, radius } from '../../styles/design-system'

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-md', footer }) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={`w-full ${maxWidth} max-h-[90vh] flex flex-col`}
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          animation: 'modal-in 180ms cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {title && (
          <div
            className="flex items-center justify-between px-6 py-4 flex-shrink-0"
            style={{ borderBottom: `1px solid ${colors.border}` }}
          >
            <h2 className="text-base font-semibold" style={{ color: colors.textPrimary }}>{title}</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-slate-100"
              style={{ color: colors.textMuted }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex-shrink-0 px-6 py-4" style={{ borderTop: `1px solid ${colors.border}` }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
