-- WHAT SHE LEFT OUT STAYS OUT (audit 2026-09-29 #3).
--
-- A fact she tapped off on the plan screen was remembered for that one build
-- only (sessionStorage), so the next video started with nothing excluded and
-- the same fact came back. It is now remembered on the row: set when she taps
-- it off, cleared when she switches it back on for a video. The writer's view
-- leaves it out; the plan screen still shows it, switched off, so she can undo.
--
-- ⚖️ ADDITIVE. One nullable column; the view is recreated with the same name
-- and grants, one more condition.
alter table public.creator_knowledge add column if not exists creator_excluded_at timestamptz;

drop view if exists public.creator_knowledge_writable;
create view public.creator_knowledge_writable
  with (security_invoker = true) as
  select * from public.creator_knowledge where not sensitive and creator_excluded_at is null;
grant select on public.creator_knowledge_writable to authenticated, service_role;
