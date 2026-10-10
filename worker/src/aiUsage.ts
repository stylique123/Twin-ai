// Plan 11.1-2: THE USAGE LEDGER, WORKER SIDE. Every Gemini call made while a job
// runs is tallied by model (the edge writer does the same per request in
// supabase/functions/_shared/aiUsage.ts). After the job, one row per model goes
// to `ai_usage_ledger` with the job type as the stage and a traffic tag. Tokens
// only; a failure to read or write usage never fails the job.
import { AsyncLocalStorage } from 'node:async_hooks'

export interface ModelUsage { calls: number; input: number; output: number; thinking: number; cached: number }
export type UsageStore = Record<string, ModelUsage>

const store = new AsyncLocalStorage<UsageStore>()
const GEMINI = /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/([^:/?]+):(generateContent|embedContent)/

export function geminiModelOf(url: string): string | null {
  return GEMINI.exec(url)?.[1] ?? null
}

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
export function installUsageTracking(): void {
  if (installed) return
  installed = true
  const base = globalThis.fetch
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const res = await base(input, init)
    const into = store.getStore()
    if (!into) return res
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const model = geminiModelOf(url)
    if (!model || !res.ok) return res
    try {
      const body = await res.clone().json()
      addUsage(into, model, (body as { usageMetadata?: unknown })?.usageMetadata)
    } catch { /* the caller handles its own body */ }
    return res
  }) as typeof fetch
}

/** Runs one job with its own tally; returns the result and the tally. */
export async function withUsage<T>(fn: () => Promise<T>): Promise<{ result: T; usage: UsageStore }> {
  const usage: UsageStore = {}
  const result = await store.run(usage, fn)
  return { result, usage }
}

/** 'test' for owners in TEST_OWNER_IDS (comma-separated), else 'real'. */
export function trafficOf(ownerId: string | null | undefined, list = process.env.TEST_OWNER_IDS ?? ''): 'test' | 'real' {
  return ownerId && list.split(',').map((s) => s.trim()).includes(ownerId) ? 'test' : 'real'
}

/** The ledger rows for one job: one per model that was called. */
export function ledgerRows(job: { id: string; type: string; owner_id?: string | null }, usage: UsageStore) {
  return Object.entries(usage).map(([model, u]) => ({
    job_id: job.id, stage: job.type, owner_id: job.owner_id ?? null, model,
    calls: u.calls, input_tokens: u.input, output_tokens: u.output, thinking_tokens: u.thinking, cached_tokens: u.cached,
    traffic: trafficOf(job.owner_id),
  }))
}
