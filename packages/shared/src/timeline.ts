// ─────────────────────────────────────────────────────────────────────────────
// Scene Timeline — THE single source of truth for TwinAI Creative Studio (V2).
//
// One master object drives EVERYTHING downstream: script, hook, shot guide,
// teleprompter, recording pauses, editor cuts, captions, b-roll, music, final
// video, and publishing copy. No module ever re-guesses scene boundaries — they
// all read the same `scenes[]`. This is what guarantees the teleprompter pauses
// where the editor cuts where the captions reset, by construction.
//
// Mirrored 1:1 by worker/src/timeline.ts so the render uses the exact structure.
// See docs/PRODUCT_VISION.md §8.
// ─────────────────────────────────────────────────────────────────────────────

export type SceneType =
  | 'talking_head'
  | 'b_roll'
  | 'screen_recording'
  | 'product_demo'
  | 'cta'

export interface Scene {
  scene_number: number // 1-based, contiguous, in order
  scene_type: SceneType
  purpose: string // plain-language why this scene exists
  dialogue: string | null // exact spoken words, or null for silent b-roll
  duration_sec: number // estimated, drives teleprompter pacing + editor timing
  camera_framing: string // creator language, e.g. "Chest-up shot"
  background: string // setting guidance
  movement: string // expression / motion cue
  caption_text: string // what burns on screen for this scene
  broll_instruction: string | null // "Show this while talking", or null
  cut_point: boolean // clean cut marker at scene end (true for every talking scene)
  transition: 'cut' | 'crossfade' | 'none'
  pause_after: boolean // teleprompter pauses after this scene
  show_in_teleprompter: boolean // true for spoken scenes; false for silent b-roll
}

export interface SceneTimeline {
  version: 1
  generation_id: string
  platform: string // e.g. "tiktok" | "reels" | "shorts"
  hook: string // the ONE selected hook — appears once, at scene 1
  wpm: WpmPreset // teleprompter speed preset
  scenes: Scene[]
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

export function totalDurationSec(scenes: Scene[]): number {
  return Math.round(scenes.reduce((a, s) => a + (s.duration_sec || 0), 0) * 10) / 10
}

// The scenes the teleprompter actually walks through (spoken only). Silent b-roll
// is never a teleprompter scene unless it carries voiceover (dialogue != null).
export function teleprompterScenes(t: SceneTimeline): Scene[] {
  return t.scenes.filter((s) => s.show_in_teleprompter)
}

// ── Invariants — the consistency rules from the spec, checkable in code. ──────
// Returns [] when the timeline is internally consistent; otherwise a list of
// human-readable violations. UI/worker can assert this so no module ever drifts.
export function timelineInvariants(t: SceneTimeline): string[] {
  const errs: string[] = []
  if (!t.scenes.length) errs.push('timeline has no scenes')

  // Scene numbers are 1-based and contiguous.
  t.scenes.forEach((s, i) => {
    if (s.scene_number !== i + 1) errs.push(`scene ${i + 1} has number ${s.scene_number} (must be contiguous, 1-based)`)
  })

  // The hook appears exactly once, at the very start.
  if (t.scenes[0] && t.scenes[0].dialogue && !includesHook(t.scenes[0].dialogue, t.hook)) {
    errs.push('hook must appear in scene 1')
  }
  const hookRepeats = t.scenes.slice(1).filter((s) => s.dialogue && includesHook(s.dialogue, t.hook)).length
  if (hookRepeats > 0) errs.push(`hook is duplicated in ${hookRepeats} later scene(s) — it must appear exactly once`)

  // B-roll is not a teleprompter scene unless it has voiceover.
  for (const s of t.scenes) {
    if (s.scene_type === 'b_roll' && s.show_in_teleprompter && !s.dialogue) {
      errs.push(`scene ${s.scene_number}: silent b-roll must not be a teleprompter scene`)
    }
    // Every spoken/talking scene ends with a clean cut marker.
    if (s.show_in_teleprompter && !s.cut_point) {
      errs.push(`scene ${s.scene_number}: talking scene must end with a clean cut marker`)
    }
  }

  // Captions never duplicated across scenes (each scene resets its own caption).
  const seen = new Map<string, number>()
  for (const s of t.scenes) {
    const c = (s.caption_text || '').trim().toLowerCase()
    if (!c) continue
    if (seen.has(c)) errs.push(`caption duplicated in scenes ${seen.get(c)} and ${s.scene_number}`)
    else seen.set(c, s.scene_number)
  }

  return errs
}

function includesHook(dialogue: string, hook: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '')
  const h = norm(hook)
  if (!h) return false
  // Match on the first ~6 words of the hook to tolerate light editing.
  const head = h.split(' ').slice(0, 6).join(' ')
  return norm(dialogue).includes(head)
}

export function isValidTimeline(t: SceneTimeline): boolean {
  return timelineInvariants(t).length === 0
}
