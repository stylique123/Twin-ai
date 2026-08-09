import { describe, it, expect } from 'vitest'
import { sceneConsistencyIssues, safeToShow } from '../sceneConsistency'

// The exact strings that shipped to a creator on 2026-08-09, kept verbatim so a
// regression is caught by the case that actually happened rather than by a
// tidied-up paraphrase of it.
const REAL_SCENE_1 = {
  spoken: true,
  dialogue: 'If you are a working parent stuck in the 9 to 5 grind…',
  movement: 'None for the creator, as this is a b roll overlay sequence.',
  background: 'Real footage of a dusty, outdated living room being framed out into separate bedrooms.',
}
const REAL_SCENE_4 = {
  spoken: true,
  dialogue: 'Here is what that looks like.',
  background: 'Same brightly lit kitchen, ensuring the #00E5FF cyan lights are visible.',
}

describe('sceneConsistencyIssues', () => {
  it('catches the scene that gives a line and then says the creator is not in it', () => {
    const issues = sceneConsistencyIssues(REAL_SCENE_1)
    expect(issues.map((i) => i.code)).toContain('absent_performer')
    expect(issues.find((i) => i.code === 'absent_performer')?.field).toBe('movement')
  })

  it('catches a hex colour in an instruction a person carries out', () => {
    const issues = sceneConsistencyIssues(REAL_SCENE_4)
    expect(issues.map((i) => i.code)).toEqual(['palette_leak'])
    expect(issues[0].field).toBe('background')
  })

  it('checks every field a human acts on, not just the obvious one', () => {
    expect(sceneConsistencyIssues({ spoken: true, dialogue: 'x', movement: 'Gesture toward the #fff panel' })
      .map((i) => i.field)).toEqual(['movement'])
    expect(sceneConsistencyIssues({ spoken: true, dialogue: 'x', framing: 'Tight on the #00e5ff strip' })
      .map((i) => i.field)).toEqual(['framing'])
  })

  it('does not call a SILENT b-roll scene a contradiction — there it is simply true', () => {
    expect(sceneConsistencyIssues({
      spoken: false,
      dialogue: null,
      movement: 'None for the creator, as this is a b roll overlay sequence.',
    })).toEqual([])
  })

  it('leaves legitimate direction alone', () => {
    expect(sceneConsistencyIssues({
      spoken: true,
      dialogue: 'Say this',
      movement: 'Let the b roll play under you while you keep talking to camera.',
      background: 'Your kitchen, window behind the camera.',
      framing: 'Chest-up shot',
    })).toEqual([])
  })

  it('does not match a hex-like string that is not a colour', () => {
    expect(sceneConsistencyIssues({ spoken: true, dialogue: 'x', background: 'Room #00E5FF7 upstairs' })).toEqual([])
  })

  it('treats a missing or empty field as nothing to say', () => {
    expect(sceneConsistencyIssues({ spoken: true, dialogue: 'x' })).toEqual([])
    expect(sceneConsistencyIssues({ spoken: true, dialogue: 'x', movement: '   ' })).toEqual([])
  })

  it('needs an actual line before the performer contradiction exists', () => {
    expect(sceneConsistencyIssues({
      spoken: true,
      dialogue: '   ',
      movement: 'None for the creator, as this is a b roll overlay sequence.',
    })).toEqual([])
  })
})

describe('safeToShow', () => {
  it('withholds the field that carries the contradiction, and only that one', () => {
    expect(safeToShow(REAL_SCENE_1, 'movement')).toBe(false)
    expect(safeToShow(REAL_SCENE_1, 'background')).toBe(true)
  })

  it('shows direction that says nothing wrong', () => {
    expect(safeToShow({ spoken: true, dialogue: 'x', movement: 'Lean in on the last word.' }, 'movement')).toBe(true)
  })
})
