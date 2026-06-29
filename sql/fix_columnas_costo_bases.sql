-- Fix: la tabla `bases` no tenía las columnas de costo que el editor de
-- Recetas escribe (sí estaban en sabores/impulsivos). Esto las agrega.
alter table bases add column if not exists costo_materiales numeric default 0;
alter table bases add column if not exists mano_de_obra     numeric default 0;
alter table bases add column if not exists costo_total      numeric default 0;

-- Forzar a PostgREST a recargar el esquema (evita el error "schema cache")
notify pgrst, 'reload schema';
