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

  it('is registered and routes its model through the catalog', async () => {
    const { handlers } = await import('../jobs/index.js')
    expect(handlers).toHaveProperty('invention_recheck')
    const { INVENTION_RECHECK_TASK } = await import('../jobs/inventionRecheck.js')
    const { modelForTask } = await import('../modelRouting.js')
    expect(modelForTask(INVENTION_RECHECK_TASK)).toBeTruthy()
  })
})
