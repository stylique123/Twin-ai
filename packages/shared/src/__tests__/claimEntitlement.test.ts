// THE LINE THAT PASSED EVERY CHECK AND WAS STILL FALSE.
//
// Every fixture is a REAL generated line from the 112-run matrix, paired with
// the REAL knowledge the writer was given for that creator.
import { describe, expect, it } from 'vitest'
import { readKnowledge } from '../creatorKnowledge'
import {
  claimStrength, checkEntitlement, enforceEntitlement, bestAvailableLevel,
} from '../claimEntitlement'

/** MEASURED: what the scan actually stored for Nathan — titles only, so every
 *  item is coverage. Nobody heard him say any of it. */
const COVERAGE_ONLY = readKnowledge({ items: [
  { kind: 'topic', text: 'wired vs wireless earbuds', basis: 'demonstrated' },
  { kind: 'product', text: 'camera', basis: 'demonstrated' },
]}).items

/** The same creator once transcripts exist and he is on record with a view. */
const WITH_OPINION = readKnowledge({ items: [
  ...COVERAGE_ONLY,
  { kind: 'opinion', text: 'wired still sounds better than wireless', basis: 'stated' },
]}).items

/** And on record having lived it. */
const WITH_EXPERIENCE = readKnowledge({ items: [
  ...WITH_OPINION,
  { kind: 'experience', text: 'used wired earbuds daily for years before switching', basis: 'stated' },
]}).items

describe('claim strength is read from the sentence, not the citation', () => {
  it('separates discussing a thing from holding a view from having lived it', () => {
    expect(claimStrength("Let's talk about wired versus wireless.")).toBe('discussion')
    expect(claimStrength('I think wired earbuds are overrated.')).toBe('position')
    expect(claimStrength('those wired earbuds I used to swear by')).toBe('history')
  })

  it('a sentence that is BOTH reads as history — the stronger claim wins', () => {
    // "I used to think I needed every camera accessory" asserts a past state of
    // his life, not merely a present opinion. Reading it as a position would
    // license exactly the line that shipped.
    expect(claimStrength('I used to think I needed every single one.')).toBe('history')
  })

  it('ordinary opinion phrasing is not a life event', () => {
    for (const s of ["I'd say it's fine.", 'Honestly, it is overrated.', 'In my opinion it works.']) {
      expect(claimStrength(s)).toBe('position')
    }
  })
})

describe('traceability and entitlement are different questions', () => {
  const LINE = 'those high-end, wired earbuds I used to swear by'

  it('THE REAL FAILURE: the citation is genuine and the claim is not entitled', () => {
    // `substanceIssues` passes this — "wired earbuds" really is his knowledge.
    // What the evidence supports is "he covered the topic". What the line says
    // is "he owned them and loved them".
    const v = checkEntitlement(LINE, COVERAGE_ONLY)
    expect(v.strength).toBe('history')
    expect(v.requires).toBe('experience')
    expect(v.available).toBe('coverage')
    expect(v.entitled).toBe(false)
  })

  it('the same line becomes entitled once he is on record having lived it', () => {
    expect(checkEntitlement(LINE, WITH_EXPERIENCE).entitled).toBe(true)
  })

  it('an opinion-level source does NOT license a personal history', () => {
    // Knowing he thinks wired sounds better is not knowing he owned a pair.
    expect(checkEntitlement(LINE, WITH_OPINION).entitled).toBe(false)
  })

  it('but it does license stating the position', () => {
    expect(checkEntitlement('I still think wired sounds better.', WITH_OPINION).entitled).toBe(true)
    expect(checkEntitlement('I still think wired sounds better.', COVERAGE_ONLY).entitled).toBe(false)
  })
})

describe('nothing supplied is not the same as coverage', () => {
  it('an empty store reaches no level at all', () => {
    expect(bestAvailableLevel([])).toBeNull()
  })

  it('and cannot be rewritten into honesty — it must be asked about', () => {
    const v = checkEntitlement('I stopped buying these.', [])
    expect(v.entitled).toBe(false)
    expect(v.repair).toMatch(/no claim about them at all/i)
  })
})

describe('enforcement blocks and instructs — it does not rewrite', () => {
  it('BLOCKS the script rather than reporting and shipping', () => {
    // The behaviour that let eleven fabricated histories through was
    // detect-then-ship. `blocked` is the whole point of this module.
    const out = enforceEntitlement(['I stopped buying every new iPhone accessory.'], COVERAGE_ONLY)
    expect(out.blocked).toBe(true)
    expect(out.mustRegenerate).toBe(1)
  })

  it('hands the regenerator an instruction, never a find-and-replace', () => {
    // ⚠️ MEASURED: regex repair turned "I used to struggle with distractions"
    // into "I've looked at to struggle with distractions". A false sentence
    // rewritten into an unreadable one is a worse failure, not a fix.
    const out = enforceEntitlement(['I stopped buying every new iPhone accessory.'], COVERAGE_ONLY)
    const v = out.beats[0].verdict
    expect(v.repair).toMatch(/rewrite without any first-person claim/i)
    // The original line is returned UNCHANGED — nothing is silently mangled.
    expect(out.beats[0].line).toBe('I stopped buying every new iPhone accessory.')
  })

  it('marks every beat, so nothing is dropped', () => {
    // A deleted beat is a hole in the video — the count contract exists for it.
    const lines = ['I bought three of these.', 'Here is the spec.', 'I regret buying it.']
    const out = enforceEntitlement(lines, COVERAGE_ONLY)
    expect(out.beats).toHaveLength(3)
    expect(out.beats.map((b) => b.mustRegenerate)).toEqual([true, false, true])
  })

  it('lets an entitled script through untouched', () => {
    const out = enforceEntitlement(['Here is what the spec sheet says.'], COVERAGE_ONLY)
    expect(out.blocked).toBe(false)
    expect(out.beats[0].mustRegenerate).toBe(false)
  })

  it('offers the creator ONE targeted question alongside the repair', () => {
    // Their real answer beats any reframing, so the question is offered even
    // when regeneration could proceed without it.
    const out = enforceEntitlement(['I regret buying it.'], COVERAGE_ONLY)
    expect(out.questions[0]).toMatch(/personally done|real example/i)
    expect(out.beats[0].verdict.repair).toBeTruthy()
  })
})
