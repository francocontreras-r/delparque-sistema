import { ChevronDown } from 'lucide-react'

export default function Select({ label, error, className = '', id, children, ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[#94A3B8] mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          className={`w-full appearance-none rounded-lg border text-sm text-[#F1F5F9] bg-[#0F172A] outline-none transition-colors duration-150 px-3 py-2 pr-9 ${
            error
              ? 'border-[#EF4444] focus:ring-2 focus:ring-[#EF4444]/20 focus:border-[#EF4444]'
              : 'border-[#334155] focus:ring-2 focus:ring-[#D4521A]/25 focus:border-[#D4521A]'
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
      </div>
      {error && <p className="mt-1.5 text-xs text-[#EF4444]">{error}</p>}
    </div>
  )
}
