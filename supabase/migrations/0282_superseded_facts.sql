-- A FACT CAN BE SUPERSEDED (owner 2026-10-06, privacy sheet items 2-3).
--
-- Her store held the same fact two or three times ("dark roasting burns off
-- more caffeine" typed twice, two captions about one DIY coffee bar) and facts
-- that disagree (which origin is the Signature Blend). The writer must never
-- choose between conflicting facts, and a duplicate must not count twice. A
-- superseded row points at the row that replaces it (a duplicate) or carries
-- a reason (an outdated fact she replaced); the writer's view leaves it out.
-- The row itself is kept, so the decision can be undone.
--
-- ⚖️ ADDITIVE. Three nullable columns; the view is replaced in place with
-- the same name and grants, one more condition.
alter table public.creator_knowledge add column if not exists superseded_by uuid references public.creator_knowledge(id) on delete set null;
alter table public.creator_knowledge add column if not exists superseded_at timestamptz;
alter table public.creator_knowledge add column if not exists superseded_reason text;

-- CREATE OR REPLACE, not drop + create: the view stays readable while a
-- batch is running, and the new columns only append to it.
create or replace view public.creator_knowledge_writable
  with (security_invoker = true) as
  select * from public.creator_knowledge where not sensitive and creator_excluded_at is null and superseded_at is null;
grant select on public.creator_knowledge_writable to authenticated, service_role;
