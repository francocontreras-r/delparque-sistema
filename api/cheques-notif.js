import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

// ─────────────────────────────────────────────────────────────────────────────
// Gestión de notificaciones de la app de Cheques (CIAF).
//   POST { action: 'subscribe',   subscription }        (usuario autenticado)
//   POST { action: 'unsubscribe', endpoint }            (usuario autenticado)
//   POST { action: 'test' }                             (envía push de prueba al que llama)
//   POST { action: 'email-list' }                       (admin)
//   POST { action: 'email-add', email }                 (admin)
//   POST { action: 'email-del', email }                 (admin)
//   POST { action: 'config-get' | 'config-set', dias, email_activo }  (config-set = admin)
// Variables de entorno en Vercel:
//   CHEQUES_SERVICE_ROLE_KEY, CHEQUES_SUPABASE_URL (opcional),
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (opcional)
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_URL = 'https://wzaqkenrlwilbyisvlhw.supabase.co'

function vapidReady() {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:avisos@ciaf.app', pub, priv)
  return true
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método no permitido' })
  }
  const supabaseUrl = process.env.CHEQUES_SUPABASE_URL || DEFAULT_URL
  const serviceKey = process.env.CHEQUES_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Falta CHEQUES_SERVICE_ROLE_KEY en Vercel' })

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No autenticado' })

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !caller) return res.status(401).json({ error: 'Sesión inválida' })

  const { data: perfil } = await admin.from('perfiles').select('rol').eq('id', caller.id).maybeSingle()
  const esAdmin = perfil?.rol === 'admin'
  const requireAdmin = () => { if (!esAdmin) { res.status(403).json({ error: 'Requiere permisos de administrador' }); return false } return true }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const action = body.action

  try {
    // ── Suscribir este navegador al push ────────────────────────────────────
    if (action === 'subscribe') {
      const s = body.subscription
      if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) {
        return res.status(400).json({ error: 'Suscripción inválida' })
      }
      const { error } = await admin.from('push_subscriptions').upsert({
        user_id: caller.id, email: caller.email,
        endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, activo: true,
      }, { onConflict: 'endpoint' })
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    // ── Desuscribir ─────────────────────────────────────────────────────────
    if (action === 'unsubscribe') {
      if (!body.endpoint) return res.status(400).json({ error: 'Falta endpoint' })
      await admin.from('push_subscriptions').update({ activo: false }).eq('endpoint', body.endpoint)
      return res.status(200).json({ ok: true })
    }

    // ── Enviar push de prueba a los dispositivos del que llama ───────────────
    if (action === 'test') {
      if (!vapidReady()) return res.status(500).json({ error: 'Faltan las llaves VAPID en Vercel' })
      const { data: subs } = await admin.from('push_subscriptions')
        .select('*').eq('user_id', caller.id).eq('activo', true)
      if (!subs?.length) return res.status(400).json({ error: 'Este dispositivo no tiene push activado todavía' })
      const payload = JSON.stringify({
        title: '💳 Prueba de aviso — CIAF',
        body: 'Así te van a llegar los avisos de cheques por vencer, aunque tengas la app cerrada. ✅',
      })
      let ok = 0
      for (const sub of subs) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
          ok++
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) await admin.from('push_subscriptions').update({ activo: false }).eq('endpoint', sub.endpoint)
        }
      }
      return res.status(200).json({ ok: true, enviados: ok })
    }

    // ── Emails ──────────────────────────────────────────────────────────────
    if (action === 'email-list') {
      const { data } = await admin.from('notif_emails').select('email,activo').order('email')
      return res.status(200).json({ ok: true, emails: data || [] })
    }
    if (action === 'email-add') {
      if (!requireAdmin()) return
      const email = String(body.email || '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email inválido' })
      const { error } = await admin.from('notif_emails').upsert({ email, activo: true }, { onConflict: 'email' })
      if (error) throw error
      return res.status(200).json({ ok: true })
    }
    if (action === 'email-del') {
      if (!requireAdmin()) return
      await admin.from('notif_emails').delete().eq('email', String(body.email || '').trim().toLowerCase())
      return res.status(200).json({ ok: true })
    }

    // ── Config ──────────────────────────────────────────────────────────────
    if (action === 'config-get') {
      const { data } = await admin.from('notif_config').select('*').eq('id', 1).maybeSingle()
      return res.status(200).json({ ok: true, config: data || { dias: 7, email_activo: true } })
    }
    if (action === 'config-set') {
      if (!requireAdmin()) return
      const patch = { id: 1 }
      if (body.dias != null) patch.dias = Math.max(1, Math.min(60, parseInt(body.dias, 10) || 7))
      if (body.email_activo != null) patch.email_activo = !!body.email_activo
      const { error } = await admin.from('notif_config').upsert(patch, { onConflict: 'id' })
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Acción desconocida' })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error del servidor' })
  }
}
