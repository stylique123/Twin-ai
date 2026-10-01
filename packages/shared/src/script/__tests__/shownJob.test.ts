import { describe, it, expect } from 'vitest'
import { normalizeShownJob, auditShownScript, SHOWN_JOB_RULE } from '../shownJob'

describe('the shown job of each beat (owner spec 2026-10-01)', () => {
  it('reads a declared job and falls back from the section', () => {
    expect(normalizeShownJob('Demo', 'Middle')).toBe('demo')
    expect(normalizeShownJob(undefined, 'CTA')).toBe('cta')
    expect(normalizeShownJob('nonsense', 'Setup')).toBe('talk')
  })
  it('a sales script with a showable product must show it in use', () => {
    const talkOnly = auditShownScript([{ shown_job: 'talk' }, { shown_job: 'cta' }], { sellsShowable: true })
    expect(talkOnly.showsInUse).toBe(false)
    const withDemo = auditShownScript([{ shown_job: 'talk' }, { shown_job: 'demo' }], { sellsShowable: true })
    expect(withDemo.showsInUse).toBe(true)
    expect(auditShownScript([{ shown_job: 'talk' }], { sellsShowable: false }).showsInUse).toBeNull()
  })
  it('counts generic gestures, a demo framed like talk, and distinct locations', () => {
    const a = auditShownScript([
      { shown_job: 'talk', location: 'kitchen wall', direction: 'medium', action_posing: 'Gesture naturally' },
      { shown_job: 'demo', location: 'kitchen wall', direction: 'medium', action_posing: 'Pour it, hands in frame' },
      { shown_job: 'cta', location: 'window', direction: 'close' },
    ], { sellsShowable: true })
    expect(a.genericGestures).toBe(1)
    expect(a.showingFramedLikeTalk).toBe(1)
    expect(a.distinctLocations).toBe(2)
  })
  it('the writer is told every job and the demonstration rule', () => {
    expect(SHOWN_JOB_RULE).toMatch(/app_payoff/)
    expect(SHOWN_JOB_RULE).toMatch(/at least one demo/)
  })
})

import { referenceShownKept } from '../shownJob'
describe('phase 4: a remix keeps where the reference showed things', () => {
  it('counts the reference\'s non-talk beats the script kept in place', () => {
    expect(referenceShownKept(['talk', 'demo', 'talk', 'cta'], ['talk', 'talk', 'process', 'talk', 'talk', 'cta'])).toEqual({ kept: 2, of: 2 })
    expect(referenceShownKept(['talk', 'demo', 'talk', 'talk', 'talk', 'cta'], ['talk', 'talk', 'talk', 'talk', 'talk', 'cta'])).toEqual({ kept: 1, of: 2 })
    expect(referenceShownKept([], ['talk'])).toBeNull()
  })
})
