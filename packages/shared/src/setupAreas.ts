// SETTINGS SHOULD ANSWER "WHAT NOW?", NOT "HERE IS EVERYTHING".
//
// ⚠️ THE PAGE REPORTED STATE AND BARELY HELPED ANYBODY CHANGE IT. Plan, Brand
// Kit, the entire Creator DNA record, the CTA field and product context sat in
// one column, so finding the next useful action meant reading all of it and
// deciding for yourself. Several panels looked clickable and did nothing, which
// is worse than a plain list — it teaches people that tapping things here is
// pointless.
//
// ⚖️ SO THE PAGE GETS A MODEL INSTEAD OF A LAYOUT. Areas, each with a state and
// exactly one action, and one derived NEXT STEP. The UI renders this; it does not
// compute it, because a status computed in a component is one no test can reach
// and one the next screen will compute differently.
//
// ── WHAT THIS DELIBERATELY KEEPS FROM `profileCompletion.ts` ───────────────
//
// ⚠️ BRAND KIT STAYS OUT OF THE CONTENT COUNT. That module exists because a
// meter mixing script intelligence with visual setup lies: a creator with every
// creative answer and no logo read "70% complete" while the missing 30% could not
// change one line of a script — and being pushed toward 100% is what makes
// somebody type a colour they never chose. The count here is `X of Y ready` over
// CONTENT areas only, and Brand Kit reports beside it, never inside it.
//
// ⚖️ AND "NOT NEEDED" IS A REAL STATE, NOT A QUIET ZERO. A creator who said they
// sell nothing is not missing a product; the area reports `not_needed` and leaves
// the denominator, exactly as `applies()` already does for the percentage.

import type { CreatorProfileAnswers, CommercialTie } from './creatorProfileQuestions'
import { contentProfile, brandKitStatus, type BrandKitLike, type ProfileInput } from './profileCompletion'
import { hasConfirmedCta } from './cta'

/**
 * ⚠️ FIVE STATES, AND NONE OF THEM IS A BOOLEAN IN DISGUISE. `optional` and
 * `not_needed` are different facts — one is something this creator could do and
 * has not, the other is something that does not apply to them at all — and
 * collapsing either into "missing" is how a page starts nagging people for work
 * that would not help them.
 *
 * ⚖️ `needs_review` EXISTS FOR WHAT WE READ RATHER THAN WERE TOLD. A DNA record
 * built from a scan is present but unconfirmed, and telling somebody it is
 * "ready" claims an approval they never gave.
 */
export const SETUP_STATES = [
  'ready', 'needs_setup', 'needs_review', 'optional', 'not_needed',
] as const
export type SetupState = (typeof SETUP_STATES)[number]

export const SETUP_AREA_IDS = [
  'content_profile', 'creator_dna', 'products', 'default_cta', 'brand_kit',
] as const
export type SetupAreaId = (typeof SETUP_AREA_IDS)[number]

/** Where tapping the area's action must land. The UI maps these to routes and
 *  modals; it never invents a destination of its own, because an action with no
 *  destination is the defect this file was written about. */
export const SETUP_ACTIONS = [
  'edit_profile', 'view_dna', 'add_product', 'manage_products', 'edit_cta', 'setup_brand_kit',
] as const
export type SetupAction = (typeof SETUP_ACTIONS)[number]

export interface SetupArea {
  id: SetupAreaId
  /** Plain English, on the card. Never an internal term. */
  title: string
  state: SetupState
  /** One line the creator reads to decide whether to act. Says what it changes,
   *  not what it is. */
  detail: string
  /** The button's words, and where it goes. Always present — every state has
   *  something worth doing, including "look at what we have". */
  actionLabel: string
  action: SetupAction
  /** ⚖️ CONTENT AREAS COUNT TOWARD READINESS; VISUAL ONES DO NOT. The whole
   *  separation, expressed as a field rather than as a convention somebody has to
   *  remember. */
  counts: boolean
}

export interface SetupInput extends ProfileInput {
  /** How many live products the creator has claimed. */
  productCount?: number | null
  /** Whether the DNA record was built AND the creator has seen it. */
  dnaConfirmed?: boolean | null
  brandKit?: BrandKitLike | null
}

const commercial = (answers?: CreatorProfileAnswers | null): boolean => {
  const ties: readonly CommercialTie[] = answers?.commercialTies ?? []
  // ⚠️ SILENCE IS NOT "no". An unreached question leaves products applicable —
  // the same three-state rule the rest of this codebase runs on.
  if (ties.length === 0) return true
  return !(ties.length === 1 && ties[0] === 'none')
}

/**
 * Read the canonical state of every setup area.
 *
 * ⚠️ PURE, AND DERIVED FROM REAL DATA RATHER THAN FROM WHICH FIELDS A FORM HAS.
 * The old page's sense of "done" came from whether inputs looked filled, which is
 * why it could be confidently wrong.
 */
export function setupAreas(input: SetupInput): SetupArea[] {
  const profile = contentProfile(input)
  const hasProducts = (input.productCount ?? 0) > 0
  const productsApply = commercial(input.answers)
  const kit = brandKitStatus(input.brandKit)

  return [
    {
      id: 'content_profile',
      title: 'Content profile',
      state: profile.gaps.some((g) => g.id !== 'cta' && g.id !== 'dnaReady' && g.id !== 'productContext')
        ? 'needs_setup' : 'ready',
      detail: 'What you make, who it is for, and what you want your videos to do.',
      actionLabel: 'Edit profile',
      action: 'edit_profile',
      counts: true,
    },
    {
      id: 'creator_dna',
      title: 'Your voice',
      // ⚖️ THREE OUTCOMES, NOT TWO. Never scanned, scanned but unseen, and
      // confirmed are different things to a creator deciding whether to trust it.
      state: input.dnaReady !== true
        ? 'needs_setup'
        : input.dnaConfirmed === true ? 'ready' : 'needs_review',
      detail: 'How you actually speak, structure an idea and hold attention.',
      actionLabel: input.dnaReady === true ? 'View what Twin learned' : 'Scan my account',
      action: 'view_dna',
      counts: true,
    },
    {
      id: 'products',
      title: 'What you sell',
      state: !productsApply ? 'not_needed' : hasProducts ? 'ready' : 'needs_setup',
      detail: !productsApply
        // ⚠️ SAYS WHY IT IS ABSENT. A blank card reads as broken; this reads as
        // answered, and it is — they told us.
        ? 'You told us you are not selling anything, so Twin will not mention one.'
        : hasProducts
          ? 'Twin can talk about these, and only these.'
          : 'Twin does not know what it is allowed to point people at yet.',
      actionLabel: hasProducts ? 'Manage products' : 'Add a product',
      action: hasProducts ? 'manage_products' : 'add_product',
      counts: productsApply,
    },
    {
      id: 'default_cta',
      title: 'What viewers should do',
      // ⚖️ ASKED OF `cta.ts`, so a sentence Twin generated can never mark this
      // ready. The palette meter learned that lesson the expensive way.
      state: hasConfirmedCta(input.cta) ? 'ready' : 'needs_setup',
      detail: 'Your usual ending. Twin can change it for any single video.',
      actionLabel: hasConfirmedCta(input.cta) ? 'Edit' : 'Add one',
      action: 'edit_cta',
      counts: true,
    },
    {
      id: 'brand_kit',
      title: 'Logo and colours',
      // ⚠️ `optional` RATHER THAN `needs_setup`, AND THAT IS THE POINT. Nothing
      // here changes a word of a script, so a card that nagged for it would be
      // asking for work that cannot help — which is how a creator ends up typing
      // a colour they never chose to clear a bar.
      state: kit === 'ready' ? 'ready' : 'optional',
      detail: 'Used for supported visual styling. It does not change what your scripts say.',
      actionLabel: kit === 'ready' ? 'Edit' : 'Set up',
      action: 'setup_brand_kit',
      counts: false,
    },
  ]
}

export interface SetupSummary {
  ready: number
  total: number
  /** The one thing worth doing next, or null when the core is done. */
  next: SetupArea | null
  /** The headline. Plain English, and it changes when the work is finished
   *  rather than continuing to demand a number. */
  headline: string
}

/** ⚠️ ORDERED BY WHAT UNBLOCKS THE MOST, so "next" is a real recommendation
 *  rather than whichever card happens to sit first. Voice before profile because
 *  a scan answers several profile questions on its own; products before the CTA
 *  because the CTA's wording depends on what there is to point at. */
const NEXT_ORDER: readonly SetupAreaId[] = [
  'creator_dna', 'content_profile', 'products', 'default_cta', 'brand_kit',
]

/**
 * ⚖️ THE COUNT IS OVER CONTENT AREAS ONLY, and `not_needed` leaves the
 * denominator rather than counting as done — a creator with nothing to sell is
 * not four-fifths of a creator.
 */
export function setupSummary(areas: readonly SetupArea[]): SetupSummary {
  const counted = areas.filter((a) => a.counts && a.state !== 'not_needed')
  const ready = counted.filter((a) => a.state === 'ready').length
  const total = counted.length

  const next = NEXT_ORDER
    .map((id) => areas.find((a) => a.id === id))
    .find((a): a is SetupArea =>
      // ⚖️ `needs_review` IS NOT A BLOCKER AND IS STILL WORTH OFFERING. It comes
      // after everything genuinely missing, because looking at something we
      // already have is less urgent than telling us something we lack.
      !!a && (a.state === 'needs_setup')) ?? null

  const review = areas.find((a) => a.state === 'needs_review') ?? null
  const chosen = next ?? review

  return {
    ready,
    total,
    next: chosen,
    headline: ready === total
      // ⚠️ THE PAGE GETS OUT OF THE WAY WHEN THE WORK IS DONE. A permanent
      // "100%!" is a demand that has stopped meaning anything.
      ? 'Twin has what it needs to write as you.'
      : `${ready} of ${total} ready`,
  }
}
