// THE STRUCTURE TRANSFERS. THE AUTOBIOGRAPHY DOES NOT.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  decidePremise, premiseDemand, PREMISE_WINDOW_CHARS, MIN_PREMISE_CHARS,
} from '../premiseCompatibility'
import type { KnowledgeItem } from '../creatorKnowledge'

const item = (over: Partial<KnowledgeItem> = {}): KnowledgeItem => ({
  kind: 'covered', text: 'AI tools', basis: 'demonstrated', ...over,
} as KnowledgeItem)

const EXPERIENCE = item({ kind: 'experience', basis: 'stated', text: 'I ran ads for six months' })
const OPINION = item({ kind: 'opinion', basis: 'stated', text: 'organic is overrated' })
const COVERAGE = item({ kind: 'covered', basis: 'demonstrated', text: 'growth' })

describe('reading what the premise demands', () => {
  it('a first-person completed act is an autobiography', () => {
    expect(premiseDemand('I quit my job at 30 and here is what happened next in my life.'))
      .toBe('narrator_experience')
  })

  it('catches the inverted form the plain adjacency test misses', () => {
    // ⚠️ "5 things I stopped doing" puts the object between the subject and the act.
    expect(premiseDemand('Five things I stopped doing after my first company failed badly.'))
      .toBe('narrator_experience')
  })

  it('FIRST PERSON ALONE IS NOT AN AUTOBIOGRAPHY', () => {
    // ⚖️ "I think" is a stance anyone can hold. Treating it as an autobiography
    // would fire on nearly every reference and make the verdict meaningless.
    expect(premiseDemand('I think most people are completely wrong about this whole topic.'))
      .toBe('none')
  })

  it('a claim about the world demands nothing of the presenter', () => {
    expect(premiseDemand('Most founders waste their first year building the wrong thing entirely.'))
      .toBe('none')
  })

  it('reads only the OPENING, so a later "I built" does not reclassify the premise', () => {
    // ⚠️ A forty-five second script says "I" somewhere regardless of its premise.
    const opening = 'Here is why most pricing pages fail to convert visitors into buyers. '
    const later = 'x'.repeat(PREMISE_WINDOW_CHARS) + ' And I built one myself last year.'
    expect(premiseDemand(opening + later)).toBe('none')
  })

  it('too little text is UNKNOWN, which is not "no personal claim"', () => {
    expect(premiseDemand('I quit.')).toBe('unknown')
    expect(premiseDemand('')).toBe('unknown')
    expect(premiseDemand(null)).toBe('unknown')
    expect('x'.repeat(MIN_PREMISE_CHARS - 1).length).toBeLessThan(MIN_PREMISE_CHARS)
  })
})

describe('the verdict, and what it refuses to claim', () => {
  const AUTOBIO = 'Five things I stopped doing after my first company failed badly.'

  it('an impersonal premise transfers as it stands', () => {
    const d = decidePremise('Most founders waste their first year building the wrong thing.', [])
    expect(d.verdict).toBe('transfer')
    expect(d.instruction).toBe('')
  })

  it('an UNKNOWN demand emits NO instruction rather than a reassuring one', () => {
    // ⚖️ A reference we could not read is not a reference that makes no claim.
    const d = decidePremise('', [EXPERIENCE])
    expect(d.demand).toBe('unknown')
    expect(d.instruction).toBe('')
  })

  it('with NO first-hand experience, the autobiography is forbidden outright', () => {
    const d = decidePremise(AUTOBIO, [OPINION, COVERAGE])
    expect(d.creatorHasExperience).toBe(false)
    expect(d.instruction).toMatch(/NO FIRST-HAND EXPERIENCE ON RECORD/)
    expect(d.instruction).toMatch(/Transfer the STRUCTURE only/)
  })

  it('a DEMONSTRATED opinion is coverage, not experience — the resolver already knew', () => {
    // ⚠️ LIFTED, NOT RETYPED. `evidenceLevel` holds the rule that an opinion
    // known only because the video exists is not a stance the creator stated.
    const d = decidePremise(AUTOBIO, [item({ kind: 'opinion', basis: 'demonstrated' })])
    expect(d.creatorHasExperience).toBe(false)
  })

  it('WITH experience it is still ADAPT, never transfer', () => {
    // ⚖️ Having some experience on record does not make THIS experience theirs.
    // A verdict of `transfer` here would license exactly the invention the
    // module exists to stop.
    const d = decidePremise(AUTOBIO, [EXPERIENCE])
    expect(d.creatorHasExperience).toBe(true)
    expect(d.verdict).toBe('adapt')
    expect(d.instruction).toMatch(/only where a supplied knowledge item says they did that thing/)
  })

  it('both instructions preserve the mechanism, which is the point of transferring', () => {
    // ⚠️ DROPPING THE COUNT WHILE DROPPING THE LIE would trade one defect for
    // the one §5d calls the worst on the board: a script that promises five and
    // delivers three breaks out loud, on camera.
    for (const k of [[EXPERIENCE], [COVERAGE]]) {
      expect(decidePremise(AUTOBIO, k).instruction).toMatch(/count and the shape/)
    }
  })
})

// ── THE READER ─────────────────────────────────────────────────────────────
//
// ⚠️ WITHOUT THESE, THE MODULE IS ANOTHER WRITE-ONLY TAXONOMY — the defect this
// repo has now found in product_entities, six counters and capability_flags.
describe('the decision reaches the writer', () => {
  const EDGE = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
      'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

  it('is computed BEFORE the reference block is assembled', () => {
    // ⚖️ Order is the property. Computing it after would make it a note about a
    // premise already chosen.
    expect(EDGE.indexOf('const premiseInstruction = premiseInstructionInline'))
      .toBeLessThan(EDGE.indexOf('const referenceBlock ='))
  })

  it('is interpolated into BOTH reference-block variants', () => {
    // The real-transcript branch and the URL-only branch. Wiring one leaves the
    // other silently unprotected.
    const hits = EDGE.match(/\$\{premiseInstruction \? `/g) ?? []
    expect(hits.length).toBe(2)
  })

  it('reads experience from kind AND basis together, never kind alone', () => {
    expect(EDGE).toMatch(/String\(k\?\.kind\) === 'experience' && String\(k\?\.basis\) === 'stated'/)
  })

  it('keeps the inline window and threshold in step with the shared module', () => {
    expect(EDGE).toContain(`const PREMISE_WINDOW_CHARS = ${PREMISE_WINDOW_CHARS}`)
    expect(EDGE).toContain(`const MIN_PREMISE_CHARS = ${MIN_PREMISE_CHARS}`)
  })
})
