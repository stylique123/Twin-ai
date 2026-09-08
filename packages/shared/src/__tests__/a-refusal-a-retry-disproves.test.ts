import { describe, it, expect } from 'vitest'
import {
  REFERENCE_REASON_TEXT, assessReference, mayUseReference,
} from '../editor/referenceCheck'

/**
 * ⚠️ TWIN TOLD CREATORS "NOBODY SPEAKS IN THIS ONE" ABOUT VIDEOS OF PEOPLE
 * TALKING, and a retry of the same link disproved it.
 *
 * `wordCount === 0` cannot tell a silent video apart from a transcript that
 * came back empty, and MEASURED it is almost always the second: across 1,188
 * `assess_reference` jobs, 154 finished with an error set and only SIX were
 * genuine no-speech. The other 148 were fetch, auth or extractor failures —
 * 119 of them TikTok.
 *
 * ⚖️ §7c IS ALREADY IN THAT FILE'S HEADER: Twin may say what it CHECKED, never
 * what a video IS. The rule was written down and then broken two paragraphs
 * later, which is why this is a test and not a comment.
 */

/** Phrases that assert a property of the creator's video rather than a
 *  property of our read. Each one is a claim a retry can disprove. */
const CLAIMS_ABOUT_THEIR_VIDEO = [
  /\bnobody speaks\b/i,
  /\bthere is no speech\b/i,
  /\bthis (?:video )?has no\b/i,
  /\bthere is very little speech\b/i,
  /\bis silent\b/i,
]

describe('a refusal a retry disproves', () => {
  it('no reason text claims a property of the creator\'s video', () => {
    const offenders: string[] = []
    for (const [reason, text] of Object.entries(REFERENCE_REASON_TEXT)) {
      for (const claim of CLAIMS_ABOUT_THEIR_VIDEO) {
        if (claim.test(text)) offenders.push(`${reason}: "${text}"`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('the two read-derived reasons say what WE did', () => {
    // ⚖️ NOT MERELY "does not say nobody speaks". The sentence has to name the
    // actor, or a future rewrite satisfies the check above by going passive —
    // "no speech was found" is the same evasion in a quieter voice.
    expect(REFERENCE_REASON_TEXT.no_speech).toMatch(/^We did not find/)
    expect(REFERENCE_REASON_TEXT.sparse_speech).toMatch(/^We found/)
  })

  it('the guard catches the sentence that shipped', () => {
    // The exact copy this replaced, so the check is proven on a real case
    // rather than on one invented to pass.
    const shipped = 'Nobody speaks in this one, so there is no script for us to learn from.'
    expect(CLAIMS_ABOUT_THEIR_VIDEO.some((r) => r.test(shipped))).toBe(true)
  })

  it('a DURATION refusal is left alone, and that distinction is the point', () => {
    // ⚠️ NOT EVERY REFUSAL IS DISPROVABLE. How long a video runs is a stable
    // fact about it — a retry returns the same number — so "this one is long"
    // is a measurement we may state. Rewording it would be cargo-culting the
    // fix onto a case that never had the bug.
    expect(REFERENCE_REASON_TEXT.too_long).toMatch(/This one is long/)
    expect(REFERENCE_REASON_TEXT.too_short).toMatch(/This one is too brief/)
  })

  it('the verdict itself is unchanged — this is the wording, not the rule', () => {
    // A zero-word read is still not usable as a script to follow. Saying so
    // honestly does not mean pretending we can use it.
    const a = assessReference({ durationSec: 30, wordCount: 0 })
    expect(a.reason).toBe('no_speech')
    expect(mayUseReference(a)).toBe(false)
  })

  it('an unmeasured read is still not a refusal', () => {
    // Withholding on no evidence is the same overreach as accepting on none.
    const a = assessReference({ durationSec: null, wordCount: null })
    expect(a.verdict).toBe('unknown')
    expect(mayUseReference(a)).toBe(true)
  })
})
