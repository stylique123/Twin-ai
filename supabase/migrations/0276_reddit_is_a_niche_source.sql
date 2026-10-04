-- 0276 — REDDIT IS A NICHE SOURCE (owner, 2026-10-04).
--
-- What real people in each sub-niche ask, complain about, argue over and want
-- to buy, read weekly from the top Reddit threads of the last year
-- (worker/src/nicheBrain/nicheReddit.ts). Shared per niche like
-- niche_research; never a fact about any creator.

create table if not exists public.niche_reddit (
  niche_key text primary key,
  sub_niche text not null,
  items jsonb not null default '[]'::jsonb,
  threads jsonb not null default '[]'::jsonb,
  model text,
  failure text,
  researched_at timestamptz not null default now()
);
alter table public.niche_reddit enable row level security;
drop policy if exists niche_reddit_read on public.niche_reddit;
create policy niche_reddit_read on public.niche_reddit for select to authenticated using (true);
