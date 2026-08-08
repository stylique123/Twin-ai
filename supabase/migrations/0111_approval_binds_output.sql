-- 0111 — APPROVAL-1: AN APPROVAL NAMES THE VIDEO IT APPROVED.
--
-- Today approval is `generations.approved`, a bare boolean, plus
-- `review_status`. Neither records WHAT was approved. That is not a missing
-- field, it is a missing fact, and the consequences are specific:
--
--   * A creator re-edits after a client approved. A new render replaces the old
--     one. `approved` is still true. The video that goes out was approved by
--     nobody.
--   * A client approves, then the render is re-run for an unrelated reason —
--     a retry, a caption fix. Same outcome.
--   * Nothing anywhere can answer "which exact file did they say yes to",
--     which is the only question that matters in a dispute.
--
-- The audits name this APPROVAL-1 and put it beside PUBLISH-1 as the two open
-- links in the chain. It cannot be closed by a UI change, because the fact
-- being lost was never written down.
--
-- ── WHAT IS RECORDED, AND WHY THESE THREE ────────────────────────────────
--
-- `approved_output_asset_id` is the answer. It is the immutable identity of the
-- bytes: `media_assets` rows are never rewritten in place, and 0096's
-- completion path sets `edit_projects.output_asset_id` exactly once. So an id
-- recorded here still means the same file tomorrow.
--
-- `approved_edit_project_id` is the lineage — which run produced it, and
-- therefore which plan, decision and snapshot. It is redundant with the asset
-- for equality checks and NOT redundant for explaining a supersession to a
-- human ("this was approved on the edit you ran on Tuesday").
--
-- `approved_at` is when. Without it, a superseded approval cannot be described
-- in the only terms a creator will understand.
--
-- ── LEGACY APPROVALS ARE NULL, AND NULL IS NOT "NOT APPROVED" ────────────
--
-- Every existing approval predates this column. Those creators DID approve
-- something — a legacy `edit_path` — and rewriting history to say otherwise
-- would be inventing a fact to make a new check pass. So NULL means "approved
-- before we recorded what", which readers must treat as approved-but-unbound
-- rather than as unapproved. The three-state rule, again, at the one place
-- where collapsing it would revoke a real client's real decision.
--
-- ── NO CLIENT WRITE ───────────────────────────────────────────────────────
--
-- Set only by the paths that actually take an approval: the owner's own toggle
-- and the public review function, both server-side. A client that could write
-- these could approve a video on someone else's behalf, which is the entire
-- thing an approval exists to prevent.

alter table public.generations
  add column if not exists approved_output_asset_id uuid references public.media_assets(id) on delete set null,
  add column if not exists approved_edit_project_id uuid references public.edit_projects(id) on delete set null,
  add column if not exists approved_at timestamptz;

-- The binding is meaningless unless `approved` is true. A row carrying an
-- approved asset while `approved` is false is a contradiction that a reader
-- would have to resolve by guessing, and the guess would decide whether a video
-- ships.
alter table public.generations
  drop constraint if exists generations_approval_binding_coherent;
alter table public.generations
  add constraint generations_approval_binding_coherent
  check (
    approved = true
    or (approved_output_asset_id is null
        and approved_edit_project_id is null
        and approved_at is null)
  );

-- Finding "what was approved" for a project, which the supersession check asks
-- on every render of the review and result screens.
create index if not exists generations_approved_output_idx
  on public.generations (approved_output_asset_id)
  where approved_output_asset_id is not null;

comment on column public.generations.approved_output_asset_id is
  'APPROVAL-1. The exact output asset a client/owner approved. NULL on approvals '
  'predating 0111 — approved-but-unbound, NOT unapproved. Server-write only.';

-- ---------------------------------------------------------------------------
-- Recording an approval, atomically with the thing it approves.
-- ---------------------------------------------------------------------------
-- A two-statement version (set approved, then set the binding) can be
-- interrupted between them and leaves exactly the contradiction the CHECK above
-- forbids — so the write is one statement, and the binding is resolved INSIDE
-- it rather than passed in by a caller who might name a different project.
--
-- The output is resolved the same way `resolveFinishedOutputs` does on the
-- client, and for the same reason: a generation can legitimately have more than
-- one completed project (0078's uniqueness index is partial), so "the current
-- output" needs an explicit rule rather than whichever row comes back first.
-- Newest completion wins; a re-edit supersedes what it re-edited.
create or replace function public.set_generation_approval(
  p_generation uuid,
  p_approved boolean,
  p_review_status text default null
) returns table(approved boolean, output_asset_id uuid, edit_project_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
-- SCALARS, NOT A RECORD, and the difference is a live bug rather than a style
-- preference.
--
-- The first version declared `proj record` and filled it only inside
-- `if p_approved then`. On the UNAPPROVE path that branch is skipped, so `proj`
-- has no structure, and plpgsql raises `record "proj" is not assigned yet` the
-- moment the UPDATE mentions `proj.output_asset_id` — the surrounding
-- `case when p_approved` does NOT save it, because the record has no fields to
-- reference at all.
--
-- That path is what `review/index.ts` calls when a client requests CHANGES, so
-- the whole request-changes flow would have 500'd. Found by CALLING the function
-- on staging rather than by watching the migration apply cleanly, which it did.
--
-- Scalar variables initialise to NULL, so both paths are always well-defined.
declare
  v_project uuid;
  v_asset   uuid;
begin
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
         -- UNAPPROVING CLEARS THE BINDING. Leaving a stale asset id behind
         -- would let a later re-approval look bound to something nobody
         -- re-examined. `v_asset`/`v_project` are already NULL on that path.
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
  from public, anon, authenticated;
grant execute on function public.set_generation_approval(uuid, boolean, text) to service_role;
