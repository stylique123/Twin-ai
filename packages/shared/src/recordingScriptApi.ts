// Persistence for the Recording Script. Stored as a jsonb column on `generations`
// (see supabase/migrations/0050_scene_timeline.sql) so it travels with the
// generation the V2 flow already loads. Load / save whole, or patch one scene.

import { getClient } from './api'
import { type RecordingScene, type RecordingScript, type WpmPreset, totalDurationSec } from './recordingScript'

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
  await saveRecordingScript(next)
  return next
}
