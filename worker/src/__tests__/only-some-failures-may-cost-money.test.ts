// PAYING FOR A RETRY THAT WAS NEVER GOING TO WORK.
//
// ⚠️ THE LADDER SPENDS REAL MONEY AT RUNG TWO. Every failure that graduates to
// residential routing bills metered egress, so the question "may this retry?" is
// a spending decision, and it must not be answered by substring-matching a
// sentence upstream is free to reword.
//
// ⚖️ THE ALLOWLIST IS SMALL ON PURPOSE. A deleted video, a login wall and a
// malformed URL are not access problems; a different IP re-asks the same
// question and gets the same answer, for a fee.
import { describe, expect, it } from 'vitest'
import {
  classifyDownloadFailure, mayRetryViaProxy, DOWNLOAD_FAILURES, RETRYABLE_VIA_PROXY,
  CLASSIFIER_SOURCES, phaseOf, DOWNLOAD_PHASES, type DownloadFailure,
} from '../downloadFailure'

describe('the real production error is classified as a challenge, not a mystery', () => {
  it('recognises the exact string yt-dlp raised on all three canaries', () => {
    // ⚠️ THE MEASURED ONE. extractor/tiktok.py:231 raises this when TikTok
    // served a page and the JS challenge blob was not in it.
    expect(classifyDownloadFailure(
      'yt-dlp exited 1: ERROR: [TikTok] 7212817288800521515: Unexpected response from webpage request',
    )).toBe('TIKTOK_CHALLENGE_FAILED')
  })

  it('and that IS allowed to graduate to paid routing', () => {
    // ⚖️ This is the one failure class the residential experiment exists for.
    expect(mayRetryViaProxy('TIKTOK_CHALLENGE_FAILED')).toBe(true)
  })
})

describe('what may NOT cost money', () => {
  it('refuses to pay for private, deleted or region-locked videos', () => {
    for (const raw of [
      'TikTok is requiring login for access to this content',
      'ERROR: [TikTok] 123: This video is unavailable',
      'the account is private',
      'Video not available in your country',
    ]) {
      const code = classifyDownloadFailure(raw)
      expect(code, raw).toBe('PRIVATE_OR_UNAVAILABLE')
      expect(mayRetryViaProxy(code), raw).toBe(false)
    }
  })

  it('checks the login wall BEFORE the block codes', () => {
    // ⚠️ A login wall is a property of the video; a 403 is a property of us.
    // Ordering these the other way would buy residential egress to re-ask for a
    // private video and get told no again, at a price.
    expect(classifyDownloadFailure('login required, HTTP Error 403')).toBe('PRIVATE_OR_UNAVAILABLE')
  })

  it('refuses to pay for a timeout', () => {
    // ⚖️ Ambiguous between a slow host, a slow box and a silent drop. Paying
    // metered egress for our own CPU contention is not a routing strategy.
    const code = classifyDownloadFailure('yt-dlp timed out after 120000ms')
    expect(code).toBe('DOWNLOAD_TIMEOUT')
    expect(mayRetryViaProxy(code)).toBe(false)
  })

  it('refuses to pay for a failure it does not recognise', () => {
    // ⚠️ "We do not know why this failed" is not evidence that an IP fixes it.
    const code = classifyDownloadFailure('something nobody has seen before')
    expect(code).toBe('UNKNOWN_DOWNLOAD_FAILURE')
    expect(mayRetryViaProxy(code)).toBe(false)
  })

  it('treats an empty or absent error as unknown rather than inventing one', () => {
    for (const empty of ['', '   ', null, undefined]) {
      expect(classifyDownloadFailure(empty)).toBe('UNKNOWN_DOWNLOAD_FAILURE')
    }
  })
})

describe('the 2026-08 dependency bug keeps its own code', () => {
  it('still recognises the failure the build assertion now prevents', () => {
    // ⚠️ A running container older than the assertion can still report this,
    // and it must never be confused with an IP problem — no proxy fixes a
    // curl-cffi version outside yt-dlp's supported window.
    const code = classifyDownloadFailure('no impersonate target is available')
    expect(code).toBe('IMPERSONATION_UNAVAILABLE')
    expect(mayRetryViaProxy(code)).toBe(false)
  })
})

describe('the allowlist is closed', () => {
  it('lets exactly the two access classes graduate, and nothing else', () => {
    expect([...RETRYABLE_VIA_PROXY].sort()).toEqual(['TIKTOK_CHALLENGE_FAILED', 'TIKTOK_IP_BLOCKED'])
    const payable = DOWNLOAD_FAILURES.filter((c: DownloadFailure) => mayRetryViaProxy(c))
    expect(payable).toHaveLength(2)
  })
})

// A STRING WITH TWO CLUES IN IT MUST RESOLVE TO THE INTENDED OWNER.
//
// ⚠️ "EACH STRING MAPS SOMEWHERE" IS NOT THE PROPERTY WORTH TESTING. Real
// downloader errors carry several clues at once — a login hint AND a 403, a
// timeout AND a status code — and the ORDER of the checks is what decides which
// clue owns the message. That order is a spending decision, so it is pinned here
// rather than left to whoever next edits the function.
describe('precedence collisions resolve to the intended owner', () => {
  const cases: Array<[string, DownloadFailure, string]> = [
    // A login wall is a property of the video; the 403 is incidental to it.
    ['login required for access to this content, HTTP Error 403',
      'PRIVATE_OR_UNAVAILABLE', 'login beats 403 — never pay to re-ask for a private video'],
    // yt-dlp raises this one when the page said "Please wait..." — still the
    // challenge path, and still the class the residential experiment exists for.
    ['Please wait... Unable to extract challenge data',
      'TIKTOK_CHALLENGE_FAILED', 'the challenge check owns both of its strings'],
    ['ERROR: [TikTok] 123: Unexpected response from webpage request',
      'TIKTOK_CHALLENGE_FAILED', 'the narrower challenge class, not the generic block'],
    // ⚖️ THE ONE THAT COSTS MONEY BY DESIGN. A 403 is positive evidence the host
    // refused us; the timeout beside it is ambiguous. Positive evidence wins.
    ['yt-dlp timed out after 120000ms; last response HTTP Error 403',
      'TIKTOK_IP_BLOCKED', '403 beats timeout — and therefore DOES graduate'],
    ['no impersonate target is available',
      'IMPERSONATION_UNAVAILABLE', 'a dependency problem no proxy can fix'],
    // ⚠️ THIS EXPECTATION CHANGED, AND THE REASON IS WORTH KEEPING. It formerly
    // asserted TIKTOK_IP_BLOCKED, on the reasoning that a 403 is positive
    // evidence the host refused us. A failed CONNECT means the tunnel was never
    // established — nothing reached TikTok, and the 403 is the PROXY's answer.
    // Reading it as the host's opinion of our IP would send a proxy failure back
    // through the proxy that caused it.
    ['Unable to download webpage: Failed to perform, curl: (56) CONNECT tunnel failed, response 403',
      'PROXY_TRANSPORT_FAILED', 'a failed CONNECT never reached the host, so the status is the proxy\'s'],
    // ⚖️ THE ROW FROM PRODUCTION THAT FORCED THE QUESTION. 590 matches no status
    // pattern, so this fell all the way to UNKNOWN — a residential canary
    // counted as an unexplained failure when the proxy had plainly refused.
    ['yt-dlp exited 1: (caused by ProxyError(\'Failed to perform, curl: (56) CONNECT tunnel failed, response 590.\'))',
      'PROXY_TRANSPORT_FAILED', 'a proxy refusal is named, not filed as a mystery'],
  ]
  for (const [raw, expected, why] of cases) {
    it(why, () => { expect(classifyDownloadFailure(raw)).toBe(expected) })
  }

  it('the timeout+403 case is the ONLY way a timeout-shaped string can cost money', () => {
    // ⚠️ Stated explicitly so nobody "simplifies" the ordering later and quietly
    // makes every slow download billable.
    expect(mayRetryViaProxy(classifyDownloadFailure('yt-dlp timed out after 120000ms'))).toBe(false)
    expect(mayRetryViaProxy(classifyDownloadFailure('timed out ... HTTP Error 403'))).toBe(true)
  })
})

describe('the TikTok status codes, read from the extractor rather than guessed', () => {
  // ⚠️ GROUND TRUTH IS tiktok.py:989-994, NOT INTUITION. yt-dlp maps exactly
  // three status codes and raises a generic message for everything else. These
  // assertions encode that mapping so a future edit cannot quietly re-file one
  // family as another — which, for 10204, would mean losing the only TikTok
  // status that is genuinely worth paying to retry.

  it('10204 is an IP block in yt-dlp\'s own words, and stays payable', () => {
    const raw = 'ERROR: [TikTok] 123: Your IP address is blocked from accessing this post'
    expect(classifyDownloadFailure(raw)).toBe('TIKTOK_IP_BLOCKED')
    expect(mayRetryViaProxy(classifyDownloadFailure(raw))).toBe(true)
  })

  it('10216 and 10222 surface as login-required, and are never payable', () => {
    // The exact sentence `raise_login_required` is given at tiktok.py:992.
    const raw = 'ERROR: [TikTok] 123: You do not have permission to view this post. Log into an account that has access'
    expect(classifyDownloadFailure(raw)).toBe('PRIVATE_OR_UNAVAILABLE')
    expect(mayRetryViaProxy(classifyDownloadFailure(raw))).toBe(false)
  })

  it('an unmapped status is counted as unmapped, not sorted into a neighbour', () => {
    // ⚖️ THE ROW FROM PRODUCTION. Code 10231 is in none of yt-dlp's three
    // branches, so it fell to the generic message and then to UNKNOWN — where a
    // whole family of TikTok answers would have been invisible.
    const raw = 'yt-dlp exited 1: ERROR: [TikTok] 7419349447294864673: Video not available, status code 10231'
    expect(classifyDownloadFailure(raw)).toBe('TIKTOK_STATUS_UNMAPPED')
    // Not payable: an untranslated status is not evidence that an IP would fix it.
    expect(mayRetryViaProxy(classifyDownloadFailure(raw))).toBe(false)
  })

  it('does not eat a block that happens to mention a status', () => {
    // Precedence: positive block evidence beats the generic status matcher.
    expect(classifyDownloadFailure('Video not available, status code 10204: blocked'))
      .toBe('TIKTOK_IP_BLOCKED')
  })
})

describe('a proxy failure never pays the proxy', () => {
  // ⚠️ THE LOOP THIS PREVENTS. If the residential proxy refuses the tunnel and
  // we call that a host block, the failure graduates to paid routing — through
  // the proxy that just refused. Every retry bills and none can succeed.
  for (const raw of [
    'CONNECT tunnel failed, response 590',
    'CONNECT tunnel failed, response 403',
    "ProxyError('Failed to perform, curl: (56) CONNECT tunnel failed')",
    'could not connect to proxy proxy.apify.com',
  ]) {
    it(`is not payable: ${raw.slice(0, 40)}`, () => {
      expect(classifyDownloadFailure(raw)).toBe('PROXY_TRANSPORT_FAILED')
      expect(mayRetryViaProxy(classifyDownloadFailure(raw))).toBe(false)
    })
  }

  it('still lets a genuine host block through', () => {
    // ⚖️ THE CHECK MUST NOT HAVE EATEN THE CASE IT SITS IN FRONT OF. A 403 with
    // no tunnel failure is still TikTok refusing us, and still payable.
    expect(classifyDownloadFailure('HTTP Error 403: Forbidden')).toBe('TIKTOK_IP_BLOCKED')
    expect(mayRetryViaProxy(classifyDownloadFailure('HTTP Error 403: Forbidden'))).toBe(true)
  })
})

// INVARIANTS A REFACTOR MUST NOT BREAK.
describe('the spending allowlist is well-formed', () => {
  it('RETRYABLE_VIA_PROXY is a subset of the known codes', () => {
    // ⚠️ A code that can be spent against but is not in the union is a typo that
    // silently never fires — or worse, one that fires on everything.
    for (const c of RETRYABLE_VIA_PROXY) {
      expect(DOWNLOAD_FAILURES, c).toContain(c)
    }
  })

  it('UNKNOWN_DOWNLOAD_FAILURE is NEVER payable', () => {
    // ⚖️ THE ONE THAT WOULD HURT MOST. `unknown` is the bucket everything
    // unrecognised lands in, so making it payable would route every novel error
    // through metered egress — and novel errors are exactly the ones we have no
    // evidence about.
    expect(RETRYABLE_VIA_PROXY.has('UNKNOWN_DOWNLOAD_FAILURE')).toBe(false)
    expect(mayRetryViaProxy('UNKNOWN_DOWNLOAD_FAILURE')).toBe(false)
  })

  it('every code is decidable — no string falls through to undefined', () => {
    for (const raw of ['', 'nonsense', 'HTTP Error 500', '403', 'timed out']) {
      expect(DOWNLOAD_FAILURES).toContain(classifyDownloadFailure(raw))
    }
  })
})

describe('a code remembers who assigned it', () => {
  it('distinguishes a worker-emitted code from one derived by hand', () => {
    // ⚠️ The first canary rows are classified offline, because the image running
    // them predates this file. Backfilling them as `worker` would convert a
    // manual reading into apparent instrument data.
    expect([...CLASSIFIER_SOURCES]).toEqual(['worker', 'offline'])
  })
})

// WHETHER RUNG TWO MOVED THE WALL.
//
// ⚠️ "THE PROXY FAILED" WOULD POOL TWO OPPOSITE RESULTS. If residential routing
// turns a `challenge` failure into a `media_download` failure, the proxy did NOT
// fail — it carried us through TikTok's challenge layer and a different boundary
// is now in front of us. Those want opposite next steps.
describe('phase says WHERE it stopped', () => {
  it('files all three local canaries at the challenge layer', () => {
    expect(phaseOf('yt-dlp exited 1: ERROR: [TikTok] 123: Unexpected response from webpage request'))
      .toBe('challenge')
    expect(phaseOf('Please wait... Unable to extract challenge data')).toBe('challenge')
  })

  it('checks challenge markers BEFORE webpage ones', () => {
    // ⚠️ THE ORDERING THAT MATTERS MOST. A challenge failure's text also contains
    // "download webpage"; filing it as a connection problem would make the
    // canary report that residential routing changed nothing when it had in fact
    // moved the boundary.
    expect(phaseOf('Unable to download webpage: Unexpected response from webpage request'))
      .toBe('challenge')
  })

  it('separates a transport failure from a challenge failure', () => {
    // ⚖️ THE OUTCOME WORTH WATCHING FOR. Getting here means the proxy WORKED.
    expect(phaseOf('Unable to download video data: HTTP Error 403')).toBe('media_download')
    expect(phaseOf('fragment 3 not found, retrying')).toBe('media_download')
    expect(phaseOf('no video formats found')).toBe('media_url')
    expect(phaseOf('Unable to extract aweme detail info')).toBe('metadata')
  })

  it('files a genuine connection problem at the webpage', () => {
    expect(phaseOf('CONNECT tunnel failed, response 403')).toBe('webpage')
    expect(phaseOf('yt-dlp timed out after 180000ms')).toBe('webpage')
  })

  it('calls silence success, not an unknown', () => {
    // ⚠️ No error means the bytes landed. The trace on a success path is what
    // makes elapsed/bytes comparable across rungs.
    expect(phaseOf('')).toBe('complete')
    expect(phaseOf(null)).toBe('complete')
  })

  it('recognises the login walls production actually sent (2026-08 backlog)', () => {
    // ⚠️ VERBATIM FROM `download_trace.raw_error`, not paraphrased. Both were
    // filed UNKNOWN_DOWNLOAD_FAILURE by the first backlog tranche because the
    // wall list only knew the words "private" and "login required". They are
    // permanently unavailable to a logged-out downloader, and no route we can
    // buy changes that — so the code must say so rather than say "mystery".
    const walls = [
      'yt-dlp exited 1: ERROR: [TikTok] 7654886192583806239: This post may not be comfortable for some audiences. Log in for access. Use --cookies-from-browser or --cookies for the authentication.',
      'yt-dlp exited 1: ERROR: [TikTok] 7666764170959899926: You do not have permission to view this post. Log into an account that has access. Use --cookies-from-browser or --cookies for the authentication.',
    ]
    for (const raw of walls) {
      expect(classifyDownloadFailure(raw)).toBe('PRIVATE_OR_UNAVAILABLE')
      // ⚖️ AND THE POINT OF THE CODE: it must never become payable.
      expect(RETRYABLE_VIA_PROXY.has(classifyDownloadFailure(raw))).toBe(false)
    }
  })

  it('every phase is one of the declared six', () => {
    for (const raw of ['', 'nonsense', 'HTTP Error 500', 'fragment', 'challenge data']) {
      expect(DOWNLOAD_PHASES).toContain(phaseOf(raw))
    }
  })
})
