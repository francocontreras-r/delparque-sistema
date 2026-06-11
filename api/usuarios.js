import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor' })
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No autenticado' })

  const supabaseAdmin = createClient(supabaseUrl, serviceKey)

  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !caller) return res.status(401).json({ error: 'Sesión inválida' })

  const { data: callerProfile } = await supabaseAdmin
    .from('user_profiles').select('rol').eq('id', caller.id).maybeSingle()
  if (callerProfile?.rol !== 'admin') {
    return res.status(403).json({ error: 'Requiere permisos de administrador' })
  }

  const { email, nombre, rol } = req.body || {}
  if (!email || !nombre || !rol) {
    return res.status(400).json({ error: 'Faltan datos: email, nombre, rol' })
  }

  const tempPassword = Math.random().toString(36).slice(-8) + 'Aa1!'

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email, password: tempPassword, email_confirm: true,
  })
  if (createErr) return res.status(400).json({ error: createErr.message })

  const { error: profileErr } = await supabaseAdmin.from('user_profiles').insert({
    id: created.user.id, nombre, email, rol, permisos: {}, activo: true,
  })
  if (profileErr) return res.status(400).json({ error: profileErr.message })

  return res.status(200).json({ ok: true, tempPassword })
}
