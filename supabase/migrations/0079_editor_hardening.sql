-- Editor hardening from the Phase-2 advisor review (corrective, forward-only —
-- 0076 is applied and immutable, so these are re-creates, not edits).
--
-- 1. Pin search_path (pg_catalog, public) on the Phase-1 functions the linter
--    flagged as role-mutable. Bodies unchanged and already schema-qualified.
-- 2. Init-plan the media_assets read policy: (select auth.uid()) evaluates
--    once per statement instead of per row.
-- 3. Covering index for the generations.source_asset_id FK.

create or replace function public.media_assets_guard_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = new.status then
    return new;
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

create or replace function public.editor_finalize_source(p_asset_id uuid, p_object_bytes bigint default null, p_object_etag text default null)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
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
           size_bytes = coalesce(p_object_bytes, size_bytes),
           metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
             'finalized_bytes', p_object_bytes, 'finalized_etag', p_object_etag))
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

create or replace function public.editor_link_ready_source(p_asset_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
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
            and cur.seq < a.seq
       )
     );
  get diagnostics linked = row_count;
  return linked > 0;
end;
$$;

-- create-or-replace preserves grants, but re-assert the posture explicitly.
revoke all on function public.editor_finalize_source(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.media_assets_guard_transition() from public, anon, authenticated;
revoke all on function public.editor_link_ready_source(uuid) from public, anon, authenticated;

drop policy "media_assets read" on public.media_assets;
create policy "media_assets read" on public.media_assets
  for select to authenticated
  using (owner_id = (select auth.uid()) or owner_id in (select workspace_peers()));

create index if not exists generations_source_asset_idx on public.generations (source_asset_id);
