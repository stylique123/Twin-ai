// TWO FALSE CLAIMS ABOUT REFERENCE READS, BOTH MEASURED, BOTH PINNED HERE.
//
// ⚠️ ONE ASKED FOR A CREATOR-FACING SENTENCE THAT IS NOT TRUE. A session report
// inferred a duration ceiling "between 48 and 118 seconds, reproducible" from
// four references, and asked for the timeout message to read "Twin reads up to
// about 60 seconds — try a shorter one."
//
// Measured on production 2026-09-15 across 454 reference transcripts, all
// carrying a duration: median 56s, p90 210s, p99 1329s, max 2536s; 196 longer
// than 60s, 91 longer than 118s, 22 longer than 300s. A ceiling means nothing
// above it passes, and NINETY-ONE references longer than the failing one were
// read. The sentence would have told creators to shorten videos while 196
// successful reads sat above the number we quoted.
//
// ⚠️ THE OTHER ARGUED FOR GIVING UP ON A WORKING PATH. "Instagram: 0
// transcripts ever" is false — 39 exist, 31 in August, newest 2026-09-01,
// while TikTok and YouTube kept climbing through September. Instagram worked
// and stopped on a date, which makes it recoverable rather than permanent.
//
// ⚖️ THIS FILE CHANGES NO BEHAVIOUR. It pins the reasoning so the next
// revision cannot quietly restore either framing, and asserts the timeout
// message stays as it is — there is no true duration sentence to replace it
// with, and naming a limit we cannot measure is the defect the comment exists
// to prevent.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { REFERENCE_UNREAD_TEXT } from '../referenceAnalysis'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SRC = readFileSync(join(REPO, 'packages/shared/src/referenceAnalysis.ts'), 'utf8')

/** Code only — the notes QUOTE the sentences they forbid, so a raw grep would
 *  find the false wording inside the prose explaining why it is false. */
function code(): string {
  return SRC.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
}

describe('the timeout message names our wait, never a length limit', () => {
  it('says nothing about the video being too long or needing to be shorter', () => {
    const msg = REFERENCE_UNREAD_TEXT.read_timed_out
    expect(msg).toMatch(/longer to read/)
    // The three shapes the disproven ceiling would have produced.
    expect(msg).not.toMatch(/shorter/i)
    expect(msg).not.toMatch(/\b\d+\s*(seconds|minutes|sec|min)\b/i)
    expect(msg).not.toMatch(/too long/i)
  })

  it('no reference length ceiling exists anywhere in this module', () => {
    const body = code()
    expect(body).not.toMatch(/MAX_REFERENCE_(SEC|DURATION)/)
    expect(body).not.toMatch(/REFERENCE_MAX_SEC/)
    expect(body).not.toMatch(/maxReferenceSec/)
  })

  it('the measurement that refutes the ceiling is recorded with its figures', () => {
    // Anchored on the numbers, not the prose: 91 over the failing duration is
    // the whole refutation, and 454 is its denominator.
    expect(SRC).toMatch(/454 reference transcripts/)
    expect(SRC).toMatch(/91 longer than 118s/)
    expect(SRC).toMatch(/max 2536s/)
  })

  it('and names what is still unmeasured, so absence is not read as zero', () => {
    // `transcripts` holds successes only, so a duration-correlated FAILURE RATE
    // is untested. Saying so is what stops this becoming "long videos are fine".
    expect(SRC).toMatch(/only reads that SUCCEEDED/)
  })
})

describe('Instagram is recorded as broken on a date, not as never working', () => {
  it('keeps the 60-of-60 failure cohort', () => {
    expect(SRC).toMatch(/60 of 60 attempts failed/)
  })

  it('records the 39 transcripts that disprove "never"', () => {
    expect(SRC).toMatch(/39 Instagram rows/)
    expect(SRC).toMatch(/newest\n?\s*\*?\s*2026-09-01/)
  })

  // ⚠️ THIS ASSERTION WAS WRONG ON ITS FIRST RUN, IN THE EXACT WAY THIS REPO
  // KEEPS GETTING BITTEN. A bare `not.toMatch(/0 transcripts ever/)` matched
  // the CORRECTION — the comment whose whole job is to say that phrasing was
  // wrong. Stripping comments is no answer either, because the framing being
  // guarded against lives in comments.
  //
  // ⚖️ SO IT REQUIRES THE PHRASE TO APPEAR ONLY INSIDE ITS OWN RETRACTION.
  // Reinstating "0 transcripts ever" as a live claim adds an occurrence that
  // is not followed by WAS WRONG, and that is what fails.
  it('the "never once" framing appears only inside its own retraction', () => {
    const hits = SRC.match(/0 TRANSCRIPTS EVER[^]{0,40}/gi) ?? []
    expect(hits.length, 'the retraction itself is gone').toBeGreaterThan(0)
    for (const h of hits) {
      expect(h, `an un-retracted claim came back: ${h}`).toMatch(/WAS\s+WRONG/i)
    }
    // The old headline asserted it as fact with no retraction anywhere.
    expect(SRC).not.toMatch(/NEVER SUCCESSFULLY READ/)
  })

  it('records that our own reader did not change across the break', () => {
    expect(SRC).toMatch(/has not changed\n?\s*\*?\s*since 2026-06-14/)
    expect(SRC).toMatch(/THREE DAYS AFTER/)
  })

  it('the creator-facing sentence still promises nothing it cannot keep', () => {
    // ⚠️⚠️ IT NO LONGER NAMES INSTAGRAM, because naming it was the false part.
    // Measured 2026-09-22: 22 of 51 real `/p/` posts read clean. The sentence
    // survives for a platform that genuinely dies later; the wording rules it
    // had to satisfy are unchanged and still asserted.
    const msg = REFERENCE_UNREAD_TEXT.platform_unreadable
    expect(msg).not.toMatch(/cannot read Instagram/)
    expect(msg).toMatch(/limit on our side/)
    expect(msg).not.toMatch(/try again/i)
  })
})
