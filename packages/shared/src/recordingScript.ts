// ─────────────────────────────────────────────────────────────────────────────
// Recording Script — the RECORDING model for TwinAI Creative Studio (V2).
//
// One object drives everything about CAPTURING a take: spoken dialogue, scene
// order, WPM pacing, camera-framing guidance, and estimated durations for the
// teleprompter. No module re-guesses scene boundaries — they all read the same
// `scenes[]`.
//
// BOUNDARY: this is NOT — and must never become — the editor's timeline. The
// rebuilt one-click editor (editor v2) owns its own canonical EditPlan derived
// from the VALIDATED SOURCE MEDIA, not from this script. Nothing here may grow
// cut markers, transitions, caption timing, render styles, or output paths.
// (Persisted as generations.scene_timeline jsonb — the column name and wire
// keys are historical and stay stable; only code identifiers were renamed.)
// See docs/PRODUCT_VISION.md §8.
// ─────────────────────────────────────────────────────────────────────────────

export type SceneType =
  | 'talking_head'
  | 'b_roll'
  | 'screen_recording'
  | 'product_demo'
  | 'cta'

// RECORDING-ONLY model. This describes the script/teleprompter/recording for one
// scene — it deliberately carries NO editing/render instructions (no render cut
// markers, transitions, b-roll/zoom/music events, caption timing/styles, output
// paths, or EDL data). The old AI editor's per-scene render fields (broll_instruction,
// cut_point, transition) were removed here so the recording model stays clean; the
// rebuilt one-click editor will own its own edit plan, separate from this.
export interface RecordingScene {
  scene_number: number // 1-based, contiguous, in order
  scene_type: SceneType
  purpose: string // plain-language why this scene exists
  dialogue: string | null // exact spoken words, or null for silent b-roll
  duration_sec: number // estimated, drives teleprompter pacing
  camera_framing: string // creator language, e.g. "Chest-up shot"
  background: string // setting guidance
  movement: string // expression / motion cue
  caption_text: string // the scene's on-screen text HINT shown to the creator (no
                       // timing/style — not a render caption event); also a fallback
                       // line label in the recorder.
  pause_after: boolean // teleprompter pauses after this scene
  show_in_teleprompter: boolean // true for spoken scenes; false for silent b-roll
}

export interface RecordingScript {
  version: 1
  generation_id: string
  platform: string // e.g. "tiktok" | "reels" | "shorts"
  hook: string // the ONE selected hook — appears once, at scene 1
  wpm: WpmPreset // teleprompter speed preset
  scenes: RecordingScene[]
  total_duration_sec: number // sum of scene durations (derived)
}

// ── Teleprompter speed presets (WPM, never pixels/sec). Natural is default. ──
export const WPM_PRESETS = {
  slow: 130,
  natural: 150, // recommended default
  fast: 165,
  creator: 180,
} as const
export type WpmPreset = keyof typeof WPM_PRESETS
export const DEFAULT_WPM: WpmPreset = 'natural'

export const WPM_LABEL: Record<WpmPreset, string> = {
  slow: 'Slow',
  natural: 'Natural',
  fast: 'Fast',
  creator: 'Creator',
}

// Estimate how long a line of dialogue takes to say at a given WPM. Used to size
// scenes and to show "Estimated seconds" in the teleprompter.
export function estimateDurationSec(dialogue: string | null, wpm: WpmPreset = DEFAULT_WPM): number {
  if (!dialogue) return 2.5 // a silent b-roll beat
  const words = dialogue.trim().split(/\s+/).filter(Boolean).length
  if (!words) return 2.5
  const sec = (words / WPM_PRESETS[wpm]) * 60
  return Math.max(1.5, Math.round(sec * 10) / 10)
}

// Hard per-scene recording cap: the estimate plus a short grace so a natural pace
// isn't cut off, clamped to a short-form range. Shared by every recorder surface
// so a scene can never record indefinitely and the final clip always stays
// short-form length.
export function sceneTimeCapSec(estSec: number): number {
  return Math.min(Math.max(estSec + 5, 12), 30)
}

export function totalDurationSec(scenes: RecordingScene[]): number {
  return Math.round(scenes.reduce((a, s) => a + (s.duration_sec || 0), 0) * 10) / 10
}

// The scenes the teleprompter actually walks through (spoken only). Silent b-roll
// is never a teleprompter scene unless it carries voiceover (dialogue != null).
export function teleprompterScenes(t: RecordingScript): RecordingScene[] {
  return t.scenes.filter((s) => s.show_in_teleprompter)
}

