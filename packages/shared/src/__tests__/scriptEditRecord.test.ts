// WHAT THE CREATOR CHANGED — the signal the product generates continuously and
// has never written down. 13 real creator decisions exist in the system, all of
// them hook picks; every edit has been discarded at the seam.
import { describe, expect, it } from 'vitest'
import { describeEdit, describeEditFacts, editSummary } from '../scriptEditRecord'

const GENERIC = 'This tool dramatically improves productivity.'
const CONCRETE = 'This saves me doing the same edit six times.'

describe('the edit everyone wants to learn from', () => {
  it('records both halves, not just the survivor', () => {
    const r = describeEdit('dialogue', 3, GENERIC, CONCRETE)!
    expect(r.before).toBe(GENERIC)
    expect(r.after).toBe(CONCRETE)
    expect(r.sceneNumber).toBe(3)
  })

  it('sees the creator claiming it in the first person', () => {
    expect(describeEditFacts(GENERIC, CONCRETE).addedFirstPerson).toBe(true)
  })

  it('does NOT label it "generic to concrete"', () => {
    // ⚠️ THAT IS A JUDGEMENT, AND JUDGEMENT FROZEN AT CAPTURE TIME CANNOT BE
    // REVISED WHEN IT TURNS OUT WRONG. This session produced four broken metrics
    // that would each have been baked into the data. The pair is stored raw.
    const r = describeEdit('dialogue', 1, GENERIC, CONCRETE)!
    expect(Object.keys(r.facts)).not.toContain('editType')
    expect(JSON.stringify(r)).not.toMatch(/generic|concrete/i)
  })
})

describe('facts that are decidable from the two strings', () => {
  it('notices a figure arriving', () => {
    const f = describeEditFacts('it saves a lot of time', 'it saves 6 hours a week')
    expect(f.addedFigure).toBe(true)
    expect(f.removedFigure).toBe(false)
  })

  it('notices a figure being taken OUT, which is rarer and separate', () => {
    const f = describeEditFacts('we grew 3x last year', 'we grew a lot last year')
    expect(f.removedFigure).toBe(true)
    expect(f.addedFigure).toBe(false)
  })

  it('counts cutting as its own thing', () => {
    // ⚖️ CREATORS CUTTING IS ITSELF A FINDING. A writer that is reliably too
    // wordy is a different problem from one that is reliably too vague.
    expect(describeEditFacts('a very long sentence with many words in it', 'short').wordDelta)
      .toBeLessThan(0)
  })

  it('separates a tweak from a rejection', () => {
    // A near-1 keptShare is an adjustment; a near-0 is the creator throwing the
    // line away. Averaging those two describes neither.
    const tweak = describeEditFacts('we grew fast last year', 'we grew really fast last year')
    const rejection = describeEditFacts('we grew fast last year', 'nobody tells you about the plateau')
    expect(tweak.keptShare).toBeGreaterThan(0.8)
    expect(rejection.keptShare).toBeLessThan(0.34)
  })

  it('an appended clause keeps 100% of the original', () => {
    // Kept-share asks what was DISCARDED, not how similar the two are.
    expect(describeEditFacts('this works', 'this works because it is simple').keptShare).toBe(1)
  })
})

describe('what is NOT an edit', () => {
  it('rejects an unchanged line', () => {
    expect(describeEdit('dialogue', 1, 'same words', 'same words')).toBeNull()
  })
  it('rejects an emptied line', () => {
    expect(describeEdit('dialogue', 1, 'something', '   ')).toBeNull()
  })
  it('rejects a non-string', () => {
    expect(describeEdit('dialogue', 1, null, undefined)).toBeNull()
  })
  it('gives the hook no scene number, because it has none', () => {
    expect(describeEdit('hook', 4, 'old hook', 'new hook')!.sceneNumber).toBeNull()
  })
})

describe('editSummary counts rather than averages', () => {
  it('splits cuts from expansions and names the rewrites', () => {
    const rs = [
      describeEdit('dialogue', 1, 'a very wordy line indeed here', 'short')!,
      describeEdit('dialogue', 2, 'it helps', 'it saves me 6 hours a week')!,
      describeEdit('hook', null, 'old opening line', 'a completely different opening')!,
    ]
    const s = editSummary(rs)
    expect(s.edits).toBe(3)
    expect(s.cuts).toBe(1)
    expect(s.expansions).toBe(2)
    expect(s.addedFigure).toBe(1)
    expect(s.rewrites).toBeGreaterThanOrEqual(1)
  })

  it('is empty-safe', () => {
    expect(editSummary([]).edits).toBe(0)
  })
})
