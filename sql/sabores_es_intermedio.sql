-- ═══════════════════════════════════════════════════════════════════════════
--  sabores.es_intermedio — producto intermedio (no se vende solo)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  QUÉ: marca un sabor como INTERMEDIO: se elabora en la fábrica y va DENTRO de
--  otro producto (ej. Chocolate Light / Americana Light → Pote light; Masa de
--  cubanito → Cubanito), pero NO se vende solo.
--
--  EFECTO: se costea y su costo rollea al producto final; aparece en Recetas
--  (pestaña "Intermedios") y en Costos; pero NO figura en Lista de precios /
--  Franquicia ni en los márgenes de venta.
--
--  Si la columna no existe, la app degrada seguro (guarda el resto sin ella).
--  Correr en el proyecto Supabase de la HELADERÍA. Es idempotente.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.sabores add column if not exists es_intermedio boolean not null default false;
