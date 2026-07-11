-- ═══════════════════════════════════════════════════════════════════════════
--  Tabla consumos_base — Del Parque Sistema
-- ═══════════════════════════════════════════════════════════════════════════
--
--  QUÉ: registra la vinculación manual "este producto consumió X kg de este lote
--  de base". Deja la trazabilidad base → producto → orden → operario → kg que el
--  descuento automático no siempre logra (orden completada sin cargar en
--  Producción, ventana de 4 días, nombre que no matchea, etc.).
--
--  DÓNDE SE USA: botón "🔗 Vincular" en "Stock de Bases Disponible" (Órdenes).
--  Al vincular, la app inserta una fila acá y descuenta kg de stock_bases.
--
--  Correr en el proyecto Supabase de la HELADERÍA. Es idempotente.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.consumos_base (
  id            bigint generated always as identity primary key,
  base_lote_id  bigint references public.stock_bases(id) on delete set null,
  base_nombre   text not null,
  producto_nombre text not null,
  tipo_producto text,                       -- helado | impulsivo | postre
  orden_id      bigint,
  orden_numero  text,
  kg_consumidos numeric not null check (kg_consumidos > 0),
  operario_nombre text,
  fecha         date not null default current_date,
  usuario_email text,
  created_at    timestamptz default now()
);

create index if not exists idx_consumos_base_lote  on public.consumos_base(base_lote_id);
create index if not exists idx_consumos_base_fecha on public.consumos_base(fecha);

-- RLS: mismo criterio que el resto de las tablas operativas (ver rls_policies.sql):
-- solo usuarios autenticados leen/escriben.
alter table public.consumos_base enable row level security;

drop policy if exists "consumos_base: lectura autenticados"  on public.consumos_base;
drop policy if exists "consumos_base: escritura autenticados" on public.consumos_base;

create policy "consumos_base: lectura autenticados"
  on public.consumos_base for select to authenticated using (true);
create policy "consumos_base: escritura autenticados"
  on public.consumos_base for all to authenticated using (true) with check (true);
