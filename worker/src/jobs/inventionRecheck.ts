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
  buildLedger, runInventionGate, repairAuditCaptureOn, reconcileHookPick, resolveTargetProduct, extractSentences, checkStatusFor, gateProgress, GATE_REWRITTEN_KEYS,
  INVENTION_RECHECK_TIMEOUT_MS, INVENTION_JUDGE_CASCADE, JUDGE_THINKING_BUDGET, JUDGE_SYSTEM, JUDGE_SCHEMA, REWRITE_SYSTEM, REWRITE_SCHEMA,
  type GateBlueprint, type GateProgress, type InventionGateRecord,
} from '../generated/inventionGate.js'
import { resyncShotListToScript } from '../generated/shotListSync.js'
import { buildCheckLines, checkLinesLog, CHECK_LINES_VERSION } from '../generated/checkLines.js'
import {
  ASYNC_POLISH_BUDGET_MS, POLISH_EDITOR_SYSTEM, POLISH_COMPARE_SYSTEM, POLISH_REWRITE_SCHEMA, POLISH_COMPARE_SCHEMA,
  polishEditorPrompt, applyPolishRewrites, polishComparePrompt, editedWins, type PolishBeat,
} from '../generated/asyncPolish.js'

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
  /** env REPAIR_AUDIT_CAPTURE: 'false' turns the trial's save-before-repair capture off. */
  repairAuditFlag?: string
  /** Async polish: coin for the blind compare's order (tests pin it). */
  random?: () => number
}

/** The record the polish step leaves on the blueprint (counts only). */
export interface PolishRecord { kept: number; rejected: string[]; verdict: 'edited' | 'original' | 'none' | 'error'; ms: number; steps: string[] }

/**
 * ⚖️ ASYNC POLISH (owner decision 2; trial only — the edge sets `ledger.polish`
 * and `blueprint.polish_pending` only under trialOn with ASYNC_POLISH on). The
 * self-review the request path no longer runs: at most two middle lines
 * rewritten from her material (never the hook or close, never a new number),
 * kept only when a blind side-by-side read prefers the edit. Runs BEFORE the
 * gate so the honesty check judges the polished lines; the gate's refill
 * (word_budget) replaces the request-path lengthen passes. A polish that fails
 * or runs out of time keeps the draft: it never blocks the check.
 */
export async function runPolish(bp: Record<string, unknown>, material: string, opts: { goal?: string; subject?: string }, deps: Pick<RecheckDeps, 'callModel' | 'model' | 'now' | 'random'>): Promise<PolishRecord> {
  const clock = deps.now ?? (() => Date.now())
  const t0 = clock()
  const steps = Array.isArray(rec(bp.polish_pending).steps) ? (rec(bp.polish_pending).steps as unknown[]).map(String) : []
  const beats = Array.isArray(bp.script) ? bp.script as PolishBeat[] : []
  if (!beats.length) return { kept: 0, rejected: [], verdict: 'none', ms: 0, steps }
  try {
    const raw = await deps.callModel(POLISH_EDITOR_SYSTEM, polishEditorPrompt(beats, material, opts), POLISH_REWRITE_SCHEMA, ASYNC_POLISH_BUDGET_MS, { model: deps.model })
    const applied = applyPolishRewrites(beats, raw, material)
    let verdict: PolishRecord['verdict'] = 'none'
    const left = ASYNC_POLISH_BUDGET_MS - (clock() - t0)
    if (applied.kept && left >= 5_000) {
      const flip = (deps.random ?? Math.random)() < 0.5
      try {
        const cmp = await deps.callModel(POLISH_COMPARE_SYSTEM, polishComparePrompt(beats, applied.next, flip), POLISH_COMPARE_SCHEMA, left, { model: deps.model })
        verdict = editedWins(cmp, flip) ? 'edited' : 'original'
      } catch { verdict = 'original' }
    } else if (applied.kept) verdict = 'original'
    if (verdict === 'edited') bp.script = applied.next
    return { kept: verdict === 'edited' ? applied.kept : 0, rejected: applied.rejected, verdict, ms: clock() - t0, steps }
  } catch {
    return { kept: 0, rejected: [], verdict: 'error', ms: clock() - t0, steps }
  }
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
  // A stale target id (product re-created after the edge enqueued) is resolved, never read as "another product".
  const target = resolveTargetProduct(typeof extra.target_product_id === 'string' ? extra.target_product_id : null, productRows,
    { offer: extra.offer, lines: extractSentences(bp as GateBlueprint).filter((x) => x.surface === 'script').map((x) => x.text) })
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
  // ASYNC POLISH first (trial): the draft the request returned is improved,
  // then checked. Written back at once (still 'unchecked') so a gate retry
  // never polishes twice.
  const polishOpts = rec(extra.polish)
  if (bp.polish_pending && Object.keys(polishOpts).length) {
    writeProgress(gateProgress('polishing', 0, 0, clock()), true)
    const material = ledger.map((it) => String((it as { text?: unknown }).text ?? '')).filter(Boolean).join('\n')
    const polish = await runPolish(bp, material, { goal: String(polishOpts.goal ?? ''), subject: String(polishOpts.subject ?? '') }, { ...deps, now: clock })
    delete bp.polish_pending
    bp.polish = polish
    if (Array.isArray(bp.script) && polish.verdict === 'edited') resyncShotListToScript(bp)
    console.log(JSON.stringify({ event: 'async_polish', generation_id: generationId, kept: polish.kept, rejected: polish.rejected.length, verdict: polish.verdict, ms: polish.ms, attempt: job.attempts }))
    await chain
    if (deps.saveProgress) await deps.saveProgress(generationId, { ...bp }).catch(() => {})
  } else if (bp.polish_pending) {
    delete bp.polish_pending
  }
  writeProgress(gateProgress('judging', 0, 0, clock()), true)

  // Test accounts only (the edge sets this for the fictional panel and on the
  // heartbeat's request): classify and record, never repair (owner, 13 Oct).
  const measureOnly = extra.measure_only === true
  bp.gate_mode = measureOnly ? 'measure' : 'repair'
  const budget = INVENTION_RECHECK_TIMEOUT_MS
  const storyId = String(rec(bp.story_used).id ?? '')
  const storyText = storyId ? ledger.filter((it) => it.id === storyId).map((it) => it.text) : []
  const judgeCall = (model: string) => (p: string) => deps.callModel(JUDGE_SYSTEM, p, JUDGE_SCHEMA, budget, { model, thinkingBudget: JUDGE_THINKING_BUDGET })
  const gate = await runInventionGate({
    blueprint: bp as GateBlueprint,
    ledger,
    products,
    targetProductId: target,
    model: deps.strongModel ? `${deps.model}+${deps.strongModel}` : deps.model,
    timeoutMs: budget,
    ...(measureOnly ? { measureOnly: true } : {}),
    // Trial only (the edge sets rule_review under trialOn): rule-only event/habit I lines are review, not block.
    ...(extra.rule_review === true ? { ruleReview: true } : {}),
    // Trial only, behind CHECK_LINE_KILL on the edge: review lines carry their reason id.
    ...(extra.check_lines === true ? { checkLines: true } : {}),
    // Trial only (the edge sets hold_asks under trialOn): no "[Your answer: …]" in spoken text.
    ...(extra.hold_asks === true ? { holdAsks: true } : {}),
    // Trial only, behind REPAIR_CAL_KILL on the edge: repair only flag classes
    // measured at <=15% false drops; every other flag ships as a review line.
    ...(extra.repair_calibrated === true ? { repairCalibrated: true } : {}),
    // Panel-7, trial only (the edge sets these under trialOn; kills SPOKEN_DEDUP /
    // LENGTH_REFILL = 'false'): de-dup spoken lines, refill to the word budget.
    ...(extra.hold_asks === true && extra.spoken_dedup === true ? { spokenDedup: true } : {}),
    // Her named story ships word for word: the de-dup never deletes it (#22).
    ...(extra.hold_asks === true && storyText.length ? { protect: storyText } : {}),
    ...(extra.hold_asks === true && typeof extra.word_budget === 'number' && extra.word_budget > 0 ? { wordBudget: extra.word_budget } : {}),
    // Plan v5.3 §19, trial only (the edge sets these under trialOn; kills
    // NARROW_REPAIR / STORY_DEDUP = 'false'): repair only invented elements
    // both judges call I; drop paraphrases of a story told verbatim.
    ...(extra.hold_asks === true && extra.narrow_repair === true ? { narrowRepair: true } : {}),
    ...(extra.hold_asks === true && extra.story_dedup === true ? { storyDedup: true } : {}),
    // ⚖️ SAVE-BEFORE-REPAIR (owner, 19 Oct). Trial only: `hold_asks` is set by
    // the edge under trialOn (test and panel accounts), never for a real
    // creator. The audit (pre-repair text) lands in blueprint.invention_gate on
    // the generation row only; every log below stays counts and ids.
    ...(repairAuditCaptureOn(extra.hold_asks === true, deps.repairAuditFlag) ? { repairAudit: true } : {}),
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
  // Trial (hold_asks): a pick the gate rewrote or dropped is no longer a pick,
  // and the picks that remain lead hook_options with no duplicate option.
  if (extra.hold_asks === true) {
    const rp = reconcileHookPick(bp)
    if (rp) {
      bp.hook_options = rp.hook_options
      bp.hook_pick = rp.hook_pick
      if (rp.hook_moves) bp.hook_moves = rp.hook_moves
      if (rp.removed) bp.hook_pick_gate_removed = rp.removed
      // PANEL-7 (#12, #19, #20): the shipped count is the picks that survive.
      const hs = rec(bp.hook_pick_shipped)
      if (Object.keys(hs).length) bp.hook_pick_shipped = { ...hs, shipped: Array.isArray(rp.hook_pick.hooks) ? rp.hook_pick.hooks.length : 0 }
    }
  }
  if (gate.questions.length) bp.gate_questions = [...(Array.isArray(bp.gate_questions) ? bp.gate_questions : []), ...gate.questions]
  const prior = rec(bp.invention_gate) as Partial<InventionGateRecord>
  bp.invention_gate = { ...gate.record, rechecked: true, ...(prior.reason ? { recheck_of: prior.reason } : {}) }
  bp.check_status = status.status
  // Review lines never change check_status (they ship as written); the count is
  // for the UI's "check this line" prompt (follow-up, not built here).
  bp.review_count = gate.record.review_lines?.length ?? 0
  // ⚖️ CHECK THIS LINE (backlog d; trial only: the edge sets `check_lines`
  // under trialOn unless CHECK_LINE_KILL=1). Script review lines with their
  // reason id and the sentence's offsets. Logs carry offsets only, never text.
  if (extra.check_lines === true) {
    const lines = buildCheckLines(bp as GateBlueprint, gate.record.review_lines)
    bp.check_lines = lines
    bp.check_lines_version = CHECK_LINES_VERSION
    if (lines.length) console.log(JSON.stringify({ event: 'check_lines', generation_id: generationId, lines: checkLinesLog(lines) }))
  }
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
    repairAuditFlag: process.env.REPAIR_AUDIT_CAPTURE,
  })
}
