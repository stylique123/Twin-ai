// DISCONNECT TEST, ledger row 25: Plan B assembly (#1292). Switch PLAN_B_ASSEMBLY
// (on only when 'true', or body plan_b on a test/panel account; 'off'/'false' kills both).
// Fictional fixture only (Mira Fenwick, a made-up candle maker). The polish model is never called.
import { describe, it, expect } from 'vitest'
import { assemblePlanB, applyPolish, parsePolish, planBScript, planBInputFromLedger, planBEligible } from '../../planner/planBAssembly'
import { buildLedger } from '../../inventionGate'
import { EDGE, edgeExpr, evalEdge, edgeAfter } from './edge'

const TARGET = 'p-ember'
const STORY = { id: 'k-story', text: 'I melted my first batch of soy wax on a camping stove. The wicks drowned twice. On the third try the jar held a clean flame for 40 hours.' }
const ledger = buildLedger({
  knowledge: [{ id: STORY.id, kind: 'experience', text: STORY.text }, { id: 'h1', kind: 'fact', text: 'I test every scent in my own kitchen before it ships' }],
  products: [{ id: TARGET, name: 'Fenwick Ember', offer: 'Grab the Fenwick Ember jar from the link', knowledge: [{ id: 'p1', field: 'burn_time', value: 'Each candle burns for about 40 hours' }] }],
  targetProductId: TARGET, offer: 'Grab the Fenwick Ember jar from the link', now: 0,
})
const WRITER_SCRIPT = [{ section: 'hook', line: 'Candles are cozy.' }, { section: 'cta', line: 'Shop now.' }]

/** The edge's Plan B gate (index.ts ~17285), evaluated from its source. */
function planBOn(env: Record<string, string>, body: Record<string, unknown> = {}, isHeartbeat = false, trialOn = true): boolean {
  const planBEnv = evalEdge(edgeExpr('planBEnv'), {}, env)
  return evalEdge(edgeExpr('planBOn'), { trialOn, planBEnv, isHeartbeat, body }, env) as boolean
}
/** The edge block: assemble from her items, polish skipped (no model), replace the writer's script. */
function scriptFor(on: boolean): string[] {
  if (!on) return WRITER_SCRIPT.map((b) => b.line)
  const inB = planBInputFromLedger(ledger, STORY, TARGET, 'standard')
  if (!planBEligible(inB)) return WRITER_SCRIPT.map((b) => b.line)
  const asm = assemblePlanB(inB)
  const pol = applyPolish(asm.lines, parsePolish(null, asm.lines.length), asm.sources)
  return planBScript(pol.lines, STORY.text).script.map((b) => b.line)
}

describe('PLAN_B_ASSEMBLY disconnect', () => {
  it('the edge gate: off by default; on with PLAN_B_ASSEMBLY=true or a test account sending plan_b; off/false kill both', () => {
    expect(planBOn({})).toBe(false)
    expect(planBOn({ PLAN_B_ASSEMBLY: 'true' })).toBe(true)
    expect(planBOn({}, { plan_b: true }, true)).toBe(true)
    expect(planBOn({}, { plan_b: true }, false)).toBe(false)
    expect(planBOn({ PLAN_B_ASSEMBLY: 'off' }, { plan_b: true }, true)).toBe(false)
    expect(planBOn({ PLAN_B_ASSEMBLY: 'true' }, {}, false, false)).toBe(false)
  })
  it('on: the body is her story verbatim plus her facts and one CTA; off: the writer script ships', () => {
    const on = scriptFor(planBOn({ PLAN_B_ASSEMBLY: 'true' }))
    const off = scriptFor(planBOn({ PLAN_B_ASSEMBLY: 'off' }))
    expect(on).not.toEqual(off)
    expect(on.join(' ')).toContain('The wicks drowned twice.')
    expect(on.join(' ')).toMatch(/40 hours/)
    expect(off).toEqual(['Candles are cozy.', 'Shop now.'])
  })
  it('the edge still assembles under the gate and replaces the script', () => {
    const block = edgeAfter('if (planBOn && planBTarget && blueprint', 2400)
    expect(block).toContain('const asm = assemblePlanB(inB)')
    expect(block).toContain('bpb2.script = out.script')
    expect(EDGE).toContain("const polishOn = Deno.env.get('PLAN_B_POLISH') !== 'off' && optionalPassTime('plan_b_polish')")
  })
})
