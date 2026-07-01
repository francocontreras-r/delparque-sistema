-- ═══════════════════════════════════════════════════════════════════════════
--  CONTEO SEMANAL UNIFICADO — Del Parque Sistema
-- ═══════════════════════════════════════════════════════════════════════════
--
--  POR QUÉ: hoy hay dos conteos (Depósito y Cámara) con lógicas distintas y no
--  hay un informe semanal único. Estas columnas convierten a `conteos_stock` en
--  la ÚNICA fuente de verdad del control semanal: guarda el motivo de cada
--  diferencia, su impacto en $, a qué ciclo (semana) pertenece y en qué modo se
--  contó (normal o a ciegas). Con eso se arma el informe consolidado y se puede
--  auditar quién contó qué y por qué.
--
--  `conteos_stock` ya tiene RLS (nivel operación en sql/rls_policies.sql): lee y
--  escribe cualquier autenticado. Estas columnas heredan esas policies.
--
--  Todo es idempotente: se puede correr varias veces.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.conteos_stock add column if not exists motivo        text;
alter table public.conteos_stock add column if not exists valor_impacto numeric;   -- diferencia × costo (negativo = faltante)
alter table public.conteos_stock add column if not exists ciclo_id      uuid;       -- agrupa los ítems contados en una misma sesión
alter table public.conteos_stock add column if not exists modo          text default 'normal';  -- 'normal' | 'ciego'

create index if not exists ix_conteos_ciclo   on public.conteos_stock (ciclo_id);
create index if not exists ix_conteos_created on public.conteos_stock (created_at);
