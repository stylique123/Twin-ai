-- Editor v2 — Phase 2: editor schema, security, and idempotent enqueue.
--
-- Adds the four editor tables (edit_projects, media_analyses, edit_plans,
-- edit_events) with owner/workspace RLS and EXPLICIT grants only, plus the
-- atomic editor_start_project() function behind the start-editor-v2 endpoint.
--
-- Phase-2 boundary: this migration creates state and exactly one queued
-- `editor_v2` job per project. NO worker handler exists yet (Phase 3) — the
-- job type is not in the worker registry, so queued jobs simply wait. No AI
-- provider, renderer, analysis, plan, output, or credit charge is involved.
--
-- Grant posture (the 0075/0076/0077 lesson, baked in from the start): platform
-- default privileges are revoked explicitly; clients get RLS-scoped SELECT and
-- NOTHING else. Every write path is server-owned.

-- ---------------------------------------------------------------------------
-- edit_projects — one row per one-click edit request. The idempotency spine.
-- ---------------------------------------------------------------------------
create table public.edit_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  generation_id uuid not null references public.generations(id) on delete cascade,
  source_asset_id uuid not null references public.media_assets(id),
  status text not null default 'queued'
    check (status in ('queued','inspecting','transcribing','analyzing','directing',
                      'compiling','rendering','validating','completed','failed','cancelled')),
  idempotency_key uuid not null,
  analysis_version text,
  director_version text,
  compiler_version text,
  renderer_version text,
  output_asset_id uuid references public.media_assets(id),
  failure_code text,
  failure_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- Repeated/concurrent requests with the same key converge on ONE project.
create unique index edit_projects_idem_uniq on public.edit_projects (owner_id, idempotency_key);
-- One ACTIVE first-edit project per source (versioned re-edits arrive later
-- with an explicit mechanism, not by accident).
create unique index edit_projects_active_source_uniq on public.edit_projects (source_asset_id)
  where status not in ('completed','failed','cancelled');
create index edit_projects_owner_idx on public.edit_projects (owner_id, created_at desc);
create index edit_projects_generation_idx on public.edit_projects (generation_id, created_at desc);

-- Identity columns are IMMUTABLE after creation — ownership, the source, the
-- generation, and the idempotency key can never be repointed, for any role
-- including service_role. Lifecycle columns (status, versions, output,
-- failure, timestamps) remain worker-writable (Phase 3+).
create or replace function public.edit_projects_guard_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is distinct from old.owner_id
     or new.generation_id is distinct from old.generation_id
     or new.source_asset_id is distinct from old.source_asset_id
     or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'edit_projects: owner/generation/source/idempotency_key are immutable';
  end if;
  return new;
end;
$$;

create trigger trg_edit_projects_immutable
  before update on public.edit_projects
  for each row execute function public.edit_projects_guard_immutable();

alter table public.edit_projects enable row level security;
create policy "edit_projects read" on public.edit_projects
  for select to authenticated
  using (owner_id = auth.uid() or owner_id in (select workspace_peers()));
grant select on public.edit_projects to authenticated;
revoke all on public.edit_projects from anon;
revoke insert, update, delete, truncate, references, trigger on public.edit_projects from authenticated;

-- ---------------------------------------------------------------------------
-- media_analyses — analyze-once cache (Phase 4+ writes; schema lands now).
-- ---------------------------------------------------------------------------
create table public.media_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_asset_id uuid not null references public.media_assets(id) on delete cascade,
  source_hash text not null,
  schema_version integer not null,
  analyzer_bundle_version text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create unique index media_analyses_reuse_uniq on public.media_analyses (source_hash, analyzer_bundle_version);
create index media_analyses_asset_idx on public.media_analyses (source_asset_id);

alter table public.media_analyses enable row level security;
create policy "media_analyses read" on public.media_analyses
  for select to authenticated
  using (owner_id = auth.uid() or owner_id in (select workspace_peers()));
grant select on public.media_analyses to authenticated;
revoke all on public.media_analyses from anon;
revoke insert, update, delete, truncate, references, trigger on public.media_analyses from authenticated;

-- ---------------------------------------------------------------------------
-- edit_plans — the canonical, versioned, hash-pinned EditPlan (Phase 8 writes).
-- ---------------------------------------------------------------------------
create table public.edit_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  edit_project_id uuid not null references public.edit_projects(id) on delete cascade,
  version integer not null,
  schema_version integer not null,
  plan jsonb not null,
  plan_hash text not null,
  status text not null default 'draft'
    check (status in ('draft','validated','rendering','rendered','rejected')),
  created_at timestamptz not null default now()
);
create unique index edit_plans_version_uniq on public.edit_plans (edit_project_id, version);

alter table public.edit_plans enable row level security;
create policy "edit_plans read" on public.edit_plans
  for select to authenticated
  using (owner_id = auth.uid() or owner_id in (select workspace_peers()));
grant select on public.edit_plans to authenticated;
revoke all on public.edit_plans from anon;
revoke insert, update, delete, truncate, references, trigger on public.edit_plans from authenticated;

-- ---------------------------------------------------------------------------
-- edit_events — append-only operational progress (stable message codes).
-- ---------------------------------------------------------------------------
create table public.edit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.edit_projects(id) on delete cascade,
  stage text not null,
  pct integer,
  message_code text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index edit_events_project_idx on public.edit_events (project_id, created_at);

alter table public.edit_events enable row level security;
create policy "edit_events read" on public.edit_events
  for select to authenticated
  using (exists (
    select 1 from public.edit_projects p
     where p.id = project_id
       and (p.owner_id = auth.uid() or p.owner_id in (select workspace_peers()))
  ));
grant select on public.edit_events to authenticated;
revoke all on public.edit_events from anon;
revoke insert, update, delete, truncate, references, trigger on public.edit_events from authenticated;

-- ---------------------------------------------------------------------------
-- editor_start_project(owner, generation, source, idempotency_key)
-- The atomic reconcile-or-create behind start-editor-v2:
--   one edit project + one queued editor_v2 job, in ONE transaction.
--
--  * Same idempotency key (retry, double-click, second tab/device) → the SAME
--    project, always. A queued project missing its job (lost insert) gets the
--    job reconciled on the next call — never a duplicate.
--  * A different key while a project is still ACTIVE for the same source →
--    the existing active project is returned (no second project, no second
--    job, nothing charged twice). Versioned re-edits are a later, explicit
--    feature.
--
-- Eligibility/authorization/quota are checked by the edge function BEFORE this
-- call (and ownership is re-checked here). Service-role execute only.
-- ---------------------------------------------------------------------------
create or replace function public.editor_start_project(
  p_owner uuid, p_generation uuid, p_source uuid, p_idempotency uuid
) returns public.edit_projects
language plpgsql
security definer
set search_path = public
as $$
declare
  proj public.edit_projects;
begin
  -- Reconcile by idempotency key first.
  select * into proj from public.edit_projects
   where owner_id = p_owner and idempotency_key = p_idempotency
   for update;
  if found then
    -- A key binds to ONE set of inputs, forever. Reusing it with a different
    -- generation/source is a caller bug — refuse loudly rather than silently
    -- returning a project for different work (the edge fn maps this to 409).
    if proj.generation_id is distinct from p_generation
       or proj.source_asset_id is distinct from p_source then
      raise exception 'idempotency_conflict: key is bound to different inputs';
    end if;
  end if;
  if not found then
    -- Reconcile by active project for this source (different key, same work).
    select * into proj from public.edit_projects
     where source_asset_id = p_source
       and status not in ('completed','failed','cancelled')
     for update;
  end if;

  if not found then
    -- Ownership re-check at the moment of creation (defense in depth; the
    -- edge function already verified this against live rows).
    perform 1 from public.media_assets a
      join public.generations g on g.id = p_generation
     where a.id = p_source and a.owner_id = p_owner and a.generation_id = p_generation
       and a.kind = 'source' and a.status = 'ready'
       and g.user_id = p_owner;
    if not found then
      raise exception 'editor_start_project: source/generation not eligible for owner';
    end if;
    begin
      insert into public.edit_projects (owner_id, generation_id, source_asset_id, idempotency_key)
      values (p_owner, p_generation, p_source, p_idempotency)
      returning * into proj;
    exception when unique_violation then
      -- Concurrent racer won (same key or same active source): converge.
      select * into proj from public.edit_projects
       where (owner_id = p_owner and idempotency_key = p_idempotency)
          or (source_asset_id = p_source and status not in ('completed','failed','cancelled'))
       order by created_at limit 1;
      if not found then
        raise exception 'editor_start_project: lost race but no project found';
      end if;
    end;
  end if;

  -- Exactly one queued job per project (dedup-keyed; reconciles lost inserts).
  if proj.status = 'queued' then
    insert into public.jobs (owner_id, type, status, payload, dedup_key)
    values (
      proj.owner_id, 'editor_v2', 'queued',
      jsonb_build_object('project_id', proj.id, 'generation_id', proj.generation_id,
                         'source_asset_id', proj.source_asset_id),
      'editor_v2:' || proj.id || ':1'
    )
    on conflict (dedup_key) where dedup_key is not null do nothing;
  end if;

  return proj;
end;
$$;

revoke all on function public.editor_start_project(uuid, uuid, uuid, uuid) from public;
revoke all on function public.editor_start_project(uuid, uuid, uuid, uuid) from anon;
revoke all on function public.editor_start_project(uuid, uuid, uuid, uuid) from authenticated;
