// WHAT ONE SCRIPT COSTS (owner brief 2026-10-04: "we need to understand what
// each call costs and how we can afford it").
//
// ⚖️ ONE PLACE, EVERY CALL. A script is a dozen model calls spread over this
// function and its shared modules; logging at each call site would miss the
// next one somebody adds. Instead, inside a request, every fetch to the Gemini
// API is observed here: the response is cloned and its `usageMetadata` read,
// so the caller's own body is untouched and a failure to read it never fails
// the call. Tokens only; the price per model lives in one SQL view, where a
// price change is one row, not a deploy.
import { AsyncLocalStorage } from 'node:async_hooks'

export interface ModelUsage { calls: number; input: number; output: number; thinking: number; cached: number }
export type UsageStore = Record<string, ModelUsage>

const store = new AsyncLocalStorage<UsageStore>()
// Plan 11.1-1: the same tally keyed by stage (writer, editor, repair, ...).
const stageOf = new AsyncLocalStorage<string>()
const byStage = new AsyncLocalStorage<UsageStore>()
const GEMINI = /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/([^:/?]+):(generateContent|embedContent)/

/** The model a Gemini URL calls, or null for any other URL. */
export function geminiModelOf(url: string): string | null {
  return GEMINI.exec(url)?.[1] ?? null
}

/** Adds one response's usage to the store. Embeddings bill on input only. */
export function addUsage(into: UsageStore, model: string, meta: unknown): void {
  const m = (meta ?? {}) as Record<string, unknown>
  const n = (k: string) => (typeof m[k] === 'number' ? (m[k] as number) : 0)
  const row = into[model] ??= { calls: 0, input: 0, output: 0, thinking: 0, cached: 0 }
  row.calls += 1
  row.input += n('promptTokenCount')
  row.output += n('candidatesTokenCount')
  row.thinking += n('thoughtsTokenCount')
  row.cached += n('cachedContentTokenCount')
}

let installed = false
/** Wraps fetch once per isolate; outside a tracked request it is a pass-through. */
export function installUsageTracking(): void {
  if (installed) return
  installed = true
  const base = globalThis.fetch
  globalThis.fetch = async (input: Request | URL | string, init?: RequestInit) => {
    const res = await base(input, init)
    const into = store.getStore()
    if (!into) return res
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const model = geminiModelOf(url)
    if (!model || !res.ok) return res
    try {
      const body = await res.clone().json()
      const meta = (body as { usageMetadata?: unknown })?.usageMetadata
      addUsage(into, model, meta)
      const st = byStage.getStore()
      if (st) addUsage(st, `${stageOf.getStore() ?? 'other'}|${model}`, meta)
    } catch { /* an unreadable body is the caller's to handle */ }
    return res
  }
}

/** Runs one request with its own usage tally. */
export function trackUsage<T>(fn: () => Promise<T>): Promise<T> {
  return store.run({}, () => byStage.run({}, fn))
}

/** Runs `fn` with every model call inside it counted under `stage`. */
export function inStage<T>(stage: string, fn: () => Promise<T>): Promise<T> {
  return stageOf.run(stage, fn)
}

/** The current request's tally by stage, or null outside one. */
export function currentStageUsage(): UsageStore | null {
  const s = byStage.getStore()
  return s ? structuredClone(s) : null
}

/**
 * Which stage a model call belongs to, read from its system prompt. Inferred,
 * so `other` is an honest answer; the writer is the call made with the
 * blueprint schema.
 */
export function stageOfCall(system: string, isBlueprint: boolean): string {
  const s = system.toLowerCase()
  if (/\beditor\b/.test(s)) return 'editor'
  if (/\b(judge|score|rate|rating|grade)\b/.test(s)) return 'judge'
  if (/\b(lengthen|longer|extend)\b/.test(s)) return 'lengthen'
  if (/\b(rewrite|repair|fix)\b/.test(s)) return 'repair'
  // The writer's own prompt talks about viewers, so the blueprint call is
  // matched before the panel rule (physical30-a tagged the writer as panel).
  if (isBlueprint) return 'writer'
  if (/\b(viewer|audience panel)\b/.test(s)) return 'panel'
  return 'other'
}

/** The current request's tally, or null outside one. */
export function currentUsage(): UsageStore | null {
  const s = store.getStore()
  return s ? structuredClone(s) : null
}

// Ops audit (2026-10-26): THE WRITER IN THE LEDGER. The worker writes one
// ai_usage_ledger row per model per job; the writer kept its tally only on the
// saved blueprint, so a failed or abandoned script cost nothing in the
// reports. Now each request also writes one row per stage and model, stage
// `script:<stage>`. Counts only. Fail-open: a ledger error never fails a script.
export interface LedgerContext { ownerId: string; traffic: 'test' | 'real' }
const ledgerCtx = new AsyncLocalStorage<{ ctx: LedgerContext | null }>()

/** Names who this request is for, so its usage can be written. Shadow re-runs never call it. */
export function setLedgerContext(ctx: LedgerContext): void {
  const box = ledgerCtx.getStore()
  if (box) box.ctx = ctx
}

/** The ledger rows for one script request: one per stage and model. */
export function scriptLedgerRows(byStageUsage: UsageStore | null, ctx: LedgerContext) {
  return Object.entries(byStageUsage ?? {}).map(([key, u]) => {
    const i = key.indexOf('|')
    const stage = i < 0 ? 'other' : key.slice(0, i)
    const model = i < 0 ? key : key.slice(i + 1)
    return {
      job_id: null, stage: `script:${stage}`, owner_id: ctx.ownerId, model, traffic: ctx.traffic,
      calls: u.calls, input_tokens: u.input, output_tokens: u.output, thinking_tokens: u.thinking, cached_tokens: u.cached,
    }
  })
}

type LedgerInsert = (rows: ReturnType<typeof scriptLedgerRows>) => PromiseLike<{ error: unknown } | unknown>

/**
 * Runs one request and then writes its usage to the ledger, whatever the
 * outcome. Nothing is written when no context was set (unauthenticated or
 * shadow). Never throws because of the ledger and never logs its rows.
 */
export async function withScriptLedger<T>(fn: () => Promise<T>, insert: () => LedgerInsert | null): Promise<T> {
  const box: { ctx: LedgerContext | null } = { ctx: null }
  return ledgerCtx.run(box, async () => {
    try {
      return await fn()
    } finally {
      try {
        const rows = box.ctx ? scriptLedgerRows(currentStageUsage(), box.ctx) : []
        const ins = rows.length ? insert() : null
        if (ins) {
          const r = await ins(rows) as { error?: unknown } | undefined
          if (r?.error) console.warn(JSON.stringify({ event: 'ai_usage_ledger_write_failed', rows: rows.length }))
        }
      } catch {
        console.warn(JSON.stringify({ event: 'ai_usage_ledger_write_failed' }))
      }
    }
  })
}
