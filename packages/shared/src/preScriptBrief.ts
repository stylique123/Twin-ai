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
 * FURTHER NARROWING BELONGS TO `promotes`. "Nothing to sell" should skip this
 * entirely, and "an affiliate product" should ask for the product's page rather
 * than the creator's own. That field exists on `BriefAnswers` and its values are
 * not pinned yet, so this conditions on what is actually decided today and says
 * so rather than guessing an enum it does not own.
 */
export function asksProductEvidence(kind: BriefWorkKind | null | undefined): boolean {
  // `creator` is excluded deliberately: it is the one kind where a product is
  // the exception rather than the rule, and the offer question already catches
  // the ones who have one.
  return !!kind && kind !== 'creator'
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
  /** Q4 — what your videos promote. Pre-filled on the confirm screen. */
  promotes?: string | null
  /** Q5 — "you mostly do X and Y — anything else you want to make?" The chips
   *  are the SCAN's reading; this captures only the intent it cannot see. */
  alsoWantsToMake?: string | null
  /** The product itself — a link we can read, or images of the thing. ASKED
   *  ONCE and reused: understanding a product costs a model call, and paying it
   *  per video would be paying repeatedly for an answer that does not change.
   *  Absent means unasked or skipped, never "they have no product". */
  productEvidence?: string | null
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
    if (q.id === 'productEvidence') return asksProductEvidence(answers.workKind)
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
