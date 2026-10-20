// DISCONNECT TEST, ledger row 2: ANGLE_FIT in generation (#1268).
// Fictional fixture only (Juniper Candle Co., made up). No model call.
import { describe, it, expect } from 'vitest'
import { pickAngleCards, angleCardsRecord } from '../../angleFit'
import { EDGE, edgeGate, edgeAfter } from './edge'

const material = [
  { id: 'k1', slot: 'story' as const, text: 'I burned my first batch in a cold garage.' },
  { id: 'k2', slot: 'stance' as const, text: 'Cheap wicks ruin good wax.' },
  { id: 'p1', slot: 'what_it_is' as const, text: 'A soy candle in a tin.' },
]

/** What the edge writes to the blueprint (index.ts: `if (angleFitOn) angleCardsRec = ...`; `if (angleCardsRec) bp.angle_cards = ...`). */
function blueprintFor(on: boolean): Record<string, unknown> {
  const bp: Record<string, unknown> = {}
  const cards = pickAngleCards({ goal: 'sell', hasProduct: true, material })
  const rec = on ? angleCardsRecord(cards) : null
  if (rec) bp.angle_cards = rec
  return bp
}
const gate = (env: Record<string, string>, body: Record<string, unknown> = {}, trialOn = true) =>
  edgeGate('angleFitOn', { trialOn, body }, env) as boolean

describe('ANGLE_FIT disconnect', () => {
  it('the edge gate: on for the trial, off with ANGLE_FIT_KILL=1, body angle_fit:false or no trial', () => {
    expect(gate({})).toBe(true)
    expect(gate({ ANGLE_FIT_KILL: '1' })).toBe(false)
    expect(gate({}, { angle_fit: false })).toBe(false)
    expect(gate({}, {}, false)).toBe(false)
  })
  it('on: the blueprint carries three angle cards; off: it carries none', () => {
    const on = blueprintFor(gate({}))
    const off = blueprintFor(gate({ ANGLE_FIT_KILL: '1' }))
    expect(on).not.toEqual(off)
    expect(Array.isArray(on.angle_cards)).toBe(true)
    expect((on.angle_cards as unknown[]).length).toBe(3)
    expect(off.angle_cards).toBeUndefined()
  })
  it('the edge still makes the call under the gate and saves the record', () => {
    expect(edgeAfter('if (angleFitOn) {', 120)).toContain('angleCardsRec = angleCardsRecord(cards)')
    expect(EDGE).toContain('if (angleCardsRec) bp.angle_cards = angleCardsRec')
  })
})
