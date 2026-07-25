-- Editor v2 — Phase 7 §4: DB-level Decision v2 validation (defense-in-depth).
--
-- The worker already re-resolves the provider's decision against the immutable
-- envelope (validateDirectorDecision, TS). This migration adds an INDEPENDENT
-- database guard so a decision row can NEVER be persisted that:
--   * is not schema-version 2,
--   * removes a `filler` candidate (auto filler removal is OFF this epoch),
--   * removes a speech candidate that isn't selection-enabled,
--   * removes a visual-waste span that isn't corroborated dead_air,
--   * or carries an off-catalog creative enum (caption / transition / pacing /
--     music / hook / zoom intensity+reason).
-- The stored decision JSON already carries the RESOLVED kind / selectionEnabled /
-- classCode copied from the envelope by the worker, so these invariants are
-- checkable from the row alone (no envelope needed). The trigger fires for every
-- role incl. service_role (triggers ignore RLS), so it holds even if the RPC path
-- is bypassed. Idempotent; no data backfill (append-only decisions).
--
-- Catalog values MUST match editor/catalogs.ts + editor/director.ts. Changing a
-- catalog is a policy-version bump in BOTH places and here, never a silent edit.

-- >>> GATE-D-FUNCTIONS-BEGIN (Decision-v2 DB validation; extracted by scripts/db-tests/gate-e/run.sh)
create or replace function public.editor_assert_director_decision_v2(p_schema_version int, p_decision jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare e jsonb;
begin
  if p_schema_version is distinct from 2 then
    raise exception 'director_decision_bad_schema_version: %', p_schema_version using errcode = 'raise_exception';
  end if;
  if p_decision is null or jsonb_typeof(p_decision) <> 'object' then
    raise exception 'director_decision_not_object' using errcode = 'raise_exception';
  end if;

  -- selections (speech-candidate removals): never a filler, always selection-enabled.
  if jsonb_typeof(coalesce(p_decision -> 'selections', '[]'::jsonb)) <> 'array' then
    raise exception 'director_decision_bad_selections' using errcode = 'raise_exception';
  end if;
  for e in select value from jsonb_array_elements(coalesce(p_decision -> 'selections', '[]'::jsonb)) loop
    if (e ->> 'kind') = 'filler' then
      raise exception 'director_filler_disabled' using errcode = 'raise_exception';
    end if;
    if (e ->> 'selectionEnabled') is distinct from '1' then
      raise exception 'director_decision_not_selectable: speech candidate' using errcode = 'raise_exception';
    end if;
  end loop;

  -- visual-waste removals: ONLY corroborated dead_air (classCode 0) is ever selectable.
  if jsonb_typeof(coalesce(p_decision -> 'visualWasteSelections', '[]'::jsonb)) <> 'array' then
    raise exception 'director_decision_bad_visual_waste' using errcode = 'raise_exception';
  end if;
  for e in select value from jsonb_array_elements(coalesce(p_decision -> 'visualWasteSelections', '[]'::jsonb)) loop
    if (e ->> 'classCode') is distinct from '0' then
      raise exception 'director_decision_not_selectable: visual_waste' using errcode = 'raise_exception';
    end if;
  end loop;

  -- Catalog-bound creative enums. Absent => the worker's safe default was used; only a
  -- PRESENT value must be in-catalog.
  if (p_decision ? 'captionPresetId') and (p_decision ->> 'captionPresetId') <> all (array['caption-clean-keyword-v1','caption-punchy-word-v1','caption-minimal-subtitle-v1']) then
    raise exception 'director_decision_bad_caption: %', p_decision ->> 'captionPresetId' using errcode = 'raise_exception';
  end if;
  if (p_decision ? 'transitionPolicy') and (p_decision ->> 'transitionPolicy') <> all (array['hard_cuts_only','restrained']) then
    raise exception 'director_decision_bad_transition: %', p_decision ->> 'transitionPolicy' using errcode = 'raise_exception';
  end if;
  if (p_decision ? 'pacing') and (p_decision ->> 'pacing') <> all (array['calm','balanced','punchy']) then
    raise exception 'director_decision_bad_pacing: %', p_decision ->> 'pacing' using errcode = 'raise_exception';
  end if;
  if (p_decision ? 'music') and (p_decision ->> 'music') <> all (array['none','subtle','energetic']) then
    raise exception 'director_decision_bad_music: %', p_decision ->> 'music' using errcode = 'raise_exception';
  end if;
  if (p_decision ? 'hookTreatment') and (p_decision ->> 'hookTreatment') <> all (array['keep','open_at_word']) then
    raise exception 'director_decision_bad_hook: %', p_decision ->> 'hookTreatment' using errcode = 'raise_exception';
  end if;
  if jsonb_typeof(coalesce(p_decision -> 'zoomRequests', '[]'::jsonb)) <> 'array' then
    raise exception 'director_decision_bad_zoom' using errcode = 'raise_exception';
  end if;
  for e in select value from jsonb_array_elements(coalesce(p_decision -> 'zoomRequests', '[]'::jsonb)) loop
    if (e ? 'intensity') and (e ->> 'intensity') <> all (array['subtle','medium']) then
      raise exception 'director_decision_bad_zoom: intensity %', e ->> 'intensity' using errcode = 'raise_exception';
    end if;
    if (e ? 'reasonCode') and (e ->> 'reasonCode') <> all (array['emphasis_word','scene_open','retention_beat']) then
      raise exception 'director_decision_bad_zoom: reason %', e ->> 'reasonCode' using errcode = 'raise_exception';
    end if;
  end loop;
end
$$;

create or replace function public.editor_director_decision_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform public.editor_assert_director_decision_v2(new.schema_version, new.decision);
  return new;
end
$$;
-- <<< GATE-D-FUNCTIONS-END

drop trigger if exists trg_editor_director_decision_guard on public.edit_director_decisions;
create trigger trg_editor_director_decision_guard
  before insert or update on public.edit_director_decisions
  for each row execute function public.editor_director_decision_guard();

revoke all on function public.editor_assert_director_decision_v2(int, jsonb) from public, anon, authenticated;
revoke all on function public.editor_director_decision_guard() from public, anon, authenticated;
grant execute on function public.editor_assert_director_decision_v2(int, jsonb) to service_role;
grant execute on function public.editor_director_decision_guard() to service_role;
