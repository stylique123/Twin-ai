// The rules this file holds, in order of what they cost when broken:
//
//   1. The pacing moves with the words. A rewritten line against the old
//      duration means the recorder's hard cap stops the camera mid-sentence.
//   2. Emptying a line is refused. Deletion by backspace is an accident.
//   3. The hook is written in both places it lives, and never over a creator's
//      own rewrite of scene 1.
//   4. The edited text is normalized the way the SNAPSHOT will normalize it, so
//      what is displayed is what is hashed.
import { describe, expect, it } from 'vitest'
import {
  applyDialogueEdit, applyHookEdit, changesTheRecordedScript, editableScenes,
  normalizeDialogueEdit,
} from '../scriptEdit'
import { estimateDurationSec, type RecordingScene, type RecordingScript } from '../recordingScript'
import { buildRecordingScriptSnapshot } from '../editor/scriptSnapshot'

const scene = (over: Partial<RecordingScene>): RecordingScene => ({
  scene_number: 1, scene_type: 'talking_head', purpose: 'p', dialogue: 'the old line',
  duration_sec: 2, camera_framing: 'c', background: 'b', movement: 'm',
  caption_text: 'cap', pause_after: true, show_in_teleprompter: true, ...over,
})

const script = (over: Partial<RecordingScript> = {}): RecordingScript => ({
  version: 1, generation_id: 'g1', platform: 'reels', hook: 'the old line',
  wpm: 'natural', total_duration_sec: 7,
  scenes: [
    scene({ scene_number: 1, dialogue: 'the old line' }),
    scene({ scene_number: 2, dialogue: 'the middle bit' }),
    scene({ scene_number: 3, scene_type: 'b_roll', dialogue: null, show_in_teleprompter: false }),
  ],
  ...over,
})

describe('the pacing moves with the words', () => {
  it('re-estimates the duration from the NEW line', () => {
    const long = 'a much longer line than the one it replaces, with a great many more words in it'
    const r = applyDialogueEdit(script(), 2, long)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const edited = r.script.scenes.find((s) => s.scene_number === 2)!
    // Left stale, `sceneTimeCapSec` would cap recording against the old, shorter
    // line and stop the camera mid-sentence.
    expect(edited.duration_sec).toBe(estimateDurationSec(long, 'natural'))
    expect(edited.duration_sec).toBeGreaterThan(2)
  })

  it('re-estimates at the script\'s OWN wpm, not the default', () => {
    const line = 'one two three four five six seven eight nine ten'
    const slow = applyDialogueEdit(script({ wpm: 'slow' }), 2, line)
    const fast = applyDialogueEdit(script({ wpm: 'creator' }), 2, line)
    expect(slow.ok && fast.ok).toBe(true)
    if (!slow.ok || !fast.ok) return
    const at = (r: typeof slow) => r.script.scenes.find((s) => s.scene_number === 2)!.duration_sec
    expect(at(slow)).toBeGreaterThan(at(fast))
  })

  it('rolls the total up with it', () => {
    const before = script()
    const r = applyDialogueEdit(before, 2, 'a far longer replacement line with many more words than before')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.script.total_duration_sec).toBeGreaterThan(before.total_duration_sec)
  })
})

describe('what is refused', () => {
  it('emptying a line is a DELETION, and is refused', () => {
    // Offered nowhere and refused here, so backspacing a line to nothing cannot
    // quietly remove a scene from the recording.
    expect(applyDialogueEdit(script(), 2, '   ')).toEqual({ ok: false, reason: 'would_empty_the_line' })
    expect(applyHookEdit(script(), '')).toEqual({ ok: false, reason: 'would_empty_the_line' })
  })

  it('a silent b-roll scene cannot be given words', () => {
    expect(applyDialogueEdit(script(), 3, 'now I am talking'))
      .toEqual({ ok: false, reason: 'scene_has_no_dialogue' })
  })

  it('an unknown scene number changes nothing', () => {
    expect(applyDialogueEdit(script(), 99, 'hello')).toEqual({ ok: false, reason: 'no_such_scene' })
  })

  it('past the snapshot bound is refused before the save, not after', () => {
    expect(applyDialogueEdit(script(), 2, 'x'.repeat(4097))).toEqual({ ok: false, reason: 'too_long' })
  })

  it('re-typing the same words produces no write', () => {
    // Whitespace-only difference included: the snapshot collapses it, so it is
    // the same line and a strict persist + read-back would be spent on nothing.
    expect(applyDialogueEdit(script(), 2, 'the  middle   bit ')).toEqual({ ok: false, reason: 'unchanged' })
  })

  it('editableScenes offers only the scenes with words', () => {
    expect(editableScenes(script()).map((s) => s.scene_number)).toEqual([1, 2])
  })
})

describe('the hook lives in two places and both are hashed', () => {
  it('writing the hook rewrites scene 1 with it', () => {
    const r = applyHookEdit(script(), 'a brand new opening line')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.script.hook).toBe('a brand new opening line')
    // Leaving scene 1 behind would have the creator READING the new line while
    // the hook field and the provenance record the old one.
    expect(r.script.scenes[0].dialogue).toBe('a brand new opening line')
    expect(r.script.scenes[0].duration_sec).toBe(estimateDurationSec('a brand new opening line', 'natural'))
  })

  it('but never over the creator\'s OWN rewrite of scene 1', () => {
    // They have already said that line is not the hook any more. Silently
    // replacing their words would be worse than the two fields disagreeing.
    const theirs = script({
      scenes: [scene({ scene_number: 1, dialogue: 'words I wrote myself' }), scene({ scene_number: 2 })],
    })
    const r = applyHookEdit(theirs, 'a new hook')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.script.hook).toBe('a new hook')
    expect(r.script.scenes[0].dialogue).toBe('words I wrote myself')
  })
})

describe('what is displayed is what is hashed', () => {
  it('normalizes exactly as the snapshot does', () => {
    // A pasted non-breaking space or a doubled space would otherwise save one
    // way, display another, and only surface as a SHA mismatch at record time.
    const messy = ' Hello there   friend\n'
    expect(normalizeDialogueEdit(messy)).toBe('Hello there friend')
    const r = applyDialogueEdit(script(), 2, messy)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const snap = buildRecordingScriptSnapshot({
      generationId: 'g1', hook: r.script.hook,
      scenes: r.script.scenes.map((s) => ({
        scene_number: s.scene_number, scene_type: s.scene_type,
        dialogue: s.dialogue, show_in_teleprompter: s.show_in_teleprompter,
      })),
    })
    // The stored line and the hashed line are byte-identical.
    expect(snap.snapshot.scenes[1].dialogue).toBe(r.script.scenes[1].dialogue)
  })
})

describe('did the edit change what a take was recorded against', () => {
  it('a changed line does', () => {
    const before = script()
    const after = applyDialogueEdit(before, 2, 'something else entirely')
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(changesTheRecordedScript(before, after.script)).toBe(true)
  })

  it('a changed hook does', () => {
    const after = applyHookEdit(script(), 'a different opening')
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(changesTheRecordedScript(script(), after.script)).toBe(true)
  })

  it('a changed FRAMING NOTE does not — the snapshot does not carry it', () => {
    // Warning about guidance changes would train the creator to ignore the
    // warning that matters.
    const before = script()
    const after: RecordingScript = {
      ...before,
      scenes: before.scenes.map((s) => ({ ...s, camera_framing: 'wide', background: 'kitchen' })),
    }
    expect(changesTheRecordedScript(before, after)).toBe(false)
  })

  it('a whitespace-only difference does not — the snapshot collapses it', () => {
    const before = script()
    const after: RecordingScript = {
      ...before,
      scenes: before.scenes.map((s) => (
        s.dialogue ? { ...s, dialogue: `  ${s.dialogue}  ` } : s
      )),
    }
    expect(changesTheRecordedScript(before, after)).toBe(false)
  })

  it('a dropped scene does', () => {
    const before = script()
    expect(changesTheRecordedScript(before, { ...before, scenes: before.scenes.slice(0, 2) })).toBe(true)
  })
})
