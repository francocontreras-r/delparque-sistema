export default function Table({ children, className = '' }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse ${className}`}>{children}</table>
    </div>
  )
}

export function Thead({ children }) {
  return <thead className="bg-[#f9fafb]">{children}</thead>
}

export function Tbody({ children }) {
  return <tbody>{children}</tbody>
}

export function Tr({ children, className = '', ...props }) {
  return (
    <tr className={`border-b border-[#e5e7eb] last:border-b-0 hover:bg-[#f9fafb] transition-colors duration-100 ${className}`} {...props}>
      {children}
    </tr>
  )
}

export function Th({ children, className = '', ...props }) {
  return (
    <th className={`text-left text-xs font-semibold uppercase tracking-wide text-[#6b7280] py-2.5 px-4 ${className}`} {...props}>
      {children}
    </th>
  )
}

export function Td({ children, className = '', ...props }) {
  return <td className={`py-3 px-4 text-sm text-[#111827] ${className}`} {...props}>{children}</td>
}
