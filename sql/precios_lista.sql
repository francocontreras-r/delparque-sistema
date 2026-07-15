-- ═══════════════════════════════════════════════════════════════════════════
--  Tabla precios_lista — Del Parque Sistema
-- ═══════════════════════════════════════════════════════════════════════════
--
--  QUÉ: guarda la Lista de Precios (Franquicia + Público) que se edita desde
--  Finanzas › "Lista de precios" y se emite en PDF limpio para las franquicias.
--  Toda la lista vive en UNA fila (id = 1) como JSON, para leerla/guardarla de una.
--
--  DÓNDE SE USA: pestaña "Lista de precios" (solo admin). Si esta tabla no existe,
--  la app usa los valores sembrados en src/lib/listaPreciosData.js (modo lectura).
--
--  Correr en el proyecto Supabase de la HELADERÍA. Es idempotente.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.precios_lista (
  id           int primary key default 1,
  data         jsonb not null,
  vigencia     text,
  actualizado  timestamptz default now(),
  usuario_email text,
  constraint precios_lista_una_fila check (id = 1)
);

-- RLS: mismo criterio que el resto de las tablas operativas (la UI ya restringe
-- la edición al administrador; la lectura es para usuarios autenticados).
alter table public.precios_lista enable row level security;

drop policy if exists "precios_lista: lectura autenticados"  on public.precios_lista;
drop policy if exists "precios_lista: escritura autenticados" on public.precios_lista;

create policy "precios_lista: lectura autenticados"
  on public.precios_lista for select to authenticated using (true);
create policy "precios_lista: escritura autenticados"
  on public.precios_lista for all to authenticated using (true) with check (true);
