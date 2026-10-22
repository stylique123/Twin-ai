// DISCONNECT TEST, ledger rows 39 (Using list routes, kill USING_ITEM_KILL=1) and
// 40 (paraphrased-retelling dedupe, default off, opt in STORY_RETELL_DEDUP=true). Fictional
// fixture only (a made-up candle maker). No model call.
import { describe, it, expect } from 'vitest'
import type { LedgerItem } from '../../inventionGate'
import { filterLedgerByNeverUse, sanitizeNeverUse } from '../../usingBlock'
import { EDGE, edgeExpr, evalEdge, edgeAfter } from './edge'

const story = (id: string, text: string): LedgerItem => ({ id, origin: 'her_story', product_id: null, field: null, text, numbers: [], first_party: true, live: false, source_label: 'her_story' })
const KID = '33333333-4444-4555-8666-777777777777'
const ledger = [story(KID, 'I drove a borrowed van to my first night market and the heater melted half my stock.'), story('k-wick', 'My first candle tunneled because the wick was too thin.')]
const stored = [{ kind: 'fact', id: KID, product_id: null, text: 'I drove a borrowed van' }]

/** The edge's block list read (index.ts `neverUse`), evaluated from the edge source. */
const neverUseFor = (env: Record<string, string>, trialOn = true) =>
  evalEdge(edgeExpr('neverUse', 'USING_ITEM_KILL'), { trialOn, sanitizeNeverUse, voice: { profile: { never_use: stored } } }, env) as unknown[]

describe('USING_ITEM_KILL disconnect', () => {
  it('on: the blocked story leaves the ledger; USING_ITEM_KILL=1 (or no trial): it stays', () => {
    const on = filterLedgerByNeverUse(ledger, neverUseFor({}) as never)
    const off = filterLedgerByNeverUse(ledger, neverUseFor({ USING_ITEM_KILL: '1' }) as never)
    expect(on.map((it) => it.id)).toEqual(['k-wick'])
    expect(off.map((it) => it.id)).toEqual([KID, 'k-wick'])
    expect(neverUseFor({}, false)).toEqual([])
  })
  it('the planner, every refill, Plan B, outside selection and the worker all read it', () => {
    expect(EDGE).toContain('templateLedger = nuL(buildInventionLedger({')
    expect(EDGE).toContain('const ledgerForBudget = templateLedger.length ? templateLedger : nuL(buildInventionLedger({')
    expect(EDGE).toContain('const ledgerB0 = templateLedger.length ? templateLedger : nuL(buildInventionLedger({')
    expect(EDGE).toContain('const ledgerF = templateLedger.length ? templateLedger : nuL(buildInventionLedger({')
    expect(EDGE).toContain('outsideAllowed(x, neverUse)')
    expect(EDGE).toContain('pickOutsideForWriter({ notes, trends, moments, research, reddit }')
    expect(edgeAfter('const panel7GateExtras = ', 1400)).toContain('never_use: neverUseForGate()')
    expect(EDGE).toContain("if (specMode === 'using_item')")
    expect(edgeAfter("if (specMode === 'using_item')", 400)).toContain("Deno.env.get('USING_ITEM_KILL') === '1') return json({ disabled: true })")
    expect(sanitizeNeverUse(stored)).toHaveLength(1)
  })
})

describe('STORY_RETELL_DEDUP disconnect', () => {
  it('the edge sends story_retell_dedup only when STORY_RETELL_DEDUP=true (default off)', () => {
    const extras = edgeAfter('const panel7GateExtras = ', 1400)
    expect(extras).toContain("trialOn && Deno.env.get('STORY_RETELL_DEDUP') === 'true' ? { story_retell_dedup: true }")
    expect(extras).not.toContain("Deno.env.get('STORY_RETELL_DEDUP') !== 'false'")
  })
})
