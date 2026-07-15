-- ─────────────────────────────────────────────────────────────────────────────
-- Nombre para mostrar en los informes ("Preparado por …").
-- Agrega una columna "nombre" al perfil de cada usuario. Cada uno lo edita
-- desde la app en Ajustes → Sincronización en la nube → "Tu nombre".
-- Corré esto UNA vez en Supabase → SQL Editor. Es seguro repetirlo.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.perfiles
  add column if not exists nombre text;

-- Opcional: dejar tu nombre ya cargado (cambiá el mail si hace falta).
update public.perfiles set nombre = 'Franco Contreras'
where email ilike 'francocontreras.r@gmail.com';

-- Listo. En el informe el pie va a decir: "Preparado por Franco Contreras · fecha".
