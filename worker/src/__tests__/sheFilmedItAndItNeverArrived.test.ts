// 78% OF EVERY RECORDING EVER MADE NEVER BECAME USABLE.
//
// ⚠️ THE MEASUREMENT THIS GUARDS, from production 2026-09-16: seven of nine
// `media_assets` rows stuck at `uploading` across SIX creators, ages 37, 37, 24,
// 16, 2, 1 and 1 days, every one with `size_bytes` set and `content_sha256`
// NULL. Only THREE `validate_source` jobs were ever enqueued against those nine
// assets, and all three finished `done` on ONE attempt with a NULL error.
//
// ⚖️ THE DECISION IS TESTED WITHOUT A DATABASE ON PURPOSE. What can go wrong here
// is an age comparison and a status filter, and a test that needs Postgres to
// prove an age comparison is a test nobody runs before pushing.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  stalledUploadIds, STALLED_UPLOAD_AGE_MS, SWEEP_INTERVAL_MS, SWEEP_BATCH,
} from '../stalledUploads.js'

const NOW = Date.parse('2026-09-16T11:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const HOUR = 60 * 60_000
const DAY = 24 * HOUR

/** The seven real stranded rows, at their measured ages. */
const PRODUCTION = [
  { id: 'a37a', status: 'uploading', created_at: ago(37 * DAY) },
  { id: 'a37b', status: 'uploading', created_at: ago(37 * DAY + HOUR) },
  { id: 'a24', status: 'uploading', created_at: ago(24 * DAY) },
  { id: 'a16', status: 'uploading', created_at: ago(16 * DAY) },
  { id: 'a2', status: 'uploading', created_at: ago(2 * DAY) },
  { id: 'a1a', status: 'uploading', created_at: ago(1 * DAY) },
  { id: 'a1b', status: 'uploading', created_at: ago(1 * DAY + HOUR) },
  // The two that made it.
  { id: 'ready1', status: 'ready', created_at: ago(37 * DAY) },
  { id: 'ready2', status: 'ready', created_at: ago(1 * DAY) },
]

describe('every recording actually lost in production comes back', () => {
  it('considers all seven and neither of the two that are fine', () => {
    // The batch argument is raised here to inspect the CANDIDATE set; the shipped
    // rate is one per pass and is asserted separately below.
    const ids = stalledUploadIds(PRODUCTION, NOW, STALLED_UPLOAD_AGE_MS, 99)
    expect(ids).toHaveLength(7)
    expect(ids).not.toContain('ready1')
    expect(ids).not.toContain('ready2')
  })

  it('returns the recording lost longest first', () => {
    // ⚖️ MATTERS BECAUSE THE RATE IS ONE: whichever it picks is the only one that
    // moves this pass, so oldest-first is the whole ordering policy.
    expect(stalledUploadIds(PRODUCTION, NOW, STALLED_UPLOAD_AGE_MS, 2))
      .toEqual(['a37b', 'a37a'])
  })
})

describe('an upload still in flight is never touched', () => {
  // ⚠️⚠️ THE HARM THIS PREVENTS IS PERMANENT AND WORSE THAN THE DEFECT.
  // Finalizing a partial object makes the validator reject it correctly, and the
  // way back — `rejected -> validating` — requires a `validation_version` bump
  // (migration 0076's transition guard). Acting early does not merely act early:
  // it can permanently reject a recording that was arriving fine.
  it('leaves a recording younger than the threshold alone', () => {
    const rows = [{ id: 'inflight', status: 'uploading', created_at: ago(STALLED_UPLOAD_AGE_MS - 60_000) }]
    expect(stalledUploadIds(rows, NOW)).toEqual([])
  })

  it('keeps a threshold that covers the largest object measured on a slow line', () => {
    // 124 MB was the largest stranded object. Two hours covers it at ~0.14
    // Mbit/s — slower than any connection somebody films on. This asserts the
    // FLOOR, not the exact value: raising it is always safe, lowering it is not.
    expect(STALLED_UPLOAD_AGE_MS).toBeGreaterThanOrEqual(2 * HOUR)
  })

  it('acts the moment the threshold is crossed, so recovery is not open-ended', () => {
    const rows = [{ id: 'justover', status: 'uploading', created_at: ago(STALLED_UPLOAD_AGE_MS + 1000) }]
    expect(stalledUploadIds(rows, NOW)).toEqual(['justover'])
  })
})

describe('a row whose age cannot be computed is never swept', () => {
  // ⚖️ AN UNREADABLE TIMESTAMP IS THE ONE ROW WHERE "still in flight?" IS
  // UNANSWERED, and the harm is permanent. Leaving it counted by the owner
  // console is the honest outcome.
  for (const created_at of [null, undefined, '', 'not a date', 42, {}]) {
    it(`skips created_at = ${JSON.stringify(created_at)}`, () => {
      expect(stalledUploadIds([{ id: 'x', status: 'uploading', created_at }], NOW)).toEqual([])
    })
  }

  it('skips a row with no usable id rather than calling the RPC with a blank', () => {
    expect(stalledUploadIds([
      { id: '', status: 'uploading', created_at: ago(9 * DAY) },
      { id: '   ', status: 'uploading', created_at: ago(9 * DAY) },
      { id: null, status: 'uploading', created_at: ago(9 * DAY) },
    ], NOW)).toEqual([])
  })
})

describe('no state other than uploading is ever finalized', () => {
  // ⚠️ `validating` ALREADY HAS A JOB and `ready` would be an illegal transition
  // the database refuses. Filtering here means the log reads "nothing to do"
  // instead of filling with caught exceptions that hide a real failure.
  for (const status of ['validating', 'ready', 'rejected', 'deleted', '', null, 'UPLOADING']) {
    it(`skips status = ${JSON.stringify(status)}`, () => {
      expect(stalledUploadIds([{ id: 'x', status, created_at: ago(9 * DAY) }], NOW)).toEqual([])
    })
  }
})

describe('recovery never competes with live work', () => {
  // ⚠️⚠️ THE DEFECT THE STAGING MATRIX FOUND, AND IT WAS A REAL ONE. With a batch
  // of 25 this file failed run 35094972649 — "asset 16c1f21f stuck (validating)"
  // from phase4.mjs:109, behind a wall of validate_source jobs this sweep
  // enqueued. `validate_source` downloads and ffprobes a file on the SAME single
  // worker loop that serves live creators, so a batch of 25 makes somebody who
  // just finished filming wait behind 25 recordings already lost for weeks. True
  // in production too, just harder to see there than a red matrix.
  it('enqueues ONE recovery job per pass, whatever the backlog', () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      ({ id: `x${i}`, status: 'uploading', created_at: ago(9 * DAY + i * 1000) }))
    expect(stalledUploadIds(many, NOW)).toHaveLength(1)
    // ⚖️ ASSERTED AS A VALUE, not just as `SWEEP_BATCH`, because reading the
    // constant back would pass at any size — including the 25 that broke it.
    expect(SWEEP_BATCH).toBe(1)
  })

  it('takes the one lost longest, so the backlog drains oldest-first', () => {
    expect(stalledUploadIds(PRODUCTION, NOW)).toEqual(['a37b'])
  })

  it('still drains the whole backlog, because each pass removes its row', () => {
    // finalize moves the asset uploading -> validating, so it leaves this
    // population; the next pass takes the next-oldest. Seven assets drain in
    // about seventy minutes at a ten-minute interval, against a measured arrival
    // rate of seven in five weeks.
    let remaining = PRODUCTION.filter((r) => r.status === 'uploading')
    const order: string[] = []
    while (remaining.length) {
      const [next] = stalledUploadIds(remaining, NOW)
      if (!next) break
      order.push(next)
      remaining = remaining.filter((r) => r.id !== next)
    }
    expect(order).toEqual(['a37b', 'a37a', 'a24', 'a16', 'a2', 'a1b', 'a1a'])
  })

  it('returns nothing rather than throwing on a nonsense cap', () => {
    expect(stalledUploadIds(PRODUCTION, NOW, STALLED_UPLOAD_AGE_MS, 0)).toEqual([])
    expect(stalledUploadIds(PRODUCTION, NOW, STALLED_UPLOAD_AGE_MS, -5)).toEqual([])
  })

  it('handles an empty read', () => {
    expect(stalledUploadIds([], NOW)).toEqual([])
  })
})

// ── THE PART A PURE FUNCTION CANNOT PROVE ────────────────────────────────────
//
// ⚠️ THE SWEEP IS WORTHLESS IF NOTHING CALLS IT, which is the exact defect it
// exists to fix — `validate_source` works perfectly and was enqueued three times
// in five weeks. So the wiring is asserted against the source of the loop.
const LOOP = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'index.ts'), 'utf8')
// Comments describe the rules; they must not be able to satisfy them.
const CODE = LOOP.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

describe('the sweep is actually reached by the running worker', () => {
  it('is awaited inside the main loop, not merely defined', () => {
    expect(CODE).toMatch(/await sweepStalledUploads\(\)/)
    const loopAt = CODE.indexOf('while (running)')
    expect(loopAt).toBeGreaterThan(-1)
    expect(CODE.indexOf('await sweepStalledUploads()', loopAt)).toBeGreaterThan(loopAt)
  })

  it('throttles, so it is not a query on every poll', () => {
    expect(CODE).toMatch(/now - lastUploadSweep < SWEEP_INTERVAL_MS/)
    expect(SWEEP_INTERVAL_MS).toBeGreaterThanOrEqual(60_000)
  })

  it('stamps the clock BEFORE the work, so one broken read is not a hot loop', () => {
    const fn = CODE.slice(CODE.indexOf('async function sweepStalledUploads'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body.indexOf('lastUploadSweep = now'))
      .toBeLessThan(body.indexOf("from('media_assets')"))
  })

  it('⚠️ NEVER FABRICATES AN ETAG OR A BYTE COUNT', () => {
    // `validateSource:323` compares the storage etag to `finalized_etag` ONLY
    // when one is present — that pin is what stops a replayed upload token from
    // getting different content validated. The sweep cannot attest to bytes a
    // client never committed to, so it must supply none. Passing the etag we
    // happen to observe would turn a real guarantee into a rubber stamp.
    expect(CODE).toMatch(/p_object_bytes: null, p_object_etag: null/)
    const fn = CODE.slice(CODE.indexOf('async function sweepStalledUploads'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    // ⚠️⚠️ MY FIRST VERSION OF THIS ASSERTION WAS WRONG WHILE THE CODE WAS RIGHT,
    // for the second time in two days. `/p_object_etag:\s*(?!null)/` looks like
    // it forbids a non-null etag, but `\s*` BACKTRACKS TO ZERO WIDTH, so the
    // lookahead is tested against " null" — which does not start with "null" —
    // and the pattern matches the very line it was meant to permit. A negative
    // assertion built on an optional-whitespace lookahead is not an assertion.
    // So every value is extracted and compared, which cannot backtrack.
    const values = (label: string) =>
      [...body.matchAll(new RegExp(`${label}:\\s*([A-Za-z0-9_.]+)`, 'g'))].map((m) => m[1])
    expect(values('p_object_etag')).toEqual(['null'])
    expect(values('p_object_bytes')).toEqual(['null'])
    expect(body).not.toMatch(/headObject|\.etag/)
  })

  it('only ever calls the one idempotent RPC, and never writes the table directly', () => {
    const fn = CODE.slice(CODE.indexOf('async function sweepStalledUploads'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/rpc\('editor_finalize_source'/)
    // A direct status write would bypass the transition guard's whole purpose.
    expect(body).not.toMatch(/\.update\(|\.upsert\(|\.delete\(/)
  })

  it('records the DENOMINATOR, not just how many it rescued', () => {
    // ⚖️ THE DEFECT THAT PUT THIS HERE WAS A NUMBER ON SCREEN WITHOUT THE FACT
    // BESIDE IT. "recovered: 3" cannot distinguish a healthy sweep from one that
    // failed on four of seven.
    const fn = CODE.slice(CODE.indexOf('async function sweepStalledUploads'))
    const body = fn.slice(0, fn.indexOf('\n}'))
    expect(body).toMatch(/candidates: ids\.length/)
    expect(body).toMatch(/recovered,/)
    expect(body).toMatch(/failed: failures\.length/)
  })
})
