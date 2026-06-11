-- ============================================================================
-- Migración pendiente — Del Parque ERP
-- Ejecutar UNA VEZ en Supabase → SQL Editor (no se puede aplicar desde la app
-- porque PostgREST/supabase-js no permite DDL arbitrario).
--
-- Después de correr esto, ejecutar los seeds correspondientes:
--   node --env-file=.env src/scripts/seedBases.js
--   node --env-file=.env src/scripts/seedImpulsivosPostres.js
-- ============================================================================

-- ── 1) Recetas → tab "Bases" ───────────────────────────────────────────────
create table if not exists bases (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  litros_batch integer not null default 120
);

create table if not exists base_ingredientes (
  id bigint generated always as identity primary key,
  base_id bigint not null references bases(id) on delete cascade,
  insumo_nombre text not null,
  cantidad numeric not null,
  unidad text not null
);

-- ── 2) Cámaras → impulsivos/postres + número de lote ───────────────────────
ALTER TABLE stock_camaras ADD COLUMN IF NOT EXISTS lote text;
ALTER TABLE stock_camaras ADD COLUMN IF NOT EXISTS tipo_producto text DEFAULT 'helado';

-- ── 3) Depósito → valuación de stock ───────────────────────────────────────
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS costo_unitario numeric DEFAULT 0;

-- ── 4) Producción → observaciones por registro ─────────────────────────────
ALTER TABLE producciones ADD COLUMN IF NOT EXISTS observaciones text;
