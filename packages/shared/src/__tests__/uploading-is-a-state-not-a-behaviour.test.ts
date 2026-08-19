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

  it('the 59.8MB and 123.7MB takes never landed', () => {
    expect(classifyUpload(row())).toBe('upload_never_landed')
    expect(classifyUpload(row({ declaredBytes: 123_679_858 }))).toBe('upload_never_landed')
  })

  it('all three are our fault, and the tally says so', () => {
    const t = tallyUploads([
      row({ status: 'rejected', declaredBytes: 5_825_821, storedBytes: 5_825_821, objectExists: true, finalizedEtag: '"e"' }),
      row(),
      row({ declaredBytes: 123_679_858 }),
    ])
    expect(oursCount(t)).toBe(3)
    expect(t.validation_failed).toBe(1)
    expect(t.upload_never_landed).toBe(2)
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
    expect(classifyUpload(row({ asOf: at(IN_FLIGHT_GRACE_MS + 1) }))).toBe('upload_never_landed')
  })
})

describe('the states between landed and accepted', () => {
  it('whole bytes with no finalize receipt is finalize_not_called', () => {
    expect(classifyUpload(row({
      objectExists: true, storedBytes: 59_789_260, finalizedEtag: null,
    }))).toBe('finalize_not_called')
  })

  it('short bytes is a genuinely interrupted upload', () => {
    expect(classifyUpload(row({
      objectExists: true, storedBytes: 1_000_000,
    }))).toBe('upload_partial')
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
  it('offers no "creator abandoned it" verdict at all', () => {
    // ⚠️ A closed tab and a hung upload leave IDENTICAL rows. Offering the value
    // would invite somebody to pick it, and the first person to do so would be
    // guessing with a confident-looking word.
    expect(UPLOAD_OUTCOMES).not.toContain('abandoned')
    expect(UPLOAD_OUTCOMES).not.toContain('user_abandoned')
    expect(CANNOT_YET_DISTINGUISH).toMatch(/upload_started_at/)
    expect(CANNOT_YET_DISTINGUISH).toMatch(/identical rows/)
  })

  it('keeps in_flight and unknown OUT of the our-fault count', () => {
    // ⚖️ "We have not decided yet" must never inflate the number that decides
    // what to fix.
    expect(OUR_FAULT.has('in_flight')).toBe(false)
    expect(OUR_FAULT.has('unknown')).toBe(false)
    expect(OUR_FAULT.has('accepted')).toBe(false)
  })

  it('every outcome is either accepted, ours, or explicitly undecided', () => {
    for (const o of UPLOAD_OUTCOMES) {
      const accounted = o === 'accepted' || OUR_FAULT.has(o) || o === 'in_flight' || o === 'unknown'
      expect(accounted, o).toBe(true)
    }
  })
})
