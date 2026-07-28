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
