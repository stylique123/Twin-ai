// DISCONNECT TEST, ledger row 7: story-first (#1273, #1284). Kill switch STORY_FIRST=false.
// Fictional fixture only (a made-up potter). No model call.
import { describe, it, expect } from 'vitest'
import { restoreAskedStory, enforceStoryFirst } from '../../storyFirst'
import { EDGE, edgeGate, edgeAfter } from './edge'

const KILN = { id: 'k1', kind: 'experience', text: 'My first kiln load came out with every mug glued to the shelf because I glazed the bottoms.', basis: 'stated' }
const OPINION = { id: 'f1', kind: 'opinion', text: 'Beginners should test glaze on a tile first.', basis: 'stated' }
const NOTE = 'my first kiln load'
const SCRIPT = [
  { section: 'hook', line: 'Opening a kiln is the scariest part of pottery.' },
  { section: 'build', line: 'My first kiln load fused to the shelf overnight. Every glazed mug was glued to the shelf. Two glazes bubbled like melted wax.' },
  { section: 'close', line: 'Would you have opened that kiln?' },
]

/** The two edge steps under `storyFirstOn`: restore the named story (index.ts ~8100), tell it verbatim (~17066). */
function runFor(on: boolean) {
  let kept: Array<typeof KILN> = [OPINION]
  let script = SCRIPT.map((b) => ({ ...b }))
  if (on) {
    const rs = restoreAskedStory(kept, [KILN], NOTE, () => true)
    kept = rs.rows
    const story = kept.find((r) => r.id === KILN.id)
    if (story) script = enforceStoryFirst(script, story.text).script as typeof script
  }
  return { kept: kept.map((r) => r.id), script: script.map((b) => b.line) }
}
const gate = (env: Record<string, string>, trialOn = true) => edgeGate('storyFirstOn', { trialOn }, env) as boolean

describe('STORY_FIRST disconnect', () => {
  it('the edge gate: on for the trial, off with STORY_FIRST=false', () => {
    expect(gate({})).toBe(true)
    expect(gate({ STORY_FIRST: 'false' })).toBe(false)
    expect(gate({}, false)).toBe(false)
  })
  it('on: her named story is restored and told word for word; off: the embellished retelling ships', () => {
    const on = runFor(gate({}))
    const off = runFor(gate({ STORY_FIRST: 'false' }))
    expect(on).not.toEqual(off)
    expect(on.kept).toContain('k1')
    expect(on.script).toContain(KILN.text)
    expect(on.script.join(' ')).not.toMatch(/melted wax/)
    expect(off.kept).toEqual(['f1'])
    expect(off.script.join(' ')).toMatch(/melted wax/)
  })
  it('the edge still calls both steps under the gate', () => {
    expect(edgeAfter("if (storyFirstOn && String(reference_note ?? '').trim()) {", 200)).toContain('restoreAskedStory(')
    expect(edgeAfter('if (storyFirstOn && storyFirstPick) {', 300)).toContain('enforceStoryFirst(')
  })
})
