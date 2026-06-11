-- TwinAI Phase 7 — publish tracking + (future) analytics.
--
-- A `posts` row records that a creator scheduled or published a blueprint to a
-- platform. Auto-posting + real view/engagement numbers land later via an
-- integration; the analytics columns are nullable now so nothing is faked —
-- they stay empty until a real source fills them.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references public.generations(id) on delete set null,
  platform text not null,                       -- tiktok | instagram | youtube | other
  caption text,
  status text not null default 'scheduled',     -- scheduled | posted
  scheduled_for timestamptz,
  posted_at timestamptz,
  external_url text,                            -- the live post, once known
  views bigint,                                 -- filled only by a real analytics source
  likes bigint,
  comments bigint,
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

-- Owner-scoped: a user sees and manages only their own posts.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='posts own select') then
    create policy "posts own select" on public.posts for select to authenticated using (owner_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='posts own insert') then
    create policy "posts own insert" on public.posts for insert to authenticated with check (owner_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='posts own update') then
    create policy "posts own update" on public.posts for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='posts own delete') then
    create policy "posts own delete" on public.posts for delete to authenticated using (owner_id = auth.uid());
  end if;
end $$;

create index if not exists posts_owner_created_idx on public.posts (owner_id, created_at desc);
