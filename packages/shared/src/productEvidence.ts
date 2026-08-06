// HOW A CREATOR HANDS US THE THING THEIR VIDEOS ARE ABOUT.
//
// `preScriptBrief.ts` decides WHETHER the product question is asked and which
// form leads. This module is what an answer to it actually IS — because
// "productEvidence: string" is a description of a product, and a description is
// the guess §2.3's container rule exists to refuse.
//
// ── WHAT THE PRIOR ART SETTLES ────────────────────────────────────────────
//
// Higgsfield's UGC flows (`ugc-saas-flow`, `ugc-product-flow`) ingest a product
// the same way in every variant, and three of their rules are load-bearing
// enough to encode rather than paraphrase:
//
//   1. THE PIXELS ARE REAL. A page is CAPTURED — full-page render, then stills
//      cut from it — and product images are imported from the product's own
//      page. Never generated, never animated from a screenshot, never "hunted
//      from elsewhere". An invented interface in a video about a real product is
//      not a stylistic liberty; it is a false claim about what the software does.
//
//   2. THE SECTION MAP IS THE ORDER. The page's top→bottom bands drive BOTH
//      what gets said and what gets shown. A product page is already ordered by
//      someone who thought about what matters first, and that ordering is free
//      information we would otherwise ask a model to re-derive.
//
//   3. FAILURE ASKS ONCE. Capture that errors, hits a bot wall, hits a login, or
//      yields too few usable stills does NOT get retried and does NOT get
//      papered over — it asks the creator immediately, with named options. A
//      silent retry loop spends the creator's time on our problem, and a silent
//      fallback ships a video about a product we never saw.
//
// ── WHERE WE DELIBERATELY DIVERGE ─────────────────────────────────────────
//
// Higgsfield's rule is "never ask the user to record their screen" — correct for
// a service that has no relationship with the creator's machine and must produce
// something from a URL alone. TwinAI DOES ask: a declared `[SHOW SCREEN: …]`
// slot is captured by the person who owns the account, which is the only way to
// show a logged-in dashboard truthfully.
//
// That divergence is exactly why the URL's ROLE has to be explicit. Higgsfield
// routes on it too ("a URL whose PAGE should appear on screen" vs "a URL that is
// only where the product lives"), and conflating the two is how a marketing
// page's hero shot ends up standing in for the product working. So:
//
//   knowledge  — we READ it to understand the product. Its stills never become
//                footage. This is what the brief question collects.
//   on_screen  — the page itself is the thing being shown, and something else
//                must have said so.
//
// The default is `knowledge`, and nothing in this module can promote a link to
// `on_screen` on its own.

/** The two things a creator can hand over. Both are the product itself; neither
 *  is a sentence about the product. */
export type EvidenceForm = 'link' | 'images'

/** What a URL IS to us — see the header. Never inferred from the URL. */
export type LinkRole = 'knowledge' | 'on_screen'

/**
 * Below this, a page did not tell us enough to be worth calling evidence, and
 * pretending otherwise means a model describing a product from two stills.
 * Higgsfield's threshold, kept: "minimum 3 usable cards or fall back to asking".
 */
export const MIN_USABLE_SECTIONS = 3

/** "Capture generously" — the cost of an extra still is a crop; the cost of a
 *  missing one is a section of the product nobody can talk about. */
export const CAPTURE_SECTION_TARGET = { min: 6, max: 10 } as const

/**
 * A top→bottom band of the captured page, or one supplied image.
 *
 * `order` is the page's own ordering and the only one that exists. It is not a
 * ranking we computed and not a running order a model chose — it is where the
 * thing sits on the page its owner built.
 */
export interface EvidenceSection {
  /** 0-based, top→bottom. Ties are not meaningful; the caller assigns these. */
  order: number
  /** What this band shows, for the model to read. Short, not a caption. */
  label: string
  /** Storage path of REAL captured pixels. Rule 1: nothing generated lands here. */
  imagePath: string
}

/** Why a capture did not produce usable evidence. Each is a thing to TELL the
 *  creator, which is why they are distinguished at all. */
export type CaptureFailure =
  | 'unreachable'      // the page did not load
  | 'blocked'          // a bot wall answered instead of the page
  | 'needs_login'      // the product is behind an account we do not have
  | 'too_few_sections' // it loaded, and there was not enough of it

/**
 * What the creator is offered when capture fails. NAMED options, both of which
 * move forward — there is no "try again" here on purpose. A retry asks the
 * creator to wait through the same failure a second time, and the two things
 * that actually resolve it are supplying the images themselves or deciding the
 * product does not need to appear.
 */
export const CAPTURE_FALLBACK_OPTIONS = ['send_images', 'continue_without'] as const
export type CaptureFallbackOption = (typeof CAPTURE_FALLBACK_OPTIONS)[number]

export interface ProductEvidence {
  form: EvidenceForm
  /** Present for `form: 'link'`. The page we read, kept so a re-read is possible
   *  and so the creator can see what we looked at. */
  url?: string | null
  /** Defaults to `knowledge`. Promotion to `on_screen` is somebody else's
   *  decision, made with the creator present. */
  linkRole: LinkRole
  /** Page bands, top→bottom, or the supplied images in the order given. */
  sections: EvidenceSection[]
  /**
   * Set once and reused. Understanding a product costs a model call and the
   * answer does not change per video, so paying it per video is paying
   * repeatedly for the same sentence.
   */
  capturedAt?: string | null
}

/**
 * WHAT HAPPENS NEXT AFTER A CAPTURE ATTEMPT — and the shape says the rule.
 *
 * There is no `retry` variant. Higgsfield's wording is "never retry on your
 * own", and a type that cannot express a retry is a stronger guarantee than a
 * comment asking a future caller not to write one.
 */
export type CaptureOutcome =
  | { kind: 'ready'; evidence: ProductEvidence }
  | { kind: 'ask_creator'; failure: CaptureFailure; options: readonly CaptureFallbackOption[] }

/**
 * Judge one capture attempt.
 *
 * Called with whatever the capture produced — a failure, or the sections it cut.
 * "Enough" is `MIN_USABLE_SECTIONS`, and falling short is treated exactly like
 * an error, because a page that yielded two bands has told us as little as a
 * page that did not load.
 */
export function assessCapture(
  attempt: { url: string; failure?: CaptureFailure | null; sections?: EvidenceSection[] },
): CaptureOutcome {
  const ask = (failure: CaptureFailure): CaptureOutcome =>
    ({ kind: 'ask_creator', failure, options: CAPTURE_FALLBACK_OPTIONS })
  if (attempt.failure) return ask(attempt.failure)
  const sections = orderedSections(attempt.sections ?? [])
  if (sections.length < MIN_USABLE_SECTIONS) return ask('too_few_sections')
  return {
    kind: 'ready',
    // `knowledge`, always. A link the creator pasted into "show us what you
    // sell" said what the product IS; it did not say the page should be on
    // screen, and reading it as consent to that is how a hero shot stands in for
    // the software working.
    evidence: { form: 'link', url: attempt.url, linkRole: 'knowledge', sections },
  }
}

/** The page's own top→bottom order, as a stable copy. Sorting anywhere else
 *  risks two callers disagreeing about what "first" means. */
export function orderedSections(sections: readonly EvidenceSection[]): EvidenceSection[] {
  return [...sections].sort((a, b) => a.order - b.order)
}

/**
 * May this evidence's pixels appear IN the video?
 *
 * The one question separating rule 1 from a marketing-page hero shot pretending
 * to be a product demo. Evidence is read by default, not shown.
 */
export function mayAppearOnScreen(evidence: ProductEvidence): boolean {
  return evidence.linkRole === 'on_screen'
}

/**
 * THREE STATES, the same discipline the claims question has.
 *
 * `declined` is a real answer — "there is nothing to show" is a fact the
 * container rule may act on. `unanswered` is not, and reading it as `declined`
 * would let a script quietly conclude that a demo needs no footage.
 */
export type ProductEvidenceState = 'unanswered' | 'declined' | 'supplied'

export function productEvidenceState(
  evidence: ProductEvidence | 'declined' | null | undefined,
): ProductEvidenceState {
  if (evidence === 'declined') return 'declined'
  if (!evidence) return 'unanswered'
  // Present but empty is not an answer: it is a record of an attempt.
  return evidence.sections.length > 0 ? 'supplied' : 'unanswered'
}
