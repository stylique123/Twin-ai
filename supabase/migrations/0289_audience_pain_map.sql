-- B2 Tier-1 community pain map. Rows are written BY HAND by a person reading
-- public threads; nothing fetches or scrapes any site. Paraphrases only.
--
-- USE RULE: Twin may use a pain only as a hook or topic seed matched to a
-- pillar. It is never proof, never the creator's experience, never quoted.
--
-- Private: RLS on, no anon/authenticated policies, service role only.
-- NOT applied by this change.
create table if not exists public.audience_pain_map (
  id uuid primary key default gen_random_uuid(),
  niche text not null,
  pain_sentence text not null,
  pillar_bucket text not null,
  communities text[] not null default '{}',
  thread_count integer not null check (thread_count >= 0),
  community_count integer not null check (community_count >= 0),
  kind text not null check (kind in ('pattern', 'idea')),
  example_links text[] not null default '{}',
  first_seen date,
  last_checked date not null,
  verification text not null check (verification in ('V1', 'V2')),
  expiry date not null,
  status text not null default 'active' check (status in ('active', 'expired', 'rejected')),
  origin text not null default 'audience_pain' check (origin = 'audience_pain'),
  created_at timestamptz not null default now(),
  unique (niche, pain_sentence)
);
alter table public.audience_pain_map enable row level security;
revoke all on public.audience_pain_map from anon, authenticated;
grant all on public.audience_pain_map to service_role;
