-- ═══════════════════════════════════════════════════════════════════════════
--  sabores.peso_kg — rinde real en kg por tanda (fijado a mano)
-- ═══════════════════════════════════════════════════════════════════════════
--  QUÉ: permite escribir cuántos kg rinde una receta de sabor/intermedio cuando
--  no sale de una base de helado (ej. una masa hecha con insumos sueltos, como
--  "Americana Light"). Si está cargado, el $/kg se calcula sobre esos kg.
--
--  Vacío/null = comportamiento anterior (rinde = litros de base × densidad + kg
--  de ingredientes).
--
--  La app degrada seguro si la columna no existe (guarda el resto). Correr en el
--  proyecto Supabase de la HELADERÍA. Es idempotente.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.sabores add column if not exists peso_kg numeric;
