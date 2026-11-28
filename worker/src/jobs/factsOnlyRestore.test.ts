// compare-3 proof fix 4 (owner, 27 Nov): the worker never ships fewer spoken
// lines than the server approved; when its cuts would, the server's script is restored.
import { describe, it, expect } from 'vitest'
import { applyFactsOnly } from './inventionRecheck.js'

const ledger = [
  { id: 'k1', origin: 'her_story', product_id: null, field: null, text: 'A buyer at a craft fair picked up a mug, turned it over, and asked why the bottom was not glazed, so now I explain it on every label.', first_party: true, live: false },
  { id: 'note', origin: 'her_answer', product_id: null, field: null, text: 'why the bottom of a handmade mug is not glazed', first_party: true, live: false },
] as never
const server = [
  { section: 'Hook', line: 'A buyer at a craft fair picked up a mug and turned it over.' },
  { section: 'Story', line: 'She asked why the bottom was not glazed.' },
  { section: 'Payoff', line: 'So now I explain it on every label, for every buyer who wonders.' },
  { section: 'Close', line: 'A buyer at a craft fair asked why the bottom was not glazed, so now I explain it on every label.' },
]

describe('worker: never fewer lines than the server approved', () => {
  it('restores the server script when the worker cuts would leave it thin', () => {
    const bp: Record<string, unknown> = { script: [server[0], { section: 'Story', line: 'Every glaze in the world melts at exactly 1200 degrees, which customers love.' }, { section: 'CTA', line: 'DM me for a discount today.' }] }
    applyFactsOnly(bp, { facts_only: true }, ledger, 'g1', [], null, { script: server, shot_list: null })
    expect((bp.script as Array<{ line: string }>).map((b) => b.line)).toEqual(server.map((b) => b.line))
    expect((bp.facts_only as { worker: Record<string, unknown> }).worker.restored_server_script).toBeTruthy()
  })
  it('keeps the worker result when it is not thin and not shorter', () => {
    const bp: Record<string, unknown> = { script: server.map((b) => ({ ...b })) }
    applyFactsOnly(bp, { facts_only: true }, ledger, 'g2', [], null, { script: server, shot_list: null })
    expect((bp.facts_only as { worker: Record<string, unknown> }).worker.restored_server_script).toBeUndefined()
  })
})
