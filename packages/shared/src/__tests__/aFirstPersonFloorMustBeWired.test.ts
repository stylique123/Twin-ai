import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { firstPersonFailures } from '../script/firstPersonFloor'

// ⚠️ THE EDGE FUNCTION CANNOT IMPORT FROM THE WORKSPACE, so the floor exists
// twice. This asserts the SHIPPED source, not a restatement of it.
const edge = readFileSync(
  fileURLToPath(new URL('../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url)),
  'utf8',
)

describe('the two copies agree', () => {
  it('the edge copy uses the same marker list as the shared copy', () => {
    const m = edge.match(/const FIRST_PERSON_MARKER_INLINE = (\/.+\/i)\n/)
    expect(m).not.toBeNull()
    // Rebuilt from the shipped text, then run against the cases that matter.
    const re = new RegExp(m![1].slice(1, -2), 'i')
    for (const clears of ['I priced it wrong', 'we bake on two racks', 'my first batch', 'our flour bill']) {
      expect(re.test(clears)).toBe(true)
    }
    for (const doesNot of ['in a wet dough the iron content matters', 'this is the important part']) {
      expect(re.test(doesNot)).toBe(false)
    }
  })

  // ⚖️ THE COUNTER THAT REPORTED THE PROBLEM AND THE FLOOR THAT ACTS ON IT MUST
  // USE ONE DEFINITION OF "IN THEIR VOICE", or a beat could clear the floor
  // while still scoring zero.
  it('the shared floor and witnessScore use the same marker list', () => {
    const ws = readFileSync(fileURLToPath(new URL('../script/witnessScore.ts', import.meta.url)), 'utf8')
    const fp = readFileSync(fileURLToPath(new URL('../script/firstPersonFloor.ts', import.meta.url)), 'utf8')
    const grab = (src: string) => src.match(/const FIRST_PERSON_MARKER = (\/.+\/i)\n/)?.[1]
    expect(grab(ws)).toBeDefined()
    expect(grab(fp)).toBe(grab(ws))
  })
})

describe('the wiring, asserted against the shipped source', () => {
  it('it is merged into entFails, not run as a parallel mechanism', () => {
    expect(edge).toMatch(/\.\.\.regulatoryFailuresInline\(declared, suppliedForCheck\),\s*\n\s*\.\.\.firstPersonFailuresInline\(/)
  })

  // ⚠️ A REPAIR NOBODY RE-CHECKED IS THE TRUST WE JUST WITHDREW. Both the first
  // build and the post-repair re-check must run it, or a rewrite could strip
  // the last first-person line and ship.
  it('BOTH sites run it — the first build and the post-repair re-check', () => {
    expect(edge.match(/\.\.\.firstPersonFailuresInline\(declared, suppliedForCheck\.length\),/g) ?? [])
      .toHaveLength(2)
  })

  it('the re-check before entitlement_repair includes it', () => {
    const i = edge.indexOf('entitlement_repair')
    expect(i).toBeGreaterThan(-1)
    expect(edge.slice(i - 500, i)).toContain('firstPersonFailuresInline(')
  })

  it('the counter is emitted so zero and absent stay distinguishable', () => {
    expect(edge).toContain('first_person_floor_gaps:')
  })

  // ⚖️ IT MUST READ THE SUPPLY THE WRITER ACTUALLY CARRIED, not the whole store.
  // Checking against the fuller store would flag a script for failing to speak
  // material the writer was never given.
  it('supply is the knowledge the prompt carried', () => {
    expect(edge).toContain('firstPersonFailuresInline(declared, suppliedForCheck.length)')
  })
})

describe('the shared copy still behaves, run through its own export', () => {
  const sermon = [
    { line: 'Most home bakers underprice a loaf because they only count flour.', substance: 'creator_knowledge' },
  ]
  it('fires with supply', () => expect(firstPersonFailures(sermon, 8)).toHaveLength(1))
  it('silent without supply', () => expect(firstPersonFailures(sermon, 0)).toEqual([]))
})
