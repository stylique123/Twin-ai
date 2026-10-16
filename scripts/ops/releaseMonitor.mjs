// RELEASE MONITOR AND AUTOMATIC ROLLBACK (docs/release/shadow-and-flags.md §6).
//
//   node --experimental-strip-types scripts/ops/releaseMonitor.mjs                  # dry-run report (default)
//   RELEASE_MONITOR_ENABLED=1 node --experimental-strip-types scripts/ops/releaseMonitor.mjs --apply
//
// Per component, over the rolling window (last 200 runs within 24 h of
// public.shadow_runs), the new arm is compared with the live baseline using the
// doc's thresholds (_shared/releaseMonitor.ts): failure rate +2 points, p90
// latency +20 s, invented rate above baseline, a new error code over 1%.
//
// When a component past S0 trips, the monitor would set its kill switch
// (public.release_flags.killed, migration 0291) and raise an ops event
// (ops_events kind 'release_rollback', severity 'critical'). A kill is never
// cleared here; only a person clears it.
//
// ⚖️ DRY RUN UNTIL THE OWNER ENABLES IT: without BOTH --apply and
// RELEASE_MONITOR_ENABLED=1 it only reads and writes a local report file.
// ⚖️ The report holds component names, counts, rates and codes. No script text.
import { writeFileSync } from 'node:fs'
import { monitorActions, monitorReport, ROLLBACK } from '../../supabase/functions/_shared/releaseMonitor.ts'
import { registryFromRows } from '../../supabase/functions/_shared/shadowRunner.ts'

const COLS = 'component, created_at, status, live_latency_ms, shadow_latency_ms, live_invented, shadow_invented, error_code'
const missing = (e) => e?.code === '42P01' || e?.code === 'PGRST205' || /does not exist|could not find the table/i.test(String(e?.message ?? ''))

/** Read, evaluate and (only when enabled) act. `db` is a supabase client; `nowMs` injectable for tests. */
export async function runMonitor({ db, apply = false, enabled = false, nowMs = Date.now() }) {
  const since = new Date(nowMs - ROLLBACK.windowHours * 3600_000).toISOString()
  const baseSince = new Date(nowMs - 7 * 24 * 3600_000).toISOString()
  const report = { mode: apply && enabled ? 'apply' : 'dry_run', at: new Date(nowMs).toISOString(), thresholds: ROLLBACK, components: [], actions: [], applied: [] }
  const { data: rows, error } = await db.from('shadow_runs').select(COLS).gte('created_at', since).order('created_at', { ascending: false }).limit(ROLLBACK.windowRuns * 7)
  if (error) { report.skipped = missing(error) ? 'shadow_runs_missing' : 'read_error'; return report }
  const { data: base } = await db.from('shadow_runs').select('component, error_code').gte('created_at', baseSince).lt('created_at', since).not('error_code', 'is', null).limit(5000)
  const { data: flags, error: fErr } = await db.from('release_flags').select('component, stage, rollout_pct, killed')
  const registry = registryFromRows(fErr ? [] : flags)
  if (fErr) report.registry = missing(fErr) ? 'release_flags_missing' : 'read_error'
  report.components = monitorReport(rows ?? [], base ?? [], nowMs)
  report.actions = monitorActions(report.components, registry)
  if (report.mode !== 'apply' || fErr) return report
  for (const a of report.actions) {
    const { data: upd, error: kErr } = await db.from('release_flags')
      .update({ killed: true, killed_reason: a.reasons.join(','), killed_at: new Date(nowMs).toISOString(), updated_at: new Date(nowMs).toISOString() })
      .eq('component', a.component).eq('killed', false).select('component')
    const killed = !kErr && (upd ?? []).length > 0
    const metrics = report.components.find((c) => c.component === a.component)
    await db.from('ops_events').insert({ kind: 'release_rollback', severity: 'critical', user_id: null, detail: { component: a.component, reasons: a.reasons, killed, runs: metrics?.runs ?? 0, failure: metrics?.failure, p90_ms: metrics?.p90_ms, invented_rate: metrics?.invented_rate, new_codes: metrics?.new_codes } })
    report.applied.push({ component: a.component, killed })
  }
  return report
}

async function main() {
  const apply = process.argv.includes('--apply')
  const enabled = process.env.RELEASE_MONITOR_ENABLED === '1'
  const outArg = process.argv.find((a) => a.startsWith('--out='))
  const out = outArg ? outArg.slice(6) : `release-monitor-${new Date().toISOString().slice(0, 13)}.json`
  const url = process.env.SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) throw new Error('releaseMonitor: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(url, service, { auth: { persistSession: false } })
  const report = await runMonitor({ db, apply, enabled })
  writeFileSync(out, JSON.stringify(report, null, 2))
  if (apply && !enabled) console.log('releaseMonitor: --apply ignored; RELEASE_MONITOR_ENABLED is not 1 (dry run)')
  console.log(`releaseMonitor ${report.mode}: ${report.skipped ?? `${report.components.reduce((a, c) => a + c.runs, 0)} runs`}, ${report.actions.length} would-kill, ${report.applied.length} applied → ${out}`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
