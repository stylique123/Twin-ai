// WHY THE SCAN CAME BACK EMPTY, AND WHOSE FAULT IT IS.
//
// ── THE REAL CASE ─────────────────────────────────────────────────────────
//
// The owner pointed Twin at a large, unambiguously PUBLIC Instagram account. The
// read failed and the screen suggested the account "may be private". It was not.
// Twin's retriever failed, and the message handed the creator a reason to go and
// check their own privacy settings for a problem that was entirely ours.
//
// ⚠️ THE DEFECT IS NOT THE WORDING, IT IS THE MISSING DISTINCTION. One boolean --
// `missing` -- carried "the platform told us no such account" and "we could not
// get an answer" in the same bit, so the screen had nothing to say them apart
// with. Any sentence written on top of one bit will eventually blame the wrong
// party, because the information needed to blame the right one was never kept.
//
// ⚖️ SO THE RULE IS: NEVER ASSERT A CAUSE WE DID NOT OBSERVE. `ACCOUNT_PRIVATE`
// may be used ONLY when the platform actually said the account is private.
// Everything we merely failed at is OUR failure and says so. An honest "we could
// not read it" costs a retry; a wrong "it may be private" costs the creator a
// trip through their settings and some of their belief that Twin knows things.
//
// ⚠️ AND THIS IS NOT A HARD STOP. A creator whose Instagram we cannot read very
// often has a YouTube we can. Failing the whole onboarding on one platform
// throws away an account we could have built the voice from -- which is why
// every cause carries whether ANOTHER SOURCE would help.

export const SCAN_FAILURE_CAUSES = [
  /** The platform answered, and said no such handle exists. OBSERVED. */
  'HANDLE_NOT_FOUND',
  /** The platform answered, and said the account is private. OBSERVED.
   *  ⚠️ ONLY from an explicit platform signal. Never inferred from a failure. */
  'ACCOUNT_PRIVATE',
  /** We read the account. It exists, it is reachable, it has nothing recent. */
  'NO_RECENT_CONTENT',
  /** We could not get an answer out of the platform. OUR side. */
  'PLATFORM_ACCESS_FAILED',
  /** The platform told us to slow down. OUR side, and it passes with time. */
  'RATE_LIMITED',
  /** Our retriever ran and broke. OUR side, and the creator cannot fix it. */
  'SCRAPER_FAILED',
  /** Not a platform Twin reads. */
  'UNSUPPORTED_PLATFORM',
  /** ⚠️ THE HONEST DEFAULT. Anything unrecognised lands here, and its message
   *  blames nobody. A taxonomy whose fallback guesses is worse than no
   *  taxonomy, because the guess is delivered with a taxonomy's confidence. */
  'UNKNOWN',
] as const
export type ScanFailureCause = (typeof SCAN_FAILURE_CAUSES)[number]

/** Whether the cause is something we OBSERVED the platform say, or something we
 *  merely failed to do. The whole point of the split. */
export const OBSERVED_CAUSES: readonly ScanFailureCause[] = Object.freeze([
  'HANDLE_NOT_FOUND', 'ACCOUNT_PRIVATE', 'NO_RECENT_CONTENT', 'UNSUPPORTED_PLATFORM',
])

export const isOurFailure = (c: ScanFailureCause): boolean =>
  !OBSERVED_CAUSES.includes(c)

export interface ScanFailure {
  cause: ScanFailureCause
  /** What the creator reads. Plain English, one fact, no jargon. */
  message: string
  /** ⚠️ TRUE ONLY WHEN THE CREATOR CAN ACTUALLY DO SOMETHING. Offering a fix for
   *  a problem that is ours reads as blame. */
  creatorCanFix: boolean
  /** Whether trying the same handle again is worth the tap. */
  worthRetrying: boolean
  /** Whether the same creator on ANOTHER platform would likely work. */
  tryAnotherPlatform: boolean
}

/**
 * ⚠️ EVERY SENTENCE HERE IS READ BY A FIRST-TIME CREATOR WITH NO MARKETING
 * KNOWLEDGE. No "retriever", no "scraper", no "rate limited", no error codes.
 * And none of them says "private" unless the platform said private.
 */
const FAILURES: Record<ScanFailureCause, Omit<ScanFailure, 'cause'>> = {
  HANDLE_NOT_FOUND: {
    message: 'We could not find that account. Check the spelling of the handle and try again.',
    creatorCanFix: true, worthRetrying: false, tryAnotherPlatform: true,
  },
  ACCOUNT_PRIVATE: {
    // ⚖️ THE ONLY PLACE THE WORD "PRIVATE" IS ALLOWED, and it is allowed here
    // because the platform said it, not because we guessed it from a failure.
    message: 'This account is set to private, so we cannot see the posts. Make it public, or use a different account.',
    creatorCanFix: true, worthRetrying: false, tryAnotherPlatform: true,
  },
  NO_RECENT_CONTENT: {
    message: 'We reached this account, but there are no recent posts for us to learn from.',
    creatorCanFix: true, worthRetrying: false, tryAnotherPlatform: true,
  },
  UNSUPPORTED_PLATFORM: {
    message: 'We can only read TikTok, Instagram and YouTube accounts.',
    creatorCanFix: true, worthRetrying: false, tryAnotherPlatform: true,
  },
  // ── OURS. Every message below says so, and none suggests the creator changed
  // anything or should go and check a setting. ──────────────────────────────
  PLATFORM_ACCESS_FAILED: {
    message: 'We could not reach this account right now. It may well still be public — this is on our side.',
    creatorCanFix: false, worthRetrying: true, tryAnotherPlatform: true,
  },
  RATE_LIMITED: {
    message: 'We are being asked to slow down right now. Give it a minute and try again — nothing is wrong with your account.',
    creatorCanFix: false, worthRetrying: true, tryAnotherPlatform: true,
  },
  SCRAPER_FAILED: {
    message: 'Something went wrong on our end while reading this account. It is not your account, and it is not you.',
    creatorCanFix: false, worthRetrying: true, tryAnotherPlatform: true,
  },
  UNKNOWN: {
    message: 'We could not read this account right now. We are not sure why yet, so it is worth another try.',
    creatorCanFix: false, worthRetrying: true, tryAnotherPlatform: true,
  },
}

export function scanFailure(cause: ScanFailureCause): ScanFailure {
  return { cause, ...FAILURES[cause] }
}

/**
 * ⚠️ THE COERCION THAT PROTECTS THE RULE. Anything not recognised becomes
 * UNKNOWN -- never ACCOUNT_PRIVATE, and never the last cause that happened to be
 * checked. A caller passing a raw string from a platform response is the exact
 * path by which a guess becomes an assertion, so this is the only door in.
 */
export function readScanFailure(raw: unknown): ScanFailure {
  const known = (SCAN_FAILURE_CAUSES as readonly string[]).includes(raw as string)
  return scanFailure(known ? (raw as ScanFailureCause) : 'UNKNOWN')
}

/** The other two platforms, for the "try somewhere else" offer.
 *
 *  ⚖️ A CREATOR IS NOT ONE HANDLE. The owner's own case proves it: Instagram
 *  failed and YouTube worked, and tying identity to the first platform asked
 *  would have thrown away a voice we could read. */
export const READABLE_PLATFORMS = Object.freeze(['youtube', 'tiktok', 'instagram'] as const)
export type ReadablePlatform = (typeof READABLE_PLATFORMS)[number]

export const otherPlatforms = (tried: string): readonly ReadablePlatform[] =>
  READABLE_PLATFORMS.filter((p) => p !== tried.toLowerCase())

const PLATFORM_NAME: Record<ReadablePlatform, string> = {
  youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram',
}

/**
 * "YouTube or TikTok" -- the offer as a creator reads it.
 *
 * ⚠️ THE SCREEN HARDCODED ALL THREE, INCLUDING THE ONE THAT HAD JUST FAILED.
 * After an Instagram scan fell over it said "try the same creator on another
 * platform -- YouTube, TikTok or Instagram". `otherPlatforms` has been correct
 * and uncalled this whole time; this is the sentence it needed to be usable
 * from a screen, so the list and the words stay in one place.
 *
 * ⚖️ AN EMPTY STRING IS A REAL ANSWER, and the caller must render nothing at
 * all rather than a sentence with a gap where the platforms were.
 */
export function otherPlatformsSentence(tried: string): string {
  const names = otherPlatforms(tried).map((p) => PLATFORM_NAME[p])
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}
