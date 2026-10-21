// DISCONNECT TEST, ledger row 35 (worker half): the edge's `refill_context` and
// `story_hook_dedup` gate flags (RELEVANT_REFILL / STORY_HOOK_DEDUP kill switches)
// reach the invention gate through the worker's re-check and change the saved script.
// Fictional fixture only (a made-up candle maker "Wickline"); fake judges, no model call.
import { describe, it, expect, beforeAll } from 'vitest'
import type { Job } from '../db.js'
import type { RecheckDeps } from '../jobs/inventionRecheck.js'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const GEN = 'gen-fixture-rr'
const OWNER = 'owner-fixture-rr'
const STORY = 'A shopper picked up a jar, sniffed it, and asked why it smelled of nothing, so now I put a scent card on every shelf.'
const VAN = 'I drove a borrowed van to my first night market and the heater melted half my stock.'

/** Every judged sentence is S on her story (only the trial passes can change the script). */
const judgeAllS = async (prompt: string) => {
  const block = prompt.split('SENTENCES:')[1] ?? ''
  const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+[^)]*\) .*$/gm)]
  return JSON.stringify({ sentences: rows.map((m) => ({ i: Number(m[1]), class: 'S', item_ids: ['k-story'], claim_types: [] })) })
}

function deps(lines: string[]) {
  const saved: Array<Record<string, unknown>> = []
  const d: RecheckDeps = {
    model: 'fake-fast',
    strongModel: 'fake-strong',
    loadGeneration: async () => ({ id: GEN, user_id: OWNER, reference_note: '', blueprint: {
      script: lines.map((line, n) => ({ section: n === 0 ? 'hook' : 'build', line })), check_status: 'unchecked', invention_gate: { outcome: 'unchecked', reason: 'queued' },
    } }),
    loadKnowledge: async () => [{ id: 'k-story', kind: 'experience', text: STORY }, { id: 'k-van', kind: 'experience', text: VAN }],
    loadProducts: async () => [],
    saveBlueprint: async (_id, bp) => { saved.push(bp) },
    callModel: async (system, prompt) => (/rewrite/i.test(system) ? '{"rewrites":[]}' : judgeAllS(prompt)),
  }
  return { d, saved }
}
const job = (ledger: Record<string, unknown>): Job =>
  ({ id: 'job-rr', owner_id: OWNER, type: 'invention_recheck', payload: { generation_id: GEN, ledger: { hold_asks: true, ...ledger } }, status: 'running', attempts: 1, max_attempts: 3 })
const scriptOf = (bp: Record<string, unknown>) => (bp.script as Array<{ line: string }>).map((b) => b.line)

describe('story_hook_dedup through the worker gate', () => {
  const lines = ['A shopper asked why my jar smelled of nothing.', STORY, 'Tell me what you smell first.']
  it('on: the story starts after the beat the hook already told; off: it repeats', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const on = deps(lines)
    await runInventionRecheck(job({ story_hook_dedup: true }), on.d)
    const off = deps(lines)
    await runInventionRecheck(job({}), off.d)
    expect(scriptOf(on.saved.at(-1)!)[1]).toBe('So now I put a scent card on every shelf.')
    expect(scriptOf(off.saved.at(-1)!)).toEqual(lines)
  })
})

describe('refill_context through the worker gate', () => {
  // A repeat removed by the spoken de-dup leaves the script under budget: the top-up runs.
  const lines = ['Why does an unscented candle sell?', STORY, 'A shopper sniffed a jar and asked why it smelled of nothing.', 'Tell me below.']
  it('on: no unrelated second story is added; off: the old top-up adds one', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const on = deps(lines)
    await runInventionRecheck(job({ spoken_dedup: true, story_dedup: true, word_budget: 140, refill_context: { topic: 'why unscented candles sell', angle: '' } }), on.d)
    const off = deps(lines)
    await runInventionRecheck(job({ spoken_dedup: true, story_dedup: true, word_budget: 140 }), off.d)
    expect(scriptOf(off.saved.at(-1)!)).toContain(VAN)
    expect(scriptOf(on.saved.at(-1)!)).not.toContain(VAN)
  })
})
