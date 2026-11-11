// Panel 13b: the panel final pass re-runs in the worker after the QC, only when
// the edge put `panel_final_pass` on the job (panel accounts). Fictional rows only.
import { describe, it, expect, beforeAll } from 'vitest'
import { buildLedger } from '../generated/inventionGate.js'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const ledger = buildLedger({
  knowledge: [{ id: 'k1', kind: 'framework', text: 'Before glazing I wax the foot and let it dry overnight.' }],
  products: [{ id: 'mug', name: 'Tide Mug', knowledge: [{ field: 'includes', value: 'Dishwasher safe, with an unglazed foot' }] }],
  targetProductId: 'mug',
  offer: 'Tide Mug, link in bio',
})
const products = [{ id: 'mug', name: 'Tide Mug' }]
const script = () => [
  { section: 'Hook', line: 'Why is the bottom bare?' },
  { section: 'Beat 1', line: 'I wax the foot, so it\'s dishwasher safe.' },
  { section: 'Beat 2', line: 'People always ask me about it. I think, um, so yeah, it is honest.' },
  { section: 'CTA', line: 'Tickets at https://example.com/pip-live' },
]

describe('worker: panel final pass', () => {
  it('does nothing without the edge flag (real creators never get it)', async () => {
    const { applyPanelFinalPass } = await import('../jobs/inventionRecheck.js')
    const bp: Record<string, unknown> = { script: script() }
    applyPanelFinalPass(bp, {}, ledger, products, 'mug', 'gen-x')
    expect(bp.panel_final_pass).toBeUndefined()
    expect(bp.script).toEqual(script())
  })
  it('cuts the false cause, the invented behaviour and the filler; keeps the URL', async () => {
    const { applyPanelFinalPass } = await import('../jobs/inventionRecheck.js')
    const bp: Record<string, unknown> = { script: script() }
    applyPanelFinalPass(bp, { panel_final_pass: { request: 'Tide Mug' } }, ledger, products, 'mug', 'gen-x')
    const lines = (bp.script as Array<{ line: string }>).map((b) => b.line)
    expect(lines[1]).toBe('I wax the foot. It\'s dishwasher safe.')
    expect(lines.join(' ')).not.toMatch(/people always ask|\bum\b|so yeah/i)
    expect(lines[lines.length - 1]).toBe('Tickets at https://example.com/pip-live')
    expect((bp.panel_final_pass as Record<string, number>).false_cause).toBe(1)
  })
})
