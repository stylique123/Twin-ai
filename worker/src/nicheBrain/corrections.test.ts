import { describe, it, expect, vi, beforeEach } from 'vitest'

// Script batch audit 2026-10-03: her rating note must exclude the facts it rejects.
const calls: Array<{ table: string; op: string; payload?: unknown; filters: unknown[] }> = []
const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = []
const TABLES: Record<string, unknown[]> = {}

function query(table: string) {
  const rec = { table, op: 'select', payload: undefined as unknown, filters: [] as unknown[] }
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'is', 'eq', 'not', 'in', 'order', 'limit']) {
    q[m] = (...a: unknown[]) => { if (m !== 'select') rec.filters.push([m, ...a]); return q }
  }
  q.update = (p: unknown) => { rec.op = 'update'; rec.payload = p; return q }
  q.then = (res: (v: unknown) => unknown) => { calls.push(rec); return Promise.resolve({ data: rec.op === 'select' ? TABLES[table] : null, error: null }).then(res) }
  return q
}

vi.mock('../db.js', () => ({
  db: {
    from: (t: string) => query(t),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args })
      if (fn === 'learn_lesson') TABLES.creator_lessons!.push({ kind: args.p_kind, phrase: args.p_phrase, active: true })
      return { data: null, error: null }
    },
  },
}))
vi.mock('../gemini.js', () => ({
  geminiJson: async () => ({ rejects: ['two-pound batches', 'cup-score claims', 'invented by the model'] }),
}))
vi.mock('../modelRouting.js', () => ({ modelForTask: () => 'm' }))

const { runCorrectionApplier } = await import('./lessons.js')

describe('the correction pass', () => {
  beforeEach(() => {
    calls.length = 0; rpcs.length = 0
    TABLES.script_ratings = [{ generation_id: 'g1', owner_id: 'o1', change_note: "brings back the two-pound batches and cup-score claims I've excluded multiple times now" }]
    TABLES.creator_lessons = []
    TABLES.creator_knowledge = [
      { id: 'k1', text: 'I roast in two-pound batches with zero inventory', creator_excluded_at: null },
      { id: 'k2', text: 'Our Ethiopia hit an 88 cup score', creator_excluded_at: null },
      { id: 'k3', text: 'I started in my garage', creator_excluded_at: null },
    ]
  })
  it('files her words as avoid lessons and excludes the facts that say them', async () => {
    await runCorrectionApplier(() => {})
    expect(rpcs.filter((r) => r.fn === 'learn_lesson').map((r) => r.args.p_phrase)).toEqual(['two-pound batches', 'cup-score claims'])
    const ex = calls.find((c) => c.table === 'creator_knowledge' && c.op === 'update')!
    expect(ex.payload).toHaveProperty('creator_excluded_at')
    expect(ex.filters).toContainEqual(['in', 'id', ['k1', 'k2']])
    expect(calls.some((c) => c.table === 'script_ratings' && c.op === 'update')).toBe(true)
  })
})
