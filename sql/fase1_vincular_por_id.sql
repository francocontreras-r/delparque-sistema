-- ═══════════════════════════════════════════════════════════════════════════
--  FASE 1 — Vincular recetas ↔ insumos por ID (no por nombre)
--  Pegá todo y dale RUN. Es seguro: la columna es opcional (nullable), las
--  recetas siguen funcionando igual, y auto-vincula lo que ya matchea.
--
--  ⚠️ NOTA DE TIPO: abajo asumo que insumos.id es BIGINT (lo más común).
--     Si tu insumos.id es UUID, cambiá las 3 palabras "bigint" por "uuid".
--     (Si no sabés: corré  select pg_typeof(id) from insumos limit 1;)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Agregar la columna insumo_id (opcional, FK a insumos) ────────────────
alter table sabor_ingredientes     add column if not exists insumo_id bigint references insumos(id);
alter table base_ingredientes      add column if not exists insumo_id bigint references insumos(id);
alter table impulsivo_ingredientes add column if not exists insumo_id bigint references insumos(id);

-- ── 2) Auto-vincular por nombre normalizado (acentos/espacios/mayúsculas) ────
-- Sabores
update sabor_ingredientes si
set insumo_id = i.id
from insumos i
where si.insumo_id is null
  and lower(regexp_replace(translate(btrim(si.insumo_nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'))
    = lower(regexp_replace(translate(btrim(i.nombre),         'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'));

-- Bases
update base_ingredientes bi
set insumo_id = i.id
from insumos i
where bi.insumo_id is null
  and lower(regexp_replace(translate(btrim(bi.insumo_nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'))
    = lower(regexp_replace(translate(btrim(i.nombre),         'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'));

-- Impulsivos
update impulsivo_ingredientes ii
set insumo_id = i.id
from insumos i
where ii.insumo_id is null
  and lower(regexp_replace(translate(btrim(ii.insumo_nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'))
    = lower(regexp_replace(translate(btrim(i.nombre),         'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'));

-- ── 3) Verificación: ¿cuánto quedó vinculado y cuánto suelto? ───────────────
select 'sabor_ingredientes'      as receta,
       count(*) filter (where insumo_id is not null) as vinculados_por_id,
       count(*) filter (where insumo_id is null)     as sin_vincular
from sabor_ingredientes
union all
select 'base_ingredientes',
       count(*) filter (where insumo_id is not null),
       count(*) filter (where insumo_id is null)
from base_ingredientes
union all
select 'impulsivo_ingredientes',
       count(*) filter (where insumo_id is not null),
       count(*) filter (where insumo_id is null)
from impulsivo_ingredientes;

-- Nota: las líneas que queden "sin_vincular" son:
--   • Insumos con nombre que no matchea (los dudosos) → se mapean con el
--     desplegable que viene en el Paso 2.
--   • Líneas que en realidad son BASES o SABORES (la cascada) → se vinculan
--     en la Fase 2 (no son insumos).
-- ═══════════════════════════════════════════════════════════════════════════
