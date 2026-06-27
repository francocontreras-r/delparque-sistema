import { supabase } from './supabase'

export async function registrarAudit(usuarioEmail, accion, tabla, registroId, detalle) {
  try {
    await supabase.from('audit_log').insert({
      usuario_email: usuarioEmail,
      accion,
      tabla,
      registro_id: String(registroId),
      detalle,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Error audit log:', err)
  }
}
