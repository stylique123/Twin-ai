// POLISH_CHECK_V2 / VOICE_BARE_LINES in the worker (default off). Fake model, fictional rows only.
import { describe, it, expect, beforeAll } from 'vitest'
import type { Job } from '../db.js'
import type { RecheckDeps, RecheckGeneration } from '../jobs/inventionRecheck.js'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const GEN = 'gen-fixture-v2', OWNER = 'owner-fixture-v2', BUNS = 'prod-buns', RYE = 'prod-rye'
const LINES = ['I bake Sunny Buns every Friday.', 'Baked fresh every Friday morning and delivered the same day.', 'People love bread.', 'Order a box, link in bio.']
const draft = (): RecheckGeneration => ({ id: GEN, user_id: OWNER, reference_note: 'Sunny Buns', blueprint: {
  script: LINES.map((line, n) => ({ section: n === 0 ? 'Hook' : n === 3 ? 'CTA' : 'Body', line })),
  shot_list: LINES.map((line) => ({ shot: 'x', spoken_text: line })), check_status: 'unchecked',
  polish_pending: { steps: ['self_review'] }, invention_gate: { outcome: 'unchecked', reason: 'queued' } } })

function deps(editor: string) {
  const saved: Array<Record<string, unknown>> = []
  const d: RecheckDeps = {
    model: 'fake', now: () => 0, random: () => 0.9,
    loadGeneration: async () => draft(),
    loadKnowledge: async () => [{ id: 'k1', kind: 'experience', text: 'I bake Sunny Buns every Friday before sunrise.' }],
    loadProducts: async () => [
      { id: BUNS, name: 'Sunny Buns', offer: 'Order a box, link in bio', knowledge: [{ id: 'f0', field: 'process_step', value: 'Baked fresh every Friday morning and delivered the same day', trust: 'confirmed', source: 'creator' }] },
      { id: RYE, name: 'Cellar Rye', offer: 'Cellar Rye, link in bio', knowledge: [{ id: 'f1', field: 'process_step', value: 'A rye loaf proofed overnight in a cold cellar for sour depth', trust: 'confirmed', source: 'creator' }] },
    ],
    saveBlueprint: async (_id, bp) => { saved.push(bp) },
    callModel: async (system, prompt) => {
      if (/editor/i.test(system)) return editor
      if (/compare two versions/i.test(system)) return '{"best":"B"}'
      if (/rewrite/i.test(system)) return '{"rewrites":[]}'
      const rows = [...(prompt.split('SENTENCES:')[1] ?? '').matchAll(/^(\d+)\. \([a-z_]+\) (.*)$/gm)]
      return JSON.stringify({ sentences: rows.map((m) => ({ i: Number(m[1]), class: 'S', item_ids: ['k1'] })) })
    },
  }
  return { d, saved }
}
const job = (extra: Record<string, unknown>): Job => ({ id: 'j', owner_id: OWNER, type: 'invention_recheck', status: 'running', attempts: 1, max_attempts: 3,
  payload: { generation_id: GEN, owner_id: OWNER, reason: 'queued', ledger: { target_product_id: BUNS, polish: { goal: 'sell', subject: 'Sunny Buns', voice: { style_note: "High-energy, lots of exclamations, 'you've got this'." } }, ...extra } } })

const INVENT = '{"rewrites":[{"index":"2","line":"A stale loaf costs me more money than baking twice myself."}]}'

describe('POLISH_CHECK_V2 in the worker polish', () => {
  it('flag off: the invented first-person rewrite ships (unchanged behaviour)', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const { d, saved } = deps(INVENT)
    await runInventionRecheck(job({}), d)
    expect(JSON.stringify(saved.at(-1)!.script)).toMatch(/costs me more money/)
    expect(saved.at(-1)!.voice_bare_lines).toBeUndefined()
  })
  it('flag on: the rewrite is rejected and the line stays', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const { d, saved } = deps(INVENT)
    await runInventionRecheck(job({ polish_check_v2: true }), d)
    const bp = saved.at(-1)!
    expect(JSON.stringify(bp.script)).not.toMatch(/costs me more money/)
    expect((bp.polish as { rejected: string[] }).rejected).toContain('new_first_person')
  })
  it('flag on: a rewrite carrying another product fact is rejected', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const { d, saved } = deps('{"rewrites":[{"index":"1","line":"Honestly, it is a rye loaf proofed overnight in a cold cellar for sour depth."}]}')
    await runInventionRecheck(job({ polish_check_v2: true }), d)
    expect(JSON.stringify(saved.at(-1)!.script)).not.toMatch(/cold cellar/)
  })
})

describe('VOICE_BARE_LINES', () => {
  it('voices the CTA in her register, words kept', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const { d, saved } = deps('{"rewrites":[]}')
    await runInventionRecheck(job({ voice_bare_lines: true }), d)
    const bp = saved.at(-1)!
    expect(JSON.stringify(bp.script)).toMatch(/Order a box, link in bio! You've got this!/)
    expect(bp.voice_bare_lines).toEqual({ changed: 1 })
  })
})
