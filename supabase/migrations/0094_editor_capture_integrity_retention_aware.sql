-- Editor v2 — Phase 7 exit correction, follow-up 2: make the capture INTEGRITY
-- definition retention-aware.
--
-- Found by the staging migration step immediately after 0093 shipped:
--   0091: capture_backfill_inconsistent: 1 stored intent JSON/relational mismatch
--
-- This is a consequence OF 0093, not a pre-existing bug. Before 0093, deleting a
-- generation was impossible whenever a capture intent existed, so the post-retention
-- state below could never occur and `editor_backfill_capture_marker` never had to
-- describe it. Now that retention works, it does.
--
-- WHAT THE POST-RETENTION STATE LOOKS LIKE
-- Deleting a generation fires three different referential outcomes:
--   media_assets.generation_id            ON DELETE SET NULL  -> NULL
--   source_capture_intents.generation_id  ON DELETE SET NULL  -> NULL (0093 permits)
--   source_script_snapshots.generation_id NOT NULL, NO FK     -> keeps its value
-- and the intents' `intent` JSON keeps the original generationId, because those bytes
-- are immutable history covered by intent_sha256 — rewriting them would break the hash
-- the whole capture contract rests on.
--
-- So TWO of the integrity checks compared a cleared live pointer against a preserved
-- historical one and called the difference corruption:
--   * intent JSON generationId  vs  intents.generation_id      (this is the one that fired)
--   * snapshots.generation_id   vs  media_assets.generation_id (would have fired next)
-- Fixing only the first would have moved the failure, not removed it.
--
-- THE RULE, APPLIED TO BOTH
-- A NULL live pointer means retention ran, and the historical record is then
-- unconstrained. It is safe to trust NULL as proof: only an FK action can produce it,
-- because 0093 still refuses a directly-issued SET NULL at trigger depth 1. Two
-- NON-NULL ids that disagree remain corrupt and still raise.
--
-- Severity if it had reached production: `editor_backfill_capture_marker` runs at the
-- end of 0091. A first-time apply happens before any retention, so this would not have
-- broken the initial rollout — but any re-apply, environment rebuild, disaster-recovery
-- replay or integrity audit performed after a single generation deletion would report
-- corruption that is not there, on data that is perfectly sound.
--
-- Idempotent (create or replace); no schema change; no data change.

create or replace function public.editor_backfill_capture_marker() returns void language plpgsql as $$
declare bad int;
begin
  select count(*) into bad from public.media_assets a
    join public.source_capture_intents i on i.source_asset_id = a.id
   where a.kind = 'source' and a.status = 'ready'
     and not exists (select 1 from public.source_capture_manifests m where m.source_asset_id = a.id);
  if bad > 0 then
    raise exception 'capture_backfill_inconsistent: % ready source(s) with a capture intent but no manifest', bad using errcode = 'raise_exception';
  end if;
  select count(*) into bad from public.source_capture_manifests m
   where not exists (select 1 from public.source_capture_intents i where i.source_asset_id = m.source_asset_id);
  if bad > 0 then
    raise exception 'capture_backfill_inconsistent: % manifest(s) without a capture intent', bad using errcode = 'raise_exception';
  end if;
  select count(*) into bad from public.source_script_snapshots b
   where not exists (select 1 from public.source_capture_intents i where i.source_asset_id = b.source_asset_id);
  if bad > 0 then
    raise exception 'capture_backfill_inconsistent: % script binding(s) without a capture intent', bad using errcode = 'raise_exception';
  end if;
  select count(*) into bad from public.source_capture_intents i
    join public.media_assets a on a.id = i.source_asset_id where a.kind <> 'source';
  if bad > 0 then
    raise exception 'capture_backfill_inconsistent: % intent(s) attached to a non-source asset', bad using errcode = 'raise_exception';
  end if;
  select count(*) into bad from public.source_capture_intents i
    join public.media_assets a on a.id = i.source_asset_id
   where i.owner_id is distinct from a.owner_id or i.generation_id is distinct from a.generation_id;
  if bad > 0 then
    raise exception 'capture_backfill_inconsistent: % intent owner/generation linkage mismatch', bad using errcode = 'raise_exception';
  end if;
  select count(*) into bad from public.source_capture_manifests m
    join public.media_assets a on a.id = m.source_asset_id where m.owner_id is distinct from a.owner_id;
  if bad > 0 then
    raise exception 'capture_backfill_inconsistent: % manifest owner linkage mismatch', bad using errcode = 'raise_exception';
  end if;
  select count(*) into bad from public.source_script_snapshots b
    join public.media_assets a on a.id = b.source_asset_id
   where b.owner_id is distinct from a.owner_id
      -- RETENTION-AWARE: media_assets.generation_id is ON DELETE SET NULL, but
      -- source_script_snapshots.generation_id is NOT NULL with no FK, so after a
      -- generation is deleted the asset's pointer is NULL while the binding keeps
      -- its historical id. That divergence is retention, not corruption. This
      -- check never fired only because the intent check above fails first.
      or (a.generation_id is not null
          and b.generation_id is distinct from a.generation_id);
  if bad > 0 then
    raise exception 'capture_backfill_inconsistent: % binding owner/generation linkage mismatch', bad using errcode = 'raise_exception';
  end if;
  -- A manifest MUST agree with its intent: same origin AND same intent hash. A manifest
  -- minted for a different origin, or against a different capture intent, is corrupt.
  select count(*) into bad from public.source_capture_manifests m
    join public.source_capture_intents i on i.source_asset_id = m.source_asset_id
   where m.origin is distinct from i.origin;
  if bad > 0 then
    raise exception 'capture_backfill_inconsistent: % manifest origin differs from its intent', bad using errcode = 'raise_exception';
  end if;
  select count(*) into bad from public.source_capture_manifests m
    join public.source_capture_intents i on i.source_asset_id = m.source_asset_id
   where m.intent_sha256 is distinct from i.intent_sha256;
  if bad > 0 then
    raise exception 'capture_backfill_inconsistent: % manifest intent hash differs from its intent', bad using errcode = 'raise_exception';
  end if;
  -- A TELEPROMPTER intent MUST have EXACTLY ONE source-bound script snapshot, and that
  -- snapshot's SHA MUST equal the intent's immutable recording_script_sha256. Zero, many
  -- (structurally impossible — source_asset_id is the snapshot PK, but proven anyway), or
  -- a divergent SHA is corrupt provenance.
  select count(*) into bad from public.source_capture_intents i
   where i.origin = 'teleprompter'
     and ( (select count(*) from public.source_script_snapshots b where b.source_asset_id = i.source_asset_id) <> 1
        or not exists (select 1 from public.source_script_snapshots b
                        where b.source_asset_id = i.source_asset_id and b.snapshot_sha = i.recording_script_sha256) );
  if bad > 0 then
    raise exception 'capture_backfill_inconsistent: % teleprompter intent without exactly one matching script snapshot', bad using errcode = 'raise_exception';
  end if;
  -- An UPLOAD intent was NOT recorded against a script → it MUST carry NO script snapshot.
  select count(*) into bad from public.source_capture_intents i
   where i.origin = 'upload'
     and exists (select 1 from public.source_script_snapshots b where b.source_asset_id = i.source_asset_id);
  if bad > 0 then
    raise exception 'capture_backfill_inconsistent: % upload intent carries a script snapshot', bad using errcode = 'raise_exception';
  end if;
  -- Every stored intent's sha256 MUST recompute from its own canonical JSON (no tampered
  -- row whose hash silently disagrees with its bytes).
  select count(*) into bad from public.source_capture_intents i
   where i.intent_sha256 is distinct from public.editor_capture_intent_sha256(i.intent);
  if bad > 0 then
    raise exception 'capture_backfill_inconsistent: % stored intent hash does not recompute', bad using errcode = 'raise_exception';
  end if;
  -- Every stored intent's JSON MUST agree with its relational columns (origin,
  -- generation, source asset, attempt, recording-script SHA), so a row cannot present
  -- one identity relationally while its signed bytes claim another.
  select count(*) into bad from public.source_capture_intents i
   where (i.intent->>'origin') is distinct from i.origin
      -- RETENTION-AWARE: generations ON DELETE SET NULL clears the live pointer
      -- while the signed intent bytes keep the original id (they are immutable
      -- history, and rewriting them would break intent_sha256). A NULL column
      -- therefore PROVES retention ran -- only an FK action can null it, since
      -- 0093 still refuses a directly-issued SET NULL. Two NON-NULL ids that
      -- disagree is still a row presenting two identities, and still corrupt.
      or (i.generation_id is not null
          and (i.intent->>'generationId') is distinct from i.generation_id::text)
      or (i.intent->>'sourceAssetId') is distinct from i.source_asset_id::text
      or (i.intent->>'clientAttemptId') is distinct from i.client_attempt_id::text
      or (i.intent->>'recordingScriptSha256') is distinct from i.recording_script_sha256;
  if bad > 0 then
    raise exception 'capture_backfill_inconsistent: % stored intent JSON/relational mismatch', bad using errcode = 'raise_exception';
  end if;
  -- All inconsistencies ruled out → backfill every source-with-intent to marker 1.
  update public.media_assets a set capture_contract_version = 1
   where a.kind = 'source' and a.capture_contract_version is null
     and exists (select 1 from public.source_capture_intents i where i.source_asset_id = a.id);
end;
$$;
