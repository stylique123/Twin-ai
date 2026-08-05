// The capture surface's list comes from the FILMED script.
//
// These run the real path — a blueprint through `buildRecordingScript` (the same
// adapter the teleprompter is fed from) and out the other side as slots — rather
// than hand-building a RecordingScript. A hand-built fixture would pass even if
// the adapter stopped producing screen-recording scenes at all, which is exactly
// the regression worth catching: the marker reaching the teleprompter as words.
import { describe, expect, it } from 'vitest'
import { buildRecordingScript, type Blueprint, type RecordingScript } from './api'
import { declaredSlots } from './declaredClips'

const HOOK = 'A hook that earns the next line'

function scriptFrom(lines: string[]): RecordingScript {
  const blueprint = {
    hook_options: [HOOK],
    script: lines.map((line) => ({ section: 'Body', line })),
  } as unknown as Blueprint
  return buildRecordingScript({
    generationId: '11111111-1111-1111-1111-111111111111',
    blueprint,
    platform: 'tiktok',
    selectedHook: HOOK,
  })
}

describe('the medium is read from the marker, never from the words', () => {
  it('reads screen and camera when the marker says', () => {
    expect(declaredSlots(scriptFrom(['[SHOW SCREEN: the settings page]']))[0])
      .toMatchObject({ label: 'the settings page', medium: 'screen' })
    expect(declaredSlots(scriptFrom(['[SHOW ON CAMERA: the box]']))[0])
      .toMatchObject({ label: 'the box', medium: 'camera' })
    expect(declaredSlots(scriptFrom(['[SHOW CAMERA: the box]']))[0])
      .toMatchObject({ label: 'the box', medium: 'camera' })
  })

  it('an untyped marker is UNKNOWN, not screen', () => {
    // THE BUG THIS PINS. Every declared clip used to become a screen recording
    // by definition, so a jeweller asking to show a product box was offered a
    // share-your-screen picker. Unknown is asked, never assumed.
    expect(declaredSlots(scriptFrom(['[SHOW: the product box]']))[0])
      .toMatchObject({ label: 'the product box', medium: 'unknown' })
  })

  it('never infers the medium from what the label SAYS', () => {
    // "settings page" reads like a screen and "necklace" reads like an object.
    // Deciding from the words is the guess containerResolution exists to refuse
    // — the creator knows what they are pointing at and the model can say so.
    for (const label of ['the settings page', 'the dashboard', 'my necklace']) {
      expect(declaredSlots(scriptFrom([`[SHOW: ${label}]`]))[0].medium).toBe('unknown')
    }
  })

  it('routes the scene type from the medium', () => {
    const typeOf = (line: string) =>
      scriptFrom([line]).scenes.find((s) => s.clip_label)?.scene_type
    expect(typeOf('[SHOW SCREEN: the dashboard]')).toBe('screen_recording')
    expect(typeOf('[SHOW ON CAMERA: the box]')).toBe('product_demo')
    // Neither of the two committed types — calling an unanswered marker either
    // one would be the assumption this removes.
    expect(typeOf('[SHOW: the thing]')).toBe('b_roll')
  })

  it('a camera clip is still not something the creator reads aloud', () => {
    const scene = scriptFrom(['[SHOW ON CAMERA: the box]']).scenes.find((s) => s.clip_label)
    expect(scene!.show_in_teleprompter).toBe(false)
    expect(scene!.dialogue).toBeNull()
  })
})

describe('declaredSlots', () => {
  it('lists what the script declared, in scene order', () => {
    expect(declaredSlots(scriptFrom([
      'Here is the thing everyone gets wrong.',
      '[SHOW: the settings page]',
      'And this is where it bites you.',
      '[SHOW: the billing screen]',
    ])).map((s) => s.label)).toEqual(['the settings page', 'the billing screen'])
  })

  it('is case-insensitive about the marker — a lowercase one is not lost', () => {
    expect(declaredSlots(scriptFrom(['talking', '[show: the dashboard]'])).map((s) => s.label))
      .toEqual(['the dashboard'])
  })

  it('offers ONE capture per distinct slot, however often it is declared', () => {
    // Two buttons for one label would produce two rows fighting over one
    // `clip_label`, and nothing downstream could tell them apart.
    expect(declaredSlots(scriptFrom([
      '[SHOW: the dashboard]', 'talking', '[SHOW: The Dashboard]',
    ]))).toHaveLength(1)
  })

  it('never offers a capture for an unfilled container', () => {
    // `[product name]` is a GAP, not a clip. Offering to record it would tell
    // the creator the hole in their script is something they can film.
    expect(declaredSlots(scriptFrom([
      'Today I want to talk about [product name]', 'and [their objection] too',
    ]))).toEqual([])
  })

  it('is empty for a script with nothing to show, and for no script at all', () => {
    expect(declaredSlots(scriptFrom(['just me talking', 'still talking']))).toEqual([])
    expect(declaredSlots(null)).toEqual([])
  })
})

describe('a declared clip is never something the creator reads aloud', () => {
  it('a whole-line marker becomes a SILENT scene, never dialogue', () => {
    // The defect this pins: the marker reached the teleprompter as an ordinary
    // talking scene, so the creator was prompted to say "show: the settings
    // page" into the camera.
    const script = scriptFrom(['Here is the fix.', '[SHOW SCREEN: the settings page]'])
    const scene = script.scenes.find((s) => s.clip_label)
    expect(scene).toBeDefined()
    expect(scene!.dialogue).toBeNull()
    expect(scene!.show_in_teleprompter).toBe(false)
    expect(scene!.clip_label).toBe('the settings page')
    expect(scene!.scene_type).toBe('screen_recording')
  })

  it('no spoken line anywhere in the script still contains a marker', () => {
    const script = scriptFrom([
      'Here is the fix [SHOW: the settings page] and it takes one tap.',
      '[SHOW: the billing screen]',
      'That is the whole thing.',
    ])
    for (const scene of script.scenes) {
      expect(scene.dialogue ?? '').not.toMatch(/\[\s*show\s*:/i)
    }
  })

  it('an EMBEDDED marker leaves the sentence readable and still declares its slot', () => {
    // Removing the marker must not eat the words around it, and must not
    // silently discard the instruction either.
    const script = scriptFrom(['Here is the fix [SHOW: the settings page] and it takes one tap.'])
    const spoken = script.scenes.filter((s) => s.show_in_teleprompter).map((s) => s.dialogue)
    expect(spoken).toContain('Here is the fix and it takes one tap.')
    expect(declaredSlots(script).map((s) => s.label)).toEqual(['the settings page'])
  })

  it('every declared slot is a scene the teleprompter skips', () => {
    const script = scriptFrom(['talking', '[SHOW: the dashboard]', 'more talking'])
    const slots = declaredSlots(script)
    expect(slots).toHaveLength(1)
    for (const slot of slots) {
      const scene = script.scenes.find((s) => s.scene_number === slot.sceneNumber)
      expect(scene!.show_in_teleprompter).toBe(false)
    }
  })
})
