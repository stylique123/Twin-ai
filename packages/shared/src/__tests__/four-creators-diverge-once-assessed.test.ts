// THE SUCCESS TEST, RUN BEFORE THE MONEY IS SPENT.
//
// ⚠️ ITS SIBLING PROVES THE NEGATIVE: `four-creators-one-library` shows that an
// UNASSESSED library gives all four creators one identical ordering, because the
// ranker can see exactly one property of a creator. That file measures the gap.
// This one measures whether closing it actually works.
//
// ⚖️ AND IT RUNS ON FIXTURES ON PURPOSE, AHEAD OF THE PILOT. The batch is ~3,946
// media-bearing calls; if four very different creators DO NOT diverge on a
// hand-built assessed library, then no amount of real data would make them
// diverge either, and the spend would buy a beautiful dataset the ranker cannot
// use. Proving the model on fixtures is the cheapest possible version of the
// four-creator test, and it is the one that can be run today.
//
// ⚠️ WHAT THIS CANNOT TELL YOU. That the model extracts these fields accurately
// from real transcripts — only the pilot answers that. This file answers the
// prior question: GIVEN correct assessments, does the policy produce materially
// different galleries? A yes here does not guarantee the pilot succeeds. A no
// here would guarantee it fails.
import { describe, expect, it } from 'vitest'
import {
  compareForCreator, eligibility, type GalleryCreatorView, type RankableReference,
} from '../galleryPolicy'
import { emptyReferenceProfile, type ReferenceProfile } from '../referenceProfile'
import type { GalleryFacts, NicheRelation } from '../galleryRank'
import type { Assessed } from '../assessed'
import type { ContentSlot, LikelyGoal } from '../referenceContentProfile'
import type { CanonicalRelationship } from '../profileAssembler'
import type { ProductionMode } from '../referenceProfile'

const AT = '2026-01-01T00:00:00.000Z'
const seen = <T,>(value: T, evidence: string): Assessed<T> =>
  ({ value, basis: 'observed', evidence, assessedAt: AT })

interface Spec {
  id: string
  niche: NicheRelation
  reach: number
  goals: LikelyGoal[]
  mode: ProductionMode
  posture: CanonicalRelationship
  slots: { kind: ContentSlot['kind']; label: string }[]
}

/** An assessed reference — the shape the pilot will produce. */
const assessed = (s: Spec): ReferenceProfile => {
  const p = emptyReferenceProfile(s.id)
  return {
    ...p,
    content: {
      ...p.content,
      likelyGoals: seen(s.goals, 'the structure implies it'),
      commercial: { posture: seen(s.posture, 'what the speaker claims') },
      requirements: {
        ...p.content.requirements,
        contentSlots: seen(
          s.slots.map((x, i) => ({ id: String(i + 1), kind: x.kind, label: x.label, required: true })),
          'items named in sequence',
        ),
      },
    },
    visual: { ...p.visual, primaryMode: seen(s.mode, 'sampled frames') },
  }
}

const facts = (nicheRelation: NicheRelation, reach: number): GalleryFacts =>
  ({ nicheRelation, reach, likes: null })

// ── ONE LIBRARY, DELIBERATELY MIXED ───────────────────────────────────────

const SPECS: Spec[] = [
  {
    id: 'founder-story', niche: 'unrelated', reach: 40_000,
    goals: ['authority'], mode: 'talking_head', posture: 'OWN_PRODUCT',
    slots: [{ kind: 'claim', label: 'the_lesson' }],
  },
  {
    id: 'three-tools', niche: 'related', reach: 300_000,
    goals: ['growth', 'education'], mode: 'screen_software', posture: 'AFFILIATE',
    slots: [
      { kind: 'tool_or_software', label: 'relatable_pick' },
      { kind: 'tool_or_software', label: 'surprising_pick' },
      { kind: 'tool_or_software', label: 'strongest_pick' },
    ],
  },
  {
    id: 'my-failures', niche: 'same_niche', reach: 800_000,
    goals: ['authority'], mode: 'talking_head', posture: 'NONE',
    slots: [
      { kind: 'personal_experience', label: 'first_failure' },
      { kind: 'personal_experience', label: 'worst_failure' },
    ],
  },
  {
    id: 'pure-teach', niche: 'same_sub_niche', reach: 5_000,
    goals: ['educate'], mode: 'talking_head', posture: 'NONE',
    slots: [{ kind: 'example', label: 'worked_example' }],
  },
  {
    id: 'pov-skit', niche: 'unrelated', reach: 2_000_000,
    goals: ['entertainment', 'growth'], mode: 'pov_skit', posture: 'NONE',
    slots: [{ kind: 'example', label: 'the_bit' }],
  },
]

/** The four canonical creators, described in CODE this time rather than in a
 *  comment — which is the difference the whole batch exists to make. */
const SAAS_FOUNDER: GalleryCreatorView = {
  goals: ['authority'], preferredFormats: ['talking_head'],
  relationship: 'OWN_PRODUCT', productCount: 1,
  canFilmObjects: false, canRecordScreen: true,
}
const AFFILIATE_REVIEWER: GalleryCreatorView = {
  goals: ['followers'], preferredFormats: ['review_comparison', 'screen_software'],
  relationship: 'AFFILIATE', productCount: 4,
  canFilmObjects: true, canRecordScreen: true,
}
const EDUCATOR: GalleryCreatorView = {
  goals: ['educate'], preferredFormats: ['talking_head'],
  relationship: 'NONE', productCount: 0,
  canFilmObjects: false, canRecordScreen: false,
}
const ENTERTAINER: GalleryCreatorView = {
  goals: ['entertain'], preferredFormats: ['pov_skit'],
  relationship: 'NONE', productCount: 0,
  canFilmObjects: true, canRecordScreen: false,
}

const CREATORS: readonly [string, GalleryCreatorView][] = [
  ['SaaS founder', SAAS_FOUNDER],
  ['Affiliate reviewer', AFFILIATE_REVIEWER],
  ['Non-commercial educator', EDUCATOR],
  ['Entertainment creator', ENTERTAINER],
]

/** How many of this creator's own products can fill each reference. Stands in
 *  for what `slotFill` computes against a real library. */
const fillFor = (me: GalleryCreatorView, s: Spec): Pick<RankableReference, 'slotsFillable' | 'slotsRequired'> => {
  const need = s.slots.filter((x) => x.kind === 'product' || x.kind === 'tool_or_software').length
  if (need === 0) return { slotsFillable: null, slotsRequired: null }
  return { slotsFillable: Math.min(me.productCount, need), slotsRequired: need }
}

const galleryFor = (me: GalleryCreatorView): string[] => {
  const cards: RankableReference[] = SPECS.map((s) => ({
    profile: assessed(s),
    facts: facts(s.niche, s.reach),
    ...fillFor(me, s),
  }))
  return cards
    .filter((c) => eligibility(c.profile, me).eligible)
    .sort((a, b) => compareForCreator(a, b, me))
    .map((c) => c.profile.referenceId)
}

describe('four creators, one assessed library, four different galleries', () => {
  it('no two creators receive the same ordering', () => {
    // ⚠️ THE SUCCESS CONDITION, STATED AS THE SPEC STATED IT. If this ever
    // collapses to one ordering again, the gallery has gone back to answering
    // "what looks vaguely relevant" and the assessment is buying nothing.
    const orders = CREATORS.map(([, me]) => galleryFor(me).join(','))
    expect(new Set(orders).size).toBe(CREATORS.length)
  })

  it('and the difference is not cosmetic — the top card differs', () => {
    // ⚖️ FOUR DISTINCT ORDERINGS COULD STILL SHARE A FIRST CARD, which is the
    // only position most creators look at. Divergence has to reach the top.
    const tops = CREATORS.map(([, me]) => galleryFor(me)[0])
    expect(new Set(tops).size).toBeGreaterThan(1)
  })
})

describe('each creator is refused what they could not honestly make', () => {
  it('the affiliate never sees the founder-story reference', () => {
    // ⚠️ "WHY WE BUILT THIS" IN AN AFFILIATE'S VOICE IS THE FOUNDING DEFECT:
    // a script perfectly in their voice about a company they do not have.
    expect(galleryFor(AFFILIATE_REVIEWER)).not.toContain('founder-story')
    expect(eligibility(assessed(SPECS[0]), AFFILIATE_REVIEWER).reason).toBe('needs_ownership')
  })

  it('but the founder does', () => {
    expect(galleryFor(SAAS_FOUNDER)).toContain('founder-story')
  })

  it('nobody is offered the personal-failure reference from a library', () => {
    // ⚖️ 800k REACH AND PERFECTLY ON-NICHE, AND STILL REFUSED FOR EVERYONE.
    // Twin cannot invent somebody's failures, and reach does not change that.
    for (const [name, me] of CREATORS) {
      expect(galleryFor(me), name).not.toContain('my-failures')
    }
  })

  it('and the educator is not offered the affiliate tool round-up', () => {
    // ⚠️ THEY TOLD US THEY SELL NOTHING. Three product slots and no products is
    // a video that cannot be finished, whatever its reach.
    expect(galleryFor(EDUCATOR)).not.toContain('three-tools')
  })
})

describe('what each creator actually gets first', () => {
  it('the affiliate leads with the reference their library completes', () => {
    // ⚠️ THE SENTENCE THE WHOLE PROJECT IS FOR: "3 of 3 ready" beating a
    // 2,000,000-reach skit and an on-niche card. Content-resolvable is group 1.
    expect(galleryFor(AFFILIATE_REVIEWER)[0]).toBe('three-tools')
  })

  it('the entertainer leads with the format they actually make', () => {
    expect(galleryFor(ENTERTAINER)[0]).toBe('pov-skit')
  })

  it('and the educator leads with teaching, not with reach', () => {
    // ⚖️ THE 2M SKIT IS ELIGIBLE FOR THEM AND STILL LOSES. Goal fit is group 3;
    // reach is group 7, and last is where it belongs.
    expect(galleryFor(EDUCATOR)[0]).toBe('pure-teach')
  })
})

describe('the property that must survive all of this', () => {
  it('an unassessed library still ranks exactly as it does today', () => {
    // ⚠️ THE REGRESSION THAT WOULD HURT MOST, because it is every card in
    // production right now. Every group must SKIP on unknown rather than treat
    // it as worst, or shipping the policy silently reorders the whole gallery
    // before one video has been assessed.
    const blank: RankableReference[] = SPECS.map((s) => ({
      profile: emptyReferenceProfile(s.id),
      facts: facts(s.niche, s.reach),
    }))
    const orders = CREATORS.map(([, me]) =>
      [...blank].sort((a, b) => compareForCreator(a, b, me)).map((c) => c.profile.referenceId).join(','))
    expect(new Set(orders).size).toBe(1)
  })

  it('and nobody is refused anything while the library is unassessed', () => {
    for (const [name, me] of CREATORS) {
      for (const s of SPECS) {
        expect(eligibility(emptyReferenceProfile(s.id), me).eligible, `${name}/${s.id}`).toBe(true)
      }
    }
  })
})
