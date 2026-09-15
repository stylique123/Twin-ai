// A 504 IS NOT A BAD RECORDING.
//
// ⚠️⚠️ A TRANSIENT STORAGE FAILURE ENDED A CREATOR'S TAKE. `validateSource` and
// `validateClip` both did this, and `reject` is TERMINAL:
//
//     try { await downloadObject(...) }
//     catch (e) { return await reject(assetId, 'download_failed', ...) }
//
// SEEN 2026-09-15 on the staging matrix: a 419,980-byte object whose finalize
// etag/bytes verified, rejected on `storage download 504: 504 Gateway
// Time-out`. In production that is a creator told their recording failed
// because a GET blipped.
//
// ⚠️ THE RULE ALREADY EXISTED IN TWO PLACES AND NEITHER PATH READ IT.
// `sanitizeError` maps /storage download/ to `storage_download_failed`, and
// inspection.test.ts asserts that code is `retry: 'retryable'`. The staging
// harness separates transport from our-fault and states the reason. The rule
// was written twice and applied here zero times.
//
// ⚖️ AND RETRY ALONE WOULD HAVE BEEN WORSE, WHICH IS WHY THE BUDGET IS IN THE
// CONDITION. index.ts dead-letters the JOB at `attempts >= max_attempts` and
// that does NOT move the ASSET, so a throw on the last attempt strands the take
// in `validating` for ever. A permanent spinner beats a wrong answer for
// nobody.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ⚠️ SET BEFORE THE IMPORT, NOT IN `beforeAll`. `storage.ts` reads `env` at
// module load and `env.ts` throws on a missing key, so a `beforeAll` runs too
// late — the suite collected ZERO tests and reported "Missing required env"
// instead of anything about the predicate.
process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'

const { isTransientStorageFailure } = await import('../storage.js')

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const src = (p: string) => readFileSync(join(REPO, p), 'utf8')

describe('whose fault was the failed download', () => {
  it('a 5xx from Storage is the transport, not the take', () => {
    for (const status of [500, 502, 503, 504, 507, 509]) {
      expect(isTransientStorageFailure(`storage download ${status}: <h1>oops</h1>`),
        `status ${status}`).toBe(true)
    }
  })

  it('a 408 or 429 is transport too — asked again, answered differently', () => {
    expect(isTransientStorageFailure('storage download 408: timeout')).toBe(true)
    expect(isTransientStorageFailure('storage download 429: slow down')).toBe(true)
  })

  it('THE LIVE CASE: the exact string that killed a good take', () => {
    expect(isTransientStorageFailure(
      'Error: storage download 504: <html>\r\n<head><title>504 Gateway Time-out</title></head>',
    )).toBe(true)
  })

  it('a 404 is OUR fault and must not burn the budget', () => {
    // ⚖️ The harness says it in as many words: "A 404 IS OUR FAULT, NOT THE
    // NETWORK'S". The object is not there; asking again will not put it there.
    expect(isTransientStorageFailure('storage download 404: not found')).toBe(false)
  })

  it('401 and 403 are ours too — a dead credential retried is still dead', () => {
    expect(isTransientStorageFailure('storage download 401: invalid jwt')).toBe(false)
    expect(isTransientStorageFailure('storage download 403: Invalid Compact JWS')).toBe(false)
  })

  it('over the cap is the cap working, not a fault', () => {
    expect(isTransientStorageFailure('storage download too large: 900000000 bytes > cap 600000000')).toBe(false)
    expect(isTransientStorageFailure('storage download too large: exceeded cap 600000000 bytes')).toBe(false)
  })

  it('a cancellation is never retried', () => {
    // ⚠️ Resurrecting work somebody stopped on purpose is its own defect. No
    // validate caller passes a signal today, so this cannot fire from them —
    // it is pinned because the predicate is exported.
    expect(isTransientStorageFailure('download aborted')).toBe(false)
    expect(isTransientStorageFailure('Error: The operation was aborted')).toBe(false)
  })

  it('network faults that never reached a status line are transport', () => {
    for (const e of ['ETIMEDOUT', 'ECONNRESET', 'socket hang up', 'EAI_AGAIN', 'fetch failed', 'ENETUNREACH']) {
      expect(isTransientStorageFailure(`Error: ${e}`), e).toBe(true)
    }
  })

  it('reads the status from OUR prefix, not from digits anywhere in the text', () => {
    // ⚠️⚠️ THE FIRST VERSION OF THIS TEST DID NOT DISCRIMINATE, AND A MUTANT
    // PROVED IT. Both fixtures put the status FIRST, so replacing the anchored
    // `/storage download (\d{3})\b/` with a bare `/(\d{3})/` still matched the
    // status and all eighteen tests passed. A number must PRECEDE the status
    // for the two regexes to disagree.
    //
    // ⚖️ AND THE ANCHOR GUARDS THE EXPORTED PREDICATE, NOT TODAY'S TWO CALLERS.
    // `String(e)` from `downloadObject` always reads
    // "Error: storage download NNN: <body>", where the path and body follow the
    // status — so neither validate caller can produce a leading number. These
    // cases are the shape a caller that prefixes context WOULD produce, e.g.
    // re-classifying a `rejection_detail` read back from a row.
    expect(isTransientStorageFailure('asset 404 rejected earlier: storage download 504: ok')).toBe(true)
    expect(isTransientStorageFailure('asset 504 rejected earlier: storage download 404: not found')).toBe(false)
    // The plain shape still answers correctly, path digits and all.
    expect(isTransientStorageFailure('storage download 504: takes/404/clip-500.mp4')).toBe(true)
    expect(isTransientStorageFailure('storage download 404: takes/504/clip-502.mp4')).toBe(false)
  })

  it('an unrecognised failure counts as transport, matching the one precedent', () => {
    // ⚖️ `uploadCeiling.mayRetry` returns true for `unknown`, stating why:
    // "Refusing to retry an unrecognised failure would strand takes on
    // transient faults we failed to name." The cost is bounded by the budget
    // and ends in the same rejection; the other default loses recordings.
    expect(isTransientStorageFailure('Error: something nobody has named yet')).toBe(true)
  })

  it('nothing at all is not evidence of transport', () => {
    expect(isTransientStorageFailure('')).toBe(false)
    expect(isTransientStorageFailure('   ')).toBe(false)
    expect(isTransientStorageFailure(null)).toBe(false)
    expect(isTransientStorageFailure(undefined)).toBe(false)
  })
})

describe('both call sites retry, and only while a retry can happen', () => {
  const CALLERS = ['worker/src/jobs/validateSource.ts', 'worker/src/jobs/validateClip.ts']

  it.each(CALLERS)('%s consults the predicate AND the budget before rejecting', (p) => {
    const s = src(p)
    // The guard must carry both halves. Either alone is a defect:
    // predicate without budget strands the asset; budget without predicate
    // retries a 404.
    expect(s).toMatch(
      /if \(isTransientStorageFailure\(detail\) && job\.attempts < job\.max_attempts\) throw e/)
    expect(s).toMatch(/return await reject\(assetId, 'download_failed', detail\)/)
  })

  it.each(CALLERS)('%s no longer rejects unconditionally', (p) => {
    // Whole-line comments dropped: the fix's own comment quotes the defect it
    // replaced, and a raw grep would find it inside the prose explaining it.
    const code = src(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    expect(code).not.toMatch(
      /catch \(e\) \{\s*return await reject\(assetId, 'download_failed', String\(e\)/)
  })

  it('imports the predicate from the module that throws the error', () => {
    for (const p of CALLERS) {
      expect(src(p)).toMatch(/import \{[^}]*isTransientStorageFailure[^}]*\} from '\.\.\/storage\.js'/)
    }
  })
})

// ── PARITY WITH THE HARNESS, WHICH ALREADY HAD THIS RULE ────────────────────
//
// ⚖️ THE WORKER HAS NO RUNTIME DEPENDENCY ON @twinai/shared, so a rule that
// must agree across the boundary agrees by TEST, the same way
// director-contract.test.ts pins the Director envelope. The harness's copy is
// scripts/staging-integration/assetFailure.mjs.
describe('the worker and the staging harness agree on what transport means', () => {
  const HARNESS = src('scripts/staging-integration/assetFailure.mjs')

  it('the harness still carries its own transport matcher', () => {
    // If this fails the harness was refactored; re-anchor, do not re-litigate.
    expect(HARNESS).toMatch(/const TRANSPORT_DETAIL = \//)
  })

  it('agrees on every detail string the harness classifies', async () => {
    const mod = await import(
      /* @vite-ignore */ join(REPO, 'scripts/staging-integration/assetFailure.mjs')) as {
        classifyAssetFailure: (a: unknown) => string
      }
    const cases = [
      'Error: storage download 504: <h1>504 Gateway Time-out</h1>',
      'Error: storage download 503: unavailable',
      'Error: ETIMEDOUT',
      'Error: ECONNRESET',
      'Error: socket hang up',
      'Error: storage download 404: not found',
    ]
    for (const detail of cases) {
      const harnessSaysTransport = mod.classifyAssetFailure(
        { status: 'rejected', metadata: { rejection_code: 'download_failed', rejection_detail: detail } },
      ) === 'transport'
      expect(isTransientStorageFailure(detail), detail).toBe(harnessSaysTransport)
    }
  })
})
