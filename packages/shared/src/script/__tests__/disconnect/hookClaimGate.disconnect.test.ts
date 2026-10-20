// DISCONNECT TEST, ledger row 37: the HOOK CLAIM GATE (targeted flags v2).
// Kill switch HOOK_CLAIM_GATE ('false' = off). Edge call: `runHookEngine`
// option `claimGate`. Fictional fixture only (a made-up candle maker).
import { describe, it, expect } from 'vitest'
import { parseNumbers, type LedgerItem } from '../../inventionGate'
import { runHookEngine } from '../../hooks/hookEngine'
import { evalEdge, edgeAfter } from './edge'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin' | 'text'>): LedgerItem => ({
  product_id: null, field: null, numbers: parseNumbers(o.text, o.field ?? null), first_party: true, live: false, source_label: o.origin, ...o,
})
const ledger: LedgerItem[] = [
  item({ id: 'h1', origin: 'her_story', text: 'My first pour cracked down the middle because I cooled the jars by an open window.' }),
]

function engineOpt(env: Record<string, string>, trialOn = true): boolean {
  const block = edgeAfter('const engine = runHookEngine(raw, templateLedger, {', 1200)
  const expr = /:\s*(.*),$/.exec(block.split('\n').find((l) => l.trim().startsWith('claimGate:'))!.trim())![1]!
  return evalEdge(expr, { trialOn }, env) as boolean
}

describe('HOOK_CLAIM_GATE on the edge', () => {
  it('follows the switch and trialOn', () => {
    expect(engineOpt({})).toBe(true)
    expect(engineOpt({ HOOK_CLAIM_GATE: 'false' })).toBe(false)
    expect(engineOpt({}, false)).toBe(false)
  })
  it('on: an invented-timeframe hook is not a candidate; off: it is', () => {
    const cands = [{ shape: 'question', text: 'Why do candles crack every single week?' }, { shape: 'question', text: 'Do you cool your candle jars by a window?' }]
    const texts = (env: Record<string, string>) => runHookEngine(cands, ledger, { trial: true, claimGate: engineOpt(env) }).record.candidates.length
    expect(texts({})).toBe(texts({ HOOK_CLAIM_GATE: 'false' }) - 1)
  })
})
