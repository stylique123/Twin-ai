// DISCONNECT TEST, ledger row 13: narrow repair, first-person claim check, no bare-fact
// hooks, repeats by meaning (#1294). Kill switches NARROW_REPAIR, STORY_DEDUP,
// HOOK_BARE_FACT, HOOK_CLAIM_CHECK (each 'false' = off). The worker half (the gate
// flags reaching runInventionGate) is worker/src/__tests__/narrow-repair-disconnect.test.ts.
// Fictional fixture only (a made-up bike-repair newsletter "Spoke Notes"). Fake judges.
import { describe, it, expect } from 'vitest'
import { dedupByStoryItem, type LedgerItem } from '../../inventionGate'
import { runHookEngine } from '../../hooks/hookEngine'
import { EDGE, evalEdge, edgeAfter } from './edge'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin' | 'text'>): LedgerItem => ({
  product_id: null, field: null, numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})
const SPOKE = 'p-spoke'
const products = [{ id: SPOKE, name: 'Spoke Notes' }]
const STORY = 'My first commute ended with a snapped chain halfway up the bridge because I never oiled it.'
const ledger: LedgerItem[] = [
  item({ id: 'h1', origin: 'her_story', text: STORY }),
  item({ id: 'p1', origin: 'product_fact', product_id: SPOKE, field: 'description', text: 'Spoke Notes: One email every Friday with one repair walked through' }),
  item({ id: 'p2', origin: 'product_fact', product_id: SPOKE, field: 'price', text: 'Spoke Notes: Free' }),
]

/** The edge's `panel7GateExtras` arrow, evaluated with fake env (it is what the worker's gate reads). */
function gateExtras(env: Record<string, string>, trialOn = true): Record<string, unknown> {
  const start = EDGE.indexOf('const panel7GateExtras = ')
  const end = EDGE.indexOf('\n  })', start)
  const src = EDGE.slice(start + 'const panel7GateExtras = '.length, end + '\n  })'.length)
  return (evalEdge(src, { trialOn, panel7Budget: 0, relevantRefillCtx: () => null }, env) as () => Record<string, unknown>)()
}
/** The two hook options the edge passes (index.ts ~17158), evaluated. */
function hookOpts(env: Record<string, string>, trialOn = true) {
  const block = edgeAfter('const engine = runHookEngine(raw, templateLedger, {', 600)
  const expr = (k: string) => /:\s*(.*),$/.exec(block.split('\n').find((l) => l.trim().startsWith(`${k}:`))!.trim())![1]!
  return { noBareFact: evalEdge(expr('noBareFact'), { trialOn }, env) as boolean, claimCheck: evalEdge(expr('claimCheck'), { trialOn }, env) as boolean }
}

describe('narrow repair / story de-dup gate flags', () => {
  it('on: the edge asks the worker gate for narrow_repair and story_dedup; each kill switch removes its flag', () => {
    expect(gateExtras({})).toMatchObject({ narrow_repair: true, story_dedup: true })
    expect(gateExtras({ NARROW_REPAIR: 'false' }).narrow_repair).toBeUndefined()
    expect(gateExtras({ STORY_DEDUP: 'false' }).story_dedup).toBeUndefined()
    expect(gateExtras({}, false)).toEqual({})
  })
})

describe('repeats by meaning (STORY_DEDUP) on the edge', () => {
  const script = [
    { line: 'Halfway up the bridge my unoiled chain snapped on my first commute.' },
    { line: STORY },
    { line: 'So my chain snapped on the bridge, all because I never oiled it on that first commute.' },
    { line: 'Oil the chain every Sunday.' },
  ]
  const run = (env: Record<string, string>) => (gateExtras(env).story_dedup ? dedupByStoryItem(script, ledger).script : script).map((b) => b.line)
  it('on: the later paraphrase goes, the hook and the verbatim story stay (panel 9); off: all four lines ship', () => {
    const on = run({})
    const off = run({ STORY_DEDUP: 'false' })
    expect(on).not.toEqual(off)
    expect(on).toEqual([script[0]!.line, STORY, 'Oil the chain every Sunday.'])
    expect(off).toHaveLength(4)
  })
  it('the edge still calls dedupByStoryItem under STORY_DEDUP', () => {
    expect(edgeAfter("if (trialOn && Deno.env.get('STORY_DEDUP') !== 'false'", 500)).toContain('dedupByStoryItem(')
  })
})

describe('hooks: bare-fact and first-person claim check (HOOK_BARE_FACT, HOOK_CLAIM_CHECK)', () => {
  const cands = [
    { shape: 'price_or_proof', text: 'Spoke Notes is free.' },
    { shape: 'stop_doing', text: 'Stop oiling a dirty chain before your commute.' },
    { shape: 'story_open', text: 'In my experience, wax beats grease on long tours.' },
  ]
  const run = (env: Record<string, string>) => runHookEngine(cands, ledger, { trial: true, ...hookOpts(env), products, targetProductId: SPOKE, request: 'chain care commute' })
  it('the edge options follow the switches', () => {
    expect(hookOpts({})).toEqual({ noBareFact: true, claimCheck: true })
    expect(hookOpts({ HOOK_BARE_FACT: 'false', HOOK_CLAIM_CHECK: 'false' })).toEqual({ noBareFact: false, claimCheck: false })
    expect(hookOpts({}, false)).toEqual({ noBareFact: false, claimCheck: false })
  })
  it('on: the bare-fact hook and the unbacked first-person hook fail; off: they pass', () => {
    const on = run({})
    const off = run({ HOOK_BARE_FACT: 'false', HOOK_CLAIM_CHECK: 'false' })
    const ok = (r: ReturnType<typeof run>, shape: string) => r.record.candidates.find((c) => c.source === 'writer' && c.shape === shape)?.ok
    expect(on.record).not.toEqual(off.record)
    expect(ok(on, 'price_or_proof')).toBe(false)
    expect(ok(off, 'price_or_proof')).toBe(true)
    expect(on.pick.shapes).not.toContain('price_or_proof')
    expect(ok(on, 'story_open')).toBe(false)
  })
})
