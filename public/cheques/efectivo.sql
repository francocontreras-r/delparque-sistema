-- ─────────────────────────────────────────────────────────────────────────────
-- Efectivo disponible: distinguir "cuenta bancaria" de "efectivo en caja"
-- dentro de la Disponibilidad. Agrega la columna "tipo" a las cuentas.
-- Corré esto UNA vez en Supabase → SQL Editor del proyecto de Cheques.
-- Es seguro correrlo más de una vez.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.bancos
  add column if not exists tipo text default 'banco';

-- Las cuentas ya cargadas quedan como 'banco' (default). En la app, al agregar
-- una nueva, elegís "💵 Efectivo en caja" y se suma a la disponibilidad total.
