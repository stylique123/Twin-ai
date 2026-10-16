// GENERATED FROM packages/shared/src/script/shadowRunner.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
// RELEASE S1 SHADOW RUNNER, PURE PART (docs/release/shadow-and-flags.md §3).
//
// What decides whether a real request gets a silent re-run, how its cost is
// counted, and what the stored row and the log line hold. No I/O, no env, no
// clock: the edge (supabase/functions/_shared/shadowRun.ts) passes everything in.
//
// ⚖️ INERT BY DEFAULT. A shadow run happens only when ALL of these hold:
//   - the registry puts a component at S1 or above (DEFAULT_REGISTRY is S0);
//   - SHADOW_DAILY_USD is above 0 (default 0 = off);
//   - the request falls inside SHADOW_SAMPLE_RATE;
//   - public.shadow_runs exists (migration 0290, applied by hand).
//
// ⚖️ LOGS AND ROWS CARRY IDS, COUNTS AND STATUS ONLY. Script text never reaches
// a log line; `shadowLog` drops every key that is not on its allowlist.
//
// Generated into supabase/functions/_shared/shadowRunner.ts.

import { COMPONENTS, DEFAULT_REGISTRY, stageFor, type Component, type FlagEntry, type FlagRegistry, type ReleaseAccount, type Stage } from './releaseFlags.ts'

export interface ShadowConfig {
  /** Daily USD ceiling for shadow traffic (ai_usage_ledger traffic 'shadow'). 0 = off. */
  dailyUsd: number
  /** Share of eligible requests that get a shadow run, 0-1. */
  sampleRate: number
  /** Per-run token cap. A run that used more is recorded with error_code 'token_cap'. */
  maxTokens: number
  /** How long the re-run may take before it is recorded as 'timeout'. */
  timeoutMs: number
}

function num(v: string | undefined, dflt: number): number {
  if (v == null || String(v).trim() === '') return dflt
  const n = Number(v)
  return Number.isFinite(n) ? n : dflt
}

/** Shadow settings from env. Every default is the safe one: daily cap 0 means no shadow run at all. */
export function shadowConfigFrom(get: (k: string) => string | undefined): ShadowConfig {
  return {
    dailyUsd: Math.max(0, num(get('SHADOW_DAILY_USD'), 0)),
    sampleRate: Math.max(0, Math.min(1, num(get('SHADOW_SAMPLE_RATE'), 0.1))),
    maxTokens: Math.max(0, Math.floor(num(get('SHADOW_RUN_MAX_TOKENS'), 200_000))),
    timeoutMs: Math.max(10_000, Math.floor(num(get('SHADOW_TIMEOUT_MS'), 150_000))),
  }
}

const STAGES: readonly Stage[] = ['S0', 'S1', 'S2', 'S3']

/** The registry from `release_flags` rows (migration 0291). Unknown components are
 *  ignored; a missing or malformed row keeps that component's default (S0). */
export function registryFromRows(rows: unknown): FlagRegistry {
  const out: Record<string, FlagEntry> = {}
  for (const c of COMPONENTS) out[c] = { ...DEFAULT_REGISTRY[c] }
  if (!Array.isArray(rows)) return out as FlagRegistry
  for (const r of rows as Array<Record<string, unknown>>) {
    const c = r?.component as Component
    if (!(COMPONENTS as readonly string[]).includes(String(c))) continue
    const stage = STAGES.includes(r.stage as Stage) ? (r.stage as Stage) : 'S0'
    const pct = Number(r.rollout_pct)
    out[c] = { stage, rolloutPct: Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.floor(pct))) : 0, killed: r.killed === true }
  }
  return out as FlagRegistry
}

/** A short stable id for a registry, stored on every shadow row (FNV-1a over its entries). */
export function registryVersion(registry: FlagRegistry | undefined): string {
  const r = registry ?? DEFAULT_REGISTRY
  const s = COMPONENTS.map((c) => `${c}:${r[c]?.stage ?? 'S0'}:${r[c]?.rolloutPct ?? 0}:${r[c]?.killed === true ? 1 : 0}`).join('|')
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return `r${h.toString(16).padStart(8, '0')}`
}

/** Components this request would shadow (stageFor === 'shadow'). Empty at the default registry. */
export function shadowComponents(account: ReleaseAccount, registry: FlagRegistry | undefined): Component[] {
  return COMPONENTS.filter((c) => stageFor(c, account, registry) === 'shadow')
}

/** Components past S0 whose kill switch is set: a sampled real request records 'killed' for them. */
export function killedComponents(account: ReleaseAccount, registry: FlagRegistry | undefined): Component[] {
  if (account.isTestAccount || !registry) return []
  return COMPONENTS.filter((c) => registry[c]?.killed === true && registry[c]?.stage !== 'S0')
}

export type ShadowDecision =
  | { run: true; component: Component }
  | { run: false; status: 'off' | 'no_table' | 'not_sampled'; record: false }
  | { run: false; status: 'budget_skipped' | 'killed'; record: true; component: Component }

/** Whether this request gets a shadow run. `roll` and `pick` are uniform 0-1 draws.
 *  Order matters: nothing is read or written for a request that is not eligible. */
export function decideShadow(input: {
  shadow: readonly Component[]
  killed: readonly Component[]
  cfg: ShadowConfig
  tableReady: boolean
  spentTodayUsd: number
  roll: number
  pick: number
}): ShadowDecision {
  const { shadow, killed, cfg } = input
  if (!shadow.length && !killed.length) return { run: false, status: 'off', record: false }
  if (cfg.dailyUsd <= 0) return { run: false, status: 'off', record: false }
  if (!(input.roll < cfg.sampleRate)) return { run: false, status: 'not_sampled', record: false }
  if (!input.tableReady) return { run: false, status: 'no_table', record: false }
  if (!shadow.length) {
    const component = killed[Math.min(killed.length - 1, Math.floor(input.pick * killed.length))]
    return { run: false, status: 'killed', record: true, component }
  }
  // One component per run, so a difference is attributable to one change.
  const component = shadow[Math.min(shadow.length - 1, Math.floor(input.pick * shadow.length))]
  if (!(input.spentTodayUsd < cfg.dailyUsd)) return { run: false, status: 'budget_skipped', record: true, component }
  return { run: true, component }
}

export interface UsageEntry { calls?: number; input?: number; output?: number; thinking?: number; cached?: number }
export interface ModelPrice { input_per_m: number; output_per_m: number }

/** USD for a usage store (model → tokens), with the ledger's formula (output includes thinking).
 *  A model with no price counts at the dearest known price, so the cap errs towards stopping. */
export function usdOf(usage: Record<string, UsageEntry> | null | undefined, prices: Record<string, ModelPrice>): number {
  if (!usage) return 0
  const known = Object.values(prices)
  const worst: ModelPrice = known.length
    ? { input_per_m: Math.max(...known.map((p) => Number(p.input_per_m) || 0)), output_per_m: Math.max(...known.map((p) => Number(p.output_per_m) || 0)) }
    : { input_per_m: 2, output_per_m: 12 }
  let usd = 0
  for (const [model, u] of Object.entries(usage)) {
    const p = prices[model] ?? worst
    usd += ((u.input ?? 0) * Number(p.input_per_m) + ((u.output ?? 0) + (u.thinking ?? 0)) * Number(p.output_per_m)) / 1e6
  }
  return Math.round(usd * 1e5) / 1e5
}

/** Today's shadow spend from ai_usage_ledger rows (traffic 'shadow'). */
export function ledgerUsd(rows: Array<{ model?: string; input_tokens?: number; output_tokens?: number; thinking_tokens?: number }>, prices: Record<string, ModelPrice>): number {
  const usage: Record<string, UsageEntry> = {}
  for (const r of rows ?? []) {
    const m = String(r.model ?? 'unknown')
    const u = (usage[m] ??= { input: 0, output: 0, thinking: 0 })
    u.input! += Number(r.input_tokens ?? 0)
    u.output! += Number(r.output_tokens ?? 0)
    u.thinking! += Number(r.thinking_tokens ?? 0)
  }
  return usdOf(usage, prices)
}

export function tokensOf(usage: Record<string, UsageEntry> | null | undefined): number {
  return Object.values(usage ?? {}).reduce((a, u) => a + (u.input ?? 0) + (u.output ?? 0) + (u.thinking ?? 0), 0)
}

/** ai_usage_ledger rows for one shadow run: traffic 'shadow', stage 'shadow_<component>'. */
export function ledgerRowsFor(usage: Record<string, UsageEntry> | null | undefined, ownerId: string, component: Component) {
  return Object.entries(usage ?? {}).map(([model, u]) => ({
    stage: `shadow_${component}`, owner_id: ownerId, model, traffic: 'shadow',
    calls: u.calls ?? 0, input_tokens: u.input ?? 0, output_tokens: u.output ?? 0, thinking_tokens: u.thinking ?? 0, cached_tokens: u.cached ?? 0,
  }))
}

/** Invented-claim count of a blueprint (invention gate, before repair). Null when the gate did not run. */
export function inventedOf(bp: unknown): number | null {
  const n = (bp as { invention_gate?: { before?: { I?: unknown } } } | null)?.invention_gate?.before?.I
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** Spoken word count of a blueprint's script. */
export function wordsOf(bp: unknown): number {
  const script = (bp as { script?: unknown } | null)?.script
  if (!Array.isArray(script)) return 0
  return script.reduce((a: number, b: { line?: unknown }) => a + (typeof b?.line === 'string' ? b.line.trim().split(/\s+/).filter(Boolean).length : 0), 0)
}

/** Postable: a script with lines, no invented claim left, and nothing it must ask first. */
export function postableOf(bp: unknown): boolean | null {
  if (!bp || typeof bp !== 'object') return null
  const outcome = (bp as { invention_gate?: { outcome?: unknown } }).invention_gate?.outcome
  return wordsOf(bp) > 0 && (inventedOf(bp) ?? 0) === 0 && outcome !== 'needs_answers' && outcome !== 'unchecked'
}

export type ShadowStatus = 'ok' | 'failed' | 'timeout' | 'budget_skipped' | 'killed'

/** One public.shadow_runs row. Output jsonb columns hold the two blueprints for blind judging. */
export function shadowRunRow(x: {
  component: Component; registryVersion: string; status: ShadowStatus
  generationId?: string | null; ownerId?: string | null
  liveLatencyMs?: number | null; shadowLatencyMs?: number | null; shadowCostUsd?: number
  liveBlueprint?: unknown; shadowBlueprint?: unknown; errorCode?: string | null
}) {
  const ran = x.status === 'ok'
  return {
    generation_id: x.generationId ?? null,
    owner_id: x.ownerId ?? null,
    component: x.component,
    registry_version: x.registryVersion,
    status: x.status,
    live_latency_ms: x.liveLatencyMs ?? null,
    shadow_latency_ms: x.shadowLatencyMs ?? null,
    shadow_cost_usd: x.shadowCostUsd ?? 0,
    live_invented: x.liveBlueprint ? inventedOf(x.liveBlueprint) : null,
    shadow_invented: ran ? inventedOf(x.shadowBlueprint) : null,
    live_postable: x.liveBlueprint ? postableOf(x.liveBlueprint) : null,
    shadow_postable: ran ? postableOf(x.shadowBlueprint) : null,
    error_code: x.errorCode ?? null,
    live_output: x.liveBlueprint ?? null,
    shadow_output: ran ? (x.shadowBlueprint ?? null) : null,
  }
}

const LOG_KEYS = new Set(['component', 'status', 'generation_id', 'registry_version', 'shadow_latency_ms', 'live_latency_ms', 'shadow_cost_usd', 'live_invented', 'shadow_invented', 'tokens', 'error_code', 'reason', 'spent_today_usd', 'cap_usd'])

/** A shadow log line: ids, counts and status only. Any other key (and any long string) is dropped. */
export function shadowLog(event: string, fields: Record<string, unknown>): string {
  const out: Record<string, unknown> = { event }
  for (const [k, v] of Object.entries(fields)) {
    if (!LOG_KEYS.has(k)) continue
    if (typeof v === 'string' && v.length > 64) continue
    if (v !== null && typeof v === 'object') continue
    out[k] = v
  }
  return JSON.stringify(out)
}

/** Error code of a failed re-run response: a short machine code, never the message text. */
export function errorCodeOf(status: number, body: unknown): string {
  const code = (body as { code?: unknown } | null)?.code
  if (typeof code === 'string' && /^[A-Za-z0-9_:-]{1,48}$/.test(code)) return code
  return `http_${status || 0}`
}
