// DISCONNECT TEST, ledger row 17: template rank v2 (#1288). Kill switch TEMPLATE_RANK_V2=false.
// The fictional panel only (scripts/ops/fixtures/fictional-panel.json). No model call.
import { describe, it, expect } from 'vitest'
import { chooseTemplates } from '../../templates/scriptTemplates'
import { fixtureLedger, type PanelFixture } from '../../templates/templateCoverage'
import { evalEdge, edgeAfter, readRepo } from './edge'

const fx = JSON.parse(readRepo('scripts/ops/fixtures/fictional-panel.json')) as PanelFixture
const NOW = Date.parse('2026-10-19T00:00:00Z')

/** The edge's rank option (index.ts ~12595), evaluated from its source. */
function rankFor(env: Record<string, string>): 'v1' | 'v2' {
  const line = edgeAfter('return chooseTemplates({', 600).split('\n').find((l) => l.trim().startsWith('rank:'))!
  return evalEdge(/rank:\s*(.*),$/.exec(line.trim())![1]!, {}, env) as 'v1' | 'v2'
}
/** The top template id the edge would pick for every fixture request. */
const picks = (rank: 'v1' | 'v2') => fx.requests.map((r) => {
  const { ledger, target } = fixtureLedger(fx, r, NOW)
  return chooseTemplates({ goal: r.goal, angle: r.angle ?? null, ledger, targetProductId: target, rank })[0]?.template.id ?? null
})

describe('TEMPLATE_RANK_V2 disconnect', () => {
  it('the edge option: v2 by default, v1 with TEMPLATE_RANK_V2=false', () => {
    expect(rankFor({})).toBe('v2')
    expect(rankFor({ TEMPLATE_RANK_V2: 'false' })).toBe('v1')
  })
  it('on: some fixture requests get a different template; v2 reaches templates v1 never picks first', () => {
    const on = picks(rankFor({}))
    const off = picks(rankFor({ TEMPLATE_RANK_V2: 'false' }))
    expect(on).not.toEqual(off)
    const onlyV2 = [...new Set(on)].filter((id) => id && !off.includes(id))
    expect(onlyV2.length).toBeGreaterThan(0)
  })
  it('on: where the pick changed, the v2 pick lists the requested angle first', () => {
    const on = picks('v2')
    const off = picks('v1')
    fx.requests.forEach((r, i) => {
      if (on[i] === off[i] || !r.angle) return
      const { ledger, target } = fixtureLedger(fx, r, NOW)
      const top = chooseTemplates({ goal: r.goal, angle: r.angle, ledger, targetProductId: target, rank: 'v2' })[0]!
      const v1top = chooseTemplates({ goal: r.goal, angle: r.angle, ledger, targetProductId: target, rank: 'v1' })[0]!
      expect(top.template.angles[0] === r.angle || v1top.template.angles[0] !== r.angle).toBe(true)
    })
  })
})
