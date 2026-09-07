import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { particularFailures } from '../script/particularFloor'
import { hasParticular } from '../script/craftContracts'

const url = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const edge = readFileSync(url('../../../../supabase/functions/generate-blueprint/index.ts'), 'utf8')
const craft = readFileSync(url('../script/craftContracts.ts'), 'utf8')

describe('the three copies ask the same question', () => {
  // ⚠️ THE EDGE MATCHER, REBUILT FROM THE SHIPPED SOURCE and run against the
  // cases that matter — not a restatement of what it ought to be.
  it('the edge copy of hasParticular behaves like the floor\'s own', () => {
    const digit = edge.match(/const PARTICULAR_DIGIT_INLINE = (\/.+\/)\n/)?.[1]
    const money = edge.match(/const PARTICULAR_MONEY_INLINE = (\/.+\/)\n/)?.[1]
    expect(digit).toBeDefined()
    expect(money).toBeDefined()
    expect(digit).toBe(craft.match(/const PARTICULAR_DIGIT = (\/.+\/)\n/)?.[1])
    expect(money).toBe(craft.match(/const PARTICULAR_MONEY = (\/.+\/)\n/)?.[1])
  })

  // ⚖️ THE MID-SENTENCE CAPITAL RULE IS THE SUBTLE HALF. Every sentence opens
  // with one, so a copy that forgot to skip index 0 would call every script
  // specific and the floor would never be cleared by anything real.
  it('the edge copy skips index 0 and sentence openers, like the floor does', () => {
    expect(edge).toContain('for (let i = 1; i < tokens.length; i++)')
    expect(edge).toMatch(/if \(\/\[\.!\?\]\$\/\.test\(prev\)\) continue/)
    expect(craft).toContain('for (let i = 1; i < tokens.length; i++)')
  })

  it('the floor keeps hasParticular and bodyBeats exported for exactly this reason', () => {
    expect(craft).toMatch(/export function hasParticular\(/)
    expect(craft).toMatch(/export function bodyBeats\(/)
  })

  it('the edge copy excludes the same non-body sections', () => {
    expect(edge).toMatch(/\['hook', 'call to action', 'cta', 'payoff'\]/)
    expect(craft).toMatch(/'hook', 'call to action', 'cta', 'payoff'/)
  })
})

describe('the wiring, asserted against the shipped source', () => {
  it('it is merged into entFails, not run as a parallel mechanism', () => {
    // ⚠️ THIS USED TO DEMAND THE TWO SPREADS BE LITERALLY ADJACENT, which made
    // it fail the moment a THIRD check was merged into the same array
    // (`askAsLineFailuresInline`). Adjacency was never the property worth
    // holding — being in the SAME array literal is, and adjacency only
    // approximated it while forbidding any future addition.
    //
    // ⚖️ SO THIS ASSERTS MORE, NOT LESS: the two spreads must sit in one
    // unbroken run of spreads, with nothing but other `...xFailuresInline(...)`
    // entries between them. A stray statement, a closing bracket, or a
    // conditional in the gap still fails, which is the parallel-mechanism case
    // this test exists to catch.
    expect(edge).toMatch(
      /\.\.\.firstPersonFailuresInline\([^)]*\),(?:\s*\n\s*\.\.\.\w+\([^)]*\),)*\s*\n\s*\.\.\.particularFailuresInline\(/,
    )
  })

  // ⚠️ A REPAIR NOBODY RE-CHECKED IS THE TRUST WE JUST WITHDREW. Both the first
  // build and the post-repair re-check must run it.
  it('BOTH sites run it — the first build and the post-repair re-check', () => {
    expect(edge.match(/\.\.\.particularFailuresInline\(declared, suppliedForCheck\),/g) ?? [])
      .toHaveLength(2)
  })

  it('the re-check before entitlement_repair includes it', () => {
    const i = edge.indexOf('entitlement_repair')
    expect(i).toBeGreaterThan(-1)
    expect(edge.slice(i - 600, i)).toContain('particularFailuresInline(')
  })

  it('the counter is emitted so zero and absent stay distinguishable', () => {
    expect(edge).toContain('particular_floor_gaps:')
  })

  // ⚖️ SUPPLY IS WHAT THE PROMPT CARRIED, not the fuller store — faulting a
  // script for failing to use material the writer never saw would measure the
  // wrong thing.
  it('supply is the knowledge the prompt carried', () => {
    expect(edge).toContain('particularFailuresInline(declared, suppliedForCheck)')
  })

  // ⚠️ THE ONE THING THIS MUST NEVER DO.
  it('the shipped repair forbids inventing a particular', () => {
    expect(edge).toContain('Do not add a number, a name or an amount')
    expect(edge).toContain('ALREADY told us')
  })
})

describe('the shared copy still behaves, through its own export', () => {
  const vague = [
    { section: 'body', line: 'the real problem is nobody tells you what it costs.' },
    { section: 'body', line: 'you work for less than you think.' },
  ]
  it('fires when their store has something to use', () => {
    expect(particularFailures(vague, [{ text: 'A 30-dollar sack makes 18 loaves.' }])).toHaveLength(1)
  })
  it('silent when it does not', () => {
    expect(particularFailures(vague, [{ text: 'you just keep going' }])).toEqual([])
    expect(hasParticular('you just keep going')).toBe(false)
  })
})
