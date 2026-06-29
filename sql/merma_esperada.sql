-- ─────────────────────────────────────────────────────────────────────────────
-- Merma esperada por sabor (estándar de receta)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cada sabor tiene una merma "normal" propia: un sabor liso al agua merma poco,
-- uno con trozos / repostería / dulce de leche merma más. Esta columna guarda el
-- % de merma esperado para CADA producto, y el módulo Mermas evalúa la merma real
-- contra ese estándar (no contra un 3% fijo para todos).
--
-- Default 5%: valor neutro hasta que se ajuste cada sabor desde la app
-- (Mermas → pestaña "Estándares").

ALTER TABLE stock_camaras
  ADD COLUMN IF NOT EXISTS merma_esperada numeric DEFAULT 5;

-- Refrescar la cache de esquema de PostgREST para que el cambio se vea al instante.
NOTIFY pgrst, 'reload schema';
