import { ChevronDown } from 'lucide-react'

export default function Select({ label, error, className = '', id, children, ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[#374151] mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          className={`w-full appearance-none rounded-lg border text-sm text-[#111827] bg-white outline-none transition-colors duration-150 px-3 py-2 pr-9 ${
            error
              ? 'border-[#dc2626] focus:ring-2 focus:ring-[#dc2626]/30 focus:border-[#dc2626]'
              : 'border-[#d1d5db] focus:ring-2 focus:ring-[#D4521A]/30 focus:border-[#D4521A]'
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
      </div>
      {error && <p className="mt-1.5 text-xs text-[#dc2626]">{error}</p>}
    </div>
  )
}
