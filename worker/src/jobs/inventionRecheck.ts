// ⚖️ THE ZERO-INVENTION GATE AS A DURABLE WORKER STEP (owner decision 13 Oct).
//
// Under the trial the edge no longer runs the gate inline: it saves the script
// with `blueprint.check_status = 'unchecked'` (record reason 'queued') and
// enqueues this job keyed on the saved generation id. Here the FULL gate runs
// (rules prefilter, chunked judge: the read and extract judges both judge every chunk, repair,
// shot-list re-sync, questions) with a 120 s budget, and the blueprint + record
// are written back. While it runs, `blueprint.gate_progress` carries real step
// events ('judging' with chunk counts, 'repairing', 'done', 'failed') that the
// app's NeedsAnswerGate shows. Target: p90 ≤ 30 s from enqueue to write.
//
// The ledger is rebuilt the way scripts/eval/gate-calibrate.mjs rebuilds it
// from saved data (the knowledge the generation recorded spending, her
// products, her note), plus the request-only material the edge put on the job
// payload (her answers, the outside board, the offer, the target product).
//
// ⚠️ A RE-CHECK THAT DOES NOT FINISH WRITES NOTHING. check_status stays
// 'unchecked' and the job throws, so the normal retry policy (backoff,
// max_attempts) owns it. Ids and reasons only in logs — never text.
import type { Job } from '../db.js'
import { PermanentJobError } from '../errors.js'
import {
  buildLedger, runInventionGate, checkStatusFor, gateProgress, GATE_REWRITTEN_KEYS,
  INVENTION_RECHECK_TIMEOUT_MS, INVENTION_JUDGE_CASCADE, JUDGE_THINKING_BUDGET, JUDGE_SYSTEM, JUDGE_SCHEMA, REWRITE_SYSTEM, REWRITE_SCHEMA,
  type GateBlueprint, type GateProgress, type InventionGateRecord,
} from '../generated/inventionGate.js'
import { resyncShotListToScript } from '../generated/shotListSync.js'

/** The fast judge and the rewrite (task class of model_routing_v1.json). */
export const INVENTION_RECHECK_TASK = INVENTION_JUDGE_CASCADE.fast
/** The stronger judge: judges every sentence too, in parallel (two judges, owner Reply 13). */
export const INVENTION_RECHECK_STRONG_TASK = INVENTION_JUDGE_CASCADE.strong
/** Judging progress is written at most this often (step changes always go out). */
export const PROGRESS_MIN_INTERVAL_MS = 1_000

export interface CallOpts { model?: string; thinkingBudget?: number }

export interface RecheckGeneration {
  id: string
  user_id: string
  blueprint: Record<string, unknown> | null
  reference_note?: string | null
}

export interface RecheckDeps {
  loadGeneration(id: string): Promise<RecheckGeneration | null>
  loadKnowledge(generationId: string): Promise<Array<{ id?: unknown; kind?: unknown; text?: unknown }>>
  loadProducts(ownerId: string): Promise<Array<{ id?: unknown; name?: unknown; offer?: unknown; knowledge?: unknown }>>
  saveBlueprint(id: string, blueprint: Record<string, unknown>): Promise<void>
  /** A cheap step-event write of `blueprint.gate_progress` (never the gate's result). */
  saveProgress?(id: string, blueprint: Record<string, unknown>): Promise<void>
  /** One schema-constrained model call; returns the raw JSON text. `opts.model` overrides the fast model. */
  callModel(system: string, prompt: string, schema: unknown, timeoutMs: number, opts?: CallOpts): Promise<string>
  /** The fast model (task class `read`). */
  model: string
  /** The stronger model (task class `extract`); absent = the fast judge stands in for both. */
  strongModel?: string
  now?: () => number
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})

export async function runInventionRecheck(job: Job, deps: RecheckDeps): Promise<Record<string, unknown>> {
  const payload = rec(job.payload)
  const generationId = typeof payload.generation_id === 'string' ? payload.generation_id : ''
  if (!generationId) throw new PermanentJobError('invention_recheck: payload has no generation_id', 'generation_missing')
  const gen = await deps.loadGeneration(generationId)
  if (!gen || !gen.blueprint) throw new PermanentJobError('invention_recheck: generation not found', 'generation_missing')
  const bp = { ...gen.blueprint }
  // Already checked (a retry after a successful write, or a second enqueue): nothing to do.
  if (bp.check_status && bp.check_status !== 'unchecked') {
    return { generation_id: generationId, skipped: 'already_checked', check_status: bp.check_status }
  }

  const extra = rec(payload.ledger)
  const knowledge = await deps.loadKnowledge(generationId)
  const productRows = await deps.loadProducts(gen.user_id)
  const target = typeof extra.target_product_id === 'string' && extra.target_product_id ? extra.target_product_id : null
  const products = productRows.map((p) => ({ id: String(p.id ?? ''), name: String(p.name ?? '') })).filter((p) => p.id && p.name)
  const ledger = buildLedger({
    knowledge,
    answers: rec(extra.answers),
    note: gen.reference_note ?? '',
    products: productRows,
    targetProductId: target,
    offer: typeof extra.offer === 'string' ? extra.offer : (productRows.find((p) => String(p.id ?? '') === target)?.offer ?? ''),
    outside: Array.isArray(extra.outside) ? extra.outside as Array<{ id?: unknown; kind?: unknown; text?: unknown }> : [],
    now: Date.now(),
  })

  // STEP EVENTS. Serialized (one write in flight, last one wins) and throttled
  // for chunk ticks; a failed progress write is ignored — it never fails the gate.
  const clock = deps.now ?? (() => Date.now())
  let chain: Promise<void> = Promise.resolve()
  let lastStep = ''
  let lastAt = -Infinity
  const writeProgress = (p: GateProgress, force = false) => {
    if (!deps.saveProgress) return
    const t = clock()
    if (!force && p.step === lastStep && t - lastAt < PROGRESS_MIN_INTERVAL_MS && p.chunks_done < p.chunks_total) return
    lastStep = p.step; lastAt = t
    const snapshot = { ...bp, gate_progress: p }
    chain = chain.then(() => deps.saveProgress!(generationId, snapshot)).catch(() => {})
  }
  writeProgress(gateProgress('judging', 0, 0, clock()), true)

  // Test accounts only (the edge sets this for the fictional panel and on the
  // heartbeat's request): classify and record, never repair (owner, 13 Oct).
  const measureOnly = extra.measure_only === true
  const budget = INVENTION_RECHECK_TIMEOUT_MS
  const judgeCall = (model: string) => (p: string) => deps.callModel(JUDGE_SYSTEM, p, JUDGE_SCHEMA, budget, { model, thinkingBudget: JUDGE_THINKING_BUDGET })
  const gate = await runInventionGate({
    blueprint: bp as GateBlueprint,
    ledger,
    products,
    targetProductId: target,
    model: deps.strongModel ? `${deps.model}+${deps.strongModel}` : deps.model,
    timeoutMs: budget,
    ...(measureOnly ? { measureOnly: true } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  }, {
    judge: judgeCall(deps.model),
    ...(deps.strongModel ? { judgeStrong: judgeCall(deps.strongModel) } : {}),
    rewrite: (p) => deps.callModel(REWRITE_SYSTEM, p, REWRITE_SCHEMA, budget, { model: deps.model }),
    onProgress: (p) => writeProgress(p),
  })
  const perf = gate.record.perf
  console.log(JSON.stringify({ event: 'invention_gate_perf', generation_id: generationId, ms_total: perf?.ms_total ?? gate.record.ms, chunk_ms: perf?.chunk_ms ?? [], judge_calls: perf?.judge_calls ?? 0, escalations: perf?.escalations ?? 0, strong_calls: perf?.strong_calls ?? 0, verdicts: gate.record.verdicts ?? null, prefiltered: perf?.prefiltered ?? 0, judged: perf?.judged ?? 0, attempt: job.attempts }))

  // A measure-only run that finished IS the result: keep the record, leave
  // check_status 'unchecked' (the script was never checked-and-repaired), no retry.
  if (measureOnly && gate.record.outcome === 'measure_only' && gate.record.timed_out !== true) {
    bp.invention_gate = gate.record
    bp.gate_progress = gateProgress('done', perf?.judge_calls ?? 0, perf?.judge_calls ?? 0, clock())
    await chain
    await deps.saveBlueprint(generationId, bp)
    console.log(JSON.stringify({ event: 'invention_recheck', generation_id: generationId, outcome: 'measure_only', check_status: 'unchecked', before: gate.record.before, ms: gate.record.ms, judge_calls: perf?.judge_calls ?? 0, escalations: perf?.escalations ?? 0, strong_calls: perf?.strong_calls ?? 0, verdicts: gate.record.verdicts ?? null }))
    return { generation_id: generationId, outcome: 'measure_only', check_status: 'unchecked', ms: gate.record.ms }
  }
  const status = checkStatusFor(gate.record)
  if (status.status === 'unchecked') {
    console.warn(JSON.stringify({ event: 'invention_recheck_failed', generation_id: generationId, reason: status.reason, ms: gate.record.ms, attempt: job.attempts }))
    // The gate's result is NOT written: check_status stays 'unchecked' and the
    // retry policy owns it. Only the step event says it failed.
    writeProgress(gateProgress('failed', 0, 0, clock()), true)
    await chain
    throw new Error(`invention_recheck: gate ${status.reason ?? 'error'} after ${gate.record.ms}ms`)
  }

  if (gate.blueprint !== (bp as GateBlueprint)) {
    for (const k of GATE_REWRITTEN_KEYS) {
      if (k in gate.blueprint) bp[k] = (gate.blueprint as Record<string, unknown>)[k]
    }
    resyncShotListToScript(bp)
  }
  if (gate.questions.length) bp.gate_questions = [...(Array.isArray(bp.gate_questions) ? bp.gate_questions : []), ...gate.questions]
  const prior = rec(bp.invention_gate) as Partial<InventionGateRecord>
  bp.invention_gate = { ...gate.record, rechecked: true, ...(prior.reason ? { recheck_of: prior.reason } : {}) }
  bp.check_status = status.status
  // Review lines never change check_status (they ship as written); the count is
  // for the UI's "check this line" prompt (follow-up, not built here).
  bp.review_count = gate.record.review_lines?.length ?? 0
  bp.gate_progress = gateProgress('done', perf?.judge_calls ?? 0, perf?.judge_calls ?? 0, clock())
  // No progress write may land after (and clobber) the result.
  await chain
  await deps.saveBlueprint(generationId, bp)
  console.log(JSON.stringify({ event: 'invention_recheck', generation_id: generationId, outcome: gate.record.outcome, check_status: status.status, before: gate.record.before, after: gate.record.after, repaired: gate.record.repaired, ms: gate.record.ms, judge_calls: perf?.judge_calls ?? 0, escalations: perf?.escalations ?? 0, strong_calls: perf?.strong_calls ?? 0, verdicts: gate.record.verdicts ?? null }))
  return { generation_id: generationId, outcome: gate.record.outcome, check_status: status.status, ms: gate.record.ms }
}

/** The edge calls the judge and the rewrite at temperature 0 (`callOnce(..., 0, ...)`);
 *  the re-check must too, or the same script can get a different verdict. */
export const RECHECK_TEMPERATURE = 0

type GeminiJsonFn = typeof import('../gemini.js').geminiJson

/** A model that refuses a zero thinking budget gets the smallest one it takes. */
export const MIN_THINKING_FALLBACK = 128

/** The judge + rewrite call: temperature 0; the judge passes thinking budget 0. */
export function recheckCallModel(geminiJson: GeminiJsonFn, model: string): RecheckDeps['callModel'] {
  return async (system, prompt, schema, timeoutMs, opts) => {
    const m = opts?.model ?? model
    try {
      return JSON.stringify(await geminiJson(system, prompt, schema, timeoutMs, opts?.thinkingBudget, m, [], RECHECK_TEMPERATURE))
    } catch (e) {
      // Some thinking models cannot switch thinking off; one retry at the minimum.
      if (opts?.thinkingBudget === 0 && /thinking/i.test(String((e as Error)?.message ?? ''))) {
        return JSON.stringify(await geminiJson(system, prompt, schema, timeoutMs, MIN_THINKING_FALLBACK, m, [], RECHECK_TEMPERATURE))
      }
      throw e
    }
  }
}

export async function handleInventionRecheck(job: Job): Promise<Record<string, unknown>> {
  const { db } = await import('../db.js')
  const { geminiJson } = await import('../gemini.js')
  const { modelForTask } = await import('../modelRouting.js')
  const model = modelForTask(INVENTION_RECHECK_TASK)
  const strongModel = modelForTask(INVENTION_RECHECK_STRONG_TASK)
  return runInventionRecheck(job, {
    model,
    strongModel,
    async saveProgress(id, blueprint) {
      await db.from('generations').update({ blueprint }).eq('id', id).eq('blueprint->>check_status', 'unchecked')
    },
    async loadGeneration(id) {
      const { data, error } = await db.from('generations').select('id,user_id,blueprint,reference_note').eq('id', id).maybeSingle()
      if (error) throw new Error(`invention_recheck: generation read failed: ${error.message}`)
      return (data as RecheckGeneration | null) ?? null
    },
    async loadKnowledge(generationId) {
      const { data: uses, error } = await db.from('creator_knowledge_uses').select('knowledge_id').eq('generation_id', generationId)
      if (error) throw new Error(`invention_recheck: knowledge uses read failed: ${error.message}`)
      const ids = (uses ?? []).map((u: { knowledge_id?: unknown }) => u.knowledge_id).filter((x): x is string => typeof x === 'string')
      if (!ids.length) return []
      const { data: k, error: e2 } = await db.from('creator_knowledge').select('id,kind,text').in('id', ids)
      if (e2) throw new Error(`invention_recheck: knowledge read failed: ${e2.message}`)
      return k ?? []
    },
    async loadProducts(ownerId) {
      const { data, error } = await db.from('product_entities').select('id,name,knowledge,offer').eq('owner_id', ownerId).is('archived_at', null)
      if (error) throw new Error(`invention_recheck: products read failed: ${error.message}`)
      return data ?? []
    },
    async saveBlueprint(id, blueprint) {
      const { error } = await db.from('generations').update({ blueprint }).eq('id', id)
      if (error) throw new Error(`invention_recheck: write failed: ${error.message}`)
    },
    callModel: recheckCallModel(geminiJson, model),
  })
}
