// WHICH DISAGREEMENTS ACTUALLY COST A CREATOR SOMETHING.
//
// ⚠️ RAW FIELD EQUALITY IS THE WRONG PASS CRITERION FOR A MODEL SWAP. Two models
// can differ in eight fields of wording and agree on every decision Twin makes,
// or agree on nineteen and differ on the one that changes what a creator is
// offered. A percentage that treats those alike cannot tell you which happened.
//
// ⚖️ AND THE DOWNSTREAM ANSWER IS COMPUTED, NOT LISTED. These call the REAL
// `eligibility()`. A hand-written list of "important fields" would be a second
// copy of a decision the product already encodes, and would drift from it in
// silence — the mistake that put a wrong NOT_DETERMINED sentinel in the visual
// prompt and filed every honest refusal as malformed.

import { describe, it, expect } from 'vitest'
import {
  CREATOR_PANEL, downstreamVerdicts, downstreamDisagreements, hardContradictions,
} from '../extractionParityDecisions'
import {
  emptyContentProfile,
  type ReferenceContentProfile, type ContentSlot,
} from '../referenceContentProfile'
import type { Assessed } from '../assessed'
import type { CanonicalRelationship } from '../profileAssembler'

// ⚠️ `basis` IS NOT OPTIONAL. Without it `isKnown()` is false and every gate
// below silently skips — the fixture would report "no disagreement" for a flip
// that costs a creator the whole reference.
const known = <T>(value: T): Assessed<T> =>
  ({ value, basis: 'observed' as const, evidence: 'x', assessedAt: '2026-01-01T00:00:00Z' })

// ⚠️ THIS WENT THROUGH `Record<string, unknown>` AND CAME OUT `as never`, which
//  is two casts to switch off the one check that matters here. `withPosture` took
//  a bare `string`, so `withPosture('OWNER_PRODUCT')` — a typo for
//  `OWN_PRODUCT` — would have compiled, produced a posture no `eligibility()`
//  branch matches, and reported "no disagreement" for a flip the file exists to
//  catch. The parameters now name the real unions.
//
//  ⚖️ `Object.assign` RATHER THAN A SPREAD, for the reason the sibling file
//  records: `{ ...base, ...over }` types every property `| undefined` and lets
//  `profile({ commercial: undefined })` through. `Object.assign` is `(t: T, u: U)
//  => T & U`, so each override is still checked against its real field type.
function profile(over: Partial<ReferenceContentProfile> = {}): ReferenceContentProfile {
  return Object.assign(emptyContentProfile('ref-1', null), over)
}

const withPosture = (v: CanonicalRelationship) => profile({
  commercial: { posture: known(v) },
})
const withSlots = (kinds: ContentSlot['kind'][]) => profile({
  requirements: {
    ...emptyContentProfile('ref-1', null).requirements,
    contentSlots: known(kinds.map((kind, i) => ({ id: String(i + 1), kind, label: 'x', required: true }))),
  },
})

describe('the creator panel', () => {
  it('includes the unasked creator, who is the common case not a third opinion', () => {
    // ⚠️ MOST ROWS HAVE NEVER BEEN ASKED about the relationship, and `null` must
    // refuse nobody. A model change that started refusing them would be a
    // product regression invisible to an owner-only or affiliate-only panel.
    expect(CREATOR_PANEL.map((p) => p.name)).toContain('unstated')
    expect(CREATOR_PANEL.find((p) => p.name === 'unstated')!.view.relationship).toBeNull()
  })
})

describe('downstream disagreement is measured, not guessed', () => {
  it('finds none between a profile and itself', () => {
    const p = profile()
    expect(downstreamDisagreements('ref-1', p, p).anyDiffer).toBe(false)
  })

  it('reports a verdict for every panellist', () => {
    expect(Object.keys(downstreamVerdicts('ref-1', profile()))).toEqual(
      CREATOR_PANEL.map((p) => p.name))
  })

  it('catches an owner-posture flip, and says WHO it costs', () => {
    // ⚖️ THE WHOLE REASON THE PANEL EXISTS. This refuses the affiliate and
    // leaves the owner untouched — a single-creator score would report either
    // "no change" or "total change" depending on which creator it happened to
    // pick.
    const d = downstreamDisagreements('ref-1', withPosture('NONE'), withPosture('OWN_PRODUCT'))
    expect(d.anyDiffer).toBe(true)
    expect(d.differing).toContain('affiliate')
    expect(d.differing).not.toContain('owner')
  })
})

describe('hard contradictions are not disagreements about degree', () => {
  it('flags an owner/non-owner split, because it decides who may recreate the video', () => {
    const c = hardContradictions(withPosture('NONE'), withPosture('OWN_SERVICE'))
    expect(c).toHaveLength(1)
    expect(c[0].field).toBe('commercial.posture')
  })

  it('does NOT flag one arm declining to answer', () => {
    // ⚠️ A refusal is a softer failure and must not inflate this count — that is
    // the difference between "one profile is actively wrong" and "one profile is
    // thin".
    expect(hardContradictions(withPosture('NONE'), profile())).toHaveLength(0)
  })

  it('flags a personal-experience requirement appearing on one side only', () => {
    const c = hardContradictions(withSlots(['product']), withSlots(['personal_experience']))
    expect(c.map((x) => x.field)).toContain('requirements.contentSlots')
  })

  it('treats two owner postures as agreeing even when the words differ', () => {
    // OWN_PRODUCT vs OWN_SERVICE both mean "the speaker owns it", which is the
    // fact the gate actually reads.
    expect(hardContradictions(withPosture('OWN_PRODUCT'), withPosture('OWN_SERVICE'))).toHaveLength(0)
  })
})
