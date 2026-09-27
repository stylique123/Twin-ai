-- PUBLISHING THROUGH OUTSTAND (owner's decision, 2026-09-27). Replaces the
-- self-hosted Postiz plan. Twin's existing tables carry the blueprint's model:
--   users            → auth.users (Supabase auth, unchanged)
--   social_accounts  → platform_connections (+ provider, username, avatar_url;
--                      external_account_id holds the Outstand account id)
--   scheduled_posts  → posts (one row per platform; + title for YouTube,
--                      media_path for an uploaded file, external_post_id for
--                      the Outstand post id, status 'outstand_queued')
-- plus post_stat_snapshots, so Instagram / LinkedIn charts have a real history.

alter table public.platform_connections add column if not exists provider text not null default 'native'
  check (provider in ('native', 'outstand'));
alter table public.platform_connections add column if not exists username text;
alter table public.platform_connections add column if not exists avatar_url text;

alter table public.posts add column if not exists external_post_id text;
alter table public.posts add column if not exists title text check (title is null or length(title) <= 100);
alter table public.posts add column if not exists media_path text;
create index if not exists posts_outstand_queued on public.posts (scheduled_for) where status = 'outstand_queued';

-- One reading per sync, so a post's performance has a history (charts).
create table if not exists public.post_stat_snapshots (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  taken_at timestamptz not null default now(),
  views bigint, likes bigint, comments bigint, shares bigint, saves bigint, impressions bigint
);
create index if not exists post_stat_snapshots_post on public.post_stat_snapshots (post_id, taken_at);
alter table public.post_stat_snapshots enable row level security;
drop policy if exists post_stat_snapshots_owner_read on public.post_stat_snapshots;
create policy post_stat_snapshots_owner_read on public.post_stat_snapshots for select using (owner_id = auth.uid());

-- Videos she uploads herself in the composer (not a Twin render). Private;
-- the social function signs a URL for the posting service.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('post-media', 'post-media', false, 524288000, array['video/mp4', 'video/quicktime', 'video/webm'])
  on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists post_media_owner_write on storage.objects;
create policy post_media_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists post_media_owner_read on storage.objects;
create policy post_media_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
-- No client DELETE policy on storage.objects (repo rule); cleanup is server-side.
drop policy if exists post_media_owner_delete on storage.objects;
