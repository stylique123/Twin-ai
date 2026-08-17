// FOUR OBLIGATIONS, NOT ONE PERCENTAGE.
//
// ⚠️ THE EARLIER MODEL MIXED SCRIPT INTELLIGENCE WITH VISUAL SETUP, and that is
// how a meter starts lying. A creator with every creative answer resolved and no
// logo would have read "70% complete" — while the missing 30% could not change a
// single line of a script. The number was measuring how much of a form had been
// filled in, and presenting it as how much Twin knew.
//
// ⚠️ AND IT CREATED AN INCENTIVE TO MANUFACTURE THE EXACT DATA WE REFUSE TO
// STORE. A creator pushed toward 100% picks black and white to clear the bar, and
// that lands in `brand.primary_color` as an assertion. `brandSnapshot` spent a
// whole PR making auto-extracted greyscale not count as brand truth; a completion
// meter that rewards typing it by hand reopens the same hole through the front
// door.
//
// ⚖️ SO THE OBLIGATIONS ARE SEPARATE IN THE DATA, NOT ONLY IN THE UI:
//
//   CONTENT PROFILE   a percentage — controls ideas, references, scripts, claims
//   PRODUCT DNA       ready | missing | not_needed — controls product truth
//   BRAND KIT         ready | not_set_up — controls supported visual branding
//   PRODUCTION FACTS  known | unknown, per capability — controls what the
//                     Director Plan may ask a person to physically do
//
// ⚖️ THREE OF THOSE ARE STATES AND ONLY ONE IS A NUMBER, deliberately. "Not set
// up" and "unknown" are honest readings of an absence; a percentage is not,
// because it implies the absence is a shortfall. A creator who has no product is
// not 80% of a creator.
//
// ⚖️ AND EVERY MISSING POINT NAMES ITS READER. That is the rule that keeps this
// honest as the pipeline grows: an item may only cost the creator a percentage
// point if there is a named consumer that behaves differently once it is
// answered. When a reader is retired, its item leaves the meter with it.

import type { CreatorProfileAnswers, CommercialTie } from './creatorProfileQuestions'

/** Where an answer is consumed. Not decoration — see the rule above. */
export type ProfileReader =
  | 'creative_decision_plan'
  | 'writer'
  | 'reference_recommendation'
  | 'retrieval'
  | 'cta'

export type ProfileItemId =
  | 'goal' | 'audience' | 'work' | 'promotes' | 'formats'
  | 'productContext' | 'cta' | 'dnaReady' | 'conflicts'

export interface ProfileItem {
  id: ProfileItemId
  /** Plain English, addressed to a first-time creator. Never an internal term. */
  label: string
  /** What changes once this is answered — shown so the ask can be judged. */
  unlocks: string
  reader: ProfileReader
  weight: number
}

/** ⚠️ WEIGHTS ARE NOT UNIFORM BECAUSE THE READERS ARE NOT. The goal reaches four
 *  consumers and the format preference reaches one; spreading them evenly would
 *  tell a creator that picking a preferred length matters as much as saying what
 *  the video is for. */
export const PROFILE_ITEMS: readonly ProfileItem[] = [
  { id: 'goal', label: 'What you want your videos to do', unlocks: 'the ending, the angle and what each script has to prove', reader: 'creative_decision_plan', weight: 20 },
  { id: 'audience', label: 'Who you are talking to', unlocks: 'who the script is addressed to and what it can assume', reader: 'writer', weight: 15 },
  { id: 'work', label: 'What you actually do', unlocks: 'the claims Twin will let a script make in your voice', reader: 'writer', weight: 15 },
  { id: 'promotes', label: 'What your videos are about', unlocks: 'which of your own material Twin pulls from', reader: 'retrieval', weight: 15 },
  { id: 'formats', label: 'The kinds of videos you want', unlocks: 'which references Twin suggests copying', reader: 'reference_recommendation', weight: 10 },
  { id: 'productContext', label: 'What you sell', unlocks: 'whether a script may talk about an offer at all', reader: 'creative_decision_plan', weight: 10 },
  { id: 'cta', label: 'What you ask viewers to do', unlocks: 'the last line of every script', reader: 'cta', weight: 5 },
  { id: 'dnaReady', label: 'Your account has been read', unlocks: 'everything — without it a script has nothing of yours to draw on', reader: 'retrieval', weight: 10 },
]

/** ⚠️ A CONFLICT IS NOT A MISSING ANSWER, IT IS TWO ANSWERS THAT CANNOT BOTH
 *  HOLD, and it costs points because the pipeline genuinely cannot proceed on
 *  it — unlike a blank, which it can route around. It is listed separately so
 *  the creator is told what to RESOLVE rather than what to add. */
export const CONFLICT_ITEM: ProfileItem = {
  id: 'conflicts', label: 'Two of your answers disagree',
  unlocks: 'Twin stops guessing which of the two you meant',
  reader: 'creative_decision_plan', weight: 0,
}

export interface ProfileInput {
  answers?: CreatorProfileAnswers | null
  /** Whether the creator's account has been read into knowledge. */
  dnaReady?: boolean | null
  /** What they ask viewers to do, when they have said. */
  cta?: string | null
  /** Answers that cannot both hold, in plain English. Empty is the good state. */
  conflicts?: readonly string[] | null
}

export interface ProfileGap {
  id: ProfileItemId
  label: string
  unlocks: string
}

export interface ContentProfile {
  /** 0–100. Every missing point corresponds to a named reader. */
  percent: number
  gaps: ProfileGap[]
  /** Items that do not apply to this creator, so they cost nothing. */
  notApplicable: ProfileItemId[]
}

const filled = (v: unknown): boolean =>
  typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.length > 0 : v != null

/**
 * ⚖️ "NOT APPLICABLE" IS SUBTRACTED FROM THE DENOMINATOR, NOT COUNTED AS DONE.
 * A creator who answered "nothing commercial" reaches 100% without a Product
 * Library, because for them there is nothing missing — and marking the item
 * "complete" instead would claim they have an offer Twin knows about.
 */
function applies(item: ProfileItem, input: ProfileInput): boolean {
  if (item.id !== 'productContext') return true
  const ties: readonly CommercialTie[] = input.answers?.commercialTies ?? []
  // ⚠️ SILENCE IS NOT "no". An unreached question leaves the item applicable, so
  // it shows as something to answer rather than vanishing — the same rule
  // `suggestionsAllowed` runs on.
  if (ties.length === 0) return true
  return !(ties.length === 1 && ties[0] === 'none')
}

function satisfied(item: ProfileItem, input: ProfileInput): boolean {
  const a = input.answers
  switch (item.id) {
    case 'goal': return filled(a?.contentGoals)
    case 'audience': return filled(a?.audience)
    case 'work': return filled(a?.workKind)
    case 'promotes': return filled(a?.contentGoals) && filled(a?.workKind)
    case 'formats': return filled(a?.desiredFormats)
    case 'productContext': return filled(a?.commercialTies)
    case 'cta': return filled(input.cta)
    case 'dnaReady': return input.dnaReady === true
    default: return false
  }
}

/**
 * How much of what Twin needs IN ORDER TO WRITE does it have?
 *
 * ⚠️ NOTHING VISUAL AND NOTHING PHYSICAL IS COUNTED HERE. Brand Kit and
 * production capability are separate obligations with their own states; folding
 * either one in is what made the old number dishonest.
 */
export function contentProfile(input: ProfileInput): ContentProfile {
  const gaps: ProfileGap[] = []
  const notApplicable: ProfileItemId[] = []
  let earned = 0
  let possible = 0

  for (const item of PROFILE_ITEMS) {
    if (!applies(item, input)) { notApplicable.push(item.id); continue }
    possible += item.weight
    if (satisfied(item, input)) earned += item.weight
    else gaps.push({ id: item.id, label: item.label, unlocks: item.unlocks })
  }

  const conflicts = input.conflicts ?? []
  if (conflicts.length > 0) {
    gaps.unshift({ id: 'conflicts', label: CONFLICT_ITEM.label, unlocks: CONFLICT_ITEM.unlocks })
  }

  // ⚖️ ROUNDED DOWN. 99.6% must not render as 100 while a gap is still listed —
  // a meter that says complete beside a list of missing things is the same
  // false confidence in a smaller box.
  const percent = possible === 0 ? 100 : Math.floor((earned / possible) * 100)
  // A conflict caps the meter below complete, because the pipeline cannot
  // proceed on contradictory answers however many boxes are ticked.
  return { percent: conflicts.length > 0 ? Math.min(percent, 99) : percent, gaps, notApplicable }
}

// ── THE THREE STATES THAT ARE NOT PERCENTAGES ─────────────────────────────

export type BrandKitStatus = 'ready' | 'not_set_up'
export type ProductDnaStatus = 'ready' | 'missing' | 'not_needed'
export type ProductionFact = 'yes' | 'no' | 'unknown'

export interface BrandKitLike {
  /** ⚠️ NULL UNTIL THE CREATOR EXPLICITLY PROVIDES IT. No greyscale inference,
   *  no placeholder swatch standing in for an answer. */
  primaryHex?: string | null
  secondaryHex?: string | null
  logoPath?: string | null
  /** 'manual' is the only source that establishes a brand. */
  paletteSource?: string | null
}

/**
 * ⚖️ READY MEANS SOMEBODY SAID SO. An auto-extracted palette is a reading, not a
 * decision, and a logo the creator uploaded is. Either one on its own is enough
 * to stop calling the kit unset — but a machine's guess never is.
 */
export function brandKitStatus(kit?: BrandKitLike | null): BrandKitStatus {
  if (!kit) return 'not_set_up'
  const manualPalette = kit.paletteSource === 'manual'
    && (filled(kit.primaryHex) || filled(kit.secondaryHex))
  return manualPalette || filled(kit.logoPath) ? 'ready' : 'not_set_up'
}

/**
 * ⚖️ `not_needed` IS A REAL AND COMMON ANSWER, and it is not a lesser version of
 * `ready`. A creator who sells nothing is not missing a product — telling them so
 * is the product arguing with them about their own business.
 *
 * ⚠️ AND `missing` REQUIRES THEM TO HAVE SAID THEY SELL SOMETHING. Silence gives
 * `missing` too, but only because the question is still open; it never gives
 * `not_needed`, which is an answer nobody supplied.
 */
export function productDnaStatus(
  ties: readonly CommercialTie[] | null | undefined,
  entityCount: number,
): ProductDnaStatus {
  if (Array.isArray(ties) && ties.length === 1 && ties[0] === 'none') return 'not_needed'
  return entityCount > 0 ? 'ready' : 'missing'
}

/**
 * ⚠️ "NOT DECLARED" IS NOT "NO", AND THIS IS THE WHOLE POINT OF THE TYPE. A
 * creator who never answered whether the product is on hand while filming has not
 * told us it is absent. Reading the blank as `no` silently removes every scene
 * that would have shown it; reading it as `yes` puts a person in front of a
 * camera holding something they may not own.
 *
 * ⚖️ SO IT STAYS `unknown`, AND `unknown` COSTS NO PERCENTAGE POINT. It is a fact
 * about production capability, not a hole in the creative profile.
 */
export function productionFact(value: unknown): ProductionFact {
  return value === true ? 'yes' : value === false ? 'no' : 'unknown'
}

// ── WHERE THE ANSWERS COME FROM, AND IN WHAT ORDER ────────────────────────
//
// ⚠️ THE STORED BRIEF WINS, AND THE LOCAL DRAFT IS A FALLBACK RATHER THAN A
// PEER. The draft is a half-finished form on one device; the brief is what the
// creator confirmed. Merging them field-by-field with the draft on top would let
// an abandoned edit — a chip tapped and never submitted — outrank the answer
// they actually gave, on the device where they happened to abandon it.
//
// ⚖️ BUT THE DRAFT IS NOT IGNORED, BECAUSE ONBOARDING IS NOT INSTANT. Between
// answering and the write landing there is a window where only the draft holds
// the answers, and reading nothing there would make the meter drop to zero
// mid-onboarding — which is when a creator is most likely to be looking at it.
export interface ProfileAnswerSources {
  /** `readStoredBrief(voice.pre_script_brief)` — what the creator confirmed. */
  stored?: Partial<CreatorProfileAnswers> | null
  /** The local onboarding draft, if this device has one. */
  draft?: Partial<CreatorProfileAnswers> | null
}

const present = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : v != null

/**
 * ⚖️ PER-FIELD, NOT WHOLE-OBJECT. A stored brief written before a question
 * existed has no key for it, and preferring the whole stored object would then
 * discard a draft answer to a question the brief predates — reporting a gap the
 * creator has already filled in front of us.
 */
export function resolveProfileAnswers(
  src: ProfileAnswerSources,
): CreatorProfileAnswers {
  const out: Record<string, unknown> = {}
  for (const key of new Set([
    ...Object.keys(src.draft ?? {}), ...Object.keys(src.stored ?? {}),
  ])) {
    const stored = (src.stored as Record<string, unknown> | null | undefined)?.[key]
    const draft = (src.draft as Record<string, unknown> | null | undefined)?.[key]
    out[key] = present(stored) ? stored : draft
  }
  return out as CreatorProfileAnswers
}
