// Async polish (owner decision 2): the worker polishes the draft, then checks it.
// Fake model, fake clock, fictional rows only.
import { describe, it, expect, beforeAll } from 'vitest'
import type { Job } from '../db.js'
import type { RecheckDeps, RecheckGeneration } from '../jobs/inventionRecheck.js'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const GEN = 'gen-fixture-polish'
const OWNER = 'owner-fixture-polish'
const HARBOR = 'prod-harbor'
const LINES = [
  'Here is how I roast Harbor Blend myself.',
  'Roasting is a craft loved by many people.',
  'It tastes like dark chocolate and orange peel.',
  'Grab a bag of Harbor Blend, link in bio.',
]

function draft(): RecheckGeneration {
  return {
    id: GEN, user_id: OWNER, reference_note: 'a video about how I roast Harbor Blend',
    blueprint: {
      script: LINES.map((line, n) => ({ section: n === 0 ? 'Hook' : 'Body', line })),
      shot_list: LINES.map((line) => ({ shot: 'x', spoken_text: line })),
      check_status: 'unchecked',
      polish_pending: { steps: ['self_review', 'payoff_repair'] },
      invention_gate: { outcome: 'unchecked', reason: 'queued' },
    },
  }
}

function deps(editor: string, compare: string, over: Partial<RecheckDeps> = {}) {
  const saved: Array<Record<string, unknown>> = []
  const progress: string[] = []
  const calls: string[] = []
  let t = 0
  const d: RecheckDeps = {
    model: 'fake-flash',
    now: () => t,
    random: () => 0.9, // no flip: B is the edited version
    loadGeneration: async () => draft(),
    loadKnowledge: async () => [{ id: 'k-roast', kind: 'fact', text: 'I roast every batch of Harbor Blend myself; I cool the beans fast; it tastes like dark chocolate and orange peel' }],
    loadProducts: async () => [{ id: HARBOR, name: 'Harbor Blend', knowledge: [], offer: 'Harbor Blend, link in bio' }],
    saveBlueprint: async (_id, bp) => { saved.push(bp) },
    saveProgress: async (_id, bp) => { progress.push(String((bp.gate_progress as { step?: string } | undefined)?.step ?? '?')) },
    callModel: async (system, prompt) => {
      if (/editor/i.test(system)) { calls.push('editor'); t += 24_000; return editor }
      if (/compare two versions/i.test(system)) { calls.push('compare'); t += 6_000; return compare }
      if (/rewrite/i.test(system)) return '{"rewrites":[]}'
      calls.push('judge')
      const block = prompt.split('SENTENCES:')[1] ?? ''
      const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+\) (.*)$/gm)]
      return JSON.stringify({ sentences: rows.map((m) => ({ i: Number(m[1]), class: 'S', item_ids: ['k-roast'] })) })
    },
    ...over,
  }
  return { d, saved, progress, calls }
}

const job = (): Job => ({ id: 'job-p', owner_id: OWNER, type: 'invention_recheck', status: 'running', attempts: 1, max_attempts: 3,
  payload: { generation_id: GEN, owner_id: OWNER, reason: 'queued', ledger: { target_product_id: HARBOR, polish: { goal: 'sell', subject: 'Harbor Blend' } } } })

const EDIT = '{"rewrites":[{"index":"1","line":"The step I never skip is cooling the beans fast."}]}'

describe('async polish in invention_recheck', () => {
  it('polishes before the gate, the gate checks the polished script, status leaves unchecked', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const { d, saved, progress, calls } = deps(EDIT, '{"best":"B"}')
    await runInventionRecheck(job(), d)
    expect(calls.slice(0, 2)).toEqual(['editor', 'compare'])
    expect(calls.indexOf('judge')).toBeGreaterThan(1)
    expect(progress[0]).toBe('polishing')
    const bp = saved.at(-1)!
    expect(JSON.stringify(bp.script)).toMatch(/cooling the beans fast/)
    expect(bp.polish_pending).toBeUndefined()
    expect(bp.polish).toMatchObject({ verdict: 'edited', kept: 1, ms: 30_000 })
    expect(bp.check_status).not.toBe('unchecked')
  })
  it('an edit the blind read does not prefer is not kept; the draft is checked as written', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const { d, saved } = deps(EDIT, '{"best":"A"}')
    await runInventionRecheck(job(), d)
    const bp = saved.at(-1)!
    expect(JSON.stringify(bp.script)).toMatch(/craft loved by many/)
    expect(bp.polish).toMatchObject({ verdict: 'original', kept: 0 })
  })
  it('a failed editor call never blocks the check', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const base = deps('', '')
    const { d, saved } = deps('', '', {
      callModel: async (s, p, sc, t, o) => { if (/editor/i.test(s)) throw new Error('timeout'); return base.d.callModel(s, p, sc, t, o) },
    })
    await runInventionRecheck(job(), d)
    const bp = saved.at(-1)!
    expect(bp.polish).toMatchObject({ verdict: 'error' })
    expect(bp.check_status).not.toBe('unchecked')
  })
  it('without polish on the job (ASYNC_POLISH=off), no editor call is made', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const { d, calls } = deps('{}', '{}')
    const j = job()
    ;(j.payload as { ledger: Record<string, unknown> }).ledger = { target_product_id: HARBOR }
    await runInventionRecheck(j, d)
    expect(calls).not.toContain('editor')
  })
})
