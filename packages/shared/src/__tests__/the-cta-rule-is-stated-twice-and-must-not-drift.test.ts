import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { resolveCta } from '../cta'

/**
 * ⚠️ ONE RULE, WRITTEN IN TWO PLACES, AND ONLY ONE OF THEM RUNS.
 *
 * `resolveCta` states the creator-CTA policy in code: their typed wording wins
 * over anything generated, EXCEPT on a video that may not carry a commercial
 * ask. `generate-blueprint` states the same policy in English, in the prompt —
 * and that is the copy production actually uses, because an edge function
 * cannot import this package.
 *
 * ⚖️ SO THIS IS NOT A "WIRE IT UP" TEST, AND SAYING SO MATTERS. The behaviour
 * is already correct in production; I checked before proposing to build it.
 * What is missing is anything holding the two statements together. Delete the
 * prompt line and every test here still passes, `resolveCta` still says the
 * creator's wording wins, and no creator's CTA is ever used again.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('the CTA rule is stated twice and must not drift', () => {
  it('the shared resolver prefers the creator wording over generated text', () => {
    const r = resolveCta({ defaultCta: 'Try Twin free', goal: 'sell', commercial: true })
    expect(r.text).toBe('Try Twin free')
    expect(r.source).toBe('user_confirmed')
  })

  it('…and the edge tells the writer the same thing, in the prompt that ships', () => {
    // The instruction, not merely the variable. A `typedCta` that is computed
    // and then interpolated nowhere is the defect this file exists to catch.
    expect(EDGE).toMatch(/THE CREATOR'S OWN CALL TO ACTION/)
    expect(EDGE).toMatch(/Do NOT paraphrase it/)
    // ⚠️ AND IT REACHES THE PROMPT. `ctaWordingLine` must be interpolated into
    // the brief block, not just assigned — a string built and dropped is
    // exactly how `readMechanism` reached production.
    expect(EDGE).toMatch(/\$\{ctaIntentLine\}\$\{ctaWordingLine\}/)
  })

  it('both suppress the creator wording on a video that may not sell', () => {
    // ⚖️ THE EXCEPTION IS THE HALF THAT IS EASY TO LOSE. Somebody whose default
    // is "Try Twin free" still makes non-commercial videos, and pasting a pitch
    // onto the end of one is the CTA overriding the creative decision.
    const r = resolveCta({ defaultCta: 'Buy my course', goal: 'sell', commercial: false })
    expect(r.text).not.toBe('Buy my course')
    expect(r.source).toBe('generated')
    // The edge states the same carve-out to the model.
    expect(EDGE).toMatch(/unless this video may not carry a commercial ask at all/)
  })

  it('the edge reads the real column, not a field nobody writes', () => {
    // `cta.ts` names `defaultCta` as the only source of truth for WORDING.
    expect(EDGE).toMatch(/brief\.defaultCta/)
  })

  it('neither invents a sentence when there is nothing to base an ask on', () => {
    // No goal, no reference, no stored preference: null, not a cheerful default.
    const r = resolveCta({ defaultCta: null, goal: null, referenceMechanism: null })
    expect(r.text).toBeNull()
    expect(r.source).toBeNull()
  })
})
