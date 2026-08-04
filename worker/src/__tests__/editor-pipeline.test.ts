import { describe, expect, it } from 'vitest'
import {
  EDITOR_STAGES, REVIEW_PAUSE_STATUS, isAwaitingReview, isTerminal, stagePct, stagesFrom,
} from '../jobs/editorPipeline.js'
import { LeaseLostError, PermanentJobError, isLeaseLost, isPermanent } from '../errors.js'

describe('editor pipeline order', () => {
  it('matches the 0080 trigger pipeline exactly', () => {
    expect(EDITOR_STAGES).toEqual([
      'inspecting', 'transcribing', 'analyzing', 'directing',
      'compiling', 'rendering', 'validating',
    ])
  })

  it('runs the whole pipeline from queued', () => {
    expect(stagesFrom('queued')).toEqual([...EDITOR_STAGES])
  })

  it('resumes AT the interrupted stage (idempotent re-run), then continues', () => {
    expect(stagesFrom('inspecting')).toEqual([...EDITOR_STAGES])
    expect(stagesFrom('directing')).toEqual(['directing', 'compiling', 'rendering', 'validating'])
    expect(stagesFrom('validating')).toEqual(['validating'])
  })

  it('runs nothing for terminal or unknown statuses', () => {
    for (const s of ['completed', 'failed', 'cancelled']) expect(stagesFrom(s)).toEqual([])
    expect(stagesFrom('nonsense')).toEqual([])
  })

  it('the review pause is NOT a stage — it names work a person is doing', () => {
    // If it were in the array, `stagesFrom('directing')` would try to RUN it,
    // and the 0080 guard's strict +1 walk would make `directing -> compiling`
    // illegal — stranding every project already past directing the moment the
    // gate is switched off.
    expect((EDITOR_STAGES as readonly string[]).includes(REVIEW_PAUSE_STATUS)).toBe(false)
    expect(isTerminal(REVIEW_PAUSE_STATUS)).toBe(false)
    expect(isAwaitingReview(REVIEW_PAUSE_STATUS)).toBe(true)
    for (const s of [...EDITOR_STAGES, 'queued', 'completed']) expect(isAwaitingReview(s)).toBe(false)
  })

  it('a claim on a parked project runs NOTHING — and the caller must know why', () => {
    // The empty list is the same value an unknown status returns, and the
    // difference is destructive: the handler treats "no stages left" as "the
    // pipeline finished" and calls finishProject('completed'). A project parked
    // for review has not been compiled, rendered or validated, so it must be
    // recognised BEFORE the loop rather than after it.
    expect(stagesFrom(REVIEW_PAUSE_STATUS)).toEqual([])
    expect(stagesFrom('nonsense')).toEqual([])
    expect(isAwaitingReview('nonsense')).toBe(false)
  })

  it('a submitted review resumes at compiling, not at the pause', () => {
    // `editor_submit_review` sets the project to `compiling` and queues the
    // resume job, so the resume path is the ordinary crash-resume one and needs
    // no second mechanism.
    expect(stagesFrom('compiling')).toEqual(['compiling', 'rendering', 'validating'])
  })

  it('classifies terminality', () => {
    expect(isTerminal('completed')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
    expect(isTerminal('queued')).toBe(false)
    expect(isTerminal('rendering')).toBe(false)
  })

  it('produces strictly increasing pct across the pipeline, all under 100', () => {
    const pcts = EDITOR_STAGES.map(stagePct)
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeGreaterThan(pcts[i - 1])
    expect(pcts[0]).toBeGreaterThan(0)
    expect(pcts[pcts.length - 1]).toBeLessThan(100) // 100 is reserved for completed
  })
})

describe('failure classification', () => {
  it('PermanentJobError is permanent, plain Error is retryable', () => {
    expect(isPermanent(new PermanentJobError('bad input'))).toBe(true)
    expect(isPermanent(new Error('ECONNRESET'))).toBe(false)
  })

  it('typed DB refusals map to the right class', () => {
    expect(isPermanent(new Error('project_terminal: project x is already cancelled'))).toBe(true)
    expect(isLeaseLost(new Error('lease_lost: worker w no longer holds the running lease for project x'))).toBe(true)
    expect(isLeaseLost(new LeaseLostError('lease lost before stage directing'))).toBe(true)
    expect(isPermanent(new Error('stage_timeout: rendering exceeded 5000ms'))).toBe(false) // timeouts retry
  })
})
