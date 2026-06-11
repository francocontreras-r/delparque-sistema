import Spinner from './Spinner'

const VARIANTS = {
  primary:   'bg-[#D4521A] hover:bg-[#b84415] text-white border border-transparent',
  secondary: 'bg-white hover:bg-[#f9fafb] text-[#111827] border border-[#d1d5db]',
  danger:    'bg-[#dc2626] hover:bg-[#b91c1c] text-white border border-transparent',
  success:   'bg-[#16a34a] hover:bg-[#15803d] text-white border border-transparent',
  ghost:     'bg-transparent hover:bg-[#f3f4f6] text-[#374151] border border-transparent',
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
