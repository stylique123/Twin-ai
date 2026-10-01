-- ⚠️ OWNER AUDIT 2026-10-01 ("store which product each fact belongs to"): a
-- fact was matched to a product by the words in its text. A fact now carries
-- the product it belongs to; the writer uses it only in that product's scripts.
-- Null means account-general (the name heuristic still applies to those).
alter table public.creator_knowledge
  add column if not exists product_entity_id uuid references public.product_entities(id) on delete set null;
create index if not exists creator_knowledge_product_idx on public.creator_knowledge (product_entity_id) where product_entity_id is not null;

-- The view was `select *`, which froze its column list: recreate so it carries the new column.
drop view if exists public.creator_knowledge_writable;
create view public.creator_knowledge_writable with (security_invoker = true) as
  select * from public.creator_knowledge where not sensitive and creator_excluded_at is null;
grant select on public.creator_knowledge_writable to authenticated, service_role;

-- Backfill 1: objective answers name their product in source_ref (asked:objective:<product id>:<question>).
update public.creator_knowledge k
   set product_entity_id = p.id
  from public.product_entities p
 where k.product_entity_id is null
   and k.source_ref like 'asked:objective:%'
   and p.id::text = split_part(substr(k.source_ref, 17), ':', 1)
   and p.owner_id = k.owner_id;

-- Backfill 2: a fact that names exactly ONE of her products (whole name, 4+ chars) belongs to it.
with hits as (
  select k.id kid, (array_agg(p.id))[1] pid, count(*) n
  from public.creator_knowledge k
  join public.product_entities p on p.owner_id = k.owner_id and length(btrim(p.name)) >= 4
   and (' ' || lower(regexp_replace(coalesce(k.text, '') || ' ' || coalesce(k.evidence, ''), '[^a-zA-Z0-9]+', ' ', 'g')) || ' ')
       like ('% ' || lower(btrim(regexp_replace(p.name, '[^a-zA-Z0-9]+', ' ', 'g'))) || ' %')
  where k.product_entity_id is null
  group by k.id
)
update public.creator_knowledge k set product_entity_id = h.pid from hits h where k.id = h.kid and h.n = 1;
