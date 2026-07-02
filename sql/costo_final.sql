-- ═══════════════════════════════════════════════════════════════════════════
--  COSTO FINAL — Del Parque Sistema
-- ═══════════════════════════════════════════════════════════════════════════
--
--  POR QUÉ: que Finanzas sea la ÚNICA fuente del costo final por unidad.
--  Finanzas calcula: materia prima (recetas) + mano de obra + CIF, lo pasa a
--  costo POR UNIDAD (sabor $/kg, impulsivo $/u, postre $/kg) y lo guarda acá.
--  Cámara e Informes LEEN este costo_final (no lo recalculan) → todo coincide.
--
--  Se completa al apretar "Actualizar costos" en Finanzas. La app funciona sin
--  estas columnas (usa el cálculo en vivo como respaldo).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.sabores    add column if not exists costo_final  numeric;
alter table public.sabores    add column if not exists costo_unidad text;   -- 'kg'
alter table public.impulsivos add column if not exists costo_final  numeric;
alter table public.impulsivos add column if not exists costo_unidad text;   -- 'u' | 'kg'
