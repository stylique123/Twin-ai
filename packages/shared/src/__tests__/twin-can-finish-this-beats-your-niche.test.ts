// A VIDEO TWIN CANNOT RECREATE MUST NOT BEAT ONE IT CAN FINISH TODAY.
//
// ⚠️ THAT SENTENCE IS NOT EXPRESSIBLE AS A WEIGHTED SUM. Averaging lets a strong
// niche score compensate for "this creator physically cannot shoot it", which is
// not a trade anybody would make on purpose — so the policy is hard filters
// first, then lexicographic groups, and an earlier group decides before a later
// one is consulted at all.
//
// ⚖️ AND THE SAFETY PROPERTY MATTERS MORE THAN THE CLEVERNESS: all 9,504 cards
// are unassessed today, so an unassessed library must rank EXACTLY as it does
// now. The batch does not change the rules; it fills inputs the rules already
// read.
import { describe, expect, it } from 'vitest'
import {
  compareForCreator, eligibility, PRIORITY_GROUPS,
  type GalleryCreatorView, type RankableReference,
} from '../galleryPolicy'
import { emptyReferenceProfile, type ReferenceProfile } from '../referenceProfile'
import { compareByFit, type GalleryFacts, type NicheRelation } from '../galleryRank'

const NOW = '2026-08-18T00:00:00.000Z'
const me: GalleryCreatorView = {
  goals: ['authority'] as never, preferredFormats: ['talking_head'],
  relationship: 'OWN_PRODUCT', productCount: 3, canFilmObjects: null, canRecordScreen: null,
}

const facts = (nicheRelation: NicheRelation, reach: number | null): GalleryFacts =>
  ({ nicheRelation, reach, likes: null })

const card = (id: string, rel: NicheRelation, reach: number | null,
              over: Partial<RankableReference> = {}): RankableReference =>
  ({ profile: emptyReferenceProfile(id), facts: facts(rel, reach), ...over })

/** A profile whose content slots are KNOWN — the only state the hard filters
 *  act on, since an unassessed card must never be refused. */
const slotted = (id: string, kind: string, label: string, evidence: string): ReferenceProfile => {
  const p = emptyReferenceProfile(id)
  return {
    ...p,
    content: {
      ...p.content,
      requirements: {
        ...p.content.requirements,
        contentSlots: observed([{ id: '1', kind: kind as never, label, required: true }], evidence),
      },
    },
  }
}

const observed = <T,>(value: T, evidence: string) =>
  ({ value, basis: 'observed' as const, evidence, assessedAt: NOW })

describe('an unassessed library ranks exactly as it does today', () => {
  it('because unknown SKIPS a term rather than failing it', () => {
    // ⚠️ THE DAY-ONE SAFETY PROPERTY. A policy treating not_checked as a failing
    // grade would empty the gallery; one treating it as a pass would claim
    // knowledge it does not have. Neither: it decides nothing.
    const lib = [card('a', 'unrelated', 900_000), card('b', 'same_niche', 1_000),
                 card('c', 'same_sub_niche', 500)]
    const policy = [...lib].sort((x, y) => compareForCreator(x, y, me)).map((x) => x.profile.referenceId)
    const today = [...lib].sort((x, y) => compareByFit(x.facts, y.facts)).map((x) => x.profile.referenceId)
    expect(policy).toEqual(today)
  })

  it('and nothing unassessed is ever ineligible', () => {
    // ⚖️ REFUSING 9,504 CARDS BEHIND AN ABSENCE would be the worst possible first
    // day for this policy.
    expect(eligibility(emptyReferenceProfile('x'), me).eligible).toBe(true)
  })
})

describe('the ordering the module was written for', () => {
  it('a fillable cross-niche card beats an unfillable on-niche one', () => {
    // ⚠️ THE SENTENCE, AS A TEST. On-niche and nothing else vs cross-niche that
    // Twin can finish today — and the second wins, which is the whole point.
    const crossFillable = card('cross', 'unrelated', 900_000, { slotsFillable: 3, slotsRequired: 3 })
    const onNicheEmpty = card('on', 'same_niche', 1_000, { slotsFillable: 0, slotsRequired: 3 })
    expect(compareForCreator(crossFillable, onNicheEmpty, me)).toBeLessThan(0)
  })

  it('feasibility outranks goal, format, structure and niche', () => {
    const easyOffNiche = card('easy', 'unrelated', 10, { feasibility: 'easy' })
    const hardOnNiche = card('hard', 'same_sub_niche', 10, { feasibility: 'difficult' })
    expect(compareForCreator(easyOffNiche, hardOnNiche, me)).toBeLessThan(0)
  })

  it('and reach never leaves last place', () => {
    // ⚖️ THIRTY MILLION VIEWS IS NOT A FIT. Two cards identical on every earlier
    // term fall through to reach — and only then.
    const big = card('big', 'same_niche', 10_000_000)
    const small = card('small', 'same_niche', 10)
    expect(compareForCreator(big, small, me)).toBeLessThan(0)
    const bigOffNiche = card('bigOff', 'unrelated', 10_000_000)
    const smallOnNiche = card('smallOn', 'same_niche', 10)
    expect(compareForCreator(bigOffNiche, smallOnNiche, me)).toBeGreaterThan(0)
  })

  it('the group order is declared, so the policy is readable', () => {
    expect(PRIORITY_GROUPS[0]).toBe('content_resolvable')
    expect(PRIORITY_GROUPS[1]).toBe('production_feasible')
    expect(PRIORITY_GROUPS[PRIORITY_GROUPS.length - 1]).toBe('reach')
  })
})

describe('hard filters need a known fact on BOTH sides', () => {
  const withMode = (m: string): ReferenceProfile => {
    const p = emptyReferenceProfile('m')
    return { ...p, visual: { ...p.visual, primaryMode: observed(m as never, 'multi-camera, three speakers') } }
  }

  it('refuses a production Twin cannot help recreate', () => {
    const r = eligibility(withMode('other_unsupported'), me)
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('unsupported_production')
    // ⚠️ AND SAYS SO IN WORDS A CREATOR COULD READ, not an enum.
    expect(r.explain).not.toMatch(/_|unsupported_production/)
  })

  it('permits a supported one', () => {
    expect(eligibility(withMode('talking_head'), me).eligible).toBe(true)
  })

  it('refuses a format built from personal stories Twin cannot invent', () => {
    // ⚖️ "MY THREE BIGGEST FAILURES" — ranking it ready would promise a video
    // Twin cannot honestly write.
    const withSlots = slotted('s', 'personal_experience', 'a failure', 'three first-person anecdotes')
    const r = eligibility(withSlots, me)
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('needs_personal_experience')
  })

  it('refuses a product format for somebody who says they sell nothing', () => {
    const withSlots = slotted('p', 'product', 'tool one', 'three products named')
    const seller: GalleryCreatorView = { ...me, relationship: 'NONE', productCount: 0 }
    expect(eligibility(withSlots, seller).reason).toBe('commercially_unavailable')
  })

  it('but not for somebody who simply has not answered yet', () => {
    // ⚠️ SILENCE IS NOT "I SELL NOTHING". The rule this codebase runs on, at the
    // one place where getting it wrong hides most of the gallery.
    const withSlots = slotted('p', 'product', 'tool one', 'three products named')
    const unasked: GalleryCreatorView = { ...me, relationship: null, productCount: 0 }
    expect(eligibility(withSlots, unasked).eligible).toBe(true)
  })
})
