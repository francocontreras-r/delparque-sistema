import { useEffect } from 'react'
import { X } from 'lucide-react'
import { colors } from '../../styles/design-system'

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg', footer }) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={`w-full ${maxWidth} max-h-[90vh] flex flex-col rounded-2xl shadow-2xl`}
        style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, animation: 'modal-in 180ms cubic-bezier(0.16,1,0.3,1)' }}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 border-b" style={{ borderColor: colors.border }}>
            <h2 className="text-lg font-semibold" style={{ color: colors.textPrimary }}>{title}</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-[#334155]"
              style={{ color: colors.textMuted }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-6" style={{ maxHeight: '70vh' }}>{children}</div>
        {footer && (
          <div className="flex-shrink-0 flex justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: colors.border }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
