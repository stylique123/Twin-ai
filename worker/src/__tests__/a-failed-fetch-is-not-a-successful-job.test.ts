// THE 154 FAILURES A QUEUE COUNT COULD NOT SEE.
//
// Every string in this file is a REAL `result.error` value read off production
// on 2026-08-30, truncated only where the column truncates. They are here so
// the classifier is tested against what the world actually sent us rather than
// against what a reasonable person would guess it sends.
import { describe, it, expect } from 'vitest'
import { classifyReferenceFailure, isFetchDefect } from '../jobs/referenceOutcome.js'

/** Verbatim from `jobs.result->>'error'`, production, 2026-08-30. */
const REAL = {
  tiktokIpBlocked: 'yt-dlp exited 1: ERROR: [TikTok] 7673269173270629665: Your IP address is blocked from accessing this post',
  tiktokUnexpected: 'yt-dlp exited 1: ERROR: [TikTok] 7212817288800521515: Unexpected the response',
  tiktokWarning: 'yt-dlp exited 1: WARNING: [TikTok] The extractor is attempting to use an alternative method',
  instagramNoAudio: 'This Instagram video could not be read: no audio url found',
  noCaptions: 'This video has no captions we can read. Try a different reference.',
  missingModule: 'python3 exited 2: transcribe_forced_align unavailable: No module named torch',
} as const

describe('classifyReferenceFailure, on strings production actually produced', () => {
  it('separates an IP block from every other TikTok failure', () => {
    // ⚠️ THE ONE THAT DECIDES WHETHER THE BACKLOG IS WORTH RUNNING. 48 of the
    // 154 said this. It is the only class where the video is fine, our binary
    // is fine, and the single thing wrong is which address we came from — so
    // filing it under a generic TikTok bucket would hide the one fix that works.
    expect(classifyReferenceFailure(REAL.tiktokIpBlocked)).toBe('blocked_by_host')
  })

  it('does not let the yt-dlp prefix swallow the reason', () => {
    // Both of these are yt-dlp errors and both are TikTok, and they need
    // different responses. A `includes('yt-dlp')` test placed first would call
    // all three of them the same thing.
    expect(classifyReferenceFailure(REAL.tiktokIpBlocked)).toBe('blocked_by_host')
    expect(classifyReferenceFailure(REAL.tiktokUnexpected)).toBe('extractor_stale')
    expect(classifyReferenceFailure(REAL.tiktokWarning)).toBe('extractor_stale')
  })

  it('calls a missing python module ours, not the video\'s', () => {
    expect(classifyReferenceFailure(REAL.missingModule)).toBe('our_config')
    expect(isFetchDefect('our_config')).toBe(true)
  })

  it('treats a video with no speech as a finding, NOT a fetch defect', () => {
    // ⚖️ THE DISTINCTION THIS FILE EXISTS FOR. Six of the 154 were read
    // perfectly and simply had nothing to transcribe. Counting them as fetch
    // failures would inflate the number used to decide whether fetching is
    // broken — the exact error this work is correcting, pointed the other way.
    expect(classifyReferenceFailure(REAL.noCaptions)).toBe('no_speech')
    expect(isFetchDefect('no_speech')).toBe(false)
  })

  it('never guesses at an unrecognised reason', () => {
    // An unclassified message quietly becoming `extractor_stale` would send
    // someone upgrading yt-dlp to fix an IP block.
    expect(classifyReferenceFailure('something nobody has seen yet')).toBe('unknown')
    expect(classifyReferenceFailure('')).toBe('unknown')
    expect(classifyReferenceFailure(null)).toBe('unknown')
    expect(classifyReferenceFailure(undefined)).toBe('unknown')
    expect(isFetchDefect('unknown')).toBe(false)
  })

  it('is case-insensitive, because yt-dlp is not consistent about it', () => {
    expect(classifyReferenceFailure(REAL.tiktokIpBlocked.toUpperCase())).toBe('blocked_by_host')
  })

  it('classifies an Instagram missing-audio as the extractor, not the video', () => {
    // The video exists and plays in a browser; our extractor could not find the
    // audio URL. That is ours to fix, so it counts as a fetch defect.
    expect(classifyReferenceFailure(REAL.instagramNoAudio)).toBe('extractor_stale')
    expect(isFetchDefect('extractor_stale')).toBe(true)
  })
})

// ⚠️ THE GUARD THAT KEEPS THIS TRUE. A discriminator present on three of four
// exits is worse than none: `count(*) where outcome = 'assessed'` would look
// authoritative and quietly undercount by whichever path forgot it. This reads
// the handler's source and fails if any `return` out of it lacks an `outcome`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

describe('every exit from assessReference declares an outcome', () => {
  it('has no return statement without one', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(join(here, '../jobs/assessReference.ts'), 'utf8')

    // The handler starts at its exported entry point; everything above it is
    // helpers with their own contracts.
    const start = src.indexOf('export async function handleAssessReference')
    expect(start).toBeGreaterThan(-1)
    const body = src.slice(start)

    // Only `return {` — an object literal is what becomes `jobs.result`. Bare
    // `return` and `return someVar` are not result-shaped and are not the thing
    // this guard is about.
    //
    // ⚠️ BRACE-MATCHED, NOT REGEXED. The first version of this guard used a
    // bounded lazy regex and found TWO of the four returns, because the success
    // object is longer than the window — so it would have passed while checking
    // half the exits. A guard that silently inspects less than it claims is the
    // same defect as the one this file is about.
    const returns: string[] = []
    for (let i = body.indexOf('return {'); i !== -1; i = body.indexOf('return {', i + 1)) {
      let depth = 0
      let end = i
      for (let j = body.indexOf('{', i); j < body.length; j++) {
        if (body[j] === '{') depth++
        else if (body[j] === '}') { depth--; if (depth === 0) { end = j; break } }
      }
      returns.push(body.slice(i, end + 1))
    }
    expect(returns.length).toBeGreaterThanOrEqual(4)

    const missing = returns.filter((r) => !r.includes('outcome:'))
    expect(missing, `return(s) with no outcome:\n${missing.join('\n---\n')}`).toEqual([])
  })
})
