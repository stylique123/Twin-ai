// A TRUE CITATION ATTACHED TO A NUMBER IT DOES NOT CONTAIN (ledger G8).
//
//     LINE  : "This filming technique has genuinely 3x'd my productivity."
//     CITED : (experience) Has been a professional content creator for 8 years
//
// The citation is REAL. It simply does not contain the claim. `UNSUPPORTED` asks
// whether the cited TEXT traces to something supplied — it does — so a beat
// could attach any real item to any invention and pass every counter clean.
//
// ⚖️ RESTRICTED TO NUMBERS ON PURPOSE. "Does this evidence support this claim" is
// a judgement for prose: an opinion restates a hundred ways, and a string test
// over it blocks good scripts. NUMBERS DO NOT PARAPHRASE — "$50,000" can be
// written "$50K" and never becomes "$70,000" — so for measured values the
// question is decidable.
//
// ⚠️ AND NORMALISATION IS THE LOAD-BEARING PART. A first version of this
// measurement reported 3 violations in 10, and one was its own bug: a beat said
// "$50K in four months" citing "$50,000 a month within its first four months" —
// the same figure, called invented because `K` was not normalised. Shipped, that
// is a false accusation against a working script.
import { describe, expect, it } from 'vitest'
import { findEntailmentGaps, claimedValues, canonicalValue, describeGap } from '../claimEntailment'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

const beat = (line: string, cited: string, substance = 'creator_knowledge') =>
  ({ line, substance, substance_evidence: cited })

describe('the gap that was actually found', () => {
  it('catches a figure the citation does not carry', () => {
    const got = findEntailmentGaps([
      beat("This technique has genuinely 3x'd my productivity as a creator.",
        '(experience) Has been a professional content creator for 8 years'),
    ])
    expect(got).toHaveLength(1)
    expect(got[0].value).toBe('3x')
  })

  it('is not fooled by the citation merely containing SOME number', () => {
    // ⚠️ "8 years" IS A NUMBER AND IT IS NOT THE CLAIM. A check asking only
    // "does the evidence have a digit" passes this, which is how the first
    // version of the measurement missed it.
    const got = findEntailmentGaps([
      beat("3x'd my productivity", 'creator for 8 years'),
    ])
    expect(got).toHaveLength(1)
  })
})

describe('THE FALSE POSITIVE THAT ALMOST SHIPPED', () => {
  it('accepts $50K cited as $50,000 — the same figure', () => {
    // ⚠️ THE EXACT CASE. Reported as a violation by a first pass that did not
    // normalise the K suffix, on a script that was entirely correct.
    const got = findEntailmentGaps([
      beat('the Early app made $50K in four months',
        'The Early app grew from zero to over $50,000 a month in revenue within its first four months.'),
    ])
    expect(got).toHaveLength(0)
  })

  it.each([
    ['$50K', '$50,000'], ['50k users', '50000 users'], ['1.5M views', '1500000 views'],
  ])('treats %j and %j as one value', (a, b) => {
    expect(canonicalValue(a)).toBe(canonicalValue(b))
  })

  it('keeps DIFFERENT figures different', () => {
    expect(canonicalValue('$50,000')).not.toBe(canonicalValue('$70,000'))
    // The unit is part of the identity — 3x and 3% are not the same claim.
    expect(canonicalValue('3x')).not.toBe(canonicalValue('3%'))
  })

  it('does not read the m of "months" as a million', () => {
    // ⚖️ A SUFFIX MATCHER THAT CANNOT TELL 3m FROM 3 months turns every duration
    // into a seven-figure claim.
    expect(canonicalValue('4 months')).not.toBe(canonicalValue('4m'))
    expect(canonicalValue('30 mins')).toContain('30')
  })
})

describe('what it deliberately does not police', () => {
  it('ignores beats that cite nothing', () => {
    // ⚖️ "CITED NOTHING" AND "CITED THE WRONG THING" ARE DIFFERENT FAILURES with
    // different fixes; `undeclaredEvidence` already counts the first.
    expect(findEntailmentGaps([beat('3x better', '')])).toEqual([])
  })

  it('ignores beats not claiming creator knowledge', () => {
    // A `general` beat makes no claim about provenance — that is the leak
    // check's business, not this one.
    expect(findEntailmentGaps([beat('3x better', 'anything', 'general')])).toEqual([])
  })

  it('ignores prose, which paraphrases legitimately', () => {
    // No figure asserted, nothing decidable, no opinion offered.
    expect(findEntailmentGaps([
      beat('You should stop overthinking your thumbnails.',
        '(opinion) thumbnails are overthought'),
    ])).toEqual([])
  })

  it('accepts a figure the citation carries in different words', () => {
    expect(findEntailmentGaps([
      beat('It saves me 10 hours every week.',
        '(experience) the workflow saves about 10 hours a week'),
    ])).toEqual([])
  })
})

describe('the message names the figure and the fix', () => {
  it('says which value, and what to do', () => {
    const [g] = findEntailmentGaps([beat("3x'd my productivity", 'creator for 8 years')])
    const m = describeGap(g)
    expect(m).toMatch(/asserts 3x/)
    expect(m).toMatch(/Cite something that carries that figure, or remove the figure/)
  })

  it('reads values out of a line without inventing any', () => {
    expect(claimedValues('no numbers here').size).toBe(0)
    expect([...claimedValues('grew 3x and saved $2,000')].sort()).toEqual(['2000$', '3x'])
  })
})

describe('G8 can accumulate an answer, rather than expiring', () => {
  // ⚠️ THE DETECTOR WAS BUILT, TESTED, WIRED INTO PRODUCTION — AND ITS READINGS
  // EXPIRED. `entailment_gaps` was emitted inside the `beat_substance`
  // console.log, and edge logs are gone within days. The open half of G8 is a
  // RATE across many generations ("a figure not from the reference, citing a
  // real but unrelated item"), which no amount of traffic can produce from a log
  // that forgets. A detector whose count cannot accumulate is a detector that
  // answers nothing.
  const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
  const SQL = readFileSync(join(REPO, 'supabase/migrations/0131_generation_beat_audit.sql'), 'utf8')

  it('stores the audit on the generation row', () => {
    expect(EDGE).toMatch(/beat_audit: beatAudit,/)
    expect(SQL).toMatch(/add column if not exists beat_audit jsonb/)
  })

  it('carries the G8 count into the stored audit, not only the log', () => {
    const audit = EDGE.slice(EDGE.indexOf('beatAudit = {'), EDGE.indexOf("event: 'beat_substance'"))
    expect(audit).toMatch(/entailment_gaps: findEntailmentGaps\(/)
  })

  it('computes it ONCE, so the stored audit cannot describe a different script', () => {
    expect(EDGE.match(/beatAudit = \{/g)).toHaveLength(1)
    expect(EDGE).toMatch(/event: 'beat_substance',\s*\n\s*\.\.\.beatAudit,/)
  })

  it('starts null, so an unaudited generation is not a clean one', () => {
    // ⚖️ AN AUDIT DEFAULTING TO ZERO GAPS WOULD REPORT EVERY UNEXAMINED
    // GENERATION AS CORRECT — the most expensive direction to be wrong in.
    expect(EDGE).toMatch(/let beatAudit: Record<string, unknown> \| null = null/)
    expect(SQL).toMatch(/NULL means not recorded/)
  })
})
