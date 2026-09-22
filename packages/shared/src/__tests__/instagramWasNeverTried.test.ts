// "TWIN CANNOT READ INSTAGRAM VIDEOS YET" — WHILE INSTAGRAM WAS READING FINE.
//
// ⚠️⚠️ THE REPORT, VERBATIM FROM A CREATOR PASTING AN INSTAGRAM LINK:
//
//   "Twin cannot read Instagram videos yet — that is a limit on our side, not
//    your link. A TikTok or YouTube link will work. No remix was used."
//
// It was not a read that failed. `V2Building` checked `UNREADABLE_PLATFORMS`
// and HALTED BEFORE ANY ATTEMPT. Instagram was not failing; it was never being
// tried, and had not been for weeks.
//
// ── WHY THE ENTRY EXISTED, AND WHY IT WAS WRONG ───────────────────────────
//
// Measured 2026-09-22, every Instagram reference attempt in production, split
// by what the url actually points at:
//
//   url shape      attempts   clean   "no audio url"   "no speech"
//   hashtag page       109        0            109              0
//   /p/ post            51       22             13             15
//   /reel/               0        0              0              0
//
// ⚖️ THE 109 ARE `explore/tags/...` BROWSE PAGES. There is no video on one, so
// "no audio url found" is the Actor answering CORRECTLY — 109 times. That
// correct answer about browse pages was read as a verdict on the platform, and
// the platform was closed on the strength of it.
//
// ⚠️ THE REPO GOT HALFWAY AND STOPPED. An earlier correction already recorded
// "57 of 60 are HASHTAG BROWSE PAGES, ZERO are reels" — then kept the entry
// anyway, reasoning "we have never once ASKED for a reel, and absent is not
// zero". That was right at the time. It is spent now: 51 real posts HAVE been
// asked and 22 came back clean, today included.
//
// ⚖️ SO THE SPLIT IS BY URL, NOT BY PLATFORM. A browse page gets a sentence she
// can act on in five seconds; a post gets a real attempt. The old behaviour
// refused 22 working reads to avoid 109 links that were never videos.
import { describe, expect, it } from 'vitest'
import {
  isSingleVideoUrl, platformIsUnreadable, UNREADABLE_PLATFORMS,
  REFERENCE_UNREAD_TEXT, remixOffer,
} from '../index'

describe('a real Instagram post is tried, not refused', () => {
  it('posts and reels are single videos', () => {
    for (const u of [
      'https://www.instagram.com/p/DVowGPikYmg/',
      'https://instagram.com/reel/DXVdxUMsO3S/',
      'https://www.instagram.com/reels/abc123/',
      'https://www.instagram.com/tv/xyz789/',
    ]) {
      expect(isSingleVideoUrl(u), u).toBe(true)
    }
  })

  it('nothing about the platform is refused up front any more', () => {
    expect(platformIsUnreadable('instagram')).toBe(false)
    expect([...UNREADABLE_PLATFORMS]).toEqual([])
    expect(remixOffer('instagram').kind).toBe('offer')
  })
})

describe('a browse page is refused, because it genuinely has no video', () => {
  it('hashtag, explore and bare profile urls are not single videos', () => {
    for (const u of [
      'https://www.instagram.com/explore/tags/candlemaking/',   // 109 of these
      'https://www.instagram.com/explore/',
      'https://www.instagram.com/firo.candles/',
      'https://instagram.com/',
    ]) {
      expect(isSingleVideoUrl(u), u).toBe(false)
    }
  })

  it('tells her what to paste instead, which the platform ban never did', () => {
    const t = REFERENCE_UNREAD_TEXT.not_a_single_video
    expect(t).toMatch(/hashtag or profile/i)
    expect(t).toMatch(/post or reel/i)
    // ⚖️ NEVER A JUDGEMENT ABOUT HER VIDEO — there isn't one to judge.
    expect(t).not.toMatch(/\bbad\b|unclear|low quality/i)
  })
})

describe('the rule is narrow, because only Instagram was measured', () => {
  it('TikTok and YouTube links are never second-guessed', () => {
    // ⚠️ INVENTING PATTERNS FOR FAILURES NOBODY HAS PRODUCED is how the rule
    // being replaced here got written. A platform with no evidence gets a real
    // attempt.
    for (const u of [
      'https://www.tiktok.com/@someone/video/123',
      'https://www.tiktok.com/tag/candles',
      'https://www.youtube.com/watch?v=abc',
      'https://www.youtube.com/results?search_query=candles',
      'https://youtu.be/abc',
    ]) {
      expect(isSingleVideoUrl(u), u).toBe(true)
    }
  })

  it('an unparseable or empty string is not judged a browse page', () => {
    // ⚖️ ABSENT IS NOT A HASHTAG PAGE. Only a url we can read and recognise as
    // a browse surface earns the refusal.
    expect(isSingleVideoUrl('not a url at all')).toBe(true)
    expect(isSingleVideoUrl(null)).toBe(false)
    expect(isSingleVideoUrl('')).toBe(false)
  })

  it('does not mistake a post id containing the word explore', () => {
    expect(isSingleVideoUrl('https://www.instagram.com/p/explore123/')).toBe(true)
  })
})
