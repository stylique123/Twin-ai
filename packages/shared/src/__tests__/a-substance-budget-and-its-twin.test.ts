import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { substanceBudget, referencePointsFrom, POINT_ROLES, beatsFor, TARGET_SECONDS, planLength } from '../script/substanceBudget'

// ⚠️ THE EDGE FUNCTION CANNOT IMPORT FROM THE WORKSPACE, so the budget exists
// twice. This rebuilds the edge copy's numbers FROM ITS OWN SOURCE rather than
// restating them, so a change made in one place and not the other fails here
// instead of drifting quietly — the same discipline
// `the-two-copies-must-not-drift` applies to the comparative vocabulary.
const edge = readFileSync(
  fileURLToPath(new URL('../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url)),
  'utf8',
)

describe('the two substance-budget copies agree', () => {
  it('the point roles are identical in both', () => {
    const m = edge.match(/const POINT_ROLES_INLINE: readonly string\[\] = \[([^\]]+)\]/)
    expect(m, 'POINT_ROLES_INLINE not found in the edge function').toBeTruthy()
    const inline = [...(m as RegExpMatchArray)[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
    expect(inline).toEqual([...POINT_ROLES])
  })

  it('the free-beat allowance is identical in both', () => {
    const m = edge.match(/const FREE_BEATS_INLINE = (\d+)/)
    expect(m).toBeTruthy()
    const free = Number((m as RegExpMatchArray)[1])
    // Derived from the shared copy rather than written down again: an empty but
    // COUNTED reference is worth exactly the free beats.
    const empty = substanceBudget({ referencePoints: 0, storeItems: 0, productFacts: 0 })
    expect(empty.beats).toBe(free)
  })

  // ⚠️⚠️ THE THIRD STATE IS THE PART MOST LIKELY TO BE "TIDIED" AWAY BY SOMEONE
  // WHO HAS NOT READ WHY. A `?? 0` in either copy turns "nobody counted" into
  // "there is nothing to say", which caps every script on an unread reference.
  it('neither copy coerces an uncounted source to zero', () => {
    const at = edge.indexOf('function substanceBudgetInline')
    expect(at).toBeGreaterThan(-1)
    const end = edge.indexOf('\n}', edge.indexOf('return { beats:', at))
    const body = edge.slice(at, end)
    // The ONLY permitted `?? 0` is inside the branch that has already
    // established at least one source was counted.
    const guard = /if \(r === null && st === null && p === null\) return \{ beats: null, enforceable: false \}/
    expect(body, 'the all-unknown branch must precede any coercion').toMatch(guard)
    expect(body.indexOf('?? 0')).toBeGreaterThan(body.search(guard))

    expect(substanceBudget({}).beats).toBeNull()
    expect(referencePointsFrom(null)).toBeNull()
  })

  it('the edge counts points from the same shape the profile actually stores', () => {
    // ⚖️ `structure.beats` IS AN `Assessed`, so the value hangs off `.value`.
    // Reading `structure.beats` directly would always be undefined and the
    // budget would be silently unknown on every generation.
    const fn = edge.slice(edge.indexOf('function referencePointsFromInline'))
    expect(fn.slice(0, 400)).toContain('.beats')
    expect(fn.slice(0, 400)).toContain('value')
  })
})

describe('the budget is actually wired into a generation', () => {
  // ⚠️ THE WHOLE REASON THIS PR EXISTS. `check_symbol_readers` failed the first
  // version of this module with seven exports and no caller — "high coverage on
  // an unreached function is the specific trap: it looks like the best-verified
  // code in the repo". This asserts the reader stays.
  it('the audit carries the counted budget', () => {
    expect(edge).toContain('substance_budget: substanceBudgetBeats')
    expect(edge).toContain('substance_reference_points: substanceReferencePoints')
  })

  it('the budget is computed before the audit reads it', () => {
    // ⚠️ THE ANCHOR MOVED AND THE PROPERTY DID NOT. This used to look for
    // `substanceBudgetBeats = substanceBudgetInline(`. The ban needs the whole
    // budget object, not just its beat count, so the call is now assigned to a
    // local first — the ORDER being asserted is unchanged, and re-pointing the
    // anchor is not the same as relaxing the assertion.
    const computed = edge.indexOf('substanceBudgetBeats = substanceBudgetComputed.beats')
    const read = edge.indexOf('substance_budget: substanceBudgetBeats')
    expect(computed).toBeGreaterThan(-1)
    // ⚠️ A COUNTER READ INTO AN OBJECT LITERAL BEFORE ITS VALUE IS COMPUTED
    // STORES NOTHING — the defect this repo has already filed three times.
    expect(computed).toBeLessThan(read)
  })

  it('it is initialised to null, not to zero', () => {
    expect(edge).toMatch(/let substanceBudgetBeats: number \| null = null/)
    expect(edge).toMatch(/let substanceReferencePoints: number \| null = null/)
  })
})

describe('the expansion ban and its twin', () => {
  it('the beat-count table is identical in both copies', () => {
    const m = edge.match(/const BEATS_FOR_TARGET_INLINE: Readonly<Record<number, number>> = \{([^}]+)\}/)
    expect(m, 'BEATS_FOR_TARGET_INLINE not found in the edge function').toBeTruthy()
    const pairs = [...(m as RegExpMatchArray)[1].matchAll(/(\d+):\s*(\d+)/g)]
      .map(([, k, v]) => [Number(k), Number(v)] as const)
    expect(pairs).toHaveLength(TARGET_SECONDS.length)
    for (const [target, beats] of pairs) expect(beats).toBe(beatsFor(target as 30 | 60 | 90))
  })

  it('the accepted lengths are identical in both copies', () => {
    const m = edge.match(/const TARGET_SECONDS_INLINE: readonly number\[\] = \[([^\]]+)\]/)
    expect(m).toBeTruthy()
    const inline = [...(m as RegExpMatchArray)[1].matchAll(/\d+/g)].map((x) => Number(x[0]))
    expect(inline).toEqual([...TARGET_SECONDS])
  })

  // ⚠️⚠️ THE BAN IS ONE `Math.min` AND IT MUST STAY ONE. A `Math.max`, or the
  // target returned unclamped, is the padding this exists to remove — and it
  // would look like a working rule in every unit test that only checks the
  // shared copy.
  it('the edge copy clamps DOWN, never up', () => {
    const fn = edge.slice(edge.indexOf('function planLengthInline'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toContain('Math.min(targetBeats, budget.beats)')
    expect(body).not.toContain('Math.max(')
  })

  // ⚠️ NULL IS NOT "IT WOULD HAVE CHANGED NOTHING". A coercion here would put a
  // fabricated decision into the column the switch-on decision is made from.
  it('the edge copy returns null when the ban cannot be evaluated', () => {
    const fn = edge.slice(edge.indexOf('function planLengthInline'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/if \(target === null \|\| !budget\.enforceable \|\| budget\.beats === null\) return null/)
    // and the shared copy agrees on the same three inputs
    expect(planLength(60, substanceBudget({})).enforced).toBe(false)
  })

  it('the audit carries the target and what the ban would have allowed', () => {
    expect(edge).toContain('length_target: lengthTarget')
    expect(edge).toContain('length_beats_allowed: lengthBeatsAllowed')
    const computed = edge.indexOf('lengthBeatsAllowed = planLengthInline(')
    expect(computed).toBeGreaterThan(-1)
    // ⚠️ A COUNTER READ INTO A LITERAL BEFORE ITS VALUE IS COMPUTED STORES NOTHING.
    expect(computed).toBeLessThan(edge.indexOf('length_beats_allowed: lengthBeatsAllowed'))
  })
})
