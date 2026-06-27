import { useState } from 'react'
import { supabase } from '../lib/supabase'
import logoColor from '/logo-color.png'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        backgroundColor: '#0F172A',
        backgroundImage: 'radial-gradient(circle, #334155 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          backgroundColor: '#1E293B',
          border: '1px solid #334155',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Orange top accent bar */}
        <div style={{ height: 4, backgroundColor: '#D4521A' }} />

        <div className="p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <img
              src={logoColor}
              width="140"
              alt="Del Parque"
              style={{ height: 'auto', objectFit: 'contain', marginBottom: '16px' }}
            />
            <p className="text-sm" style={{ color: '#64748B' }}>Sistema de gestión industrial</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#94A3B8' }}>
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@delparque.com"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all duration-150 focus:ring-2"
                style={{
                  backgroundColor: '#0F172A',
                  border: '1px solid #334155',
                  color: '#F1F5F9',
                  '--tw-ring-color': 'rgba(212,82,26,0.25)',
                }}
                onFocus={e => { e.target.style.borderColor = '#D4521A' }}
                onBlur={e => { e.target.style.borderColor = '#334155' }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#94A3B8' }}>
                Contraseña
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all duration-150 focus:ring-2"
                style={{
                  backgroundColor: '#0F172A',
                  border: '1px solid #334155',
                  color: '#F1F5F9',
                }}
                onFocus={e => { e.target.style.borderColor = '#D4521A' }}
                onBlur={e => { e.target.style.borderColor = '#334155' }}
              />
            </div>

            {error && (
              <p
                className="text-sm rounded-lg px-3 py-2"
                style={{
                  color: '#EF4444',
                  backgroundColor: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full font-semibold rounded-lg py-2.5 text-sm transition-all duration-150 active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundColor: '#D4521A', color: '#ffffff' }}
              onMouseEnter={e => { if (!loading) e.target.style.backgroundColor = '#b84415' }}
              onMouseLeave={e => { e.target.style.backgroundColor = '#D4521A' }}
            >
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
