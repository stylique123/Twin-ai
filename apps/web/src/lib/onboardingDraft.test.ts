import { describe, expect, it } from 'vitest'
import {
  clearOnboardingDraft,
  onboardingDraftKey,
  readOnboardingDraft,
  writeOnboardingDraft,
  type OnboardingDraft,
} from './onboardingDraft'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const draft = (userId = 'user-a'): OnboardingDraft => ({
  version: 2,
  userId,
  voiceId: 'voice-a',
  platform: 'instagram',
  workKind: null, workKindOther: null,
  forbiddenClaims: null,
  promotes: null,
  canFilmObjects: null,
  offerFromCreator: false,
  canRecordScreen: null,
  profile: null,
  audience: '',
  product: '',
  goal: '',
})

describe('user-scoped onboarding draft', () => {
  it('resumes only the matching account', () => {
    const storage = new MemoryStorage()
    writeOnboardingDraft(storage, draft())
    expect(readOnboardingDraft(storage, 'user-a')).toEqual(draft())
    expect(readOnboardingDraft(storage, 'user-b')).toBeNull()
  })

  it('rejects corrupt or mismatched stored state', () => {
    const storage = new MemoryStorage()
    storage.setItem(onboardingDraftKey('user-a'), JSON.stringify({ ...draft(), userId: 'user-b' }))
    expect(readOnboardingDraft(storage, 'user-a')).toBeNull()
  })

  it('migrates only the server-verifiable voice id from old browser-wide keys', () => {
    const storage = new MemoryStorage()
    storage.setItem('twinai_onboarding_voice_id', 'legacy-voice')
    storage.setItem('twinai_onboarding_draft_v1', JSON.stringify({
      voiceId: 'legacy-voice',
      platform: 'youtube',
      profile: { niche: 'design', audience: 'founders', offer: 'course' },
      goal: 'grow',
    }))
    const migrated = readOnboardingDraft(storage, 'user-a')
    expect(migrated).toMatchObject({
      version: 2,
      userId: 'user-a',
      voiceId: 'legacy-voice',
      platform: 'youtube',
      profile: null,
      audience: '',
      product: '',
      goal: '',
      canRecordScreen: null,
    })
    expect(storage.getItem('twinai_onboarding_voice_id')).toBeNull()
    expect(storage.getItem('twinai_onboarding_draft_v1')).toBeNull()
  })

  // `can_record_screen` has three states and the draft is the first place they
  // can be lost. A draft written before the question existed, and one carrying
  // anything that is not a real boolean, are both UNANSWERED — never `false`,
  // which is the value that would permanently hide the capture surface.
  it('keeps an unanswered screen-recording question unanswered', () => {
    const storage = new MemoryStorage()
    const { canRecordScreen: _omitted, ...withoutTheAnswer } = draft()
    storage.setItem(onboardingDraftKey('user-a'), JSON.stringify(withoutTheAnswer))
    expect(readOnboardingDraft(storage, 'user-a')?.canRecordScreen).toBeNull()

    storage.setItem(onboardingDraftKey('user-a'), JSON.stringify({ ...draft(), canRecordScreen: 'yes' }))
    expect(readOnboardingDraft(storage, 'user-a')?.canRecordScreen).toBeNull()
  })

  it('round-trips both real answers', () => {
    const storage = new MemoryStorage()
    for (const answer of [true, false] as const) {
      writeOnboardingDraft(storage, { ...draft(), canRecordScreen: answer })
      expect(readOnboardingDraft(storage, 'user-a')?.canRecordScreen).toBe(answer)
    }
  })

  it('clears only the completing account draft', () => {
    const storage = new MemoryStorage()
    writeOnboardingDraft(storage, draft('user-a'))
    writeOnboardingDraft(storage, draft('user-b'))
    clearOnboardingDraft(storage, 'user-a')
    expect(readOnboardingDraft(storage, 'user-a')).toBeNull()
    expect(readOnboardingDraft(storage, 'user-b')).toEqual(draft('user-b'))
  })
})
