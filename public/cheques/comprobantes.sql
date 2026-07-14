-- ─────────────────────────────────────────────────────────────────────────────
-- Comprobantes: adjuntar foto/PDF a cada cheque.
-- Corré esto UNA vez en Supabase → SQL Editor del proyecto de Cheques.
-- Es seguro correrlo más de una vez.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Columnas en la tabla de cheques
alter table public.cheques
  add column if not exists comprobante_path   text,
  add column if not exists comprobante_nombre text;

-- 2) "Carpeta" privada donde se guardan los archivos (bucket de Storage)
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

-- 3) Permisos: cualquier usuario logueado puede subir, ver y borrar comprobantes
drop policy if exists "comprob leer"   on storage.objects;
create policy "comprob leer"   on storage.objects for select to authenticated using (bucket_id = 'comprobantes');

drop policy if exists "comprob subir"  on storage.objects;
create policy "comprob subir"  on storage.objects for insert to authenticated with check (bucket_id = 'comprobantes');

drop policy if exists "comprob borrar" on storage.objects;
create policy "comprob borrar" on storage.objects for delete to authenticated using (bucket_id = 'comprobantes');

-- Listo. En la app, al cargar/editar un cheque vas a ver el bloque "Comprobante"
-- para sacar una foto o elegir un archivo. Los cheques con adjunto muestran 📎.
