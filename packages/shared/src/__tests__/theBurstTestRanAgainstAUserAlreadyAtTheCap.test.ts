// THE BURST LIMITER WAS NEVER THE THING THAT ANSWERED.
//
// ⚠️ `scripts/staging-integration/run.mjs` phase 1 has a Caps block with two
// sub-tests sharing one user. The first proves the open-asset cap by making six
// intents and asserting the sixth is refused — which leaves that user holding
// exactly `max_open` (5, migration 0091:736) open source assets. The second
// then hammers one shared attempt id 32 times to prove the PER-USER BURST
// limiter trips, and its own comment says "existing-asset path mints nothing
// new". But the first of those 32 calls could not mint the attempt's asset:
// the user was at the cap, so it took the `source_too_many_open` path, whose
// message is "Too many recordings are still processing". The pass condition
// requires the substring "few seconds" — which only the burst limiter says.
//
// It went green for a reason unrelated to its claim: `deps.checkRateLimit`
// runs BEFORE the RPC, so on a fast runner the burst limiter answered first
// and hid the broken precondition. At ~3.9s per request the window never
// fills, every attempt falls through to the cap, and phase 1 goes red naming
// a limiter it never reached. That is precisely the 2026-09-15 failure:
// `429x32`, not one of them from the limiter under test.
//
// ⚖️ THIS PINS THE PRECONDITION, NOT THE WORDING. The burst loop must drive a
// client and a generation that the cap loop did not exhaust, and the pass
// condition must stay exactly as strict. Both halves matter: giving the burst
// test a fresh user while loosening "few seconds" to any 429 would restore the
// green tick and re-lose the claim.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const RUN = readFileSync(join(REPO, 'scripts/staging-integration/run.mjs'), 'utf8')
const SQL = readFileSync(join(REPO, 'supabase/migrations/0091_editor_capture_hardening.sql'), 'utf8')

// The Caps block, bounded on its own console banner and the next one, so a
// slice can never sail past the block and read another test's identifiers.
function capsBlock(): string {
  const start = RUN.indexOf("console.log('== Caps:")
  expect(start, 'the Caps block banner is gone').toBeGreaterThan(-1)
  const end = RUN.indexOf("console.log('== T7-oversize", start)
  expect(end, 'the Caps block is no longer followed by T7-oversize').toBeGreaterThan(start)
  return RUN.slice(start, end)
}

// The burst loop alone — from the shared attempt id to the end of the `for`.
function burstLoop(): string {
  const block = capsBlock()
  const start = block.indexOf('const oneAttempt =')
  expect(start, 'the shared attempt id is gone').toBeGreaterThan(-1)
  const end = block.indexOf('const elapsedMs', start)
  expect(end, 'the burst loop is no longer followed by its elapsed measure').toBeGreaterThan(start)
  return block.slice(start, end)
}

describe('the cap sub-test still leaves its user at the cap', () => {
  it('still makes six intents on cCaps and demands the sixth is refused', () => {
    const block = capsBlock()
    expect(block).toMatch(/for \(let i = 0; i < 6; i\+\+\)/)
    expect(block).toMatch(/createIntent\(cCaps, capsGen, randomUUID\(\)/)
    expect(block).toMatch(/statuses\.slice\(0, 5\)\.every\(\(s\) => s === 200\) && statuses\[5\] === 429/)
  })

  it('max_open is 5, which is why six intents leave exactly five open', () => {
    // If this constant ever rises above 6, the cap loop stops filling the cap
    // and this whole finding changes shape — so it is asserted, not assumed.
    const m = SQL.match(/max_open constant int := (\d+);/)
    expect(m, 'the max_open constant is gone from 0091').not.toBeNull()
    expect(Number(m![1])).toBe(5)
    expect(Number(m![1])).toBeLessThan(6)
  })

  // ⚠️ MY FIRST ANCHOR HERE WAS WRONG, AND IT FAILED IMMEDIATELY. The FIRST
  // `source_too_many_open` in the edge file is a status mapper, not the
  // message — so a slice from it read the other error codes instead. The two
  // messages are asserted by their own wording now, and their DISJOINTNESS is
  // the claim: if the cap ever started saying "few seconds", the burst test
  // would go green off the wrong limiter again and this file would be silent.
  it('the cap and the burst limiter say different things, on purpose', () => {
    const edge = readFileSync(join(REPO, 'supabase/functions/source-asset/index.ts'), 'utf8')
    const cap = edge.match(/source_too_many_open'\)\) return '([^']+)'/)
    expect(cap, 'the open-asset cap no longer has its own message').not.toBeNull()
    expect(cap![1]).toMatch(/still processing/)
    expect(cap![1]).not.toMatch(/few seconds/)
    const burst = edge.match(/error: 'Too many uploads at once[^']*'/)
    expect(burst, 'the burst limiter no longer has its own message').not.toBeNull()
    expect(burst![0]).toMatch(/few seconds/)
    expect(burst![0]).not.toMatch(/still processing/)
  })
})

describe('the burst sub-test drives a user the cap loop did not exhaust', () => {
  it('a burst identity exists and is logged in', () => {
    expect(RUN).toMatch(/makeUser\('burst'\)/)
    expect(RUN).toMatch(/const cBurst = await login\(burstUser\.email\)/)
  })

  it('the burst loop uses cBurst and its own generation, never cCaps/capsGen', () => {
    const loop = burstLoop()
    expect(loop).toMatch(/const burstGen = await newGen\(burstUser\.id\)/)
    expect(loop).toMatch(/createIntent\(cBurst, burstGen, oneAttempt/)
    // THE DEFECT. Reverting either identifier restores a burst test that can
    // only ever reach the open-asset cap.
    expect(loop, 'the burst loop is back on the exhausted caps client').not.toMatch(/cCaps/)
    expect(loop, 'the burst loop is back on the exhausted caps generation').not.toMatch(/capsGen/)
  })

  it('the burst identity is not itself pushed to the cap before the loop', () => {
    // One intent per iteration on a shared attempt mints exactly one asset, so
    // burstUser sits at 1 of 5 for all 32 attempts. A loop that minted a fresh
    // attempt each time would re-create the bug under a new name.
    //
    // ⚠️ ANCHOR ON THE LOOP BODY, NOT THE SLICE. My first version asserted the
    // whole slice held no `randomUUID()` — but the slice OPENS with
    // `const oneAttempt = randomUUID()`, which is the correct code. The test
    // was wrong, not the harness. What must hold is that nothing INSIDE the
    // `for` mints a second attempt id.
    const loop = burstLoop()
    const body = loop.slice(loop.indexOf('for (let i = 0;'))
    expect(body).toMatch(/i < 32 && !sawRateLimit/)
    expect(body, 'the loop mints a fresh attempt id per iteration again').not.toMatch(/randomUUID\(\)/)
    expect(body).toMatch(/oneAttempt/)
  })
})

describe('the pass condition did not get easier', () => {
  it('still requires the burst limiter\'s own wording, inside a 32-attempt window', () => {
    const block = capsBlock()
    expect(block).toMatch(/r\.status === 429 && String\(r\.body\.error \?\? ''\)\.includes\('few seconds'\)/)
    expect(block).toMatch(/check\('Caps: per-user rate limit trips within the window', sawRateLimit/)
    // The attempt count is the window claim. Raising it turns "trips within
    // the window" into "trips eventually" under the same name.
    expect(block).toMatch(/i < 32 /)
    expect(block).not.toMatch(/i < (?:6[4-9]|[7-9]\d|\d{3,}) /)
  })

  it('a cap 429 is counted apart from a limiter 429 and named in the evidence', () => {
    const block = capsBlock()
    expect(block).toMatch(/includes\('still processing'\)\) capRefusals\+\+/)
    expect(block).toMatch(/capRefusals > 0/)
    expect(block).toMatch(/OPEN-ASSET CAP/)
  })

  it('the evidence line still prints on green, not only on red', () => {
    const block = capsBlock()
    const note = block.indexOf('NOTE  rate-limit margin')
    const gate = block.indexOf("check('Caps: per-user rate limit trips")
    expect(note).toBeGreaterThan(-1)
    expect(note).toBeLessThan(gate)
  })
})
