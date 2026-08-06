import type { BriefWorkKind } from './api'
import type { Platform, VoiceProfile } from './types'

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
  forbiddenClaims: string | null
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
      forbiddenClaims: value.forbiddenClaims ?? null,
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
    forbiddenClaims: null,
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
