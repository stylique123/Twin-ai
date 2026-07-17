-- Editor v2 — Phase 1: durable source-asset truth.
--
-- A finished teleprompter recording / upload must become exactly ONE validated,
-- durable, privately owned source asset that survives refresh and devices and can
-- be referenced safely by ID. The browser-local pointer becomes a convenience
-- cache only; this table is the authority.
--
-- media_assets tracks source (and later: music, output, thumbnail) assets.
-- Lifecycle: uploading -> validating -> ready | rejected  (deleted = retention).
-- Rows are created/updated ONLY by the `source-asset` edge function and the
-- worker's `validate_source` job (service role). Clients get SELECT via RLS.
-- All media time is integer milliseconds (duration_ms), sizes in bytes.

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  generation_id uuid references public.generations(id) on delete set null,
  kind text not null check (kind in ('source', 'music', 'output', 'thumbnail')),
  -- One recording attempt = one asset, enforced by the DATABASE (not the
  -- browser): the client mints a recording_attempt_id per take, and repeats of
  -- `create` across refreshes/tabs/devices converge on this same row. A retake
  -- intentionally gets a NEW attempt id (and therefore a new asset).
  recording_attempt_id uuid,
  bucket text not null,
  storage_path text not null unique,
  content_sha256 text,
  mime_type text,
  size_bytes bigint,
  duration_ms bigint,
  width integer,
  height integer,
  frame_rate_num integer,
  frame_rate_den integer,
  rotation integer,
  has_audio boolean,
  status text not null default 'uploading'
    check (status in ('uploading', 'validating', 'ready', 'rejected', 'deleted')),
  -- Bumped when a rejected asset is explicitly re-validated; part of the
  -- validation job's dedup identity (validate_source:{id}:{version}).
  validation_version integer not null default 1,
  -- Structured details (probe output, rejection reason). NEVER used for authorization.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  constraint media_assets_source_needs_attempt
    check (kind <> 'source' or recording_attempt_id is not null)
);

create index media_assets_generation_idx on public.media_assets (generation_id, kind, created_at desc);
create index media_assets_owner_idx on public.media_assets (owner_id, created_at desc);
-- The idempotency backbone: the same attempt can never mint two assets, no
-- matter how many tabs/devices/retries call `create`.
create unique index media_assets_attempt_uniq
  on public.media_assets (owner_id, generation_id, recording_attempt_id)
  where recording_attempt_id is not null;

-- ---------------------------------------------------------------------------
-- State-transition guard. Only these movements are legal:
--   uploading  -> validating
--   validating -> ready | rejected
--   rejected   -> validating   (explicit retry: requires validation_version+1)
--   any        -> deleted      (retention/cleanup; never back out of deleted)
-- Everything else — ready->uploading, ready->rejected, rejected->ready without
-- a validation pass, resurrecting deleted rows — is refused at the database,
-- for every role including service_role. Measured media fields + `ready` are
-- written only by the validating worker (clients have no UPDATE at all).
-- ---------------------------------------------------------------------------
create or replace function public.media_assets_guard_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then
    return new; -- fact updates within a state (size, sha, probe results) are fine
  end if;
  if new.status = 'deleted' then
    return new;
  end if;
  if old.status = 'uploading' and new.status = 'validating' then
    return new;
  end if;
  if old.status = 'validating' and new.status in ('ready', 'rejected') then
    return new;
  end if;
  if old.status = 'rejected' and new.status = 'validating' then
    if new.validation_version <> old.validation_version + 1 then
      raise exception 'media_assets: rejected->validating requires validation_version bump (got % after %)',
        new.validation_version, old.validation_version;
    end if;
    return new;
  end if;
  raise exception 'media_assets: illegal status transition % -> %', old.status, new.status;
end;
$$;

create trigger trg_media_assets_guard
  before update of status on public.media_assets
  for each row execute function public.media_assets_guard_transition();

alter table public.media_assets enable row level security;

-- Reads: the owner and their workspace peers (the same sharing seam the takes/
-- edits storage buckets use). No client INSERT/UPDATE/DELETE policies exist —
-- writes go through the service role only, so a client can never mark its own
-- asset "ready" or forge ownership.
create policy "media_assets read" on public.media_assets
  for select to authenticated
  using (owner_id = auth.uid() or owner_id in (select workspace_peers()));

grant select on public.media_assets to authenticated;
-- Supabase default privileges auto-grant table access to anon/authenticated on
-- creation. RLS already yields zero rows / denies writes (verified on staging),
-- but the audited posture is explicit grants only — same lesson as migration
-- 0075: revoke what the defaults handed out.
revoke all on public.media_assets from anon;
revoke insert, update, delete on public.media_assets from authenticated;

-- Durable source pointer on the generation. Authoritative over the legacy
-- compatibility field take_path (which the validator also writes so existing
-- playback keeps working). Written only by the service role.
alter table public.generations
  add column if not exists source_asset_id uuid references public.media_assets(id);

comment on column public.generations.source_asset_id is
  'Durable pointer to the validated source recording (media_assets.id). Authoritative; take_path is a compatibility projection.';

-- ---------------------------------------------------------------------------
-- Job dedup identity. A validation job is validate_source:{asset}:{version};
-- the partial unique index makes "exactly one job per asset version" a database
-- guarantee instead of an application hope. Other job types are unaffected
-- (their dedup_key stays null).
-- ---------------------------------------------------------------------------
alter table public.jobs add column if not exists dedup_key text;
create unique index if not exists jobs_dedup_key_uniq
  on public.jobs (dedup_key)
  where dedup_key is not null;

-- ---------------------------------------------------------------------------
-- editor_finalize_source(asset, object_bytes)
-- The atomic finalize step. Storage, the asset row, and the job queue cannot
-- share a browser transaction — but the DB half CAN be one transaction:
--   uploading -> validating  +  insert the validation job if absent
-- happen together here, under a row lock. Repeating finalize (timeout retries,
-- second tab, second device) reconciles: it converges on the same job via the
-- dedup key and reports the current state instead of erroring or duplicating.
-- If a previous attempt flipped the row but failed to enqueue, the next call
-- inserts the missing job — the uploaded object is never deleted and the asset
-- is never reset to a misleading state.
-- Service-role only (the source-asset edge function calls it after verifying
-- caller ownership and that the storage object really exists).
-- ---------------------------------------------------------------------------
create or replace function public.editor_finalize_source(p_asset_id uuid, p_object_bytes bigint default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.media_assets;
begin
  select * into a from public.media_assets where id = p_asset_id for update;
  if not found then
    raise exception 'editor_finalize_source: asset % not found', p_asset_id;
  end if;

  if a.status = 'uploading' then
    update public.media_assets
       set status = 'validating',
           size_bytes = coalesce(p_object_bytes, size_bytes)
     where id = p_asset_id
     returning * into a;
  end if;

  if a.status = 'validating' then
    insert into public.jobs (owner_id, type, status, payload, dedup_key)
    values (
      a.owner_id, 'validate_source', 'queued',
      jsonb_build_object('asset_id', a.id, 'generation_id', a.generation_id, 'validation_version', a.validation_version),
      'validate_source:' || a.id || ':' || a.validation_version
    )
    on conflict (dedup_key) where dedup_key is not null do nothing;
  end if;

  return a.status;
end;
$$;

revoke all on function public.editor_finalize_source(uuid, bigint) from public;
revoke all on function public.editor_finalize_source(uuid, bigint) from anon;
revoke all on function public.editor_finalize_source(uuid, bigint) from authenticated;

-- ---------------------------------------------------------------------------
-- editor_link_ready_source(asset)
-- The ONE privileged generation update, with retake-race protection: a slower
-- validation of an OLDER take must never overwrite the pointer to a NEWER one.
-- Rule (documented in docs/editor-v2-source-asset.md): the generation points to
-- the newest ready source by (created_at, id); explicit user selection can
-- arrive later as selected_source_asset_id without changing this seam.
-- Returns true when the pointer was set/kept, false when a newer source won.
-- Service-role only (called by the worker after marking the asset ready).
-- ---------------------------------------------------------------------------
create or replace function public.editor_link_ready_source(p_asset_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  linked integer;
begin
  update public.generations g
     set source_asset_id = a.id,
         take_path = a.storage_path
    from public.media_assets a
   where a.id = p_asset_id
     and a.status = 'ready'
     and a.kind = 'source'
     and g.id = a.generation_id
     and g.user_id = a.owner_id
     and (
       g.source_asset_id is null
       or g.source_asset_id = a.id
       or exists (
         select 1 from public.media_assets cur
          where cur.id = g.source_asset_id
            and (cur.created_at, cur.id) < (a.created_at, a.id)
       )
     );
  get diagnostics linked = row_count;
  return linked > 0;
end;
$$;

revoke all on function public.editor_link_ready_source(uuid) from public;
revoke all on function public.editor_link_ready_source(uuid) from anon;
revoke all on function public.editor_link_ready_source(uuid) from authenticated;
