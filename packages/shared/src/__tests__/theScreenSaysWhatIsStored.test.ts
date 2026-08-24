import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mintFromWorkKind, refinedEntityType } from '../productEntity'

/**
 * ⚠️ THE CONFIRM SCREEN NAMED A DIFFERENT TYPE FROM THE ONE IT SAVED.
 *
 * `Onboarding.tsx` minted twice: once to DISPLAY ("We'll treat X as your own
 * …") and once to SAVE. The save passed `ownProductKind`/`ownServiceKind`; the
 * display passed neither. `refinedEntityType` therefore ran on one and not the
 * other, and they disagreed for every creator who answered the finer question.
 *
 * ⚖️ AND THE ESCAPE HATCH IS WHY THIS WAS NOT COSMETIC. "That's not right" sits
 * directly under that sentence and CLEARS the mint. A creator shown the wrong
 * type would reasonably take it — throwing away a mint that was correct. A
 * display bug with a data-loss path attached.
 */
describe('the two mints agree, so the sentence matches the record', () => {
  // ⚠️ THIS IS THE DIVERGENCE ITSELF, reproduced at the unit level rather than
  // asserted about the file. If these two ever return different types for the
  // same answers, the screen can lie again however the caller is written.
  it.each([
    ['course', 'COURSE'],
    ['digital', 'DIGITAL_PRODUCT'],
  ] as const)('a creator selling a %s is shown %s, not SAAS', (kind, expected) => {
    const withKind = mintFromWorkKind('saas', { ownProductKind: kind })
    expect(withKind?.type).toBe(expected)

    // The old display path — no kinds — and the proof it was NOT the same.
    const withoutKind = mintFromWorkKind('saas')
    expect(withoutKind?.type).not.toBe(expected)
  })

  // ⚖️ AND A CREATOR WHO ANSWERED NOTHING IS UNAFFECTED, which is what makes
  // passing the kinds safe rather than a behaviour change for everybody.
  it('an unanswered kind mints exactly what it always did', () => {
    expect(mintFromWorkKind('saas', { ownProductKind: null })?.type)
      .toBe(mintFromWorkKind('saas')?.type)
  })

  it('a service kind refines the same way', () => {
    expect(refinedEntityType('SERVICE', { ownServiceKind: 'community' })).toBe('COMMUNITY')
  })
})

/**
 * ⚠️ THE GUARD MATCHES THE CALL THAT DISPLAYS, NOT THE TOKEN ANYWHERE.
 *
 * Three guards written today passed their first mutation because they asserted a
 * string appeared SOMEWHERE rather than in the position carrying the behaviour —
 * `exit 1` matched the wrong branch, `preRollChecklist` matched the import line,
 * `overlays: PlanOverlay[]` matched a local variable 580 lines from the
 * interface. `ownProductKind` already appears twice in this file at the SAVE
 * site, so a bare token search here would have been green against the bug.
 */
describe('the display mint is the one that carries the kinds', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..')
  const code = readFileSync(join(repo, 'apps', 'web', 'src', 'pages', 'Onboarding.tsx'), 'utf8')

  // Anchor on the assignment that feeds the sentence, and read only it.
  const start = code.indexOf('const mintedType: EntityType =')
  const decl = start === -1 ? '' : code.slice(start, code.indexOf('\n\n', start))

  it('the mintedType assignment exists to be checked at all', () => {
    expect(start, 'mintedType assignment not found — did it get renamed?').toBeGreaterThan(-1)
  })

  it('passes both kinds into the mint that produces the displayed label', () => {
    expect(decl).toMatch(/ownProductKind:/)
    expect(decl).toMatch(/ownServiceKind:/)
  })

  // ⚠️ AND THE LABEL IS STILL DRIVEN BY IT, so the fix cannot be undone by
  // quietly rendering something else.
  it('the sentence the creator reads is still keyed off mintedType', () => {
    expect(code).toMatch(/ENTITY_TYPE_LABEL\[mintedType\]/)
  })
})
