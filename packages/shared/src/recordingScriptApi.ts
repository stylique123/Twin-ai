// Persistence for the Recording Script. Stored as a jsonb column on `generations`
// (see supabase/migrations/0050_scene_timeline.sql) so it travels with the
// generation the V2 flow already loads. Load / save whole, or patch one scene.

import { getClient } from './api'
import {
  isRecordingScriptForGeneration,
  type RecordingScene,
  type RecordingScript,
  type WpmPreset,
  totalDurationSec,
} from './recordingScript'
import { buildRecordingScriptSnapshot } from './editor/scriptSnapshot'

export async function loadRecordingScript(generationId: string): Promise<RecordingScript | null> {
  const { data, error } = await getClient()
    .from('generations')
    .select('scene_timeline')
    .eq('id', generationId)
    .maybeSingle()
  // A database/RLS/network failure is not the same as a legacy null timeline.
  // Throw so capture can report the real class instead of synthesizing against
  // a generation it could not actually read.
  if (error) throw error
  if (!data) return null
  if (data.scene_timeline == null) return null
  if (!isRecordingScriptForGeneration(data.scene_timeline, generationId)) {
    // Treat incompatible pre-rebuild jsonb like a legacy null timeline. The ONE
    // preparation seam will rebuild it from the authoritative blueprint and
    // strict-persist/read-back the repaired form before recording.
    return null
  }
  return {
    ...data.scene_timeline,
    total_duration_sec: totalDurationSec(data.scene_timeline.scenes),
  }
}

// Persist is BEST-EFFORT: the Recording Script is a convenience cache, not a
// correctness dependency. The worker falls back to blueprint heuristics when
// `scene_timeline` is null, and every V2 screen re-synthesizes the timeline in
// memory via buildRecordingScript() when a load returns null — so a persist failure
// (e.g. the column-level UPDATE grant not yet applied) must NOT crash the flow
// or, worse, strand the user AFTER a credit was already spent. Degrade to
// in-memory-only and warn; callers keep the returned/updated timeline in state.
export async function saveRecordingScript(t: RecordingScript): Promise<void> {
  const result = await saveRecordingScriptStrict(t)
  if (!result.ok) {
    console.warn('saveRecordingScript: could not persist scene_timeline (continuing in-memory):', result.error)
  }
}

// Patch a single scene by number and re-persist the whole timeline (durations
// re-derive). Returns the updated timeline so the caller can keep one in state.
export async function patchRecordingScene(
  t: RecordingScript,
  sceneNumber: number,
  patch: Partial<RecordingScene>,
): Promise<RecordingScript> {
  const scenes = t.scenes.map((s) => (s.scene_number === sceneNumber ? { ...s, ...patch } : s))
  const next: RecordingScript = { ...t, scenes, total_duration_sec: totalDurationSec(scenes) }
  await saveRecordingScript(next)
  return next
}

export async function setWpm(t: RecordingScript, wpm: WpmPreset): Promise<RecordingScript> {
  const next: RecordingScript = { ...t, wpm }
  // wpm is NOT part of the recording-script snapshot (it never feeds provenance),
  // so best-effort persistence is correct here.
  await saveRecordingScript(next)
  return next
}

// STRICT persist: unlike saveRecordingScript, this SURFACES failure. Used to
// establish a DURABLE authoritative Recording Script before recording, so a
// provenance-feeding script can never continue in-memory-only.
export async function saveRecordingScriptStrict(t: RecordingScript): Promise<{ ok: boolean; error?: string }> {
  if (!isRecordingScriptForGeneration(t, t.generation_id)) {
    return { ok: false, error: 'recording_script_invalid' }
  }
  const next = { ...t, total_duration_sec: totalDurationSec(t.scenes) }
  try {
    const { data, error } = await getClient()
      .from('generations')
      .update({ scene_timeline: next })
      .eq('id', t.generation_id)
      .select('scene_timeline')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    // PostgREST can return a successful response for an UPDATE that matched zero
    // rows under RLS. Requiring the returned row closes that false-success path.
    if (!data?.scene_timeline) return { ok: false, error: 'recording_script_not_updated' }
    if (!isRecordingScriptForGeneration(data.scene_timeline, t.generation_id)) {
      return { ok: false, error: 'recording_script_readback_invalid' }
    }
    const returned = data.scene_timeline as RecordingScript
    if (recordingScriptCanonical(returned) !== recordingScriptCanonical(next)) {
      return { ok: false, error: 'recording_script_write_mismatch' }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// The ONE canonical recording-script SHA-input for a RecordingScript — the FULL,
// unfiltered scene list (Constitution §5.1). Same canonical the create RPC and Boot
// recompute; used here to PROVE the persisted script equals the in-memory one.
export function recordingScriptCanonical(t: RecordingScript): string {
  return buildRecordingScriptSnapshot({
    generationId: t.generation_id,
    hook: t.hook,
    scenes: t.scenes.map((s) => ({
      scene_number: s.scene_number, scene_type: s.scene_type,
      dialogue: s.dialogue, show_in_teleprompter: s.show_in_teleprompter,
    })),
  }).canonical
}

export type DurableFailReason = 'persist_failed' | 'reload_failed' | 'mismatch'
export interface DurableScriptResult {
  ok: boolean
  script?: RecordingScript
  reason?: DurableFailReason
  error?: string
}
export interface DurableScriptDeps {
  persist: (t: RecordingScript) => Promise<{ ok: boolean; error?: string }>
  reload: () => Promise<RecordingScript | null>
}

// Establish ONE durable, authoritative Recording Script BEFORE record mode is usable
// (Constitution §5.1). Legacy generations (null scene_timeline) and any in-memory
// scene/dialogue edit whose save failed are made durable here: PERSIST strictly,
// RE-READ, and PROVE the re-read canonical equals the in-memory canonical. If
// persistence or equality cannot be proven, record mode fails visibly + retryably —
// never continues in-memory — so the take's provenance always binds to a script that
// the create RPC (which verifies against the PERSISTED generation) will accept.
// Injectable so the four fixtures (synth+persist success, persist denial, drift,
// reload failure) are unit-testable without a live DB.
export async function establishDurableRecordingScript(
  inMemory: RecordingScript, deps: DurableScriptDeps,
): Promise<DurableScriptResult> {
  const persisted = await deps.persist(inMemory)
  if (!persisted.ok) return { ok: false, reason: 'persist_failed', error: persisted.error }
  const reloaded = await deps.reload()
  if (!reloaded) return { ok: false, reason: 'reload_failed' }
  if (recordingScriptCanonical(reloaded) !== recordingScriptCanonical(inMemory)) {
    return { ok: false, reason: 'mismatch' }
  }
  return { ok: true, script: reloaded }
}

// Live wiring: strict persist + re-read against the real client.
export async function establishDurableRecordingScriptLive(inMemory: RecordingScript): Promise<DurableScriptResult> {
  return establishDurableRecordingScript(inMemory, {
    persist: (t) => saveRecordingScriptStrict(t),
    reload: () => loadRecordingScript(inMemory.generation_id),
  })
}

// The ONE capture-mode preparation seam (Constitution §5.1), injectable + testable.
// UPLOAD is NOT recorded against a script: it does ZERO script load/build/persist/reload
// and is always usable (even for a legacy null timeline). RECORD uses a script loaded
// from the database as the already-durable authority. Only a legacy null timeline is
// synthesized, strict-persisted, reloaded and compared. Rewriting every already-saved
// script on teleprompter entry created an unnecessary failure gate for every recording.
export type CaptureModeResult =
  | { ready: true; mode: 'upload' }
  | { ready: true; mode: 'record'; script: RecordingScript }
  | { ready: false; mode: 'record'; reason: 'load' | DurableFailReason; error?: string }
export interface CaptureModeDeps {
  loadScript: () => Promise<RecordingScript | null>
  synthScript: () => Promise<RecordingScript | null> // build from blueprint when none persisted
  establish: (t: RecordingScript) => Promise<DurableScriptResult>
}
export async function prepareCaptureMode(mode: 'upload' | 'record', deps: CaptureModeDeps): Promise<CaptureModeResult> {
  if (mode === 'upload') return { ready: true, mode: 'upload' } // ZERO script work — upload needs no recorded-against script
  const persisted = await deps.loadScript()
  if (persisted) return { ready: true, mode: 'record', script: persisted }
  const synthesized = await deps.synthScript()
  if (!synthesized) return { ready: false, mode: 'record', reason: 'load' }
  const durable = await deps.establish(synthesized)
  if (!durable.ok || !durable.script) {
    return {
      ready: false,
      mode: 'record',
      reason: durable.reason ?? 'persist_failed',
      error: durable.error,
    }
  }
  return { ready: true, mode: 'record', script: durable.script }
}
