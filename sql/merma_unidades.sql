-- ─────────────────────────────────────────────────────────────────────────────
--  Costeo de mermas de impulsivos / postres (por unidad)
-- ─────────────────────────────────────────────────────────────────────────────
--  La tabla mermas costea por kg (kg perdidos × costo_kg). Pero impulsivos y
--  postres se miden y se costean POR UNIDAD. Esta columna guarda cuántas unidades
--  se perdieron; el módulo Mermas las costea con el costo unitario del producto.

ALTER TABLE mermas
  ADD COLUMN IF NOT EXISTS unidades numeric;

NOTIFY pgrst, 'reload schema';
