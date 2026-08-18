// §7a — RANKING THE GALLERY: which reference should THIS creator use?
//
// §7a names seven signals. Building it turned up the thing that matters more
// than any weighting: FIVE OF THE SEVEN STILL CANNOT BE COMPUTED, because
// nothing records the reference's half of those comparisons.
//
// A gallery card carries a niche, a platform, a creator, a marketing sentence
// and two engagement numbers. It does not carry what the video is STRUCTURED
// like or whether its format is still working. Either would have to be inferred
// from prose written to sell the card — which is guessing, in the section of
// this document that exists to stop it.
//
// The sixth, production-mode match, was in that list until 0106 gave it a place
// to store an answer. It is computable now, and unanswered for every card that
// has not been assessed — which is all of them today.
//
// ── THE CORRECTION TO §7a, AND WHAT CLOSED IT ────────────────────────────
//
// §7a says production-mode match is "the one nobody builds and it is the most
// valuable", and that "the flags already carry it". The flags carried the
// CREATOR'S half — can they film objects, record a screen. Nothing carried the
// REFERENCE'S half, so the signal was blocked on a missing measurement rather
// than on wiring. 0106 adds that measurement, and this now reads it.
//
// IT IS STILL UNANSWERED FOR ALMOST EVERYTHING, AND SAYS SO. Every card in the
// gallery is `NULL` until something assesses it, and NULL is not false: a card
// nobody has looked at must not read as "nothing to film here", or a creator who
// cannot film objects is told the whole gallery suits them. Unassessed is
// `not_checked`, exactly as before — the difference is that an ASSESSED card can
// now be answered.
//
// ── WHY EVERY SIGNAL IS RETURNED, INCLUDING THE UNCHECKABLE ONES ─────────
//
// The same rule `craftChecks.ts` runs on. A ranking that quietly dropped the six
// it cannot compute would let one niche comparison look like a seven-signal
// judgement. All seven come back, in a stable order, and the six say what they
// are waiting for.
//
// ── AND THERE IS NO SCORE ────────────────────────────────────────────────
//
// §1.2: show the reason, not the score. Nothing here produces a number for a
// creator to read, and a test asserts no reason text contains a digit-and-%
// or a "/100". The ORDER is a number, unavoidably — but an order is a claim
// that one card comes before another, which is exactly what a gallery is for,
// and it is derived from one stated comparison rather than from a weighted sum
// that cannot be argued with.

/** §7a's seven, in the order they are always returned. */
// ⚠️ EIGHT NOW, NOT SEVEN. `commercial_fit` was living inside
// `content_availability` and does not belong there: whether Twin CAN fill a
// format and whether this creator is ALLOWED to make it are different
// questions with different answers. An affiliate can fill every slot of "why we
// built this" and must still not make it.
export const GALLERY_SIGNALS = [
  'dna_match',
  'goal_match',
  'production_mode_match',
  'recreate_feasibility',
  'structure_transferability',
  'content_availability',
  'commercial_fit',
  'freshness',
] as const
export type GallerySignalId = (typeof GALLERY_SIGNALS)[number]

export type GallerySignalStatus = 'match' | 'mismatch' | 'not_checked'

export interface GallerySignal {
  id: GallerySignalId
  status: GallerySignalStatus
  /** One sentence, as it would be shown. Never contains a number a creator
   *  could read as a rating. */
  reason: string
  /** For `not_checked` only: the measurement that would make it computable.
   *  Written down so the signal is one named field away from buildable rather
   *  than an open question. */
  needs?: string
}

/** How closely the reference's niche sits to the creator's. Discrete, because
 *  the alternative is a similarity float nobody can argue with. */
export type NicheRelation = 'same_sub_niche' | 'same_niche' | 'related' | 'unrelated' | 'unknown'

/** What the CREATOR can do, resolved from 0103's capability flags. Each is
 *  three-state: true, false, and nobody-has-said. */
export interface CreatorCapability {
  canFilmObjects: boolean | null
  canRecordScreen: boolean | null
}

/** What the REFERENCE requires, from 0106. Same three states, and for the same
 *  reason: 6,608 scraped cards carry NULL and none of them has been looked at. */
export interface ReferenceRequirements {
  requiresFilmingObjects: boolean | null
  requiresScreenRecording: boolean | null
}

export interface GalleryFacts {
  nicheRelation: NicheRelation
  /** Absent when the creator has never been asked. */
  creator?: CreatorCapability | null
  /** Absent when nobody has assessed this card. */
  requirements?: ReferenceRequirements | null
  /** The reference's own measured reach, when the card carries one. NOT a fit
   *  signal — it is a fact about the reference, not about this creator — so it
   *  only ever breaks a tie between two references that matched equally. */
  reach?: number | null
  likes?: number | null
}

const NICHE_REASON: Record<NicheRelation, { status: GallerySignalStatus; reason: string }> = {
  same_sub_niche: { status: 'match', reason: 'Same corner of your niche as the videos you make.' },
  same_niche: { status: 'match', reason: 'Same niche as yours.' },
  related: { status: 'match', reason: 'A niche next to yours — the audience overlaps.' },
  // NOT a mismatch. A cross-niche format is often the interesting one, and
  // marking it wrong would hide exactly the reference worth stealing from.
  unrelated: { status: 'not_checked', reason: 'From a different niche — worth a look, but we cannot say it fits yours.' },
  unknown: { status: 'not_checked', reason: 'We do not know your niche yet, so we cannot compare this to it.' },
}

/**
 * The seven signals for one reference. Always seven, always in order.
 *
 * Two are computable: `dna_match` from the niche comparison, and
 * `production_mode_match` where both halves have been answered. The other five
 * name the field they are missing.
 */
export function rankSignals(facts: GalleryFacts): GallerySignal[] {
  const niche = NICHE_REASON[facts.nicheRelation] ?? NICHE_REASON.unknown
  return [
    { id: 'dna_match', status: niche.status, reason: niche.reason },
    {
      id: 'goal_match',
      status: 'not_checked',
      reason: 'We have not checked whether this structure serves your goal.',
      needs: "the reference's structure, classified — nothing reads a gallery card's shape, and inferring it from the blurb would be a guess about a video we never watched",
    },
    productionModeMatch(facts),
    {
      id: 'recreate_feasibility',
      status: 'not_checked',
      reason: 'We have not checked whether this is achievable with what you have.',
      needs: 'the same missing field as production-mode match, plus what the creator has — this is the second question that field answers',
    },
    {
      id: 'structure_transferability',
      status: 'not_checked',
      reason: 'We have not checked whether this format survives a change of topic.',
      needs: "the reference's beat structure. The blueprint pipeline produces one AFTER a reference is chosen, which is too late to rank by",
    },
    {
      id: 'content_availability',
      status: 'not_checked',
      reason: 'We have not checked whether you have something to fill this format with.',
      needs: "the format's containers, and what the creator has to put in them",
    },
    {
      id: 'commercial_fit',
      status: 'not_checked',
      reason: 'We have not checked whether this suits what you sell.',
      needs: "the reference's commercial posture — whether the pattern is an owner's, an affiliate's or a reviewer's — plus the creator's relationship, which the profile already carries",
    },
    {
      id: 'freshness',
      status: 'not_checked',
      reason: 'We have not checked whether this format is still working.',
      // The tempting substitution, refused. `created_at` is when WE read the
      // card, not whether the format still performs, and using it would put a
      // confident freshness claim on a scrape date.
      needs: 'performance for this FORMAT over time. The scrape date is not it — when we found a video says nothing about whether its format is exhausted',
    },
  ]
}

/**
 * Can this creator physically shoot this reference?
 *
 * §7a's most valuable signal, and the whole design is in what it REFUSES to
 * conclude. It answers only where BOTH halves are explicitly known:
 *
 *   - the reference must have been assessed (0106's columns are NULL until
 *     something looks, and 6,608 cards are NULL today)
 *   - the creator must have been ASKED (0103's flags are three-state)
 *
 * A mismatch therefore means "you told us you cannot film objects, and somebody
 * established that this video needs them" — a sentence with two pieces of
 * evidence behind it. Anything less is `not_checked`, because the alternative is
 * telling a creator they cannot make a video on the strength of two absences.
 *
 * AND UNSET IS NEVER FALSE, on either side. That rule cost nothing while nothing
 * consumed the flags; here it is the difference between a filter that helps and
 * a filter that quietly hides most of the gallery from anyone who skipped a
 * question.
 */
function productionModeMatch(facts: GalleryFacts): GallerySignal {
  const req = facts.requirements
  const cap = facts.creator
  if (!req || (req.requiresFilmingObjects === null && req.requiresScreenRecording === null)) {
    return {
      id: 'production_mode_match',
      status: 'not_checked',
      reason: 'Nobody has checked what this one takes to film.',
      needs: 'an assessment of this card (0106 stores it; the discovery scraper is what will write it)',
    }
  }
  if (!cap) {
    return {
      id: 'production_mode_match',
      status: 'not_checked',
      reason: 'We have not asked what you can film yet.',
      needs: "the creator's capability flags — asked during onboarding, and unset until they are",
    }
  }

  // A blocker needs BOTH sides explicit: the reference requires it, and the
  // creator has said they cannot. `null` on either side answers nothing.
  const blockers: string[] = []
  if (req.requiresFilmingObjects === true && cap.canFilmObjects === false) {
    blockers.push('it needs objects on camera')
  }
  if (req.requiresScreenRecording === true && cap.canRecordScreen === false) {
    blockers.push('it needs a screen recording')
  }
  if (blockers.length > 0) {
    return {
      id: 'production_mode_match',
      status: 'mismatch',
      // Says what it needs and what they told us — arguable, per §7c. A creator
      // whose answer has changed can change it, rather than wondering why a
      // reference looks wrong.
      reason: `Hard to shoot as things stand — ${blockers.join(' and ')}, and you said that is not something you can do.`,
    }
  }

  // Only claim a match where something was actually established on both sides.
  const answered = (req.requiresFilmingObjects !== null && cap.canFilmObjects !== null)
    || (req.requiresScreenRecording !== null && cap.canRecordScreen !== null)
  if (!answered) {
    return {
      id: 'production_mode_match',
      status: 'not_checked',
      reason: 'We cannot tell whether you can shoot this from what we know.',
      needs: 'an answer on both sides — this card was assessed for one thing and you were asked about another',
    }
  }
  return {
    id: 'production_mode_match',
    status: 'match',
    reason: 'You can shoot this with what you told us you have.',
  }
}

/**
 * Order two references.
 *
 * Sorts by the niche comparison first, then by the reference's own measured
 * reach. The reach tiebreak is deliberately SECOND and deliberately not a
 * signal: a video with thirty million views is not thereby a better fit for
 * this creator, and letting reach lead is how the gallery becomes a list of
 * whatever is biggest.
 *
 * Returns a comparator so the caller sorts once rather than scoring every card.
 */
const RELATION_ORDER: Record<NicheRelation, number> = {
  same_sub_niche: 0, same_niche: 1, related: 2, unknown: 3, unrelated: 4,
}

export function compareByFit(a: GalleryFacts, b: GalleryFacts): number {
  const byNiche = RELATION_ORDER[a.nicheRelation] - RELATION_ORDER[b.nicheRelation]
  if (byNiche !== 0) return byNiche
  // Null is not zero: a card with no reach figure is UNMEASURED, and sorting it
  // below a card measured at 1 view would be treating an absent number as the
  // smallest one.
  const ra = typeof a.reach === 'number' ? a.reach : -1
  const rb = typeof b.reach === 'number' ? b.reach : -1
  if (ra !== rb) return rb - ra
  return 0
}

/**
 * What to show on the card: the matched signals' sentences.
 *
 * `not_checked` lines are returned by `rankSignals` and are NOT rendered on a
 * card — there is no room for six of them, and a card reading "we have not
 * checked" six times would say nothing. They belong wherever the ranking
 * explains itself in full. This returns only what was actually established, so
 * a card with nothing established shows nothing rather than filler.
 */
export function cardReasons(signals: readonly GallerySignal[]): string[] {
  return signals.filter((s) => s.status === 'match').map((s) => s.reason)
}

/**
 * How many of the seven were actually answered.
 *
 * Counts, and never scores — the same distinction `summarizeCraftChecks` makes.
 * "1 of 7 signals" is arithmetic about what was examined; "14% match" is a
 * number nobody measured.
 */
export function signalsAnswered(signals: readonly GallerySignal[]): number {
  return signals.filter((s) => s.status !== 'not_checked').length
}

/** The signals still waiting on a measurement, with what each needs. Exposed so
 *  the gap is readable from the code rather than only from a document. */
export function blockedSignals(signals: readonly GallerySignal[]): GallerySignal[] {
  return signals.filter((s) => s.status === 'not_checked' && s.needs !== undefined)
}
