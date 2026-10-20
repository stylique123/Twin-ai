// DISCONNECT TEST, ledger row 30: bare-fact hooks leave GENERATION (plan v5.4 §20).
// Kill switch HOOK_BARE_FACT_GEN ('false' = off). Two edge calls: the writer
// prompt block (`renderHookCandidateRule`) and the engine (`noBareFactGen`).
// Fictional fixture only (a made-up bike-repair newsletter "Spoke Notes").
import { describe, it, expect } from 'vitest'
import { parseNumbers, type LedgerItem } from '../../inventionGate'
import { runHookEngine, renderHookCandidateRule } from '../../hooks/hookEngine'
import { EDGE, evalEdge, edgeAfter } from './edge'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin' | 'text'>): LedgerItem => ({
  product_id: null, field: null, numbers: parseNumbers(o.text, o.field ?? null), first_party: true, live: false, source_label: o.origin, ...o,
})
const SPOKE = 'p-spoke'
const ledger: LedgerItem[] = [
  item({ id: 'h1', origin: 'her_story', text: 'My first commute ended with a snapped chain halfway up the bridge because I never oiled it.' }),
  item({ id: 'p1', origin: 'product_fact', product_id: SPOKE, field: 'price', text: '$4 per month for one repair email every Friday, never more than that' }),
]

/** The edge's prompt-block option, evaluated with fake env. */
function promptOpt(env: Record<string, string>, trialOn = true): boolean {
  const line = EDGE.split('\n').find((l) => l.includes('hookCandidateBlock = renderHookCandidateRule(templateLedger, {'))!
  const expr = /noBareFact:\s*(.*?)\s*\}\)/.exec(line)![1]!
  return evalEdge(expr, { trialOn }, env) as boolean
}
/** The engine option, evaluated with fake env. */
function engineOpt(env: Record<string, string>, trialOn = true): boolean {
  const block = edgeAfter('const engine = runHookEngine(raw, templateLedger, {', 900)
  const expr = /:\s*(.*),$/.exec(block.split('\n').find((l) => l.trim().startsWith('noBareFactGen:'))!.trim())![1]!
  return evalEdge(expr, { trialOn }, env) as boolean
}

describe('HOOK_BARE_FACT_GEN on the edge', () => {
  it('both options follow the switch and trialOn', () => {
    expect(promptOpt({})).toBe(true)
    expect(engineOpt({})).toBe(true)
    expect(promptOpt({ HOOK_BARE_FACT_GEN: 'false' })).toBe(false)
    expect(engineOpt({ HOOK_BARE_FACT_GEN: 'false' })).toBe(false)
    expect(promptOpt({}, false)).toBe(false)
    expect(engineOpt({}, false)).toBe(false)
  })
  it('on: the prompt does not ask for price_or_proof and the engine makes no bare-fact candidate; off: both do', () => {
    const cands = [{ shape: 'price_or_proof', text: 'Spoke Notes is $4 per month.' }, { shape: 'stop_doing', text: 'Stop oiling a dirty chain before your commute.' }]
    const run = (env: Record<string, string>) => ({
      prompt: renderHookCandidateRule(ledger, { noBareFact: promptOpt(env) }),
      engine: runHookEngine(cands, ledger, { trial: true, noBareFactGen: engineOpt(env), targetProductId: SPOKE, request: 'chain repair email' }),
    })
    const on = run({}), off = run({ HOOK_BARE_FACT_GEN: 'false' })
    expect(on.prompt).not.toContain('price_or_proof')
    expect(off.prompt).toContain('price_or_proof')
    expect(on.engine.record.candidates.map((c) => c.shape)).not.toContain('price_or_proof')
    expect(off.engine.record.candidates.map((c) => c.shape)).toContain('price_or_proof')
  })
})
