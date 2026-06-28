-- ═══════════════════════════════════════════════════════════════════════════
--  SEGURIDAD A NIVEL DE BASE (RLS) — Del Parque Sistema
-- ═══════════════════════════════════════════════════════════════════════════
--
--  POR QUÉ: hoy los permisos (operario/supervisor/admin) viven SOLO en el
--  frontend (esconden botones). La clave `anon` de Supabase es pública, así que
--  sin RLS cualquiera podría leer/escribir las tablas directo por la API.
--  RLS pone la "cerradura" en la base misma.
--
--  ⚠️  IMPORTANTE — LEÉ ESTO ANTES DE EJECUTAR:
--   1. PROBALO PRIMERO en un proyecto Supabase de staging / copia, NO en producción.
--   2. Al activar RLS, si una policy está mal, la app puede "dejar de ver" datos
--      o no poder escribir. Es reversible (ver el bloque ROLLBACK al final).
--   3. Las funciones serverless (/api) usan la service_role key y SALTEAN RLS:
--      esas siguen funcionando.
--   4. Esto es un BORRADOR base. Ajustá nombres de tablas/roles a tu esquema real.
--
--  MODELO DE ROLES: se lee de la tabla `user_profiles` (columna `rol`).
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Función helper: rol del usuario autenticado ──────────────────────────
-- SECURITY DEFINER para poder leer user_profiles sin recursión de RLS.
create or replace function public.auth_rol()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select rol from public.user_profiles where id = auth.uid()
$$;

-- ¿Es supervisor o admin? (puede escribir operaciones)
create or replace function public.es_gestion()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.auth_rol() in ('supervisor', 'admin'), false)
$$;

-- ¿Es admin?
create or replace function public.es_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.auth_rol() = 'admin', false)
$$;


-- ── 2. Perfiles de usuario ──────────────────────────────────────────────────
alter table public.user_profiles enable row level security;

-- Cada quien lee su propio perfil; admin lee todos.
create policy "user_profiles: lectura propia o admin"
  on public.user_profiles for select to authenticated
  using (id = auth.uid() or public.es_admin());

-- Solo admin crea/edita/borra perfiles.
create policy "user_profiles: gestion admin"
  on public.user_profiles for all to authenticated
  using (public.es_admin()) with check (public.es_admin());


-- ── 3. Tablas operativas ────────────────────────────────────────────────────
-- Patrón general:
--   • LECTURA: cualquier usuario autenticado.
--   • ESCRITURA (insert/update/delete): solo supervisor o admin.
-- Ajustá la lista de tablas a tu esquema real.

do $$
declare
  t text;
  -- Tablas con el patrón "lee cualquiera autenticado / escribe gestión":
  tablas text[] := array[
    'operarios',
    'productos_produccion',
    'producciones',
    'stock_camaras',
    'movimientos_deposito',
    'insumos',
    'ordenes_produccion',
    'sabores',
    'impulsivos',
    'bases',
    'sabor_ingredientes',
    'base_ingredientes'
  ];
begin
  foreach t in array tablas loop
    -- Activar RLS
    execute format('alter table public.%I enable row level security;', t);

    -- Limpiar policies previas con estos nombres (idempotente)
    execute format('drop policy if exists "%s: lectura autenticados" on public.%I;', t, t);
    execute format('drop policy if exists "%s: escritura gestion" on public.%I;', t, t);

    -- Lectura: cualquier autenticado
    execute format(
      'create policy "%s: lectura autenticados" on public.%I for select to authenticated using (true);',
      t, t);

    -- Escritura: supervisor o admin
    execute format(
      'create policy "%s: escritura gestion" on public.%I for all to authenticated using (public.es_gestion()) with check (public.es_gestion());',
      t, t);
  end loop;
end $$;


-- ── 4. NOTAS / PENDIENTES ───────────────────────────────────────────────────
--
--  • COSTOS / FINANZAS: las columnas de costo (sabores.costo_total, etc.) hoy
--    quedan legibles para cualquier autenticado. Si querés que SOLO supervisor/
--    admin vean costos, RLS no alcanza (es por fila, no por columna). Opciones:
--      a) crear una VISTA sin columnas de costo para operarios, o
--      b) usar GRANT/REVOKE a nivel de columna.
--    Decisión de negocio — avisá y lo armo.
--
--  • Si agregás tablas nuevas (mermas, recetas, postres, etc.), sumalas al array.
--
--  • Verificá DESPUÉS de aplicar: entrá con un usuario "operario" y confirmá que
--    puede ver lo que debe y NO puede editar finanzas/usuarios.
--
-- ── 5. ROLLBACK (si algo sale mal, desactiva RLS) ───────────────────────────
--  Ejecutá esto para volver atrás (deja las tablas SIN cerradura otra vez):
--
--  do $$
--  declare t text; tablas text[] := array['user_profiles','operarios',
--    'productos_produccion','producciones','stock_camaras','movimientos_deposito',
--    'insumos','ordenes_produccion','sabores','impulsivos','bases',
--    'sabor_ingredientes','base_ingredientes'];
--  begin
--    foreach t in array tablas loop
--      execute format('alter table public.%I disable row level security;', t);
--    end loop;
--  end $$;
-- ═══════════════════════════════════════════════════════════════════════════
