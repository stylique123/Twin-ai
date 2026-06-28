// Persistence for the Scene Timeline. Stored as a jsonb column on `generations`
// (see supabase/migrations/0050_scene_timeline.sql) so it travels with the
// generation the V2 flow already loads. Load / save whole, or patch one scene.

import { getClient } from './api'
import { type Scene, type SceneTimeline, type WpmPreset, totalDurationSec } from './timeline'

export async function loadTimeline(generationId: string): Promise<SceneTimeline | null> {
  const { data, error } = await getClient()
    .from('generations')
    .select('scene_timeline')
    .eq('id', generationId)
    .single()
  if (error || !data) return null
  return (data.scene_timeline as SceneTimeline) ?? null
}

export async function saveTimeline(t: SceneTimeline): Promise<void> {
  const next = { ...t, total_duration_sec: totalDurationSec(t.scenes) }
  const { error } = await getClient()
    .from('generations')
    .update({ scene_timeline: next })
    .eq('id', t.generation_id)
  if (error) throw error
}

// Patch a single scene by number and re-persist the whole timeline (durations
// re-derive). Returns the updated timeline so the caller can keep one in state.
export async function patchScene(
  t: SceneTimeline,
  sceneNumber: number,
  patch: Partial<Scene>,
): Promise<SceneTimeline> {
  const scenes = t.scenes.map((s) => (s.scene_number === sceneNumber ? { ...s, ...patch } : s))
  const next: SceneTimeline = { ...t, scenes, total_duration_sec: totalDurationSec(scenes) }
  await saveTimeline(next)
  return next
}

export async function setWpm(t: SceneTimeline, wpm: WpmPreset): Promise<SceneTimeline> {
  const next: SceneTimeline = { ...t, wpm }
  await saveTimeline(next)
  return next
}
