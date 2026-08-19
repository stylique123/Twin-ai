// THE QUESTION WAS ASKED. NOTHING READ THE ANSWER.
//
// ⚠️ `desiredFormats` HAS BEEN COLLECTED AND STORED FOR AS LONG AS ONBOARDING
// HAS EXISTED, and `galleryCreatorView` still returns `preferredFormats: []`
// with a comment saying the only format data Twin holds is observed. That
// comment was true when it was written and is not true now — which is worse than
// a missing feature, because it reads as a decision somebody made rather than a
// wire nobody connected. The format group has been dark this whole time.
//
// ⚖️ THE TWO VOCABULARIES ARE DIFFERENT ON PURPOSE AND MUST STAY THAT WAY.
// `DesiredFormat` is what a creator recognises — "Explaining things", "Behind
// the business". `ProductionMode` is what shooting it takes. Merging them into
// one list would force one of the two to speak the other's language: either a
// creator picks `screen_software` from a menu, or the ranker reasons about
// "Stories & experiences". This file is the only place the two meet.
//
// ── WHAT DELIBERATELY MAPS TO NOTHING ─────────────────────────────────────
//
// ⚠️ FOUR ANSWERS ARE ABOUT CONTENT AND SAY NOTHING ABOUT PRODUCTION. Explaining
// things, opinions, stories and trends are all shot every possible way — mapping
// them onto `talking_head` because that is the common case is EXACTLY the guess
// `formatProfile` exists to refuse, and it would quietly re-derive a preference
// from the statistical average of other people's videos.
//
// ⚖️ AND "LET TWIN SUGGEST" IS THE STRONGEST NON-ANSWER IN THE SET. A creator
// who taps it has explicitly declined to constrain the format. It contributes no
// modes, so a creator who picks only that one produces an EMPTY preference list
// — which `compareForCreator` skips, leaving the gallery exactly as wide as they
// asked for. Turning it into "all eight modes" would be the same mistake in the
// opposite direction.

import type { DesiredFormat } from './creatorProfileQuestions'
import type { ProductionMode } from './referenceProfile'

/**
 * What each creator-facing answer implies about how a video is SHOT.
 *
 * ⚠️ AN EMPTY ARRAY IS A DECISION, NOT AN OMISSION. Each one is justified in the
 * header; a future editor adding a mode to `educational` should have to argue
 * with that paragraph first.
 */
export const MODES_OF_DESIRED: Record<DesiredFormat, readonly ProductionMode[]> = {
  talking_head: ['talking_head'],
  walking: ['walk_and_talk'],
  pov: ['pov_skit'],
  review: ['review_comparison'],
  // ⚖️ TWO MODES, BECAUSE "SHOWING A PRODUCT" IS AMBIGUOUS BY CONSTRUCTION. A
  // physical object in frame and a screen recording of software are the same
  // sentence to a creator and completely different shoots.
  product: ['product_led', 'screen_software'],
  // ⚖️ THE ONE CONVERSATIONAL FORMAT. "Behind the business" is the founder
  // talking, and the interview mode is where that lands when there are two
  // people in it.
  founder: ['talking_head', 'podcast_interview'],
  // ── AND THE FOUR THAT SAY NOTHING ABOUT PRODUCTION ──────────────────────
  educational: [],
  opinion: [],
  story: [],
  trend: [],
  /** ⚠️ NOT A FORMAT. An explicit request NOT to be constrained. */
  recommend: [],
}

/**
 * The production modes a creator's answers actually ask for.
 *
 * ⚠️ RETURNS `null` FOR AN UNANSWERED QUESTION AND `[]` FOR AN ANSWER THAT
 * CONSTRAINS NOTHING, and the caller must keep those apart. `null` means nobody
 * asked, so `formatStance` reports `not_checked` and says so in plain English.
 * `[]` means they were asked and chose not to narrow it — a real answer that
 * ranks nothing.
 *
 * ⚖️ DEDUPLICATED AND IN THE DECLARED ORDER OF `MODES_OF_DESIRED`, never in tap
 * order. Tap order is an accident of the interface, and this list is read by a
 * ranker where order would silently become priority.
 */
export function preferredModes(
  desired: readonly DesiredFormat[] | null | undefined,
): readonly ProductionMode[] | null {
  // ⚖️ NOT `Array.isArray`: it widens a `readonly DesiredFormat[]` to `any[]`,
  // which turns the lookup below into an unchecked index and silently costs the
  // exhaustiveness this whole map depends on.
  if (desired === null || desired === undefined || desired.length === 0) return null
  const out: ProductionMode[] = []
  for (const d of desired) {
    for (const m of MODES_OF_DESIRED[d] ?? []) {
      if (!out.includes(m)) out.push(m)
    }
  }
  return out
}
