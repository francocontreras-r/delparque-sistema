-- ─────────────────────────────────────────────────────────────────────────────
-- Notificaciones automáticas (push al celular con la app cerrada + email).
-- Corré esto UNA vez en Supabase → SQL Editor del proyecto de Cheques.
-- Es seguro correrlo más de una vez.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Suscripciones de push (una por navegador/dispositivo que activa avisos)
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  email      text,
  endpoint   text unique not null,
  p256dh     text not null,
  auth       text not null,
  activo     boolean not null default true,
  created_at timestamptz default now()
);
alter table public.push_subscriptions enable row level security;
-- El alta/baja se hace desde el servidor (service_role), que salta RLS.
-- Igual dejamos que cada usuario vea las suyas por las dudas.
drop policy if exists "subs propias" on public.push_subscriptions;
create policy "subs propias" on public.push_subscriptions
  for select using (auth.uid() = user_id);

-- 2) Emails a los que enviar el aviso de la mañana
create table if not exists public.notif_emails (
  email      text primary key,
  activo     boolean not null default true,
  created_at timestamptz default now()
);
alter table public.notif_emails enable row level security;
drop policy if exists "emails lectura" on public.notif_emails;
create policy "emails lectura" on public.notif_emails
  for select using (auth.role() = 'authenticated');
-- La escritura va por el servidor (service_role) con chequeo de admin.

-- 3) Registro de hitos ya avisados (para no repetir)
create table if not exists public.notif_log (
  cheque_id text not null,
  hito      text not null,
  sent_at   timestamptz default now(),
  primary key (cheque_id, hito)
);
alter table public.notif_log enable row level security; -- solo service_role

-- 4) Configuración global (una sola fila)
create table if not exists public.notif_config (
  id           int primary key default 1,
  dias         int not null default 7,
  email_activo boolean not null default true
);
insert into public.notif_config (id) values (1) on conflict (id) do nothing;
alter table public.notif_config enable row level security;
drop policy if exists "config lectura" on public.notif_config;
create policy "config lectura" on public.notif_config for select using (true);

-- Listo. Ahora configurá las variables en Vercel (ver GUIA-NOTIFICACIONES.md).
