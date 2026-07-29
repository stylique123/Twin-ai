// Batch 8.5 — is a failed compile retried?
//
// It was, five times. `EditPlanError` is thrown by `compileEditPlan` and
// `validateEditPlan`, both pure functions of immutable pinned evidence and an
// immutable decision: attempt two has EXACTLY the inputs attempt one had, so it
// produces exactly the same failure. Three separate classifiers nonetheless
// tested `err instanceof PermanentJobError`, which an EditPlanError is not, so a
// deterministic failure burned the whole retry budget and then settled the
// project as `retries_exhausted` — discarding `edit_plan_divergent`, the one
// code that said what had actually gone wrong.
//
// The classifiers now test a STRUCTURAL flag, because errors.ts cannot import
// the plan contract without a cycle. A structural test is only as good as the
// flag being there, so the first case below is the one that matters: it asserts
// the flag on the real class, not on a local stand-in.
import { describe, it, expect } from 'vitest'
import { PermanentJobError, LeaseLostError, declaresPermanent, isPermanent, permanentCode } from '../errors.js'
import { sanitizeError, queueSafeError } from '../sanitizeError.js'
import { EditPlanError } from '../jobs/editPlanContract.js'

describe('EditPlanError declares itself permanent', () => {
  it('carries the flag AND its stable code — the whole basis of the structural test', () => {
    const err = new EditPlanError('upload source carries accepted capture windows', 'edit_plan_divergent')
    expect(declaresPermanent(err)).toBe(true)
    expect(isPermanent(err)).toBe(true)
    expect(permanentCode(err)).toBe('edit_plan_divergent')
  })

  it('PermanentJobError still qualifies — the change widened the test, it did not move it', () => {
    const err = new PermanentJobError('nope', 'source_missing')
    expect(declaresPermanent(err)).toBe(true)
    expect(permanentCode(err)).toBe('source_missing')
  })
})

describe('what must NOT be treated as permanent', () => {
  it('a plain Error is retryable', () => {
    expect(declaresPermanent(new Error('storage download failed'))).toBe(false)
    expect(isPermanent(new Error('storage download failed'))).toBe(false)
  })

  it('a lost lease is not permanence — it is somebody else driving', () => {
    expect(declaresPermanent(new LeaseLostError('lease_lost'))).toBe(false)
  })

  it('MUTATION: an object that merely LOOKS permanent but is not an Error does not qualify', () => {
    expect(declaresPermanent({ permanent: true, code: 'edit_plan_invalid' })).toBe(false)
  })

  it('MUTATION: a truthy-but-not-true flag does not qualify', () => {
    const err = Object.assign(new Error('x'), { permanent: 1, code: 'edit_plan_invalid' })
    expect(declaresPermanent(err)).toBe(false)
  })

  it('MUTATION: the flag without a usable code does not qualify', () => {
    // A permanent error with no code would be recorded as an empty failure
    // reason, which is worse than being retried: it settles the project while
    // saying nothing about why.
    expect(declaresPermanent(Object.assign(new Error('x'), { permanent: true }))).toBe(false)
    expect(declaresPermanent(Object.assign(new Error('x'), { permanent: true, code: '' }))).toBe(false)
  })

  it('non-Error values never qualify', () => {
    for (const v of [null, undefined, 'edit_plan_divergent', 42]) {
      expect(declaresPermanent(v)).toBe(false)
    }
  })
})

describe('the durable record tells the truth about a compile failure', () => {
  const err = new EditPlanError('the plan diverges from the recorded one', 'edit_plan_divergent')

  it('records the real code and classifies it permanent', () => {
    const safe = sanitizeError(err, 'compiling')
    expect(safe.code).toBe('edit_plan_divergent')
    expect(safe.retry).toBe('permanent')
    expect(safe.stage).toBe('compiling')
  })

  it('a retryable failure is still recorded as retryable', () => {
    expect(sanitizeError(new Error('storage download failed'), 'rendering').retry).toBe('retryable')
  })

  it('the message is still redacted — permanence does not buy an exemption', () => {
    const leaky = new EditPlanError('plan rejected at https://x.co/o?token=abcdefghijkl', 'edit_plan_invalid')
    expect(sanitizeError(leaky, 'compiling').message).not.toContain('token=')
  })
})

describe('the classification SURVIVES the queue boundary', () => {
  // index.ts classifies the error it CATCHES, not the one the stage threw. An
  // EditPlanError downgraded to a plain Error here is a dead-lettering job
  // turned back into a retrying one — this is the load-bearing assertion.
  const err = new EditPlanError('no kept media', 'edit_plan_no_kept_media')

  it('crosses as a PermanentJobError carrying the original code', () => {
    const out = queueSafeError(err, sanitizeError(err, 'compiling'))
    expect(out).toBeInstanceOf(PermanentJobError)
    expect((out as PermanentJobError).code).toBe('edit_plan_no_kept_media')
    expect(isPermanent(out)).toBe(true)
  })

  it('CONTROL: a retryable error crosses as a plain Error and stays retryable', () => {
    const plain = new Error('ffprobe timed out')
    const out = queueSafeError(plain, sanitizeError(plain, 'rendering'))
    expect(out).not.toBeInstanceOf(PermanentJobError)
    expect(isPermanent(out)).toBe(false)
  })
})

describe('the fenced-RPC refusals are recognised, but only by isPermanent', () => {
  // `isPermanent` also matches these by message; `declaresPermanent` does not,
  // deliberately — the code written into durable state is one the THROWER chose,
  // never one a regex inferred.
  const rpc = new Error('editor_record_edit_plan: project_terminal')

  it('the queue dead-letters it', () => {
    expect(isPermanent(rpc)).toBe(true)
  })

  it('the record does not invent a code for it', () => {
    expect(declaresPermanent(rpc)).toBe(false)
    expect(sanitizeError(rpc, 'compiling').code).not.toBe('permanent_failure')
  })
})
