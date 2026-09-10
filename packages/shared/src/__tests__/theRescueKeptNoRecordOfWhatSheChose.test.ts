// THIRTEEN DELIVERED SCRIPTS LEFT NO RECORD OF WHAT THE CREATOR CHOSE.
//
// ⚠️⚠️ MEASURED 2026-09-10. All 13 generations that day took generate-blueprint's
// RESCUE branch, and that branch wrote neither `generation_choices` (last row
// 2026-09-08 15:46) nor `generation_outcomes` (which has never held a row). Both
// tables exist to describe scripts that were DELIVERED, and a rescued script is
// delivered — the creator received it and was charged for it.
//
// ⚠️ AND THE COST IS NOT ONLY ANALYTICS, WHICH IS WHY THIS IS NOT A TIDY-UP.
// `contentHistory.ts`'s header records an OPEN PRODUCT QUESTION — whether repeat
// premises justify a blocker — and names its discriminator: a near-duplicate pair
// generated DAYS APART rather than in one sitting, of which "zero exist today".
// The 13 runs are the strongest counter-evidence yet: 7 of 13 share one premise
// across what were DIFFERENT objectives, which is not a retry. But the objective
// per run is UNRECOVERABLE — `generation_choices` was never written and the
// blueprint does not carry the goal (verified: no `goal` key at any level). So the
// missing row is what blocks the decision, and restoring it is upstream of the
// feature the audit asked for.
//
// ⚖️ EXECUTED AGAINST A FAKE CLIENT, which the inline version could never be. The
// record used to live inline on the success path, so the only way to assert
// anything about it was to grep the source.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

type Insert = { table: string; row: Record<string, unknown> }

function loadRecorder() {
  const start = EDGE.indexOf('async function recordWhatWasChosen')
  expect(start, 'the shared recorder must exist').toBeGreaterThan(-1)
  const end = EDGE.indexOf('\n}\n', start) + 3
  const js = transformSync(EDGE.slice(start, end), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${js}; return recordWhatWasChosen`)() as
    (a: unknown, i: Record<string, unknown>) => Promise<void>
  return async (input: Record<string, unknown>, failOn?: string) => {
    const inserts: Insert[] = []
    const admin = {
      from: (table: string) => ({
        insert: (row: Record<string, unknown>) => {
          inserts.push({ table, row })
          return Promise.resolve({
            error: table === failOn ? { message: 'boom' } : null,
          })
        },
      }),
    }
    await fn(admin, input)
    return inserts
  }
}

const record = loadRecorder()

const RESCUE_INPUT = {
  generationId: 'g1', ownerId: 'o1',
  rawGoal: 'sell', rawFocus: 'product', rawReferenceUse: null,
  selectedProductId: 'p1', niche: 'fitness', subNiche: 'postpartum',
  // The rescue path's honest nulls: the analysis that computes these threw.
  substanceBudgetBeats: null, referenceDurationSec: null, hadReference: false,
}

describe('both rows are written, from one definition', () => {
  it('writes generation_choices and generation_outcomes', async () => {
    const ins = await record(RESCUE_INPUT)
    expect(ins.map((i) => i.table)).toEqual(['generation_choices', 'generation_outcomes'])
  })

  it('the choices come off the REQUEST, so a rescue records them in full', async () => {
    // ⚠️ THE WHOLE POINT. The choices are not derived from the analysis region, so
    // a run whose analysis threw still knows exactly what the creator picked —
    // which is the fact `contentHistory`'s open question needs.
    const [choices] = await record(RESCUE_INPUT)
    expect(choices.row).toMatchObject({
      generation_id: 'g1', owner_id: 'o1',
      selected_goal: 'sell', selected_focus: 'product',
      selected_product_id: 'p1',
    })
    expect(choices.row.reference_use).toBeNull()
  })

  it('and the analysis-derived fields stay NULL rather than zero', async () => {
    // ⚖️ ABSENT IS NOT ZERO. Writing 0 would enter "the writer cited nothing" into
    // the record the next selection decision reads back.
    const [, outcome] = await record(RESCUE_INPUT)
    expect(outcome.row.substance_budget_beats).toBeNull()
    expect(outcome.row.reference_duration_sec).toBeNull()
    expect(outcome.row.had_reference).toBe(false)
  })

  it('an unanswered goal is null, not a default that looks like a choice', async () => {
    const [choices] = await record({ ...RESCUE_INPUT, rawGoal: '', rawFocus: '   ' })
    expect(choices.row.selected_goal).toBeNull()
    expect(choices.row.selected_focus).toBeNull()
  })

  it('untrusted request text is capped', async () => {
    const [choices] = await record({ ...RESCUE_INPUT, rawGoal: 'x'.repeat(500) })
    expect((choices.row.selected_goal as string).length).toBe(64)
  })

  it('a non-string goal cannot reach the column', async () => {
    // ⚠️ A REQUEST CAN SEND ANYTHING. An object here would store "[object Object]"
    // and make every count meaningless — the same loss `describeThrown` was
    // written for, in a different column.
    const [choices] = await record({ ...RESCUE_INPUT, rawGoal: { evil: 1 } })
    expect(choices.row.selected_goal).toBeNull()
  })
})

describe('it cannot fail the build, on either path', () => {
  it('a failed choices insert is warned and the outcome row is still attempted', async () => {
    // ⚖️ LOSING AN OBSERVATION IS A GAP IN ANALYTICS; THROWING HERE WOULD LOSE THE
    // CREATOR THEIR PAID SCRIPT. And the second row must not be skipped because
    // the first failed — they answer different questions.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ins = await record(RESCUE_INPUT, 'generation_choices')
    expect(ins.map((i) => i.table)).toEqual(['generation_choices', 'generation_outcomes'])
    expect(warn).toHaveBeenCalledWith('choices not recorded:', 'boom')
    warn.mockRestore()
  })

  it('a failed outcome insert is warned too', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await record(RESCUE_INPUT, 'generation_outcomes')
    expect(warn).toHaveBeenCalledWith('outcome row not opened:', 'boom')
    warn.mockRestore()
  })
})

describe('both call sites use it, and neither re-implements it', () => {
  it('the success path and the rescue path both call the recorder', () => {
    expect(EDGE.match(/await recordWhatWasChosen\(admin, \{/g)!.length).toBe(2)
  })

  it('and no insert into either table survives outside it', () => {
    // ⚠️⚠️ THE DEFECT WAS A MISSING SECOND CALLER, so the property that matters is
    // that there is exactly ONE writer. A copy in the catch block would be two
    // authorities for one record, and the one that drifts is the copy nobody reads.
    expect(EDGE.match(/from\('generation_choices'\)/g)!.length).toBe(1)
    expect(EDGE.match(/from\('generation_outcomes'\)/g)!.length).toBe(1)
  })
})
