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
//   POST { action: 'email-test' }                        (admin — envía email de prueba)
//   POST { action: 'config-get' | 'config-set', dias, email_activo }  (config-set = admin)
// Variables de entorno en Vercel:
//   CHEQUES_SERVICE_ROLE_KEY, CHEQUES_SUPABASE_URL (opcional),
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (opcional),
//   RESEND_API_KEY, RESEND_FROM (opcional, para el email)
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_URL = 'https://wzaqkenrlwilbyisvlhw.supabase.co'
const ABIERTOS = new Set(['en_cartera', 'depositado', 'pendiente', 'entregado'])
const fmtMiles = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const pesos = n => '$ ' + fmtMiles(n)
const escHtml = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]))

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

    // ── Enviar un email de prueba a la lista (o al que llama) ────────────────
    if (action === 'email-test') {
      if (!requireAdmin()) return
      if (!process.env.RESEND_API_KEY) return res.status(400).json({ error: 'Falta configurar RESEND_API_KEY en Vercel (ver GUIA-NOTIFICACIONES.md)' })
      const { data: emails } = await admin.from('notif_emails').select('email').eq('activo', true)
      let dest = (emails || []).map(e => e.email).filter(Boolean)
      if (!dest.length) dest = [caller.email]
      // Preview con cheques reales por vencer (si hay); si no, ejemplos
      const { data: cheques } = await admin.from('cheques').select('*')
      const dias = f => f ? Math.round((new Date(String(f).slice(0, 10) + 'T00:00:00Z').getTime() - Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())) / 86400000) : null
      const lbl = d => d == null ? '' : d < 0 ? `venció hace ${-d} d` : d === 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : `vence en ${d} d`
      let prox = (cheques || []).filter(c => ABIERTOS.has(c.estado) && c.fecha_pago).map(c => ({ c, d: dias(c.fecha_pago) })).filter(x => x.d != null && x.d <= 30).sort((a, b) => a.d - b.d).slice(0, 5)
      let ejemplo = false
      if (!prox.length) { ejemplo = true; prox = [{ c: { tipo: 'emitido', contraparte: 'Icardi', importe: 2500000 }, d: 1 }, { c: { tipo: 'recibido', contraparte: 'Heladería Central', importe: 600000 }, d: 4 }] }
      const filas = prox.map(x => {
        const c = x.c, quien = c.contraparte || c.librador || '—'
        const tipo = c.tipo === 'emitido' ? '🔴 A pagar' : '🟢 A cobrar'
        return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${tipo}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${escHtml(quien)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${pesos(c.importe)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b71d2b">${lbl(x.d)}</td></tr>`
      }).join('')
      const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#12203a">
        <div style="background:#063F6D;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0"><b style="font-size:16px">CIAF · Informe de Cheques</b></div>
        <div style="border:1px solid #e3e7ee;border-top:none;border-radius:0 0 12px 12px;padding:18px 20px">
          <p style="margin:0 0 4px"><b>💳 Prueba de aviso por email</b></p>
          <p style="margin:0 0 14px;color:#5b6472">Así te va a llegar el aviso de la mañana con los cheques por vencer.${ejemplo ? ' <i>(Estos son datos de ejemplo porque no hay cheques por vencer ahora.)</i>' : ''}</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">${filas}</table>
          <p style="margin:16px 0 0;font-size:12px;color:#8a93a3">CIAF Consultora Integral · Información de uso confidencial. Este es un aviso automático.</p>
        </div></div>`
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.RESEND_FROM || 'CIAF Cheques <onboarding@resend.dev>', to: dest, subject: '💳 Prueba de aviso — CIAF Cheques', html }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) return res.status(400).json({ error: 'Resend: ' + (j.message || j.error || ('error ' + r.status)) })
      return res.status(200).json({ ok: true, enviados: dest.length, destinatarios: dest })
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
