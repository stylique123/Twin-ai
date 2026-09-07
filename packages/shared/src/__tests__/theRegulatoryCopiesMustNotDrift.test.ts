import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { statesARegulatoryRule } from '../regulatoryClaim'

// ⚠️ THE EDGE FUNCTION CANNOT IMPORT FROM THE WORKSPACE, so the regulatory
// vocabulary exists twice — in `regulatoryClaim.ts` and inlined in
// generate-blueprint. This is what makes "the two copies must not drift"
// enforceable rather than aspirational, mirroring
// `the-two-copies-must-not-drift.test.ts` for the comparative vocabulary.
//
// ⚠️ AND ONLY THE EDGE COPY RUNS. The shared module has no production reader;
// the inlined one decides what a creator reads aloud. A test that only exercised
// the shared copy would stay green while the shipped rule rotted.
const edge = readFileSync(
  fileURLToPath(new URL('../../../../supabase/functions/generate-blueprint/index.ts', import.meta.url)),
  'utf8',
)

/** Rebuild the edge copy's matchers from its own source text. */
function edgeMatcher(name: string): RegExp {
  const m = edge.match(new RegExp(`const ${name} =\\s*\\n\\s*/(.+)/i\\b`))
  if (!m) throw new Error(`${name} not found in the edge function`)
  return new RegExp(m[1], 'i')
}

function edgeStatesARule(text: string): boolean {
  return edgeMatcher('REG_NOUN_INLINE').test(text) && edgeMatcher('REG_RULE_INLINE').test(text)
}

// Verbatim production, Idea-Mode run I2, 2026-09-06 19:57.
const CASES: Array<[string, boolean]> = [
  ['When you lock in a four-loaf rotation, you max out your cottage license limits without needing commercial gear.', true],
  ['Most people think cottage food laws hold you back because of kitchen size limits.', true],
  // ⚖️ HERS, CORRECTLY CITED, AND MUST STAY UNTOUCHED BY BOTH COPIES.
  ['I am doing a little bit of the same thing today with our Florida cottage food setup.', false],
  ['I got my cottage food registration last spring', false],
  ['You must try this with a cold proof', false],
  ['You do not need a perfect setup to start a microbakery.', false],
]

describe('the regulatory copies agree', () => {
  it('the edge function still carries both matchers', () => {
    expect(() => edgeMatcher('REG_NOUN_INLINE')).not.toThrow()
    expect(() => edgeMatcher('REG_RULE_INLINE')).not.toThrow()
  })

  it('both copies classify every real case identically', () => {
    for (const [line, expected] of CASES) {
      expect(statesARegulatoryRule(line), `shared: ${line}`).toBe(expected)
      expect(edgeStatesARule(line), `edge: ${line}`).toBe(expected)
    }
  })

  it('the edge copy is wired into the repair pipeline, not merely defined', () => {
    // ⚠️ A DETECTOR NOBODY CALLS IS A RULE NOBODY RUNS. Both `entFails` sites —
    // the first build and the post-repair RE-CHECK — must include it, or a
    // repaired script would never be re-examined for the claim it just fixed.
    const calls = edge.split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .filter((l) => l.includes('regulatoryFailuresInline(')).length
    // one definition + two entFails sites + the counter
    expect(calls).toBeGreaterThanOrEqual(4)
  })
})
