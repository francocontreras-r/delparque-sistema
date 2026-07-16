-- ═══════════════════════════════════════════════════════════════════════════
--  Eliminar sabores discontinuados de TODOS los módulos
--  ───────────────────────────────────────────────────────────────────────────
--  Sabores a quitar: Moscatel al rhum · Café irlandés · Strudell manzana ·
--                    Maracuyá · Pomelo rosado · Coco
--
--  Los saca como ítems ACTUALES de Recetas, Finanzas, Producción, Órdenes y
--  Cámaras. NO toca el historial (`producciones` / `movimientos_camara`); ver el
--  bloque OPCIONAL al final.
--
--  Correr en el proyecto Supabase de la HELADERÍA. Transaccional e idempotente.
--  (Sin tablas temporales: el editor de Supabase no las conserva entre sentencias.)
-- ───────────────────────────────────────────────────────────────────────────
begin;

-- 1) Ingredientes de esos sabores (hijos de `sabores`)
delete from public.sabor_ingredientes si using public.sabores s
 where si.sabor_id = s.id
   and ( s.nombre ilike 'moscatel%' or s.nombre ilike '%irland%' or s.nombre ilike 'strudel%'
      or s.nombre ilike 'maracuy%'  or s.nombre ilike 'pomelo%'  or trim(s.nombre) ilike 'coco' );

-- 2) Órdenes de producción de esos sabores (FK ordenes_produccion.sabor_id → sabores.id)
delete from public.ordenes_produccion o using public.sabores s
 where o.sabor_id = s.id
   and ( s.nombre ilike 'moscatel%' or s.nombre ilike '%irland%' or s.nombre ilike 'strudel%'
      or s.nombre ilike 'maracuy%'  or s.nombre ilike 'pomelo%'  or trim(s.nombre) ilike 'coco' );

-- 3) Los sabores (Recetas · Finanzas · Órdenes)
delete from public.sabores s
 where ( s.nombre ilike 'moscatel%' or s.nombre ilike '%irland%' or s.nombre ilike 'strudel%'
      or s.nombre ilike 'maracuy%'  or s.nombre ilike 'pomelo%'  or trim(s.nombre) ilike 'coco' );

-- 4) Catálogo de Producción
delete from public.productos_produccion p
 where ( p.nombre ilike 'moscatel%' or p.nombre ilike '%irland%' or p.nombre ilike 'strudel%'
      or p.nombre ilike 'maracuy%'  or p.nombre ilike 'pomelo%'  or trim(p.nombre) ilike 'coco' );

-- 5) Stock actual en Cámaras
delete from public.stock_camaras c
 where ( c.nombre ilike 'moscatel%' or c.nombre ilike '%irland%' or c.nombre ilike 'strudel%'
      or c.nombre ilike 'maracuy%'  or c.nombre ilike 'pomelo%'  or trim(c.nombre) ilike 'coco' );

commit;

-- ═══════════════════════════════════════════════════════════════════════════
--  OPCIONAL — borrar TAMBIÉN el historial (reescribe informes/estadísticas viejas).
--  Descomentá solo si querés que desaparezcan del historial también.
-- ───────────────────────────────────────────────────────────────────────────
-- begin;
-- delete from public.movimientos_camara m
--  where m.sabor_nombre ilike 'moscatel%' or m.sabor_nombre ilike '%irland%' or m.sabor_nombre ilike 'strudel%'
--     or m.sabor_nombre ilike 'maracuy%'  or m.sabor_nombre ilike 'pomelo%'  or trim(m.sabor_nombre) ilike 'coco'
--     or m.producto_nombre ilike 'moscatel%' or m.producto_nombre ilike '%irland%' or m.producto_nombre ilike 'strudel%'
--     or m.producto_nombre ilike 'maracuy%'  or m.producto_nombre ilike 'pomelo%'  or trim(m.producto_nombre) ilike 'coco';
-- delete from public.producciones pr
--  where pr.sabor_nombre ilike 'moscatel%' or pr.sabor_nombre ilike '%irland%' or pr.sabor_nombre ilike 'strudel%'
--     or pr.sabor_nombre ilike 'maracuy%'  or pr.sabor_nombre ilike 'pomelo%'  or trim(pr.sabor_nombre) ilike 'coco';
-- commit;
