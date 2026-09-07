import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cameFromAReference } from '@twinai/shared'

const RESULT = readFileSync(fileURLToPath(new URL('../pages/Result.tsx', import.meta.url)), 'utf8')
// ⚠️ WHOLE-LINE COMMENTS ONLY. Cutting at the first `//` would delete a real
// read sitting after a string containing "https://" — the way this repo's other
// source-reading guards went quiet twice.
const CODE = RESULT.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('{/*') && !l.trim().startsWith('*')).join('\n')

/**
 * ⚠️⚠️ MEASURED IN PRODUCTION 2026-09-07. Four generations have NO reference —
 * Idea Mode — and all four carry a `reference_read` block, a `format_label` and
 * `fidelity = 'close'`. So the creator was shown, on a video with no reference:
 *
 *   · "Close to the reference"                  (the fidelity chip)
 *   · a platform chip sourced from the reference
 *   · a panel headed "What we took from the reference"
 *
 * Idea Mode was Reference Mode with an empty reference field.
 */
describe('the predicate asks the only field that distinguishes the two', () => {
  it('a real URL is a reference', () => {
    expect(cameFromAReference('https://www.tiktok.com/@x/video/123')).toBe(true)
  })

  // ⚠️ THE EMPTY STRING IS THE ACTUAL PRODUCTION VALUE, not null — all four
  // referenceless rows store ''. A truthiness check on `!== null` would pass
  // every one of them and change nothing.
  it('the empty string production actually stores is NOT a reference', () => {
    expect(cameFromAReference('')).toBe(false)
    expect(cameFromAReference('   ')).toBe(false)
  })

  it('absent and malformed are not references either', () => {
    for (const x of [null, undefined, 0, {}, []]) expect(cameFromAReference(x)).toBe(false)
  })
})

describe('no reference, no claims about a reference', () => {
  it('the fidelity chip is gated, not rendered on its own value', () => {
    // ⚠️ GATING ON `fidelity` WOULD HAVE FIXED NOTHING: it is defaulted to
    // 'close' on all four referenceless runs, so it is always truthy.
    const chip = CODE.indexOf("'Close to the reference'")
    expect(chip).toBeGreaterThan(-1)
    const gate = CODE.lastIndexOf('hasReference && (', chip)
    expect(gate, 'the chip must sit inside a hasReference gate').toBeGreaterThan(-1)
  })

  it('every CreativeTransfer mount is gated', () => {
    const mounts = CODE.split('<CreativeTransfer').length - 1
    expect(mounts, 'both mounts still exist').toBe(2)
    const gated = CODE.split('{hasReference && <CreativeTransfer').length - 1
    // ⚠️ BOTH, NOT ONE. Two mounts, and gating either alone leaves the panel
    // reachable on the other tab.
    expect(gated).toBe(2)
  })

  it('hasReference comes from the shared predicate, not a local re-spelling', () => {
    expect(CODE).toContain('const hasReference = cameFromAReference(gen.reference_url)')
  })
})
