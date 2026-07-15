-- ─────────────────────────────────────────────────────────────────────────────
-- Cheques rechazados: guardar el motivo y la fecha del rechazo.
-- Corré esto UNA vez en Supabase → SQL Editor del proyecto de Cheques.
-- Es seguro correrlo más de una vez.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.cheques
  add column if not exists rechazo_motivo text,
  add column if not exists rechazo_fecha  date;

-- Listo. En la app, al marcar un cheque como "Rechazado" te va a pedir el motivo
-- y la fecha, y vas a verlos en Análisis → Cheques rechazados (con a quién reclamar).
