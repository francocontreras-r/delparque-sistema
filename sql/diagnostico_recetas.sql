-- ═══════════════════════════════════════════════════════════════════════════
--  DIAGNÓSTICO DE VINCULACIÓN DE RECETAS  (solo lectura, no modifica nada)
-- ═══════════════════════════════════════════════════════════════════════════
--  Responde: ¿cada ingrediente de cada receta matchea con algo real?
--  Clasifica cada línea como:
--    • OK insumo        → existe en `insumos` (correcto)
--    • es SABOR         → en realidad es un sabor cargado como si fuera insumo
--    • es BASE          → en realidad es una base
--    • es IMPULSIVO     → en realidad es otro semielaborado (ej. Masa Cubanito)
--    • agua             → no se controla (intencional)
--    • SIN MATCH        → no existe en ningún catálogo (typo / falta cargar)
--
--  El matcheo ignora mayúsculas, acentos y espacios de más (igual que la app).
--  Si alguna tabla/columna tiene otro nombre en tu esquema, avisame y lo ajusto.
--
--  IMPACTO DOBLE de las líneas con problema:
--    • PRODUCCIÓN/DEPÓSITO: no se controla el stock de ese ingrediente.
--    • FINANZAS: su costo se suma como $0 → el producto cuesta menos de lo
--      real → margen inflado. (Finanzas usa el mismo matcheo por nombre.)
-- ═══════════════════════════════════════════════════════════════════════════

with
-- Normalizador: minúsculas + sin acentos + espacios colapsados
catalogo as (
  select 'insumo'    as tipo, lower(regexp_replace(translate(btrim(nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g')) as n from insumos
  union all
  select 'base'      as tipo, lower(regexp_replace(translate(btrim(nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g')) from bases
  union all
  select 'sabor'     as tipo, lower(regexp_replace(translate(btrim(nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g')) from sabores
  union all
  select 'impulsivo' as tipo, lower(regexp_replace(translate(btrim(nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g')) from impulsivos
),
ingredientes as (
  select 'base_ingredientes'      as origen, insumo_nombre, lower(regexp_replace(translate(btrim(insumo_nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g')) as n from base_ingredientes
  union all
  select 'sabor_ingredientes'     as origen, insumo_nombre, lower(regexp_replace(translate(btrim(insumo_nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'))      from sabor_ingredientes
  union all
  select 'impulsivo_ingredientes' as origen, insumo_nombre, lower(regexp_replace(translate(btrim(insumo_nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'))      from impulsivo_ingredientes
),
clasificado as (
  select
    i.origen, i.insumo_nombre, i.n,
    case
      when i.n like '%agua%'                                              then 'agua'
      when exists (select 1 from catalogo c where c.n = i.n and c.tipo='insumo')    then 'OK insumo'
      when exists (select 1 from catalogo c where c.n = i.n and c.tipo='sabor')     then 'es SABOR'
      when exists (select 1 from catalogo c where c.n = i.n and c.tipo='base')      then 'es BASE'
      when exists (select 1 from catalogo c where c.n = i.n and c.tipo='impulsivo') then 'es IMPULSIVO'
      else 'SIN MATCH'
    end as estado
  from ingredientes i
)

-- ── RESULTADO 1: resumen (cuántas líneas de cada tipo) ──────────────────────
select origen, estado, count(*) as lineas
from clasificado
group by origen, estado
order by origen, estado;

-- ── RESULTADO 2: detalle de lo que hay que corregir ─────────────────────────
-- (descomentá para ver el listado exacto de nombres problemáticos)
-- select estado, origen, insumo_nombre, count(*) as veces
-- from clasificado
-- where estado not in ('OK insumo', 'agua')
-- group by estado, origen, insumo_nombre
-- order by estado, veces desc;

-- ── RESULTADO 3: sabores cuya BASE no matchea ninguna base real ─────────────
-- select s.nombre as sabor, s.base_nombre
-- from sabores s
-- where coalesce(btrim(s.base_nombre),'') <> ''
--   and not exists (
--     select 1 from bases b
--     where lower(regexp_replace(translate(btrim(b.nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'))
--         = lower(regexp_replace(translate(btrim(s.base_nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'))
--   );
