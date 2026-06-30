-- ════════════════════════════════════════════════════════════════════════════
-- ETAPAS DE PRODUCCIÓN — Del Parque
-- Modela el proceso multi-etapa de postres / impulsivos (moldeado, abatidor,
-- desmolde, baño, decoración…) para medir el TIEMPO ACTIVO real del operario
-- contra un tiempo estándar, separando la ESPERA de proceso (abatidor/cámara)
-- que NO es trabajo humano.
--
-- Correr una sola vez en Supabase (SQL Editor). Es idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Configuración de etapas por tipo de producto ──────────────────────────
-- Define qué etapas tiene cada tipo de producto, su orden, si es trabajo activo
-- o espera, y el tiempo estándar de mano de obra POR UNIDAD (minutos).
-- producto_nombre = NULL → aplica a todo el tipo. Con nombre → override puntual.
create table if not exists producto_etapas (
  id                bigint generated always as identity primary key,
  tipo_producto     text    not null,            -- 'postre' | 'impulsivo' | 'helado'
  producto_nombre   text,                         -- NULL = default del tipo
  etapa_orden       int     not null,            -- 1,2,3… orden del proceso
  etapa_nombre      text    not null,
  es_activa         boolean not null default true, -- false = espera (abatidor/cámara)
  estandar_min_unidad numeric not null default 0,  -- minutos estándar por unidad
  activo            boolean not null default true,
  created_at        timestamptz default now()
);

-- Unicidad por tipo+producto+orden. Va como índice (no constraint) porque usa
-- una expresión (coalesce) que UNIQUE de tabla no admite.
create unique index if not exists ux_producto_etapas
  on producto_etapas (tipo_producto, coalesce(producto_nombre, ''), etapa_orden);

-- ── 2) Etapas registradas de cada orden ──────────────────────────────────────
-- Una fila por etapa de cada orden. El operario marca inicio/fin; el tiempo
-- estándar se "fotografía" al crear la fila (estandar_min = estandar_min_unidad
-- × unidades) para que los informes no dependan de la config futura.
create table if not exists orden_etapas (
  id              bigint generated always as identity primary key,
  orden_id        bigint  references ordenes_produccion(id) on delete cascade,
  orden_numero    text,
  tipo_producto   text,
  etapa_orden     int     not null,
  etapa_nombre    text    not null,
  es_activa       boolean not null default true,
  es_cierre       boolean not null default false,  -- última etapa activa (entrega la unidad)
  operario_nombre text,
  unidades        int,
  inicio          timestamptz,
  fin             timestamptz,
  tiempo_min      numeric,                         -- real = fin - inicio (solo activas)
  estandar_min    numeric default 0,               -- estándar total de la etapa (snapshot)
  created_at      timestamptz default now()
);

create index if not exists idx_orden_etapas_orden    on orden_etapas (orden_id);
create index if not exists idx_orden_etapas_operario on orden_etapas (operario_nombre);
create index if not exists idx_orden_etapas_inicio   on orden_etapas (inicio);

-- ── 3) Semilla de etapas por defecto (ajustá los tiempos estándar) ───────────
-- Los estandar_min_unidad son un punto de partida razonable; revisalos con tus
-- tiempos reales. Solo inserta si no existe config para ese tipo.
insert into producto_etapas (tipo_producto, etapa_orden, etapa_nombre, es_activa, estandar_min_unidad)
select * from (values
  ('postre', 1, 'Moldeado',          true,  0.75),
  ('postre', 2, 'Abatidor / Cámara', false, 0.00),
  ('postre', 3, 'Desmolde',          true,  0.50),
  ('postre', 4, 'Baño',              true,  0.375),
  ('postre', 5, 'Decoración',        true,  0.55),
  ('impulsivo', 1, 'Elaboración',      true,  0.40),
  ('impulsivo', 2, 'Abatidor / Cámara', false, 0.00),
  ('impulsivo', 3, 'Empaque',          true,  0.25)
) as v(tipo_producto, etapa_orden, etapa_nombre, es_activa, estandar_min_unidad)
where not exists (
  select 1 from producto_etapas pe
  where pe.tipo_producto = v.tipo_producto and pe.producto_nombre is null
);

-- ── 4) RLS (alinear con el resto del sistema cuando se active) ────────────────
-- Por ahora se dejan accesibles; cuando apliques rls_policies.sql, sumá estas
-- dos tablas a la lista con las mismas políticas de lectura/escritura.
alter table producto_etapas enable row level security;
alter table orden_etapas    enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'producto_etapas' and policyname = 'producto_etapas_all') then
    create policy producto_etapas_all on producto_etapas for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'orden_etapas' and policyname = 'orden_etapas_all') then
    create policy orden_etapas_all on orden_etapas for all using (true) with check (true);
  end if;
end $$;
