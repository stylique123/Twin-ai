-- Register `alignment` as a digest-keyed analysis component.
--
-- The script-anchored forced alignment engine (worker/src/jobs/scriptAlignment.ts)
-- and its evidence record (editorAlignment.ts) have both been in the tree,
-- tested, and unreachable — nothing could store their output, because a
-- component that is not in these two allowlists cannot be written at all.
--
-- TWO ALLOWLISTS, AND BOTH HAD TO MOVE. `media_analyses_component_bounded`
-- (0083) bounds the column so a worker bug cannot mint an unbounded namespace
-- of immutable rows; `editor_record_analysis` (0087) independently refuses a
-- component it does not know. They are deliberately redundant — the table
-- constraint holds even if the function is replaced — so extending one without
-- the other fails closed rather than half-opening the door.
--
-- ── THE CAP IS THE LOAD-BEARING PART OF THIS MIGRATION ────────────────────
-- `editor_record_analysis` caps each component's payload and raises
-- `component_too_large` past it. That error is PERMANENT — no retry — so an
-- undersized cap does not degrade the feature, it destroys the take.
--
-- The cap is a CASE whose `else` branch is 16384 bytes, and a newly-registered
-- component inherits it by default. Every existing component is effectively
-- fixed-size, so nobody had reason to look. `alignment` is the first whose
-- payload scales with the SCRIPT: one entry per script word, ~145 bytes each.
-- 16384 bytes is therefore about 230 words — roughly 90 seconds of speech —
-- against a pipeline whose own policy allows a 15-minute source
-- (edit_policy_v1.json maxDurationMs 900000) and a 65536-byte script
-- (MAX_SCRIPT_BYTES). Registered naively, alignment would have worked in every
-- test and failed permanently on the first ordinary take.
--
-- This is the same shape as the MAX_CUES defect this pipeline already shipped
-- and fixed: two numbers individually correct, the RELATIONSHIP between them
-- wrong, and nothing watching the relationship. So it is now a checked property
-- on both sides — the worker bounds the payload by MEASURED bytes
-- (ALIGNMENT_TIMINGS_MAX_BYTES = 400000, truncating with a reported
-- `droppedTimings` count rather than silently), and a unit test pins that
-- budget against the 524288 cap set here.
--
-- Nothing consumes the component yet: captions, cuts and the hook boundary
-- continue to work exactly as before. This migration only makes the evidence
-- storable.

alter table public.media_analyses
  drop constraint if exists media_analyses_component_bounded;
alter table public.media_analyses
  add constraint media_analyses_component_bounded
  check (component in ('inspection', 'speech', 'visual', 'audio', 'hook', 'alignment'));

create or replace function public.editor_record_analysis(
  p_project uuid, p_job uuid, p_worker text, p_attempt integer,
  p_component text, p_schema_version integer, p_bundle_version text,
  p_component_digest text, p_source_hash text, p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  proj public.edit_projects;
  a public.media_assets;
  existing public.media_analyses;
  row_id uuid;
  inserted integer;
  cap integer;
begin
  perform public.editor_assert_lease(p_project, p_job, p_worker, p_attempt);

  if p_component not in ('visual','audio','hook','alignment') then
    raise exception 'editor_record_analysis: % is not a digest-keyed component', p_component;
  end if;
  if p_component_digest is null or p_component_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'editor_record_analysis: component_digest must be a 64-hex sha256';
  end if;

  -- PER-COMPONENT CAP. `alignment` is the first component whose payload grows
  -- with the SCRIPT rather than being effectively fixed-size, so it cannot use
  -- the fallback: at ~145 bytes per timing entry, 16384 bytes is about 230
  -- words, i.e. ~90 seconds of speech, and every longer take would have failed
  -- `component_too_large` PERMANENTLY. The worker bounds the payload to
  -- ALIGNMENT_TIMINGS_MAX_BYTES (400000) and a test pins that budget against
  -- this number; 524288 leaves the record's envelope room inside the cap.
  --
  -- THE `else` BRANCH IS THE TRAP, not a default: a component registered later
  -- inherits 16384 silently and only discovers it on real data. Add an explicit
  -- arm for every new component and size it from that component's real bound.
  cap := case p_component
           when 'visual' then 262144
           when 'audio' then 65536
           when 'alignment' then 524288
           when 'hook' then 16384
           else 16384
         end;
  if pg_column_size(p_result) > cap then
    raise exception 'component_too_large: % payload exceeds % bytes', p_component, cap;
  end if;

  select * into proj from public.edit_projects where id = p_project;
  if not found then
    raise exception 'editor_record_analysis: project % not found', p_project;
  end if;
  if proj.status in ('completed','failed','cancelled') then
    raise exception 'project_terminal: project % is already %', p_project, proj.status;
  end if;
  if proj.boot_manifest_sha is null then
    raise exception 'manifest_mismatch: project % has no pinned boot manifest', p_project;
  end if;

  -- The component digest AND bundle version must EXACTLY match what the pinned
  -- boot manifest authorized for this component — a caller can only record the
  -- component identity the project was pinned to.
  if proj.boot_manifest->'componentDigests'->>p_component is distinct from p_component_digest then
    raise exception 'manifest_mismatch: component digest does not match the pinned boot manifest for %', p_component;
  end if;
  if proj.boot_manifest->'componentVersions'->>p_component is distinct from p_bundle_version then
    raise exception 'manifest_mismatch: bundle version does not match the pinned boot manifest for %', p_component;
  end if;

  select * into a from public.media_assets where id = proj.source_asset_id;
  if not found then
    raise exception 'editor_record_analysis: source asset % missing', proj.source_asset_id;
  end if;
  if a.content_sha256 is distinct from p_source_hash then
    raise exception 'checksum_mismatch: recorded hash does not match the source asset';
  end if;

  insert into public.media_analyses
    (owner_id, source_asset_id, source_hash, schema_version, analyzer_bundle_version,
     component, component_digest, manifest_sha, result)
  values
    (proj.owner_id, proj.source_asset_id, p_source_hash, p_schema_version, p_bundle_version,
     p_component, p_component_digest, proj.boot_manifest_sha, p_result)
  on conflict (source_asset_id, component, component_digest)
    where component_digest is not null
    do nothing;
  get diagnostics inserted = row_count;

  select * into existing from public.media_analyses
   where source_asset_id = proj.source_asset_id
     and component = p_component
     and component_digest = p_component_digest;
  if not found then
    raise exception 'editor_record_analysis: component row vanished after insert';
  end if;
  if existing.source_hash is distinct from p_source_hash then
    raise exception 'checksum_mismatch: existing component was recorded for different source bytes';
  end if;
  row_id := existing.id;

  insert into public.edit_events (project_id, stage, message_code, details, dedupe_key)
  values (p_project, proj.status,
          case when inserted = 1 then 'analysis_component_recorded' else 'analysis_component_reused' end,
          jsonb_build_object('component', p_component, 'component_digest', p_component_digest,
                             'bundle_version', p_bundle_version),
          'analysis:' || p_component || ':' || p_component_digest
            || ':' || case when inserted = 1 then 'recorded' else 'reused' end)
  on conflict (project_id, dedupe_key) where dedupe_key is not null do nothing;

  return jsonb_build_object('id', row_id, 'recorded', inserted = 1);
end;
$$;

revoke all on function public.editor_record_analysis(uuid, uuid, text, integer, text, integer, text, text, text, jsonb) from public, anon, authenticated;
