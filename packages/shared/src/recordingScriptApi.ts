// Persistence for the Recording Script. Stored as a jsonb column on `generations`
// (see supabase/migrations/0050_scene_timeline.sql) so it travels with the
// generation the V2 flow already loads. Load / save whole, or patch one scene.

import { getClient } from './api'
import { type RecordingScene, type RecordingScript, type WpmPreset, totalDurationSec } from './recordingScript'
import { buildRecordingScriptSnapshot } from './editor/scriptSnapshot'

export async function loadRecordingScript(generationId: string): Promise<RecordingScript | null> {
  const { data, error } = await getClient()
    .from('generations')
    .select('scene_timeline')
    .eq('id', generationId)
    .single()
  if (error || !data) return null
  return (data.scene_timeline as RecordingScript) ?? null
}

// Persist is BEST-EFFORT: the Recording Script is a convenience cache, not a
// correctness dependency. The worker falls back to blueprint heuristics when
// `scene_timeline` is null, and every V2 screen re-synthesizes the timeline in
// memory via buildRecordingScript() when a load returns null — so a persist failure
// (e.g. the column-level UPDATE grant not yet applied) must NOT crash the flow
// or, worse, strand the user AFTER a credit was already spent. Degrade to
// in-memory-only and warn; callers keep the returned/updated timeline in state.
export async function saveRecordingScript(t: RecordingScript): Promise<void> {
  const next = { ...t, total_duration_sec: totalDurationSec(t.scenes) }
  try {
    const { error } = await getClient()
      .from('generations')
      .update({ scene_timeline: next })
      .eq('id', t.generation_id)
    if (error) console.warn('saveRecordingScript: could not persist scene_timeline (continuing in-memory):', error.message)
  } catch (e) {
    console.warn('saveRecordingScript: persist threw (continuing in-memory):', e)
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
  const next = { ...t, total_duration_sec: totalDurationSec(t.scenes) }
  try {
    const { error } = await getClient()
      .from('generations')
      .update({ scene_timeline: next })
      .eq('id', t.generation_id)
    if (error) return { ok: false, error: error.message }
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
  if (!persisted.ok) return { ok: false, reason: 'persist_failed' }
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
