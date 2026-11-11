import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { otherPlatforms, PLATFORM_LABEL, READABLE_PLATFORMS } from '../scanFailure'

// ⚠️ THE RECOVERY EXISTED AND COST THE CREATOR THE TYPING. After a failure that
// was OURS, the advice was "try another platform" and the only route there was
// Back, re-pick a platform, and retype the handle from memory. We had the handle
// the whole time — it just was not kept anywhere the failure screen could see.

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const read = (...p: string[]) => readFileSync(join(repo, ...p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const onboarding = strip(read('apps', 'web', 'src', 'pages', 'Onboarding.tsx'))
const draftLib = strip(read('apps', 'web', 'src', 'lib', 'onboardingDraft.ts'))

describe('the handle is kept', () => {
  it('the draft carries it', () => {
    expect(draftLib).toMatch(/\bhandle:\s*string\b/)
  })

  // ⚖️ VALIDATED AND CAPPED ON THE WAY BACK OUT, like every other free-text
  // field: a draft is localStorage and is not a trusted source.
  it('it is validated and length-capped when read back', () => {
    expect(draftLib).toMatch(/typeof value\.handle === 'string' \? value\.handle\.slice\(0, 120\) : ''/)
  })

  it('the legacy v1 migration leaves it empty rather than inventing one', () => {
    expect(draftLib).toMatch(/handle: '',/)
  })

  it('starting a draft records what they typed', () => {
    expect(onboarding).toMatch(/handle: handle\.trim\(\)\.slice\(0, 120\)/)
  })
})

describe('one tap goes somewhere else', () => {
  it('the failure screen offers a button per remaining platform', () => {
    // ⚖️ PART 2: the failure is shown on the handle screen itself (Connect
    // board), so one tap picks the platform with the handle still in the box.
    expect(onboarding).toMatch(/const others = otherPlatforms\(platform\)/)
    expect(onboarding).toMatch(/others\.map\(\(p\) => \(\s*<button[^>]*onClick=\{\(\) => pick\(p\)\}/)
  })

  it('the handle screen is seeded from the retry', () => {
    expect(onboarding).toMatch(/seed=\{retrySeed\}/)
    expect(onboarding).toMatch(/useState\(seed\?\.handle \?\? ''\)/)
    expect(onboarding).toMatch(/useState<Platform>\(seed\?\.platform \?\? 'instagram'\)/)
  })

  // ⚠️ THE DEAD SCAN MUST BE DROPPED FIRST. Leaving the failed voiceId on the
  // draft is what used to resume straight back into the scan that already
  // failed — the trap #504 fixed, and it would return through this new door.
  it('the failed scan is forgotten before going back', () => {
    const fn = onboarding.slice(onboarding.indexOf('const scanFailed = useCallback'))
    const at = fn.indexOf('setMode(\'handle\')')
    expect(at).toBeGreaterThan(-1)
    expect(fn.slice(0, at)).toMatch(/forgetDeadScan\(\)/)
  })
})

describe('no handle means no button, and that is deliberate', () => {
  // ⚖️ AN OLDER DRAFT PREDATES THE FIELD AND CARRIES ''. A one-tap retry that
  // silently lands on an empty box is worse than the sentence it replaced.
  // ⚖️ PART 2: there is no separate failure screen to land on empty any more.
  // The failure shows on the handle screen, seeded from the draft's handle, so
  // an old draft with '' lands on an empty box the creator can see and fill.
  it('the failure goes back to the handle screen seeded from the draft', () => {
    expect(onboarding).toMatch(/setRetrySeed\(\{ handle: draft\?\.handle \?\? '', platform: draft\?\.platform \?\? 'instagram' \}\)/)
    expect(onboarding).toMatch(/failure=\{scanFailureShown\}/)
  })
})

describe('one spelling of each platform', () => {
  // ⚠️ THE BUTTON AND THE SENTENCE MUST AGREE. Two label maps is how "TikTok"
  // and "Tiktok" end up on the same screen.
  it('the label map is shared, not copied into the page', () => {
    expect(onboarding).toMatch(/PLATFORM_LABEL\[p\]/)
    expect(onboarding).not.toMatch(/'TikTok'|'YouTube'/)
  })

  it('every readable platform has a label', () => {
    for (const p of READABLE_PLATFORMS) {
      expect(PLATFORM_LABEL[p], p).toBeTruthy()
    }
  })

  it('a failed platform never appears among its own alternatives', () => {
    for (const p of READABLE_PLATFORMS) expect(otherPlatforms(p)).not.toContain(p)
  })
})
