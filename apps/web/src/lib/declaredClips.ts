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
// turned every `[SHOW: …]` marker into a silent scene carrying its own
// `clip_label` and the MEDIUM it declared. So there is ONE parser
// (`containerResolution`), applied ONCE at adaptation time, and this module
// only reads the result — rather than a second regex racing the first across a
// stale copy of the script.
import type { ClipMedium, RecordingScript } from './api'

/** One slot the script declares, with the scene it belongs to so the creator can
 *  find where it lands in what they are about to film. */
export interface DeclaredSlot {
  label: string
  sceneNumber: number
  /** How it is captured. `unknown` means the marker did not say, and the
   *  surface ASKS rather than routing it to whichever capture is nearest. */
  medium: ClipMedium
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
    // KEYED ON THE LABEL, not the scene type. Keying on `screen_recording` was
    // the bug: it made every declared clip a screen capture by definition, so a
    // camera slot either vanished from the list or was offered a share picker.
    // The label is what makes a scene a declared slot; the medium says how.
    const label = (scene.clip_label ?? '').trim()
    // A scene with no label names no slot. That is every ordinary talking scene,
    // plus a b-roll shot the model wrote without saying what to show — and a
    // capture offered for one could never be matched back to anything.
    if (label === '') continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      label,
      sceneNumber: scene.scene_number,
      medium: scene.clip_medium ?? 'unknown',
    })
  }
  return out
}
