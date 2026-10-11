// OWNER RULE (13 Oct): a gate timeout must NOT silently ship an unchecked
// script. The worker's invention_recheck re-runs the gate on the saved
// generation. Fake judge and fake rows only (fictional fixtures).
import { describe, it, expect, beforeAll } from 'vitest'
import type { Job } from '../db.js'
import type { RecheckDeps, RecheckGeneration } from '../jobs/inventionRecheck.js'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const GEN = 'gen-fixture-1'
const OWNER = 'owner-fixture-1'
const HARBOR = 'prod-harbor'

function unchecked(): RecheckGeneration {
  const lines = [
    'Here is how I roast Harbor Blend myself.',
    'It sells out every single week.',
    'It tastes like dark chocolate and orange peel.',
    'Grab a bag of Harbor Blend, link in bio.',
  ]
  return {
    id: GEN,
    user_id: OWNER,
    reference_note: 'a video about how I roast Harbor Blend',
    blueprint: {
      script: lines.map((line, n) => ({ section: n === 0 ? 'Hook' : 'Body', line })),
      shot_list: lines.map((line) => ({ shot: 'x', spoken_text: line })),
      check_status: 'unchecked',
      invention_gate: { outcome: 'unchecked', reason: 'timeout', timed_out: true },
    },
  }
}

/** Answers from a table: sentences matching `bad` are I, everything else S. */
function fakeJudge(bad: RegExp) {
  return async (prompt: string) => {
    const block = prompt.split('SENTENCES:')[1] ?? ''
    const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+\) (.*)$/gm)]
    return JSON.stringify({ sentences: rows.map((m) => bad.test(m[2]!)
      ? { i: Number(m[1]), class: 'I', item_ids: [] }
      : { i: Number(m[1]), class: 'S', item_ids: ['k-roast'] }) })
  }
}

function deps(over: Partial<RecheckDeps> & { judge?: (p: string) => Promise<string> } = {}) {
  const saved: Array<{ id: string; blueprint: Record<string, unknown> }> = []
  const judge = over.judge ?? fakeJudge(/sells out/)
  const d: RecheckDeps = {
    model: 'fake-flash',
    loadGeneration: async () => unchecked(),
    loadKnowledge: async () => [{ id: 'k-roast', kind: 'fact', text: 'I roast every batch of Harbor Blend myself; it tastes like dark chocolate and orange peel' }],
    loadProducts: async () => [{ id: HARBOR, name: 'Harbor Blend', knowledge: [], offer: 'Harbor Blend, link in bio' }],
    saveBlueprint: async (id, blueprint) => { saved.push({ id, blueprint }) },
    callModel: async (system, prompt) => (/rewrite/i.test(system) ? '{"rewrites":[]}' : judge(prompt)),
    ...over,
  }
  return { d, saved }
}

const job = (payload: Record<string, unknown> = { generation_id: GEN, owner_id: OWNER, reason: 'timeout', ledger: { target_product_id: HARBOR } }): Job =>
  ({ id: 'job-1', owner_id: OWNER, type: 'invention_recheck', payload, status: 'running', attempts: 1, max_attempts: 3 })

describe('invention_recheck', () => {
  it('a timed-out script is re-checked: the invented line is repaired and check_status leaves unchecked', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const { d, saved } = deps()
    const out = await runInventionRecheck(job(), d)
    expect(saved).toHaveLength(1)
    const bp = saved[0]!.blueprint
    expect(saved[0]!.id).toBe(GEN)
    expect(JSON.stringify(bp.script)).not.toMatch(/sells out/)
    expect(['checked', 'needs_answers', 'general']).toContain(bp.check_status)
    const rec = bp.invention_gate as Record<string, unknown>
    expect(rec.outcome).not.toBe('unchecked')
    expect(rec.rechecked).toBe(true)
    expect(typeof rec.ms).toBe('number')
    // The shot list says what the repaired script says.
    const spoken = (bp.shot_list as Array<{ spoken_text?: string }>).map((s) => s.spoken_text ?? '').join(' ')
    expect(spoken).not.toMatch(/sells out/)
    expect(out).toMatchObject({ generation_id: GEN, check_status: bp.check_status })
  })

  it('a re-check that fails writes nothing (check_status stays unchecked) and throws so the job retries', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const { d, saved } = deps({ judge: async () => { throw new Error('model down') } })
    await expect(runInventionRecheck(job(), d)).rejects.toThrow(/invention_recheck: gate error/)
    expect(saved).toHaveLength(0)
    const { isPermanent } = await import('../errors.js')
    try { await runInventionRecheck(job(), d) } catch (e) { expect(isPermanent(e)).toBe(false) }
  })

  it('a re-check that times out also writes nothing and retries', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    let t = 0
    const { d, saved } = deps({ now: () => t, judge: () => { t = 200_000; return new Promise<string>(() => {}) } })
    await expect(runInventionRecheck(job(), d)).rejects.toThrow(/gate timeout/)
    expect(saved).toHaveLength(0)
  })

  it('an already-checked generation is skipped; a missing one is permanent', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const g = unchecked(); g.blueprint!.check_status = 'checked'
    const { d, saved } = deps({ loadGeneration: async () => g })
    expect(await runInventionRecheck(job(), d)).toMatchObject({ skipped: 'already_checked' })
    expect(saved).toHaveLength(0)
    const { isPermanent } = await import('../errors.js')
    const gone = deps({ loadGeneration: async () => null }).d
    await runInventionRecheck(job(), gone).then(() => { throw new Error('expected a throw') }, (e) => expect(isPermanent(e)).toBe(true))
  })

  it('writes real step events (judging with chunk counts, done) and never a progress write after the result', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const progress: Array<Record<string, unknown>> = []
    const order: string[] = []
    const { d, saved } = deps({
      saveProgress: async (_id, blueprint) => { progress.push(blueprint.gate_progress as Record<string, unknown>); order.push('progress') },
    })
    const wrapped = { ...d, saveBlueprint: async (id: string, b: Record<string, unknown>) => { order.push('result'); await d.saveBlueprint(id, b) } }
    await runInventionRecheck(job(), wrapped)
    expect(progress[0]).toMatchObject({ step: 'judging', chunks_done: 0 })
    expect(progress.some((p) => p.step === 'judging' && (p.chunks_total as number) >= 1 && p.chunks_done === p.chunks_total)).toBe(true)
    expect(order[order.length - 1]).toBe('result')
    const bp = saved[0]!.blueprint
    expect(bp.gate_progress).toMatchObject({ step: 'done' })
    expect(bp.check_status).not.toBe('unchecked')
    const perf = (bp.invention_gate as { perf?: Record<string, unknown> }).perf!
    expect(perf).toMatchObject({ judge_calls: expect.any(Number), escalations: expect.any(Number), ms_total: expect.any(Number) })
    expect(perf.chunk_ms).toBeInstanceOf(Array)
  })

  it('a failed run writes only the failed step event; the result is not written and check_status stays unchecked', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const progress: Array<Record<string, unknown>> = []
    const { d, saved } = deps({ judge: async () => { throw new Error('model down') }, saveProgress: async (_id, b) => { progress.push(b) } })
    await expect(runInventionRecheck(job(), d)).rejects.toThrow(/gate error/)
    expect(saved).toHaveLength(0)
    const last = progress[progress.length - 1]!
    expect(last.gate_progress).toMatchObject({ step: 'failed' })
    expect(last.check_status).toBe('unchecked')
  })

  it('cascade: the judge runs with thinking 0 on the fast model; only uncertain sentences go to the strong model', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const calls: Array<{ model?: string; thinkingBudget?: number; prompt: string }> = []
    const { d, saved } = deps({
      strongModel: 'fake-pro',
      callModel: async (system, prompt, _schema, _t, opts) => {
        if (/rewrite/i.test(system)) return '{"rewrites":[]}'
        calls.push({ model: opts?.model, thinkingBudget: opts?.thinkingBudget, prompt })
        const block = prompt.split('SENTENCES:')[1] ?? ''
        const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+\) (.*)$/gm)]
        return JSON.stringify({ sentences: rows.map((m) => ({ i: Number(m[1]), class: 'S', item_ids: ['k-roast'], ...(opts?.model === 'fake-flash' && /chocolate/.test(m[2]!) ? { uncertain: true } : {}) })) })
      },
    })
    await runInventionRecheck(job(), d)
    const fast = calls.filter((c) => c.model === 'fake-flash')
    const strong = calls.filter((c) => c.model === 'fake-pro')
    expect(fast.length).toBeGreaterThanOrEqual(1)
    expect(strong).toHaveLength(1)
    expect(strong[0]!.prompt.split('SENTENCES:')[1]).toMatch(/chocolate/)
    expect(strong[0]!.prompt.split('SENTENCES:')[1]).not.toMatch(/roast Harbor Blend myself/)
    expect(calls.every((c) => c.thinkingBudget === 0)).toBe(true)
    expect((saved[0]!.blueprint.invention_gate as { perf: { escalations: number } }).perf.escalations).toBe(1)
  })

  it('is registered and routes its model through the catalog', async () => {
    const { handlers } = await import('../jobs/index.js')
    expect(handlers).toHaveProperty('invention_recheck')
    const { INVENTION_RECHECK_TASK, INVENTION_RECHECK_STRONG_TASK } = await import('../jobs/inventionRecheck.js')
    const { modelForTask } = await import('../modelRouting.js')
    expect([INVENTION_RECHECK_TASK, INVENTION_RECHECK_STRONG_TASK]).toEqual(['read', 'extract'])
    expect(modelForTask(INVENTION_RECHECK_TASK)).toBeTruthy()
    expect(modelForTask(INVENTION_RECHECK_STRONG_TASK)).toBeTruthy()
  })
})
