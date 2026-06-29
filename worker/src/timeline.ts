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

// NOTE: the editor does NOT cut/caption from the timeline's *planned* durations.
// Those are estimates; real cut points come from what the creator actually filmed
// — `shots.bounds`/`shots.segments` (recorded seconds), consumed in edit.ts. The
// timeline drives the teleprompter + b-roll hints, not the cut math.

export function isSceneTimeline(v: unknown): v is SceneTimeline {
  return !!v && typeof v === 'object' && Array.isArray((v as SceneTimeline).scenes) && (v as SceneTimeline).version === 1
}
