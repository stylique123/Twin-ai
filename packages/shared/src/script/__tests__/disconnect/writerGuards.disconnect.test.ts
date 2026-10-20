// DISCONNECT TEST, ledger row 10: writer guards (#1274, #1279). No kill switch of its
// own: it runs inside the edge's `if (trialOn && blueprint ...)` block (trial_off).
// Fictional fixture only (a made-up soap maker "Brookfern"). No model call.
import { describe, it, expect } from 'vitest'
import type { LedgerItem } from '../../inventionGate'
import { guardScript } from '../../writerGuards'
import { EDGE, edgeAfter } from './edge'

const item = (o: Partial<LedgerItem> & Pick<LedgerItem, 'id' | 'origin'>): LedgerItem => ({
  product_id: null, field: null, text: 'a made-up line', numbers: [], first_party: true, live: false, source_label: o.origin, ...o,
})
const ledger: LedgerItem[] = [
  item({ id: 'k1', origin: 'her_story', text: 'My first goat milk soap batch seized in the pot.' }),
  item({ id: 'p1', origin: 'product_fact', product_id: 'bar', field: 'process_step', text: 'Each oat soap bar cures for six weeks on a cedar rack.' }),
  item({ id: 'offer', origin: 'offer', product_id: 'bar', text: 'Oat soap bar, link in bio' }),
]
const SCRIPT = [
  { section: 'hook', line: 'My first goat milk soap batch seized in the pot.' },
  { section: 'build', line: 'Each oat soap bar cures for six weeks on a cedar rack. I use this cutter every single morning.' },
  { section: 'cta', line: 'Grab yours before they sell out.' },
]
const HOOKS = ['My first goat milk soap batch seized in the pot.', 'Grab yours before they sell out.']

/** The edge step (index.ts ~17083) on the trial; trial_off skips the block. */
function scriptFor(trialOn: boolean) {
  if (!trialOn) return { script: SCRIPT.map((b) => b.line), hooks: HOOKS }
  const g = guardScript({ script: SCRIPT, hook_options: HOOKS, ledger, targetProductId: 'bar' })
  return { script: g.script.map((b) => String(b.line ?? '')), hooks: g.hook_options, rules: g.record.rules }
}

describe('writer guards disconnect', () => {
  it('on: the unbacked habit and the scarcity line are dropped; off: they ship', () => {
    const on = scriptFor(true)
    const off = scriptFor(false)
    expect(on.script).not.toEqual(off.script)
    expect(on.script.join(' ')).not.toMatch(/every single morning|sell out/)
    expect(on.script.join(' ')).toContain('cures for six weeks')
    expect(on.hooks).not.toContain('Grab yours before they sell out.')
    expect(Object.keys(on.rules ?? {})).toEqual(expect.arrayContaining(['first_person_unbacked', 'scarcity_not_live']))
    expect(off.script.join(' ')).toMatch(/every single morning/)
  })
  it('the edge still guards the script inside the trial block, and the picked hooks', () => {
    const i = EDGE.indexOf('if (trialOn && blueprint && typeof blueprint === \'object\') {\n      const bpw')
    const j = EDGE.indexOf('const g = writerGuardScript({\n            script: bpw.script')
    expect(i).toBeGreaterThan(0)
    expect(j).toBeGreaterThan(i)
    expect(edgeAfter('const gp = writerGuardScript({ script: [], hook_options: engine.pick.hooks', 80)).toBeTruthy()
  })
})
