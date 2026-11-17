-- TEAM INVITES (security audit #1). Joining a workspace puts both people in
-- workspace_peers() (0049), which gives the INVITER read and edit access to the
-- joiner's brand voices, scripts and posts. Any account could mint an invite,
-- the join page accepted on load, and a teammate could not leave. Fixed here:
--   1. create_workspace_invite: Studio/Agency plans only (Settings already hides
--      invite controls on other plans; the server now agrees).
--   2. accept_workspace_invite: refuses an invite whose owner is not on a team
--      plan, so links minted by free accounts before this fix stop working.
--   3. wm_member_leave: a teammate can delete her own membership row.
-- The join page now asks before joining (apps/web/src/pages/JoinWorkspace.tsx).
-- Bodies are 0049's with only the plan checks added.
-- Files only; applied by hand like the other migrations.

create or replace function public.create_workspace_invite()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare tok text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and plan in ('studio', 'agency')) then
    raise exception 'Team seats need a Studio or Agency plan.' using errcode = '42501';
  end if;
  select token into tok from public.workspace_invites
    where owner_id = auth.uid() and accepted_at is null order by created_at desc limit 1;
  if tok is not null then return tok; end if;
  tok := encode(gen_random_bytes(12), 'hex');
  insert into public.workspace_invites(owner_id, token) values (auth.uid(), tok);
  return tok;
end $$;
revoke all on function public.create_workspace_invite() from public;
grant execute on function public.create_workspace_invite() to authenticated;

create or replace function public.accept_workspace_invite(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_owner uuid; v_count int;
begin
  select owner_id into v_owner from public.workspace_invites where token = btrim(p_token) and accepted_at is null;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'This invite link is not valid or was already used.'); end if;
  if not exists (select 1 from public.profiles where id = v_owner and plan in ('studio', 'agency')) then
    return jsonb_build_object('ok', false, 'error', 'This invite link is not valid or was already used.');
  end if;
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

drop policy if exists "wm_member_leave" on public.workspace_members;
create policy "wm_member_leave" on public.workspace_members for delete using (auth.uid() = member_id);
