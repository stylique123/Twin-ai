// EVERY LEVEL THAT HAS A SAY, GATHERED — because a restriction only some levels
// know about is one that some videos will break.
//
// ⚠️ THE DEFECT THIS CLOSES. `restrictions` is written on every entity and read
// by NOTHING — the word appears exactly once in `generate-blueprint`, inside a
// comment. A creator who recorded "do not say clinically proven" against a
// product had it stored, shown back to them as saved, and then ignored by every
// generation. That is the worst kind of unread field, because the interface
// promised it was working.
import { describe, expect, it } from 'vitest'
import { restrictionUnion, emptyRestrictions } from '../productEntity'

describe('prohibitions union across three levels', () => {
  it('carries the creator\'s own words through verbatim', () => {
    const u = restrictionUnion({ creatorForbidden: 'Never promise guaranteed results.' })
    expect(u.forbidden).toEqual(['Never promise guaranteed results.'])
  })

  it('KEEPS A CREATOR SENTENCE WHOLE rather than splitting it into items', () => {
    // ⚠️ Chopping on punctuation turns "no guarantees, ever" into two fragments
    // and can invert a clause that depends on its second half.
    const u = restrictionUnion({ creatorForbidden: 'No guarantees, ever, about income.' })
    expect(u.forbidden).toEqual(['No guarantees, ever, about income.'])
  })

  it('adds the entity\'s own restrictions', () => {
    const u = restrictionUnion({
      creatorForbidden: 'Never promise guaranteed results.',
      entity: {
        relationship: 'OWN_PRODUCT',
        restrictions: { ...emptyRestrictions(), forbiddenClaims: ['Do not say "clinically proven".'] },
      },
    })
    expect(u.forbidden).toContain('Never promise guaranteed results.')
    expect(u.forbidden).toContain('Do not say "clinically proven".')
  })

  it('derives "do not imply ownership" from an AFFILIATE relationship', () => {
    // ⚖️ DERIVED, NOT STORED. A stored copy would drift out of agreement with
    // `claimRulesFor`, and the disagreement would be invisible until a script
    // said something it should not have.
    const u = restrictionUnion({ entity: { relationship: 'AFFILIATE', restrictions: null } })
    expect(u.forbidden.join(' ')).toMatch(/do not imply the creator owns/i)
  })

  it('requires disclosure for AFFILIATE and SPONSOR, and not for an owned product', () => {
    for (const rel of ['AFFILIATE', 'SPONSOR'] as const) {
      expect(restrictionUnion({ entity: { relationship: rel, restrictions: null } }).disclosures)
        .toHaveLength(1)
    }
    expect(restrictionUnion({ entity: { relationship: 'OWN_PRODUCT', restrictions: null } }).disclosures)
      .toEqual([])
  })

  it('does NOT derive product rules when there is no product', () => {
    // ⚠️ "Do not imply ownership" with nothing to own would forbid language
    // about a product that is not in the video at all.
    const u = restrictionUnion({ creatorForbidden: 'No income claims.' })
    expect(u.forbidden).toEqual(['No income claims.'])
    expect(u.disclosures).toEqual([])
  })

  it('says the same rule once when two levels both supply it', () => {
    const shared = 'Do not imply the creator owns, makes or sells this — they do not.'
    const u = restrictionUnion({
      entity: {
        relationship: 'AFFILIATE',
        restrictions: { ...emptyRestrictions(), forbiddenClaims: [shared] },
      },
    })
    expect(u.forbidden.filter((f) => f === shared)).toHaveLength(1)
  })

  it('drops blank entries rather than emitting an empty rule', () => {
    const u = restrictionUnion({
      creatorForbidden: '   ',
      entity: {
        relationship: 'OWN_PRODUCT',
        restrictions: { ...emptyRestrictions(), forbiddenClaims: ['', '  ', 'Real rule.'] },
      },
    })
    expect(u.forbidden).toEqual(['Real rule.'])
  })
})

describe('approvals do NOT union the same way — §5a.5', () => {
  it('comes from the entity alone', () => {
    // ⚠️ AN OUTCOME CLAIM NEEDS A PERMISSION THAT EXISTS, not merely the absence
    // of a prohibition — the finance creator whose title claimed a replaced
    // income that nothing had approved. A creator-level setting cannot
    // pre-approve claims about a product it has never heard of.
    const u = restrictionUnion({
      creatorForbidden: 'anything',
      entity: {
        relationship: 'OWN_PRODUCT',
        restrictions: { ...emptyRestrictions(), approvedClaims: ['Saves 4 hours a week'] },
      },
    })
    expect(u.approved).toEqual(['Saves 4 hours a week'])
  })

  it('is EMPTY, never permissive, when nothing is recorded', () => {
    // Absence of approvals approves nothing. Degrading to "unrestricted" is the
    // failure `readRestrictions` already guards against on the way in.
    expect(restrictionUnion({}).approved).toEqual([])
    expect(restrictionUnion({ entity: { relationship: 'OWN_PRODUCT', restrictions: null } }).approved)
      .toEqual([])
  })
})
