export default function Input({ label, error, icon: Icon, className = '', id, ...props }) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[#94A3B8] mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
        )}
        <input
          id={id}
          className={`w-full rounded-lg border text-sm text-[#F1F5F9] placeholder:text-[#64748B] bg-[#0F172A] outline-none transition-colors duration-150 px-3 py-2 ${Icon ? 'pl-9' : ''} ${
            error
              ? 'border-[#EF4444] focus:ring-2 focus:ring-[#EF4444]/20 focus:border-[#EF4444]'
              : 'border-[#334155] focus:ring-2 focus:ring-[#D4521A]/25 focus:border-[#D4521A]'
          } ${className}`}
          {...props}
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-[#EF4444]">{error}</p>}
    </div>
  )
}
