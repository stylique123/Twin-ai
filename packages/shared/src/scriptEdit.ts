// EDITING THE SCRIPT BEFORE FILMING — Phase 11 item 8.
//
// *"Three of four panellists hit this independently: you cannot currently
// change a word before reading it into a camera 40 times."*
//
// ── WHICH SCRIPT, AND WHY THE ANSWER IS NOT OBVIOUS ──────────────────────
//
// There are two script-shaped objects, and only one of them is filmed:
//
//   blueprint.script[]   what the plan screen renders — the model's beats
//   scene_timeline       the RecordingScript the teleprompter reads, whose
//                        canonical form the capture SHA binds
//
// `buildRecordingScript` maps the first onto the second, and the mapping is
// LOSSY AND NOT 1:1: hook-lookalike lines are dropped, the CTA beat is pulled
// out of the body and moved to the end, and silent b-roll scenes are inserted
// from the shot list. So `blueprint.script[i]` and `scenes[i]` are different
// lines, and an edit written to the blueprint would be an edit to something
// nobody films.
//
// Every function here therefore operates on the RECORDING SCRIPT. That is the
// artefact the teleprompter shows, the create RPC verifies and the snapshot
// hashes — editing anything else would be theatre.
//
// ── THE PACING HAS TO MOVE WITH THE WORDS ────────────────────────────────
//
// `duration_sec` drives the teleprompter's scroll AND `sceneTimeCapSec`, which
// HARD-STOPS the recorder. Rewriting a line and leaving the old estimate is not
// a cosmetic staleness: a longer line against the old cap means the camera stops
// mid-sentence, which is the failure this item exists to end, reintroduced by
// the fix for it. So an edit re-estimates, always.
import {
  DEFAULT_WPM,
  estimateDurationSec,
  totalDurationSec,
  type RecordingScene,
  type RecordingScript,
} from './recordingScript'
import { SNAPSHOT_MAX_DIALOGUE_CHARS, SNAPSHOT_MAX_HOOK_CHARS } from './editor/scriptSnapshot'

export type ScriptEditRejection =
  /** The scene number is not in this script. */
  | 'no_such_scene'
  /** A silent b-roll insert has no words to change. Not an error the creator
   *  can see — the UI does not offer an editor for one — but refused here so a
   *  caller cannot turn a silent scene into a spoken one by writing text into
   *  it, which would change what the teleprompter walks through. */
  | 'scene_has_no_dialogue'
  /** Emptying a line is a DELETION, not an edit. Deleting a scene changes the
   *  shape of the script — scene numbers, the teleprompter walk, the snapshot —
   *  and doing it through a text field, by backspacing, would make it an
   *  accident. It is refused here and offered nowhere. */
  | 'would_empty_the_line'
  /** Past the bound the snapshot enforces. Refusing here means the creator sees
   *  "too long" while typing rather than a failed save afterwards. */
  | 'too_long'
  /** The text is what was already there. Not a failure — but it must not
   *  produce a write, because a no-op save still burns a strict persist and a
   *  read-back on a screen the creator is about to leave. */
  | 'unchanged'

export type ScriptEditResult =
  | { ok: true; script: RecordingScript }
  | { ok: false; reason: ScriptEditRejection }

/**
 * NORMALIZED THE SAME WAY THE SNAPSHOT WILL BE.
 *
 * `buildRecordingScriptSnapshot` NFC-normalizes, collapses whitespace runs and
 * trims before hashing. Applying that here means what the creator sees in the
 * field is what gets hashed — otherwise a pasted line with a non-breaking space
 * would save, display one way, and canonicalize to another, and the difference
 * would only ever appear as a SHA mismatch at record time.
 */
export function normalizeDialogueEdit(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim()
}

/** The scenes a creator may rewrite: the ones with words. A silent b-roll
 *  insert is a shot, not a line, and offering a text box on it would invite
 *  turning it into a spoken scene by typing. */
export function editableScenes(script: RecordingScript): RecordingScene[] {
  return script.scenes.filter((s) => typeof s.dialogue === 'string' && s.dialogue.trim() !== '')
}

/**
 * Rewrite one scene's spoken line.
 *
 * Re-estimates `duration_sec` from the new words at the script's current WPM —
 * see the note at the top of this file: leaving it stale means the recorder's
 * hard cap belongs to a line that no longer exists.
 */
export function applyDialogueEdit(
  script: RecordingScript, sceneNumber: number, text: string,
): ScriptEditResult {
  const scene = script.scenes.find((s) => s.scene_number === sceneNumber)
  if (!scene) return { ok: false, reason: 'no_such_scene' }
  if (typeof scene.dialogue !== 'string') return { ok: false, reason: 'scene_has_no_dialogue' }

  const next = normalizeDialogueEdit(text)
  if (next === '') return { ok: false, reason: 'would_empty_the_line' }
  if (next.length > SNAPSHOT_MAX_DIALOGUE_CHARS) return { ok: false, reason: 'too_long' }
  if (next === normalizeDialogueEdit(scene.dialogue)) return { ok: false, reason: 'unchanged' }

  const wpm = script.wpm ?? DEFAULT_WPM
  const scenes = script.scenes.map((s) => (
    s.scene_number === sceneNumber
      ? { ...s, dialogue: next, duration_sec: estimateDurationSec(next, wpm) }
      : s
  ))
  return { ok: true, script: withScenes(script, scenes) }
}

/**
 * Rewrite the hook.
 *
 * THE HOOK LIVES IN TWO PLACES AND BOTH ARE HASHED. `RecordingScript.hook` is
 * the field, and `buildRecordingScript` also writes it into scene 1's dialogue
 * — the line the teleprompter actually shows. The snapshot canonicalizes both.
 *
 * Editing one and not the other would leave the creator reading their new
 * opening line off the teleprompter while the script's hook field, the caption
 * hint and the provenance record the old one. So this writes both, and only
 * when scene 1 genuinely still carries the old hook: a creator who has already
 * rewritten scene 1 by hand has said that line is no longer the hook, and
 * silently overwriting their edit would be worse than leaving the two apart.
 */
export function applyHookEdit(script: RecordingScript, text: string): ScriptEditResult {
  const next = normalizeDialogueEdit(text)
  if (next === '') return { ok: false, reason: 'would_empty_the_line' }
  if (next.length > SNAPSHOT_MAX_HOOK_CHARS) return { ok: false, reason: 'too_long' }
  const current = normalizeDialogueEdit(script.hook ?? '')
  if (next === current) return { ok: false, reason: 'unchanged' }

  const wpm = script.wpm ?? DEFAULT_WPM
  const scenes = script.scenes.map((s) => (
    s.scene_number === 1
      && typeof s.dialogue === 'string'
      && normalizeDialogueEdit(s.dialogue) === current
      ? { ...s, dialogue: next, duration_sec: estimateDurationSec(next, wpm) }
      : s
  ))
  return { ok: true, script: { ...withScenes(script, scenes), hook: next } }
}

function withScenes(script: RecordingScript, scenes: RecordingScene[]): RecordingScript {
  return { ...script, scenes, total_duration_sec: totalDurationSec(scenes) }
}

/**
 * Did the creator's edits change what a take would be recorded against?
 *
 * Used to tell someone with a take already saved that it was filmed against
 * different words. It compares only the fields the SNAPSHOT carries — the hook
 * and each scene's number, type, dialogue and teleprompter flag — because those
 * are what the capture SHA binds. A changed camera-framing note is a change to
 * the guidance, not to the recorded script, and warning about it would train the
 * creator to ignore the warning that matters.
 */
export function changesTheRecordedScript(a: RecordingScript, b: RecordingScript): boolean {
  if (normalizeDialogueEdit(a.hook ?? '') !== normalizeDialogueEdit(b.hook ?? '')) return true
  if (a.scenes.length !== b.scenes.length) return true
  return a.scenes.some((s, i) => {
    const t = b.scenes[i]
    return s.scene_number !== t.scene_number
      || s.scene_type !== t.scene_type
      || s.show_in_teleprompter !== t.show_in_teleprompter
      || normalizeDialogueEdit(s.dialogue ?? '') !== normalizeDialogueEdit(t.dialogue ?? '')
  })
}

/** How a rejection reads to the creator. `unchanged` has no message: nothing
 *  went wrong, and saying so would make a non-event look like one. */
export const SCRIPT_EDIT_MESSAGE: Record<Exclude<ScriptEditRejection, 'unchanged'>, string> = {
  no_such_scene: 'That scene is no longer part of your script.',
  scene_has_no_dialogue: 'This is a silent shot — there are no words to change.',
  would_empty_the_line: 'A scene needs words. Put something back, or leave it as it was.',
  too_long: 'That line is too long to record.',
}
