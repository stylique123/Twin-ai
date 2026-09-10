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

// ── AND THEN THE ANSWER DIED IN THE TAB ───────────────────────────────────
//
// ⚠️⚠️ EVERY TEST ABOVE PASSED WHILE THE CONFIRMATION WAS BEING DISCARDED. They
// assert the card renders, the draft field is set, and the sentence is quoted
// verbatim — all true, and none of them follows the answer past `sessionStorage`.
// `savePreScriptBrief` named every other draft field and not these two, so
// "Yes, that's them" survived exactly as long as the tab did.
//
// ⚖️ THIS IS THE FAILURE `preScriptBrief.ts` ALREADY DESCRIBES IN ITS OWN
// COMMENT — "a key in BRIEF_STORED_KEYS that the write path does not name is
// stored in name only" — reached through a different door: here the key was not
// in BRIEF_STORED_KEYS either, and the screen wrote to a draft nobody drained.
import {
  BRIEF_STORED_KEYS, sanitizeBriefForWrite, readStoredBrief,
} from '../preScriptBrief'

const PAIN = 'Feeling overwhelmed by the unseen business backend (licensing, pricing, branding).'
const DREAM = 'Confidently launching a profitable home-based microbakery without commercial equipment.'

describe('a confirmation reaches the database', () => {
  it('survives the one function that writes', () => {
    // ⚠️⚠️ THE LOAD-BEARING ASSERTION, and the one that caught `onCamera` when
    // the same thing happened to it. A field can have a question, a draft slot,
    // a stored key, a migration and a reader and still never be written.
    const out = sanitizeBriefForWrite({
      confirmedAudiencePain: PAIN, confirmedDreamOutcome: DREAM,
    })
    expect(out.confirmedAudiencePain).toBe(PAIN)
    expect(out.confirmedDreamOutcome).toBe(DREAM)
  })

  it('is in the stored vocabulary, so it reads back', () => {
    expect([...BRIEF_STORED_KEYS]).toContain('confirmedAudiencePain')
    expect([...BRIEF_STORED_KEYS]).toContain('confirmedDreamOutcome')
    expect(readStoredBrief({ confirmedAudiencePain: PAIN }).confirmedAudiencePain).toBe(PAIN)
  })

  it('the onboarding call names them', () => {
    // ⚖️ ASSERTED ON THE CALL SITE because that is exactly where the defect was:
    // every layer either side of it already existed and agreed.
    const call = ONBOARDING.slice(ONBOARDING.indexOf('await savePreScriptBrief('))
    expect(call.slice(0, 2000)).toMatch(/confirmedAudiencePain: draft\.confirmedAudiencePain/)
    expect(call.slice(0, 2000)).toMatch(/confirmedDreamOutcome: draft\.confirmedDreamOutcome/)
  })
})

describe('declining still records nothing', () => {
  it('"Not quite" stores no key at all', () => {
    // ⚠️⚠️ ABSENT AND REFUSED MUST STAY THE SAME STORED STATE. A stored empty
    // string would read as an answer to every consumer, and an inference the
    // creator REJECTED would then count as one she agreed to — the exact
    // inversion this card exists to prevent.
    expect(sanitizeBriefForWrite({ confirmedAudiencePain: null })).toEqual({})
    expect(sanitizeBriefForWrite({ confirmedAudiencePain: '  ' })).toEqual({})
    expect('confirmedAudiencePain' in sanitizeBriefForWrite({ confirmedDreamOutcome: DREAM }))
      .toBe(false)
  })

  it('an answerless call still writes nothing', () => {
    expect(sanitizeBriefForWrite({
      confirmedAudiencePain: null, confirmedDreamOutcome: null,
    })).toEqual({})
  })
})

describe('the sentence is stored, never a flag', () => {
  it('what is written is the text the creator agreed to', () => {
    // ⚖️ `audienceFactConfirmed` COMPARES ON THE TEXT for a stated reason: a
    // re-scan that changes the sentence means she confirmed something else. A
    // boolean would silently transfer her agreement onto words she never read,
    // so the stored value must be the sentence itself.
    const stored = sanitizeBriefForWrite({ confirmedAudiencePain: PAIN })
    expect(typeof stored.confirmedAudiencePain).toBe('string')
    expect(stored.confirmedAudiencePain).not.toBe(true)
    const fact = { field: 'audience_pain' as const, text: PAIN, question: 'q' }
    expect(audienceFactConfirmed(String(stored.confirmedAudiencePain), fact)).toBe(true)
    expect(audienceFactConfirmed(String(stored.confirmedAudiencePain),
      { ...fact, text: 'a re-scan produced this different sentence' })).toBe(false)
  })
})
