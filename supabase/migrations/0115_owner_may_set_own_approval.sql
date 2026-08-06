-- 0115 — THE OWNER'S OWN APPROVAL TOGGLE HAD NO WAY TO CALL THE ONE STATEMENT
-- THAT WRITES AN APPROVAL CORRECTLY.
--
-- 0111 made `set_generation_approval` the single place an approval and the
-- thing it approves are written together, and granted it to `service_role`
-- alone. That was right for its only caller at the time: the public review
-- function, which runs with the service key.
--
-- The owner's toggle in `Result.tsx` was never migrated to it. It kept doing
-- `update generations set approved = …`, and after 0111 that is broken in both
-- directions:
--
--   APPROVING leaves `approved_output_asset_id` NULL, which `approvalState`
--   reads as `unbound` — approved, but we do not know of what. `publishAllowed`
--   deliberately refuses `unbound` at publish time, so on a brand with
--   `needs_approval: true` the owner's own approval produced a video that could
--   never be posted, behind a "Needs approval" chip that re-approving could
--   never clear.
--
--   UN-APPROVING a row already bound by the review link sets `approved = false`
--   while the binding columns stay set, which violates
--   `generations_approval_binding_coherent`. The write fails and the UI silently
--   reverts the toggle.
--
-- Pointing the client at the RPC is the fix, and it cannot work while the grant
-- excludes `authenticated`. This migration adds the grant — and the ownership
-- check that has to come with it.
--
-- ── THE GRANT IS ONLY SAFE BECAUSE OF THE CHECK ───────────────────────────
--
-- The function is `security definer`, so RLS does not apply inside it. Granting
-- execute to `authenticated` WITHOUT an ownership test would let any signed-in
-- user approve any generation by id — which is precisely the thing an approval
-- exists to prevent, handed out through the repair.
--
-- The rule is the one 0114 arrived at, for the same reason and after the same
-- two wrong attempts: A SIGNED-IN CALLER MUST OWN THE ROW. `auth.uid()` is
-- non-null exactly when there is a signed-in caller, so that is what is tested.
-- A NULL uid means no end user is making the request — the review function
-- acting on a decision it already authorised with a review token — and execute
-- stays revoked from `anon` and `public`, so a null uid cannot arrive from the
-- internet.
--
-- Testing `auth.uid()` rather than naming a privileged role is deliberate:
-- a guard keyed to a role NAME changes meaning with the connection, which is
-- how 0114's second attempt failed against `postgres`.

create or replace function public.set_generation_approval(
  p_generation uuid,
  p_approved boolean,
  p_review_status text default null
) returns table(approved boolean, output_asset_id uuid, edit_project_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
-- SCALARS, NOT A RECORD. The first version declared `proj record` and filled it
-- only inside `if p_approved then`; on the UNAPPROVE path plpgsql raised
-- `record "proj" is not assigned yet` the moment the UPDATE mentioned
-- `proj.output_asset_id`, because a record with no assignment has no fields to
-- reference and the surrounding `case when p_approved` does not save it. That is
-- the path the review function uses for "request changes". Scalars initialise to
-- NULL, so both paths are always well-defined.
declare
  v_owner   uuid;
  v_project uuid;
  v_asset   uuid;
begin
  select g.user_id into v_owner from public.generations g where g.id = p_generation;
  if v_owner is null then
    raise exception 'set_generation_approval: no such generation %', p_generation
      using errcode = 'no_data_found';
  end if;
  -- See the header: the grant to `authenticated` is only safe because of this.
  if auth.uid() is not null and v_owner is distinct from auth.uid() then
    -- Deliberately the same message as "no such generation", so this cannot be
    -- used to discover which ids exist.
    raise exception 'set_generation_approval: no such generation %', p_generation
      using errcode = 'no_data_found';
  end if;

  if p_approved then
    select ep.id, ep.output_asset_id
      into v_project, v_asset
      from public.edit_projects ep
     where ep.generation_id = p_generation
       and ep.status = 'completed'
       and ep.output_asset_id is not null
     order by ep.completed_at desc nulls last, ep.id desc
     limit 1;
  end if;

  update public.generations g
     set approved = p_approved,
         review_status = coalesce(p_review_status, g.review_status),
         -- UNAPPROVING CLEARS THE BINDING. Leaving a stale asset id behind would
         -- let a later re-approval look bound to something nobody re-examined —
         -- and would violate the coherence CHECK outright.
         approved_output_asset_id = case when p_approved then v_asset else null end,
         approved_edit_project_id = case when p_approved then v_project else null end,
         approved_at = case when p_approved then now() else null end
   where g.id = p_generation;

  if not found then
    raise exception 'set_generation_approval: no such generation %', p_generation;
  end if;

  return query
    select p_approved,
           case when p_approved then v_asset else null end,
           case when p_approved then v_project else null end;
end;
$$;

revoke all on function public.set_generation_approval(uuid, boolean, text)
  from public, anon;
grant execute on function public.set_generation_approval(uuid, boolean, text) to authenticated;
grant execute on function public.set_generation_approval(uuid, boolean, text) to service_role;
