// TWO COPIES OF THE CONSISTENCY RULE, AND THE PROMPT ONLY EVER SEES ONE.
//
// ⚠️ EDGE FUNCTIONS CANNOT IMPORT `@twinai/shared`, so generate-blueprint
// carries an inlined copy. The shared module has the tests; the inlined one
// decides what a real creator's script may claim about their own business, and
// a drift between them is invisible to every other test here.
//
// ⚖️ SO BOTH ARE EXECUTED OVER EVERY COMBINATION AND COMPARED FIELD BY FIELD —
// including the disclosure asymmetry, which is the one rule where the two
// functions deliberately disagree with each other about direction and so is the
// easiest to "simplify" into agreement on one side only.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import {
  commercialConsistency, saysSellsNothing, requiresDisclosure,
} from '../commercialConsistency'
import { COMMERCIAL_TIES } from '../creatorProfileQuestions'

const EDGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

/** ⚖️ EXECUTED, NOT READ. Extracting the block and running it is the only way
 *  to catch a behavioural drift rather than a textual one. Transpiled with
 *  esbuild — the compiler that builds this repo — because a regex that strips
 *  just enough to parse can quietly change what the code does. */
function loadInline() {
  const start = EDGE.indexOf('// ── COMMERCIAL CONSISTENCY, INLINED ─')
  const end = EDGE.indexOf('// ── END COMMERCIAL CONSISTENCY ─', start)
  expect(start, 'inlined block marker missing — fix the marker, do not delete it').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const js = transformSync(EDGE.slice(start, end), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return {
    commercialConsistencyInline, saysSellsNothingInline, requiresDisclosureInline }`)() as {
      commercialConsistencyInline: typeof commercialConsistency
      saysSellsNothingInline: typeof saysSellsNothing
      requiresDisclosureInline: typeof requiresDisclosure
    }
}

const RELATIONSHIPS = [
  'NONE', 'REVIEW_ONLY', 'AFFILIATE', 'SPONSOR', 'OWN_SERVICE', 'OWN_PRODUCT',
  null, undefined, '', 'NOT_A_RELATIONSHIP', 42,
]

/** Every tie singly, a few real multi-selects, and the empty and absent cases. */
const TIE_INPUTS: unknown[] = [
  null, undefined, [],
  ...COMMERCIAL_TIES.map((t) => [t]),
  ['unspecified', 'own_product'],
  ['own_product', 'affiliate'],
  ['none', 'sponsor'],
  ['not_a_tie'],
]

describe('the inlined copy behaves identically to the shared one', () => {
  const inline = loadInline()

  it('agrees on every verdict and safe claim, over every combination', () => {
    let compared = 0
    for (const ties of TIE_INPUTS) {
      for (const rel of RELATIONSHIPS) {
        const a = commercialConsistency(ties as never, rel)
        const b = inline.commercialConsistencyInline(ties as never, rel)
        expect(b, `drift at ties=${JSON.stringify(ties)} rel=${String(rel)}`).toEqual(a)
        compared++
      }
    }
    // Guards the guard: an empty loop would pass silently.
    expect(compared).toBeGreaterThan(100)
  })

  it('agrees on saysSellsNothing everywhere', () => {
    for (const ties of TIE_INPUTS) {
      for (const rel of RELATIONSHIPS) {
        expect(inline.saysSellsNothingInline(ties as never, rel),
          `drift at ties=${JSON.stringify(ties)} rel=${String(rel)}`)
          .toBe(saysSellsNothing(ties as never, rel))
      }
    }
  })

  // ⚠️ THE ASYMMETRY IS THE PART MOST LIKELY TO BE "TIDIED" ON ONE SIDE.
  // Deriving disclosure from the resolved claim looks like a simplification and
  // silently drops the notice for a contradicted affiliate.
  it('agrees on requiresDisclosure, including where it disagrees with `safe`', () => {
    for (const ties of TIE_INPUTS) {
      for (const rel of RELATIONSHIPS) {
        expect(inline.requiresDisclosureInline(ties as never, rel),
          `drift at ties=${JSON.stringify(ties)} rel=${String(rel)}`)
          .toBe(requiresDisclosure(ties as never, rel))
      }
    }
  })

  it('both copies keep disclosure ON where the safe claim resolves it away', () => {
    for (const c of [commercialConsistency, inline.commercialConsistencyInline]) {
      expect(c(['none'], 'SPONSOR').safe).toBe('NONE')
    }
    expect(requiresDisclosure(['none'], 'SPONSOR')).toBe(true)
    expect(inline.requiresDisclosureInline(['none'], 'SPONSOR')).toBe(true)
  })
})
