import { describe, it, expect } from 'vitest'
import {
  readVerdict, advisoryNote, shouldAsk, MIN_FINDINGS_TO_SURFACE, MAX_FINDINGS,
} from '../advisoryRead.js'
import { lexicalFloor } from '../repetition.js'

const beats = (n: number) => Array.from({ length: n }, (_, i) => ({
  line: `beat ${i} carries enough distinct content tokens to compare properly`,
  section: `Section ${i}`,
}))
const rep = (beat: number, echoes: number, what = 'both promise the same outcome') =>
  ({ kind: 'repetition', beat, echoes, what })

describe('shouldAsk', () => {
  it('skips a script too short to repeat itself', () => {
    expect(shouldAsk(lexicalFloor(beats(3)))).toBe(false)
  })
  it('asks once there are enough beats', () => {
    expect(shouldAsk(lexicalFloor(beats(4)))).toBe(true)
  })
  // ⚠️ A CLEAN FLOOR DOES NOT SKIP THE CALL. Two beats that say one thing in
  // unrelated words score zero overlap — that is the whole reason to ask.
  it('a floor that found nothing still asks', () => {
    // ⚠️ THE FIXTURE HAS TO ACTUALLY BE CLEAN. `beats()` repeats its scaffolding
    // words in every line, so it scores ~100% overlap — asserting "found
    // nothing" on it passed for the wrong reason until the numbers were read.
    const distinct = [
      { line: 'shoppers abandon carts when sizing feels uncertain', section: 'Hook' },
      { line: 'warehouse logistics collapsed during february snowstorms', section: 'Setup' },
      { line: 'espresso extraction depends heavily on grinder consistency', section: 'Proof' },
      { line: 'migrating birds navigate using magnetic field gradients', section: 'Story' },
    ]
    const f = lexicalFloor(distinct)
    expect(f.pairs.every((p) => p.overlapMilli < 500)).toBe(true)
    expect(shouldAsk(f)).toBe(true)
  })
})

describe('readVerdict believes as little as possible', () => {
  it.each([
    ['not an object', null], ['no findings key', {}], ['findings not an array', { findings: 'x' }],
  ])('%s is a declined read, not a crash', (_l, raw) => {
    expect(readVerdict(raw, 6, [])).toEqual({ findings: [], quiet: 'model_declined' })
  })

  it('accepts two well-formed findings', () => {
    const v = readVerdict({ findings: [rep(3, 1), rep(5, 2)] }, 6, [])
    expect(v.quiet).toBeNull()
    expect(v.findings).toHaveLength(2)
  })

  // ⚠️ ONE FINDING IS INSIDE THE NOISE. The payoff branch that fired on one
  // measured 1-6 and is deliberately not built.
  it('one finding is held back, and says why', () => {
    const v = readVerdict({ findings: [rep(3, 1)] }, 6, [])
    expect(v.findings).toEqual([])
    expect(v.quiet).toBe('below_threshold')
    expect(MIN_FINDINGS_TO_SURFACE).toBe(2)
  })

  // ⚠️ THE ASK TOLD IT NOT TO. A model that names an exempt beat anyway is
  // exactly the case worth defending against.
  it('drops findings that name a deliberate beat, on either side', () => {
    expect(readVerdict({ findings: [rep(2, 1), rep(4, 1)] }, 6, [2]).findings).toHaveLength(0)
    expect(readVerdict({ findings: [rep(3, 2), rep(4, 2)] }, 6, [2]).findings).toHaveLength(0)
  })

  it.each([
    ['a missing beat index', { kind: 'repetition', echoes: 1, what: 'x y z' }],
    ['a fractional index', rep(1.5 as number, 1)],
    ['an out-of-range index', rep(99, 1)],
    ['a negative index', rep(-1, 1)],
    ['a beat echoing itself', rep(3, 3)],
    ['repetition with no earlier beat', { kind: 'repetition', beat: 3, what: 'x y z' }],
    ['an unknown kind', { kind: 'vibes', beat: 3, echoes: 1, what: 'x y z' }],
    ['empty text', rep(3, 1, '')],
  ])('%s is dropped', (_l, bad) => {
    const v = readVerdict({ findings: [bad, rep(5, 2)] }, 6, [])
    expect(v.findings.length).toBeLessThan(2)
  })

  // ⚠️ Number(null) IS 0 AND 0 IS A VALID BEAT. A missing index must not attach
  // a note to the hook.
  it('a null index never becomes beat 0', () => {
    const v = readVerdict({ findings: [rep(null as never, 1), rep(null as never, 2)] }, 6, [])
    expect(v.findings).toEqual([])
  })

  it('two findings about the same pair collapse to one', () => {
    const v = readVerdict({ findings: [rep(4, 1), rep(1, 4), rep(5, 2)] }, 6, [])
    expect(v.findings).toHaveLength(2)
  })

  it('caps a runaway response', () => {
    const many = Array.from({ length: 20 }, (_, i) => rep(i + 5, i))
    expect(readVerdict({ findings: many }, 40, []).findings.length).toBeLessThanOrEqual(MAX_FINDINGS)
  })
})

describe('advisoryNote', () => {
  it('names the earlier line in one-based numbering a creator can count to', () => {
    const v = readVerdict({ findings: [rep(4, 1), rep(5, 2)] }, 6, [])
    expect(advisoryNote(v.findings, 4)).toContain('line 2')
  })
  it('says nothing about a beat with no finding', () => {
    const v = readVerdict({ findings: [rep(4, 1), rep(5, 2)] }, 6, [])
    expect(advisoryNote(v.findings, 0)).toBeNull()
  })
  // ⚖️ NO GRADE, NO COUNT — the same voice stockPhraseNote uses.
  it('never grades the beat or counts the findings', () => {
    const v = readVerdict({ findings: [rep(4, 1), rep(5, 2)] }, 6, [])
    const note = advisoryNote(v.findings, 4)!
    expect(note).not.toMatch(/\b(bad|weak|poor|score|\d+ (issues|problems))\b/i)
  })
})
