// SCRIPT_CLEANUP_V1 (panel 13c, default OFF): the worker cleans only when the
// edge flagged the job. Fictional rows only.
import { describe, it, expect, beforeAll } from 'vitest'
import { buildLedger } from '../generated/inventionGate.js'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})
const ledger = buildLedger({
  knowledge: [],
  products: [{ id: 'mug', name: 'Tide Mug', knowledge: [{ field: 'size', value: 'Holds about 12 oz' }] }],
  targetProductId: 'mug',
  offer: 'Tide Mug, link in bio',
})
const products = [{ id: 'mug', name: 'Tide Mug' }]
const script = () => [
  { section: 'Hook', line: 'Morning coffee, but slower.' },
  { section: 'Beat 1', line: 'The Tide Mug is hand-thrown and holds about 12 oz of coffee.' },
  { section: 'Beat 2', line: 'Holds about 12 oz.' },
  { section: 'CTA', line: 'Tide Mug, link in bio.' },
  { section: 'Close', line: 'Here is the part everyone forgets.' },
]

describe('worker: script cleanup v1', () => {
  it('does nothing without the edge flag (the default)', async () => {
    const { applyScriptCleanupV1 } = await import('../jobs/inventionRecheck.js')
    const bp: Record<string, unknown> = { script: script() }
    applyScriptCleanupV1(bp, {}, ledger, products, 'gen-x')
    expect(bp.script_cleanup_v1).toBeUndefined()
    expect(bp.script).toEqual(script())
  })
  it('with the flag: cuts the repeated size and the dangling last line, keeps hook and CTA', async () => {
    const { applyScriptCleanupV1 } = await import('../jobs/inventionRecheck.js')
    const bp: Record<string, unknown> = { script: script() }
    applyScriptCleanupV1(bp, { script_cleanup_v1: true }, ledger, products, 'gen-x')
    const lines = (bp.script as Array<{ line: string }>).map((b) => b.line)
    expect(lines).toEqual(['Morning coffee, but slower.', 'The Tide Mug is hand-thrown and holds about 12 oz of coffee.', 'Tide Mug, link in bio.'])
  })
})
