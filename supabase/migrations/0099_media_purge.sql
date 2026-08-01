-- 0099: deleting a recording deletes the recording.
--
-- WHAT WAS MISSING
--
-- Nothing in this repository ever removed a stored object. No `remove`, no
-- object DELETE, nowhere in the worker, the edge functions or the migrations.
--
-- Deleting a generation cascades the `media_assets` rows. Deleting an ACCOUNT
-- cascades from `auth.users` and drops them too. In BOTH cases the bytes stay:
-- `storage.objects` has no foreign key to `auth.users`, so every raw take — a
-- recording of a person's face and voice — survived indefinitely, unreferenced
-- and unauditable. `status = 'deleted'` was a label nothing acted on, and the
-- retention cron trims telemetry only (0066), never media.
--
-- WHY A TRIGGER RATHER THAN APPLICATION CODE
--
-- Because the routes to deletion are not all in one place, and the ones that
-- matter most are the ones nobody writes code for: a generation cascade, an
-- account cascade, and whatever gets added later by someone who does not know
-- this rule exists. A trigger covers every route including the future ones.
--
-- WHY A JOB RATHER THAN AN INLINE DELETE
--
-- Storage is a different service and can be slow, rate-limited or briefly
-- down. Deleting inline would either block the user's delete on a network call
-- or lose the intent when that call failed. The queued job retries; the ROW is
-- gone regardless, so the user's delete succeeds immediately and the bytes
-- follow. The handler treats a 404 as success, so a retry after a partial
-- success cannot dead-letter.
--
-- WHAT THIS DOES NOT DO
--
-- ACCOUNT DELETION is the case this was hardest to get right; see the owner
-- guard inside the function.
--
-- It does not sweep objects that never had a row (an upload that failed before
-- `create`, or a path written by the legacy bucket policy). Those need an
-- age-based reaper over storage prefixes, which is a separate change with a
-- different risk profile — a reaper that is wrong deletes live footage.

create or replace function public.enqueue_media_purge()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_bucket text;
  v_path   text;
  v_owner  uuid;
  v_asset  uuid;
begin
  -- AFTER DELETE gives OLD; AFTER UPDATE to 'deleted' also acts on OLD's
  -- location, because the path is immutable in practice and OLD is what the
  -- bytes were written under.
  v_bucket := old.bucket;
  v_path   := old.storage_path;
  v_owner  := old.owner_id;
  v_asset  := old.id;

  if v_bucket is null or v_path is null then
    return null;  -- nothing addressable to purge
  end if;

  -- ACCOUNT DELETION WOULD OTHERWISE FAIL ENTIRELY, and this is the case that
  -- matters most. Deleting an auth.users row cascades to media_assets, which
  -- fires this trigger, which inserted a job owned by the very user being
  -- removed — inside the same transaction, so jobs_owner_id_fkey rejected it
  -- and the whole account deletion rolled back. A purge feature that makes
  -- accounts undeletable is worse than the gap it closes.
  --
  -- The job does not need an owner: it is addressed by bucket and path and
  -- runs with the service role. So when the owner is on the way out, the
  -- attribution is dropped rather than the purge.
  if v_owner is not null and not exists (select 1 from auth.users u where u.id = v_owner) then
    v_owner := null;
  end if;

  -- max_attempts 5: storage being briefly unavailable is the expected failure,
  -- and it is worth retrying. The handler is idempotent (404 = success) so a
  -- retry after a partial success is harmless.
  insert into public.jobs (owner_id, type, status, max_attempts, payload)
  values (
    v_owner, 'purge_media', 'queued', 5,
    jsonb_build_object('bucket', v_bucket, 'path', v_path, 'asset_id', v_asset)
  );
  return null;
end;
$$;

comment on function public.enqueue_media_purge is
  'Queues deletion of the BYTES behind a media_asset that has gone away. Fires on DELETE and on status->deleted, so a generation cascade and an account cascade are both covered without application code.';

drop trigger if exists media_assets_purge_on_delete on public.media_assets;
create trigger media_assets_purge_on_delete
  after delete on public.media_assets
  for each row execute function public.enqueue_media_purge();

drop trigger if exists media_assets_purge_on_soft_delete on public.media_assets;
create trigger media_assets_purge_on_soft_delete
  after update of status on public.media_assets
  for each row
  when (new.status = 'deleted' and old.status is distinct from 'deleted')
  execute function public.enqueue_media_purge();
