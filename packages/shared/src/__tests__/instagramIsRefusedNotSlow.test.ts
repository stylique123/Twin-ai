// SHE WAITED 72 SECONDS TO BE TOLD THE READ WAS SLOW, FOR A READ THAT WAS NEVER
// GOING TO RETURN.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-12: Instagram is 60 of 60 attempts failed,
// 0 transcripts ever, every one carrying the identical `no audio url found`
// from the Apify actor. A 100% rate behind a single message is a contract that
// moved, and the outcome is certain from the first second.
//
// ⚠️ WHAT SHE GOT WAS `read_timed_out`, AND IT WAS FALSE TWICE OVER. It
// described OUR session limit rather than what happened, and it arrived only
// after the full poll — the same shape as the quota case this file already
// records: "a wrong cause that sends someone to spend their afternoon".
//
// ⚠️ AND THE SUPPORTED-PLATFORM SENTENCE NAMED INSTAGRAM AS WATCHABLE, so a
// creator who read it was sent BY US to fetch a link from the one platform
// guaranteed to fail.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REFERENCE_UNREAD_TEXT } from '../referenceAnalysis'
import { platformIsUnreadable } from '../gate/talkingHeadFit'

const BUILDING = readFileSync(
  join(import.meta.dirname, '..', '..', '..', '..',
    'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx'), 'utf8')

describe('the sentence says what happened and whose limit it is', () => {
  it('names the platform and our side', () => {
    const t = REFERENCE_UNREAD_TEXT.platform_unreadable
    expect(t).toMatch(/Instagram/)
    expect(t).toMatch(/on our side/i)
  })

  it('does not describe our session limit', () => {
    // ⚠️ THE EXACT FAILURE: "taking longer to read than we can hold you here
    // for" is a fact about our poll window, not about her link.
    expect(REFERENCE_UNREAD_TEXT.platform_unreadable).not.toMatch(/taking longer|hold you here/i)
  })

  it('offers the thing that actually works instead of "try again"', () => {
    // ⚖️ NOTHING SHE CAN DO CHANGES OUR ACTOR, so "try again later" would be a
    // false instruction. A different platform is a real way forward.
    const t = REFERENCE_UNREAD_TEXT.platform_unreadable
    expect(t).toMatch(/TikTok|YouTube/)
    expect(t).not.toMatch(/try again/i)
  })
})

describe('the supported list stops advertising a platform that has never worked', () => {
  it('no longer names Instagram as watchable', () => {
    expect(REFERENCE_UNREAD_TEXT.unsupported_host).not.toMatch(/Instagram/)
  })

  it('still names the two that do work', () => {
    // ⚖️ A LIST THAT NAMES NOTHING would be a worse sentence, not a safer one.
    expect(REFERENCE_UNREAD_TEXT.unsupported_host).toMatch(/TikTok/)
    expect(REFERENCE_UNREAD_TEXT.unsupported_host).toMatch(/YouTube/)
  })
})

describe('the build stops before the wait, not after it', () => {
  // ⚠️ THE PART THAT CANNOT BE DEFENDED IS THE WAITING. Knowing the answer and
  // polling for 72 seconds anyway costs her time to tell her something we knew
  // at the start.
  it('halts on an unreadable platform', () => {
    expect(BUILDING).toMatch(/platformIsUnreadable\(platformFromUrl\(refUrl\)\)/)
    expect(BUILDING).toMatch(/halt\('platform_unreadable'\)/)
  })

  it('does so before the poll that would have timed out', () => {
    const halt = BUILDING.indexOf("halt('platform_unreadable')")
    const poll = BUILDING.indexOf("unread = 'read_timed_out'")
    expect(halt, 'the halt is missing').toBeGreaterThan(-1)
    expect(poll, 'the poll default is missing').toBeGreaterThan(-1)
    expect(halt, 'the halt happens after the poll starts').toBeLessThan(poll)
  })

  // ⚖️ AND IT LIFTS ITSELF. `UNREADABLE_PLATFORMS` is a confession meant to
  // shrink: deleting the one entry restores Instagram here and on the account
  // card together. A hard-coded check in this file would have to be found and
  // removed separately, and would be missed.
  it('reads the shared list rather than hard-coding the platform', () => {
    const line = BUILDING.slice(
      BUILDING.indexOf("if (refUrl && platformIsUnreadable"),
      BUILDING.indexOf('\n', BUILDING.indexOf("if (refUrl && platformIsUnreadable")))
    expect(line).not.toMatch(/instagram/i)
    expect(platformIsUnreadable('instagram')).toBe(true)
  })

  // ⚠️ THE NEGATIVE CONTROL. A halt that fired for everyone would "fix" this by
  // refusing every reference, and every case above would still pass.
  it('does not refuse the platforms that do work', () => {
    for (const p of ['tiktok', 'youtube']) {
      expect(platformIsUnreadable(p), p).toBe(false)
    }
  })
})
