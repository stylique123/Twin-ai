// RELEASE S1 SHADOW RUNNER, EDGE PART (docs/release/shadow-and-flags.md §3).
//
// After the live response is ready, `scheduleShadowRun` hands a background task
// to `EdgeRuntime.waitUntil` (the design's choice), so the creator's latency and
// output never depend on it. The task re-runs the same request through
// generate-blueprint with ONE component on the new path. That re-run:
//   - is authorised by the service key plus `x-twin-shadow` (no client can send it);
//   - runs with a read-only service client (_shared/readOnlyClient.ts), so it
//     saves no generation, spends no credit and writes nothing else;
//   - returns its blueprint and token usage to this task, which writes ONE
//     public.shadow_runs row and the usage to ai_usage_ledger (traffic 'shadow').
// Nothing is shown to the creator.
//
// ⚖️ INERT UNTIL THE OWNER ACTS. The registry is read only when
// RELEASE_REGISTRY_SOURCE=table; otherwise it is DEFAULT_REGISTRY (S0), no
// component is ever 'shadow', and this file reads nothing. SHADOW_DAILY_USD
// defaults to 0 (off). A missing shadow_runs table is one warning, then silence.
//
// ⚖️ LOGS: ids, counts and status only (shadowLog's allowlist).

import { DEFAULT_REGISTRY, type Component, type FlagRegistry, type ReleaseAccount } from './releaseFlags.ts'
import {
  decideShadow, errorCodeOf, killedComponents, ledgerRowsFor, ledgerUsd, registryFromRows, registryVersion,
  shadowComponents, shadowConfigFrom, shadowLog, shadowRunRow, tokensOf, usdOf, type ModelPrice, type ShadowConfig,
} from './shadowRunner.ts'

type Env = { get(name: string): string | undefined }
// deno-lint-ignore no-explicit-any
type Admin = any

export const SHADOW_HEADER = 'x-twin-shadow'
export const SHADOW_OWNER_HEADER = 'x-twin-shadow-owner'

let warnedNoTable = false
let tableReadyCache: boolean | null = null
let warnedRegistry = false

function missingRelation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  return e?.code === '42P01' || e?.code === 'PGRST205' || /does not exist|could not find the table/i.test(String(e?.message ?? ''))
}

/** The release registry for this request. Undefined (= DEFAULT_REGISTRY, S0 everywhere)
 *  unless RELEASE_REGISTRY_SOURCE=table; a read error also falls back to the default. */
export async function loadReleaseRegistry(admin: Admin, env: Env): Promise<FlagRegistry | undefined> {
  if (env.get('RELEASE_REGISTRY_SOURCE') !== 'table') return undefined
  try {
    const { data, error } = await admin.from('release_flags').select('component, stage, rollout_pct, killed')
    if (error) throw error
    return registryFromRows(data)
  } catch (e) {
    if (!warnedRegistry) { warnedRegistry = true; console.warn(shadowLog('release_registry_unavailable', { reason: missingRelation(e) ? 'no_table' : 'read_error' })) }
    return undefined
  }
}

/** Whether public.shadow_runs exists. Checked once per isolate; a missing table warns once. */
export async function shadowTableReady(admin: Admin): Promise<boolean> {
  if (tableReadyCache !== null) return tableReadyCache
  const { error } = await admin.from('shadow_runs').select('id', { head: true, count: 'exact' }).limit(1)
  if (error && missingRelation(error)) {
    tableReadyCache = false
    if (!warnedNoTable) { warnedNoTable = true; console.warn(shadowLog('shadow_runs_missing', { status: 'skipped', reason: 'no_table' })) }
    return false
  }
  if (error) return false // transient: do not cache, do not run
  tableReadyCache = true
  return true
}

async function pricesOf(admin: Admin): Promise<Record<string, ModelPrice>> {
  const { data } = await admin.from('ai_model_prices').select('model, input_per_m, output_per_m')
  return Object.fromEntries((data ?? []).map((p: { model: string; input_per_m: number; output_per_m: number }) => [p.model, { input_per_m: Number(p.input_per_m), output_per_m: Number(p.output_per_m) }]))
}

/** Shadow spend since 00:00 UTC, from ai_usage_ledger (traffic 'shadow'). */
export async function shadowSpentTodayUsd(admin: Admin, prices: Record<string, ModelPrice>, now = new Date()): Promise<number> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const { data, error } = await admin.from('ai_usage_ledger').select('model, input_tokens, output_tokens, thinking_tokens').eq('traffic', 'shadow').gte('created_at', since)
  if (error) return Number.POSITIVE_INFINITY // unknown spend: treat the cap as reached
  return ledgerUsd(data ?? [], prices)
}

export interface ShadowContext {
  admin: Admin
  env: Env
  supabaseUrl: string
  serviceKey: string
  account: ReleaseAccount
  registry: FlagRegistry | undefined
  /** The live request body, re-sent as is (minus its idempotency key). */
  body: Record<string, unknown>
  generationId: string | null
  liveLatencyMs: number
  liveBlueprint: unknown
}

function background(p: Promise<unknown>): void {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  const safe = p.catch((e) => console.warn(shadowLog('shadow_run_error', { status: 'failed', reason: String((e as Error)?.name ?? 'error').slice(0, 40) })))
  if (rt?.waitUntil) rt.waitUntil(safe)
  else void safe
}

/** Cheap synchronous check, then everything else in the background. Never throws. */
export function scheduleShadowRun(ctx: ShadowContext): void {
  try {
    if (!ctx.registry || ctx.account.isTestAccount) return
    const shadow = shadowComponents(ctx.account, ctx.registry)
    const killed = killedComponents(ctx.account, ctx.registry)
    if (!shadow.length && !killed.length) return
    const cfg = shadowConfigFrom((k) => ctx.env.get(k))
    if (cfg.dailyUsd <= 0) return
    background(runShadow(ctx, shadow, killed, cfg))
  } catch { /* the live response never depends on this */ }
}

export async function runShadow(ctx: ShadowContext, shadow: Component[], killed: Component[], cfg: ShadowConfig, rnd: () => number = Math.random): Promise<void> {
  const roll = rnd()
  const pick = rnd()
  if (!(roll < cfg.sampleRate)) return
  const tableReady = await shadowTableReady(ctx.admin)
  if (!tableReady) return
  const prices = await pricesOf(ctx.admin)
  const spent = await shadowSpentTodayUsd(ctx.admin, prices)
  const d = decideShadow({ shadow, killed, cfg, tableReady, spentTodayUsd: spent, roll, pick })
  const version = registryVersion(ctx.registry ?? DEFAULT_REGISTRY)
  const base = { registryVersion: version, generationId: ctx.generationId, ownerId: ctx.account.userId, liveLatencyMs: ctx.liveLatencyMs, liveBlueprint: ctx.liveBlueprint }
  if (!d.run) {
    if (!d.record) return
    await ctx.admin.from('shadow_runs').insert(shadowRunRow({ ...base, component: d.component, status: d.status }))
    console.log(shadowLog('shadow_run', { component: d.component, status: d.status, generation_id: ctx.generationId, spent_today_usd: spent, cap_usd: cfg.dailyUsd }))
    return
  }
  const component = d.component
  const { idempotency_key: _drop, ...body } = ctx.body
  const t0 = Date.now()
  let status: 'ok' | 'failed' | 'timeout' = 'failed'
  let errorCode: string | null = null
  let shadowBlueprint: unknown = null
  let usage: Record<string, { calls?: number; input?: number; output?: number; thinking?: number; cached?: number }> | null = null
  try {
    const res = await fetch(`${ctx.supabaseUrl}/functions/v1/generate-blueprint`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ctx.serviceKey}`, apikey: ctx.serviceKey, 'content-type': 'application/json', [SHADOW_HEADER]: component, [SHADOW_OWNER_HEADER]: ctx.account.userId },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    })
    const json = await res.json().catch(() => null) as { shadow?: boolean; blueprint?: unknown; ai_usage?: typeof usage } | null
    usage = json?.ai_usage ?? null
    if (res.ok && json?.shadow === true && json.blueprint) { status = 'ok'; shadowBlueprint = json.blueprint }
    else errorCode = errorCodeOf(res.status, json)
  } catch (e) {
    const name = String((e as Error)?.name ?? '')
    status = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'failed'
    errorCode = status === 'timeout' ? 'timeout' : 'network'
  }
  const shadowLatencyMs = Date.now() - t0
  const tokens = tokensOf(usage)
  if (status === 'ok' && cfg.maxTokens > 0 && tokens > cfg.maxTokens) errorCode = 'token_cap'
  const cost = usdOf(usage, prices)
  const ledger = ledgerRowsFor(usage, ctx.account.userId, component)
  if (ledger.length) await ctx.admin.from('ai_usage_ledger').insert(ledger)
  await ctx.admin.from('shadow_runs').insert(shadowRunRow({ ...base, component, status, shadowLatencyMs, shadowCostUsd: cost, shadowBlueprint, errorCode }))
  console.log(shadowLog('shadow_run', { component, status, generation_id: ctx.generationId, registry_version: version, live_latency_ms: ctx.liveLatencyMs, shadow_latency_ms: shadowLatencyMs, shadow_cost_usd: cost, tokens, error_code: errorCode }))
}

/** Test hook: forget the per-isolate table check. */
export function _resetShadowCaches(): void { warnedNoTable = false; tableReadyCache = null; warnedRegistry = false }
