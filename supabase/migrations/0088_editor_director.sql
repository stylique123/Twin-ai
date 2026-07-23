-- Editor v2 — Phase 7: the Director stage (mutable call ledger + immutable decision).
--
-- 1. edit_director_calls: a MUTABLE ledger tracking THE single pinned
--    gemini-3.5-flash generateContent call per project, with a fail-closed
--    state machine started -> received -> succeeded|failed, plus `unknown`
--    for an indeterminate crash-resume mid-call (NEVER a second provider call).
-- 2. edit_director_decisions: the IMMUTABLE, re-resolved Director decision.
--    Append-only; a DB trigger independently re-verifies the filler guard so
--    filler removal cannot be enabled even by a service-role mistake.
-- 3. Fenced service-role RPCs (assert lease + attempt token) that drive the
--    ledger and persist the decision. All writes are server-owned; clients get
--    SELECT-only RLS (owner / workspace peers), mirroring the editor tables.
--
-- Boundary: this migration adds Director persistence ONLY. It does NOT write
-- edit_plans (Phase 8), does not set output_asset_id, and does not enable the
-- stage in production (the worker gates the real directing path behind
-- EDITOR_DIRECTOR_ENABLED; unset => directing stays simulated).

-- ---------------------------------------------------------------------------
-- 1. edit_director_calls — mutable single-call ledger
-- ---------------------------------------------------------------------------
create table public.edit_director_calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  edit_project_id uuid not null references public.edit_projects(id) on delete cascade,
  source_asset_id uuid not null,
  attempt integer not null,
  envelope_sha256 text not null check (envelope_sha256 ~ '^[0-9a-f]{64}$'),
  model text not null,
  provider text not null,
  state text not null check (state in ('started','received','succeeded','failed','unknown')),
  response_sha256 text check (response_sha256 ~ '^[0-9a-f]{64}$'),
  failure_code text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Exactly one call per project, ever (idempotency / single-call spine).
create unique index edit_director_calls_project_uniq on public.edit_director_calls (edit_project_id);

alter table public.edit_director_calls enable row level security;
create policy "edit_director_calls read" on public.edit_director_calls
  for select to authenticated
  using (owner_id = (select auth.uid()) or owner_id in (select workspace_peers()));
grant select on public.edit_director_calls to authenticated;
revoke all on public.edit_director_calls from anon;
revoke insert, update, delete, truncate, references, trigger on public.edit_director_calls from authenticated;

-- State-machine + identity guard (defense in depth around the RPCs).
create or replace function public.edit_director_calls_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.state in ('succeeded','failed','unknown') then
      raise exception 'edit_director_calls: state % is terminal and immutable', old.state;
    end if;
    if not (
      old.state = new.state or
      (old.state = 'started'  and new.state in ('received','failed','unknown')) or
      (old.state = 'received' and new.state in ('succeeded','failed','unknown'))
    ) then
      raise exception 'edit_director_calls: illegal transition % -> %', old.state, new.state;
    end if;
    if new.edit_project_id <> old.edit_project_id or new.owner_id <> old.owner_id then
      raise exception 'edit_director_calls: identity is immutable';
    end if;
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() = 1 then
    raise exception 'edit_director_calls: direct deletes are not permitted (retention runs via the project cascade)';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger trg_edit_director_calls_guard
  before update or delete on public.edit_director_calls
  for each row execute function public.edit_director_calls_guard();
revoke all on function public.edit_director_calls_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. edit_director_decisions — immutable, re-resolved decision
-- ---------------------------------------------------------------------------
create table public.edit_director_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  edit_project_id uuid not null references public.edit_projects(id) on delete cascade,
  director_call_id uuid not null references public.edit_director_calls(id) on delete cascade,
  schema_version integer not null,
  envelope_sha256 text not null check (envelope_sha256 ~ '^[0-9a-f]{64}$'),
  response_sha256 text not null check (response_sha256 ~ '^[0-9a-f]{64}$'),
  decision jsonb not null,
  decision_sha256 text not null check (decision_sha256 ~ '^[0-9a-f]{64}$'),
  model text not null,
  provider text not null,
  -- HARD invariant: auto filler removal is off for Phase 7.
  auto_filler_removal boolean not null default false check (auto_filler_removal = false),
  created_at timestamptz not null default now()
);
create unique index edit_director_decisions_project_uniq on public.edit_director_decisions (edit_project_id);

alter table public.edit_director_decisions enable row level security;
create policy "edit_director_decisions read" on public.edit_director_decisions
  for select to authenticated
  using (owner_id = (select auth.uid()) or owner_id in (select workspace_peers()));
grant select on public.edit_director_decisions to authenticated;
revoke all on public.edit_director_decisions from anon;
revoke insert, update, delete, truncate, references, trigger on public.edit_director_decisions from authenticated;

-- DB-independent filler guard + shape sanity: re-parse the decision selections.
create or replace function public.edit_director_decisions_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  sel jsonb;
begin
  if tg_op = 'UPDATE' then
    raise exception 'edit_director_decisions is append-only: decisions are immutable once written';
  end if;
  if tg_op = 'DELETE' then
    if pg_trigger_depth() = 1 then
      raise exception 'edit_director_decisions is append-only: direct deletes are not permitted';
    end if;
    return old;
  end if;
  -- INSERT: enforce the filler guard independently of the worker.
  if new.auto_filler_removal is distinct from false then
    raise exception 'director_filler_disabled: auto_filler_removal must be false';
  end if;
  if jsonb_typeof(new.decision -> 'selections') is distinct from 'array' then
    raise exception 'director_decision_invalid: decision.selections must be an array';
  end if;
  for sel in select value from jsonb_array_elements(new.decision -> 'selections') as t(value) loop
    if (sel ->> 'kind') = 'filler' then
      raise exception 'director_filler_disabled: a filler selection is not permitted';
    end if;
    if (sel ->> 'selectionEnabled') is distinct from '1' then
      raise exception 'director_filler_disabled: every selection must be selection-enabled';
    end if;
    if coalesce(sel ->> 'candidateIndex', '') !~ '^[0-9]+$' then
      raise exception 'director_decision_invalid: candidateIndex must be a non-negative integer';
    end if;
  end loop;
  return new;
end;
$$;
create trigger trg_edit_director_decisions_guard
  before insert or update or delete on public.edit_director_decisions
  for each row execute function public.edit_director_decisions_guard();
revoke all on function public.edit_director_decisions_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fenced RPCs (assert lease + attempt token first; job-before-project lock)
-- ---------------------------------------------------------------------------

-- 3a. Begin the single call. Returns a directive the worker acts on:
--   'started'           -> proceed to the ONE provider call
--   'already_succeeded' -> a decision already exists; reuse it, no call
--   'indeterminate'     -> in-flight/unknown crash-resume; permanent fail, NO call
--   'failed'            -> a prior definitive failure; permanent fail, no retry
-- The 'unknown' transition is COMMITTED (no raise) so the state persists.
create function public.editor_director_begin(
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

  select * into existing from public.edit_director_calls where edit_project_id = p_project for update;
  if found then
    if existing.state = 'succeeded' then
      return 'already_succeeded';
    elsif existing.state = 'failed' then
      return 'failed';
    elsif existing.state = 'unknown' then
      return 'indeterminate';
    else
      -- started | received: indeterminate resume — mark unknown (persists) and report.
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

-- 3b. Provider response received (charge is now known); persist BEFORE validation.
create function public.editor_director_receive(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer, p_response_sha256 text
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
     set state = 'received', response_sha256 = p_response_sha256, updated_at = now()
   where edit_project_id = p_project and state = 'started';
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'director_state: no started director call for project %', p_project;
  end if;
end;
$$;

-- 3c. Success: persist the immutable re-resolved decision + close the call.
create function public.editor_director_succeed(
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

  insert into public.edit_director_decisions
    (owner_id, edit_project_id, director_call_id, schema_version, envelope_sha256, response_sha256,
     decision, decision_sha256, model, provider, auto_filler_removal)
  values (proj.owner_id, p_project, call_row.id, p_schema_version, call_row.envelope_sha256, p_response_sha256,
          p_decision, p_decision_sha256, p_model, p_provider, false)
  returning id into decision_id;

  update public.edit_director_calls set state = 'succeeded', updated_at = now() where id = call_row.id;
  update public.edit_projects set director_version = p_model || '/' || p_schema_version::text where id = p_project;

  return decision_id;
end;
$$;

-- 3d. Definitive clean failure of the call (e.g. unparseable/invalid decision).
create function public.editor_director_fail(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer, p_failure_code text
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
     set state = 'failed', failure_code = p_failure_code, updated_at = now()
   where edit_project_id = p_project and state in ('started','received');
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'director_state: no in-flight director call to fail for project %', p_project;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: server-owned writes only.
-- ---------------------------------------------------------------------------
revoke all on function public.editor_director_begin(uuid, uuid, text, integer, uuid, text, text, text)     from public, anon, authenticated;
revoke all on function public.editor_director_receive(uuid, uuid, text, integer, text)                     from public, anon, authenticated;
revoke all on function public.editor_director_succeed(uuid, uuid, text, integer, integer, text, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.editor_director_fail(uuid, uuid, text, integer, text)                        from public, anon, authenticated;

grant execute on function public.editor_director_begin(uuid, uuid, text, integer, uuid, text, text, text)     to service_role;
grant execute on function public.editor_director_receive(uuid, uuid, text, integer, text)                     to service_role;
grant execute on function public.editor_director_succeed(uuid, uuid, text, integer, integer, text, jsonb, text, text, text) to service_role;
grant execute on function public.editor_director_fail(uuid, uuid, text, integer, text)                        to service_role;
