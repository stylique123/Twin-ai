// DISCONNECT TEST, ledger row 19: spine fill (#1289). Kill switch SPINE_FILL_KILL=1.
// Fictional fixture only (a made-up candle maker "Wickwood"). No model call.
import { describe, it, expect } from 'vitest'
import type { LedgerItem } from '../../inventionGate'
import { planSpine } from '../../planner/spinePlanner'
import { planSpineBeats, fillSpineBeats, CTA_ASK_RE } from '../../planner/spineContract'
import { edgeGate, edgeAfter, EDGE } from './edge'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin'>): LedgerItem => ({
  product_id: null, field: null, text: 'a made-up line', numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})
const ledger: LedgerItem[] = [
  item({ id: 'k1', origin: 'her_story', text: 'I burned through ten soy candle batches before the wick stopped tunneling.' }),
  item({ id: 'r1', origin: 'outside_research', first_party: false, text: 'Soy candle wicks tunnel when the first burn is shorter than two hours.' }),
  item({ id: 'a1', origin: 'audience_question', first_party: false, text: 'Is a soy candle really worth it if the wick keeps tunneling?' }),
  item({ id: 'offer', origin: 'offer', product_id: 'c1', text: 'The soy candles are in my shop.' }),
]
const request = { goal: 'educate', angle: 'teach_list', note: 'why my soy candle wick tunnels' }
const SCRIPT = [
  { section: 'Hook', line: 'Here is my fix. Save this for later.' },
  { section: 'CTA', line: 'Find them in my shop, link in bio.' },
]

/** The two edge steps under `spineFillOn`: `fill: true` to the planner (index.ts ~12633) and fillSpineBeats (~17125). */
function scriptFor(on: boolean): string[] {
  const plan = planSpine({ request, ledger, targetProductId: 'c1' })
  const sb = planSpineBeats({ plan, ledger, targetProductId: 'c1', ...(on ? { fill: true } : {}) })
  if (!on) return SCRIPT.map((b) => b.line)
  const f = fillSpineBeats(SCRIPT, sb, ledger, '')
  return (f.record.filled.length || f.record.cta_sentences_removed ? f.script : SCRIPT).map((b) => String(b.line))
}
const gate = (env: Record<string, string>, trialOn = true) => edgeGate('spineFillOn', { trialOn }, env) as boolean

describe('SPINE_FILL_KILL disconnect', () => {
  it('the edge gate: on for the trial, off with SPINE_FILL_KILL=1', () => {
    expect(gate({})).toBe(true)
    expect(gate({ SPINE_FILL_KILL: '1' })).toBe(false)
  })
  it('on: the missing reality check is spoken from its item and one CTA is left; off: the script is unchanged', () => {
    const on = scriptFor(gate({}))
    const off = scriptFor(gate({ SPINE_FILL_KILL: '1' }))
    expect(on).not.toEqual(off)
    expect(on).toContain(ledger[1]!.text)
    expect(on.filter((l) => CTA_ASK_RE.test(l))).toHaveLength(1)
    expect(off).toEqual(SCRIPT.map((b) => b.line))
  })
  it('the edge still fills under the gate', () => {
    expect(EDGE).toContain('...(spineFillOn ? { fill: true } : {}),')
    expect(edgeAfter('if (spineFillOn && Array.isArray(bpp.script)) {', 200)).toContain('fillSpineBeats(')
  })
})
