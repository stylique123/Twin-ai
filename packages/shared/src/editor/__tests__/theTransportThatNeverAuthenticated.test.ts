// A 403 SAID "DO NOT RETRY THIS" AND THE CODE HEARD "DO NOT TRY ANYTHING".
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-15. Of 7 source assets, the 1 under 6 MB is
// `ready`; all 6 over 6 MB are stuck `uploading`. The boundary is exactly
// RESUMABLE_THRESHOLD_BYTES, so the discriminator is the TRANSPORT and not the
// bytes, the key, or the creator.
//
//   routed to                          assets   ready   stuck uploading
//   <= 6 MB  single PUT, token in URL       1       1                 0
//   >  6 MB  resumable, `x-signature`       6       0                 6
//
// ⚖️ TWO DEFECTS, AND THE SECOND IS WHY THE FIRST WAS FATAL. The tus config
// sent the server-minted token in `x-signature` with no `Authorization`, and
// `x-signature` is not a Storage header — hence `403 "Invalid Compact JWS"`,
// which is a PARSE failure on an absent bearer token, not a signature
// mismatch. On its own that would have cost one wasted attempt. What cost every
// take is that the 403 was classified `deterministic` and that verdict was used
// to skip the single PUT sitting one line below.
//
// ⚠️ `mayRetry` WAS ANSWERING A QUESTION IT WAS NOT ASKED. It says whether to
// re-send the SAME request. Whether a DIFFERENT transport would work is a
// different question, and conflating them is what turned a bad header into a
// product with no completed uploads.
import { describe, it, expect } from 'vitest'
import {
  mayRetry, mayTryAnotherTransport, classifyUploadFailure,
} from '../uploadCeiling'

describe('an auth refusal ends this transport, not the upload', () => {
  for (const status of [401, 403]) {
    it(`${status} is deterministic — the same request must not be re-sent`, () => {
      expect(classifyUploadFailure(status)).toBe('deterministic')
      expect(mayRetry(classifyUploadFailure(status))).toBe(false)
    })

    it(`${status} still allows another transport, which is the fix`, () => {
      expect(mayTryAnotherTransport(status)).toBe(true)
    })
  }

  it('the real failure carries its body, and still falls through', () => {
    // Verbatim from production.
    const msg = 'upload 403: {"statusCode":"403","code":"AccessDenied",'
      + '"error":"Unauthorized","message":"Invalid Compact JWS"}'
    expect(mayTryAnotherTransport(403, msg)).toBe(true)
    // And it is emphatically NOT a retry of the identical request.
    expect(mayRetry(classifyUploadFailure(403, msg))).toBe(false)
  })
})

describe('a payload refusal is final on every transport', () => {
  // ⚠️ THE OTHER HALF OF THE RULE, AND THE REASON IT IS NOT "ALWAYS FALL BACK".
  // A creator once paid twice for one size refusal because a bare catch re-sent
  // the whole blob. 95 MB re-sent to be told the same thing is the defect this
  // guards, so these must stay closed.
  for (const status of [400, 413, 415, 422]) {
    it(`${status} does not get a second transport`, () => {
      expect(classifyUploadFailure(status)).toBe('deterministic')
      expect(mayTryAnotherTransport(status)).toBe(false)
    })
  }

  it('the size refusal a real creator hit stays final', () => {
    const msg = 'upload 413: The object exceeded the maximum allowed size'
    expect(mayTryAnotherTransport(413, msg)).toBe(false)
  })
})

describe('transient and unknown failures were already allowed to move on', () => {
  for (const status of [408, 429, 500, 502, 503]) {
    it(`${status} may try another transport`, () => {
      expect(mayTryAnotherTransport(status)).toBe(true)
    })
  }

  it('an unreadable status may try another transport rather than dead-end', () => {
    // ⚖️ UNKNOWN IS NOT A REFUSAL. A network error with no status is exactly
    // the case a second transport exists for, and treating silence as a
    // refusal is how the fallback stops being reachable at all.
    expect(mayTryAnotherTransport(null)).toBe(true)
    expect(mayTryAnotherTransport(undefined)).toBe(true)
    expect(mayTryAnotherTransport(NaN)).toBe(true)
  })
})

describe('the two questions cannot be collapsed back into one', () => {
  it('they disagree on exactly the auth statuses, and nowhere else', () => {
    const disagree: number[] = []
    for (let s = 400; s <= 504; s++) {
      const retry = mayRetry(classifyUploadFailure(s))
      const another = mayTryAnotherTransport(s)
      if (retry !== another) disagree.push(s)
    }
    // If these two ever agree everywhere, one of them is redundant and the
    // bug this file records is back.
    expect(disagree).toEqual([401, 403])
  })
})
