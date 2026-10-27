// Plan v6.8 §33, thin material: the QC asks ONE question; her answer is saved as
// her fact through the angle-answer store (answerFactRow, source 'asked'); on the
// NEXT request the worker's ledger reads that row (loadOnboarding: source 'asked')
// and the QC uses it instead of asking again. Fake model, fictional rows only.
import { describe, it, expect, beforeAll } from 'vitest'
import type { Job } from '../db.js'
import type { RecheckDeps, RecheckGeneration } from '../jobs/inventionRecheck.js'
import { answerFactRow } from '../../../packages/shared/src/script/questionUsefulness'
import { qcAnswersToStore, QC_STORY_KEY } from '../generated/qualityController.js'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const GEN = 'gen-fixture-qc'
const OWNER = 'owner-fixture-qc'
const LINES = ['Why do your coffee beans taste flat after one week?', 'Stale beans lose their smell first.']

const gen = (): RecheckGeneration => ({
  id: GEN, user_id: OWNER, reference_note: 'how to tell if your coffee beans are stale',
  blueprint: { script: LINES.map((line, n) => ({ section: n ? 'Body' : 'Hook', line })), check_status: 'unchecked', invention_gate: { outcome: 'unchecked', reason: 'queued' } },
})
const job = (): Job => ({ id: 'job-qc', owner_id: OWNER, type: 'invention_recheck', status: 'running', attempts: 1, max_attempts: 3,
  payload: { generation_id: GEN, owner_id: OWNER, reason: 'queued', ledger: { hold_asks: true, quality_controller: { profile: 'standard', topic: 'how to tell if your coffee beans are stale', niche: 'coffee' } } } })

function deps(asked: Array<{ id: string; kind: string; text: string; source: string }>) {
  const saved: Array<Record<string, unknown>> = []
  const d: RecheckDeps = {
    model: 'fake-flash',
    now: () => 0,
    loadGeneration: async () => gen(),
    loadKnowledge: async () => [],
    loadProducts: async () => [],
    loadOnboarding: async () => asked,
    saveBlueprint: async (_id, bp) => { saved.push(bp) },
    callModel: async (system, prompt) => {
      if (/rewrite/i.test(system)) return '{"rewrites":[]}'
      const block = prompt.split('SENTENCES:')[1] ?? ''
      const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+\) (.*)$/gm)]
      return JSON.stringify({ sentences: rows.map((m) => ({ i: Number(m[1]), class: 'S', item_ids: [] })) })
    },
  }
  return { d, saved }
}

const STORY = 'A regular told me her coffee beans tasted flat after a week, and when I asked, she was keeping the beans in the fridge next to the onions.'

describe('QC thin-material answer: saved, then reused on the next request', () => {
  it('request 1: no story on file, so the QC asks one question and pads nothing', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const { d, saved } = deps([])
    await runInventionRecheck(job(), d)
    const bp = saved.at(-1)!
    expect((bp.qc_report as { question: string | null }).question).toBe(QC_STORY_KEY)
    expect((bp.gate_questions as Array<{ writes_to?: string; key?: string }>).some((q) => q.writes_to === QC_STORY_KEY && q.key === 'mn:qc:story')).toBe(true)
    // Never padded: the QC added nothing (the gate's own repair may already have trimmed a line).
    const r = bp.qc_report as { added: unknown[]; words_after: number; words_before: number; thin: string | null }
    expect(r.added).toEqual([])
    expect(r.words_after).toBeLessThanOrEqual(r.words_before)
    expect(r.thin).toBe('asked')
  })

  it('her answer becomes her fact through the angle-answer row (source asked)', () => {
    const reqs = qcAnswersToStore({ [QC_STORY_KEY]: STORY, angle: 'x' })
    expect(reqs).toEqual([{ key: 'mn:qc:story', piece: 'story', answer: STORY, product: false }])
    const row = answerFactRow({ ownerId: OWNER, key: reqs[0]!.key, piece: reqs[0]!.piece, answer: reqs[0]!.answer, now: '2026-10-26T00:00:00.000Z' })!
    expect(row).toMatchObject({ owner_id: OWNER, kind: 'experience', source: 'asked', basis: 'stated', source_ref: 'asked:mn:qc:story' })
    expect(qcAnswersToStore({ [QC_STORY_KEY]: '   ' })).toEqual([])
  })

  it('request 2: the saved fact is in the ledger; the QC uses it and does not ask again', async () => {
    const row = answerFactRow({ ownerId: OWNER, key: 'mn:qc:story', piece: 'story', answer: STORY, now: '2026-10-26T00:00:00.000Z' })!
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const { d, saved } = deps([{ id: 'k-asked-qc', kind: row.kind, text: row.text, source: row.source }])
    await runInventionRecheck(job(), d)
    const bp = saved.at(-1)!
    const r = bp.qc_report as { question: string | null; added: Array<{ id: string; kind: string }> }
    expect(r.question).toBeNull()
    expect(r.added.map((a) => a.id)).toContain('k-asked-qc')
    expect(JSON.stringify(bp.script)).toMatch(/fridge next to the onions/)
  })
})
