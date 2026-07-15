-- ─────────────────────────────────────────────────────────────────────────────
-- Reparar esquema: asegura que las tablas tengan TODAS las columnas que la app
-- usa. Si falta alguna, las subidas fallan en silencio y quedan cheques
-- "sin subir" para siempre. Este script agrega lo que falte (no borra nada) y
-- es seguro correrlo las veces que quieras.
-- Corré TODO en Supabase → SQL Editor del proyecto de Cheques.
-- Después, en la app: Ajustes → "Sincronizar ahora". El contador debe ir a 0.
-- ─────────────────────────────────────────────────────────────────────────────

-- Cheques (la tabla que suele quedar corta)
alter table public.cheques
  add column if not exists razon_social_id    uuid,
  add column if not exists tipo               text,
  add column if not exists formato            text,
  add column if not exists banco              text,
  add column if not exists numero             text,
  add column if not exists importe            numeric,
  add column if not exists fecha_emision      date,
  add column if not exists fecha_pago         date,
  add column if not exists fecha_acreditacion date,
  add column if not exists estado             text,
  add column if not exists librador           text,
  add column if not exists cuit_librador      text,
  add column if not exists contraparte        text,
  add column if not exists concepto           text,
  add column if not exists observaciones      text,
  add column if not exists creado_por         text,
  add column if not exists historial          jsonb,
  add column if not exists endosado_a         text,
  add column if not exists endosado_fecha     date,
  add column if not exists comprobante_path   text,
  add column if not exists comprobante_nombre text;

-- Razones sociales
alter table public.razones_sociales
  add column if not exists nombre text,
  add column if not exists cuit   text,
  add column if not exists activo boolean default true;

-- Bancos
alter table public.bancos
  add column if not exists razon_social_id uuid,
  add column if not exists entidad         text,
  add column if not exists saldo           numeric,
  add column if not exists acuerdo         numeric;

-- Perfiles (nombre para el pie del informe)
alter table public.perfiles
  add column if not exists nombre text;
