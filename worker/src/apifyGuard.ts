// APIFY GUARDRAILS (owner, 23 Oct). Every worker Apify run goes through
// `guardedApifyFetch`, which in order:
//   1. returns nothing (no call) for test mode (APIFY_TEST_MODE=true) and for
//      test / fictional-panel owners — those accounts NEVER spend Apify;
//   2. reserves the run's cap in `apify_spend_ledger` (0293 apify_reserve),
//      which refuses past the HARD daily / monthly stops — and a failed
//      reservation (e.g. migration not applied) is a refusal: fail closed;
//   3. starts the run with `maxTotalChargeUsd` = that cap, so Apify itself
//      aborts a run that would cost more than it reserved.
// Defaults: $10/month (APIFY_MONTHLY_USD), $2/day (APIFY_DAILY_USD), alert at
// $5/month (APIFY_ALERT_USD), $0.40 per run (APIFY_RUN_MAX_USD).
import { AsyncLocalStorage } from 'node:async_hooks'

export interface ApifyLimits { dailyUsd: number; monthlyUsd: number; alertUsd: number; runMaxUsd: number }

const num = (v: string | undefined, d: number) => {
  const n = Number(String(v ?? '').trim())
  return v != null && String(v).trim() !== '' && Number.isFinite(n) && n >= 0 ? n : d
}

export function apifyLimits(e: Record<string, string | undefined> = process.env): ApifyLimits {
  return {
    dailyUsd: num(e.APIFY_DAILY_USD, 2),
    monthlyUsd: num(e.APIFY_MONTHLY_USD, 10),
    alertUsd: num(e.APIFY_ALERT_USD, 5),
    runMaxUsd: num(e.APIFY_RUN_MAX_USD, 0.4),
  }
}

/** Test mode stubs every Apify reader: on only when exactly 'true'. */
export function apifyTestMode(v: string | undefined = process.env.APIFY_TEST_MODE): boolean {
  return String(v ?? '').trim().toLowerCase() === 'true'
}

/** Same rule as apify_reserve, for tests and for reasoning: may `cost` be added? */
export function budgetDecision(dayUsd: number, monthUsd: number, cost: number, l: ApifyLimits):
  { ok: true; alert: boolean } | { ok: false; reason: 'daily_limit' | 'monthly_limit' } {
  const EPS = 1e-9 // float sums; SQL numeric is exact
  if (dayUsd + cost > l.dailyUsd + EPS) return { ok: false, reason: 'daily_limit' }
  if (monthUsd + cost > l.monthlyUsd + EPS) return { ok: false, reason: 'monthly_limit' }
  return { ok: true, alert: monthUsd + cost >= l.alertUsd }
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

export interface GuardDeps {
  token: string
  reserve: (a: { feature: string; actor: string; ownerId: string | null; usd: number; l: ApifyLimits }) =>
    Promise<{ ok: boolean; reason?: string; month_usd?: number }>
  fetch: typeof fetch
  log?: (level: string, msg: string, extra?: Record<string, unknown>) => void
  limits?: ApifyLimits
  testMode?: boolean
  isTestOwner?: (ownerId: string | null) => boolean
}

/** Every guard before a run. Returns the capped run URL, or null when this
 *  caller must not spend (test mode / test owner: return empty, no call).
 *  Budget refused or ledger unreachable → ApifyRefusedError (fail closed). */
export async function prepareApifyRun(deps: GuardDeps, feature: string, actor: string, capUsd?: number): Promise<string | null> {
  const l = deps.limits ?? apifyLimits()
  const scope = apifyOwnerScope.getStore()
  const ownerId = scope?.ownerId ?? null
  if (deps.testMode ?? apifyTestMode()) return null
  if (scope?.testOwner || deps.isTestOwner?.(ownerId)) return null
  if (!deps.token) throw new Error('APIFY_TOKEN is not set')
  const cap = Math.min(capUsd ?? l.runMaxUsd, l.runMaxUsd)
  let r: { ok: boolean; reason?: string; month_usd?: number }
  try {
    r = await deps.reserve({ feature, actor, ownerId, usd: cap, l })
  } catch (err) {
    r = { ok: false, reason: `ledger_unavailable: ${err instanceof Error ? err.message.slice(0, 80) : 'error'}` }
  }
  if (!r.ok) {
    deps.log?.('error', 'apify_refused', { feature, reason: r.reason })
    throw new ApifyRefusedError(r.reason ?? 'refused')
  }
  if ((r.month_usd ?? 0) >= l.alertUsd) deps.log?.('warn', 'apify_spend_alert', { feature, month_usd: r.month_usd, alert_usd: l.alertUsd })
  return cappedRunUrl(actor, deps.token, cap)
}

/** Runs one Apify actor synchronously behind every guard (prepareApifyRun). */
export async function guardedApifyFetch(
  deps: GuardDeps, feature: string, actor: string, input: unknown,
  opts: { timeoutMs?: number; capUsd?: number } = {},
): Promise<Record<string, unknown>[]> {
  const url = await prepareApifyRun(deps, feature, actor, opts.capUsd)
  if (url === null) return []
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 300_000)
  try {
    const res = await deps.fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: ctl.signal,
    })
    if (!res.ok) throw new Error(`apify ${actor} returned ${res.status}`)
    const j = await res.json()
    return Array.isArray(j) ? (j as Record<string, unknown>[]) : []
  } finally { clearTimeout(timer) }
}

/** Production deps: the worker's token, the 0293 RPC, TEST_OWNER_IDS. */
export async function liveApifyDeps(token: string, log?: GuardDeps['log']): Promise<GuardDeps> {
  return {
    token, log, fetch: (...a) => globalThis.fetch(...a),
    isTestOwner: (id) => !!id && (process.env.TEST_OWNER_IDS ?? '').split(',').map((s) => s.trim()).includes(id),
    reserve: async ({ feature, actor, ownerId, usd, l }) => {
      const { db } = await import('./db.js')
      const { data, error } = await db.rpc('apify_reserve', {
        p_feature: feature, p_actor: actor, p_owner: ownerId, p_usd: usd, p_daily_usd: l.dailyUsd, p_monthly_usd: l.monthlyUsd,
      })
      if (error) throw new Error(error.message)
      return (data ?? { ok: false, reason: 'no_answer' }) as { ok: boolean; reason?: string; month_usd?: number }
    },
  }
}
