export function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #334155',
    }}>
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#f1f5f9', margin: 0 }}>{title}</h1>
        {subtitle && (
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>{subtitle}</p>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '16px' }}>{actions}</div>
      )}
    </div>
  )
}
