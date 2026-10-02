-- ⚠️ OWNER 2026-10-02: scoping (0265) says WHO a fact is about; this says WHAT
-- IT IS FOR — the objectives it may serve. "Explain what it does" became a mishap
-- story, and the police story reached a sales script, because facts were chosen
-- on words, not purpose.
--
--   serves        the objectives (sell, educate, leads, conversations,
--                 personal_brand, authority, entertain, followers) this fact is
--                 material for. NULL = not labeled yet; '{}' = serves nothing.
--   serves_basis  rule | model | her | none — who decided.
--
-- ⚖️ UNLABELED IS INELIGIBLE (owner's call): the writer only ever reads a fact
-- whose label serves this video's objective, or one she switched on herself.
alter table public.creator_knowledge add column if not exists serves text[];
alter table public.creator_knowledge add column if not exists serves_basis text
  check (serves_basis is null or serves_basis in ('rule', 'model', 'her', 'none'));
alter table public.creator_knowledge add column if not exists serves_at timestamptz;
create index if not exists creator_knowledge_unlabeled on public.creator_knowledge (created_at) where serves_at is null;

-- HER CHOICES TEACH IT (option 3). One row per fact she switched on or off on
-- the plan screen for a video with this objective. Two "off"s for an objective
-- remove it from the label; one "on" adds it (she chose it herself).
create table if not exists public.fact_purpose_votes (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  knowledge_id uuid not null references public.creator_knowledge(id) on delete cascade,
  goal text not null,
  vote smallint not null check (vote in (-1, 1)),
  generation_key text,
  created_at timestamptz not null default now(),
  learned_at timestamptz,
  unique (knowledge_id, goal, generation_key)
);
create index if not exists fact_purpose_votes_unlearned on public.fact_purpose_votes (created_at) where learned_at is null;
alter table public.fact_purpose_votes enable row level security;
drop policy if exists fact_purpose_votes_owner_read on public.fact_purpose_votes;
create policy fact_purpose_votes_owner_read on public.fact_purpose_votes for select to authenticated using (owner_id = auth.uid());

-- The writer reads this view; it carries the label (columns appended, same filter).
create or replace view public.creator_knowledge_writable with (security_invoker = true) as
  select id, owner_id, voice_id, kind, text, basis, confidence, times_seen, source_ref, source_url,
         last_observed_at, source_expiry, created_at, updated_at, source, surface_forms, cost, consensus,
         extractor_version, last_used_at, used_count, evidence, question_id, creator_confirmed_at,
         video_posted_at, sensitive, creator_excluded_at, product_entity_id, fact_scope, brand_id,
         serves, serves_basis
  from public.creator_knowledge
  where not sensitive and creator_excluded_at is null;
