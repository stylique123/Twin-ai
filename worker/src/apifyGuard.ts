// APIFY GUARDRAILS v6.4 (plan §30, supersedes the 23 Oct blocking caps).
// Every worker Apify run goes through `guardedApifyFetch` with a TIER:
//
//   'creator' — a creator's own onboarding / profile / reference read. NEVER
//               refused for money: no daily or monthly cap. Instead it is made
//               cheap (≤ ~20 results per read, 30-day cache + video-id dedupe
//               in creatorReadCache.ts, a per-run maxTotalChargeUsd, a timeout,
//               one retry at most) and RECORDED in the ledger. A ledger that
//               cannot be reached is logged and the read goes ahead.
//   'batch'   — background jobs (Reddit scan, comment mining, any scheduled
//               refresh). HARD daily + per-billing-cycle caps (cycle runs
//               22nd→22nd UTC), and the anomaly breaker may pause them. Fails
//               closed: no ledger answer, no run.
//
// Both tiers: test mode (APIFY_TEST_MODE=true) and test / fictional-panel
// owners NEVER call Apify — the reader returns empty (a stub).
// ALERT (log event `apify_spend_anomaly`, never a stop for creators) when
// today's Apify spend > 3x the trailing 7-day daily average.
// Logs carry feature / tier / dollars / counts only — never creator material.
import { AsyncLocalStorage } from 'node:async_hooks'

export type ApifyTier = 'creator' | 'batch'

export interface ApifyLimits {
  /** Per-run maxTotalChargeUsd for a creator read. */
  creatorRunMaxUsd: number
  /** Per-run maxTotalChargeUsd for a batch run. */
  batchRunMaxUsd: number
  /** Hard daily cap over batch runs only. */
  batchDailyUsd: number
  /** Hard cap over batch runs per billing cycle (22nd→22nd). */
  batchCycleUsd: number
  /** Alert / breaker multiplier over the trailing 7-day daily average. */
  anomalyX: number
}

const num = (v: string | undefined, d: number) => {
  const n = Number(String(v ?? '').trim())
  return v != null && String(v).trim() !== '' && Number.isFinite(n) && n >= 0 ? n : d
}

export function apifyLimits(e: Record<string, string | undefined> = process.env): ApifyLimits {
  return {
    creatorRunMaxUsd: num(e.APIFY_CREATOR_RUN_MAX_USD, 0.25),
    batchRunMaxUsd: num(e.APIFY_BATCH_RUN_MAX_USD, 0.4),
    batchDailyUsd: num(e.APIFY_BATCH_DAILY_USD, 2),
    batchCycleUsd: num(e.APIFY_BATCH_CYCLE_USD, 2),
    anomalyX: num(e.APIFY_ANOMALY_X, 3) || 3,
  }
}

/** Results per creator read (~10–20, never the old 50–90). */
export const CREATOR_READ_LIMIT_DEFAULT = 20
export function creatorReadLimit(requested: number, e: Record<string, string | undefined> = process.env): number {
  const cap = Math.max(1, Math.min(Math.trunc(num(e.APIFY_CREATOR_READ_LIMIT, CREATOR_READ_LIMIT_DEFAULT)), 20))
  const r = Number.isFinite(requested) && requested > 0 ? Math.trunc(requested) : cap
  return Math.min(r, cap)
}

/** Test mode stubs every Apify reader: on only when exactly 'true'. */
export function apifyTestMode(v: string | undefined = process.env.APIFY_TEST_MODE): boolean {
  return String(v ?? '').trim().toLowerCase() === 'true'
}

/** Manual pause for every batch job (APIFY_BATCH_PAUSED=true). Creator reads ignore it. */
export function apifyBatchPaused(v: string | undefined = process.env.APIFY_BATCH_PAUSED): boolean {
  return String(v ?? '').trim().toLowerCase() === 'true'
}

/** Is today's spend an anomaly (> x times the trailing daily average)? */
export function spendAnomaly(todayUsd: number, avgUsd: number, x = 3): boolean {
  return avgUsd > 0 && todayUsd > x * avgUsd
}

/** Start of the billing cycle containing `at`: the latest 22nd, 00:00 UTC. */
export function billingCycleStart(at: Date = new Date()): Date {
  const y = at.getUTCFullYear(); const m = at.getUTCMonth()
  return at.getUTCDate() >= 22 ? new Date(Date.UTC(y, m, 22)) : new Date(Date.UTC(y, m - 1, 22))
}

/** Same rule as 0295 apify_reserve_tiered, for tests and for reasoning. */
export function budgetDecision(
  s: { todayUsd: number; avgUsd: number; batchDayUsd: number; batchCycleUsd: number },
  tier: ApifyTier, cost: number, l: ApifyLimits,
): { ok: true; anomaly: boolean } | { ok: false; reason: 'anomaly_paused' | 'daily_limit' | 'cycle_limit' } {
  const EPS = 1e-9
  const anomaly = spendAnomaly(s.todayUsd, s.avgUsd, l.anomalyX)
  if (tier === 'creator') return { ok: true, anomaly } // record-only, never refused
  if (anomaly) return { ok: false, reason: 'anomaly_paused' }
  if (s.batchDayUsd + cost > l.batchDailyUsd + EPS) return { ok: false, reason: 'daily_limit' }
  if (s.batchCycleUsd + cost > l.batchCycleUsd + EPS) return { ok: false, reason: 'cycle_limit' }
  return { ok: true, anomaly }
}

/** The run URL with the per-run cost cap Apify enforces. */
export function cappedRunUrl(actor: string, token: string, capUsd: number): string {
  return `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&maxTotalChargeUsd=${capUsd.toFixed(2)}`
}

/** Who the current job runs for (set by the job loop); null for sweeps. */
export const apifyOwnerScope = new AsyncLocalStorage<{ ownerId: string | null; testOwner: boolean }>()

export class ApifyRefusedError extends Error {
  constructor(readonly reason: string) { super(`apify refused: ${reason}`); this.name = 'ApifyRefusedError' }
}

export type ReserveAnswer = { ok: boolean; reason?: string; today_usd?: number; avg_usd?: number }

export interface GuardDeps {
  token: string
  reserve: (a: { feature: string; actor: string; ownerId: string | null; usd: number; tier: ApifyTier; l: ApifyLimits }) =>
    Promise<ReserveAnswer>
  fetch: typeof fetch
  log?: (level: string, msg: string, extra?: Record<string, unknown>) => void
  limits?: ApifyLimits
  testMode?: boolean
  batchPaused?: boolean
  isTestOwner?: (ownerId: string | null) => boolean
}

/** Every guard before a run. Returns the capped run URL, or null when this
 *  caller must not spend (test mode / test owner: stub, no call).
 *  creator: always a URL (record-only). batch: refused → ApifyRefusedError. */
export async function prepareApifyRun(
  deps: GuardDeps, feature: string, actor: string, tier: ApifyTier, capUsd?: number,
): Promise<string | null> {
  const l = deps.limits ?? apifyLimits()
  const scope = apifyOwnerScope.getStore()
  const ownerId = scope?.ownerId ?? null
  if (deps.testMode ?? apifyTestMode()) return null
  if (scope?.testOwner || deps.isTestOwner?.(ownerId)) return null
  if (!deps.token) throw new Error('APIFY_TOKEN is not set')
  const runMax = tier === 'creator' ? l.creatorRunMaxUsd : l.batchRunMaxUsd
  const cap = Math.min(capUsd ?? runMax, runMax)
  if (tier === 'batch' && (deps.batchPaused ?? apifyBatchPaused())) {
    deps.log?.('warn', 'apify_refused', { feature, tier, reason: 'batch_paused' })
    throw new ApifyRefusedError('batch_paused')
  }
  let r: ReserveAnswer
  try {
    r = await deps.reserve({ feature, actor, ownerId, usd: cap, tier, l })
  } catch (err) {
    r = { ok: false, reason: `ledger_unavailable: ${err instanceof Error ? err.message.slice(0, 80) : 'error'}` }
  }
  if (spendAnomaly(r.today_usd ?? 0, r.avg_usd ?? 0, l.anomalyX)) {
    deps.log?.('warn', 'apify_spend_anomaly', { feature, tier, today_usd: r.today_usd, avg_usd: r.avg_usd, x: l.anomalyX })
  }
  if (!r.ok) {
    if (tier === 'creator') {
      // ⚖️ NEVER REFUSE A CREATOR'S OWN READ. A ledger that could not record is
      // an ops problem, logged as one; the creator still gets read.
      deps.log?.('warn', 'apify_record_failed', { feature, tier, reason: r.reason })
      return cappedRunUrl(actor, deps.token, cap)
    }
    deps.log?.('error', 'apify_refused', { feature, tier, reason: r.reason })
    throw new ApifyRefusedError(r.reason ?? 'refused')
  }
  return cappedRunUrl(actor, deps.token, cap)
}

/** Runs one Apify actor synchronously behind every guard (prepareApifyRun). */
export async function guardedApifyFetch(
  deps: GuardDeps, feature: string, actor: string, input: unknown,
  opts: { tier: ApifyTier; timeoutMs?: number; capUsd?: number },
): Promise<Record<string, unknown>[]> {
  const url = await prepareApifyRun(deps, feature, actor, opts.tier, opts.capUsd)
  if (url === null) return []
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? (opts.tier === 'creator' ? 180_000 : 300_000))
  try {
    const res = await deps.fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: ctl.signal,
    })
    if (!res.ok) throw new Error(`apify ${actor} returned ${res.status}`)
    const j = await res.json()
    return Array.isArray(j) ? (j as Record<string, unknown>[]) : []
  } finally { clearTimeout(timer) }
}

/** No limit at all: what a creator read passes to 0294 apify_reserve when
 *  0295 is not applied yet, so the call only records. */
const UNLIMITED = 1e9

/** Production deps: the worker's token, the 0295 RPC (0294 fallback), TEST_OWNER_IDS. */
export async function liveApifyDeps(token: string, log?: GuardDeps['log']): Promise<GuardDeps> {
  return {
    token,
    log: log ?? ((level, msg, extra) => console[level === 'error' ? 'error' : 'warn'](JSON.stringify({ event: msg, ...extra }))),
    fetch: (...a) => globalThis.fetch(...a),
    isTestOwner: (id) => !!id && (process.env.TEST_OWNER_IDS ?? '').split(',').map((s) => s.trim()).includes(id),
    reserve: async ({ feature, actor, ownerId, usd, tier, l }) => {
      const { db } = await import('./db.js')
      const { data, error } = await db.rpc('apify_reserve_tiered', {
        p_feature: feature, p_actor: actor, p_owner: ownerId, p_usd: usd, p_tier: tier,
        p_daily_usd: l.batchDailyUsd, p_cycle_usd: l.batchCycleUsd, p_breaker_x: l.anomalyX,
      })
      if (!error) return (data ?? { ok: false, reason: 'no_answer' }) as ReserveAnswer
      // 0295 not applied yet: creator reads still record through 0294 with no
      // limit; batch runs fail closed (no tier-aware cap available).
      if (tier === 'batch') throw new Error(error.message)
      const old = await db.rpc('apify_reserve', {
        p_feature: feature, p_actor: actor, p_owner: ownerId, p_usd: usd, p_daily_usd: UNLIMITED, p_monthly_usd: UNLIMITED,
      })
      if (old.error) throw new Error(old.error.message)
      return (old.data ?? { ok: false, reason: 'no_answer' }) as ReserveAnswer
    },
  }
}
