// THE BUDGET WENT TO TEN. THIS IS WHAT MAKES THE NEXT DECISION MEASURABLE.
//
// ⚠️ THE NUMBER THAT HELD IT AT FIVE WAS MEASURING SOMETHING ELSE. "One to
// two-and-a-half substance items per transcribed video" divided by videos
// TRANSCRIBED, while the extractor's `.slice(0, 12000)` meant about three were
// ever READ. So the raise ships with an instrument rather than another estimate:
// how much NEW canonical substance positions 6-10 actually bought.
//
// ⚖️ AFTER THE MERGE, WHICH IS THE WHOLE POINT. Ten paraphrases of "AI is
// useful" increment `times_seen` and create no row. Counting extracted items
// would price the repeat as if it were a discovery.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { TRANSCRIPT_BUDGET, FREE_TRANSCRIPT_BUDGET, transcriptBudgetFor } from '../transcriptSelection.js'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const VOICE_JOB = readFileSync(join(SRC, 'jobs', 'voice.ts'), 'utf8')
const SHARED = readFileSync(
  join(SRC, '..', '..', 'packages', 'shared', 'src', 'transcriptSelection.ts'), 'utf8')

describe('the raise itself', () => {
  it('paid platforms now get ten', () => {
    expect(TRANSCRIPT_BUDGET).toBe(10)
    expect(transcriptBudgetFor('instagram')).toBe(10)
    expect(transcriptBudgetFor('youtube')).toBe(10)
  })

  it('the free platform is untouched, because it was never the constraint', () => {
    expect(transcriptBudgetFor('tiktok')).toBe(FREE_TRANSCRIPT_BUDGET)
    expect(FREE_TRANSCRIPT_BUDGET).toBe(25)
  })

  it('an UNKNOWN platform still gets the paid budget', () => {
    // ⚠️ DEFAULTING THE OTHER WAY makes every platform added later silently
    // expensive, and the cost lands on a bill rather than a failing test.
    expect(transcriptBudgetFor(undefined)).toBe(TRANSCRIPT_BUDGET)
    expect(transcriptBudgetFor('vimeo')).toBe(TRANSCRIPT_BUDGET)
  })

  it('the shared copy moved too — the worker mirrors it', () => {
    expect(SHARED).toMatch(/export const TRANSCRIPT_BUDGET = 10/)
  })
})

describe('what positions 6-10 bought is recorded, not guessed', () => {
  it('measures NEW rows only, by reading the clock BEFORE the write', () => {
    // ⚖️ A merged repeat keeps its original created_at, so "created since this
    // moment" is exactly "canonical row that did not exist before". Reading the
    // clock after the insert would race it.
    const i = VOICE_JOB.indexOf('const before = new Date().toISOString()')
    const j = VOICE_JOB.indexOf('await insertKnowledge(db as never, fresh as never)')
    expect(i).toBeGreaterThan(-1)
    expect(i).toBeLessThan(j)
  })

  it('splits at the OLD budget, so the comparison is against old behaviour', () => {
    expect(VOICE_JOB).toMatch(/TRANSCRIPT_COHORT_SIZE = 5/)
  })

  it('attributes by the video the item was read out of', () => {
    expect(VOICE_JOB).toMatch(/\.select\('kind, source_url'\)/)
  })

  it('keeps unattributed items OUT of both cohorts', () => {
    // ⚠️ An item whose source the extractor did not name must not be assigned
    // to a cohort it might not belong to — that would flatter whichever bucket
    // the code happened to default to.
    expect(VOICE_JOB).toMatch(/unattributed/)
  })

  it('counts substance separately from raw rows', () => {
    // ⚖️ `covered` and `topic` prove a subject was mentioned. The raise was
    // bought for depth, so depth is what the decision reads.
    expect(VOICE_JOB).toMatch(/const SUBSTANTIVE_KINDS = \[/)
    for (const k of ['experience', 'opinion', 'claim', 'framework']) {
      expect(VOICE_JOB).toMatch(new RegExp(`'${k}'`))
    }
    expect(VOICE_JOB).toMatch(/new_substantive: substantive/)
  })
})

describe('the measurement is durable and cannot break the scan', () => {
  it('is STORED in the job result, not logged', () => {
    // ⚠️ THE COUNTER-DURABILITY RULE. A console line expires; a job result is a
    // row, and this is the number the next budget decision reads.
    expect(VOICE_JOB).toMatch(/cohort_yield: cohortYield/)
  })

  it('is NULL when not measured, never zero', () => {
    // ⚖️ "The extra videos added nothing" and "we did not measure" are different
    // answers, and only one of them should stop the next raise.
    expect(VOICE_JOB).toMatch(/let cohortYield: Record<string, unknown> \| null = null/)
    expect(VOICE_JOB).toMatch(/} catch \{\s*\n\s*return null/)
  })

  it('never fails the voice build it is measuring', () => {
    const fn = VOICE_JOB.slice(VOICE_JOB.indexOf('export async function measureCohortYield'))
    expect(fn.slice(0, fn.indexOf('}\n\n'))).toMatch(/try \{/)
  })
})
