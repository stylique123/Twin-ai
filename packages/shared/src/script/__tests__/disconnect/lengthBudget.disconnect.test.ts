// DISCONNECT TEST, ledger row 21: length to the profile budget and refill (#1291).
// Kill switches LENGTH_BUDGET=false and LENGTH_REFILL=false. Fictional fixture only (a made-up potter). No model call.
import { describe, it, expect } from 'vitest'
import type { LedgerItem } from '../../inventionGate'
import { budgetPromptLine } from '../../scriptIntegrity'
import { enforceWordBudget, profileForSeconds } from '../../templates/scriptTemplates'
import { DURATION_PROFILES } from '../../templates/templateData'
import { EDGE, edgeExpr, evalEdge, edgeAfter } from './edge'

const it2 = (id: string, text: string): LedgerItem => ({ id, origin: 'her_story', product_id: null, field: null, text, numbers: [], first_party: true, live: false, source_label: 'her_story' })
const SCRIPT = [
  { line: 'I burned three batches of teal glaze before the kiln behaved.' },
  { line: 'Slow cooling fixed it.' },
  { line: 'Find me Saturday.' },
]
// One item of hers that spans two lines (the panel-7 short_no_material case).
const ledger = [it2('m1', 'The co-op kiln fires on Thursdays only.\nEach mug takes about two weeks from wheel to shelf.')]

/** The writer-brief budget line (index.ts ~12520), evaluated from the edge source. */
const budgetLineFor = (env: Record<string, string>, trialOn = true): string =>
  evalEdge(edgeExpr('budgetLine'), { trialOn, budgetPromptLine, DURATION_PROFILES, profileForSeconds, body: { target_seconds: 60 }, softwareTargetSec: null }, env) as string
/** The edge's refill (index.ts ~17049): `units` from LENGTH_REFILL. */
const refillFor = (env: Record<string, string>) =>
  enforceWordBudget(SCRIPT, 'standard', ledger, null, { units: env.LENGTH_REFILL !== 'false' })

describe('LENGTH_BUDGET disconnect', () => {
  it('on: the writer brief names the profile word budget; LENGTH_BUDGET=false: no budget line', () => {
    const on = budgetLineFor({})
    const off = budgetLineFor({ LENGTH_BUDGET: 'false' })
    expect(on).not.toBe(off)
    expect(on).toContain(String(DURATION_PROFILES.standard.words))
    expect(off).toBe('')
    expect(budgetLineFor({}, false)).toBe('')
  })
})

describe('LENGTH_REFILL disconnect', () => {
  it('on: the short script is refilled line by line from her item; LENGTH_REFILL=false: refused whole', () => {
    const on = refillFor({})
    const off = refillFor({ LENGTH_REFILL: 'false' })
    expect(on.script).not.toEqual(off.script)
    expect(on.record.action).toBe('lengthened')
    expect(on.record.added.length).toBeGreaterThan(0)
    expect(off.record.action).toBe('short_no_material')
    expect(off.script).toEqual(SCRIPT)
  })
  it('the edge still passes units from LENGTH_REFILL and the budget line into the brief', () => {
    expect(EDGE).toContain("enforceWordBudget(bpw.script as Array<Record<string, unknown>>, profile, ledgerForBudget, targetId, { units: Deno.env.get('LENGTH_REFILL') !== 'false' })")
    expect(edgeAfter('const durationBriefLine = ', 160)).toContain('budgetLine')
  })
})
