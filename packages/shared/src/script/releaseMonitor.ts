// RELEASE MONITOR, PURE PART (docs/release/shadow-and-flags.md §6).
//
// Per component, over a rolling window (the last 200 runs, within 24 h), the new
// arm is compared with the live (old) baseline from public.shadow_runs:
//   - failure rate more than 2 points above baseline
//   - p90 latency more than 20 s above baseline
//   - invented rate above baseline
//   - a new error code over 1% of the window
// Any one trips the component's kill switch. A kill is never cleared here.
//
// No I/O. scripts/ops/releaseMonitor.mjs reads the rows and, only when the owner
// has enabled it, writes the kill and the ops event.
//
// Generated into supabase/functions/_shared/releaseMonitor.ts.

import { COMPONENTS, type Component, type FlagRegistry } from './releaseFlags.js'

export const ROLLBACK = Object.freeze({
  windowRuns: 200,
  windowHours: 24,
  failurePts: 0.02,
  p90Ms: 20_000,
  newCodeShare: 0.01,
  /** Below this many completed runs no rule trips: one failed run is not a rate. */
  minRuns: 20,
})

export interface MonitorRow {
  component: string
  created_at: string
  status: string
  live_latency_ms?: number | null
  shadow_latency_ms?: number | null
  live_invented?: number | null
  shadow_invented?: number | null
  error_code?: string | null
}

export interface ComponentReport {
  component: Component
  runs: number
  failure: { new: number; old: number }
  p90_ms: { new: number | null; old: number | null }
  invented_rate: { new: number | null; old: number | null }
  new_codes: Array<{ code: string; share: number }>
  trips: string[]
}

/** Rows of one component inside the rolling window: newest first, within 24 h, at most 200. */
export function windowOf(rows: MonitorRow[], component: Component, nowMs: number, t = ROLLBACK): MonitorRow[] {
  const since = nowMs - t.windowHours * 3600_000
  return rows
    .filter((r) => r.component === component && Date.parse(r.created_at) >= since)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, t.windowRuns)
}

export function p90(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  return v[Math.min(v.length - 1, Math.ceil(0.9 * v.length) - 1)]
}

function rate(xs: Array<number | null | undefined>): number | null {
  const v = xs.filter((x): x is number => typeof x === 'number')
  return v.length ? v.filter((x) => x > 0).length / v.length : null
}

/** Compare one component's window with its baseline. `baselineCodes` are the error codes
 *  already seen before the window; a code not among them is new. */
export function evaluateComponent(component: Component, windowRows: MonitorRow[], baselineCodes: ReadonlySet<string>, t = ROLLBACK): ComponentReport {
  // budget_skipped and killed rows never ran, so they say nothing about the new path.
  const done = windowRows.filter((r) => r.status === 'ok' || r.status === 'failed' || r.status === 'timeout')
  const n = done.length
  const failedNew = done.filter((r) => r.status !== 'ok').length
  // The live arm is the response the creator got; a row exists only for a served live script.
  const failure = { new: n ? failedNew / n : 0, old: 0 }
  const ok = done.filter((r) => r.status === 'ok')
  const p = { new: p90(done.map((r) => Number(r.shadow_latency_ms)).filter((x) => x > 0)), old: p90(done.map((r) => Number(r.live_latency_ms)).filter((x) => x > 0)) }
  const inv = { new: rate(ok.map((r) => r.shadow_invented)), old: rate(ok.map((r) => r.live_invented)) }
  const counts = new Map<string, number>()
  for (const r of done) if (r.error_code) counts.set(r.error_code, (counts.get(r.error_code) ?? 0) + 1)
  const newCodes = [...counts.entries()]
    .filter(([code, c]) => !baselineCodes.has(code) && n > 0 && c / n > t.newCodeShare)
    .map(([code, c]) => ({ code, share: Math.round((c / n) * 1000) / 1000 }))
  const trips: string[] = []
  if (n >= t.minRuns) {
    if (failure.new - failure.old > t.failurePts) trips.push('failure_rate')
    if (p.new != null && p.old != null && p.new - p.old > t.p90Ms) trips.push('p90_latency')
    if (inv.new != null && inv.old != null && inv.new > inv.old) trips.push('invented_rate')
    if (newCodes.length) trips.push('new_error_code')
  }
  return { component, runs: n, failure, p90_ms: p, invented_rate: inv, new_codes: newCodes, trips }
}

export interface KillAction { component: Component; reasons: string[] }

/** What the monitor would do: kill every component past S0 that tripped and is not killed yet. */
export function monitorActions(reports: ComponentReport[], registry: FlagRegistry): KillAction[] {
  return reports
    .filter((r) => r.trips.length && registry[r.component]?.stage !== 'S0' && registry[r.component]?.killed !== true)
    .map((r) => ({ component: r.component, reasons: r.trips }))
}

/** Evaluate every component. `baselineRows` are rows from before the window (for "new" codes). */
export function monitorReport(rows: MonitorRow[], baselineRows: MonitorRow[], nowMs: number, t = ROLLBACK): ComponentReport[] {
  return COMPONENTS.map((c) => {
    const codes = new Set(baselineRows.filter((r) => r.component === c && r.error_code).map((r) => String(r.error_code)))
    return evaluateComponent(c, windowOf(rows, c, nowMs, t), codes, t)
  })
}
