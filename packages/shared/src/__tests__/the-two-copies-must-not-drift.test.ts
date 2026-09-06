import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { findComparativeClaims } from '../comparativeClaim'

// ⚠️ THE EDGE FUNCTION CANNOT IMPORT FROM THE WORKSPACE, so the comparative
// vocabulary exists twice — here and inlined in generate-blueprint. The file
// says so and warns the copies must not drift; this is what makes that
// enforceable rather than aspirational. `findProductClaimGaps` carries the same
// duplication with the same warning and no such test.
const edge = readFileSync(
  fileURLToPath(new URL('../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url)),
  'utf8',
)

/** Rebuild the edge copy's matchers from its own source, so this tests the
 *  shipped text rather than a restatement of it. */
function edgeMatchers(): { magnitude: RegExp[]; comparative: RegExp[] } {
  const word = edge.match(/const CMP_NUMBER_WORD =\s*\n\s*'([^']+)'/)?.[1]
  if (!word) throw new Error('CMP_NUMBER_WORD not found in the edge function')
  const block = (name: string) => {
    const m = edge.match(new RegExp(`const ${name}: readonly RegExp\\[\\] = \\[([\\s\\S]*?)\\n\\]`))
    if (!m) throw new Error(`${name} not found in the edge function`)
    return m[1]
  }
  const build = (src: string): RegExp[] => {
    const out: RegExp[] = []
    for (const m of src.matchAll(/new RegExp\(`([^`]+)`, 'i'\)/g)) {
      out.push(new RegExp(m[1].replace(/\$\{CMP_NUMBER_WORD\}/g, word).replace(/\\\\/g, '\\'), 'i'))
    }
    for (const m of src.matchAll(/^\s*\/(.+)\/i,$/gm)) out.push(new RegExp(m[1], 'i'))
    return out
  }
  return { magnitude: build(block('CMP_MAGNITUDE')), comparative: build(block('CMP_COMPARATIVE')) }
}

const N1 = 'A thirty-dollar hand-poured candle with a wooden wick lasts six times longer than standard box store alternatives. That makes it half the price per burn hour.'

describe('the edge copy and the shared copy agree', () => {
  const { magnitude, comparative } = edgeMatchers()

  it('the edge copy has all four magnitude patterns and five comparative patterns', () => {
    expect(magnitude).toHaveLength(4)
    expect(comparative).toHaveLength(5)
  })

  // ⚠️⚠️ THE CASE THE WHOLE THING EXISTS FOR, RUN THROUGH THE SHIPPED REGEXES.
  it('the edge copy catches N1', () => {
    expect(magnitude.some((re) => re.test(N1))).toBe(true)
  })

  const CAUGHT = [
    'lasts six times longer than the alternatives',
    'it lasts 6x longer than store bought',
    'twice as long as a supermarket candle',
    'half the price per burn hour',
    'lasts 40 hours',
    'it burns cleaner than store bought candles',
    'better than anything you will find in a shop',
    'compared to the big brands, this is different',
    'the longest-lasting candle I make',
  ]
  const LEFT_ALONE = [
    'a long burning soy candle poured by hand',
    'I kept pouring until the scent held',
    'these are made in small batches in my kitchen',
    'the scent fills the room and it feels like a sanctuary',
  ]

  for (const line of CAUGHT) {
    it(`both copies catch: ${line}`, () => {
      const edgeHit = magnitude.some((re) => re.test(line)) || comparative.some((re) => re.test(line))
      const sharedHit = findComparativeClaims([{ line }]).length === 1
      expect(edgeHit).toBe(true)
      expect(sharedHit).toBe(true)
    })
  }

  for (const line of LEFT_ALONE) {
    it(`both copies leave alone: ${line}`, () => {
      const edgeHit = magnitude.some((re) => re.test(line)) || comparative.some((re) => re.test(line))
      expect(edgeHit).toBe(false)
      expect(findComparativeClaims([{ line }])).toEqual([])
    })
  }
})

describe('the wiring, asserted against the shipped source', () => {
  it('comparative failures are merged into entFails, not run as a parallel mechanism', () => {
    expect(edge).toMatch(/\.\.\.entitlementFailures\(declared, suppliedForCheck\),\s*\n\s*\.\.\.comparativeFailures\(/)
  })

  // ⚠️ A REPAIR NOBODY RE-CHECKED IS THE TRUST WE JUST WITHDREW. The re-check
  // after the repair call must include the comparative pass too, or a rewritten
  // line could reintroduce the claim and ship.
  it('the post-repair re-check includes the comparative pass', () => {
    const after = edge.slice(edge.indexOf('entitlement_repair') - 400, edge.indexOf('entitlement_repair'))
    expect(after).toContain('comparativeFailures(')
  })

  it('the counter is emitted so zero and absent are distinguishable', () => {
    expect(edge).toContain('comparative_claim_gaps:')
  })

  // ⚖️ IT MUST NOT FIRE WHEN THE PRODUCT RECORD HAS FACTS — that is the figure
  // check's job, and two instruments answering one question is how a guard
  // becomes noise.
  it('only fires on a commercial creator with an empty product record', () => {
    expect(edge).toMatch(/if \(!commercial \|\| productFactCount > 0 \|\| !Array\.isArray\(beats\)\) return \[\]/)
  })
})
