-- ═══════════════════════════════════════════════════════════════════════════
--  HISTORIAL DE COSTOS — Del Parque Sistema
-- ═══════════════════════════════════════════════════════════════════════════
--
--  POR QUÉ: hoy `insumos.costo_unitario` se PISA en cada compra (y en cada
--  edición manual). Con inflación eso borra la historia: no se puede ver cuánto
--  subió la harina, el dulce de leche, etc. Esta tabla guarda cada cambio de
--  costo (anterior → nuevo, % de variación, origen) para poder medir la inflación
--  real de la materia prima en el tiempo.
--
--  La app funciona sin esta tabla (degradación segura en src/lib/historialCostos.js);
--  correr este SQL enciende la captura y la vista "Historial" en Finanzas.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.costos_historicos (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null default 'insumo',   -- 'insumo' | 'sabor' | 'impulsivo' | 'base'
  item_nombre   text not null,
  costo_anterior numeric,                          -- null si es la primera carga
  costo_nuevo   numeric not null,
  variacion_pct numeric,                           -- (nuevo-anterior)/anterior*100
  origen        text default 'compra',             -- 'compra' | 'edicion_manual' | 'recalculo'
  fecha         date not null default current_date,
  created_at    timestamptz not null default now()
);

create index if not exists ix_costos_hist_item  on public.costos_historicos (item_nombre, fecha);
create index if not exists ix_costos_hist_fecha  on public.costos_historicos (fecha);

-- ── RLS (coherente con sql/rls_policies.sql) ────────────────────────────────
-- Lee gestión (supervisor/admin); inserta cualquier autenticado (la captura
-- ocurre cuando se registra una compra o se edita un costo).
alter table public.costos_historicos enable row level security;
drop policy if exists "costos_historicos: lectura gestion" on public.costos_historicos;
drop policy if exists "costos_historicos: insertar autenticados" on public.costos_historicos;
create policy "costos_historicos: lectura gestion"
  on public.costos_historicos for select to authenticated using (public.es_gestion());
create policy "costos_historicos: insertar autenticados"
  on public.costos_historicos for insert to authenticated with check (true);
