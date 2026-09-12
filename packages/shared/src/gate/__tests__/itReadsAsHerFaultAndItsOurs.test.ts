// "WE COULD NOT READ ANY OF THE 6 VIDEOS WE LOOKED AT" — WHEN WE NEVER READ ONE.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-12: 60 Instagram profile fetches, 0 ok, 60
// errored, 0 transcripts. Every one carried the IDENTICAL message
// `no audio url found` — the Apify actor's own `errMsg`. Sixty different videos
// do not independently lose their audio on the same day; a 100% rate behind a
// single string is a contract that moved. Instagram references have NEVER
// reached a transcript.
//
// ⚠️ SO THE SENTENCE WAS FALSE IN THE DIRECTION THAT COSTS THE MOST. It implies
// six specific videos of hers were looked at and judged not clear enough. The
// truth is our side never read one. That is the sharpest version of a defect
// this file already fixed once, when the wording told creators to post
// differently to fix a detector failing on 10 of 10 accounts.
//
// ⚖️ AND THE FIX IS A CONFESSION WITH AN EXPIRY. `UNREADABLE_PLATFORMS` is meant
// to shrink: the moment the actor works, delete the entry and the honest
// sentence disappears with it.
import { describe, it, expect } from 'vitest'
import {
  messageForOwnAccount, platformIsUnreadable, UNREADABLE_PLATFORMS,
} from '../talkingHeadFit'
import { ownSampleCounts } from '../ownSampleRow'

const zero = { usable: 0, checked: 6, complete: true }

describe('a platform we cannot read is not a verdict on her videos', () => {
  it('names the limit and whose it is', () => {
    const m = messageForOwnAccount({ ...zero, platform: 'instagram' })
    expect(m.kind).toBe('none')
    expect(m.headline).toBe('Twin cannot read Instagram videos yet')
    expect(m.detail).toContain('limit on our side')
  })

  it('never reports our outage as her sample', () => {
    const m = messageForOwnAccount({ ...zero, platform: 'instagram' })
    // ⚠️ THE EXACT CLAIM THAT WAS WRONG: a count of HER videos, judged.
    expect(m.headline).not.toMatch(/we looked at/i)
    expect(m.headline).not.toMatch(/\b6\b/)
  })

  it('gives her nothing to do, because there is nothing she can do', () => {
    // ⚖️ AN INSTRUCTION BUILT ON OUR FAILURE IS WORSE THAN A REFUSAL — the file's
    // own note, learned the expensive way. No "post more", no "try again".
    const m = messageForOwnAccount({ ...zero, platform: 'instagram' })
    expect(`${m.headline} ${m.detail}`).not.toMatch(/post |scan again|try again|upload/i)
  })

  it('claims nothing about what Twin learned instead', () => {
    // ⚠️ THIS FUNCTION CANNOT SEE HER KNOWLEDGE STORE. A comforting "your
    // captions are what it learned from" would be a SECOND false statement on
    // the same card for a creator who has none.
    const m = messageForOwnAccount({ ...zero, platform: 'instagram' })
    expect(`${m.headline} ${m.detail}`).not.toMatch(/caption/i)
  })
})

describe('the excuse is narrow, which is what keeps it honest', () => {
  // ⚠️ THE NEGATIVE CONTROL THE CONFESSION MAKES NECESSARY. If an unreadable
  // platform silenced every zero, Twin would blame itself for real detector
  // failures on platforms it CAN read — and the true sentence would vanish.
  it('a readable platform still gets the measurement', () => {
    const m = messageForOwnAccount({ ...zero, platform: 'youtube' })
    expect(m.headline).toMatch(/we looked at/i)
    expect(m.headline).toContain('6')
  })

  it('an untold platform is treated as readable, never as an excuse', () => {
    // ⚖️ SILENCE MUST NOT MANUFACTURE A REASON FOR US. Absent means "not told".
    for (const p of [undefined, null, '', '   ']) {
      const m = messageForOwnAccount({ ...zero, platform: p })
      expect(m.headline, String(p)).toMatch(/we looked at/i)
    }
  })

  // ⚠️ TIKTOK IS DELIBERATELY NOT LISTED. It fails OFTEN (119 of 154 invisible
  // failures) but not ALWAYS — 807 assess jobs finished clean overall. "Often"
  // is a different sentence from "never", and listing it would excuse Twin from
  // a limit it does not have.
  it('only names platforms that have never worked', () => {
    expect([...UNREADABLE_PLATFORMS]).toEqual(['instagram'])
    expect(platformIsUnreadable('tiktok')).toBe(false)
    expect(platformIsUnreadable('youtube')).toBe(false)
  })

  it('matches case-insensitively, because a stored platform is not normalised everywhere', () => {
    expect(platformIsUnreadable('Instagram')).toBe(true)
    expect(platformIsUnreadable('  INSTAGRAM ')).toBe(true)
  })

  // ⚖️ AND IT ONLY SPEAKS AT ZERO. A creator whose Instagram somehow yielded a
  // usable video must hear the real number, not a blanket apology.
  it('says nothing special once anything was readable', () => {
    const m = messageForOwnAccount({ usable: 1, checked: 6, complete: true, platform: 'instagram' })
    expect(m.headline).toMatch(/we could only read 1/i)
  })
})

describe('the platform reaches the sentence, or none of this is real', () => {
  // ⚠️ THE HALF THAT MAKES IT WORK. A field the row never carries is this
  // repo's standing defect; asserting only the pure function would pass against
  // a system that never tells it the platform.
  it('ownSampleCounts carries the platform through', () => {
    expect(ownSampleCounts({
      own_sample_usable: 0, own_sample_checked: 6, own_sample_complete: true,
      platform: 'Instagram',
    })?.platform).toBe('instagram')
  })

  it('and leaves it undefined when the row does not say', () => {
    expect(ownSampleCounts({
      own_sample_usable: 0, own_sample_checked: 6, own_sample_complete: true,
    })?.platform).toBeUndefined()
    expect(ownSampleCounts({
      own_sample_usable: 0, own_sample_checked: 6, own_sample_complete: true, platform: '  ',
    })?.platform).toBeUndefined()
  })
})
