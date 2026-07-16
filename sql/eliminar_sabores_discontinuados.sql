-- ═══════════════════════════════════════════════════════════════════════════
--  Eliminar sabores discontinuados de TODOS los módulos
--  ───────────────────────────────────────────────────────────────────────────
--  Sabores a quitar:
--     · Moscatel al rhum
--     · Café irlandés
--     · Strudell manzana
--     · Maracuyá
--     · Pomelo rosado
--     · Coco
--
--  QUÉ HACE: los saca como ítems ACTUALES de Recetas, Finanzas, Producción,
--  Órdenes y Cámaras (tablas maestras + stock + catálogo de producción).
--
--  QUÉ NO TOCA: el historial de producción (`producciones`) ni los movimientos
--  de cámara (`movimientos_camara`), para que los informes/estadísticas pasados
--  sigan cuadrando. Si TAMBIÉN querés borrar ese historial, descomentá el bloque
--  OPCIONAL del final.
--
--  Correr en el proyecto Supabase de la HELADERÍA. Es transaccional e idempotente
--  (si ya no existen, no borra nada).
-- ───────────────────────────────────────────────────────────────────────────
begin;

-- Patrones (sin distinguir mayúsculas/acentos de más) que identifican a cada sabor.
create temporary table _disc (patron text) on commit drop;
insert into _disc (patron) values
  ('moscatel%'),   -- Moscatel al rhum
  ('%irland%'),    -- Café irlandés / Cafe Irlandes
  ('strudel%'),    -- Strudell manzana / Strudel manzana
  ('maracuy%'),    -- Maracuya / Maracuyá
  ('pomelo%'),     -- Pomelo Rosado
  ('coco');        -- Coco (exacto, para no tocar otros sabores)

-- 1) Ingredientes de esos sabores (hijos de `sabores`)
delete from public.sabor_ingredientes si
 using public.sabores s
 where si.sabor_id = s.id
   and exists (select 1 from _disc d where lower(trim(s.nombre)) like d.patron);

-- 2) Los sabores (Recetas · Finanzas · Órdenes)
delete from public.sabores s
 where exists (select 1 from _disc d where lower(trim(s.nombre)) like d.patron);

-- 3) Catálogo de Producción
delete from public.productos_produccion p
 where exists (select 1 from _disc d where lower(trim(p.nombre)) like d.patron);

-- 4) Stock actual en Cámaras
delete from public.stock_camaras c
 where exists (select 1 from _disc d where lower(trim(coalesce(c.nombre, ''))) like d.patron);

commit;

-- ═══════════════════════════════════════════════════════════════════════════
--  OPCIONAL — borrar TAMBIÉN el historial de esos sabores (descomentá si querés).
--  Ojo: esto reescribe informes/estadísticas pasadas.
-- ───────────────────────────────────────────────────────────────────────────
-- begin;
-- create temporary table _disc2 (patron text) on commit drop;
-- insert into _disc2 (patron) values
--   ('moscatel%'), ('%irland%'), ('strudel%'), ('maracuy%'), ('pomelo%'), ('coco');
--
-- delete from public.movimientos_camara m
--  where exists (select 1 from _disc2 d where
--        lower(trim(coalesce(m.sabor_nombre, '')))    like d.patron
--     or lower(trim(coalesce(m.producto_nombre, ''))) like d.patron
--     or lower(trim(coalesce(m.nombre, '')))          like d.patron);
--
-- delete from public.producciones pr
--  where exists (select 1 from _disc2 d where
--        lower(trim(coalesce(pr.sabor_nombre, '')))    like d.patron
--     or lower(trim(coalesce(pr.producto_nombre, ''))) like d.patron);
--
-- delete from public.ordenes_produccion o
--  where exists (select 1 from _disc2 d where
--        lower(trim(coalesce(o.sabor_nombre, '')))    like d.patron
--     or lower(trim(coalesce(o.producto_nombre, ''))) like d.patron
--     or lower(trim(coalesce(o.nombre, '')))          like d.patron);
-- commit;
