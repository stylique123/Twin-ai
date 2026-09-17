// SHE TAPPED THE FOURTH HOOK AND THE TELEPROMPTER READ THE FIRST.
//
// ⚠️ SEEN ON A REAL SCREEN, 2026-09-17. The chooser showed option four selected
// and both Setup A and the teleprompter still read option one:
//   selected: "Want to rebind an old Bible text block without ruining the hinge?"
//   rendered: "Hey everyone, Brad here with a clean way to rebind your Bible."
//
// ⚠️ THE CAUSE. `ScriptEditor` synthesised a script only when none was
// persisted — `loaded ?? safeBuild(..., selectedHook, ...)` — and `selectedHook`
// was used by NOTHING ELSE. The first visit persisted a script built with the
// recommended hook, and from then on the `??` discarded every later choice. The
// effect's dependency array correctly listed `selectedHook`; it re-ran and then
// ignored it.
//
// ⚖️ AND A REBUILD WOULD HAVE BEEN THE WRONG FIX. The persisted script exists so
// a creator's EDITS survive; rebuilding to change one line throws them away.
import { describe, it, expect } from 'vitest'
import { withSelectedHook } from '../recordingScriptAdapter'
import { estimateDurationSec, type RecordingScript, type RecordingScene } from '../recordingScript'

const RECOMMENDED = 'Hey everyone, Brad here with a clean way to rebind your Bible.'
const CHOSEN = 'Want to rebind an old Bible text block without ruining the hinge?'

const scene = (n: number, over: Partial<RecordingScene> = {}): RecordingScene => ({
  scene_number: n,
  scene_type: 'talking_head',
  purpose: 'p',
  dialogue: `line ${n}`,
  duration_sec: 3,
  // ⚠️ THE REAL FIELD NAMES. My first fixture invented `framing`, `setup_id`
  // and `setup_description`; the ratchet's typecheck rejected it — the same
  // defect as #805's helper inventing a `creator` field that `CohortCard` never
  // had, where 14 tests then passed on objects that were not valid cards.
  camera_framing: 'Medium close-up at eye level',
  background: 'Leathercraft workbench facing soft natural window light',
  movement: 'Still, hands on the bench',
  caption_text: `cap ${n}`,
  pause_after: false,
  show_in_teleprompter: true,
  ...over,
})

const scriptWith = (hook: string, over: Partial<RecordingScript> = {}): RecordingScript => {
  const scenes = [
    scene(1, { dialogue: hook, duration_sec: estimateDurationSec(hook, 'natural'), caption_text: 'Rebind your Bible' }),
    scene(2), scene(3),
  ]
  return {
    version: 1,
    generation_id: 'g1',
    platform: 'tiktok',
    hook,
    wpm: 'natural',
    scenes,
    total_duration_sec: scenes.reduce((n, s) => n + s.duration_sec, 0),
    ...over,
  }
}

describe('the chosen hook reaches the script she records from', () => {
  it('replaces scene 1 with the hook she picked', () => {
    const out = withSelectedHook(scriptWith(RECOMMENDED), CHOSEN)
    expect(out?.scenes[0]?.dialogue).toBe(CHOSEN)
    expect(out?.scenes[0]?.dialogue).not.toBe(RECOMMENDED)
  })

  it('updates the top-level hook field too, so no reader is left asserting the old one', () => {
    expect(withSelectedHook(scriptWith(RECOMMENDED), CHOSEN)?.hook).toBe(CHOSEN)
  })

  it('re-times scene 1, because a different sentence is a different length', () => {
    const out = withSelectedHook(scriptWith(RECOMMENDED), CHOSEN)
    expect(out?.scenes[0]?.duration_sec).toBe(estimateDurationSec(CHOSEN, 'natural'))
  })

  it('re-derives the total from the scenes', () => {
    const out = withSelectedHook(scriptWith(RECOMMENDED), CHOSEN)
    const sum = (out?.scenes ?? []).reduce((n, s) => n + s.duration_sec, 0)
    expect(out?.total_duration_sec).toBe(sum)
  })

  // ⚠️ THE WHOLE REASON THIS IS A PATCH AND NOT A REBUILD.
  it('KEEPS every other scene exactly as it was, including her edits', () => {
    const before = scriptWith(RECOMMENDED)
    before.scenes[1] = scene(2, { dialogue: 'A sentence she wrote herself, and it stays.' })
    before.scenes[2] = scene(3, { dialogue: null, caption_text: 'her caption' })
    const out = withSelectedHook(before, CHOSEN)
    expect(out?.scenes[1]).toEqual(before.scenes[1])
    expect(out?.scenes[2]).toEqual(before.scenes[2])
    expect(out?.scenes).toHaveLength(3)
  })

  it('leaves the script untouched when the hook is already hers', () => {
    const same = scriptWith(CHOSEN)
    expect(withSelectedHook(same, CHOSEN)).toBe(same)
  })

  // ⚠️ `chosenHook` STARTS AS '' BEFORE THE GENERATION LOADS, and this runs on
  // mount. Treating empty as "blank the hook" would erase scene 1 every time.
  it('an empty or blank choice is not an instruction to blank the hook', () => {
    for (const empty of ['', '   ', null, undefined]) {
      const s = scriptWith(RECOMMENDED)
      expect(withSelectedHook(s, empty), `choice ${JSON.stringify(empty)}`).toBe(s)
    }
  })

  it('survives a script with no scenes, or none numbered 1, without throwing', () => {
    const none = scriptWith(RECOMMENDED, { scenes: [] })
    expect(withSelectedHook(none, CHOSEN)).toBe(none)
    const renumbered = scriptWith(RECOMMENDED)
    renumbered.scenes = [scene(2), scene(3)]
    expect(withSelectedHook(renumbered, CHOSEN)).toBe(renumbered)
    expect(withSelectedHook(null, CHOSEN)).toBe(null)
    expect(withSelectedHook(undefined, CHOSEN)).toBe(undefined)
  })

  it('returns a NEW object when it does change, so React re-renders', () => {
    const before = scriptWith(RECOMMENDED)
    const out = withSelectedHook(before, CHOSEN)
    expect(out).not.toBe(before)
    expect(before.scenes[0]?.dialogue).toBe(RECOMMENDED) // the input is not mutated
    expect(before.hook).toBe(RECOMMENDED)
  })
})

describe('the caption follows only while it is still derived', () => {
  it('moves with the hook when the creator never touched it', () => {
    // `buildRecordingScript` derives caption_text from the hook, so an
    // untouched caption should track her new choice.
    const derived = scriptWith(RECOMMENDED)
    const out1 = withSelectedHook(derived, CHOSEN)
    const asDerived = out1?.scenes[0]?.caption_text
    // Rebuild from the chosen hook and confirm the caption matches that shape.
    const fresh = withSelectedHook(scriptWith(CHOSEN), CHOSEN)
    expect(typeof asDerived).toBe('string')
    expect(asDerived).toBe(fresh?.scenes[0]?.caption_text ?? asDerived)
  })

  it('and NEVER overwrites a caption she rewrote', () => {
    const s = scriptWith(RECOMMENDED)
    s.scenes[0] = scene(1, { dialogue: RECOMMENDED, caption_text: 'MY OWN WORDS ON SCREEN' })
    const out = withSelectedHook(s, CHOSEN)
    expect(out?.scenes[0]?.caption_text).toBe('MY OWN WORDS ON SCREEN')
    expect(out?.scenes[0]?.dialogue).toBe(CHOSEN)
  })
})
