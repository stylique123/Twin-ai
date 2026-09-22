// "WE COULD NOT READ ANY OF THE 6 VIDEOS WE LOOKED AT" — WHEN WE NEVER READ ONE.
//
// ⚠️ THE ORIGINAL DEFECT, AND IT WAS REAL: a sentence implying six of HER videos
// were looked at and judged, when our side had read none. The fix was a
// confession with an expiry — `UNREADABLE_PLATFORMS` — and the rule that a
// platform earns its entry only by never having worked.
//
// ⚠️⚠️ AND THE CONFESSION OUTLIVED ITS EVIDENCE, WHICH COST MORE THAN THE
// SENTENCE EVER DID. Instagram was listed on a 2026-09-12 reading of "60 of 60
// failed, every one `no audio url found` — a contract that moved". Re-measured
// 2026-09-22, split by what the url actually points at:
//
//   url shape      attempts   clean   "no audio url"   "no speech"
//   hashtag page       109        0            109              0
//   /p/ post            51       22             13             15
//   /reel/               0        0              0              0
//
// The 109 are `explore/tags/` BROWSE PAGES. There is no video on one, so the
// Actor's "no audio url found" is correct every time — and we read a correct
// answer about hashtag pages as a verdict on the whole platform. Real posts
// transcribe 22 times out of 51, today included. Not one `/reel/` has ever been
// submitted, so "reels cannot be read" was never measured at all.
//
// ⚖️ THE ENTRY DID NOT JUST MISSPEAK, IT CLOSED THE DOOR. `V2Building` reads
// this list and HALTS BEFORE ANY ATTEMPT, so every Instagram reference was
// refused unread. Instagram was not failing; it was never being tried.
//
// ⚖️ SO THE LIST IS EMPTY, AND THESE TESTS NOW GUARD THE MECHANISM RATHER THAN
// ITS ONE OCCUPANT. Every quality rule the confession had to satisfy is
// iterated over whatever is listed — vacuous while nothing is, and live again
// the moment a platform genuinely dies.
import { describe, it, expect } from 'vitest'
import {
  messageForOwnAccount, platformIsUnreadable, UNREADABLE_PLATFORMS,
} from '../talkingHeadFit'
import { ownSampleCounts } from '../ownSampleRow'

const zero = { usable: 0, checked: 6, complete: true }

describe('instagram is not on the list, because it works', () => {
  it('no longer claims Twin cannot read Instagram', () => {
    // ⚠️ THE SENTENCE A CREATOR ACTUALLY SAW, NOW FALSE AND GONE.
    const m = messageForOwnAccount({ ...zero, platform: 'instagram' })
    expect(m.headline).not.toMatch(/cannot read Instagram/i)
    expect(platformIsUnreadable('instagram')).toBe(false)
    expect(platformIsUnreadable('Instagram')).toBe(false)
  })

  it('gives her the real measurement instead of a blanket apology', () => {
    // ⚖️ A ZERO ON A PLATFORM WE CAN READ IS A MEASUREMENT, and she is owed it.
    const m = messageForOwnAccount({ ...zero, platform: 'instagram' })
    expect(m.headline).toMatch(/we looked at/i)
    expect(m.headline).toContain('6')
  })

  it('the list is empty, and the mechanism survives it', () => {
    expect([...UNREADABLE_PLATFORMS]).toEqual([])
    expect(platformIsUnreadable('tiktok')).toBe(false)
    expect(platformIsUnreadable('youtube')).toBe(false)
  })
})

describe('whatever IS confessed to must still be confessed to honestly', () => {
  // ⚠️ THESE ARE VACUOUS TODAY AND THAT IS DELIBERATE. They iterate the list, so
  // adding a platform tomorrow re-arms every rule the confession was held to,
  // rather than shipping a fresh excuse with no guard on its wording.
  it('names the limit as ours, and never her sample', () => {
    for (const p of UNREADABLE_PLATFORMS) {
      const m = messageForOwnAccount({ ...zero, platform: p })
      expect(m.kind, p).toBe('none')
      expect(m.detail, p).toContain('limit on our side')
      // The exact claim that was wrong: a count of HER videos, judged.
      expect(m.headline, p).not.toMatch(/we looked at/i)
      expect(m.headline, p).not.toMatch(/\b6\b/)
    }
  })

  it('gives her nothing to do, because there is nothing she can do', () => {
    // ⚖️ AN INSTRUCTION BUILT ON OUR FAILURE IS WORSE THAN A REFUSAL.
    for (const p of UNREADABLE_PLATFORMS) {
      const m = messageForOwnAccount({ ...zero, platform: p })
      expect(`${m.headline} ${m.detail}`, p).not.toMatch(/post |scan again|try again|upload/i)
    }
  })

  it('only speaks at zero — anything readable gets the real number', () => {
    for (const p of UNREADABLE_PLATFORMS) {
      const m = messageForOwnAccount({ usable: 1, checked: 6, complete: true, platform: p })
      expect(m.headline, p).toMatch(/we could only read 1/i)
    }
  })
})

describe('the excuse is narrow, which is what keeps it honest', () => {
  // ⚠️ THE NEGATIVE CONTROL. If an unreadable platform silenced every zero, Twin
  // would blame itself for real detector failures on platforms it CAN read.
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

  it('still normalises case, so a listed platform cannot be missed by spelling', () => {
    // ⚖️ THE COMPARISON STAYS CASE- AND SPACE-INSENSITIVE even with nothing
    // listed: a stored platform is not normalised everywhere, and the bug that
    // would hide a real confession is spelling, not logic.
    expect(platformIsUnreadable('  TIKTOK ')).toBe(false)
    expect(platformIsUnreadable('YouTube')).toBe(false)
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
