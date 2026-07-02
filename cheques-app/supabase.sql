-- ═══════════════════════════════════════════════════════════════════════════
--  Informe de Cheques — base de datos en Supabase (sincronización en la nube)
--  Pegá TODO esto en Supabase → SQL Editor → New query → Run.
--  Es idempotente: se puede correr más de una vez sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Razones sociales ─────────────────────────────────────────────────────────
create table if not exists public.razones_sociales (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  cuit       text,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Cuentas bancarias (disponibilidad) ───────────────────────────────────────
create table if not exists public.bancos (
  id              uuid primary key default gen_random_uuid(),
  razon_social_id uuid references public.razones_sociales(id) on delete cascade,
  entidad         text not null,
  saldo           numeric(14,2) not null default 0,
  acuerdo         numeric(14,2) not null default 0,
  created_at      timestamptz not null default now()
);

-- ── Cheques ──────────────────────────────────────────────────────────────────
create table if not exists public.cheques (
  id                 uuid primary key default gen_random_uuid(),
  razon_social_id    uuid references public.razones_sociales(id) on delete set null,
  tipo               text not null check (tipo in ('recibido','emitido')), -- a cobrar / a pagar
  formato            text not null default 'fisico' check (formato in ('fisico','echeq')),
  banco              text,
  numero             text,
  importe            numeric(14,2) not null default 0,
  fecha_emision      date,
  fecha_pago         date,
  fecha_acreditacion date,
  estado             text not null default 'en_cartera',
  librador           text,
  cuit_librador      text,
  contraparte        text,
  concepto           text,
  observaciones      text,
  created_at         timestamptz not null default now()
);

create index if not exists cheques_fecha_pago_idx on public.cheques (fecha_pago);
create index if not exists cheques_tipo_idx        on public.cheques (tipo);

-- ── Seguridad (RLS): solo usuarios logueados leen/escriben ──────────────────
-- Modelo simple: una cuenta compartida (la tuya) que usás en la compu y el
-- celular. Sin sesión iniciada, nadie ve ni toca nada.
do $$
declare t text;
begin
  foreach t in array array['razones_sociales','bancos','cheques'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "acceso autenticado" on public.%I;', t);
    execute format('create policy "acceso autenticado" on public.%I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
