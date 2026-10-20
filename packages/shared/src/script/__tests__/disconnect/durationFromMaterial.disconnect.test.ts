// DISCONNECT TEST, ledger row 9: duration from material (#1273, #1284). Kill switch DURATION_FROM_MATERIAL=false.
// Fictional fixture only (a made-up soap maker's ledger). No model call.
import { describe, it, expect } from 'vitest'
import type { LedgerItem } from '../../inventionGate'
import { chooseDuration, countsFromLedger } from '../../templates/durationFromMaterial'
import { profileForSeconds } from '../../templates/scriptTemplates'
import { DURATION_PROFILES } from '../../templates/templateData'
import { EDGE, edgeGate, edgeAfter } from './edge'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin' | 'text'>): LedgerItem => ({
  product_id: null, field: null, numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})
// A thin creator: one fact of hers, nothing else.
const ledger = [item({ id: 'f1', origin: 'her_fact', text: 'Each oat soap bar cures for six weeks.' })]

/** The edge block (index.ts ~12458): under the gate the requested length is lowered to what her material fills. */
function targetSecondsFor(on: boolean, requested = 90): number {
  const body = { target_seconds: requested }
  if (on) {
    const c = chooseDuration(profileForSeconds(body.target_seconds, false), { ...countsFromLedger(ledger, null), note_moment: false })
    if (c.chosen !== c.requested) body.target_seconds = DURATION_PROFILES[c.chosen].seconds
  }
  return body.target_seconds
}
const gate = (env: Record<string, string>, trialOn = true) => edgeGate('durationFromMaterialOn', { trialOn }, env) as boolean

describe('DURATION_FROM_MATERIAL disconnect', () => {
  it('the edge gate: on for the trial, off with DURATION_FROM_MATERIAL=false', () => {
    expect(gate({})).toBe(true)
    expect(gate({ DURATION_FROM_MATERIAL: 'false' })).toBe(false)
  })
  it('on: a thin creator asking for Deep gets an honest Sprint; off: the requested 90 s stands', () => {
    const on = targetSecondsFor(gate({}))
    const off = targetSecondsFor(gate({ DURATION_FROM_MATERIAL: 'false' }))
    expect(on).not.toBe(off)
    expect(off).toBe(90)
    expect(on).toBe(DURATION_PROFILES.sprint.seconds)
  })
  it('the edge still lowers the length under the gate', () => {
    const block = edgeAfter('if (durationFromMaterialOn) {', 1800)
    expect(block).toContain('durationChoice = chooseDuration(profileForSeconds(want, software)')
    expect(block).toContain('body.target_seconds = software ? p.software_seconds : p.seconds')
    expect(EDGE).toContain('if (durationChoice) bpw.duration_choice = durationChoice')
  })
})
