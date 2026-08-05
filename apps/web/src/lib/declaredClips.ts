// The declared-clip slots a script asks the creator to show.
//
// ── THE SLOTS COME FROM THE FILMED SCRIPT, NOT THE MODEL'S PLAN ──────────
//
// This read `blueprint.script[]` — the model's beats — which is the exact defect
// the connectivity audit names against `UnfilledContainers` (F6 / P1-6): the
// script editor and the teleprompter both operate on the canonical
// `scene_timeline` RecordingScript, so a surface reading the blueprint is
// inspecting a DIFFERENT script from the one that gets filmed. A creator who
// edits a slot out of the recording script would still be offered a capture for
// it, and a slot they added would never appear at all.
//
// It now reads the RecordingScript, where `recordingScriptAdapter` has already
// turned every `[SHOW: …]` marker into a silent `screen_recording` scene
// carrying its own `clip_label`. So there is ONE parser
// (`containerResolution`), applied ONCE at adaptation time, and this module
// only reads the result — rather than a second regex racing the first across a
// stale copy of the script.
import type { RecordingScript } from './api'

/** One slot the script declares, with the scene it belongs to so the creator can
 *  find where it lands in what they are about to film. */
export interface DeclaredSlot {
  label: string
  sceneNumber: number
}

/**
 * The declared slots, in scene order, one entry per distinct label.
 *
 * DEDUPED CASE-INSENSITIVELY: a script that names the same thing twice is asking
 * for one clip shown twice, not two recordings of one screen — and
 * `media_assets.clip_label` matching downstream could not tell two rows with the
 * same label apart, so offering two capture buttons would produce two rows
 * fighting over one slot.
 */
export function declaredSlots(script: RecordingScript | null): DeclaredSlot[] {
  if (!script) return []
  const out: DeclaredSlot[] = []
  const seen = new Set<string>()
  for (const scene of script.scenes) {
    if (scene.scene_type !== 'screen_recording') continue
    const label = (scene.clip_label ?? '').trim()
    // A screen-recording scene with no label names no slot. That can happen —
    // a script written before declared clips existed, or one where the model
    // marked a screen scene without saying what to show — and a capture offered
    // for it could never be matched back to anything.
    if (label === '') continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ label, sceneNumber: scene.scene_number })
  }
  return out
}
