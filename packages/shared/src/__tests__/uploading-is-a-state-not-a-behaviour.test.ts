// TWO TAKES HAVE READ `uploading` SINCE 2026-08-09, AND NEITHER IS ABANDONMENT.
//
// ⚠️ THE REAL ROWS. 59.8MB and 123.7MB, both with NO object in storage; the only
// take that ever reached storage was 5.8MB and was then rejected for a WebM
// container that had not written its duration. The transport never completed and
// the cause was ours — a single-shot XHR PUT with no `ontimeout`/`onabort`, so a
// timed-out upload left a promise that never settled.
//
// ⚖️ SO "recording started but not completed" MAY NOT BE READ AS A CREATOR
// GIVING UP. Pooling human abandonment with system failure is the aggregation
// that gets somebody spending a quarter on a friendlier record button while the
// actual defect is a missing event handler.
import { describe, expect, it } from 'vitest'
import {
  classifyUpload, tallyUploads, oursCount, UPLOAD_OUTCOMES, OUR_FAULT,
  IN_FLIGHT_GRACE_MS, CANNOT_YET_DISTINGUISH,
} from '../uploadForensics'

const T0 = Date.parse('2026-08-09T21:38:00.000Z')
const at = (ms: number) => new Date(T0 + ms).toISOString()
const row = (over: Partial<Parameters<typeof classifyUpload>[0]> = {}) => ({
  status: 'uploading', declaredBytes: 59_789_260, finalizedEtag: null,
  objectExists: false, storedBytes: null,
  createdAt: at(0), asOf: at(10 * 24 * 60 * 60_000),
  ...over,
})

describe('the three real production rows', () => {
  it('the 5.8MB take that landed and was refused is OURS, not the creator', () => {
    expect(classifyUpload(row({
      status: 'rejected', declaredBytes: 5_825_821, storedBytes: 5_825_821,
      objectExists: true, finalizedEtag: '"237f33a9"',
    }))).toBe('validation_failed')
  })

  it('the 59.8MB and 123.7MB takes are STALLED — the classifier cannot say more', () => {
    // ⚠️ THIS ASSERTION CHANGED, AND THE CHANGE IS THE CORRECTION. It used to
    // read `upload_never_landed`, which is a verdict about CAUSE reached from a
    // clock. We do in fact know the cause of these two — a single-shot XHR PUT
    // with no `ontimeout` — but we know it from reading the code, not from
    // anything in the row. Neither of these rows carries a client report,
    // because there was no way to send one until 0149. So the honest output is
    // `stalled`, and the real finding lives where it was actually established.
    expect(classifyUpload(row())).toBe('stalled')
    expect(classifyUpload(row({ declaredBytes: 123_679_858 }))).toBe('stalled')
  })

  it('so only ONE of the three counts as ours from the data alone', () => {
    // ⚖️ AND THAT IS THE POINT. A number that decides what to fix must be built
    // from what is recorded. Inflating it with two rows whose cause we inferred
    // is how the same reasoning error gets made again later, by somebody with
    // less context and more confidence.
    const t = tallyUploads([
      row({ status: 'rejected', declaredBytes: 5_825_821, storedBytes: 5_825_821, objectExists: true, finalizedEtag: '"e"' }),
      row(),
      row({ declaredBytes: 123_679_858 }),
    ])
    expect(oursCount(t)).toBe(1)
    expect(t.validation_failed).toBe(1)
    expect(t.stalled).toBe(2)
    expect(t.upload_never_landed).toBe(0)
  })

  it('and a client report is what promotes a stall to a verdict', () => {
    // ⚠️ THE SAME ROW, THREE ANSWERS, DECIDED BY THE REPORT AND NOTHING ELSE.
    expect(classifyUpload(row({ report: 'failed' }))).toBe('upload_never_landed')
    expect(classifyUpload(row({ report: 'abandoned' }))).toBe('creator_abandoned')
    expect(classifyUpload(row({ report: 'progressing' }))).toBe('in_flight')
    expect(classifyUpload(row({ report: null }))).toBe('stalled')
  })
})

describe('a fresh row is still going, not broken', () => {
  it('calls a recent upload with no object IN FLIGHT', () => {
    // ⚠️ Calling this a failure is how a funnel reports its own live traffic as
    // breakage — and it gets worse the more people use the product.
    expect(classifyUpload(row({ asOf: at(60_000) }))).toBe('in_flight')
  })

  it('only past the grace period does an absent object mean anything', () => {
    expect(classifyUpload(row({ asOf: at(IN_FLIGHT_GRACE_MS - 1) }))).toBe('in_flight')
    expect(classifyUpload(row({ asOf: at(IN_FLIGHT_GRACE_MS + 1) }))).toBe('stalled')
  })
})

describe('the states between landed and accepted', () => {
  it('whole bytes with no finalize receipt is finalize_not_called', () => {
    expect(classifyUpload(row({
      objectExists: true, storedBytes: 59_789_260, finalizedEtag: null,
    }))).toBe('finalize_not_called')
  })

  it('short bytes is a genuinely interrupted upload — no report needed', () => {
    // ⚖️ UNLIKE THE NO-OBJECT CASE, the evidence is IN the row: a short object
    // proves the transport ran and stopped mid-way. This verdict never rested
    // on a clock, so the correction does not touch it.
    expect(classifyUpload(row({
      objectExists: true, storedBytes: 1_000_000,
    }))).toBe('upload_partial')
  })

  it('but the creator saying they gave up outranks even that', () => {
    expect(classifyUpload(row({
      objectExists: true, storedBytes: 1_000_000, report: 'abandoned',
    }))).toBe('creator_abandoned')
  })

  it('finalized, whole and still unsettled is UNKNOWN rather than a guess', () => {
    // ⚖️ Validation has not run or has not finished. Nothing in the row says
    // which, so nothing here claims one.
    expect(classifyUpload(row({
      objectExists: true, storedBytes: 59_789_260, finalizedEtag: '"e"',
    }))).toBe('unknown')
  })

  it('rejected WITHOUT bytes is not the same story as rejected WITH them', () => {
    // ⚠️ Both are `rejected`; only one is validation refusing good work.
    expect(classifyUpload(row({ status: 'rejected', objectExists: false }))).toBe('unknown')
  })
})

describe('what this deliberately refuses to say', () => {
  it('reaches abandonment ONLY through a report, never through a clock', () => {
    // ⚠️ THE VERDICT NOW EXISTS BECAUSE THE EVIDENCE DOES — and it stays
    // unreachable without it. No combination of age, size or status produces
    // `creator_abandoned`; only the client's own word does.
    expect(UPLOAD_OUTCOMES).toContain('creator_abandoned')
    for (const status of ['uploading', 'rejected', 'validating', 'ready']) {
      for (const age of [0, IN_FLIGHT_GRACE_MS + 1, 365 * 24 * 60 * 60_000]) {
        for (const objectExists of [true, false]) {
          const got = classifyUpload(row({ status, objectExists, asOf: at(age), storedBytes: objectExists ? 1_000 : null }))
          expect(got, `${status}/${age}/${objectExists}`).not.toBe('creator_abandoned')
        }
      }
    }
  })

  it('still names what it cannot separate without one', () => {
    expect(CANNOT_YET_DISTINGUISH).toMatch(/media_upload_attempts/)
    expect(CANNOT_YET_DISTINGUISH).toMatch(/identical/)
    expect(CANNOT_YET_DISTINGUISH).toMatch(/stalled/)
  })

  it('keeps in_flight, unknown, stalled and abandonment OUT of the our-fault count', () => {
    // ⚖️ "We have not decided yet" must never inflate the number that decides
    // what to fix — and `stalled` is the single largest way that could happen.
    expect(OUR_FAULT.has('in_flight')).toBe(false)
    expect(OUR_FAULT.has('unknown')).toBe(false)
    expect(OUR_FAULT.has('stalled')).toBe(false)
    expect(OUR_FAULT.has('creator_abandoned')).toBe(false)
    expect(OUR_FAULT.has('accepted')).toBe(false)
  })

  it('every outcome is either accepted, ours, the creator, or explicitly undecided', () => {
    for (const o of UPLOAD_OUTCOMES) {
      const accounted = o === 'accepted' || OUR_FAULT.has(o)
        || o === 'in_flight' || o === 'unknown' || o === 'stalled' || o === 'creator_abandoned'
      expect(accounted, o).toBe(true)
    }
  })
})
