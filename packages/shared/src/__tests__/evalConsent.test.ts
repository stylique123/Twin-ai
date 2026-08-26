import { describe, it, expect } from 'vitest'
import { consentAdmits, admissionSummary } from '../evalConsent.js'

const REC = '2026-08-20T12:00:00Z'
const ok = {
  participant_ref: 'P-07',
  artifact_location: 'cabinet/2026/P-07.pdf',
  granted_at: '2026-08-19T09:00:00Z',
  withdrawn_at: null,
}

describe('consentAdmits refuses by default', () => {
  // ⚠️ THE LOAD-BEARING CASE. An absent row means nobody has looked, not that
  // nobody objected. Silence is not permission.
  it.each([
    ['null', null], ['undefined', undefined],
  ])('%s consent is refused, not waved through', (_l, row) => {
    const v = consentAdmits(row as null, REC)
    expect(v.admits).toBe(false)
    expect(v.refusal).toBe('no_consent_on_record')
  })

  it('a withdrawn consent is refused however well-formed', () => {
    const v = consentAdmits({ ...ok, withdrawn_at: '2026-08-25T00:00:00Z' }, REC)
    expect(v.admits).toBe(false)
    expect(v.refusal).toBe('consent_withdrawn')
    expect(v.message).toContain('deleted')
  })

  // ⚠️ #204: "in writing, BEFORE recording". Agreeing afterwards is bookkeeping.
  it('a consent dated after the recording is refused', () => {
    const v = consentAdmits({ ...ok, granted_at: '2026-08-21T09:00:00Z' }, REC)
    expect(v.admits).toBe(false)
    expect(v.refusal).toBe('consent_after_recording')
  })

  it('no filed location means nobody can produce the document', () => {
    for (const bad of [null, undefined, '', '   ']) {
      expect(consentAdmits({ ...ok, artifact_location: bad }, REC).refusal).toBe('no_artifact_location')
    }
  })

  // ⚠️ 1970 IS THE TRAP. A coerced-to-0 timestamp pre-dates every recording and
  // would admit the whole cohort. The null check must precede the coercion.
  it.each([
    ['null', null], ['undefined', undefined], ['empty', ''],
    ['not a date', 'whenever'], ['a number', 0], ['zero-ish', 0 as unknown],
  ])('granted_at = %s is undated, never 1970', (_l, v) => {
    expect(consentAdmits({ ...ok, granted_at: v }, REC).refusal).toBe('consent_undated')
  })

  // An unknown recording date cannot be shown to post-date the consent, so it
  // fails the ordering test rather than skipping it.
  it.each([[null], [undefined], ['not a date']])('an unknown recording date refuses (%s)', (r) => {
    expect(consentAdmits(ok, r as string).admits).toBe(false)
  })

  it('a complete, live, pre-dated consent admits', () => {
    const v = consentAdmits(ok, REC)
    expect(v.admits).toBe(true)
    expect(v.refusal).toBeNull()
    expect(v.message).toBe('')
  })
})

describe('admissionSummary', () => {
  // ⚠️ BOTH NUMBERS. #204's bar is stated over all twelve; a denominator that
  // drops the refused recordings is not a pass.
  it('reports admitted, refused and total together', () => {
    const vs = [consentAdmits(ok, REC), consentAdmits(null, REC), consentAdmits(ok, REC)]
    expect(admissionSummary(vs)).toEqual({ admitted: 2, refused: 1, total: 3 })
  })
  it('is all zeros for an empty cohort', () => {
    expect(admissionSummary([])).toEqual({ admitted: 0, refused: 0, total: 0 })
  })
})
