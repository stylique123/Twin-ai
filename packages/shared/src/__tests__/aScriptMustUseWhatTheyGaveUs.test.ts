import { describe, it, expect } from 'vitest'
import { particularFailures, MAX_CANDIDATES, MAX_CANDIDATE_CHARS } from '../script/particularFloor'
import { specificityFloorNote, hasParticular } from '../script/craftContracts'

// ⚠️ THE MEASURED SHAPE: a body with no number, no amount and no mid-sentence
// name, written for a creator whose store holds concrete details.
const VAGUE = [
  { section: 'hook', line: 'Most home bakers give up in the first year.' },
  { section: 'body', line: 'the real problem is that nobody tells you what it costs to run.' },
  { section: 'body', line: 'you end up working for less than you think.' },
  { section: 'body', line: 'and then it stops being fun.' },
  { section: 'call to action', line: 'follow if you want the rest of this.' },
]

const SUPPLIED = [
  { text: 'A 30-dollar sack of flour makes about 18 loaves.' },
  { text: 'I bake in a standard home kitchen in Florida.' },
  { text: 'nothing concrete in this one at all' },
]

describe('it fires on the measured failure', () => {
  it('flags a vague body when the creator supplied concrete details', () => {
    const out = particularFailures(VAGUE, SUPPLIED)
    expect(out).toHaveLength(1)
    expect(out[0].line).toContain('nobody tells you what it costs')
  })

  it('names the FIRST body beat, never the hook or the CTA', () => {
    const out = particularFailures(VAGUE, SUPPLIED)
    expect(out[0].index).toBe(1)
  })

  // ⚠️ THE WHOLE POINT: the repair hands over their OWN words, verbatim, so the
  // writer picks one instead of composing something that sounds like one.
  it('quotes the supplied details verbatim', () => {
    const r = particularFailures(VAGUE, SUPPLIED)[0].repair
    expect(r).toContain('A 30-dollar sack of flour makes about 18 loaves.')
    expect(r).toContain('I bake in a standard home kitchen in Florida.')
  })

  it('offers only the supplied lines that actually carry a particular', () => {
    const r = particularFailures(VAGUE, SUPPLIED)[0].repair
    expect(r).not.toContain('nothing concrete in this one at all')
  })

  // ⚖️ THE INSTRUCTION THAT PRODUCED THE WORST OUTPUT IN THE AUDIT WAS "ADD A
  // FIGURE". This one forbids exactly that.
  it('forbids adding anything not on the list', () => {
    const r = particularFailures(VAGUE, SUPPLIED)[0].repair
    expect(r).toMatch(/Do not add a number, a name or an amount that is not in that list/)
  })

  it('caps how many candidates it offers, so it stays a fact and not a menu', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ text: `Batch ${i + 1} cost me ${i + 2} pounds.` }))
    const r = particularFailures(VAGUE, many)[0].repair
    expect((r.match(/·/g) ?? []).length).toBe(MAX_CANDIDATES - 1)
  })

  it('truncates a long candidate rather than pasting a paragraph', () => {
    const long = [{ text: `I started in 2019 and ${'kept going '.repeat(40)}` }]
    const r = particularFailures(VAGUE, long)[0].repair
    expect(r).toContain('…')
    expect(r.length).toBeLessThan(MAX_CANDIDATE_CHARS + 500)
  })
})

describe('the eleven it must leave alone, and the rest', () => {
  // ⚠️ THE NEGATIVE CONTROL. 11 of the 28 tripping scripts belong to creators
  // with an EMPTY store. Asking them to be specific is asking them to invent.
  it('an empty supply is never a failure', () => {
    expect(particularFailures(VAGUE, [])).toEqual([])
    expect(particularFailures(VAGUE, null)).toEqual([])
    expect(particularFailures(VAGUE, undefined)).toEqual([])
  })

  it('a supply with no particulars in it is never a failure', () => {
    expect(particularFailures(VAGUE, [{ text: 'you just have to keep going' }])).toEqual([])
  })

  it('a body that is ALREADY specific is left alone', () => {
    const specific = [...VAGUE.slice(0, 2), { section: 'body', line: 'a sack of flour runs 30 dollars.' }]
    expect(particularFailures(specific, SUPPLIED)).toEqual([])
  })

  it('one specific body beat anywhere clears the whole script', () => {
    const mixed = [...VAGUE, { section: 'body', line: 'that is 18 loaves a sack.' }]
    expect(particularFailures(mixed, SUPPLIED)).toEqual([])
  })

  it('an empty or malformed script is not a failure', () => {
    expect(particularFailures([], SUPPLIED)).toEqual([])
    expect(particularFailures(null, SUPPLIED)).toEqual([])
  })

  // ⚖️ A HOOK OR CTA CANNOT SATISFY THE FLOOR, so it must not satisfy this
  // either — `bodyBeats` is imported from craftContracts precisely so the two
  // cannot disagree about which beats count.
  it('a particular in the HOOK does not clear the body', () => {
    const hookOnly = [
      { section: 'hook', line: 'It took me 400 loaves to learn this.' },
      { section: 'body', line: 'the real problem is nobody tells you.' },
      { section: 'body', line: 'you work for less than you think.' },
    ]
    expect(particularFailures(hookOnly, SUPPLIED)).toHaveLength(1)
  })
})

// ⚠️⚠️ THE TWO RULES MUST AGREE BY CONSTRUCTION, NOT BY LUCK. If the fix could
// satisfy itself while the floor still fires, the creator reads "nothing here
// is specific" on a script the writer was told it had fixed.
describe('the fix and the floor agree about MEANING, not about length', () => {
  it('on a body long enough for the floor, both fire', () => {
    expect(specificityFloorNote(VAGUE)).not.toBeNull()
    expect(particularFailures(VAGUE, SUPPLIED)).toHaveLength(1)
  })

  // ⚠️⚠️ #718 CLAIMED "EVERY SCRIPT THIS FLAGS IS A SCRIPT THE FLOOR ALSO
  // FLAGS". THAT WAS FALSE, and the test asserting it passed only because its
  // fixture happened to have three body beats. The floor needs THREE and
  // excludes hook, CTA and payoff; Twin's standard Hook/Setup/Re-hook/Payoff/CTA
  // leaves exactly TWO. Measured over the 33 stored scripts, only 2 are eligible
  // for the floor at all — it is nearly silent, not noisy.
  //
  // ⚖️ THIS FIRES ON THE SUPERSET DELIBERATELY. Adopting the minimum would make
  // it inert on the same 2 of 33. Pinned so the real relationship is asserted
  // rather than the flattering one.
  it('on a TWO-beat body the floor stays silent and this still fires', () => {
    const short = [
      { section: 'hook', line: 'Most home bakers give up in the first year.' },
      { section: 'setup', line: 'the real problem is nobody tells you what it costs.' },
      { section: 're-hook', line: 'and then it stops being fun.' },
      { section: 'payoff', line: 'you just have to keep going.' },
      { section: 'cta', line: 'follow if you want the rest of this.' },
    ]
    expect(specificityFloorNote(short)).toBeNull()
    expect(particularFailures(short, SUPPLIED)).toHaveLength(1)
  })

  // ⚠️ AND AN EMPTY BODY IS NEITHER'S PROBLEM. 12 of the 33 stored scripts are
  // hook-and-CTA only, several with the SAME sentence in both. That is a failed
  // generation, not a vague one, and neither rule should pretend to fix it.
  it('an empty body is silent on both — it is a different defect', () => {
    const empty = [
      { section: 'hook', line: 'Follow if you want the rest of this.' },
      { section: 'setup', line: '' },
      { section: 're-hook', line: '' },
      { section: 'cta', line: 'Follow if you want the rest of this.' },
    ]
    expect(specificityFloorNote(empty)).toBeNull()
    expect(particularFailures(empty, SUPPLIED)).toEqual([])
  })

  it('and a script the floor clears, this clears too', () => {
    const specific = [...VAGUE.slice(0, 2), { section: 'body', line: 'a sack runs 30 dollars.' }, VAGUE[3]]
    expect(specificityFloorNote(specific)).toBeNull()
    expect(particularFailures(specific, SUPPLIED)).toEqual([])
  })

  it('it uses the floor\'s own hasParticular, so a candidate that would not clear the floor is not offered', () => {
    expect(hasParticular('you just have to keep going')).toBe(false)
    expect(particularFailures(VAGUE, [{ text: 'you just have to keep going' }])).toEqual([])
  })
})

// ⚠️ A KNOWN LIMIT OF THE FLOOR, PINNED HERE RATHER THAN WORKED AROUND.
// `hasParticular` wants a DIGIT, a currency mark, or a mid-sentence capital, so
// a spelled-out number is not a particular: "two racks" and "thirty dollars"
// both read as vague. This is the same gap `claimEntailment` had until #706,
// where spelling-out made 100% of production money claims invisible to the
// figure check.
//
// ⚖️ NOT FIXED HERE, DELIBERATELY. The owner's call on the specificity floor was
// "fix the writer, leave the floor", and widening `hasParticular` is a change to
// the FLOOR — it would silently clear scripts the creator is currently being
// told are vague. Recorded so the next person finds the decision, not the
// symptom.
describe('the floor does not count spelled-out numbers, and that is recorded', () => {
  it('a spelled-out amount is not a particular', () => {
    expect(hasParticular('it costs about thirty dollars a sack')).toBe(false)
    expect(hasParticular('it costs about $30 a sack')).toBe(true)
  })

  it('so a supplied line whose only figure is spelled out is not offered', () => {
    expect(particularFailures(VAGUE, [{ text: 'a sack runs about thirty dollars' }])).toEqual([])
  })
})
