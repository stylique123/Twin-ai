import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  entitiesTheWriterMayName, mayClaimExperience, type LibraryEntityRef,
} from '../writerEntities'
import { claimRulesFor } from '../productEntity'

/**
 * ⚠️ MEASURED IN A REAL SESSION, 2026-09-08 (@vickiejcreates).
 *
 * She asked for a video about her own opinion — goal "Reach more people",
 * subject "My opinion", deliberately non-commercial. THREE OF FOUR idea-mode
 * runs named a sponsor she had not mentioned. One opened:
 *
 *     "Stop buying the viral Medicube pads before you hear this"
 *
 * and asserted "aggressive physical pads will make redness worse" — an
 * efficacy claim about a product her own library records she has NEVER USED —
 * invented a price of forty dollars, and carried no disclosure, on a PAID
 * relationship.
 *
 * ⚖️ THE PATH WAS ONE UNFILTERED QUERY, not a model failure. The owned-entity
 * read filters `relationship in (OWN_PRODUCT, OWN_SERVICE)`; the library read
 * beside it filters nothing, and hands the writer every entity's NAME and
 * FACTS. `claimRulesFor` already said this product supports no experience
 * claim. Nothing applied it.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

const OWNED: LibraryEntityRef = { id: 'own-1', relationship: 'OWN_PRODUCT', personalUse: 'CONFIRMED' }
const SPONSOR: LibraryEntityRef = { id: 'spon-1', relationship: 'SPONSOR', personalUse: 'NOT_CONFIRMED' }
const LIBRARY = [OWNED, SPONSOR]

describe('the writer may only name what it was given', () => {
  it('names NOTHING when no product was chosen — the I2 and I4 case', () => {
    // Most videos sell nothing. "Nothing given" must not read as "help
    // yourself to the library", which is what produced two of the three
    // unrequested sponsor mentions.
    expect(entitiesTheWriterMayName({ all: LIBRARY, givenId: null })).toEqual([])
    expect(entitiesTheWriterMayName({ all: LIBRARY, givenId: '' })).toEqual([])
    expect(entitiesTheWriterMayName({ all: LIBRARY, givenId: '   ' })).toEqual([])
  })

  it('names ONLY the given one, never its neighbours', () => {
    expect(entitiesTheWriterMayName({ all: LIBRARY, givenId: 'own-1' })).toEqual(['own-1'])
    expect(entitiesTheWriterMayName({ all: LIBRARY, givenId: 'spon-1' })).toEqual(['spon-1'])
  })

  it('an id that resolves to nothing is not a licence to substitute', () => {
    expect(entitiesTheWriterMayName({ all: LIBRARY, givenId: 'ghost' })).toEqual([])
  })

  it('a sponsored, never-used product supports no experience claim', () => {
    // ⚖️ ONE AXIS, AND IT IS NOT THE COMMERCIAL TIE. This is the rule that
    // would have refused "will make redness worse".
    expect(mayClaimExperience(SPONSOR)).toBe(false)
    expect(mayClaimExperience(OWNED)).toBe(true)
  })

  it('and it agrees with claimRulesFor, which said so all along', () => {
    // The rule existed and was correct. It simply was not applied at the point
    // where the writer received the entity. Pinning the two together so a
    // future edit cannot make them disagree.
    expect(claimRulesFor('SPONSOR', 'NOT_CONFIRMED').creatorExperience)
      .toBe(mayClaimExperience(SPONSOR))
    expect(claimRulesFor('OWN_PRODUCT', 'CONFIRMED').creatorExperience)
      .toBe(mayClaimExperience(OWNED))
  })

  it('NOT_CONFIRMED and DENIED both refuse — silence is not permission', () => {
    // ⚠️ 'DENIED' IS NOT IN THE ENUM EITHER — PERSONAL_USE_STATES is
    // CONFIRMED | NOT_CONFIRMED. Checking what exists, plus the absent cases.
    for (const personalUse of ['NOT_CONFIRMED', undefined, null] as const) {
      expect(mayClaimExperience({ ...SPONSOR, personalUse }), String(personalUse)).toBe(false)
    }
  })
})

describe('the edge applies the gate at both places the writer is fed', () => {
  it('the library read is still unfiltered — the gate is not the query', () => {
    // ⚖️ DELIBERATE. Grounding and commercial-consistency need the WHOLE
    // library to check a script against it; narrowing the query would break
    // the check that catches a script naming something it should not.
    const at = EDGE.indexOf('const { data: libraryRows')
    expect(at).toBeGreaterThan(-1)
    const q = EDGE.slice(at, at + 500)
    expect(q).not.toMatch(/\.in\('relationship'/)
  })

  it('`entitySay` — the writer\'s name-and-facts channel — is gated', () => {
    const at = EDGE.indexOf('const entitySay = new Map')
    expect(at).toBeGreaterThan(-1)
    expect(EDGE.slice(at, at + 900)).toMatch(/if \(!nameableEntityIds\.has\(id\)\) continue/)
  })

  it('`fillableEntities` — the resolver\'s input — is gated too', () => {
    // ⚠️ THE RESOLVER PICKS BY TYPE, DETERMINISTICALLY, AND THAT IS STILL A
    // PICK. "The writer never selects a product" has to be true of the
    // resolver as well, or the rule holds only for the model.
    const at = EDGE.indexOf('const fillableEntities')
    expect(at).toBeGreaterThan(-1)
    expect(EDGE.slice(at, at + 900))
      .toMatch(/\.filter\(\(e\) => e\.id !== '' && nameableEntityIds\.has\(e\.id\)\)/)
  })

  it('the gate is DECLARED before both readers', () => {
    // ⚠️ I SHIPPED THIS BUG AND CAUGHT IT BY READING LINE NUMBERS. The first
    // version declared `nameableEntityIds` after `fillableEntities` used it —
    // a temporal dead zone, ReferenceError on every request. `tsc` exits 0 on
    // use-before-declaration inside an immediately-executed callback, because
    // a callback COULD be called later, so neither the compiler nor the
    // edge-parse guard could see it.
    const decl = EDGE.indexOf('const nameableEntityIds')
    const useFill = EDGE.indexOf('nameableEntityIds.has(e.id)')
    const useSay = EDGE.indexOf('nameableEntityIds.has(id)')
    expect(decl).toBeGreaterThan(-1)
    expect(useFill).toBeGreaterThan(decl)
    expect(useSay).toBeGreaterThan(decl)
  })

  it('what is given is the OWNED/selected entity, not a library scan', () => {
    expect(EDGE).toMatch(/const givenEntityId = \(ownedEntity as \{ id\?: unknown \} \| null\)\?\.id/)
  })
})
