// The Quality Controller runs last in the worker (plan v6.8 §33) — only when the
// edge put `quality_controller` on the job (test and panel accounts). Fictional rows only.
import { describe, it, expect, beforeAll } from 'vitest'
import { buildLedger } from '../generated/inventionGate.js'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const ledger = buildLedger({
  knowledge: [
    { id: 'k1', kind: 'experience', text: 'A regular told me her beans tasted flat after a week, and when I asked, she was keeping them in the fridge next to the onions.' },
    { id: 'k2', kind: 'framework', text: 'To check if your beans are stale, read the roast date, smell a handful, then watch the bloom; fresh beans swell and bubble when the water hits.' },
  ],
  products: [{ id: 'p1', name: 'Harbor Blend', knowledge: [{ field: 'includes', value: 'Each bag of Harbor Blend beans has the roast date written on the label by hand.' }] }],
  targetProductId: 'p1',
  offer: 'Harbor Blend, link in bio',
})
const script = () => [{ section: 'hook', line: 'Why do your coffee beans taste flat after one week?' }, { section: 'body', line: 'Stale beans lose their smell first.' }]
const products = [{ id: 'p1', name: 'Harbor Blend' }]

describe('worker: quality controller stage', () => {
  it('does nothing without the edge flag (real creators never get it)', async () => {
    const { applyQualityController } = await import('../jobs/inventionRecheck.js')
    const bp: Record<string, unknown> = { script: script() }
    applyQualityController(bp, {}, ledger, products, 'p1', 'gen-x')
    expect(bp.qc_report).toBeUndefined()
    expect(bp.script).toEqual(script())
  })

  it('extends a short script with her items and records the report', async () => {
    const { applyQualityController } = await import('../jobs/inventionRecheck.js')
    const bp: Record<string, unknown> = { script: script() }
    applyQualityController(bp, { quality_controller: { profile: 'standard', topic: 'how to tell if coffee beans are stale Harbor Blend', product: 'Harbor Blend', niche: 'coffee' } }, ledger, products, 'p1', 'gen-x')
    const r = bp.qc_report as { words_after: number; words_before: number; added: unknown[] }
    expect(r.words_after).toBeGreaterThan(r.words_before)
    expect(r.added.length).toBeGreaterThan(0)
    expect((bp.script as unknown[]).length).toBeGreaterThan(2)
  })
})
