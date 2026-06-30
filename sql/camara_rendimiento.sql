-- ─────────────────────────────────────────────────────────────────────────────
--  Rendimiento de baldes entregados a producción
-- ─────────────────────────────────────────────────────────────────────────────
--  Cuando se egresan baldes/unidades de cámara con motivo "Producción", ahora se
--  puede registrar CUÁNTO RINDIÓ (unidades o kg del producto elaborado). Con eso
--  el sistema calcula el rendimiento por balde = rindió ÷ baldes entregados.
--
--  El producto elaborado ya queda guardado dentro del campo `motivo`
--  (ej. "Producción → Cubanito"); esta columna agrega la cantidad producida.

ALTER TABLE movimientos_camara
  ADD COLUMN IF NOT EXISTS rindio numeric;

NOTIFY pgrst, 'reload schema';
