import Spinner from './Spinner'

const VARIANTS = {
  primary:   'bg-[#D4521A] hover:bg-[#b84415] text-white border border-transparent',
  secondary: 'bg-[#1E293B] hover:bg-[#334155] text-[#F1F5F9] border border-[#334155] hover:border-[#475569]',
  danger:    'bg-[#EF4444] hover:bg-[#dc2626] text-white border border-transparent',
  success:   'bg-[#22C55E] hover:bg-[#16a34a] text-white border border-transparent',
  ghost:     'bg-transparent hover:bg-[#334155] text-[#94A3B8] hover:text-[#F1F5F9] border border-transparent',
}

const SIZES = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2 gap-2',
  lg: 'text-base px-5 py-2.5 gap-2.5',
}

const SPINNER_SIZE = { sm: 12, md: 14, lg: 16 }

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  children,
  ...props
}) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading && <Spinner size={SPINNER_SIZE[size]} />}
      {children}
    </button>
  )
}
