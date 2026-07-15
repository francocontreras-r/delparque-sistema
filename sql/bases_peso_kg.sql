-- ═══════════════════════════════════════════════════════════════════════════
--  bases.peso_kg — rinde real en kg por tanda
-- ═══════════════════════════════════════════════════════════════════════════
--
--  QUÉ: la base es más densa que el agua (azúcar + leche), así que una tanda de
--  120 litros PESA más de 120 kg al salir de la máquina. Esta columna guarda los
--  kg reales que rinde la tanda. El $/kg de cada sabor se calcula con ese peso
--  (litros × densidad), no asumiendo 120 L = 120 kg.
--
--  DÓNDE SE USA: Recetas → editar una Base → "Rinde real (kg por tanda)".
--  Si está vacío/NULL, el sistema sigue usando los litros (comportamiento previo).
--
--  Correr en el proyecto Supabase de la HELADERÍA. Es idempotente.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.bases add column if not exists peso_kg numeric;
