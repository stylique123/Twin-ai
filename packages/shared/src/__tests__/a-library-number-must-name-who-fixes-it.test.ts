// "49% FAILED" IS FOUR PROBLEMS WEARING ONE NUMBER.
//
// ⚠️ THE REAL PRODUCTION SHAPE, 2026-08-19. 70 of the 158 failures are a
// fixable runtime defect (curl-cffi missing from the worker image). 79 are
// music-led or text-led TikToks with no speech — NOT failures, but real content
// the transcript pass is the wrong instrument for. A single rate argues for
// excluding a quarter of TikTok from a creator-video product.
import { describe, expect, it } from 'vitest'
import {
  classifyReference, tally, usableCount, LIBRARY_HEALTH, HEALTH_OWNER,
} from '../referenceLibraryHealth'

describe('each bucket names a different owner', () => {
  it('a clean read is readable', () => {
    expect(classifyReference({ error: null })).toBe('transcript_readable')
    expect(classifyReference({ error: '' })).toBe('transcript_readable')
  })

  it('no speech is a VISUAL CANDIDATE, never a failure', () => {
    // ⚠️ 79 production rows. Calling these broken is how a product decides to
    // throw away a quarter of its own medium.
    for (const e of [
      'no_speech: transcript was 3 characters',
      'This video has no captions we can read. Try a different reference.',
      'This Instagram video has no speech we can read.',
    ]) {
      expect(classifyReference({ error: e }), e).toBe('visual_only_candidate')
    }
  })

  it('impersonation and fetch problems are OURS and fixable', () => {
    for (const e of [
      'The extractor is attempting impersonation, but no impersonate target is available',
      'curl_cffi unavailable',
      'This Instagram video could not be read: no audio url found',
      'download failed',
      'request timed out',
    ]) {
      expect(classifyReference({ error: e }), e).toBe('downloader_failure')
    }
  })

  it('prefers the normalised code over the prose when the row carries one', () => {
    // ⚠️ THE DEFERRAL THIS FILE'S HEADER RECORDED IS OVER. `failure_code` now
    // exists and is populated, so who fixes a reference no longer depends on
    // yt-dlp's wording surviving an upstream edit.
    expect(classifyReference({ error: 'anything at all', failureCode: 'TIKTOK_CHALLENGE_FAILED' }))
      .toBe('downloader_failure')
    expect(classifyReference({ error: 'anything at all', failureCode: 'MEDIA_NOT_FOUND' }))
      .toBe('unsupported_or_unavailable')
  })

  it('separates a blocked IP from a broken image, because only one is buyable', () => {
    // ⚖️ THE NUMBER THAT DECIDES A PURCHASE. "How many references would a
    // different IP recover?" is exactly the size of route_blocked; pooling it
    // with downloader_failure makes that question unanswerable.
    expect(classifyReference({ error: 'x', failureCode: 'TIKTOK_IP_BLOCKED' })).toBe('route_blocked')
    expect(classifyReference({ error: 'x', failureCode: 'IMPERSONATION_UNAVAILABLE' })).toBe('downloader_failure')
    // ⚠️ A PROXY THAT REFUSED IS NOT THE HOST BLOCKING US. Filing it as
    // route_blocked would inflate the case for buying more proxy using failures
    // the proxy itself caused.
    expect(classifyReference({ error: 'x', failureCode: 'PROXY_TRANSPORT_FAILED' })).toBe('downloader_failure')
  })

  it('an untranslated status asks for no work until somebody translates it', () => {
    expect(classifyReference({ error: 'x', failureCode: 'TIKTOK_STATUS_UNMAPPED' }))
      .toBe('unsupported_or_unavailable')
    expect(classifyReference({ error: 'x', failureCode: 'UNKNOWN_DOWNLOAD_FAILURE' }))
      .toBe('unsupported_or_unavailable')
  })

  it('an unmapped code falls through to prose rather than inventing a bucket', () => {
    expect(classifyReference({ error: 'no audio url found', failureCode: 'SOMETHING_NEW' }))
      .toBe('downloader_failure')
    expect(classifyReference({ error: 'weird', failureCode: 'SOMETHING_NEW' }))
      .toBe('unsupported_or_unavailable')
  })

  it('still reads a silent video as visual-only even when a code is present', () => {
    // ⚠️ THE ORDERING THAT MATTERS. A no_speech row's DOWNLOAD SUCCEEDED — there
    // was nothing to hear — so the error IS the finding and the code is not the
    // field to read. This is the bucket that is the whole argument for #56.
    expect(classifyReference({ error: 'no_speech: transcript was 3 characters', failureCode: null }))
      .toBe('visual_only_candidate')
  })

  it('legacy rows with no code keep working, because most of the library is legacy', () => {
    expect(classifyReference({ error: 'no impersonate target is available' })).toBe('downloader_failure')
    expect(classifyReference({ error: null })).toBe('transcript_readable')
  })

  it('an UNRECOGNISED error asks for no work rather than pretending to be fixable', () => {
    // ⚖️ The matching is on human sentences and is fragile against rewording.
    // An unmatched error must never masquerade as something we know how to fix,
    // because that would put phantom work on somebody's list.
    expect(classifyReference({ error: 'something nobody has seen before' }))
      .toBe('unsupported_or_unavailable')
  })

  it('never attempted is not a result', () => {
    // ⚠️ 3,974 of 4,297 gallery URLs. In a success rate they read as failures;
    // in "healthy" they vanish. They are backlog and must be their own bucket.
    expect(classifyReference({ attempted: false })).toBe('not_attempted')
  })

  it('every bucket says who fixes it, which is the point of the classification', () => {
    for (const k of LIBRARY_HEALTH) {
      expect(HEALTH_OWNER[k], k).toBeTruthy()
      expect(HEALTH_OWNER[k].length, k).toBeGreaterThan(10)
    }
  })
})

describe('the production shape, reconstructed', () => {
  const rows = [
    ...Array.from({ length: 161 }, () => ({ error: null })),
    ...Array.from({ length: 79 }, () => ({ error: 'no_speech: transcript was 3 characters' })),
    ...Array.from({ length: 70 }, () => ({ error: 'no impersonate target is available' })),
    ...Array.from({ length: 4 }, () => ({ error: null })),
    ...Array.from({ length: 6 }, () => ({ error: 'This video has no captions we can read.' })),
    ...Array.from({ length: 3 }, () => ({ error: 'could not be read: no audio url found' })),
  ]

  it('splits the single 49% failure rate into actionable parts', () => {
    const t = tally(rows)
    expect(t.transcript_readable).toBe(165)
    expect(t.visual_only_candidate).toBe(85)
    expect(t.downloader_failure).toBe(73)
    expect(t.unsupported_or_unavailable).toBe(0)
  })

  it('shows the frames pass converting held inventory into usable inventory', () => {
    // ⚖️ The same rows, no re-scraping — 165 usable today, 250 the day #56
    // ships. That is the number that justifies building it.
    const t = tally(rows)
    expect(usableCount(t, { framesPassLive: false })).toBe(165)
    expect(usableCount(t, { framesPassLive: true })).toBe(250)
  })

  it('does not assume the frames pass exists', () => {
    // ⚠️ Hard-coding either answer would state a roadmap as a fact.
    const t = tally(rows)
    expect(usableCount(t, { framesPassLive: false }))
      .toBeLessThan(usableCount(t, { framesPassLive: true }))
  })
})
