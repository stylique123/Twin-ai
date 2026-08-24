import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { refinedEntityType, mintFromWorkKind, WORK_KIND_MINT } from '../productEntity'
import { OWN_PRODUCT_KINDS, OWN_SERVICE_KINDS } from '../creatorProfileQuestions'
import { productSceneGuidance } from '../productScenes'
import { limitationById } from '../pilot/knownLimitations'
import * as shared from '../index'

// ⚠️ THE SAME FACT WAS COLLECTED TWICE AND ONLY THE COARSE ONE COUNTED.
// `workKind` mints a broad type — saas → SAAS, ecommerce → PHYSICAL_PRODUCT.
// The scan step then asks "What kind of thing do you sell?" with six finer
// options, and that answer reached NOTHING. A creator selling a course said so
// and was minted SAAS.

describe('the finer answer wins', () => {
  it('a course is a course, not software', () => {
    expect(refinedEntityType('SAAS', { ownProductKind: 'course' })).toBe('COURSE')
  })

  it('a digital product is not a SaaS', () => {
    expect(refinedEntityType('SAAS', { ownProductKind: 'digital' })).toBe('DIGITAL_PRODUCT')
  })

  it('a marketplace is not a physical product', () => {
    expect(refinedEntityType('PHYSICAL_PRODUCT', { ownProductKind: 'marketplace' }))
      .toBe('MARKETPLACE')
  })

  // ⚖️ THE ONLY SERVICE KIND THAT IS NOT A SERVICE. Consulting, coaching, an
  // agency, freelance and training are all a person selling their time.
  it('a community is a place, not a service', () => {
    expect(refinedEntityType('SERVICE', { ownServiceKind: 'community' })).toBe('COMMUNITY')
  })

  it.each(['consulting', 'coaching', 'agency', 'freelance', 'training'] as const)(
    '%s stays SERVICE', (k) => {
      expect(refinedEntityType('SERVICE', { ownServiceKind: k })).toBe('SERVICE')
    })
})

describe('"other" does not refine, and it is a judgement not a measurement', () => {
  // ⚖️ "OTHER" SAYS NONE OF THESE FIT; it is not a claim that the product IS of
  // type OTHER. The coarse answer came from a different question they also
  // really answered, and between two real answers the one that names something
  // wins over the one that names nothing.
  it('the coarse answer stands', () => {
    expect(refinedEntityType('SAAS', { ownProductKind: 'other' })).toBe('SAAS')
    expect(refinedEntityType('SERVICE', { ownServiceKind: 'other' })).toBe('SERVICE')
  })

  // ⚠️ THE JUSTIFICATION I FIRST WROTE WAS FALSE, AND THIS CASE PINS THE TRUTH
  // SO IT CANNOT BE RE-INVENTED. I claimed refining to OTHER would cost the
  // creator every show moment. It does not: OTHER takes the SCREEN branch in
  // inferShowability exactly like SAAS, and the guidance is identical.
  it('OTHER is not the punishment I claimed it was', () => {
    expect(productSceneGuidance('OTHER', 'ALWAYS').moments.length)
      .toBe(productSceneGuidance('SAAS', 'ALWAYS').moments.length)
  })
})

describe('what refining does NOT change today, recorded so nobody re-claims it', () => {
  // ⚠️ THE PREMISE THIS UNIT STARTED FROM WAS WRONG. "The type decides the show
  // moments" is false for every screen-shown kind: the direction is byte
  // identical, so refining SAAS→COURSE changes nothing a creator sees. The type
  // is still worth storing correctly -- the Library shows it and future rules
  // branch on it -- but this test exists so the false claim cannot come back.
  const SCREEN_SHOWN = ['SAAS', 'COURSE', 'DIGITAL_PRODUCT', 'MARKETPLACE', 'OTHER'] as const

  it('every screen-shown type gets identical direction', () => {
    const first = JSON.stringify(productSceneGuidance('SAAS', 'ALWAYS').moments)
    for (const t of SCREEN_SHOWN) {
      expect(JSON.stringify(productSceneGuidance(t, 'ALWAYS').moments), t).toBe(first)
    }
  })

  it('the gap is recorded as an open limitation rather than left implicit', () => {
    expect(limitationById('SCENE_GUIDANCE_DOES_NOT_READ_THE_TYPE')?.status).toBe('OPEN')
  })
})

describe('nothing is invented', () => {
  it('no answer at all leaves the coarse type untouched', () => {
    expect(refinedEntityType('SAAS', {})).toBe('SAAS')
    expect(refinedEntityType('SERVICE', { ownProductKind: null, ownServiceKind: null }))
      .toBe('SERVICE')
  })

  it('every kind in both vocabularies is handled without throwing', () => {
    for (const k of OWN_PRODUCT_KINDS) expect(refinedEntityType('SAAS', { ownProductKind: k })).toBeTruthy()
    for (const k of OWN_SERVICE_KINDS) expect(refinedEntityType('SERVICE', { ownServiceKind: k })).toBeTruthy()
  })
})

describe('the mint uses it, and showability follows the REFINED type', () => {
  it('a course founder mints a COURSE', () => {
    const e = mintFromWorkKind('saas', { ownProductKind: 'course', name: 'My course' })
    expect(e?.type).toBe('COURSE')
  })

  // ⚠️ THE BUG THAT WOULD SURVIVE A HALF-WIRE. If showability were still derived
  // from the COARSE type, a refined entity would carry a capability answer for a
  // product it is not — the mistake would just move one line down.
  it('showability is derived from the refined type, not the coarse one', () => {
    const e = mintFromWorkKind('saas', {
      ownProductKind: 'physical',
      flags: { canRecordScreen: true, canFilmObjects: false },
    })
    expect(e?.type).toBe('PHYSICAL_PRODUCT')
    // Can record a screen but cannot hold the object: a physical product must
    // NOT come out showable on the strength of the screen answer.
    expect(e?.showability).not.toBe('ALWAYS')
  })

  it('an uninformative workKind still mints nothing', () => {
    expect(mintFromWorkKind(null, { ownProductKind: 'course' })).toBeNull()
    expect(Object.keys(WORK_KIND_MINT).length).toBeGreaterThan(0)
  })
})

describe('the screen actually passes the answers', () => {
  const repo = join(import.meta.dirname, '..', '..', '..', '..')
  const code = readFileSync(join(repo, 'apps', 'web', 'src', 'pages', 'Onboarding.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  // ⚖️ A DECISION LAYER NOTHING CALLS is the state this repo keeps
  // rediscovering. refinedEntityType does not get to join it.
  it('the mint call carries both kinds', () => {
    const at = code.indexOf('mintFromWorkKind(workKind, {')
    expect(at).toBeGreaterThan(-1)
    const call = code.slice(at, code.indexOf('})', at))
    expect(call).toMatch(/ownProductKind: draft\.ownProductKind/)
    expect(call).toMatch(/ownServiceKind: draft\.ownServiceKind/)
  })

  it('is exported from the package index', () => {
    expect(typeof shared.refinedEntityType).toBe('function')
  })
})
