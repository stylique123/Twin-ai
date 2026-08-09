// §8a.1 — WHAT IS ASKED, AND WHEN.
//
// The scan runs 45-60 seconds. §8a's opening correction is that five questions
// with a conditional and two multi-selects is realistically EIGHT interactions
// and ~90 seconds of reading — longer than the scan itself, at which point "free
// onboarding while you wait" stops being free.
//
// So the split is not cosmetic, and it has exactly one rule:
//
//   DURING THE SCAN — things the scan CANNOT know, because they are about
//                     INTENT. Asking them costs nothing; the scan is running.
//   ON CONFIRM      — things the scan CAN see, PRE-FILLED. Asking someone to
//                     tick fourteen boxes describing content we are actively
//                     reading is wasted effort AND less accurate, because
//                     people mis-report their own format.
//
// A question placed on the wrong side is not a style choice: an intent question
// on the confirm screen has nothing to pre-fill from, and an observable question
// during the scan asks for an answer we are about to read anyway.
//
// ── WHAT THIS MODULE IS AND IS NOT ────────────────────────────────────────
//
// It is the QUESTION SET and where each answer lands. It is NOT the provenance
// mechanism — `dnaProvenance.ts` already implements §8a.2 in full (discrete
// sources, evidence COUNTS rather than float confidence, conflicted fields kept
// side by side rather than merged, and `DECIDING_FIELDS`). Every answer here
// becomes a `user_answer` fact through that module, which is what makes
// "prioritise what they said, preserve what they do" executable rather than
// aspirational.
//
// ── THE TWO ANSWERS THAT MATTER MOST ─────────────────────────────────────
//
// `offer` (Q3b): §8a calls it "the highest-value field on the form". It is
// currently INFERRED, and voice.ts's prompt forbids a blank — so the model must
// produce something, and a guessed offer is a WRONG CALL TO ACTION ON EVERY
// VIDEO SHIPPED. Asking is the whole fix.
//
// `forbiddenClaims`: asked only when the answer to Q3 makes it matter.
// "Unguessable, and unforgivable to get wrong for a doctor, lawyer, financial
// adviser or supplement brand." There is no model that can infer what a
// regulator will not let someone say.

import type { ProductEvidence } from './productEvidence'

export type BriefStage = 'during_scan' | 'on_confirm'

/** Q1. A CHOOSER, not free text: it decides format, hook strategy and CTA
 *  strength, and a decision cannot be made from a sentence nobody parses. */
export const BRIEF_GOALS = [
  'followers', 'authority', 'educate', 'leads', 'sell', 'entertain', 'personal_brand',
] as const
export type BriefGoal = (typeof BRIEF_GOALS)[number]

/** Q3. What you do — the answer that decides where subject matter and business
 *  truth come from, and whether the claims question is asked at all. */
export const BRIEF_WORK_KINDS = [
  'creator', 'professional', 'ecommerce', 'brand', 'saas', 'local_service', 'other',
] as const
export type BriefWorkKind = (typeof BRIEF_WORK_KINDS)[number]

/**
 * Q4. WHAT APPEARS IN THESE VIDEOS THAT THE CREATOR DOES NOT OWN.
 *
 * A CHOOSER, not free text, and the reason is §2.3's container rule: the routes
 * that fill a `[SHOW: …]` slot BRANCH on this answer, and a branch cannot be
 * taken on a sentence nobody parses. "I do affiliate stuff for supplements
 * mostly" is a fine thing for a human to say and useless to a rule that has to
 * decide whether the product being shown belongs to the creator.
 *
 * The distinction earns its place because getting it wrong is not cosmetic:
 *
 *   affiliate    someone ELSE's product, with a commission. The creator cannot
 *                promise what it does, cannot speak for its support or refunds,
 *                and a script that says "my product" is wrong about the world.
 *                A material connection, so it is disclosed.
 *   sponsor      someone else's product, paid to feature it. Disclosure is a
 *                property of the arrangement, not a per-video decision the
 *                writer may weigh against pacing.
 *   review_only  someone else's product, no commercial tie. Product facts and
 *                the creator's own experience only — never the vendor's
 *                marketing, which would make the review an advertisement.
 *   none         nothing of anyone else's. For a `creator`, where Q3 implied
 *                nothing about ownership either, this additionally means
 *                ideas-only and NO Product DNA at all.
 *
 * OWNERSHIP IS NOT HERE, and that is the change. Q3 mints the owned entity —
 * see `productEntity.ts` — so this question no longer re-asks what another
 * answer already implied.
 *
 * Stored in `brand_voices.pre_script_brief`, which 0109's CHECK already permits
 * (`promotes` is in its key set and in `BRIEF_STORED_KEYS`) and which pins the
 * KEY SET rather than these values — so this needs NO migration. Verified
 * against 0109 before writing one.
 */
// REWRITTEN — Q4 NO LONGER ASKS ABOUT OWNERSHIP.
//
// The old vocabulary was `own_product | affiliate | nothing_to_sell`, and it
// answered TWO questions in one field: do you own something, and do you feature
// anything of anyone else's. The first is redundant exactly where Q3 was
// informative — a creator who has just said "Software" does not need to be asked
// whether they have a product — and that redundancy is what the standing rule
// forbids. Q3 MINTS the owned entity now (`productEntity.ts`), so this field is
// free to carry only the half still genuinely unknown.
//
// `sponsor` and `review_only` are new members rather than a widening for its own
// sake: each changes what a script may SAY. A sponsor owes a disclosure; a
// reviewer may state product facts and their own experience but never repeat the
// vendor's marketing. Collapsing either into `affiliate` would license a claim
// its relationship does not.
//
// STORAGE IS UNCHANGED. 0109's CHECK constrains the KEY SET and requires a
// non-empty string; it never pinned these values, so this needs no migration.
// Verified against the migration before this comment was written.
export const BRIEF_PROMOTES = ['affiliate', 'sponsor', 'review_only', 'none'] as const
export type BriefPromotes = (typeof BRIEF_PROMOTES)[number]

/** The values this field used to hold. Kept so `readStoredBrief` can recognise
 *  a brief written before the split rather than silently dropping it — see
 *  `readLegacyPromotes` in `productEntity.ts` for what each one becomes. */
export const LEGACY_BRIEF_PROMOTES = ['own_product', 'nothing_to_sell'] as const

/**
 * The kinds for which "what may you NOT claim" is asked.
 *
 * §8a names Professional / Ecommerce / Brand. `saas` is deliberately NOT here:
 * it is the one kind where the temptation to add it is strongest and the
 * justification weakest — a SaaS founder's constraints are competitive, not
 * regulatory, and asking a compliance question of someone with no compliance
 * regime trains them to skip it, which is how the doctor skips it too.
 */
export const CLAIMS_QUESTION_KINDS: readonly BriefWorkKind[] = ['professional', 'ecommerce', 'brand']

export function asksForbiddenClaims(kind: BriefWorkKind | null | undefined): boolean {
  return !!kind && (CLAIMS_QUESTION_KINDS as readonly string[]).includes(kind)
}

/**
 * HOW a creator can hand us the thing their videos are about.
 *
 * `link` is a page we can read. `images` are the object itself. `either` is for
 * the kinds where both are normal and neither is obviously right.
 *
 * This exists because §2.3's container rule has no input: a script that says
 * `[SHOW: the product]` is an instruction only if something has confirmed what
 * the product IS, and otherwise it is a gap wearing a marker's costume. The
 * creator is the only one who can close that, and they should have to do it
 * ONCE — not per video, and not by typing a description of something they can
 * simply show us.
 */
export type ProductEvidenceForm = 'link' | 'images' | 'either'

/**
 * The form to ASK FOR first, by what the creator does.
 *
 * A suggestion about which upload button leads, never a restriction: a SaaS
 * founder with a screenshot and a jeweller with a shop page are both ordinary,
 * so every kind accepts both and this only decides what is offered first.
 *
 * `saas` and the service kinds lead with a link because their product is
 * already a page that describes itself. `ecommerce` leads with images because a
 * product PAGE is marketing copy and the product is a physical object — and it
 * is the object that has to be filmed.
 */
export const PRODUCT_EVIDENCE_FORM: Record<BriefWorkKind, ProductEvidenceForm> = {
  saas: 'link',
  professional: 'link',
  local_service: 'link',
  brand: 'link',
  ecommerce: 'images',
  creator: 'either',
  other: 'either',
}

/**
 * Is there a product to understand at all?
 *
 * CONDITIONAL, and that is the point: a wall of questions is answered badly or
 * skipped, so this appears only once the creator has said what they do. It is
 * not asked before `workKind`, and a `creator` with nothing to sell is not
 * interrogated about a product they do not have — asking someone about a thing
 * that does not exist is how they learn to click past the questions that matter.
 *
 * NARROWED BY `promotes`, which is now pinned. This comment used to say the
 * values were "not pinned yet" and to condition on `workKind` alone — and it
 * stayed there after `BRIEF_PROMOTES` was pinned twenty lines above it, so a
 * creator who had just said they have nothing to sell was still asked to hand
 * over their product page. An accurate note that stops being accurate reads
 * exactly like one that never was.
 *
 * SILENCE IS NOT "NOTHING TO SELL". Only an explicit `none` suppresses the
 * question. A null `promotes` means unanswered, and someone who has not reached
 * that question yet still has a product to describe — so this gate is permissive
 * on silence, like `can_film_objects` and unlike `can_record_screen`. The
 * asymmetry between those two is deliberate; see `capabilities.ts` before
 * assuming it is a bug.
 *
 * `none` NOW MEANS SOMETHING NARROWER than `nothing_to_sell` did, and the gate
 * is correspondingly narrower. It says "nothing of anyone ELSE'S" — it says
 * nothing about what the creator owns, because Q3 answers that. So a founder who
 * answers `none` is still asked for their product: they have one, Q3 minted it,
 * and it is the entity this evidence attaches to.
 *
 * STILL OPEN: `affiliate` should ask for the PRODUCT'S page rather than the
 * creator's own. That is a copy change to `PRODUCT_EVIDENCE_FORM`, not a gate
 * change, and it is a decision about what to say rather than whether to ask —
 * so it is not smuggled in here.
 */
export function asksProductEvidence(
  kind: BriefWorkKind | null | undefined,
  promotes?: BriefPromotes | null,
): boolean {
  // `creator` is excluded deliberately: it is the one kind where a product is
  // the exception rather than the rule, and the offer question already catches
  // the ones who have one.
  if (!kind || kind === 'creator') return false
  // A creator who features nothing of anyone else's AND owns nothing is the only
  // combination with no product at all — and `kind === 'creator'` above is the
  // only kind where owning nothing is possible, so it is already excluded.
  return promotes !== 'none'
}

export interface BriefAnswers {
  /** Q1 */
  goal?: BriefGoal | null
  /** Q2 — the chosen audience, plus the free text §8a requires of every "Other"
   *  ("Every 'Other' carries free text or it trades a real answer for a null"). */
  audience?: string | null
  /** Q3 */
  workKind?: BriefWorkKind | null
  /** Q3's conditional free text, when `workKind` is `other`. */
  workKindOther?: string | null
  /** Q3b — the offer itself: what it is called and what it does. */
  offer?: string | null
  /** The conditional. Free text, because a list of forbidden claims cannot be
   *  enumerated in advance for every profession. */
  forbiddenClaims?: string | null
  /** Q4 — whose product the CTA points at. Pre-filled on the confirm screen and
   *  CORRECTED rather than composed, because captions and CTAs make it partly
   *  observable. A chooser: §2.3's three container routes branch on it. */
  promotes?: BriefPromotes | null
  /** Q5 — "you mostly do X and Y — anything else you want to make?" The chips
   *  are the SCAN's reading; this captures only the intent it cannot see. */
  alsoWantsToMake?: string | null
  /** The product itself — a link we READ, or images of the thing. Never a
   *  sentence describing it: a description is the guess §2.3's container rule
   *  exists to refuse. ASKED ONCE and reused, because understanding a product
   *  costs a model call and the answer does not change per video.
   *
   *  `'declined'` is a real answer ("there is nothing to show"). Absent is not —
   *  see `productEvidenceState`. */
  productEvidence?: ProductEvidence | 'declined' | null
}

export interface BriefQuestion {
  id: keyof BriefAnswers
  stage: BriefStage
  /** What the creator reads. */
  prompt: string
  /** Present when the question is a chooser rather than free text. */
  options?: readonly string[]
  /** True when the scan pre-fills it — the confirm-screen questions, and only
   *  those. An intent question with a pre-fill would be the product answering
   *  on the creator's behalf. */
  prefilled: boolean
  /** Why it is asked here rather than the other side. Carried so a future
   *  reader moving a question has to argue with the reason. */
  because: string
}

export const BRIEF_QUESTIONS: readonly BriefQuestion[] = [
  {
    id: 'goal', stage: 'during_scan', prompt: 'What do you want these videos to do?',
    options: BRIEF_GOALS, prefilled: false,
    because: 'Intent. Decides format, hook strategy and CTA strength — none of which the scan can read.',
  },
  {
    id: 'audience', stage: 'during_scan', prompt: 'Who are you talking to?',
    prefilled: false,
    because: 'Intent. The scan reads CAPTIONS, not followers — see §8a.2(c): who your content READS as is not who your audience IS.',
  },
  {
    id: 'workKind', stage: 'during_scan', prompt: 'What do you do?',
    options: BRIEF_WORK_KINDS, prefilled: false,
    because: 'Decides where subject matter and business truth come from, and whether the claims question is asked at all.',
  },
  {
    id: 'offer', stage: 'during_scan', prompt: 'What is your offer called, and what does it do?',
    prefilled: false,
    because: 'The highest-value field on the form. `offer` is otherwise INFERRED and forced non-empty, so a guess becomes a wrong call to action on every video shipped.',
  },
  {
    id: 'forbiddenClaims', stage: 'during_scan', prompt: 'Is there anything you are not allowed to claim?',
    prefilled: false,
    because: 'Unguessable, and unforgivable to get wrong for a doctor, lawyer, financial adviser or supplement brand. No model can infer what a regulator forbids.',
  },
  {
    id: 'productEvidence', stage: 'during_scan',
    prompt: 'Show us what you sell — paste a link, or add a few photos.',
    prefilled: false,
    because: "§2.3's container rule has no input without it: `[SHOW: the product]` is only an instruction if something confirmed what the product is. Asked once, because understanding a product costs a model call and it does not change per video.",
  },
  {
    id: 'promotes', stage: 'on_confirm', prompt: 'What do your videos promote?',
    prefilled: true,
    because: 'Partly observable from captions and CTAs, so it arrives pre-filled and is corrected rather than composed.',
  },
  {
    id: 'alsoWantsToMake', stage: 'on_confirm', prompt: 'Anything else you want to make?',
    prefilled: true,
    because: 'Fully observable. Ticking fourteen boxes describing content we are actively reading is wasted effort and less accurate — people mis-report their own format. This captures only the intent the scan cannot see.',
  },
]

/**
 * The questions to ask at a given moment, given what is already answered.
 *
 * THE CLAIMS QUESTION IS CONDITIONAL, and its absence is not a default. A
 * creator who was never asked has NOT said "nothing is forbidden" — see
 * `forbiddenClaimsAnswered`.
 */
export function questionsFor(stage: BriefStage, answers: BriefAnswers): BriefQuestion[] {
  return BRIEF_QUESTIONS.filter((q) => {
    if (q.stage !== stage) return false
    if (q.id === 'forbiddenClaims') return asksForbiddenClaims(answers.workKind)
    if (q.id === 'productEvidence') return asksProductEvidence(answers.workKind, answers.promotes)
    return true
  })
}

/**
 * WAS THE CLAIMS QUESTION ANSWERED, as opposed to skipped or never asked?
 *
 * Three states, and collapsing them is the failure this guards. "We asked and
 * they said there are no restrictions" is a fact the product may act on.
 * "We never asked" and "they left it blank" are not — and a system that treats
 * an empty string as permission has quietly decided a doctor may say anything.
 */
export type ClaimsAnswerState = 'not_applicable' | 'unanswered' | 'none_declared' | 'declared'

export function forbiddenClaimsAnswered(answers: BriefAnswers): ClaimsAnswerState {
  if (!asksForbiddenClaims(answers.workKind)) return 'not_applicable'
  const v = answers.forbiddenClaims
  if (v === null || v === undefined) return 'unanswered'
  const t = v.trim()
  // An explicit "none" is a real answer and must be distinguishable from an
  // empty box the creator scrolled past.
  if (t === '') return 'unanswered'
  if (/^(none|n\/a|no|nothing)\.?$/i.test(t)) return 'none_declared'
  return 'declared'
}

/**
 * Which answers are missing that the product would otherwise have to GUESS.
 *
 * Returns the question ids, so a caller can prompt for exactly those rather
 * than re-asking everything. `offer` leads the list deliberately: it is the one
 * whose absence is currently papered over by a model that is forbidden to
 * return a blank.
 */
export function unansweredDecidingQuestions(answers: BriefAnswers): Array<keyof BriefAnswers> {
  const missing: Array<keyof BriefAnswers> = []
  const blank = (v: string | null | undefined): boolean =>
    v === null || v === undefined || v.trim() === ''
  if (blank(answers.offer)) missing.push('offer')
  if (!answers.goal) missing.push('goal')
  if (!answers.workKind) missing.push('workKind')
  if (blank(answers.audience)) missing.push('audience')
  if (forbiddenClaimsAnswered(answers) === 'unanswered') missing.push('forbiddenClaims')
  return missing
}

/** An "Other" that carries no free text trades a real answer for a null (§8a.1),
 *  so it is reported rather than stored as the useless value `other`. */
export function otherWithoutText(answers: BriefAnswers): boolean {
  return answers.workKind === 'other'
    && (answers.workKindOther === null || answers.workKindOther === undefined
      || answers.workKindOther.trim() === '')
}

// ---------------------------------------------------------------------------
// STORING IT — the one shape that goes to the database
// ---------------------------------------------------------------------------

/** Every key `brand_voices.pre_script_brief` accepts, and the only ones.
 *
 *  Mirrors 0109's CHECK deliberately. Two lists that must agree is the shape of
 *  a drift bug, so a test pins this against the migration file: the day a tenth
 *  question is added to one, the other cannot stay silent. */
export const BRIEF_STORED_KEYS = [
  'goal', 'audience', 'workKind', 'workKindOther', 'offer',
  'forbiddenClaims', 'promotes', 'alsoWantsToMake', 'productEvidence',
] as const

/**
 * What is safe to WRITE — and the whole of the three-state discipline at the
 * one point where it can be lost.
 *
 * A key is present only when there is a real answer behind it. That is not
 * tidiness: `{forbiddenClaims: ''}` and `{}` are the same fact to every reader
 * and different rows in the table, so the empty one is a state that means
 * "unanswered" while counting as "answered" to anyone who checks for the key.
 *
 * MERGING IS THE CALLER'S JOB, and it must merge rather than replace — the
 * brief is filled in over two screens (during the scan, then on confirm) and a
 * whole-object write from the first screen would erase the second's answers.
 * `savePreScriptBrief` does that read-merge-write, exactly as
 * `saveCapabilityDefaults` does for the flags.
 *
 * `'declined'` survives, because "there is nothing to show" is an answer the
 * container rule may act on. Absent is not, and reading absent as declined
 * would let a demo script conclude it needs no footage.
 */
export function sanitizeBriefForWrite(answers: BriefAnswers): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const text = (k: 'audience' | 'workKindOther' | 'offer' | 'forbiddenClaims'
    | 'promotes' | 'alsoWantsToMake'): void => {
    const v = answers[k]
    if (typeof v === 'string' && v.trim() !== '') out[k] = v.trim()
  }
  if (answers.goal) out.goal = answers.goal
  if (answers.workKind) out.workKind = answers.workKind
  text('audience'); text('workKindOther'); text('offer'); text('forbiddenClaims')
  text('promotes'); text('alsoWantsToMake')
  const pe = answers.productEvidence
  if (pe === 'declined') out.productEvidence = 'declined'
  // An evidence record with no sections is the log of an attempt, not an
  // answer — `productEvidenceState` says so, and storing it would make a failed
  // capture look like a supplied product.
  else if (pe && typeof pe === 'object' && pe.sections.length > 0) out.productEvidence = pe
  return out
}

/** Read a stored brief back. Unknown keys are DROPPED rather than carried: the
 *  CHECK cannot admit them, so anything else in there arrived before the
 *  constraint existed and is not something this vocabulary can interpret. */
export function readStoredBrief(raw: unknown): BriefAnswers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const src = raw as Record<string, unknown>
  const out: BriefAnswers = {}
  for (const k of BRIEF_STORED_KEYS) {
    if (!(k in src)) continue
    const v = src[k]
    if (k === 'productEvidence') {
      if (v === 'declined') out.productEvidence = 'declined'
      else if (v && typeof v === 'object') out.productEvidence = v as BriefAnswers['productEvidence']
      continue
    }
    if (typeof v === 'string' && v.trim() !== '') {
      // The two enums are validated rather than cast: a stored `goal` that is
      // not a BRIEF_GOAL would otherwise flow into a prompt as if the creator
      // had chosen it.
      if (k === 'goal') { if ((BRIEF_GOALS as readonly string[]).includes(v)) out.goal = v as BriefGoal }
      else if (k === 'workKind') {
        if ((BRIEF_WORK_KINDS as readonly string[]).includes(v)) out.workKind = v as BriefWorkKind
      } else if (k === 'promotes') {
        // THREE enums now, and the reason is the same for all of them: a stored
        // value outside the vocabulary would reach the blueprint prompt as
        // though the creator had chosen it. `promotes` matters most — an
        // unparseable value here does not degrade the CTA, it sends the
        // container rule down a route the creator never picked.
        if ((BRIEF_PROMOTES as readonly string[]).includes(v)) out.promotes = v as BriefPromotes
        // A BRIEF WRITTEN BEFORE Q4 WAS SPLIT. Both legacy values said something
        // about ownership, which Q3 now answers better, and one of them also
        // said something about third parties, which still maps:
        //
        //   own_product      → ownership only. Nothing about anyone else's, so
        //                      `none`, and Q3's mint supplies what it used to.
        //   nothing_to_sell  → also `none`. Its CTA suppression is carried by
        //                      the ABSENCE OF AN OWNED ENTITY rather than by a
        //                      second flag — see `productEntity.ts`'s
        //                      `readLegacyPromotes`, and `onboardingDraft.ts`
        //                      where it becomes `ownsEntity: false`.
        //
        // Mapped rather than dropped, because dropping it would silently re-ask
        // a question the creator already answered — the exact failure this
        // vocabulary change exists to remove.
        else if (v === 'own_product' || v === 'nothing_to_sell') out.promotes = 'none'
      } else out[k] = v as never
    }
  }
  return out
}
