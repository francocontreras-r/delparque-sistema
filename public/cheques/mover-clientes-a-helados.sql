-- ─────────────────────────────────────────────────────────────────────────────
-- Corrección de carga: "España" y "Concepción" NO son razones sociales propias,
-- son CLIENTES que le pagaron a Helados del Parque con estos cheques.
-- => Movemos esos cheques a la cartera de Helados del Parque, dejamos al cliente
--    registrado en "contraparte" (para reclamarle si el cheque se rechaza) y
--    borramos las dos razones sociales que sobran.
-- Corré TODO junto, una sola vez, en Supabase → SQL Editor del proyecto de Cheques.
-- Es seguro: primero mueve los cheques y recién al final borra las razones.
-- ─────────────────────────────────────────────────────────────────────────────
begin;

-- 1) Si algún cheque ya tenía un nombre en "contraparte" (el firmante real),
--    lo preservamos pasándolo a "librador" para no perderlo.
update public.cheques c
set librador = c.contraparte
from public.razones_sociales r
where c.razon_social_id = r.id
  and (r.nombre ilike '%concepci%' or r.nombre ilike '%espa_a%')
  and coalesce(nullif(c.librador,''),'')   = ''
  and coalesce(nullif(c.contraparte,''),'') <> '';

-- 2) Registrar al cliente (España / Concepción) como quien me dio el cheque.
update public.cheques c
set contraparte = r.nombre
from public.razones_sociales r
where c.razon_social_id = r.id
  and (r.nombre ilike '%concepci%' or r.nombre ilike '%espa_a%');

-- 3) Mover esos cheques a la cartera de Helados del Parque.
update public.cheques
set razon_social_id = (
  select id from public.razones_sociales
  where nombre ilike '%helados del parque%' limit 1
)
where razon_social_id in (
  select id from public.razones_sociales
  where nombre ilike '%concepci%' or nombre ilike '%espa_a%'
);

-- 4) Borrar las razones sociales "España" y "Concepción" (ya sin cheques).
delete from public.razones_sociales
where nombre ilike '%concepci%' or nombre ilike '%espa_a%';

commit;

-- Listo. Refrescá la app (o cerrá y abrí): los cheques a cobrar van a aparecer
-- dentro de Helados del Parque, con España / Concepción como contraparte.
