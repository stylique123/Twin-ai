// HOOK GATE v2 (held; flag HOOK_GATE_V2, default off, test accounts only).
// Fictional fixture only: a made-up candle maker.
import { describe, it, expect } from 'vitest'
import { hookClaimRisk, hookClaimRiskV2, hookGateV2On, type TargetedItemV2 } from '../checkLines'
import { parseNumbers, type LedgerItem } from '../inventionGate'
import { runHookEngine } from '../hooks/hookEngine'

const items: TargetedItemV2[] = [
  { text: 'My first pour cracked down the middle because I cooled the jars by an open window in my garage.', first_party: true, live: false },
  { text: 'A customer said the cedar candle smelled like a campfire after rain.', first_party: true, live: false },
  { text: 'I test three wicks in every new jar before I pick one.', first_party: true, live: false },
]

describe('hookClaimRiskV2', () => {
  it('flags a number promise unless she counts the same thing', () => {
    expect(hookClaimRiskV2('Two rules that make candles burn evenly.', items)).toBe('number_promise')
    expect(hookClaimRiskV2('Three simple tricks for a clean burn.', items)).toBe('number_promise')
    expect(hookClaimRiskV2('Why I test three wicks before every pour.', items)).toBeNull()
  })
  it('flags invented scene details', () => {
    expect(hookClaimRiskV2('My first pour cracked in my living room.', items)).toBe('invented_scene')
    expect(hookClaimRiskV2('I pulled on heat gloves and opened the oven.', items)).toBe('invented_scene')
    expect(hookClaimRiskV2('A customer said the candle tasted like onions.', items)).toBe('invented_scene')
    expect(hookClaimRiskV2('The sound inside the jar told me it cracked.', items)).toBe('invented_scene')
  })
  it('keeps scene details she holds', () => {
    expect(hookClaimRiskV2('My first pour cracked in my garage.', items)).toBeNull()
    expect(hookClaimRiskV2('Why the cedar candle smelled like a campfire.', items)).toBeNull()
    expect(hookClaimRiskV2('I ruined a whole batch on my very first pour.', items)).toBeNull()
  })
  it('flags "a lot of brands" claims', () => {
    expect(hookClaimRiskV2('A lot of brands skip the wick test.', items)).toBe('unsourced_generalisation')
  })
  it('still reads everything v1 reads', () => {
    expect(hookClaimRiskV2('Most people never test a wick.', items)).toBe(hookClaimRisk('Most people never test a wick.', items))
  })
  it('flag is off unless exactly true', () => {
    expect(hookGateV2On(undefined)).toBe(false)
    expect(hookGateV2On('false')).toBe(false)
    expect(hookGateV2On('true')).toBe(true)
  })
})

describe('runHookEngine claimGateV2', () => {
  const ledger: LedgerItem[] = items.map((it, i) => ({ id: `h${i}`, origin: 'her_story', product_id: null, field: null, numbers: parseNumbers(it.text, null), first_party: true, live: false, source_label: 'her_story', text: it.text } as LedgerItem))
  const raw = [
    { text: 'Two rules that make candles burn evenly.', shape: 'curiosity_gap' },
    { text: 'My first pour cracked in my living room.', shape: 'story_open' },
    { text: 'Why my first pour cracked down the middle.', shape: 'story_open' },
  ] as never[]
  it('flag off is byte-identical to v1', () => {
    const a = runHookEngine(raw, ledger, { trial: true, claimGate: true })
    const b = runHookEngine(raw, ledger, { trial: true, claimGate: true, claimGateV2: false })
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })
  it('flag on drops the v2 candidates before the pick', () => {
    const on = JSON.stringify(runHookEngine(raw, ledger, { trial: true, claimGate: true, claimGateV2: true }).pick)
    expect(on).not.toContain('Two rules')
    expect(on).not.toContain('living room')
  })
})
