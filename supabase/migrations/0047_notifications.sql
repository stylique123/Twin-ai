-- In-app notifications. Powers "your video is ready" (written by the worker when a
-- render finishes) and "your client approved / requested changes" (written by the
-- review edge fn). Both are SERVER-SIDE writers using the service role, so there is
-- NO insert policy for end users — a client can only read and mark-read its own.
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null,                  -- 'video_ready' | 'review_approved' | 'review_changes' | ...
  title      text not null,
  body       text,
  link       text,                           -- in-app route to open (e.g. /result/<id>)
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

-- Owner can read and mark their own notifications read. No insert/delete for users.
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists notifications_user_created on public.notifications (user_id, created_at desc);

grant select, update on public.notifications to authenticated;
