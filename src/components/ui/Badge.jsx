const VARIANTS = {
  success: 'bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0]',
  warning: 'bg-[#fffbeb] text-[#d97706] border border-[#fde68a]',
  danger:  'bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]',
  info:    'bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]',
  neutral: 'bg-[#f9fafb] text-[#6b7280] border border-[#e5e7eb]',
}

export default function Badge({ variant = 'neutral', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-xs font-medium leading-none whitespace-nowrap px-2.5 py-1 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
