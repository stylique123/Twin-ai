import { describe, it, expect } from 'vitest'
import { directionsFor, renderDirectionGuidance, PRESENCE_RULES } from '../performanceDirection'

// ⚠️ AUDIT 2026-10-01 ("SHOWN SCRIPT"): every beat has a spoken half and a
// shown half, for every creator — not only sellers.
describe('the shown half of a script', () => {
  it('a video with no product gets body-and-face cues, never product handling', () => {
    const set = directionsFor({ kind: null, showability: null, shape: null })
    const ids = set.options.map((o) => o.id)
    expect(ids).toContain('show_size')
    expect(ids).not.toContain('twist_open')
    expect(ids).not.toContain('hold_up')
  })
  it('illustrator gestures are offered', () => {
    const ids = directionsFor({ kind: 'SERVICE', showability: 'NEVER' }).options.map((o) => o.id)
    for (const id of ['show_size', 'two_sides', 'mark_steps', 'fingertips']) expect(ids).toContain(id)
  })
  it('an app is a screen product, not a physical one', () => {
    const set = directionsFor({ kind: 'APP', showability: 'ALWAYS', sections: [] })
    expect(set.options.map((o) => o.id)).not.toContain('twist_open')
  })
  it('every prompt carries the presence rules: gesture, eyes, posture, where, demonstration', () => {
    const p = renderDirectionGuidance({ kind: null })
    expect(p).toContain(PRESENCE_RULES)
    for (const w of ['GESTURE', 'EYES', 'POSTURE', 'WHERE', 'DEMONSTRATION']) expect(PRESENCE_RULES).toContain(w)
    expect(p).not.toMatch(/inventing a prop, a gesture/)
  })
})
