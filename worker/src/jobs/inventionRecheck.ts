// ⚖️ THE DURABLE RE-CHECK OF AN UNCHECKED SCRIPT (owner rule 13 Oct).
//
// The edge runs the zero-invention gate under a hard 25 s cap inside its own
// 150 s wall clock. When that gate times out or throws, the script ships as
// written with `blueprint.check_status = 'unchecked'` and the edge enqueues
// this job keyed on the saved generation id. Here there is no request waiting,
// so the SAME gate runs again with a 120 s budget and the same model class,
// its repairs are applied, the shot list is re-synced exactly as the edge does
// it, and the blueprint + record are written back.
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
  buildLedger, runInventionGate, checkStatusFor, GATE_REWRITTEN_KEYS,
  INVENTION_RECHECK_TIMEOUT_MS, JUDGE_SYSTEM, JUDGE_SCHEMA, REWRITE_SYSTEM, REWRITE_SCHEMA,
  type GateBlueprint, type InventionGateRecord,
} from '../generated/inventionGate.js'
import { resyncShotListToScript } from '../generated/shotListSync.js'

export const INVENTION_RECHECK_TASK = 'read'

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
  /** One schema-constrained model call; returns the raw JSON text. */
  callModel(system: string, prompt: string, schema: unknown, timeoutMs: number): Promise<string>
  model: string
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

  const budget = INVENTION_RECHECK_TIMEOUT_MS
  const gate = await runInventionGate({
    blueprint: bp as GateBlueprint,
    ledger,
    products,
    targetProductId: target,
    model: deps.model,
    timeoutMs: budget,
    ...(deps.now ? { now: deps.now } : {}),
  }, {
    judge: (p) => deps.callModel(JUDGE_SYSTEM, p, JUDGE_SCHEMA, budget),
    rewrite: (p) => deps.callModel(REWRITE_SYSTEM, p, REWRITE_SCHEMA, budget),
  })

  const status = checkStatusFor(gate.record)
  if (status.status === 'unchecked') {
    console.warn(JSON.stringify({ event: 'invention_recheck_failed', generation_id: generationId, reason: status.reason, ms: gate.record.ms, attempt: job.attempts }))
    // Nothing is written: check_status stays 'unchecked' and the retry policy owns it.
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
  await deps.saveBlueprint(generationId, bp)
  console.log(JSON.stringify({ event: 'invention_recheck', generation_id: generationId, outcome: gate.record.outcome, check_status: status.status, before: gate.record.before, after: gate.record.after, repaired: gate.record.repaired, ms: gate.record.ms }))
  return { generation_id: generationId, outcome: gate.record.outcome, check_status: status.status, ms: gate.record.ms }
}

export async function handleInventionRecheck(job: Job): Promise<Record<string, unknown>> {
  const { db } = await import('../db.js')
  const { geminiJson } = await import('../gemini.js')
  const { modelForTask } = await import('../modelRouting.js')
  const model = modelForTask(INVENTION_RECHECK_TASK)
  return runInventionRecheck(job, {
    model,
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
    async callModel(system, prompt, schema, timeoutMs) {
      // Same flash judge the edge runs (task class `read`, model_routing_v1.json).
      const out = await geminiJson(system, prompt, schema, timeoutMs, undefined, model)
      return JSON.stringify(out)
    },
  })
}
