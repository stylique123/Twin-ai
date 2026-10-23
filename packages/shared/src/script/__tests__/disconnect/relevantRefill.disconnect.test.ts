// DISCONNECT TEST, ledger row 35: relevance-aware refill and story-hook dedupe (panel 10).
// Kill switches RELEVANT_REFILL=false and STORY_HOOK_DEDUP=false. Fictional fixture only
// (a made-up candle maker). No model call.
import { describe, it, expect } from 'vitest'
import { refillContextFor, refillArmOf, type LedgerItem } from '../../inventionGate'
import { enforceWordBudget } from '../../templates/scriptTemplates'
import { EDGE, edgeExpr, evalEdge, edgeAfter } from './edge'

const it2 = (id: string, text: string): LedgerItem => ({ id, origin: 'her_story', product_id: null, field: null, text, numbers: [], first_party: true, live: false, source_label: 'her_story' })
const WICK = 'My first candle tunneled straight down the middle because I used a wick that was too thin.'
const ledger = [it2('van', 'I drove a borrowed van to my first night market and the heater melted half my stock.'), it2('wick', WICK)]
const SCRIPT = [{ line: 'Why does your candle tunnel?' }, { line: WICK }, { line: 'Save this.' }]

/** The edge's request context (index.ts, `relevantRefillCtx`), evaluated from the edge source. */
const ctxFor = (env: Record<string, string>, trialOn = true, arm: unknown = undefined) => {
  const scope = { trialOn, isHeartbeat: true, reference_note: 'why candles tunnel', ownedEntity: null, body: { refill_arm: arm }, voice: { profile: { niche: 'candles' } }, refillContextFor, refillArmOf }
  const refillArm = evalEdge(edgeExpr('refillArm'), scope, env)
  return (evalEdge(edgeExpr('relevantRefillCtx'), { ...scope, refillArm }, env) as () => unknown)()
}

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
    expect(extras).toContain("Deno.env.get('STORY_HOOK_DEDUP') !== 'false' && refillArm() !== 'baseline_p10' ? { story_hook_dedup: true }")
  })
  it('refill arms: baseline_p10 is the panel-10 refill (no context); refill_v2 turns V2 on; REFILL_V2=off kills it', () => {
    expect(ctxFor({}, true, 'baseline_p10')).toBeNull()
    expect(ctxFor({}, true, 'refill_v2')).toMatchObject({ v2: true, niche: 'candles' })
    expect(ctxFor({ REFILL_V2: 'true' })).toMatchObject({ v2: true })
    expect(ctxFor({ REFILL_V2: 'off' }, true, 'refill_v2')).toEqual({ topic: 'why candles tunnel', angle: '' })
    expect(ctxFor({})).toEqual({ topic: 'why candles tunnel', angle: '' })
    expect(ctxFor({}, false, 'refill_v2')).toBeNull()
    expect(EDGE).toContain('.refill_arm = refillArm()')
  })
})
