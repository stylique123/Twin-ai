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

// ⚠️⚠️ THIS BLOCK EXISTS BECAUSE THE PARITY TEST WAS BLIND TO THE CHANGE THAT
// ADDED IT. Scoping the floor to the middle was mutated INTO THE EDGE COPY —
// reverting it to the old whole-script `beats.some(...)` — and all nine tests
// here still passed. A guard that cannot see the drift it exists to catch is
// the defect this repo keeps finding, so the guard was fixed before the change
// shipped, not after.
//
// ⚖️ WHOLE-LINE COMMENTS ARE DROPPED, NEVER "everything after //". Cutting at
// the first `//` deletes a real read that happens to sit after a string
// containing "https://", which is how this file's sibling guard went quiet.
describe('the edge copy scopes the floor to the middle, not the whole script', () => {
  const codeLines = edge.split('\n').filter((l) => !l.trim().startsWith('//'))
  const fn = (() => {
    const start = codeLines.findIndex((l) => l.includes('function firstPersonFailuresInline'))
    expect(start).toBeGreaterThan(-1)
    return codeLines.slice(start, start + 40).join('\n')
  })()

  it('clears on a first-person MIDDLE beat, never on any beat', () => {
    expect(fn).toContain('middle.some((b) => FIRST_PERSON_MARKER_INLINE.test(lineOf(b)))')
    // ⚠️ THE NEGATIVE HALF IS THE HALF THAT CATCHES THE REVERT.
    expect(fn).not.toContain('beats.some((b) => FIRST_PERSON_MARKER_INLINE.test(lineOf(b)))')
  })

  it('excludes the OPENING hook only, so a re-hook stays a middle beat', () => {
    expect(fn).toContain("sec.includes('re-hook')")
    expect(fn).toContain("sec.includes('rehook')")
  })

  it('repairs a MIDDLE beat, so the repair cannot rewrite the hook', () => {
    expect(fn).toContain('middle.includes(b)')
  })

  it('stays silent when the middle carries no text at all', () => {
    expect(fn).toContain("middle.every((b) => lineOf(b).trim() === '')")
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
