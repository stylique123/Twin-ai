// WHAT A TRANSCRIPT COST HAS TO SURVIVE THE FUNCTION THAT SPENT IT.
//
// ⚠️ THE YOUTUBE BUDGET QUESTION WAS UNANSWERABLE, AND NOT FOR LACK OF DATA.
// `transcribeFromUrl` tries free captions and falls back to a paid Actor on any
// thrown error. It knew which branch ran, every single time, and told nobody: one
// `console.error` on the fallback, nothing on success, no column, no counter. The
// information existed at the moment of spending and was dropped one line later.
//
// ⚖️ SO THE GUARD IS ON THE TWO SEAMS, NOT ON THE PRICES. Whether YouTube captions
// exist 90% or 30% of the time is a fact about YouTube that no test can assert.
// What a test CAN hold is that the route is stamped where it is known, and tallied
// where it is stored — which is exactly the pair that was missing.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const MEDIA = readFileSync(join(SRC, 'media.ts'), 'utf8')
const VOICE = readFileSync(join(SRC, 'jobs', 'voice.ts'), 'utf8')
const HELPER = readFileSync(join(SRC, '..', 'youtube_transcript.py'), 'utf8')

describe('every route stamps what it was', () => {
  it('stamps both YouTube branches differently', () => {
    expect(MEDIA).toMatch(/source: 'youtube_captions_free'/)
    expect(MEDIA).toMatch(/source: 'youtube_captions_paid'/)
  })

  it('stamps the paid and the free local routes too', () => {
    // ⚠️ A PARTIAL STAMP IS WORSE THAN NONE. If only YouTube were marked, every
    // tally would show unrecorded rows for the other platforms and read as a
    // measurement gap rather than as a design.
    expect(MEDIA).toMatch(/source: 'instagram_paid'/)
    expect(MEDIA).toMatch(/source: 'local_whisper'/)
  })
})

describe('a paid YouTube call records WHY it was paid', () => {
  it('separates "no captions" from "our side broke"', () => {
    // These imply opposite actions: one caps the budget, the other inflates the
    // bill while looking identical in a total.
    expect(MEDIA).toMatch(/paidBecause: PaidBecause = \/NO_CAPTIONS\/\.test\(why\) \? 'no_captions' : 'free_path_failed'/)
  })

  it('reads a signal the helper actually emits', () => {
    // ⚠️ THE MARKER MUST EXIST AT BOTH ENDS. A regex matching a string the Python
    // helper never prints would classify every real absence as a failure, and the
    // resulting number would look plausible forever.
    expect(HELPER).toMatch(/NO_CAPTIONS/)
  })
})

describe('the tally is stored, not logged', () => {
  it('counts routes in the job result', () => {
    expect(VOICE).toMatch(/bump\(t\.source \?\? 'unrecorded'\)/)
    expect(VOICE).toMatch(/routes,/)
  })

  it('treats an unstamped transcript as unrecorded, not as free', () => {
    expect(VOICE).toMatch(/\?\? 'unrecorded'/)
    expect(VOICE).not.toMatch(/\?\? 'youtube_captions_free'/)
  })

  it('carries the DENOMINATOR, so a ratio is computable', () => {
    // ⚖️ `videos_used` ALONE ANSWERS NOTHING. Three transcripts out of three
    // attempts and three out of twenty-five are the same number, and the budget
    // question is entirely about which one happened.
    expect(VOICE).toMatch(/attempted: urls\.length/)
  })

  it('counts a failure apart from a success, because it may already have paid', () => {
    expect(VOICE).toMatch(/bump\('failed'\)/)
  })
})
