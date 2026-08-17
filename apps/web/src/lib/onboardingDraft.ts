import {
  Q4_ANSWERS, readLegacyPromotes,
  AUDIENCE_SEGMENTS, AUDIENCE_KNOWLEDGE, DESIRED_FORMATS, FORMAT_EXPLORATION,
  COMMERCIAL_TIES, OWN_PRODUCT_KINDS, OWN_SERVICE_KINDS, CAPABILITY_ANSWERS,
  BRIEF_GOALS,
  type BriefWorkKind, type Q4Answer, type BriefGoal,
  type AudienceSegment, type AudienceKnowledge, type DesiredFormat,
  type FormatExploration, type CommercialTie, type OwnProductKind,
  type OwnServiceKind, type CapabilityAnswer,
} from './api'
import type { Platform, VoiceProfile } from './types'
import type { CreatorProfileAnswers } from '@twinai/shared'

export const ONBOARDING_DRAFT_VERSION = 2
const KEY_PREFIX = 'twinai_onboarding_draft_v2:'
const LEGACY_VOICE_KEY = 'twinai_onboarding_voice_id'
const LEGACY_DRAFT_KEY = 'twinai_onboarding_draft_v1'
const PLATFORMS = new Set<Platform>(['tiktok', 'instagram', 'youtube', 'linkedin', 'other'])

export interface OnboardingDraft {
  version: typeof ONBOARDING_DRAFT_VERSION
  userId: string
  voiceId: string
  platform: Platform
  profile: VoiceProfile | null
  audience: string
  product: string
  goal: string
  // §8a.1's brief. `workKind` decides whether the claims question is asked at
  // all, and `forbiddenClaims` is the one answer no model can infer — see
  // packages/shared/src/preScriptBrief.ts.
  workKind: BriefWorkKind | null
  // ── THE SIX QUESTIONS ASKED WHILE THE SCAN RUNS ─────────────────────────
  //
  // ⚖️ THE CHOOSER THAT REPLACED A TEXT BOX. `audience` above is the free-text
  // field this supersedes; it stays because a draft written before this carries
  // a sentence somebody typed, and discarding an answer to make a migration
  // tidy is the one thing a migration may not do. New drafts fill `audienceSeg`
  // and the writer prefers it — see `compileCreatorProfile`.
  audienceSeg: AudienceSegment | null
  audienceKnowledge: AudienceKnowledge | null
  /** Up to two, and `[]` is a real answer meaning "asked, chose nothing". */
  contentGoals: BriefGoal[]
  desiredFormats: DesiredFormat[]
  formatExploration: FormatExploration | null
  commercialTies: CommercialTie[]
  ownProductKind: OwnProductKind | null
  ownServiceKind: OwnServiceKind | null
  // ⚠️ THREE-STATE, WHERE `canRecordScreen` AND `canFilmObjects` BELOW ARE
  // BOOLEANS. "Sometimes" is what most people mean and neither boolean could
  // hold it. The booleans are kept and DERIVED from these, because every
  // existing reader — the director's shot gate, the capability rows, the
  // brief — is written against them, and a rename that touches all of those in
  // one change is how a capability quietly flips for somebody who never
  // answered. yes → true, no → false, sometimes → null: no dependency, still
  // suggestible, which is exactly what null already meant.
  screenCapability: CapabilityAnswer | null
  productCapability: CapabilityAnswer | null
  // The sentence a creator types when no chip describes them. The contract has
  // required it for `other` since the brief was written and the UI never had a
  // box for it, so `other` reached the script as a word that describes nobody.
  // Free text, and the highest-signal answer in the set BECAUSE they typed it.
  workKindOther: string | null
  forbiddenClaims: string | null
  // Q4, REWRITTEN — what appears in these videos that the creator does NOT own.
  // Ownership itself is Q3's answer now (it mints the entity), so this no longer
  // re-asks it. A CHOOSER: §2.3's container routes branch on it, and null is a
  // real state meaning unanswered.
  q4: Q4Answer | null
  // DID THE CREATOR KEEP THE ENTITY Q3 MINTED FOR THEM?
  //
  // Three states, and the third is why this is not a boolean. `null` means Q3
  // minted nothing (a `creator`, a `brand`, an `other`) — which is a different
  // fact from a founder who looked at their minted product and said "that's not
  // right", and both are different from one who kept it.
  //
  // IT IS ALSO WHERE THE OLD `nothing_to_sell` LANDS. That answer drove a live
  // behaviour — "do not write a purchase or signup CTA at all" — and its
  // ownership half is superseded by Q3. Mapping it to `ownsEntity: false` keeps
  // the behaviour without inventing a second flag: no owned entity is minted,
  // so nothing downstream has anything to sell, which is precisely what they
  // asked for. A creator who says "actually, I do own one" is the only thing
  // that resumes it, which is the right hand to put that in.
  ownsEntity: boolean | null
  // §8a.3 Q6 — can the creator put a product or object in front of the camera?
  // THREE-STATE, and the third state is load-bearing: `can_film_objects = false`
  // permanently withholds footage suggestions, so "they never said" must never
  // become "they said no".
  canFilmObjects: boolean | null
  // WHETHER THE CREATOR TYPED THE OFFER, or left the scan's guess standing.
  //
  // §8a calls `offer` the highest-value field on the form BECAUSE it is
  // currently inferred: voice.ts's prompt forbids a blank, so the model must
  // produce something, and a guessed offer is a wrong call to action on every
  // video shipped. The value alone cannot tell those apart — this can, and
  // `dnaProvenance` needs it to decide whether the field may DECIDE anything.
  offerFromCreator: boolean
  // §2.2's `can_record_screen`, asked for the first time. THREE STATES, and the
  // draft has to carry all three: `true`, `false`, and `null` = not answered.
  //
  // A boolean here would make "skipped the question" indistinguishable from
  // "said no", and `can_record_screen = false` is what permanently hides a
  // capture surface from a creator who never said anything. See
  // packages/shared/src/editor/capabilities.ts — unset is not false.
  canRecordScreen: boolean | null
}

export function onboardingDraftKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

/**
 * The six answers, before anybody has answered them.
 *
 * ⚖️ ONE SOURCE, BECAUSE THREE LITERALS CONSTRUCT A DRAFT. A new field added to
 * the interface is a compile error in all three, and the temptation at that
 * point is to paste the defaults — after which the three copies drift, and the
 * one that drifts is a fresh draft claiming somebody answered something.
 *
 * Every default is the UNANSWERED value, never a plausible one: an empty list
 * here means "not asked yet", and the readers are written to tell that apart
 * from an explicit empty answer.
 */
export function emptyProfileAnswers(): Pick<OnboardingDraft,
  'audienceSeg' | 'audienceKnowledge' | 'contentGoals' | 'desiredFormats' |
  'formatExploration' | 'commercialTies' | 'ownProductKind' | 'ownServiceKind' |
  'screenCapability' | 'productCapability'> {
  return {
    audienceSeg: null,
    audienceKnowledge: null,
    contentGoals: [],
    desiredFormats: [],
    formatExploration: null,
    commercialTies: [],
    ownProductKind: null,
    ownServiceKind: null,
    screenCapability: null,
    productCapability: null,
  }
}

/** ⚖️ ONE HELPER PAIR RATHER THAN TEN INLINE `includes` CHECKS. The validation
 *  rule is identical for every chooser, and ten copies is ten chances for one of
 *  them to be written as a cast. */
function oneOf<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : null
}

/** ⚠️ FILTERS, NEVER REFUSES. One unrecognised entry must not discard the rest
 *  of somebody's answer, and a non-array is simply nothing chosen. */
function manyOf<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is T => typeof v === 'string' && (allowed as readonly string[]).includes(v))
}

function parseDraft(raw: string | null, userId: string): OnboardingDraft | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<OnboardingDraft>
    if (
      value.version !== ONBOARDING_DRAFT_VERSION ||
      value.userId !== userId ||
      !value.voiceId ||
      !value.platform ||
      !PLATFORMS.has(value.platform)
    ) return null
    return {
      version: ONBOARDING_DRAFT_VERSION,
      userId,
      voiceId: value.voiceId,
      platform: value.platform,
      profile: value.profile ?? null,
      audience: value.audience ?? value.profile?.audience ?? '',
      product: value.product ?? value.profile?.offer ?? '',
      goal: value.goal ?? '',
      workKind: value.workKind ?? null,
      // ⚠️ VALIDATED, NOT CAST — the same rule `q4` follows below, and for the
      // same reason: a draft is localStorage, so a hand-edited or stale value
      // would render as a selected chip and then travel into the brief as an
      // answer the creator never gave. A list filters to the members it
      // recognises rather than being refused whole, because one bad entry must
      // not discard five good ones.
      audienceSeg: oneOf(value.audienceSeg, AUDIENCE_SEGMENTS),
      audienceKnowledge: oneOf(value.audienceKnowledge, AUDIENCE_KNOWLEDGE),
      contentGoals: manyOf(value.contentGoals, BRIEF_GOALS),
      desiredFormats: manyOf(value.desiredFormats, DESIRED_FORMATS),
      formatExploration: oneOf(value.formatExploration, FORMAT_EXPLORATION),
      commercialTies: manyOf(value.commercialTies, COMMERCIAL_TIES),
      ownProductKind: oneOf(value.ownProductKind, OWN_PRODUCT_KINDS),
      ownServiceKind: oneOf(value.ownServiceKind, OWN_SERVICE_KINDS),
      screenCapability: oneOf(value.screenCapability, CAPABILITY_ANSWERS),
      productCapability: oneOf(value.productCapability, CAPABILITY_ANSWERS),
      workKindOther: typeof value.workKindOther === 'string' ? value.workKindOther : null,
      forbiddenClaims: value.forbiddenClaims ?? null,
      // VALIDATED, not cast. A draft is localStorage — a value outside the
      // vocabulary reaches the confirm screen as a selected chip and then the
      // brief, so an old or hand-edited draft could pick a container route the
      // creator never chose. `readStoredBrief` refuses it on the way back out
      // too; this refuses it before it can render as an answer.
      q4: (Q4_ANSWERS as readonly string[]).includes(value.q4 as string)
        ? (value.q4 as Q4Answer)
        // A DRAFT WRITTEN BEFORE THE SPLIT still carries the old three-value
        // `promotes`. Its third-party half maps across unchanged; its ownership
        // half is dropped because Q3 answers that better. Not re-asked.
        : (readLegacyPromotes((value as { promotes?: string }).promotes)?.q4 ?? null),
      ownsEntity: typeof value.ownsEntity === 'boolean'
        ? value.ownsEntity
        // `nothing_to_sell` becomes "owns nothing", which is the CTA suppression
        // it actually bought. Every other legacy value leaves this unanswered so
        // Q3's mint stands.
        : readLegacyPromotes((value as { promotes?: string }).promotes)?.ctaSuppressed ? false : null,
      // A REAL boolean or nothing — the same rule `canRecordScreen` follows one
      // line down. A draft written before the question existed has no opinion,
      // and `?? false` would manufacture one.
      canFilmObjects: typeof value.canFilmObjects === 'boolean' ? value.canFilmObjects : null,
      // Absent in a v2 draft written before the brief existed. FALSE is the
      // honest default: a draft that never recorded the distinction cannot
      // claim the creator typed it.
      offerFromCreator: value.offerFromCreator === true,
      // A REAL boolean or nothing. A draft written before the question existed
      // has no answer, and neither does one carrying `"yes"` from a hand-edited
      // sessionStorage entry — both are unanswered, never `false`.
      canRecordScreen: value.canRecordScreen === true ? true : value.canRecordScreen === false ? false : null,
    }
  } catch {
    return null
  }
}

// Reads only this user's state. A one-time legacy migration preserves an
// in-progress signup from the pre-v2 browser-wide keys, then removes those keys
// so a different account can never inherit the voice or Brand DNA.
export function readOnboardingDraft(storage: Storage, userId: string): OnboardingDraft | null {
  const current = parseDraft(storage.getItem(onboardingDraftKey(userId)), userId)
  if (current) return current

  const legacyVoiceId = storage.getItem(LEGACY_VOICE_KEY)
  if (!legacyVoiceId) return null
  let legacy: { platform?: Platform } = {}
  try { legacy = JSON.parse(storage.getItem(LEGACY_DRAFT_KEY) ?? '{}') } catch { /* invalid legacy draft */ }
  const platform = legacy.platform && PLATFORMS.has(legacy.platform) ? legacy.platform : 'instagram'
  // The v1 key carried no user id. Keep only the opaque voice id so the
  // owner-scoped server poll can rehydrate it under RLS; never copy locally
  // cached Brand DNA from an unattributable browser-wide draft.
  const migrated: OnboardingDraft = {
    version: ONBOARDING_DRAFT_VERSION,
    userId,
    voiceId: legacyVoiceId,
    platform,
    profile: null,
    audience: '',
    product: '',
    workKind: null,
    workKindOther: null,
    forbiddenClaims: null,
    ...emptyProfileAnswers(),
    q4: null,
    ownsEntity: null,
    canFilmObjects: null,
    offerFromCreator: false,
    canRecordScreen: null,
    goal: '',
  }
  writeOnboardingDraft(storage, migrated)
  storage.removeItem(LEGACY_VOICE_KEY)
  storage.removeItem(LEGACY_DRAFT_KEY)
  return migrated
}

export function writeOnboardingDraft(storage: Storage, draft: OnboardingDraft): void {
  storage.setItem(onboardingDraftKey(draft.userId), JSON.stringify(draft))
}

export function clearOnboardingDraft(storage: Storage, userId: string): void {
  storage.removeItem(onboardingDraftKey(userId))
  // Safe cleanup for users completing a legacy in-progress flow.
  storage.removeItem(LEGACY_VOICE_KEY)
  storage.removeItem(LEGACY_DRAFT_KEY)
}

/** The six onboarding answers, in the shape the shared readers expect.
 *
 *  ⚠️ LIFTED OUT OF `Onboarding.tsx` RATHER THAN RETYPED. Settings needs the same
 *  projection to report what Twin knows, and a second hand-written copy would
 *  drift the moment a question is added — the profile meter would then quietly
 *  measure a different set of answers from the one onboarding collects. */
export function profileAnswersOf(draft: OnboardingDraft): CreatorProfileAnswers {
  return {
    workKind: draft.workKind,
    audience: draft.audienceSeg,
    audienceKnowledge: draft.audienceKnowledge,
    contentGoals: draft.contentGoals,
    desiredFormats: draft.desiredFormats,
    formatExploration: draft.formatExploration,
    commercialTies: draft.commercialTies,
    ownProductKind: draft.ownProductKind,
    ownServiceKind: draft.ownServiceKind,
    canRecordScreen: draft.screenCapability,
    canShowProduct: draft.productCapability,
  }
}
