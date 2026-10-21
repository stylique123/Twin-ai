// DISCONNECT TEST, ledger rows 39 and 40 (worker half): the edge's `never_use`
// (USING_ITEM_KILL) and `story_retell_dedup` (STORY_RETELL_DEDUP) gate flags reach
// the invention gate through the worker's re-check and change the saved script.
// Fictional fixture only (a made-up candle maker "Wickline"); fake judges, no model call.
import { describe, it, expect, beforeAll } from 'vitest'
import type { Job } from '../db.js'
import type { RecheckDeps } from '../jobs/inventionRecheck.js'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const GEN = 'gen-fixture-ur'
const OWNER = 'owner-fixture-ur'
const WICK = 'My first candle tunneled straight down the middle because I used a wick that was too thin.'
const VAN = 'I drove a borrowed van to my first night market and the heater melted half my stock.'

const judgeAllS = async (prompt: string) => {
  const block = prompt.split('SENTENCES:')[1] ?? ''
  const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+[^)]*\) .*$/gm)]
  return JSON.stringify({ sentences: rows.map((m) => ({ i: Number(m[1]), class: 'S', item_ids: ['k-wick'], claim_types: [] })) })
}

function deps(lines: string[], lineSources?: unknown[]) {
  const saved: Array<Record<string, unknown>> = []
  const d: RecheckDeps = {
    model: 'fake-fast',
    strongModel: 'fake-strong',
    loadGeneration: async () => ({ id: GEN, user_id: OWNER, reference_note: '', blueprint: {
      script: lines.map((line, n) => ({ section: n === 0 ? 'hook' : 'build', line })), ...(lineSources ? { line_sources: lineSources } : {}), check_status: 'unchecked', invention_gate: { outcome: 'unchecked', reason: 'queued' },
    } }),
    loadKnowledge: async () => [{ id: 'k-wick', kind: 'experience', text: WICK }, { id: 'k-van', kind: 'experience', text: VAN }],
    loadProducts: async () => [],
    saveBlueprint: async (_id, bp) => { saved.push(bp) },
    callModel: async (system, prompt) => (/rewrite/i.test(system) ? '{"rewrites":[]}' : judgeAllS(prompt)),
  }
  return { d, saved }
}
const job = (ledger: Record<string, unknown>): Job =>
  ({ id: 'job-ur', owner_id: OWNER, type: 'invention_recheck', payload: { generation_id: GEN, ledger: { hold_asks: true, ...ledger } }, status: 'running', attempts: 1, max_attempts: 3 })
const scriptOf = (bp: Record<string, unknown>) => (bp.script as Array<{ line: string }>).map((b) => b.line)

describe('story_retell_dedup through the worker gate', () => {
  const lines = ['Why do candles tunnel?', WICK, 'Trim your wick before every burn.', 'My first candle tunneled down the middle because the wick was too thin.', 'Save this.']
  it('on: the retelling in new words goes; off: it stays', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const on = deps(lines)
    await runInventionRecheck(job({ story_retell_dedup: true }), on.d)
    const off = deps(lines)
    await runInventionRecheck(job({}), off.d)
    expect(scriptOf(on.saved.at(-1)!)).toEqual(['Why do candles tunnel?', WICK, 'Trim your wick before every burn.', 'Save this.'])
    expect((on.saved.at(-1)!.invention_gate as { story_retell?: unknown }).story_retell).toEqual([{ story_id: 'k-wick', kept: 'verbatim', dropped: 1, trimmed: 0 }])
    expect(scriptOf(off.saved.at(-1)!)).toEqual(lines)
  })
})

describe('STORY_RETELL_DEDUP default off', () => {
  // Fictional: a script that tells the Wickline wick story twice (once verbatim, once in new words).
  const lines = ['Why do candles tunnel?', WICK, 'Trim your wick before every burn.', 'My first candle tunneled down the middle because the wick was too thin.', 'Save this.']
  const sources = [null, 'k-wick', null, 'k-wick', null]
  it('switch unset: the retelling passes through byte-identical and no story_retell record changes anything', async () => {
    const prev = process.env.STORY_RETELL_DEDUP
    delete process.env.STORY_RETELL_DEDUP
    try {
      const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
      const off = deps(lines, sources)
      // The edge sends no story_retell_dedup flag while the switch is unset.
      await runInventionRecheck(job({}), off.d)
      const bp = off.saved.at(-1)!
      expect(JSON.stringify(scriptOf(bp))).toBe(JSON.stringify(lines))
      expect(JSON.stringify(bp.line_sources)).toBe(JSON.stringify(sources))
      expect((bp.invention_gate as { story_retell?: unknown }).story_retell).toBeUndefined()
    } finally {
      if (prev !== undefined) process.env.STORY_RETELL_DEDUP = prev
    }
  })
})

describe('never_use through the worker gate', () => {
  // A repeat removed by the spoken de-dup leaves the script under budget: the top-up runs.
  const lines = ['Why does a candle tunnel?', WICK, 'My first candle tunneled straight down the middle because I used a wick that was too thin.', 'Tell me below.']
  it('on: the blocked story is never the refill; off: the old top-up adds it', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const on = deps(lines)
    await runInventionRecheck(job({ spoken_dedup: true, word_budget: 140, never_use: [{ kind: 'fact', id: 'k-van', product_id: null, text: '' }] }), on.d)
    const off = deps(lines)
    await runInventionRecheck(job({ spoken_dedup: true, word_budget: 140 }), off.d)
    expect(scriptOf(off.saved.at(-1)!)).toContain(VAN)
    expect(scriptOf(on.saved.at(-1)!)).not.toContain(VAN)
  })
})
