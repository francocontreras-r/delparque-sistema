-- ═══════════════════════════════════════════════════════════════════════════
--  REVISIÓN COMPLETA DE RECETAS  (solo lectura, no modifica nada)
-- ═══════════════════════════════════════════════════════════════════════════
--  Corré los bloques de a uno (o todo junto) y mirá los resultados.
--  El matcheo ignora mayúsculas, acentos y espacios (igual que la app).
--
--  Qué responde:
--    1) ¿Qué IMPULSIVOS / SABORES / BASES no tienen receta cargada?
--       (sin receta = la orden NO muestra insumos)
--    2) De los productos que se pueden ORDENAR (en cámara), ¿cuáles tienen
--       una receta vinculable por nombre? → esto predice si la orden mostrará MP.
--    3) ¿Qué ingredientes de las recetas NO matchean ningún insumo del depósito?
--       (se ven "SIN VINCULAR" y su costo se cuenta como $0 en Finanzas)
-- ═══════════════════════════════════════════════════════════════════════════

-- Normalizador reutilizable (minúsculas + sin acentos + espacios colapsados)
-- norm(x) = lower(regexp_replace(translate(btrim(x),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'))

-- ── RESULTADO 1A: IMPULSIVOS y su cantidad de ingredientes ───────────────────
select
  i.nombre as impulsivo,
  count(ii.insumo_nombre) as ingredientes,
  case when count(ii.insumo_nombre) = 0 then '❌ SIN RECETA' else '✅ ok' end as estado
from impulsivos i
left join impulsivo_ingredientes ii on ii.impulsivo_id = i.id
group by i.id, i.nombre
order by count(ii.insumo_nombre) asc, i.nombre;

-- ── RESULTADO 1B: SABORES y su cantidad de ingredientes ──────────────────────
select
  s.nombre as sabor,
  count(si.insumo_nombre) as ingredientes,
  case when count(si.insumo_nombre) = 0 then '❌ SIN RECETA' else '✅ ok' end as estado
from sabores s
left join sabor_ingredientes si on si.sabor_id = s.id
group by s.id, s.nombre
order by count(si.insumo_nombre) asc, s.nombre;

-- ── RESULTADO 1C: BASES y su cantidad de ingredientes ────────────────────────
select
  b.nombre as base,
  count(bi.insumo_nombre) as ingredientes,
  case when count(bi.insumo_nombre) = 0 then '❌ SIN RECETA' else '✅ ok' end as estado
from bases b
left join base_ingredientes bi on bi.base_id = b.id
group by b.id, b.nombre
order by count(bi.insumo_nombre) asc, b.nombre;

-- ── RESULTADO 2: IMPULSIVOS que se pueden ORDENAR (están en cámara) y si su ──
--    receta es vinculable por nombre. ❌ = la orden de ese impulsivo no mostrará MP.
select
  sc.nombre as producto_en_camara,
  case when exists (
    select 1
    from impulsivos i
    join impulsivo_ingredientes ii on ii.impulsivo_id = i.id
    where lower(regexp_replace(translate(btrim(i.nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'))
        = lower(regexp_replace(translate(btrim(sc.nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'))
  ) then '✅ tiene receta vinculable' else '❌ SIN receta vinculable' end as estado
from stock_camaras sc
where sc.tipo_producto = 'impulsivo'
order by estado, sc.nombre;

-- ── RESULTADO 3: ingredientes de recetas que NO matchean ningún insumo ───────
--    (excluye el agua, que es intencionalmente "sin control")
with cat as (
  select lower(regexp_replace(translate(btrim(nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g')) as n from insumos
),
ing as (
  select 'impulsivo' as origen, insumo_nombre,
         lower(regexp_replace(translate(btrim(insumo_nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g')) as n
  from impulsivo_ingredientes
  union all
  select 'sabor', insumo_nombre,
         lower(regexp_replace(translate(btrim(insumo_nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'))
  from sabor_ingredientes
  union all
  select 'base', insumo_nombre,
         lower(regexp_replace(translate(btrim(insumo_nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'))
  from base_ingredientes
)
select ing.origen, ing.insumo_nombre, count(*) as veces
from ing
where ing.n not like '%agua%'
  and not exists (select 1 from cat where cat.n = ing.n)
group by ing.origen, ing.insumo_nombre
order by ing.origen, ing.insumo_nombre;
