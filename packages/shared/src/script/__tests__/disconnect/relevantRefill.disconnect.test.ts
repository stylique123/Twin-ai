// DISCONNECT TEST, ledger row 35: relevance-aware refill and story-hook dedupe (panel 10).
// Kill switches RELEVANT_REFILL=false and STORY_HOOK_DEDUP=false. Fictional fixture only
// (a made-up candle maker). No model call.
import { describe, it, expect } from 'vitest'
import type { LedgerItem } from '../../inventionGate'
import { enforceWordBudget } from '../../templates/scriptTemplates'
import { EDGE, edgeExpr, evalEdge, edgeAfter } from './edge'

const it2 = (id: string, text: string): LedgerItem => ({ id, origin: 'her_story', product_id: null, field: null, text, numbers: [], first_party: true, live: false, source_label: 'her_story' })
const WICK = 'My first candle tunneled straight down the middle because I used a wick that was too thin.'
const ledger = [it2('van', 'I drove a borrowed van to my first night market and the heater melted half my stock.'), it2('wick', WICK)]
const SCRIPT = [{ line: 'Why does your candle tunnel?' }, { line: WICK }, { line: 'Save this.' }]

/** The edge's request context (index.ts, `relevantRefillCtx`), evaluated from the edge source. */
const ctxFor = (env: Record<string, string>, trialOn = true) =>
  (evalEdge(edgeExpr('relevantRefillCtx'), { trialOn, reference_note: 'why candles tunnel', ownedEntity: null, body: {} }, env) as () => unknown)()

describe('RELEVANT_REFILL disconnect', () => {
  it('on: the edge length pass adds no unrelated story; RELEVANT_REFILL=false: it does', () => {
    const on = enforceWordBudget(SCRIPT, 'standard', ledger, null, { units: true, relevance: ctxFor({}) as { topic: string } })
    const off = enforceWordBudget(SCRIPT, 'standard', ledger, null, { units: true, relevance: ctxFor({ RELEVANT_REFILL: 'false' }) as null })
    expect(ctxFor({ RELEVANT_REFILL: 'false' })).toBeNull()
    expect(ctxFor({}, false)).toBeNull()
    expect(on.record.added).toEqual([])
    expect(off.record.added).toEqual(['van'])
  })
  it('the edge passes the context to the length pass, the floor refill and the worker gate', () => {
    expect(EDGE).toContain("{ units: Deno.env.get('LENGTH_REFILL') !== 'false', relevance: relevantRefillCtx() }")
    expect(EDGE).toContain('ledgerF, tgt, floor, relevantRefillCtx())')
    const extras = edgeAfter('const panel7GateExtras = ', 900)
    expect(extras).toContain('refill_context: relevantRefillCtx()')
    expect(extras).toContain("Deno.env.get('STORY_HOOK_DEDUP') !== 'false' ? { story_hook_dedup: true }")
  })
})
