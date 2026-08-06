-- 0114 — DELETING A VIDEO ACTUALLY DELETES IT.
--
-- 0099 built the purge: a trigger on `media_assets` queues a job that removes
-- the bytes, on DELETE and on status→'deleted', "so a generation cascade and an
-- account cascade are both covered without application code". Its header says,
-- in the first paragraph:
--
--   "Deleting a generation cascades the `media_assets` rows."
--
-- IT DOES NOT. Checked against the live catalog on 2026-08-06:
--
--   media_assets_generation_id_fkey  FOREIGN KEY (generation_id)
--     REFERENCES generations(id) ON DELETE SET NULL
--
-- So deleting a generation NULLS the link and leaves the row. The purge trigger
-- fires on delete and on soft-delete; neither happens. Every raw take — a
-- recording of a person's face and voice — survives, now orphaned from the
-- generation that explained why we had it.
--
-- The purge is correct. The route to it was never connected. That is the same
-- shape as OUTPUT-1 and PUBLISH-1, arriving in the one place where the
-- consequence is a person's footage rather than a wrong label.
--
-- And there was no deletion flow at all, so nobody had hit it. This migration
-- adds the flow and the missing connection together, because either alone is
-- worse than neither: a button that appears to delete and does not is a lie a
-- creator will rely on.
--
-- ── WHY AN RPC AND NOT A CHANGED FOREIGN KEY ──────────────────────────────
--
-- The obvious repair is `ON DELETE CASCADE` on that key. It is wrong here.
-- `edit_projects.source_asset_id` references `media_assets` with NO ACTION, and
-- `edit_projects` cascades from the generation too — so a generation delete
-- would fire two cascade branches whose relative order Postgres does not
-- promise. When the asset branch runs first it hits the still-live project's
-- reference and the whole delete fails. Intermittently, which is the worst way
-- for a deletion to fail.
--
-- Ordering that must hold is written down rather than hoped for.
--
-- ── WHAT SURVIVES, ON PURPOSE ─────────────────────────────────────────────
--
-- `posts` keeps its row. `posts.generation_id` is already ON DELETE SET NULL,
-- and that is right: a post is a FACT ABOUT THE WORLD — something went out, on
-- a date, to an audience. Deleting our working copy does not unpublish it, and
-- erasing the record would leave a creator unable to answer "did I post that?"
-- about a video that is still on the platform. The record of the act stays; the
-- footage goes.
--
-- The same reasoning is why this deletes rather than soft-deletes the
-- generation: a creator who asks for their recording to be gone is owed its
-- removal, not a hidden row.

-- ---------------------------------------------------------------------------
-- The observation log's append-only rule was blocking POST deletion entirely.
-- ---------------------------------------------------------------------------
-- 0105's trigger fires `before delete or update` and raises unconditionally.
-- `post_outcome_observations.post_id` is ON DELETE CASCADE, so the cascade from
-- a deleted post hits that trigger and the post delete fails. Any creator who
-- recorded a view count on a post could never delete that post again —
-- `deletePost` on the Calendar simply threw.
--
-- The rule being protected is about REWRITING: "a measurement that can be
-- rewritten is not a measurement". Deleting the post the measurements are about
-- does not rewrite anything, and refusing it makes the outcome log a reason a
-- creator cannot remove their own data.
--
-- So UPDATE stays absolutely forbidden, and DELETE is allowed ONLY as a cascade
-- from a post that is already gone. A direct delete while the post still exists
-- is still refused — that is the case where someone would be dropping an
-- inconvenient reading and keeping the video.
create or replace function public.post_outcome_observations_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    -- A cascade deletes the parent FIRST, so by the time this fires the post is
    -- gone. Its continued existence therefore means someone is deleting the
    -- reading on its own.
    if not exists (select 1 from public.posts p where p.id = old.post_id) then
      return old;
    end if;
    raise exception
      'post_outcome_observations is append-only — delete the post to remove its readings, not the readings on their own';
  end if;
  raise exception 'post_outcome_observations is append-only — a measurement that can be rewritten is not a measurement';
end;
$$;

-- ---------------------------------------------------------------------------
-- Delete a generation, and everything that only existed because of it.
-- ---------------------------------------------------------------------------
create or replace function public.delete_generation(p_generation uuid)
returns table(assets_purged integer, projects_deleted integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner    uuid;
  v_projects integer := 0;
  v_assets   integer := 0;
begin
  -- OWNERSHIP IS CHECKED HERE, not left to RLS. This is `security definer`, so
  -- RLS does not apply inside it — a version that skipped this check would let
  -- any signed-in user delete any generation by id.
  select g.user_id into v_owner from public.generations g where g.id = p_generation;
  if v_owner is null then
    raise exception 'delete_generation: no such generation %', p_generation
      using errcode = 'no_data_found';
  end if;
  -- THERE IS NO `auth.uid()` IN A SERVER CONTEXT, and the first version of this
  -- check did not account for it: written as `v_owner is distinct from
  -- auth.uid()`, it refused EVERY server-side call — including the
  -- account-deletion path this function exists to be usable from — by comparing
  -- a real owner against NULL. Found by calling it: it returned "no such
  -- generation" for a generation that plainly existed.
  --
  -- The second version tested `current_user <> 'service_role'`, which was also
  -- wrong, and wrong in the way that matters: it named ONE privileged role, and
  -- a connection arriving as `postgres` (which is what the dashboard and the
  -- migration runner use) failed it. A guard keyed to a role NAME is a guard
  -- that silently changes meaning with the connection.
  --
  -- What the rule actually is: A SIGNED-IN CALLER MUST OWN THE ROW. `auth.uid()`
  -- is non-null exactly when there is a signed-in caller, so that is what is
  -- tested. A null uid means no end user is making this request — a server
  -- acting on a decision it already authorised — and `execute` is revoked from
  -- `anon` and `public`, so a null uid cannot arrive from the internet.
  if auth.uid() is not null and v_owner is distinct from auth.uid() then
    -- Deliberately the SAME message as "no such generation" would be, so this
    -- cannot be used to discover which ids exist.
    raise exception 'delete_generation: no such generation %', p_generation
      using errcode = 'no_data_found';
  end if;

  -- 1. PROJECTS FIRST. They reference `media_assets` with NO ACTION, so the
  --    assets cannot go while a project still points at them. Their own
  --    children (plans, decisions, events, outputs, overlays, director calls)
  --    cascade from here.
  delete from public.edit_projects where generation_id = p_generation;
  get diagnostics v_projects = row_count;

  -- 2. THE GENERATION'S OWN POINTER AT ITS SOURCE, WHICH IS THE SECOND NO-ACTION
  --    KEY AND WAS MISSED BY THE FIRST VERSION OF THIS FUNCTION.
  --
  --    `generations.source_asset_id` references `media_assets(id)` with NO
  --    ACTION (0076) — the same shape as `edit_projects.source_asset_id`, which
  --    this function's header does account for. Deleting the assets while the
  --    generation row still points at one raises 23503, so the delete failed for
  --    exactly the generations the feature exists for: the ones with a recording.
  --
  --    IT DID NOT SHOW UP IN TESTING, and the reason is worth writing down.
  --    Production currently has ZERO generations with a `source_asset_id` —
  --    editor v2 has never completed a run — so the fixture that exercised this
  --    against production was not representative of the case that matters, and
  --    it passed. The first real recording would have found it instead.
  --
  --    Nulling rather than reordering: the row is about to be deleted anyway, and
  --    an UPDATE here is legible where a reversed delete order would silently
  --    depend on `media_assets.generation_id` being SET NULL.
  update public.generations set source_asset_id = null where id = p_generation;

  -- 3. THEN THE ASSETS, which is the step that was missing entirely. Each row
  --    deleted here fires 0099's trigger and queues the byte purge. This is the
  --    only reason the footage leaves storage.
  delete from public.media_assets where generation_id = p_generation;
  get diagnostics v_assets = row_count;

  -- 4. Then the generation. `posts` survives with a null link — see the header.
  delete from public.generations where id = p_generation;

  return query select v_assets, v_projects;
end;
$$;

comment on function public.delete_generation(uuid) is
  'Deletes a generation, its edit projects, and its media assets IN THAT ORDER — '
  'the order is load-bearing, and the asset delete is what queues 0099''s byte purge. '
  'Posts survive with a null generation link: a post is a fact about the world. '
  'Ownership is checked inside, because security definer bypasses RLS.';

revoke all on function public.delete_generation(uuid) from public, anon;
grant execute on function public.delete_generation(uuid) to authenticated;
grant execute on function public.delete_generation(uuid) to service_role;
