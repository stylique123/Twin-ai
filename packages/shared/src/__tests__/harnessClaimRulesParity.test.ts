// THE HARNESS MUST MEASURE THE PRODUCT WE SHIP, NOT THE ONE WE SHIPPED.
//
// ⚠️ THE DEFECT THIS PREVENTS, MEASURED. A 112-run matrix reported "0
// inappropriate sales CTAs". It was not a result: `run-eval.mjs` decided the
// CTA from the video goal alone — the approximation `generate-blueprint`
// replaced when permission moved to the RELATIONSHIP — and carried none of the
// four claim rules production sends. The number described deleted code.
//
// The strings are LIFTED at runtime by the harness, so they cannot drift. What
// CAN drift is the branch structure, which is replicated rather than imported
// (the edge derives `rel` from a DB row the harness has no equivalent of). So
// this test pins the conditions character for character.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const HARNESS = readFileSync(join(REPO, 'scripts/qa/run-eval.mjs'), 'utf8')

/** Collapse whitespace only — a reflowed ternary is the same rule; a changed
 *  operand is not. Nothing else is normalised, deliberately. */
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Lift a `const NAME = <expr>` up to the line before the next blank line or
 *  the next `const`. Throws rather than returning a default. */
function decl(src: string, where: string, name: string): string {
  const m = src.match(new RegExp(`^\\s*const ${name} =([\\s\\S]*?)\\n\\s*(?:const|//|\\n)`, 'm'))
  if (!m) throw new Error(`could not lift ${name} from ${where}`)
  return norm(m[1])
}

describe('QA harness ↔ generate-blueprint claim-rule parity', () => {
  for (const name of ['commercialCta', 'disclosureRequired', 'marketingClaims', 'sellIntent']) {
    it(`derives ${name} exactly as the edge function does`, () => {
      expect(decl(HARNESS, 'the harness', name)).toBe(decl(EDGE, 'the edge function', name))
    })
  }

  it('gates personal-use claims on the same condition', () => {
    for (const src of [EDGE, HARNESS]) {
      expect(src).toMatch(/if \(!creatorExperience && rel !== 'NONE'\)/)
      expect(src).toMatch(/creatorExperience = personalUse === 'CONFIRMED'/)
    }
  })

  it('selects the same claim lines for the same marketingClaims value', () => {
    for (const src of [EDGE, HARNESS]) {
      expect(src).toMatch(/marketingClaims === 'attributed'/)
      expect(src).toMatch(/marketingClaims === 'forbidden' && rel === 'REVIEW_ONLY'/)
    }
  })

  it('LIFTS every rule string rather than retyping it', () => {
    // The failure mode this closes: a hand-copied rule that drifts from the
    // shipped one is indistinguishable from a finding about the product.
    for (const c of ['CTA_SELL', 'CTA_NO_TIE', 'CTA_NOT_SELLING',
      'CLAIM_ATTRIBUTED', 'CLAIM_REVIEW', 'CLAIM_NO_USE', 'CLAIM_DISCLOSURE']) {
      expect(HARNESS).toMatch(new RegExp(`const ${c} = liftQuoted\\(`))
    }
    // And the old goal-only rule is gone, not merely unused.
    expect(HARNESS).not.toMatch(/\/\(sell\|leads\)\/\.test/)
    expect(HARNESS).not.toMatch(/goal is commercial, so a purchase or signup CTA/)
  })

  it('refuses a fixture whose relationship is not the production enum', () => {
    // Defaulting an unknown code to NONE would silence every claim rule and
    // report the silence as compliance.
    expect(HARNESS).toMatch(/RELATIONSHIPS\.includes\(rel\)/)
    expect(HARNESS).toMatch(/process\.exit\(1\)/)
  })

  it('every pack creator carries a machine-readable relationship and personal-use', () => {
    // The prose `relationship` ("REVIEW_ONLY — nothing in the scan shows…") is
    // research, not a permission. A creator without the enum cannot be run.
    const pack = JSON.parse(readFileSync(join(REPO, 'scripts/qa/creator-pack.json'), 'utf8'))
    const groups: { creators: { key: string; truth?: Record<string, unknown> }[] }[] = [
      { creators: pack.creators }, pack.cohort2, pack.cohort3,
    ].filter(Boolean)
    const ENUM = ['NONE', 'REVIEW_ONLY', 'AFFILIATE', 'SPONSOR', 'OWN_PRODUCT', 'OWN_SERVICE']
    let seen = 0
    for (const g of groups) for (const c of g.creators) {
      expect(ENUM, `${c.key} relationshipCode`).toContain(c.truth?.relationshipCode)
      expect(['CONFIRMED', 'NOT_CONFIRMED'], `${c.key} personalUse`)
        .toContain(c.truth?.personalUse)
      seen++
    }
    expect(seen).toBeGreaterThan(20)
  })
})
