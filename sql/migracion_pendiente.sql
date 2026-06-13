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

-- ── 7) Producción → carga manual ───────────────────────────────────────────
ALTER TABLE producciones ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE producciones ADD COLUMN IF NOT EXISTS origen text DEFAULT 'escaneo';

-- ── 8) Órdenes → múltiples productos por orden (helados / impulsivos) ──────
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS tipo_producto text DEFAULT 'helado';
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS cantidad_unidades integer;

-- ── 9) Depósito → hora de cada movimiento ──────────────────────────────────
ALTER TABLE movimientos_deposito ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- ── 10) Finanzas → costo de mano de obra y precio de venta ─────────────────
ALTER TABLE sabores ADD COLUMN IF NOT EXISTS costo_materiales numeric DEFAULT 0;
ALTER TABLE sabores ADD COLUMN IF NOT EXISTS mano_de_obra numeric DEFAULT 0;
ALTER TABLE sabores ADD COLUMN IF NOT EXISTS costo_total numeric DEFAULT 0;
ALTER TABLE sabores ADD COLUMN IF NOT EXISTS precio_venta numeric DEFAULT 0;
ALTER TABLE impulsivos ADD COLUMN IF NOT EXISTS precio_venta numeric DEFAULT 0;

-- ── 11) Usuarios y permisos (RBAC) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid references auth.users(id) primary key,
  nombre text,
  email text,
  rol text default 'operario',
  permisos jsonb default '{}',
  activo boolean default true,
  created_at timestamptz default now()
);

-- Crea el perfil admin para los usuarios que ya existían antes de este módulo
-- (por ejemplo, la cuenta del dueño). Los usuarios nuevos se crean ya con
-- perfil desde la pantalla Usuarios.
INSERT INTO user_profiles (id, nombre, email, rol)
SELECT id, email, email, 'admin' FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ── 12) Depósito → stock máximo por insumo (barra de nivel de 3 zonas) ─────
ALTER TABLE insumos ADD COLUMN IF NOT EXISTS stock_maximo numeric DEFAULT 0;
NOTIFY pgrst, 'reload schema';

-- ── 13) Producción → sabores faltantes para el nuevo formato de código EAN ─
-- Requiere un constraint único en "codigo" para que el ON CONFLICT funcione.
ALTER TABLE productos_produccion ADD CONSTRAINT IF NOT EXISTS productos_produccion_codigo_key UNIQUE (codigo);

INSERT INTO productos_produccion (codigo, nombre, categoria) VALUES
(50, 'FRUTILLA AL AGUA', 'helado'),
(51, 'MANZANA', 'helado'),
(52, 'CANELA', 'helado'),
(53, 'FRUTOS PATAGONICOS', 'helado'),
(54, 'LIMON AGUA', 'helado'),
(55, 'DURAZNO', 'helado'),
(56, 'ANANA', 'helado'),
(57, 'NARANJA', 'helado')
ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre;

NOTIFY pgrst, 'reload schema';

-- ── 14) Órdenes → seguimiento de producción escaneada (kg objetivo/producido) ─
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS kg_objetivo numeric DEFAULT 0;
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS kg_producido numeric DEFAULT 0;
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS porcentaje_completitud numeric DEFAULT 0;

NOTIFY pgrst, 'reload schema';

-- ── 15) Órdenes → media preparación (batches fraccionarios, ej. 0.5) ───────
ALTER TABLE ordenes_produccion ALTER COLUMN batches TYPE numeric;

NOTIFY pgrst, 'reload schema';

-- ── 16) Órdenes → fechas de inicio/fin para medir productividad ───────────
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS fecha_inicio date;
ALTER TABLE ordenes_produccion ADD COLUMN IF NOT EXISTS fecha_fin date;

NOTIFY pgrst, 'reload schema';

-- ── 17) Control de stock semanal: historial de conteos físicos ────────────
CREATE TABLE IF NOT EXISTS conteos_stock (
  id bigserial primary key,
  tipo text, -- 'camara' o 'deposito'
  producto_nombre text,
  stock_sistema numeric,
  stock_fisico numeric,
  diferencia numeric,
  responsable text,
  fecha timestamptz default now(),
  observaciones text
);

NOTIFY pgrst, 'reload schema';

-- ── 18) Postres Mini → alta en tabla impulsivos ────────────────────────────
INSERT INTO impulsivos (nombre, costo_materiales, mano_de_obra, costo_total)
VALUES
  ('Mini Barra Almendrado', 6031.42, 285, 6316.42),
  ('Mini Barra Tricolor', 5815.93, 456, 6271.93),
  ('Mini Pionono', 5916.42, 285, 6201.42)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
