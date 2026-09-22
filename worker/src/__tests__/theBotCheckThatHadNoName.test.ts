// EVERY "NOT OBSERVED" ROW ON THE REFERENCE PANEL TRACES TO ONE UNNAMED ERROR.
//
// ⚠️⚠️ THE REPORT: a creator's reference panel shows `Platform`, `Observed
// format`, `Why it works` and `Story` filled in — and then:
//
//   Shot choices   NOT OBSERVED   We did not analyse the video —
//   Camera work    NOT OBSERVED   your brand default is used instead.
//   Framing        NOT OBSERVED
//
// Those three come from the VISUAL pass, which needs frames, which needs a
// download. Measured 2026-09-22 across every assessment:
//
//   visual pass ran ................  871
//   visual pass did not ............ 1676
//     UNKNOWN_DOWNLOAD_FAILURE ..... 1666   (99.4%, newest today)
//     everything else ..............   10
//
// ⚖️ A SINGLE CODE AT 99.4% IS A SIGNATURE, NOT 1,666 INDEPENDENT ACCIDENTS —
// the same shape as the Instagram misread, one layer down.
//
// ── WHAT THE RESIDUE SAID ─────────────────────────────────────────────────
//
// `unmapped_detail` exists to keep what the classifier could not name. Only 4
// of 432 stored rows carry it (the field postdates the rest), and all four say
// the SAME thing:
//
//   ERROR: [youtube] <id>: Sign in to confirm you’re not a bot.
//   Use --cookies-from-browser or --cookies for the authentication.
//
// ⚠️ THE CODES WERE TIKTOK-SHAPED AND YOUTUBE'S SENTENCE MATCHED NONE. The
// file's own comment predicted this exact outcome: "forty rows inside
// UNKNOWN_DOWNLOAD_FAILURE are invisible."
//
// ⚖️ AND THE CONSEQUENCE WAS NOT JUST A BAD LABEL — IT WAS A REFUSAL TO RETRY.
// UNKNOWN is not in `RETRYABLE_VIA_PROXY`, on the sound reasoning that "we do
// not know why this failed is not evidence that an IP would fix it". Correct
// rule, wrong input: this failure is an IP-reputation verdict, the residential
// proxy is built for precisely it, and it has never once been asked.
import { describe, expect, it } from 'vitest'
import {
  classifyDownloadFailure, mayRetryViaProxy, DOWNLOAD_FAILURES, RETRYABLE_VIA_PROXY,
} from '../downloadFailure.js'

/** The production string, byte for byte — CURLY apostrophe included. */
const PRODUCTION = 'yt-dlp exited 1: ay also be missing\n'
  + 'ERROR: [youtube] 9GgoNpZJCus: Sign in to confirm you’re not a bot. '
  + 'Use --cookies-from-browser or --cookies for the authentication.\n'

describe('the sentence that cost the visual pass', () => {
  it('is recognised instead of landing in UNKNOWN', () => {
    expect(classifyDownloadFailure(PRODUCTION)).toBe('HOST_BOT_CHECK')
    expect(classifyDownloadFailure(PRODUCTION)).not.toBe('UNKNOWN_DOWNLOAD_FAILURE')
  })

  it('⚠️ matches the CURLY apostrophe production actually sends', () => {
    // A rule written against U+0027 matches nothing here and reviews clean.
    expect(PRODUCTION).toContain('’')
    expect(classifyDownloadFailure("Sign in to confirm you’re not a bot")).toBe('HOST_BOT_CHECK')
    expect(classifyDownloadFailure("Sign in to confirm you're not a bot")).toBe('HOST_BOT_CHECK')
  })

  it('now earns the proxy retry it was never refused on the merits', () => {
    // ⚖️ THE FILE'S OWN BAR: "positively identified as access/challenge/
    // reputation". A bot check is the textbook case, and this is the only class
    // a different egress can fix.
    expect(mayRetryViaProxy('HOST_BOT_CHECK')).toBe(true)
    expect(RETRYABLE_VIA_PROXY.has('HOST_BOT_CHECK')).toBe(true)
  })
})

describe('and it does not widen into things a proxy cannot fix', () => {
  it('⚠️ a login wall is still about the VIDEO, not about our IP', () => {
    // ORDER IS LOAD-BEARING: the bot-check sentence contains "Sign in", so the
    // two rules overlap. Tested in the wrong order, every bot check would file
    // as PRIVATE_OR_UNAVAILABLE and become permanently unretryable.
    for (const raw of [
      'ERROR: [instagram] login required to view this post',
      'ERROR: This video is unavailable',
      'ERROR: You do not have permission to view this post. Log into an account that has access.',
      'ERROR: account is private',
    ]) {
      expect(classifyDownloadFailure(raw), raw).toBe('PRIVATE_OR_UNAVAILABLE')
      expect(mayRetryViaProxy(classifyDownloadFailure(raw)), raw).toBe(false)
    }
  })

  it('an empty or unrecognised error is still UNKNOWN, and still not payable', () => {
    // ⚖️ THE DUMPING-GROUND RULE SURVIVES. Naming one failure must not turn the
    // unknown bucket into a licence to spend.
    expect(classifyDownloadFailure('')).toBe('UNKNOWN_DOWNLOAD_FAILURE')
    expect(classifyDownloadFailure('something nobody has seen before')).toBe('UNKNOWN_DOWNLOAD_FAILURE')
    expect(mayRetryViaProxy('UNKNOWN_DOWNLOAD_FAILURE')).toBe(false)
  })

  it('⚠️ does not match on yt-dlp\'s generic cookies advice, which walls carry too', () => {
    // MY FIRST DRAFT DID, AND AN EXISTING TEST CAUGHT IT. yt-dlp appends
    // "Use --cookies-from-browser or --cookies for the authentication" to LOGIN
    // WALLS as well as to bot checks. Matching on it made a private TikTok
    // payable — the exact spend the allowlist exists to prevent. The bot-check
    // SENTENCE is the signal; the advice line is noise on both.
    const wall = 'yt-dlp exited 1: ERROR: [TikTok] 7654886192583806239: This post may not be '
      + 'comfortable for some audiences. Log in for access. '
      + 'Use --cookies-from-browser or --cookies for the authentication.'
    expect(classifyDownloadFailure(wall)).toBe('PRIVATE_OR_UNAVAILABLE')
    expect(mayRetryViaProxy(classifyDownloadFailure(wall))).toBe(false)
  })

  it('the new code is a declared member, not a string that only exists here', () => {
    expect(DOWNLOAD_FAILURES).toContain('HOST_BOT_CHECK')
    expect(DOWNLOAD_FAILURES).toContain(classifyDownloadFailure(PRODUCTION))
  })
})
