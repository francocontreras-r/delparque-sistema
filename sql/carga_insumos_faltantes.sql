-- ═══════════════════════════════════════════════════════════════════════════
--  CARGA DE INSUMOS FALTANTES + EMPAREJAMIENTO DE NOMBRES
--  Generado a partir del diagnóstico de recetas. Pegá todo y dale RUN una vez.
--
--  • Es IDEMPOTENTE: si lo corrés dos veces no duplica nada.
--  • Carga con costo 0 → completá los costos después (desde la app o por SQL).
--    Hasta entonces, en Finanzas cuentan $0 (igual que ahora), pero el control
--    de STOCK ya queda funcionando.
--  • Si tu categoría de ingredientes no se llama 'Materia Prima', cambiá esa
--    palabra abajo por la que uses.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Insertar insumos faltantes (solo si no existen ya, por nombre normalizado)
with nuevos(nombre, categoria, unidad) as (values
  -- 📦 Packaging
  ('Caja para postres grandes', 'Packaging', 'u'),
  ('Caja para postres chicas',  'Packaging', 'u'),
  ('Caja Paletas',              'Packaging', 'u'),
  ('Pote Impreso 500',          'Packaging', 'u'),
  ('Papel de Balanza',          'Packaging', 'u'),
  ('Papel para paletas',        'Packaging', 'u'),
  ('Papel Manteca',             'Packaging', 'u'),
  ('Papel para escoces',        'Packaging', 'u'),
  ('Papel para Cubanito',       'Packaging', 'u'),
  ('Palito de Madera',          'Packaging', 'u'),
  -- 🥚 Materia prima / ingredientes
  ('Baño Stracciatella 56-78',  'Materia Prima', 'kg'),
  ('Galletas Para Alfajor',     'Materia Prima', 'u'),
  ('Cerezas Maraschino',        'Materia Prima', 'kg'),
  ('Harina 0000',               'Materia Prima', 'kg'),
  ('Huevo',                     'Materia Prima', 'u'),
  ('Leche Entera',              'Materia Prima', 'L'),
  ('Manteca',                   'Materia Prima', 'kg'),
  ('Jugo limon',                'Materia Prima', 'L'),
  ('Bananas',                   'Materia Prima', 'kg'),
  ('Cafe instantaneo',          'Materia Prima', 'kg'),
  ('Cascara naranja',           'Materia Prima', 'kg'),
  ('Durazno natural',           'Materia Prima', 'kg'),
  ('Manzana Verde',             'Materia Prima', 'kg'),
  ('Moras natural',             'Materia Prima', 'kg'),
  ('Pasta tiramizu',            'Materia Prima', 'kg'),
  ('Acido pomelo',              'Materia Prima', 'kg'),
  ('Polonesa para sembrar',     'Materia Prima', 'kg'),
  ('Balde chocolate marroc',    'Materia Prima', 'kg'),
  ('Prestigio',                 'Materia Prima', 'kg'),
  ('Dulce de leche repostero',  'Materia Prima', 'kg'),
  ('Crema chantilly',           'Materia Prima', 'kg')
)
insert into insumos (nombre, categoria, unidad, stock_actual, stock_minimo, costo_unitario)
select n.nombre, n.categoria, n.unidad, 0, 0, 0
from nuevos n
where not exists (
  select 1 from insumos i
  where lower(regexp_replace(translate(btrim(i.nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'))
      = lower(regexp_replace(translate(btrim(n.nombre),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'))
);


-- ── 2) Emparejar nombres en las recetas ────────────────────────────────────
-- "DDL" es el SABOR Dulce de Leche Crema (no es un insumo):
update impulsivo_ingredientes set insumo_nombre = 'Dulce de Leche Crema' where btrim(insumo_nombre) = 'DDL';
update sabor_ingredientes     set insumo_nombre = 'Dulce de Leche Crema' where btrim(insumo_nombre) = 'DDL';

-- "DDL repostero" es el insumo Dulce de leche repostero:
update impulsivo_ingredientes set insumo_nombre = 'Dulce de leche repostero' where btrim(insumo_nombre) = 'DDL repostero';
update sabor_ingredientes     set insumo_nombre = 'Dulce de leche repostero' where btrim(insumo_nombre) = 'DDL repostero';

-- "Crema" es el insumo Crema chantilly:
update impulsivo_ingredientes set insumo_nombre = 'Crema chantilly' where btrim(insumo_nombre) = 'Crema';
update sabor_ingredientes     set insumo_nombre = 'Crema chantilly' where btrim(insumo_nombre) = 'Crema';

-- "Chocolate marroc Panaderia" es el insumo Balde chocolate marroc:
update sabor_ingredientes     set insumo_nombre = 'Balde chocolate marroc' where btrim(insumo_nombre) = 'Chocolate marroc Panaderia';
update impulsivo_ingredientes set insumo_nombre = 'Balde chocolate marroc' where btrim(insumo_nombre) = 'Chocolate marroc Panaderia';


-- ── 3) Verificación rápida: insumos recién cargados ─────────────────────────
-- select nombre, categoria, unidad from insumos
-- where costo_unitario = 0 order by categoria, nombre;
-- ═══════════════════════════════════════════════════════════════════════════
--  PENDIENTE de confirmar (no incluido): "Americana Light" (1 vez) — ¿sabor o insumo?
-- ═══════════════════════════════════════════════════════════════════════════
