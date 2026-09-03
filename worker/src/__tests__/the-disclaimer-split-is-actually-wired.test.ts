import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * ⚠️ THE PURE FUNCTION BEING RIGHT PROVES NOTHING ABOUT THE PRODUCT.
 * `a-disclaimer-is-not-a-cta.test.ts` covers `splitDisclaimersFromCtas` and
 * passes 27/27 — and it kept passing when the call site was reverted to
 * `asArr(raw.recurring_ctas)`, which is the entire behaviour change. A tested
 * helper nobody calls is the defect this repo keeps shipping.
 *
 * ⚖️ CODE LINES ONLY. A guard that greps source text must tell a MENTION from a
 * CALL — it has bitten twice in this repo, once matching the comment that
 * protected the very line it was checking. Whole-line comments are dropped
 * before matching; nothing is stripped after `//` on a code line, because a real
 * call sitting after a string containing `//` would vanish with it.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const codeOf = (rel: string) =>
  readFileSync(join(ROOT, rel), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')

const VOICE = codeOf(join('worker', 'src', 'voice.ts'))
const ONBOARDING = codeOf(join('apps', 'web', 'src', 'pages', 'Onboarding.tsx'))

describe('the worker splits disclaimers out of recurring CTAs', () => {
  it('calls the splitter on the model raw CTA list', () => {
    expect(VOICE).toMatch(/const split = splitDisclaimersFromCtas\(raw\.recurring_ctas\)/)
  })

  it('publishes the CLEANED list as recurring_ctas, not the raw one', () => {
    expect(VOICE).toMatch(/recurring_ctas:\s*split\.ctas/)
    // The old behaviour, which the mutation proved was otherwise unguarded.
    expect(VOICE).not.toMatch(/recurring_ctas:\s*asArr\(raw\.recurring_ctas\)/)
  })

  it('carries the disclaimers onto the profile for its reader', () => {
    expect(VOICE).toMatch(/claim_disclaimers:\s*split\.disclaimers/)
  })

  it('imports the splitter with the worker ESM specifier', () => {
    expect(VOICE).toMatch(/from '\.\/claimDisclaimers\.js'/)
  })
})

describe('onboarding reads what the worker wrote', () => {
  // ⚠️ WRITTEN AND NEVER READ IS THE DEFECT. `claim_disclaimers` exists only to
  // prefill the claims field; if this read disappears the worker is decorating
  // a profile nobody opens.
  it('reads claim_disclaimers off the voice profile', () => {
    expect(ONBOARDING).toMatch(/claim_disclaimers/)
  })

  it('seeds the claims field from the guess', () => {
    expect(ONBOARDING).toMatch(/useState\(draft\.forbiddenClaims \?\? claimsGuess\)/)
  })

  // ⚖️ A SAVED ANSWER IS A DECISION. Prefilling over it would replace what the
  // creator told us with what we inferred, silently.
  it('never prefills over an answer the creator already gave', () => {
    expect(ONBOARDING).toMatch(/\(draft\.forbiddenClaims \?\? ''\) === '' && claimsGuess !== ''/)
  })

  it('marks the guess as a guess, and stops marking it once they type', () => {
    expect(ONBOARDING).toMatch(/We found this in your posts/)
    expect(ONBOARDING).toMatch(/setClaimsAreGuessed\(false\)/)
  })
})
