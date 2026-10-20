// DISCONNECT TEST, ledger row 13 (worker half): the edge's `narrow_repair` and
// `story_dedup` gate flags (NARROW_REPAIR / STORY_DEDUP kill switches) reach the
// invention gate through the worker's re-check, and change the saved script.
// Fictional fixture only (a made-up bike-repair newsletter "Spoke Notes"); fake judges, no model call.
import { describe, it, expect, beforeAll } from 'vitest'
import type { Job } from '../db.js'
import type { RecheckDeps } from '../jobs/inventionRecheck.js'

beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})

const GEN = 'gen-fixture-nr'
const OWNER = 'owner-fixture-nr'
const SPOKE = 'p-spoke'
const STORY = 'My first commute ended with a snapped chain halfway up the bridge because I never oiled it.'

/** Every judged sentence is I (the over-flagging case); the rewriter offers nothing. */
const judgeAllI = async (prompt: string) => {
  const block = prompt.split('SENTENCES:')[1] ?? ''
  const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+[^)]*\) .*$/gm)]
  return JSON.stringify({ sentences: rows.map((m) => ({ i: Number(m[1]), class: 'I', item_ids: [], claim_types: [] })) })
}
/** Every judged sentence is S on her story (so only the story de-dup can change the script). */
const judgeAllS = async (prompt: string) => {
  const block = prompt.split('SENTENCES:')[1] ?? ''
  const rows = [...block.matchAll(/^(\d+)\. \([a-z_]+[^)]*\) .*$/gm)]
  return JSON.stringify({ sentences: rows.map((m) => ({ i: Number(m[1]), class: 'S', item_ids: ['k-story'], claim_types: [] })) })
}

function deps(lines: string[], judge: (p: string) => Promise<string>) {
  const saved: Array<Record<string, unknown>> = []
  const d: RecheckDeps = {
    model: 'fake-fast',
    strongModel: 'fake-strong',
    loadGeneration: async () => ({ id: GEN, user_id: OWNER, reference_note: '', blueprint: {
      script: lines.map((line, n) => ({ section: n === 0 ? 'hook' : 'build', line })), check_status: 'unchecked', invention_gate: { outcome: 'unchecked', reason: 'queued' },
    } }),
    loadKnowledge: async () => [{ id: 'k-story', kind: 'experience', text: STORY }],
    loadProducts: async () => [{ id: SPOKE, name: 'Spoke Notes', knowledge: [], offer: 'Spoke Notes, free' }],
    saveBlueprint: async (_id, bp) => { saved.push(bp) },
    callModel: async (system, prompt) => (/rewrite/i.test(system) ? '{"rewrites":[]}' : judge(prompt)),
  }
  return { d, saved }
}
const job = (ledger: Record<string, unknown>): Job =>
  ({ id: 'job-nr', owner_id: OWNER, type: 'invention_recheck', payload: { generation_id: GEN, ledger: { target_product_id: SPOKE, hold_asks: true, ...ledger } }, status: 'running', attempts: 1, max_attempts: 3 })
const scriptOf = (bp: Record<string, unknown>) => (bp.script as Array<{ line: string }>).map((b) => b.line)

describe('narrow_repair through the worker gate', () => {
  const lines = [
    'My chain snapped halfway up the bridge.',
    'In my experience, chain wax belongs in a race workshop.',
    'A dry chain squeaks on the bridge.',
    'Get Spoke Notes free.',
  ]
  it('on: only the invented-element line goes and the plain line ships; off: the gate output differs', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const on = deps(lines, judgeAllI)
    await runInventionRecheck(job({ narrow_repair: true }), on.d)
    const off = deps(lines, judgeAllI)
    await runInventionRecheck(job({}), off.d)
    const onScript = scriptOf(on.saved.at(-1)!)
    const offScript = scriptOf(off.saved.at(-1)!)
    expect(onScript).not.toEqual(offScript)
    expect(onScript.some((t) => /in my experience/i.test(t))).toBe(false)
    expect(onScript).toContain('A dry chain squeaks on the bridge.')
  })
})

describe('story_dedup through the worker gate', () => {
  // The hook is never de-duplicated (panel 9) and the floor is kept: the paraphrase sits after the story.
  const lines = [
    'Oil the chain every Sunday.',
    STORY,
    'Halfway up the bridge my unoiled chain snapped on my first commute.',
    'Tell me how often you do yours.',
  ]
  it('on: the paraphrase of her verbatim story is removed; off: it ships', async () => {
    const { runInventionRecheck } = await import('../jobs/inventionRecheck.js')
    const on = deps(lines, judgeAllS)
    await runInventionRecheck(job({ story_dedup: true }), on.d)
    const off = deps(lines, judgeAllS)
    await runInventionRecheck(job({}), off.d)
    expect(scriptOf(on.saved.at(-1)!)).toEqual(['Oil the chain every Sunday.', STORY, 'Tell me how often you do yours.'])
    expect(scriptOf(off.saved.at(-1)!)).toEqual(lines)
  })
})
