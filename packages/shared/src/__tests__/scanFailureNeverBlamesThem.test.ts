import { describe, it, expect } from 'vitest'
import {
  SCAN_FAILURE_CAUSES, scanFailure, readScanFailure, isOurFailure,
  otherPlatforms, READABLE_PLATFORMS, type ScanFailureCause,
} from '../scanFailure'

// ⚠️ THE REAL CASE THIS EXISTS FOR. A large, unambiguously PUBLIC Instagram
// account failed to read and the screen suggested it "may be private". Twin's
// retriever had failed. The creator was handed a reason to go and check their
// own settings for a problem that was ours.

describe('the word "private" appears only when the platform said private', () => {
  // ⚠️ THE CENTRAL MUTATION: someone adds "it may be private" to a failure
  // message as a helpful hint. It is not a hint, it is an assertion about
  // something we did not observe.
  it('no OUR-side failure mentions privacy at all', () => {
    for (const c of SCAN_FAILURE_CAUSES) {
      if (!isOurFailure(c)) continue
      expect(scanFailure(c).message.toLowerCase(), `${c} mentions privacy`)
        .not.toMatch(/privat/)
    }
  })

  it('ACCOUNT_PRIVATE does say it, because the platform did', () => {
    expect(scanFailure('ACCOUNT_PRIVATE').message.toLowerCase()).toMatch(/private/)
  })

  // ⚖️ AND IT MUST BE REACHABLE ONLY DELIBERATELY. If an unrecognised value could
  // land on ACCOUNT_PRIVATE, the rule above would be decorative.
  it('an unrecognised cause never becomes ACCOUNT_PRIVATE', () => {
    for (const junk of ['', 'private', 'PRIVATE', 'account_private', null, undefined, 0, {}]) {
      expect(readScanFailure(junk).cause).toBe('UNKNOWN')
    }
  })

  it('a recognised cause survives the coercion unchanged', () => {
    for (const c of SCAN_FAILURE_CAUSES) expect(readScanFailure(c).cause).toBe(c)
  })
})

describe('a failure that is ours does not ask the creator to fix it', () => {
  // ⚠️ OFFERING A FIX FOR OUR PROBLEM IS BLAME WEARING HELPFULNESS. "Check your
  // privacy settings" for a failed fetch sends them somewhere pointless AND
  // implies they caused it.
  it('creatorCanFix is false for every failure on our side', () => {
    for (const c of SCAN_FAILURE_CAUSES) {
      if (isOurFailure(c)) expect(scanFailure(c).creatorCanFix, c).toBe(false)
    }
  })

  it('and true for the ones they really can act on', () => {
    for (const c of ['HANDLE_NOT_FOUND', 'ACCOUNT_PRIVATE', 'NO_RECENT_CONTENT'] as ScanFailureCause[]) {
      expect(scanFailure(c).creatorCanFix, c).toBe(true)
    }
  })

  // ⚖️ THE SPLIT MUST BE REAL, NOT A LABEL. If every cause were "ours", the
  // assertion above would pass while saying nothing.
  it('both sides of the split are populated', () => {
    const ours = SCAN_FAILURE_CAUSES.filter(isOurFailure)
    const theirs = SCAN_FAILURE_CAUSES.filter((c) => !isOurFailure(c))
    expect(ours.length).toBeGreaterThan(1)
    expect(theirs.length).toBeGreaterThan(1)
  })
})

describe('a scan failure is never a dead end', () => {
  // ⚖️ THE OWNER'S CASE: Instagram failed, YouTube worked. Failing the whole
  // onboarding on one platform throws away a voice we could have read.
  it('every cause offers another platform', () => {
    for (const c of SCAN_FAILURE_CAUSES) {
      expect(scanFailure(c).tryAnotherPlatform, c).toBe(true)
    }
  })

  it('our failures are worth retrying and their facts are not', () => {
    expect(scanFailure('SCRAPER_FAILED').worthRetrying).toBe(true)
    expect(scanFailure('RATE_LIMITED').worthRetrying).toBe(true)
    // Retrying a handle that does not exist just spends the creator's patience.
    expect(scanFailure('HANDLE_NOT_FOUND').worthRetrying).toBe(false)
    expect(scanFailure('ACCOUNT_PRIVATE').worthRetrying).toBe(false)
  })

  it('offers the two platforms not already tried', () => {
    expect(otherPlatforms('instagram')).toEqual(['youtube', 'tiktok'])
    expect(otherPlatforms('YouTube')).toEqual(['tiktok', 'instagram'])
    // An unknown platform loses nothing — all three stay on offer.
    expect(otherPlatforms('vimeo')).toEqual([...READABLE_PLATFORMS])
  })
})

describe('every sentence is one a first-time creator can read', () => {
  const JARGON = /retriev|scrap|rate.?limit|http|api\b|token|endpoint|null|undefined|error code/i

  it('carries no engineering vocabulary', () => {
    for (const c of SCAN_FAILURE_CAUSES) {
      expect(scanFailure(c).message, c).not.toMatch(JARGON)
    }
  })

  it('is a real sentence, not a code', () => {
    for (const c of SCAN_FAILURE_CAUSES) {
      const m = scanFailure(c).message
      expect(m.length, c).toBeGreaterThan(30)
      expect(m.endsWith('.'), c).toBe(true)
      expect(m, c).not.toMatch(/[A-Z]{4,}_[A-Z]{2,}/)
    }
  })

  // ⚠️ THE UNKNOWN CASE IS THE ONE MOST LIKELY TO GO WRONG LATER, because a
  // fallback that guesses is delivered with the taxonomy's confidence.
  it('the unknown case blames nobody and admits it does not know', () => {
    const m = scanFailure('UNKNOWN').message.toLowerCase()
    expect(m).toMatch(/not sure|do not know|don't know/)
    expect(m).not.toMatch(/privat|your account|you /)
  })
})
