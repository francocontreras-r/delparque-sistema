-- ============================================================================
-- Migración pendiente — Del Parque ERP
-- Ejecutar UNA VEZ en Supabase → SQL Editor (no se puede aplicar desde la app
-- porque PostgREST/supabase-js no permite DDL arbitrario).
--
-- Después de correr esto, ejecutar los seeds correspondientes:
--   node --env-file=.env src/scripts/seedBases.js
--   node --env-file=.env src/scripts/seedImpulsivosPostres.js
--   node --env-file=.env src/scripts/seedMovimientosDeposito.js
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

-- ── 5) Depósito → alta de movimientos (ingreso/egreso) ─────────────────────
-- La tabla movimientos_deposito existe pero le faltan las columnas que usa
-- la pantalla Depósito (y el seed de la planilla de Salud Pública).
ALTER TABLE movimientos_deposito ADD COLUMN IF NOT EXISTS producto_nombre text;
ALTER TABLE movimientos_deposito ADD COLUMN IF NOT EXISTS lote text;
ALTER TABLE movimientos_deposito ADD COLUMN IF NOT EXISTS controlo text;
ALTER TABLE movimientos_deposito ADD COLUMN IF NOT EXISTS proveedor text;
ALTER TABLE movimientos_deposito ADD COLUMN IF NOT EXISTS operario_recibe text;

-- ── 6) Producción → escaneo/registro y reportes de Rendimientos ───────────
-- La pantalla Producción (escaneo EAN-13) y el Informe del Día de
-- Rendimientos usan estas columnas, que faltan en la tabla actual.
ALTER TABLE producciones ADD COLUMN IF NOT EXISTS producto_codigo integer;
ALTER TABLE producciones ADD COLUMN IF NOT EXISTS producto_nombre text;
ALTER TABLE producciones ADD COLUMN IF NOT EXISTS operario_nombre text;
ALTER TABLE producciones ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
