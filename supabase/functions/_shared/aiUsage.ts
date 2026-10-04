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
      addUsage(into, model, (body as { usageMetadata?: unknown })?.usageMetadata)
    } catch { /* an unreadable body is the caller's to handle */ }
    return res
  }
}

/** Runs one request with its own usage tally. */
export function trackUsage<T>(fn: () => Promise<T>): Promise<T> {
  return store.run({}, fn)
}

/** The current request's tally, or null outside one. */
export function currentUsage(): UsageStore | null {
  const s = store.getStore()
  return s ? structuredClone(s) : null
}
