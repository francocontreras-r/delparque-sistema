export default function Input({ label, error, icon: Icon, className = '', id, ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[#374151] mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
        )}
        <input
          id={id}
          className={`w-full rounded-lg border text-sm text-[#111827] placeholder:text-[#9ca3af] bg-white outline-none transition-colors duration-150 px-3 py-2 ${Icon ? 'pl-9' : ''} ${
            error
              ? 'border-[#dc2626] focus:ring-2 focus:ring-[#dc2626]/30 focus:border-[#dc2626]'
              : 'border-[#d1d5db] focus:ring-2 focus:ring-[#D4521A]/30 focus:border-[#D4521A]'
          } ${className}`}
          {...props}
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-[#dc2626]">{error}</p>}
    </div>
  )
}
