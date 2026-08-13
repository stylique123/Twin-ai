// THE LEAK CHECK DECIDES WHAT A CREATOR SAYS ABOUT THEMSELVES, SO IT MAY NOT DRIFT.
//
// ⚠️ IF THE EDGE COPY LOOSENS AND SHARED DOES NOT, another creator's measured
// claim reaches an audience as a first-person promise — which is the defect this
// exists to stop, and it reaches production while the tests stay green.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { measuredClaims, findLeakedClaims } from '../referenceClaimLeak'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('the edge copy matches shared', () => {
  it('carries the same measurement pattern', () => {
    const edge = EDGE.match(/const MEASURED_CLAIM = new RegExp\(([\s\S]*?)'gi'\)/)
    const shared = readFileSync(join(REPO, 'packages/shared/src/referenceClaimLeak.ts'), 'utf8')
      .match(/const MEASURED = new RegExp\(([\s\S]*?)'gi'\)/)
    expect(edge, 'the edge copy is missing').toBeTruthy()
    expect(shared, 'the shared original is missing').toBeTruthy()
    // Compare the pattern body with escaping normalised — the edge lives inside
    // a TS file written through a generator, so backslash depth can differ while
    // the compiled regex is identical.
    const strip = (s: string) => s.replace(/\\+/g, '\\').replace(/\s+/g, '')
    expect(strip(edge![1])).toBe(strip(shared![1]))
  })

  it('spares the enumeration count in both', () => {
    expect(EDGE).toMatch(/allowed = typeof enumerationCount === 'number'/)
    expect(findLeakedClaims('3 ways to be 3x better',
      [{ line: 'here are 3 ways', substance: 'general' }], 3)).toEqual([])
  })
})

describe('it repairs rather than only counting', () => {
  it('runs a repair pass on the leaks it finds', () => {
    // ⚖️ A COUNTER IS RIGHT FOR A SHAPE NOBODY HAS MEASURED. This one is measured
    // — 9 leaks across 16 runs — and it reaches the audience as a first-person
    // promise, so counting it and shipping it would be knowingly publishing it.
    expect(EDGE).toMatch(/event: 'reference_claim_leak'/)
    expect(EDGE).toMatch(/event: 'reference_claim_leak_repair'/)
    expect(EDGE).toMatch(/leakPrompt/)
  })

  it('refuses a rewrite that carries the number back in', () => {
    // ⚠️ A REPAIR THAT REPHRASES AROUND THE CLAIM AND KEEPS IT IS WORSE THAN NO
    // REPAIR, because it reports success.
    expect(EDGE).toMatch(/measuredClaims\(line\)\.some/)
  })

  it('records WHICH declaration carried the leak', () => {
    // `general` = called another creator's measurement common knowledge.
    // `creator_knowledge` = cited THIS creator for a number they never gave.
    // Both false, and false differently.
    expect(EDGE).toMatch(/by_substance/)
  })

  it('tells the writer why rewording will not help', () => {
    expect(EDGE).toMatch(/belongs to the reference creator/)
    expect(EDGE).toMatch(/do not soften it/)
  })
})

describe('the real corpus', () => {
  it('catches the exact leak that was measured', () => {
    const note = "Claim risk: '3x more productive' is self-reported creator"
      + ' experience and MUST NOT transfer'
    const script = [
      { line: 'Here are 3 simple ways to make your mobile phone 3x more productive.', substance: 'none' },
      { line: 'If you want to be 3x more productive and accelerate your wealth…', substance: 'general' },
      { line: "This technique 3x'd my productivity.", substance: 'creator_knowledge' },
      { line: 'Here are 3 things I actually use.', substance: 'creator_knowledge' },
    ]
    const got = findLeakedClaims(note, script, 3)
    expect(got).toHaveLength(3)
    expect(got.map((l) => l.substance)).toEqual(['none', 'general', 'creator_knowledge'])
    expect(measuredClaims('Here are 3 things I actually use.')).toEqual([])
  })
})
