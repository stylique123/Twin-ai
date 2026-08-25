/**
 * A CREATOR WHO SAID "SOMETIMES" WAS RECORDED AS "NEVER".
 *
 * ⚠️ MEASURED ON THE SHIPPED CODE, NOT SUSPECTED. The Product Library's add form
 * has offered "Usually / Sometimes / No" since it shipped, and then sent the
 * answer through a boolean: `canFilmObjects: showability === 'ALWAYS'`. Picking
 * SOMETIMES handed `inferShowability` a `false`, which it reads as a denial —
 * the same reading that makes silence UNKNOWN rather than NEVER — and the entity
 * was stored NEVER. `productSceneDirection` then wrote "Write NO shot that
 * requires showing, holding or demonstrating it" into the prompt.
 *
 * So the middle option was unreachable through the only path that offered it,
 * and the creator's script came out talking-only for a product they told us they
 * can usually show.
 */
import { describe, it, expect } from 'vitest'
import {
  answeredShowability, capabilityAnswerIsUsed, attestedEntity, inferShowability,
  ENTITY_TYPES, type EntityType,
} from '../productEntity'

const base = {
  relationship: 'OWN_PRODUCT' as const,
  personalUse: 'CONFIRMED' as const,
  name: 'The mug',
}

describe('the answer reaches the entity', () => {
  it('SOMETIMES survives — this is the defect', () => {
    const e = attestedEntity({
      ...base, type: 'PHYSICAL_PRODUCT',
      showability: 'SOMETIMES',
      // ⚠️ THE FLAG THE OLD FORM SENT ALONGSIDE IT. `SOMETIMES !== 'ALWAYS'`, so
      // the form derived `false`. If the answer did not outrank it this would be
      // NEVER, which is exactly what shipped.
      flags: { canFilmObjects: false },
    })
    expect(e.showability).toBe('SOMETIMES')
  })

  it('ALWAYS still reaches the entity', () => {
    const e = attestedEntity({
      ...base, type: 'SAAS', showability: 'ALWAYS', flags: { canRecordScreen: true },
    })
    expect(e.showability).toBe('ALWAYS')
  })

  it('NO answer leaves the pre-fill alone', () => {
    const e = attestedEntity({ ...base, type: 'SAAS', flags: { canRecordScreen: true } })
    expect(e.showability).toBe('ALWAYS')
  })

  it('an unanswered product is UNKNOWN, never NEVER', () => {
    const e = attestedEntity({ ...base, type: 'SAAS' })
    expect(e.showability).toBe('UNKNOWN')
  })
})

describe('answeredShowability', () => {
  it('UNKNOWN is the absence of an answer, so it does not overwrite the pre-fill', () => {
    expect(answeredShowability('SAAS', 'UNKNOWN', { canRecordScreen: true })).toBe('ALWAYS')
  })

  it('a non-string is not an answer', () => {
    // ⚠️ `String(7)` IS `'7'` AND MATCHES NOTHING, so a coercion here would look
    // green while accepting junk. The guard is `isShowability`, and this pins it.
    expect(answeredShowability('SAAS', 7, { canRecordScreen: true })).toBe('ALWAYS')
    expect(answeredShowability('SAAS', null, { canRecordScreen: false })).toBe('NEVER')
    expect(answeredShowability('SAAS', 'sometimes', {})).toBe('UNKNOWN')
  })

  it('a service is talking-only whatever anybody answers', () => {
    expect(answeredShowability('SERVICE', 'ALWAYS', { canRecordScreen: true })).toBe('NEVER')
  })

  it('a community is showable whatever anybody answers', () => {
    expect(answeredShowability('COMMUNITY', 'NEVER', { canRecordScreen: false })).toBe('ALWAYS')
  })

  it('never returns a value the vocabulary does not carry, for any type', () => {
    for (const t of ENTITY_TYPES) {
      for (const a of ['ALWAYS', 'SOMETIMES', 'NEVER', 'UNKNOWN']) {
        const got = answeredShowability(t, a, {})
        expect(['ALWAYS', 'SOMETIMES', 'NEVER', 'UNKNOWN']).toContain(got)
      }
    }
  })
})

describe('capabilityAnswerIsUsed', () => {
  it('agrees with inferShowability rather than re-deriving a list', () => {
    for (const t of ENTITY_TYPES) {
      const moves = inferShowability(t, { canRecordScreen: true, canFilmObjects: true })
        !== inferShowability(t, { canRecordScreen: false, canFilmObjects: false })
      expect(capabilityAnswerIsUsed(t)).toBe(moves)
    }
  })

  it('the two types whose answer is discarded', () => {
    expect(capabilityAnswerIsUsed('SERVICE')).toBe(false)
    expect(capabilityAnswerIsUsed('COMMUNITY')).toBe(false)
  })

  it('a physical product is decided by the creator', () => {
    // ⚠️ BOTH FLAGS GO IN TOGETHER. Passing only `canRecordScreen` would report
    // PHYSICAL_PRODUCT as undecidable, because that is not the flag it reads.
    expect(capabilityAnswerIsUsed('PHYSICAL_PRODUCT')).toBe(true)
  })

  it('and so is a screen product', () => {
    for (const t of ['SAAS', 'APP', 'DIGITAL_PRODUCT', 'COURSE', 'MARKETPLACE', 'OTHER'] as EntityType[]) {
      expect(capabilityAnswerIsUsed(t)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// AND THE FORM ACTUALLY SENDS IT
//
// ⚖️ `answeredShowability` being correct proves nothing about whether the screen
// that offers the three options CONSULTS it — which is exactly the gap this
// defect lived in for its whole life. The rule had a middle option and the form
// had a middle option; the wire between them carried a boolean.
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const LIBRARY = readFileSync(join(REPO, 'apps/web/src/pages/ProductLibrary.tsx'), 'utf8')

describe('the Product Library sends the answer', () => {
  it('the claim payload carries showability, not only the flags', () => {
    // ⚖️ ASSERTS THE KEY IS IN THE PAYLOAD, NOT ITS LINE. Pinning the whole
    // literal is the over-specific trap this repo has already been bitten by:
    // one more field on the object and a correct file fails.
    // ⚠️ ANCHORED ON THE CALL, NOT ON A BRACE. The first cut looked for the
    // next `})}` from anywhere in the file and found one hundreds of lines
    // EARLIER than the payload, so it read a slice that could never contain the
    // field and failed on correct code. The test was wrong, not the wiring.
    // ⚠️ ANCHORED ON A LINE ONLY THE PAYLOAD HAS. `onClaim({` matched an
    // EARLIER call site, and `})}` matched a brace hundreds of lines before the
    // object — both read a slice that could never contain the field and failed
    // on correct code. `asksPersonalUse(ctx)` appears once, inside this payload.
    const at = LIBRARY.indexOf('personalUse: asksPersonalUse(ctx)')
    expect(at).toBeGreaterThan(-1)
    const claim = LIBRARY.slice(at, at + 2000)
    expect(claim).toMatch(/\bshowability,/)
  })

  it('the panel asks the question in the words the type deserves', () => {
    expect(LIBRARY).toMatch(/CAPABILITY_PROMPT\[/)
    expect(LIBRARY).toMatch(/capabilityAnswerIsUsed\(/)
  })

  it('a type whose answer is discarded is told the fact instead of asked', () => {
    expect(LIBRARY).toMatch(/FIXED_SHOW_NOTE/)
  })
})
