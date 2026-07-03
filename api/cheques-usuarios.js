import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Alta / baja / reset de usuarios de la app de Cheques (CIAF).
// Usa la service_role key del proyecto de cheques (SECRETA, solo en el server).
// Configurar en Vercel:
//   CHEQUES_SERVICE_ROLE_KEY = (Supabase → Settings → API → service_role)
//   CHEQUES_SUPABASE_URL     = https://wzaqkenrlwilbyisvlhw.supabase.co  (opcional; hay default)
// Solo un usuario con rol 'admin' (tabla perfiles) puede usar este endpoint.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_URL = 'https://wzaqkenrlwilbyisvlhw.supabase.co'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const supabaseUrl = process.env.CHEQUES_SUPABASE_URL || DEFAULT_URL
  const serviceKey = process.env.CHEQUES_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return res.status(500).json({ error: 'Falta configurar CHEQUES_SERVICE_ROLE_KEY en Vercel' })
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No autenticado' })

  const admin = createClient(supabaseUrl, serviceKey)

  // ¿Quién llama? Debe ser admin.
  const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !caller) return res.status(401).json({ error: 'Sesión inválida' })

  const { data: callerPerfil } = await admin
    .from('perfiles').select('rol').eq('id', caller.id).maybeSingle()
  if (callerPerfil?.rol !== 'admin') {
    return res.status(403).json({ error: 'Requiere permisos de administrador' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const action = body.action || 'create'

  // ── Eliminar usuario ──────────────────────────────────────────────────────
  if (action === 'delete') {
    const { userId } = body
    if (!userId) return res.status(400).json({ error: 'Falta userId' })
    if (userId === caller.id) return res.status(400).json({ error: 'No podés eliminar tu propia cuenta' })
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return res.status(400).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  // ── Restablecer contraseña ────────────────────────────────────────────────
  if (action === 'reset') {
    const { userId, password } = body
    if (!userId || !password) return res.status(400).json({ error: 'Falta userId o password' })
    if (String(password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
    const { error } = await admin.auth.admin.updateUserById(userId, { password })
    if (error) return res.status(400).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  // ── Crear usuario ─────────────────────────────────────────────────────────
  const { email, password, rol } = body
  if (!email || !password || !rol) {
    return res.status(400).json({ error: 'Faltan datos: email, password y rol' })
  }
  if (!['admin', 'carga', 'lectura'].includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido' })
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (createErr) return res.status(400).json({ error: createErr.message })

  // El trigger crea el perfil como 'lectura'; lo ajustamos al rol elegido.
  const { error: perfilErr } = await admin.from('perfiles')
    .upsert({ id: created.user.id, email, rol })
  if (perfilErr) return res.status(400).json({ error: perfilErr.message })

  return res.status(200).json({ ok: true, id: created.user.id })
}
