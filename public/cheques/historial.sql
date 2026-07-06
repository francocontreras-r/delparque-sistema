-- ─────────────────────────────────────────────────────────────────────────────
-- Migración: auditoría de cheques (quién lo cargó y quién cambió cada estado).
-- Corré esto UNA vez en Supabase → SQL Editor del proyecto de Cheques.
-- Es seguro correrlo más de una vez (IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.cheques
  add column if not exists creado_por text,
  add column if not exists historial  jsonb not null default '[]'::jsonb;

-- Nada más que hacer. La app ya escribe y lee estas columnas automáticamente.
