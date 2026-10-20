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
    // TARGETED_FLAGS=false: the gate-review check lines, as before plan v5.4 §20.
    await runInventionRecheck(job({ check_lines: true }), { ...d, targetedFlagsFlag: 'false' })
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

describe('plan v5.4 §20: targeted check lines and onboarding answers in the ledger', () => {
  const RISKY = 'This kite stops tangles completely on any beach.'
  const NICHE = 'I talk about calm beach kites, hand stitching and windy days, not stunt flying.'
  function targetedDeps(script: string[]) {
    const base = deps()
    const loads: string[] = []
    const d: RecheckDeps = {
      ...base.d,
      loadGeneration: async () => ({ id: GEN, user_id: OWNER, reference_note: '', blueprint: {
        script: script.map((line) => ({ section: 'Body', line })), check_status: 'unchecked', invention_gate: { outcome: 'unchecked', reason: 'queued' },
      } }),
      loadOnboarding: async (owner) => { loads.push(owner); return [{ id: 'k-niche', kind: 'topic', text: NICHE }] },
    }
    return { d, saved: base.saved, loads }
  }
  it('default: only the deterministic risk is a check line; the gate-only review line is not', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const { d, saved } = targetedDeps([...lines, RISKY])
    await runInventionRecheck(job({ check_lines: true, hold_asks: true }), d)
    const cl = saved[0]!.check_lines as Array<{ line_index: number; reason: string }>
    expect(cl.map((l) => [l.line_index, l.reason])).toEqual([[3, 'absolute_efficacy']])
    expect(saved[0]!.check_lines_version).toBe('targeted-flags-v1')
  })
  it('her onboarding answer said back is never flagged, and it reaches the gate ledger (trial only)', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const on = targetedDeps([NICHE, ...lines])
    await runInventionRecheck(job({ check_lines: true, hold_asks: true }), on.d)
    expect(on.loads).toEqual([OWNER])
    expect(on.saved[0]!.check_lines).toEqual([])
    // Not trial (no hold_asks), or killed: onboarding answers are not read.
    const real = targetedDeps(lines)
    await runInventionRecheck(job({}), real.d)
    expect(real.loads).toEqual([])
    const killed = targetedDeps(lines)
    await runInventionRecheck(job({ hold_asks: true }), { ...killed.d, onboardingLedgerFlag: 'false' })
    expect(killed.loads).toEqual([])
  })
  it('onboardingRows: her asked/user rows and pre_script_brief answers and pillars', async () => {
    const { onboardingRows } = await import('../jobs/inventionRecheck.js')
    const rows = onboardingRows([{ id: 'k1', kind: 'fact', text: ' I stitch kites. ' }, { id: 'k2', text: '' }],
      { audience: 'beach walkers', contentPillars: ['kite care', ''], background: 'Sailmaker', goal: 'sales' })
    expect(rows).toEqual([
      { id: 'k1', kind: 'fact', text: 'I stitch kites.' },
      { id: 'brief:audience', kind: 'fact', text: 'beach walkers' },
      { id: 'brief:background', kind: 'fact', text: 'Sailmaker' },
      { id: 'brief:contentPillars:0', kind: 'topic', text: 'kite care' },
    ])
  })
})
