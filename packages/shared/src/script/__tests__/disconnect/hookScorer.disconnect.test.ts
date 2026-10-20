// DISCONNECT TEST, ledger row 6: hook scorer A5b (appeal score, STORY-OPEN / FACT-OPEN) (#1272).
// Its switch is `trial: trialOn` (trial_off) inside newOn('hook_engine') (release_off: hook_engine).
// Fictional fixture only (a made-up candle maker). No model call.
import { describe, it, expect } from 'vitest'
import type { LedgerItem } from '../../inventionGate'
import { runHookEngine } from '../../hooks/hookEngine'
import { EDGE, edgeAfter } from './edge'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin'>): LedgerItem => ({
  product_id: null, field: null, text: 'a made-up line', numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})
const ledger: LedgerItem[] = [
  item({ id: 'q', origin: 'audience_question', first_party: false, text: 'Why does my candle tunnel down the middle?' }),
  item({ id: 'st', origin: 'her_story', text: 'My first candle batch tunnelled straight down the middle. I almost quit.' }),
  item({ id: 'pf', origin: 'product_fact', product_id: 'p1', text: 'The candle wick is braided cotton, trimmed to 6 mm', numbers: [{ value: 6, unit: 'count', field: 'wick' }] }),
]
const writer = [
  { shape: 'audience_question', text: 'Why does your candle tunnel down the middle?' },
  { shape: 'stop_doing', text: 'Stop lighting candles without trimming the wick.' },
  { shape: 'if_then_check', text: 'Candle tunnelling? Check our 40 percent off sale.' },
]
const run = (trial: boolean) => runHookEngine(writer, ledger, { trial, request: 'candle tunnels', targetProductId: 'p1' })

describe('hook scorer (trial) disconnect', () => {
  it('on: the picked hook is her story opening; off: the writer candidate wins', () => {
    const on = run(true)
    const off = run(false)
    expect(on.pick).not.toEqual(off.pick)
    expect(on.pick.hooks[0]).toBe('My first candle batch tunnelled straight down the middle.')
    expect(on.record.candidates.some((c) => c.source === 'story_open')).toBe(true)
    expect(off.pick.hooks).not.toContain('My first candle batch tunnelled straight down the middle.')
    expect(off.record.candidates.every((c) => c.source !== 'story_open')).toBe(true)
  })
  it('the edge still runs the engine with trial: trialOn, inside newOn(hook_engine), and ships the pick', () => {
    expect(EDGE).toContain("if (newOn('hook_engine')) {")
    expect(edgeAfter('const engine = runHookEngine(raw, templateLedger, {', 120)).toContain('trial: trialOn,')
    expect(EDGE).toContain('bph.hook_pick = engine.pick')
  })
})
