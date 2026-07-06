import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

// ─────────────────────────────────────────────────────────────────────────────
// Cron diario: revisa los cheques por vencer y envía avisos por HITOS
// (una vez al entrar en la ventana, otra a 2 días y otra el día del vencimiento).
// Manda push a los dispositivos suscriptos y email a la lista (si hay Resend).
// Lo dispara Vercel Cron (ver vercel.json). No repite un hito ya enviado.
// Variables: CHEQUES_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
//            VAPID_SUBJECT (opc), RESEND_API_KEY (opc), RESEND_FROM (opc),
//            CRON_SECRET (opc, recomendado).
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_URL = 'https://wzaqkenrlwilbyisvlhw.supabase.co'
const ABIERTOS = new Set(['en_cartera', 'depositado', 'pendiente', 'entregado'])

const fmtMiles = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const pesos = n => '$ ' + fmtMiles(n)

function diasHasta(fecha, hoy) {
  if (!fecha) return null
  const t = new Date(String(fecha).slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((t - hoy) / 86400000)
}
function labelDias(d) {
  if (d == null) return ''
  if (d < 0) return `hace ${-d} d`
  if (d === 0) return 'vence hoy'
  if (d === 1) return 'vence mañana'
  return `vence en ${d} d`
}

export default async function handler(req, res) {
  // Autorización del cron (si está configurado CRON_SECRET)
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || ''
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'No autorizado' })
  }
  const serviceKey = process.env.CHEQUES_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Falta CHEQUES_SERVICE_ROLE_KEY' })
  const supabaseUrl = process.env.CHEQUES_SUPABASE_URL || DEFAULT_URL
  const db = createClient(supabaseUrl, serviceKey)

  const vapidOk = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  if (vapidOk) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:avisos@ciaf.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)

  try {
    const { data: cfg } = await db.from('notif_config').select('*').eq('id', 1).maybeSingle()
    const dias = cfg?.dias || 7
    const emailActivo = cfg?.email_activo !== false

    // "Hoy" a medianoche UTC (suficiente para comparar por día)
    const now = new Date()
    const hoy = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

    const { data: cheques } = await db.from('cheques').select('*')
    const abiertos = (cheques || []).filter(c => ABIERTOS.has(c.estado) && c.fecha_pago)

    const bucket = d => d == null ? null : d <= 0 ? 'venc' : d <= 2 ? 'urg' : d <= dias ? 'out' : null
    const candidatos = []
    for (const c of abiertos) {
      const d = diasHasta(c.fecha_pago, hoy)
      const b = bucket(d)
      if (b) candidatos.push({ c, d, hito: b })
    }
    if (!candidatos.length) return res.status(200).json({ ok: true, nuevos: 0, motivo: 'sin cheques en ventana' })

    // Descartar hitos ya enviados
    const { data: yaEnviados } = await db.from('notif_log').select('cheque_id,hito')
    const enviadoSet = new Set((yaEnviados || []).map(r => r.cheque_id + ':' + r.hito))
    const nuevos = candidatos.filter(x => !enviadoSet.has(x.c.id + ':' + x.hito))
    if (!nuevos.length) return res.status(200).json({ ok: true, nuevos: 0, motivo: 'todos los hitos ya avisados' })

    // Registrar los hitos (para no repetir)
    await db.from('notif_log').upsert(nuevos.map(x => ({ cheque_id: x.c.id, hito: x.hito })), { onConflict: 'cheque_id,hito' })

    // Armar el mensaje
    const chs = nuevos.map(x => x.c)
    const totPagar = chs.filter(c => c.tipo === 'emitido').reduce((s, c) => s + (+c.importe || 0), 0)
    const totCobrar = chs.filter(c => c.tipo === 'recibido').reduce((s, c) => s + (+c.importe || 0), 0)
    const masUrg = nuevos.slice().sort((a, b) => a.d - b.d)[0]
    const nombreUrg = masUrg.c.contraparte || masUrg.c.librador || 'un cheque'
    const title = `💳 ${chs.length} cheque${chs.length !== 1 ? 's' : ''} por vencer`
    const resumen = []
    if (totPagar) resumen.push('A pagar ' + pesos(totPagar))
    if (totCobrar) resumen.push('A cobrar ' + pesos(totCobrar))
    resumen.push(`El más próximo: ${nombreUrg}, ${labelDias(masUrg.d)}`)
    const bodyTxt = resumen.join(' · ')

    // ── Push ──────────────────────────────────────────────────────────────
    let pushOk = 0, pushErr = 0
    if (vapidOk) {
      const { data: subs } = await db.from('push_subscriptions').select('*').eq('activo', true)
      const payload = JSON.stringify({ title, body: bodyTxt, url: '/cheques/' })
      for (const s of subs || []) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
          pushOk++
        } catch (e) {
          pushErr++
          if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').update({ activo: false }).eq('endpoint', s.endpoint)
        }
      }
    }

    // ── Email (Resend) ────────────────────────────────────────────────────
    let emailOk = 0
    if (emailActivo && process.env.RESEND_API_KEY) {
      const { data: emails } = await db.from('notif_emails').select('email').eq('activo', true)
      const dest = (emails || []).map(e => e.email).filter(Boolean)
      if (dest.length) {
        const filas = nuevos.slice().sort((a, b) => a.d - b.d).map(x => {
          const c = x.c, quien = c.contraparte || c.librador || '—'
          const tipo = c.tipo === 'emitido' ? '🔴 A pagar' : '🟢 A cobrar'
          return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${tipo}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${escHtml(quien)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${pesos(c.importe)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b71d2b">${labelDias(x.d)}</td></tr>`
        }).join('')
        const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#12203a">
          <div style="background:#063F6D;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0"><b style="font-size:16px">CIAF · Informe de Cheques</b></div>
          <div style="border:1px solid #e3e7ee;border-top:none;border-radius:0 0 12px 12px;padding:18px 20px">
            <p style="margin:0 0 12px"><b>${title}</b><br><span style="color:#5b6472">${bodyTxt}</span></p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">${filas}</table>
            <p style="margin:16px 0 0;font-size:12px;color:#8a93a3">CIAF Consultora Integral · Información de uso confidencial. Este es un aviso automático.</p>
          </div></div>`
        try {
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: process.env.RESEND_FROM || 'CIAF Cheques <onboarding@resend.dev>', to: dest, subject: title, html }),
          })
          if (r.ok) emailOk = dest.length
        } catch { /* ignora fallo de email */ }
      }
    }

    return res.status(200).json({ ok: true, nuevos: nuevos.length, pushOk, pushErr, emailOk })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error del servidor' })
  }
}

function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])) }
