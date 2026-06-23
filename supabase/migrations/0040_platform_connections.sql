-- Social platform connections — the data model behind one-click posting.
--
-- Stores a per-user OAuth connection per platform (youtube / tiktok / instagram).
-- Tokens are SENSITIVE: only the service role (edge functions) may read/write them.
-- The client may see that a connection exists (platform, label, status) but never
-- the access/refresh tokens — same column-lockdown pattern as profiles.credits.

create table if not exists public.platform_connections (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users (id) on delete cascade,
  platform           text not null,                 -- 'youtube' | 'tiktok' | 'instagram'
  account_label      text,                          -- @handle / channel name for the UI
  external_account_id text,                          -- platform's account/channel id
  access_token       text,
  refresh_token      text,
  token_expires_at   timestamptz,
  scopes             text,
  status             text not null default 'connected',  -- 'connected' | 'expired' | 'revoked'
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (owner_id, platform)
);

alter table public.platform_connections enable row level security;

-- Read your own rows…
create policy "pc own select" on public.platform_connections
  for select using (auth.uid() = owner_id);
-- …and disconnect (delete) them. Insert/update happen only via the service role
-- in the edge function (token writes), so there is no authenticated write policy.
create policy "pc own delete" on public.platform_connections
  for delete using (auth.uid() = owner_id);

-- Column lockdown: the token columns are never exposed to the client. Only the
-- non-sensitive descriptor columns are selectable by authenticated users.
revoke select on public.platform_connections from authenticated, anon;
grant select (id, owner_id, platform, account_label, external_account_id, status, created_at, updated_at)
  on public.platform_connections to authenticated;

create index if not exists platform_connections_owner_idx on public.platform_connections (owner_id);
