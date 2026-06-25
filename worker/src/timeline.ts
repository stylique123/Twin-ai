// Worker-side mirror of src/lib/timeline.ts — the Scene Timeline types the
// renderer reads. Kept 1:1 with the frontend so the edit uses the EXACT same
// scene structure (cut at cut_point, captions from caption_text, b-roll from
// broll_instruction). No types imported across the app/worker boundary; this is
// a deliberate copy so the two build independently.

export type SceneType =
  | 'talking_head'
  | 'b_roll'
  | 'screen_recording'
  | 'product_demo'
  | 'cta'

export interface Scene {
  scene_number: number
  scene_type: SceneType
  purpose: string
  dialogue: string | null
  duration_sec: number
  camera_framing: string
  background: string
  movement: string
  caption_text: string
  broll_instruction: string | null
  cut_point: boolean
  transition: 'cut' | 'crossfade' | 'none'
  pause_after: boolean
  show_in_teleprompter: boolean
}

export interface SceneTimeline {
  version: 1
  generation_id: string
  platform: string
  hook: string
  wpm: 'slow' | 'natural' | 'fast' | 'creator'
  scenes: Scene[]
  total_duration_sec: number
}

// Scene boundaries the editor cuts on: cumulative start time of each scene that
// carries a clean cut marker. The renderer uses these instead of re-detecting
// boundaries, so cuts land exactly where the teleprompter paused.
export function sceneCutPoints(t: SceneTimeline): number[] {
  const points: number[] = []
  let at = 0
  for (const s of t.scenes) {
    if (s.cut_point) points.push(Math.round(at * 1000) / 1000)
    at += s.duration_sec || 0
  }
  return points
}

// Per-scene caption spans on the final timeline — captions reset at scene timing,
// never duplicated, never independently re-guessed.
export function sceneCaptionSpans(t: SceneTimeline): { start: number; end: number; text: string }[] {
  const spans: { start: number; end: number; text: string }[] = []
  let at = 0
  for (const s of t.scenes) {
    const end = at + (s.duration_sec || 0)
    if (s.caption_text) spans.push({ start: Math.round(at * 1000) / 1000, end: Math.round(end * 1000) / 1000, text: s.caption_text })
    at = end
  }
  return spans
}

export function isSceneTimeline(v: unknown): v is SceneTimeline {
  return !!v && typeof v === 'object' && Array.isArray((v as SceneTimeline).scenes) && (v as SceneTimeline).version === 1
}
