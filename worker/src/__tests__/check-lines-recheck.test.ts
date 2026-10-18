// CHECK THIS LINE (backlog d, trial only): after the gate, the worker records
// the script REVIEW lines on blueprint.check_lines — only when the edge asked
// (`ledger.check_lines`). Fictional fixtures; fake judges.
import { describe, it, expect, beforeAll } from 'vitest'
import type { Job } from '../db.js'
import type { RecheckDeps } from '../jobs/inventionRecheck.js'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const GEN = 'gen-fixture-cl'
const OWNER = 'owner-fixture-cl'
const KITE = 'prod-kite'
const lines = [
  'Here is how I stitch the Paper Kite myself.',
  'It is the calmest kite on a windy beach.',
  'Grab a Paper Kite, link in bio.',
]

function judge(bad: RegExp) {
  return async (prompt: string) => {
    const block = prompt.split('SENTENCES:')[1] ?? ''
    const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+[^)]*\) (.*)$/gm)]
    return JSON.stringify({ sentences: rows.map((m) => (bad.test(m[2]!) ? { i: Number(m[1]), class: 'I', item_ids: [] } : { i: Number(m[1]), class: 'S', item_ids: ['k-stitch'] })) })
  }
}

function deps() {
  const saved: Array<Record<string, unknown>> = []
  const d: RecheckDeps = {
    model: 'fake-fast',
    strongModel: 'fake-strong',
    loadGeneration: async () => ({ id: GEN, user_id: OWNER, reference_note: '', blueprint: {
      script: lines.map((line) => ({ section: 'Body', line })), check_status: 'unchecked', invention_gate: { outcome: 'unchecked', reason: 'queued' },
    } }),
    loadKnowledge: async () => [{ id: 'k-stitch', kind: 'fact', text: 'I stitch every Paper Kite myself' }],
    loadProducts: async () => [{ id: KITE, name: 'Paper Kite', knowledge: [], offer: 'Paper Kite, link in bio' }],
    saveBlueprint: async (_id, bp) => { saved.push(bp) },
    // Only the strong judge flags the wind line: one judge = a REVIEW line.
    callModel: async (system, prompt, _s, _t, opts) => (/rewrite/i.test(system) ? '{"rewrites":[]}'
      : (opts?.model === 'fake-strong' ? judge(/windy/) : judge(/^$/))(prompt)),
  }
  return { d, saved }
}
const job = (ledger: Record<string, unknown>): Job =>
  ({ id: 'job-cl', owner_id: OWNER, type: 'invention_recheck', payload: { generation_id: GEN, ledger: { target_product_id: KITE, ...ledger } }, status: 'running', attempts: 1, max_attempts: 3 })

describe('check_lines after the gate', () => {
  it('trial: the review line is recorded with index, reason and offsets', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const { d, saved } = deps()
    await runInventionRecheck(job({ check_lines: true }), d)
    const bp = saved[0]!
    const cl = bp.check_lines as Array<{ line_index: number; reason: string; span: { start: number; end: number } }>
    expect(cl).toHaveLength(1)
    expect(cl[0]!.line_index).toBe(1)
    expect(typeof cl[0]!.reason).toBe('string')
    expect(cl[0]!.reason).not.toBe('unknown')
    expect(lines[1]!.slice(cl[0]!.span.start, cl[0]!.span.end)).toBe(lines[1])
    expect(bp.review_count).toBe(1)
  })
  it('not asked (real creators): no check_lines, the review count as before', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const { d, saved } = deps()
    await runInventionRecheck(job({}), d)
    expect(saved[0]!.check_lines).toBeUndefined()
    expect(saved[0]!.review_count).toBe(1)
    const rl = (saved[0]!.invention_gate as { review_lines?: Array<Record<string, unknown>> }).review_lines ?? []
    for (const r of rl) expect(r.reason).toBeUndefined()
  })
})
