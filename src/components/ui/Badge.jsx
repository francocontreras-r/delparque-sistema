const VARIANTS = {
  success: 'bg-[rgba(34,197,94,0.12)]  text-[#22C55E] border border-[rgba(34,197,94,0.25)]',
  warning: 'bg-[rgba(245,158,11,0.12)] text-[#F59E0B] border border-[rgba(245,158,11,0.25)]',
  danger:  'bg-[rgba(239,68,68,0.12)]  text-[#EF4444] border border-[rgba(239,68,68,0.25)]',
  info:    'bg-[rgba(96,165,250,0.12)] text-[#60A5FA] border border-[rgba(96,165,250,0.25)]',
  neutral: 'bg-[#334155] text-[#94A3B8] border border-[#475569]',
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
