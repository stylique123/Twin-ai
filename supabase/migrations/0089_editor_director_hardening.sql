-- Editor v2 — Phase 7 hardening: bind Director RPCs to the ledger + project.
--
-- 1. editor_director_begin: bind p_source_asset to edit_projects.source_asset_id
--    (reject a caller that names a different/foreign asset).
-- 2. editor_director_succeed: require the caller's response hash / model /
--    provider to MATCH the received ledger row, and PERSIST the decision's
--    response_sha256 / model / provider / envelope_sha256 FROM THE LEDGER — not
--    from duplicate, independently-trusted caller inputs.
-- 3. editor_director_mark_unknown: a deliberate started|received -> unknown
--    transition for cancellation-after-dispatch (delivery/charge uncertain), so
--    a resume can NEVER issue a second provider call.
--
-- Additive over 0088 (already applied). CREATE OR REPLACE preserves existing
-- grants; the new function is granted explicitly. No table/RLS change.

-- 1. begin: bind the source asset to the project.
create or replace function public.editor_director_begin(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer,
  p_source_asset uuid, p_envelope_sha256 text, p_model text, p_provider text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
  existing public.edit_director_calls;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);

  select * into proj from public.edit_projects where id = p_project for update;
  if not found then
    raise exception 'director_wrong_stage: project % not found', p_project;
  end if;
  if proj.status <> 'directing' then
    raise exception 'director_wrong_stage: project % is % (expected directing)', p_project, proj.status;
  end if;
  -- AUTHORITY: the source asset must be THIS project's pinned source.
  if p_source_asset is distinct from proj.source_asset_id then
    raise exception 'director_source_mismatch: source asset % is not project %''s source', p_source_asset, p_project;
  end if;

  select * into existing from public.edit_director_calls where edit_project_id = p_project for update;
  if found then
    if existing.state = 'succeeded' then
      return 'already_succeeded';
    elsif existing.state = 'failed' then
      return 'failed';
    elsif existing.state = 'unknown' then
      return 'indeterminate';
    else
      update public.edit_director_calls set state = 'unknown', updated_at = now() where id = existing.id;
      return 'indeterminate';
    end if;
  end if;

  insert into public.edit_director_calls
    (owner_id, edit_project_id, source_asset_id, attempt, envelope_sha256, model, provider, state)
  values (proj.owner_id, p_project, p_source_asset, p_attempt, p_envelope_sha256, p_model, p_provider, 'started');
  return 'started';
end;
$$;

-- 2. succeed: require caller inputs to match the ledger; persist LEDGER identity.
create or replace function public.editor_director_succeed(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer,
  p_schema_version integer, p_response_sha256 text, p_decision jsonb, p_decision_sha256 text,
  p_model text, p_provider text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
  call_row public.edit_director_calls;
  decision_id uuid;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);
  select * into proj from public.edit_projects where id = p_project for update;
  if not found then
    raise exception 'director_state: project % not found', p_project;
  end if;

  select * into call_row from public.edit_director_calls where edit_project_id = p_project for update;
  if not found then
    raise exception 'director_state: no director call for project %', p_project;
  end if;
  if call_row.state <> 'received' then
    raise exception 'director_state: director call for project % is % (expected received)', p_project, call_row.state;
  end if;
  -- BIND to the received ledger row (reject duplicate/forged caller identity).
  if call_row.response_sha256 is distinct from p_response_sha256 then
    raise exception 'director_response_mismatch: response hash does not match the received ledger for project %', p_project;
  end if;
  if call_row.model is distinct from p_model then
    raise exception 'director_model_mismatch: model does not match the ledger for project %', p_project;
  end if;
  if call_row.provider is distinct from p_provider then
    raise exception 'director_provider_mismatch: provider does not match the ledger for project %', p_project;
  end if;

  -- Persist identity FROM THE LEDGER (call_row), never the caller's copies.
  insert into public.edit_director_decisions
    (owner_id, edit_project_id, director_call_id, schema_version, envelope_sha256, response_sha256,
     decision, decision_sha256, model, provider, auto_filler_removal)
  values (proj.owner_id, p_project, call_row.id, p_schema_version, call_row.envelope_sha256, call_row.response_sha256,
          p_decision, p_decision_sha256, call_row.model, call_row.provider, false)
  returning id into decision_id;

  update public.edit_director_calls set state = 'succeeded', updated_at = now() where id = call_row.id;
  update public.edit_projects set director_version = call_row.model || '/' || p_schema_version::text where id = p_project;

  return decision_id;
end;
$$;

-- 3. mark_unknown: cancellation-after-dispatch (delivery/charge uncertain).
create function public.editor_director_mark_unknown(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer, p_reason text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  n integer;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);
  update public.edit_director_calls
     set state = 'unknown', failure_code = p_reason, updated_at = now()
   where edit_project_id = p_project and state in ('started','received');
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'director_state: no in-flight director call to mark unknown for project %', p_project;
  end if;
end;
$$;

revoke all on function public.editor_director_mark_unknown(uuid, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.editor_director_mark_unknown(uuid, uuid, text, integer, text) to service_role;
