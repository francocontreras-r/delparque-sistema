-- ════════════════════════════════════════════════════════════════════════════
-- Diagnóstico: ingresos que no actualizaron stock por variación de nombre
-- Contexto: el campo Producto del ingreso es texto libre. Si el nombre no
-- coincidía EXACTO con un insumo (espacios de más, acentos, variantes), el
-- movimiento se guardaba pero el stock_actual del insumo nunca se sumaba.
-- El código ya se corrigió (normalizarNombre en el match); estas consultas
-- sirven para encontrar y reparar lo que quedó mal de antes.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) INGRESOS SIN COINCIDENCIA — cada fila es un producto cuyo stock quedó sin
--    sumar. Normaliza mayúsculas y espacios (los acentos, si los hubiera, se
--    revisan a mano; son poco frecuentes en estos nombres).
select
  m.producto_nombre,
  count(*)          as veces,
  sum(m.cantidad)   as cantidad_total,
  max(m.fecha)      as ultimo_ingreso
from movimientos_deposito m
where m.tipo = 'ingreso'
  and lower(btrim(regexp_replace(m.producto_nombre, '\s+', ' ', 'g'))) not in (
    select lower(btrim(regexp_replace(nombre, '\s+', ' ', 'g'))) from insumos
  )
group by m.producto_nombre
order by veces desc;

-- 2) INSUMOS DUPLICADOS / VARIANTES — nombres que normalizan igual (una de las
--    causas del problema: el operario tipeó una variante que sí existía pero
--    con otra grafía). Conviene unificarlos a un solo nombre.
select
  array_agg(nombre order by nombre) as variantes,
  count(*)                          as cuantas
from insumos
group by lower(btrim(regexp_replace(nombre, '\s+', ' ', 'g')))
having count(*) > 1;

-- 3) (Opcional) Ver los movimientos crudos de un producto puntual para chequear
--    qué entró y decidir el ajuste de stock. Reemplazá el texto del ILIKE.
-- select fecha, producto_nombre, cantidad, unidad, marca, proveedor, lote
-- from movimientos_deposito
-- where tipo = 'ingreso' and producto_nombre ilike '%DDL Heladero%'
-- order by fecha desc;
