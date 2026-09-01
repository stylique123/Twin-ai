import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { craftSectionKind, fallbackCta } from '../craftBeats.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../..')
const FN = readFileSync(
  resolve(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

/**
 * ⚠️ MEASURED IN PRODUCTION, generation 45d06b93 (2026-09-01). Seven days of
 * generations contained exactly ONE adjacent duplicate pair, and it was:
 *
 *   beat 5 "Call to action setup" | "Tell me if you have done this differently. I want to hear it."
 *   beat 6 "Call to action"       | "Tell me if you have done this differently. I want to hear it."
 *
 * — verbatim `FALLBACK_CTA.conversations`, said twice in a row off the
 * teleprompter.
 *
 * ⚖️ THIS IS NOT THE #641 DEFECT. That one was the WRONG section being given
 * the CTA line. Here both sections are genuinely cta-class and route here
 * correctly; the fault is that `fallbackCta` is a PURE FUNCTION of (goal,
 * offer), so every CTA-class beat repaired in one script is repaired to the
 * same string. Section-awareness cannot see this, which is why it survived
 * #641 and needs its own guard.
 */
describe('one deterministic CTA line cannot be spoken twice', () => {
  it('the setup label really is cta-class — the routing was never wrong', () => {
    // If this ever returns null the defect changes shape entirely, and the
    // rest of this file would be guarding something that no longer happens.
    expect(craftSectionKind('Call to action setup')).toBe('cta')
    expect(craftSectionKind('Call to action')).toBe('cta')
  })

  it('the fallback is pure, so two CTA beats WOULD collide', () => {
    // The premise of the whole fix, asserted rather than assumed.
    expect(fallbackCta('conversations')).toBe(fallbackCta('conversations'))
    expect(fallbackCta('conversations'))
      .toBe('Tell me if you have done this differently. I want to hear it.')
  })

  it('the repair computes which dead CTA beat is LAST', () => {
    // Not the first. A setup beat leads into the ask; filling in index order
    // would leave the real call to action as the empty one — the defect upside
    // down.
    expect(FN).toMatch(/let lastDeadCta = -1/)
    expect(FN).toMatch(/if \(craftSectionKind\(c\.section\) === 'cta'\) lastDeadCta = v\.index/)
  })

  it('a CTA beat that is not the last one is skipped, not filled', () => {
    // The guard has to sit ABOVE the assignment, or the line is written and
    // then the beat is skipped for other purposes — which is not a fix.
    const branch = FN.indexOf("if (kind === 'cta') {")
    expect(branch).toBeGreaterThan(-1)
    const skip = FN.indexOf('if (v.index !== lastDeadCta) continue', branch)
    const write = FN.indexOf('b.line = fallbackCta(', branch)
    expect(skip).toBeGreaterThan(-1)
    expect(skip).toBeLessThan(write)
  })

  it('the earlier CTA beat stays an ask rather than getting an invented line', () => {
    // `continue` skips `b.substance = 'general'` at the bottom of the loop, so
    // the beat keeps `needs_user` and every downstream partial-script surface
    // still counts it as unwritten. Flipping substance here would hide it.
    const branch = FN.indexOf("if (kind === 'cta') {")
    const skip = FN.indexOf('if (v.index !== lastDeadCta) continue', branch)
    const substance = FN.indexOf("b.substance = 'general'", branch)
    // ⚠️ THE -1 TRAP. Without this line, `indexOf` returns -1 and `-1 <
    // substance` passes — the assertion would hold precisely when the guard
    // had been deleted. Caught by mutation, not by review.
    expect(skip).toBeGreaterThan(-1)
    expect(skip).toBeLessThan(substance)
  })

  it('the logged fallback count is what was replaced, not what asked', () => {
    // `cta_fallback` is the event this behaviour is audited by. Three branches
    // (hook-without-options, payoff, superseded CTA) now decline to write a
    // line, so `asked.length` reports repairs that did not happen.
    expect(FN).toMatch(/ctaFallbacks = ctaReplacements/)
    expect(FN).not.toMatch(/ctaFallbacks = asked\.length/)
    expect(FN).toMatch(/event: 'cta_fallback', beats: ctaReplacements, asked: asked\.length/)
  })
})
