import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { retryWorthScanFailure } from '../transcriptFailure.js'

/**
 * ⚠️⚠️ THE FAILURE THAT PRODUCED AN ENTIRE FINDINGS DOCUMENT HAD TWO FREE
 * RETRIES BEHIND IT.
 *
 * Brand voice 4a64f374's `scrape_dna` failed at the voice-synth step, recorded
 * `{"ok": false, "kept_existing": true}` with `status: done`, and spent 1 of 3
 * attempts. Re-queued by hand with the SAME payload it succeeded in 31
 * seconds — 42 posts, 21 caption knowledge items, 25 transcripts — taking the
 * store from 3 rows to 38 and own transcripts from 0 to 18.
 *
 * Nothing retried because the handler RETURNED its failure, and a handler that
 * returns settles `done`. The queue loop's whole retry apparatus — backoff,
 * attempt counting, dead-lettering — was sitting right there, reachable only
 * by a throw.
 */

describe('which scan failures are worth another attempt', () => {
  it('retries the classes that say "go again"', () => {
    expect(retryWorthScanFailure(new Error('apify returned 429 rate limit'))).toBe(true)
    expect(retryWorthScanFailure(new Error('request timed out'))).toBe(true)
    expect(retryWorthScanFailure(new Error('gateway returned 503'))).toBe(true)
    expect(retryWorthScanFailure(new Error('fetch failed'))).toBe(true)
  })

  // ⚠️ THESE COST A HUMAN ACTION, NOT A RETRY. Burning three attempts on a
  // rejected key delays the one message that would get it rotated.
  it('does not retry what a retry cannot fix', () => {
    expect(retryWorthScanFailure(new Error('apify 67Q6 returned 401'))).toBe(false)
    expect(retryWorthScanFailure(new Error('402 payment required'))).toBe(false)
    expect(retryWorthScanFailure(new Error('404 no such actor'))).toBe(false)
    expect(retryWorthScanFailure(new Error('APIFY_TOKEN is not set'))).toBe(false)
  })

  // ⚖️ `unknown` RETRIES ON PURPOSE. A wasted attempt costs thirty seconds; a
  // missed one costs the creator a voice that never gets built.
  it('retries an error it could not classify', () => {
    expect(retryWorthScanFailure(new Error('the model returned something strange'))).toBe(true)
  })
})

const SCRAPE = readFileSync(join(__dirname, '..', 'jobs', 'scrapeDna.ts'), 'utf8')

describe('scrape_dna spends the retries it was budgeted', () => {
  it('throws so the queue loop can retry, rather than returning a settled failure', () => {
    expect(SCRAPE).toMatch(/throw cause instanceof Error \? cause : new Error\(msg\)/)
  })

  it('only while attempts remain, so the last word is the classified record', () => {
    expect(SCRAPE).toMatch(/job\.attempts < job\.max_attempts/)
  })

  // ⚠️ THE LOAD-BEARING `undefined` CHECK. `classifyTranscriptFailure(undefined)`
  // stringifies to "undefined" and lands in `unknown`, which IS retry-worth. The
  // "we read @handle and found no posts" path passes no cause on purpose — it is
  // a fact about the account, not an error — and without this guard it would
  // scrape three times to learn the same thing.
  it('never retries a failure that reported no cause', () => {
    expect(SCRAPE).toMatch(/cause !== undefined && job\.attempts < job\.max_attempts/)
  })

  // ⚖️ A BUILT VOICE IS NEVER CHURNED. The keep-existing branch returns, as it
  // always has; only the branch with nothing to protect reaches the throw.
  it('leaves the keep-existing branch returning, not throwing', () => {
    const keep = SCRAPE.indexOf('kept_existing: true')
    const thrown = SCRAPE.indexOf('throw cause instanceof Error')
    expect(keep).toBeGreaterThan(-1)
    expect(thrown).toBeGreaterThan(keep)
  })
})
