-- TwinAI Gallery v2 — a contributed, multi-platform feed of remixable references.
-- Anyone can post a reference (a viral video they admire / their own recreation)
-- and choose Public (everyone sees it) or Private (only them). Recreating a
-- gallery item reuses the exact same ingest → structure → blueprint engine as a
-- pasted reference link.

create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  platform text not null default 'tiktok',
  url text not null,
  niche text not null default 'Other',
  creator text,
  title text,
  why text,
  reach text,
  likes text,
  visibility text not null default 'public', -- public | private
  created_at timestamptz not null default now()
);

alter table public.gallery_items enable row level security;

-- Public items are readable by everyone; private items only by their owner.
do $$ begin
  if not exists (select 1 from pg_policies where tablename='gallery_items' and policyname='gallery read') then
    create policy "gallery read" on public.gallery_items for select to authenticated
      using (visibility = 'public' or owner_id = auth.uid()); end if;
  if not exists (select 1 from pg_policies where tablename='gallery_items' and policyname='gallery own insert') then
    create policy "gallery own insert" on public.gallery_items for insert to authenticated
      with check (owner_id = auth.uid()); end if;
  if not exists (select 1 from pg_policies where tablename='gallery_items' and policyname='gallery own update') then
    create policy "gallery own update" on public.gallery_items for update to authenticated
      using (owner_id = auth.uid()) with check (owner_id = auth.uid()); end if;
  if not exists (select 1 from pg_policies where tablename='gallery_items' and policyname='gallery own delete') then
    create policy "gallery own delete" on public.gallery_items for delete to authenticated
      using (owner_id = auth.uid()); end if;
end $$;

create index if not exists gallery_pub_idx on public.gallery_items (visibility, created_at desc);
