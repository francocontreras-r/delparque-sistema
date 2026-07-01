-- ═══════════════════════════════════════════════════════════════════════════
--  SEGURIDAD A NIVEL DE BASE (RLS) — Del Parque Sistema
-- ═══════════════════════════════════════════════════════════════════════════
--
--  POR QUÉ: hoy los permisos (operario/supervisor/admin) viven SOLO en el
--  frontend (esconden botones y rutas). La clave `anon` de Supabase viaja en el
--  bundle público, así que SIN RLS cualquiera con esa clave puede leer/escribir
--  TODAS las tablas directo por la API REST, salteándose la app. RLS pone la
--  "cerradura" en la base misma: sin sesión iniciada, no se ve ni se toca nada.
--
--  MODELO DE ROLES: se lee de `user_profiles.rol` ('operario'|'supervisor'|'admin')
--  con `id = auth.uid()` (idéntico a como lo usa el frontend en UserContext.jsx).
--
--  ⚠️  ANTES DE EJECUTAR — LEÉ ESTO:
--   1. Ideal: probarlo en un proyecto Supabase de staging. Si solo hay
--      producción, corré esto en un horario de baja actividad y tené a mano el
--      bloque ROLLBACK del final (desactiva RLS al instante).
--   2. Las funciones serverless (/api) usan la service_role key y SALTEAN RLS:
--      siguen funcionando igual.
--   3. Todo es idempotente: se puede correr varias veces sin romper nada.
--
--  DISEÑO POR NIVELES (refleja QUIÉN escribe cada tabla en la app real):
--   • OPERACIÓN  → lee/escribe cualquier usuario autenticado. Son las tablas del
--     piso de planta que el OPERARIO toca de verdad (producción, cámara, mermas,
--     etapas, alta de operarios/productos al vuelo). Si estas fueran "solo
--     gestión", se rompería el flujo de producción.
--   • GESTIÓN    → lee cualquier autenticado, escribe solo supervisor/admin. Son
--     datos maestros y recetas que el operario NUNCA edita (no tiene el módulo).
--   • FINANZAS   → lee y escribe solo admin (costos y precios).
--   • PERFILES   → cada uno ve el suyo; solo admin gestiona usuarios.
--   • AUDITORÍA  → cualquiera inserta (deja rastro); solo admin lee el log.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Funciones helper: rol del usuario autenticado ────────────────────────
-- SECURITY DEFINER para leer user_profiles sin recursión de RLS.
create or replace function public.auth_rol()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select rol from public.user_profiles where id = auth.uid()
$$;

create or replace function public.es_gestion()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.auth_rol() in ('supervisor', 'admin'), false)
$$;

create or replace function public.es_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.auth_rol() = 'admin', false)
$$;


-- ── 2. NIVEL OPERACIÓN: lee/escribe cualquier autenticado ───────────────────
-- El operario escribe estas en su día a día (Producción / Cámaras).
do $$
declare
  t text;
  tablas text[] := array[
    'operarios',            -- alta/baja de operario al vuelo desde Producción
    'productos_produccion', -- seed de productos desde Producción
    'producciones',
    'stock_camaras',
    'movimientos_camara',
    'ordenes_produccion',   -- el operario marca la orden como producida
    'orden_etapas',         -- captura de etapas (moldeado, abatidor, desmolde…)
    'stock_bases',
    'mermas',
    'temperaturas_camaras',
    'conteos_stock'
  ];
begin
  foreach t in array tablas loop
    if to_regclass('public.' || t) is null then
      raise notice 'OPERACIÓN: tabla % no existe, se omite', t; continue;
    end if;
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%s: lectura autenticados" on public.%I;', t, t);
    execute format('drop policy if exists "%s: escritura autenticados" on public.%I;', t, t);
    execute format('drop policy if exists "%s: escritura gestion" on public.%I;', t, t);
    execute format(
      'create policy "%s: lectura autenticados" on public.%I for select to authenticated using (true);', t, t);
    execute format(
      'create policy "%s: escritura autenticados" on public.%I for all to authenticated using (true) with check (true);', t, t);
  end loop;
end $$;


-- ── 3. NIVEL GESTIÓN: lee autenticado / escribe supervisor o admin ──────────
-- Datos maestros y recetas. El operario no tiene estos módulos (Depósito,
-- Recetas, Órdenes), así que restringir la escritura no rompe su flujo.
do $$
declare
  t text;
  tablas text[] := array[
    'insumos',
    'movimientos_deposito',
    'proveedores',
    'bases',
    'sabores',
    'impulsivos',
    'base_ingredientes',
    'sabor_ingredientes',
    'impulsivo_ingredientes',
    'producto_etapas'       -- tiempos estándar por producto/etapa (config)
  ];
begin
  foreach t in array tablas loop
    if to_regclass('public.' || t) is null then
      raise notice 'GESTIÓN: tabla % no existe, se omite', t; continue;
    end if;
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%s: lectura autenticados" on public.%I;', t, t);
    execute format('drop policy if exists "%s: escritura autenticados" on public.%I;', t, t);
    execute format('drop policy if exists "%s: escritura gestion" on public.%I;', t, t);
    execute format(
      'create policy "%s: lectura autenticados" on public.%I for select to authenticated using (true);', t, t);
    execute format(
      'create policy "%s: escritura gestion" on public.%I for all to authenticated using (public.es_gestion()) with check (public.es_gestion());', t, t);
  end loop;
end $$;


-- ── 4. NIVEL FINANZAS: lee y escribe solo admin ─────────────────────────────
-- Costos indirectos y precios históricos. Solo el módulo Finanzas (admin) los usa.
do $$
declare
  t text;
  tablas text[] := array['cif_config', 'precios_historicos'];
begin
  foreach t in array tablas loop
    if to_regclass('public.' || t) is null then
      raise notice 'FINANZAS: tabla % no existe, se omite', t; continue;
    end if;
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%s: solo admin" on public.%I;', t, t);
    execute format(
      'create policy "%s: solo admin" on public.%I for all to authenticated using (public.es_admin()) with check (public.es_admin());', t, t);
  end loop;
end $$;


-- ── 5. PERFILES DE USUARIO ──────────────────────────────────────────────────
alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles: lectura propia o admin" on public.user_profiles;
drop policy if exists "user_profiles: gestion admin" on public.user_profiles;

-- Cada quien lee su propio perfil; admin lee todos.
create policy "user_profiles: lectura propia o admin"
  on public.user_profiles for select to authenticated
  using (id = auth.uid() or public.es_admin());

-- Solo admin crea/edita/borra perfiles.
create policy "user_profiles: gestion admin"
  on public.user_profiles for all to authenticated
  using (public.es_admin()) with check (public.es_admin());


-- ── 6. AUDITORÍA: cualquiera inserta, solo admin lee ────────────────────────
do $$
begin
  if to_regclass('public.audit_log') is not null then
    alter table public.audit_log enable row level security;
    drop policy if exists "audit_log: insertar autenticados" on public.audit_log;
    drop policy if exists "audit_log: lectura admin" on public.audit_log;
    create policy "audit_log: insertar autenticados"
      on public.audit_log for insert to authenticated with check (true);
    create policy "audit_log: lectura admin"
      on public.audit_log for select to authenticated using (public.es_admin());
  end if;
end $$;


-- ── 7. VERIFICACIÓN (después de aplicar) ────────────────────────────────────
--  a) Confirmá qué tablas quedaron con RLS activo:
--       select relname, relrowsecurity from pg_class
--       where relnamespace = 'public'::regnamespace and relkind = 'r'
--       order by relname;
--  b) Entrá a la app con un usuario 'operario' y verificá que:
--       - puede registrar producción y movimientos de cámara (OK),
--       - NO ve Finanzas/Usuarios (ya bloqueado por el frontend),
--       - aunque forzara la API, no puede escribir insumos/recetas/finanzas.
--  c) Entrá con 'admin' y confirmá que todo sigue funcionando.
--
--  NOTA (costos visibles): las columnas de costo en tablas de GESTIÓN (ej.
--  insumos.costo_unitario) quedan LEGIBLES para cualquier autenticado. RLS es por
--  fila, no por columna. Si se quisiera ocultar costos al operario, se hace con
--  una VISTA sin esas columnas o GRANT/REVOKE por columna — avisá y lo armo.
--
-- ── 8. ROLLBACK (si algo falla, desactiva RLS en todo) ──────────────────────
--  do $$
--  declare t text; tablas text[] := array[
--    'user_profiles','operarios','productos_produccion','producciones',
--    'stock_camaras','movimientos_camara','ordenes_produccion','orden_etapas',
--    'stock_bases','mermas','temperaturas_camaras','conteos_stock','insumos',
--    'movimientos_deposito','proveedores','bases','sabores','impulsivos',
--    'base_ingredientes','sabor_ingredientes','impulsivo_ingredientes',
--    'producto_etapas','cif_config','precios_historicos','audit_log'];
--  begin
--    foreach t in array tablas loop
--      if to_regclass('public.'||t) is not null then
--        execute format('alter table public.%I disable row level security;', t);
--      end if;
--    end loop;
--  end $$;
-- ═══════════════════════════════════════════════════════════════════════════
