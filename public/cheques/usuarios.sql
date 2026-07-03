-- ═══════════════════════════════════════════════════════════════════════════
--  Cheques CIAF — Usuarios y permisos (Opción A: roles)
--  Roles: admin (todo + gestiona usuarios) · carga (ve y carga) · lectura (solo ve)
--  Pegá TODO en Supabase → SQL Editor → Run (elegí "Run and enable RLS" si pregunta).
--  Es idempotente. Cambiá el email de abajo por el tuyo si usás otro admin.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Tabla de perfiles (un perfil por usuario de Supabase Auth)
create table if not exists public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  rol        text not null default 'lectura' check (rol in ('admin','carga','lectura')),
  created_at timestamptz not null default now()
);

-- 2) Helper: rol del usuario logueado (SECURITY DEFINER evita recursión de RLS)
create or replace function public.rol_cheques()
returns text language sql security definer stable set search_path = public as $$
  select rol from public.perfiles where id = auth.uid()
$$;

-- 3) Alta automática de perfil cuando se crea un usuario nuevo en Supabase.
--    El dueño (email de abajo) queda admin; el resto arranca en 'lectura'.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, email, rol)
  values (new.id, new.email,
    case when new.email = 'francocontreras.ciaf@gmail.com' then 'admin' else 'lectura' end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Backfill: crear perfil para los usuarios que YA existen
insert into public.perfiles (id, email, rol)
select u.id, u.email,
  case when u.email = 'francocontreras.ciaf@gmail.com' then 'admin' else 'lectura' end
from auth.users u
on conflict (id) do nothing;

-- 5) Seguridad de la tabla perfiles
alter table public.perfiles enable row level security;
drop policy if exists "perfil select" on public.perfiles;
drop policy if exists "perfil insert propio" on public.perfiles;
drop policy if exists "perfil admin update" on public.perfiles;
create policy "perfil select" on public.perfiles for select to authenticated
  using (id = auth.uid() or public.rol_cheques() = 'admin');
create policy "perfil insert propio" on public.perfiles for insert to authenticated
  with check (id = auth.uid());
create policy "perfil admin update" on public.perfiles for update to authenticated
  using (public.rol_cheques() = 'admin') with check (public.rol_cheques() = 'admin');

-- 6) Seguridad de los cheques: TODOS los logueados LEEN; solo admin/carga ESCRIBEN
do $$
declare t text;
begin
  foreach t in array array['razones_sociales','bancos','cheques'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "acceso autenticado" on public.%I;', t);
    execute format('drop policy if exists "cheques lectura" on public.%I;', t);
    execute format('drop policy if exists "cheques escritura" on public.%I;', t);
    execute format('create policy "cheques lectura" on public.%I for select to authenticated using (true);', t);
    execute format('create policy "cheques escritura" on public.%I for all to authenticated using (public.rol_cheques() in (''admin'',''carga'')) with check (public.rol_cheques() in (''admin'',''carga''));', t);
  end loop;
end $$;
