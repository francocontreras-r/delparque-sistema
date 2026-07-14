-- ─────────────────────────────────────────────────────────────────────────────
-- Migración: registro de endosos de cheques a cobrar (a quién y cuándo).
-- Corré esto UNA vez en Supabase → SQL Editor del proyecto de Cheques.
-- Es seguro correrlo más de una vez.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.cheques
  add column if not exists endosado_a     text,
  add column if not exists endosado_fecha date;

-- La app ya escribe y lee estas columnas. Al poner un cheque a cobrar en estado
-- "Endosado", te pregunta a quién y lo deja en la lista de "Cheques endosados"
-- (pestaña Análisis).
