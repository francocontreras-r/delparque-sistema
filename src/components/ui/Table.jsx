export default function Table({ children, className = '' }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse ${className}`}>{children}</table>
    </div>
  )
}

export function Thead({ children }) {
  return <thead className="bg-[#0F172A]">{children}</thead>
}

export function Tbody({ children }) {
  return <tbody>{children}</tbody>
}

export function Tr({ children, className = '', ...props }) {
  return (
    <tr className={`border-b border-[#334155] last:border-b-0 hover:bg-[#334155]/40 transition-colors duration-100 ${className}`} {...props}>
      {children}
    </tr>
  )
}

export function Th({ children, className = '', ...props }) {
  return (
    <th className={`text-left text-xs font-semibold uppercase tracking-wide text-[#64748B] py-2.5 px-4 ${className}`} {...props}>
      {children}
    </th>
  )
}

export function Td({ children, className = '', ...props }) {
  return <td className={`py-3 px-4 text-sm text-[#F1F5F9] ${className}`} {...props}>{children}</td>
}
