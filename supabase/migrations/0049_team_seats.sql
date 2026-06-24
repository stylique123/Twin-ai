-- Team seats / shared workspaces. A teammate (member) works inside an owner's
-- workspace: they SEE and can EDIT the owner's client brand voices, scripts and
-- videos, and create new remixes in those voices on the owner's remixes. Owner
-- keeps billing + destructive actions. 1 free seat per workspace for now; more
-- seats are paid (later).
--
-- SAFETY: the visibility helper workspace_peers() is keyed to auth.uid() only —
-- a user can never enumerate another workspace's members — and resolves to just
-- {auth.uid()} for anyone with no membership, so solo accounts are 100% unchanged.

create table if not exists public.workspace_members (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  member_id  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, member_id)
);
-- A user is a member of at most ONE workspace, so "effective owner" is unambiguous.
create unique index if not exists workspace_members_member_unique on public.workspace_members (member_id);

alter table public.workspace_members enable row level security;
drop policy if exists "wm_select" on public.workspace_members;
create policy "wm_select" on public.workspace_members for select
  using (auth.uid() = owner_id or auth.uid() = member_id);
drop policy if exists "wm_owner_delete" on public.workspace_members;
create policy "wm_owner_delete" on public.workspace_members for delete using (auth.uid() = owner_id);
grant select, delete on public.workspace_members to authenticated;

create table if not exists public.workspace_invites (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id)
);
alter table public.workspace_invites enable row level security;
drop policy if exists "wi_owner_select" on public.workspace_invites;
create policy "wi_owner_select" on public.workspace_invites for select using (auth.uid() = owner_id);
grant select on public.workspace_invites to authenticated;

-- Everyone who shares the caller's workspace (owner + all members). auth.uid()-keyed
-- (no argument) so it can ONLY ever return the caller's own workspace.
create or replace function public.workspace_peers()
returns setof uuid language sql stable security definer set search_path = public as $$
  with o as (
    select coalesce((select owner_id from public.workspace_members where member_id = auth.uid() limit 1), auth.uid()) oid
  )
  select oid from o
  union
  select m.member_id from public.workspace_members m, o where m.owner_id = o.oid
$$;
revoke all on function public.workspace_peers() from public;
grant execute on function public.workspace_peers() to authenticated;

-- Free seats per workspace (1 for now; raised / paid when billing turns on).
create or replace function public.workspace_seat_limit(p_owner uuid)
returns int language sql stable as $$ select 1 $$;

-- Owner mints (or reuses) an invite token.
create or replace function public.create_workspace_invite()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare tok text;
begin
  select token into tok from public.workspace_invites
    where owner_id = auth.uid() and accepted_at is null order by created_at desc limit 1;
  if tok is not null then return tok; end if;
  tok := encode(gen_random_bytes(12), 'hex');
  insert into public.workspace_invites(owner_id, token) values (auth.uid(), tok);
  return tok;
end $$;
revoke all on function public.create_workspace_invite() from public;
grant execute on function public.create_workspace_invite() to authenticated;

-- Invitee accepts: join the inviting owner's workspace (seat-capped, one workspace each).
create or replace function public.accept_workspace_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_owner uuid; v_count int;
begin
  select owner_id into v_owner from public.workspace_invites where token = btrim(p_token) and accepted_at is null;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'This invite link is not valid or was already used.'); end if;
  if v_owner = auth.uid() then return jsonb_build_object('ok', false, 'error', 'You can''t join your own workspace.'); end if;
  if exists (select 1 from public.workspace_members where member_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'You''re already part of a workspace.');
  end if;
  if exists (select 1 from public.workspace_members where owner_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'You already run a workspace, so you can''t join another.');
  end if;
  select count(*) into v_count from public.workspace_members where owner_id = v_owner;
  if v_count >= public.workspace_seat_limit(v_owner) then
    return jsonb_build_object('ok', false, 'error', 'This workspace has no free seats left — more seats are coming soon.');
  end if;
  insert into public.workspace_members(owner_id, member_id) values (v_owner, auth.uid()) on conflict do nothing;
  update public.workspace_invites set accepted_at = now(), accepted_by = auth.uid() where token = btrim(p_token);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.accept_workspace_invite(text) from public;
grant execute on function public.accept_workspace_invite(text) to authenticated;

-- ---- Broaden SELECT (and EDIT) to the whole workspace. Inserts stay own; deletes
-- ---- stay owner-only (members can't destroy the owner's voices/videos). ----
drop policy if exists "own brand voices read" on public.brand_voices;
create policy "workspace brand voices read" on public.brand_voices for select
  using (owner_id in (select public.workspace_peers()));
drop policy if exists "own brand voices update" on public.brand_voices;
create policy "workspace brand voices update" on public.brand_voices for update
  using (owner_id in (select public.workspace_peers())) with check (owner_id in (select public.workspace_peers()));

drop policy if exists "own generations read" on public.generations;
create policy "workspace generations read" on public.generations for select
  using (user_id in (select public.workspace_peers()));
drop policy if exists "own generations update" on public.generations;
create policy "workspace generations update" on public.generations for update
  using (user_id in (select public.workspace_peers())) with check (user_id in (select public.workspace_peers()));

drop policy if exists "posts own select" on public.posts;
create policy "workspace posts select" on public.posts for select
  using (owner_id in (select public.workspace_peers()));
drop policy if exists "posts own update" on public.posts;
create policy "workspace posts update" on public.posts for update
  using (owner_id in (select public.workspace_peers())) with check (owner_id in (select public.workspace_peers()));
