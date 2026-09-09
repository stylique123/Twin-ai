import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scannedAudienceFacts, audienceFactConfirmed } from '../audienceRecognition'

/**
 * ⚠️ 45 OF 47 VOICES ALREADY CARRY BOTH ANSWERS, MEASURED IN PRODUCTION.
 *
 * The DNA synthesis has inferred `audience_pain` and `dream_outcome` all along,
 * and the values are real: the bakery's pain reads "Feeling overwhelmed by the
 * unseen business backend (licensing, pricing, branding)…" and the physio's
 * dream "Returning to sports, training, and daily hobbies completely pain-free".
 * The ONLY reader was `generate-blueprint`'s prompt.
 *
 * ⚖️ SO "0 STATED, 34 GUESSED" WAS NEVER A FAILURE TO INFER. It was the creator
 * never being shown the inference. A generator producing four chips per niche
 * would throw away a better answer to ask a worse question.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const ONBOARDING = readFileSync(join(REPO, 'apps/web/src/pages/Onboarding.tsx'), 'utf8')
const DRAFT = readFileSync(join(REPO, 'apps/web/src/lib/onboardingDraft.ts'), 'utf8')

// The bakery's real stored values.
const BAKERY = {
  audience_pain: 'Feeling overwhelmed by the unseen business backend (licensing, pricing, branding) and believing they lack the perfect kitchen setup to start.',
  dream_outcome: 'Confidently launching a profitable home-based microbakery selling out artisan sourdough loaves without expensive commercial equipment.',
}

describe('the scan already knows who they are', () => {
  it('offers both, in the order a video is built', () => {
    // ⚠️ PAIN THEN DREAM: what they are stuck on decides the hook, what they
    // want decides the payoff.
    const facts = scannedAudienceFacts(BAKERY)
    expect(facts.map((f) => f.field)).toEqual(['audience_pain', 'dream_outcome'])
    expect(facts[0]!.text).toBe(BAKERY.audience_pain)
  })

  it('quotes the scan verbatim rather than paraphrasing it', () => {
    // ⚖️ A paraphrase would ask them to agree to something the writer never
    // reads — the writer reads `audience_pain`, so that is what is shown.
    expect(scannedAudienceFacts(BAKERY)[0]!.text).toBe(BAKERY.audience_pain)
  })

  it('says nothing when the scan has nothing', () => {
    // ⚠️ TWO ACCOUNTS IN PRODUCTION HAVE NEITHER. For them the screen must fall
    // back to asking, never to an empty card.
    expect(scannedAudienceFacts(null)).toEqual([])
    expect(scannedAudienceFacts({})).toEqual([])
    expect(scannedAudienceFacts({ audience_pain: '   ' })).toEqual([])
    expect(scannedAudienceFacts({ audience_pain: 42 })).toEqual([])
  })

  it('a fragment is not an inference', () => {
    // "Your people are stuck on: beginners. Right?" is worse than asking.
    expect(scannedAudienceFacts({ audience_pain: 'beginners' })).toEqual([])
  })

  it('confirmation is the TEXT, so a re-scan cannot inherit an agreement', () => {
    // ⚠️ THE REASON THIS IS NOT A BOOLEAN. A flag would survive a re-scan that
    // changed the sentence underneath it, leaving "confirmed" attached to words
    // nobody read.
    const fact = scannedAudienceFacts(BAKERY)[0]!
    expect(audienceFactConfirmed(BAKERY.audience_pain, fact)).toBe(true)
    expect(audienceFactConfirmed('something the scan used to say', fact)).toBe(false)
    expect(audienceFactConfirmed(null, fact)).toBe(false)
    expect(audienceFactConfirmed('', fact)).toBe(false)
  })

  it('the screen asks, and declining records nothing', () => {
    expect(ONBOARDING).toContain('scannedAudienceFacts(draft.profile)')
    expect(ONBOARDING).toContain("Yes, that's them")
    expect(ONBOARDING).toContain('Not quite')
    // ⚠️ NO "THEY SAID NO" VALUE. A rejected guess is not an answer about their
    // audience, so declining writes null rather than a marker.
    expect(ONBOARDING).toContain('{ confirmedAudiencePain: null }')
  })

  it('a confirmation nothing reads is the defect it was built to fix', () => {
    // ⚖️ THE SUMMARY IS THE READER: what Twin believed is now what the creator
    // has agreed to, and the chip is where they see it stuck.
    expect(ONBOARDING).toContain("draft.confirmedAudiencePain ? 'Their problem — confirmed' : ''")
    expect(ONBOARDING).toContain("draft.confirmedDreamOutcome ? 'What they want — confirmed' : ''")
  })

  it('a restored draft is untrusted input', () => {
    // Free text from localStorage, capped like `handle`.
    expect(DRAFT).toContain('value.confirmedAudiencePain.slice(0, 400)')
    expect(DRAFT).toContain('value.confirmedDreamOutcome.slice(0, 400)')
  })
})
