import { useState } from 'react'
import { supabase } from '../lib/supabase'

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
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{
        backgroundColor: '#0B1120',
        backgroundImage: 'radial-gradient(circle, #1E293B 1px, transparent 1px)',
        backgroundSize: '26px 26px',
      }}
    >
      {/* Brand glow — top */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          top: '-160px',
          width: '460px',
          height: '460px',
          borderRadius: '9999px',
          background: 'radial-gradient(circle, rgba(212,82,26,0.20) 0%, rgba(212,82,26,0) 70%)',
          filter: 'blur(8px)',
        }}
      />

      <div className="w-full max-w-sm relative">
        {/* Brand lockup */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative">
            {/* Soft brand halo behind the wordmark */}
            <div
              aria-hidden
              className="absolute"
              style={{
                width: '320px',
                height: '200px',
                borderRadius: '9999px',
                background: 'radial-gradient(ellipse, rgba(212,82,26,0.22) 0%, rgba(212,82,26,0) 70%)',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            />
            <img
              src="/logo-wordmark-white-hd.png"
              alt="Del Parque"
              width="230"
              className="relative block"
              style={{ height: 'auto', objectFit: 'contain' }}
            />
          </div>
          <p
            className="text-xs mt-4"
            style={{ color: '#64748B', letterSpacing: '0.18em', textTransform: 'uppercase' }}
          >
            Sistema de gestión industrial
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: '#111A2E',
            border: '1px solid #233047',
            boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
          }}
        >
          {/* Orange top accent bar */}
          <div style={{ height: 3, background: 'linear-gradient(90deg, #D4521A, #F2772E)' }} />

          <div className="px-7 pt-7 pb-8">
            <h1 className="text-base font-semibold mb-1" style={{ color: '#F1F5F9' }}>
              Iniciar sesión
            </h1>
            <p className="text-xs mb-6" style={{ color: '#64748B' }}>
              Ingresá tus credenciales para continuar
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#94A3B8' }}>
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
                    backgroundColor: '#0B1120',
                    border: '1px solid #233047',
                    color: '#F1F5F9',
                    '--tw-ring-color': 'rgba(212,82,26,0.25)',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#D4521A' }}
                  onBlur={e => { e.target.style.borderColor = '#233047' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#94A3B8' }}>
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
                    backgroundColor: '#0B1120',
                    border: '1px solid #233047',
                    color: '#F1F5F9',
                    '--tw-ring-color': 'rgba(212,82,26,0.25)',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#D4521A' }}
                  onBlur={e => { e.target.style.borderColor = '#233047' }}
                />
              </div>

              {error && (
                <p
                  className="text-sm rounded-lg px-3 py-2"
                  style={{
                    color: '#FCA5A5',
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
                style={{
                  background: 'linear-gradient(90deg, #D4521A, #E2632A)',
                  color: '#ffffff',
                  boxShadow: '0 6px 18px rgba(212,82,26,0.30)',
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.filter = 'brightness(1.07)' }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}
              >
                {loading ? 'Ingresando…' : 'Ingresar'}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs mt-6" style={{ color: '#475569' }}>
          © 2026 Del Parque · Acceso restringido
        </p>
      </div>
    </div>
  )
}
