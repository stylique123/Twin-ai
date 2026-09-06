// A CODE WITH NO RESIDUE IS A FAILURE NOBODY RECORDED.
//
// ⚠️ MEASURED 2026-09-05 AGAINST PRODUCTION: 222 YouTube references carry
// `visual_failure_code = 'UNKNOWN_DOWNLOAD_FAILURE'`, and ALL 222 have
// `download_trace` NULL and `download_route` NULL. The code says
// "unrecognised" and nothing anywhere says WHAT was unrecognised, so 222
// failures are one indistinguishable lump that re-running cannot diagnose.
//
// `downloadFailure.ts` predicted this in prose: "if code 10231 turns out to be
// forty rows, that is a number somebody can go investigate, where forty rows
// inside UNKNOWN_DOWNLOAD_FAILURE are invisible." The codes are TikTok-shaped;
// YouTube's wording matched none of them and the whole platform fell through
// the gap the comment named.
//
// ⚖️ AND THE FRAMES-ONLY SWEEP IS WHY THIS SHIPS TOGETHER WITH IT. Enqueuing
// 1,008 references without this would manufacture up to 222 more unknowns and
// answer nothing.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { classifyDownloadFailure } from '../downloadFailure.js'
import { redact } from '../sanitizeError.js'

const JOB = readFileSync(new URL('../jobs/assessReference.ts', import.meta.url), 'utf8')
const PASS = readFileSync(new URL('../visualPass.ts', import.meta.url), 'utf8')

describe('the residue is kept exactly where the classifier gave up', () => {
  it('the result type carries it', () => {
    expect(PASS).toMatch(/unmapped_detail: string \| null/)
  })

  // ⚠️ ONLY FOR THE UNKNOWN CODE. Storing prose for a recognised failure would
  // grow every row to make one class legible — and a code that HAS been reduced
  // to its fact does not need its wording kept.
  it('is populated only when the classifier could not name it', () => {
    expect(PASS).toMatch(/code === 'UNKNOWN_DOWNLOAD_FAILURE'\s*\?\s*redact\(errorText\(e\)\)\s*:\s*null/)
  })

  // ⚠️ REDACTED, BECAUSE THIS IS DURABLE STATE. yt-dlp messages routinely carry
  // the signed URL being fetched.
  it('goes through redact, never the raw error', () => {
    expect(PASS).toMatch(/redact\(errorText\(e\)\)/)
    const catchBlock = PASS.slice(PASS.indexOf('const code = classifyDownloadFailure(e)'),
      PASS.indexOf('const code = classifyDownloadFailure(e)') + 400)
    expect(catchBlock).not.toMatch(/unmapped_detail:\s*String\(e\)/)
  })

  it('redact really does strip a signed url', () => {
    const out = redact('ERROR: unable to download https://cdn.example.com/v.mp4?token=abc123secret')
    expect(out).not.toContain('token=abc123secret')
    expect(out).toContain('[url]')
  })

  it('and the success path decides explicitly rather than defaulting', () => {
    expect(PASS).toMatch(/ran: true,[\s\S]{0,400}?unmapped_detail: null/)
  })
})

describe('the residue reaches the reference row, not just the job result', () => {
  // ⚠️ THE WHOLE DEFECT THE 222 ROWS ARE: the code survived in a job result
  // keyed by job, and the reference row — the thing a later query reads — kept
  // nothing. A trace that only exists in a job result is the same as no trace.
  const writes = [...JOB.matchAll(/download_trace: \{ unmapped_detail: visual\.unmapped_detail \}/g)]

  it('both visual-failure upserts carry it', () => {
    expect(writes.length).toBe(2)
  })

  it('and each is conditional, so a named failure writes no trace', () => {
    expect(JOB).toMatch(/\.\.\.\(visual\.unmapped_detail\s*\n?\s*\?\s*\{ download_trace/)
  })
})

describe('frames-only refuses before it acquires', () => {
  // ⚠️ THE REFUSAL MUST PRECEDE THE LADDER. Checked after it, the audio has
  // already been paid for before the job decides it did not want it — which is
  // the whole cost this flag exists to avoid.
  const refusalAt = JOB.indexOf("p.framesOnly === true && !cached")
  const ladderAt = JOB.indexOf('transcript = cached ? cached.transcript : await transcribeFromUrl')

  it('the refusal exists', () => {
    expect(refusalAt).toBeGreaterThan(-1)
  })

  it('the acquisition exists to be preceded', () => {
    expect(ladderAt).toBeGreaterThan(-1)
  })

  it('and the refusal comes FIRST', () => {
    expect(refusalAt).toBeLessThan(ladderAt)
  })

  // ⚖️ A MISS IS RECORDED, NOT SWALLOWED. "We had no transcript for this URL"
  // is why a sweep covered 600 of 1,008 rather than a mystery about the rest.
  it('a cache miss is recorded as an outcome, not thrown', () => {
    expect(JOB).toMatch(/event: 'frames_only_no_cached_transcript'/)
    expect(JOB).toMatch(/skipped: 'no_cached_transcript'/)
  })

  // ⚠️ AND IT NEVER UPGRADES ITSELF. A frames-only job that fell through to the
  // ladder would turn a one-download sweep into a two-download re-assessment
  // across 1,008 references, unauthorised and invisible.
  it('returns rather than continuing into the ladder', () => {
    const block = JOB.slice(refusalAt, refusalAt + 260)
    expect(block).toMatch(/return \{ url, skipped: 'no_cached_transcript'/)
  })
})

describe('the classifier still behaves, so the residue is the exception', () => {
  it('a recognised block is still named', () => {
    expect(classifyDownloadFailure(new Error('Your IP address is blocked from accessing this post')))
      .not.toBe('UNKNOWN_DOWNLOAD_FAILURE')
  })

  it('an empty error is unknown — the case that produces a residue', () => {
    expect(classifyDownloadFailure(new Error(''))).toBe('UNKNOWN_DOWNLOAD_FAILURE')
  })
})
