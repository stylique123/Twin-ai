// ⚠️ EVERY CASE HERE COMES FROM ONE REAL LOST TAKE. A creator recorded through
// the teleprompter, was told the recording looked good, watched an upload run
// for five minutes, saw it reach 100%, and was then refused with "The object
// exceeded the maximum allowed size". These tests pin the four things that went
// wrong so none of them can come back quietly.
import { describe, it, expect } from 'vitest'
import {
  preflight, classifyUploadFailure, mayRetry, saveStageLabel, isSaved,
  SUPPORTED_MAX_BYTES, RESUMABLE_THRESHOLD_BYTES,
} from '../uploadCeiling'

const MB = 1024 * 1024

describe('the supported ceiling is the product decision, not the platform setting', () => {
  it('supports 600 MB, the same number the buckets already carry', () => {
    expect(SUPPORTED_MAX_BYTES).toBe(600 * MB)
  })
  // ⚠️ TWO TESTS WERE DELETED HERE, AND THEY WERE THE ONLY READERS OF WHAT THEY
  // TESTED. `expect(TARGET_MAX_BYTES).toBe(300 * MB)` restates the declaration
  // one file away and can only fail if someone edits the declaration — which a
  // grep for readers reads as "this constant is used". A test asserting about
  // its own subject and nothing else is a reader that isn't one, and it is how
  // both constants survived with no caller for as long as they did.
  //
  // ⚠️ MEASURED, NOT ASSUMED, AND IT CORRECTED ME. I expected deleting two
  // reader-less constants to drop `check_symbol_readers` from 145 unregistered
  // to 143. It stayed at 145 — because the IMPORT in this test file was
  // counted as a reader, so neither constant was ever in the unregistered set.
  // The tautology was not merely failing to catch the problem; it was HIDING
  // it from the guard built to find exactly this.
  //
  // ⚖️ THE CEILING THAT IS READ IS TESTED THROUGH ITS READER. Every assertion
  // below drives `preflight`, so removing the constant from `preflight` — not
  // merely changing its value — is what turns these red.
  it('the hard ceiling is enforced through preflight, not merely declared', () => {
    const over = preflight(SUPPORTED_MAX_BYTES + 1)
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.reason).toBe('too_large')
    const at = preflight(SUPPORTED_MAX_BYTES)
    expect(at.ok, 'the boundary itself must be accepted, not refused').toBe(true)
  })

  it('the refusal quotes both real figures, so "too big" is never bare', () => {
    const over = preflight(700 * MB)
    expect(over.ok).toBe(false)
    if (!over.ok) {
      expect(over.message).toContain('700.0 MB')
      expect(over.message).toContain('600.0 MB')
      // The creator still has the file. Saying so is part of the contract.
      expect(over.message).toMatch(/has not been deleted/)
    }
  })
})

describe('preflight refuses before a byte moves', () => {
  it('a normal take is accepted and routed to the resumable path', () => {
    const p = preflight(120 * MB)
    expect(p.ok).toBe(true)
    if (p.ok) expect(p.transport).toBe('resumable')
  })
  it('a small take may still go in one request', () => {
    const p = preflight(2 * MB)
    expect(p.ok).toBe(true)
    if (p.ok) expect(p.transport).toBe('single')
  })
  it('the threshold routes by the platform guidance, not by hope', () => {
    const under = preflight(RESUMABLE_THRESHOLD_BYTES - 1)
    const over = preflight(RESUMABLE_THRESHOLD_BYTES + 1)
    expect(under.ok && under.transport).toBe('single')
    expect(over.ok && over.transport).toBe('resumable')
  })
  it('exactly at the ceiling is accepted — the limit is inclusive', () => {
    expect(preflight(SUPPORTED_MAX_BYTES).ok).toBe(true)
  })
  // ⚠️ REFUSED UP FRONT, WITH BOTH NUMBERS. Discovering this after five minutes
  // of uploading is the failure being fixed.
  it('over the ceiling is refused before uploading, naming both figures', () => {
    const p = preflight(700 * MB)
    expect(p.ok).toBe(false)
    if (!p.ok) {
      expect(p.reason).toBe('too_large')
      expect(p.message).toContain('700.0 MB')
      expect(p.message).toContain('600.0 MB')
    }
  })
  it('and promises the recording is not gone', () => {
    const p = preflight(700 * MB)
    expect(p.ok).toBe(false)
    if (!p.ok) expect(p.message.toLowerCase()).toContain('not been deleted')
  })
  // ⚠️ ABSENT IS NOT SMALL.
  it('an unreadable size is refused rather than optimistically streamed', () => {
    for (const bad of [undefined, null, NaN, 0, -1, '12']) {
      const p = preflight(bad as never)
      expect(p.ok).toBe(false)
      if (!p.ok) expect(p.reason).toBe('unknown_size')
    }
  })
})

describe('a refusal is never retried, a fault always may be', () => {
  // ⚠️ THE EXACT SENTENCE A REAL CREATOR SAW.
  it('the platform size message is deterministic', () => {
    expect(classifyUploadFailure(null, 'The object exceeded the maximum allowed size')).toBe('deterministic')
  })
  it('413 is deterministic', () => expect(classifyUploadFailure(413)).toBe('deterministic'))
  it('auth failures are deterministic', () => {
    expect(classifyUploadFailure(401)).toBe('deterministic')
    expect(classifyUploadFailure(403)).toBe('deterministic')
  })
  it('server faults and rate limits are transient', () => {
    expect(classifyUploadFailure(500)).toBe('transient')
    expect(classifyUploadFailure(503)).toBe('transient')
    expect(classifyUploadFailure(429)).toBe('transient')
    expect(classifyUploadFailure(408)).toBe('transient')
  })
  it('a dropped connection is transient', () => {
    expect(classifyUploadFailure(null, 'upload network error')).toBe('transient')
    expect(classifyUploadFailure(null, 'upload timed out after 600000ms')).toBe('transient')
  })
  it('an unrecognised failure is unknown, not assumed either way', () => {
    expect(classifyUploadFailure(null, 'something nobody named')).toBe('unknown')
  })
  // ⚖️ THE RULE THE OLD CODE BROKE. A bare catch re-sent the whole blob through
  // a second path, so a size rejection cost the creator two full uploads.
  it('deterministic failures may NOT be retried', () => {
    expect(mayRetry('deterministic')).toBe(false)
  })
  it('transient and unknown failures may be', () => {
    expect(mayRetry('transient')).toBe(true)
    expect(mayRetry('unknown')).toBe(true)
  })
})

describe('bytes sent is not bytes kept', () => {
  // ⚠️ 100% MEANT "THE BROWSER FINISHED WRITING", AND THE UI CALLED IT DONE.
  it('there is a stage between finished uploading and saved', () => {
    expect(saveStageLabel('finishing')).not.toEqual(saveStageLabel('saved'))
  })
  it('only saved counts as saved', () => {
    expect(isSaved('saved')).toBe(true)
    for (const s of ['uploading', 'finishing', 'failed'] as const) expect(isSaved(s)).toBe(false)
  })
  it('every label is plain English with no internals in it', () => {
    for (const s of ['uploading', 'finishing', 'saved', 'failed'] as const) {
      const label = saveStageLabel(s).toLowerCase()
      for (const word of ['bucket', 'blob', 'finalize', 'http', 'xhr', 'storage', 'object']) {
        expect(label).not.toContain(word)
      }
    }
  })
})
