// OWNER RULE (13 Oct): a gate timeout must NOT silently ship an unchecked
// script. Pins the outcome → check_status mapping, the unchecked record, and
// the edge wiring that enqueues the durable re-check. Fictional fixtures only.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLedger, runInventionGate, checkStatusFor, uncheckedRecord, type GateBlueprint } from '../inventionGate.js'
import { resyncShotListToScript } from '../shotListSync.js'

const script = (...lines: string[]): GateBlueprint => ({
  script: lines.map((line, n) => ({ section: n === 0 ? 'Hook' : 'Body', line })),
  shot_list: lines.map((line) => ({ shot: 'x', spoken_text: line })),
})
const ledger = buildLedger({ knowledge: [{ id: 'k-roast', kind: 'fact', text: 'I roast every batch of Harbor Blend myself' }], now: 0 })

describe('check status', () => {
  it('maps each outcome to the blueprint check_status', () => {
    expect(checkStatusFor({ outcome: 'final', timed_out: false })).toEqual({ status: 'checked', reason: null })
    expect(checkStatusFor({ outcome: 'needs_answers', timed_out: false })).toEqual({ status: 'needs_answers', reason: null })
    expect(checkStatusFor({ outcome: 'general', timed_out: false })).toEqual({ status: 'general', reason: null })
    expect(checkStatusFor({ outcome: 'timeout', timed_out: true })).toEqual({ status: 'unchecked', reason: 'timeout' })
    expect(checkStatusFor({ outcome: 'measure_only', timed_out: false })).toEqual({ status: 'unchecked', reason: 'error' })
    expect(checkStatusFor({ outcome: 'unchecked', timed_out: true })).toEqual({ status: 'unchecked', reason: 'timeout' })
    expect(checkStatusFor(null)).toEqual({ status: 'unchecked', reason: 'error' })
  })
  it('a timed-out gate maps to an unchecked record with reason timeout', async () => {
    let t = 0
    const r = await runInventionGate({ blueprint: script('I roast Harbor Blend myself.', 'It tastes great.', 'Link in bio.'), ledger, timeoutMs: 10, now: () => t }, {
      judge: () => { t = 50; return new Promise<string>(() => {}) },
      rewrite: async () => '{"rewrites":[]}',
    })
    expect(r.record.outcome).toBe('timeout')
    const st = checkStatusFor(r.record)
    expect(st).toEqual({ status: 'unchecked', reason: 'timeout' })
    expect(uncheckedRecord(r.record, 'timeout', r.record.ms)).toMatchObject({ outcome: 'unchecked', reason: 'timeout', timed_out: true })
  })
  it('a judge that throws maps to unchecked with reason error', async () => {
    const r = await runInventionGate({ blueprint: script('I roast Harbor Blend myself.', 'It tastes great.', 'Link in bio.'), ledger }, {
      judge: async () => { throw new Error('boom') },
      rewrite: async () => '{"rewrites":[]}',
    })
    expect(checkStatusFor(r.record)).toEqual({ status: 'unchecked', reason: 'error' })
    expect(uncheckedRecord(null, 'error', 3)).toMatchObject({ outcome: 'unchecked', reason: 'error', timed_out: false, ms: 3 })
  })
  it('resyncShotListToScript makes each spoken shot quote its beat and carry its camera', () => {
    const bp: Record<string, unknown> = {
      script: [{ line: 'New hook.', camera: 'back', action_posing: 'hold the bag' }, { line: 'Second.' }],
      shot_list: [{ spoken_text: 'Old hook.' }, { spoken_text: 'Second.' }],
    }
    resyncShotListToScript(bp)
    const shots = bp.shot_list as Array<Record<string, unknown>>
    expect(shots[0]).toMatchObject({ spoken_text: 'New hook.', camera: 'back', notes: 'hold the bag' })
  })
})

describe('wiring: an unchecked gate enqueues a durable re-check', () => {
  const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
  const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
  it('under trialOn the edge never judges inline: it marks the blueprint unchecked (reason queued) and sets the job', () => {
    expect(EDGE).not.toContain('runInventionGate(')
    expect(EDGE).not.toContain('callOnce(apiKey!, INVENTION_JUDGE_SYSTEM')
    const at = EDGE.indexOf("inventionUncheckedRecord(null, 'queued', 0)")
    expect(at).toBeGreaterThan(0)
    const block = EDGE.slice(EDGE.lastIndexOf('if (trialOn && blueprint', at), EDGE.indexOf("traceBeats('shipped'", at))
    expect(block).toMatch(/bpg\.check_status = 'unchecked'/)
    expect(block).toMatch(/inventionRecheck = \{ reason: 'queued', ledger: \{ answers: gateAnswers, outside: gateOutside, offer: gateOffer, target_product_id: gateTarget, \.\.\.\(gateMeasure \? \{ measure_only: true \} : \{\}\), \.\.\.\(trialOn \? \{ rule_review: true \} : \{\}\) \} \}/)
    expect(block).toContain("event: 'invention_gate_queued'")
  })
  it('enqueues an invention_recheck jobs row keyed on the saved generation id, right after the save', () => {
    const save = EDGE.indexOf('const { data: gen, error: insErr } = await admin')
    const enq = EDGE.indexOf('enqueueInventionRecheck(admin, { generationId: gen.id')
    expect(save).toBeGreaterThan(0)
    expect(enq).toBeGreaterThan(save)
    expect(EDGE.slice(save, enq)).toMatch(/if \(gen\?\.id && inventionRecheck\)/)
    const helper = EDGE.slice(EDGE.indexOf('async function enqueueInventionRecheck'))
    expect(helper.slice(0, 900)).toMatch(/from\('jobs'\)\.insert\(/)
    expect(EDGE).toContain("const INVENTION_RECHECK_JOB = 'invention_recheck'")
  })
})
