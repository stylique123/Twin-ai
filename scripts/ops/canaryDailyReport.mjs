#!/usr/bin/env node
// THE CANARY'S DAILY ERROR AND COST REPORT (Fast Path v1, Track B (4)+(5)).
//
// One screen for the owner, every morning, about the last 24 hours on the
// canary account: how many scripts, how many runs failed, latency (p50/p90),
// cost per script, "check this line" flag counts, his ratings, edits and posts.
//
// ⚖️ COUNTS AND AVERAGES ONLY. No script text, no note, no edited script and
// no post link is ever printed, so the output is safe to paste anywhere.
// ⚖️ READ ONLY. Selects; never writes.
//
// Usage (service role; the owner's machine or a reviewed workflow):
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… CANARY_ACCOUNT_IDS=<uid> \
//     node scripts/ops/canaryDailyReport.mjs [--hours=24]
// Exit code 2 = the stop list's "error spike" (failures above 1 in 24 or
// p90 above 125 s): the owner should consider CANARY_KILL=1.
import { createClient } from '@supabase/supabase-js'

const P90_LIMIT_S = 125
const FAIL_LIMIT = 1 / 24

export function pct(xs, p) {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  return v[Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1)]
}

/** Pure: turns the four row sets into the report numbers. Exported for the selftest. */
export function summarize({ attempts, gens, costs, feedback, posts }) {
  const runs = new Map()
  for (const a of attempts) {
    const r = runs.get(a.run_id) ?? { ok: false, startedMs: Infinity, settledMs: 0 }
    if (a.outcome === 'succeeded' && a.generation_id) r.ok = true
    r.startedMs = Math.min(r.startedMs, Date.parse(a.started_at))
    if (a.settled_at) r.settledMs = Math.max(r.settledMs, Date.parse(a.settled_at))
    runs.set(a.run_id, r)
  }
  const all = [...runs.values()]
  const failed = all.filter((r) => !r.ok).length
  const latS = all.filter((r) => r.ok && r.settledMs > 0).map((r) => (r.settledMs - r.startedMs) / 1000)
  const canaryIds = new Set(gens.filter((g) => g.blueprint?.canary === true).map((g) => g.id))
  const costBy = new Map()
  for (const c of costs) if (canaryIds.has(c.generation_id)) costBy.set(c.generation_id, (costBy.get(c.generation_id) ?? 0) + Number(c.est_usd ?? 0))
  const spend = [...costBy.values()].reduce((a, b) => a + b, 0)
  let flagged = 0, flagLines = 0
  for (const g of gens) {
    if (!canaryIds.has(g.id)) continue
    const n = Array.isArray(g.blueprint?.check_lines) ? g.blueprint.check_lines.length : 0
    if (n) flagged++
    flagLines += n
  }
  const fb = feedback.filter((f) => canaryIds.has(f.generation_id))
  const rated = fb.map((f) => Number(f.rating)).filter((n) => n >= 1 && n <= 10)
  const postedIds = new Set(posts.filter((p) => canaryIds.has(p.generation_id)).map((p) => p.generation_id))
  return {
    runs: all.length,
    failed,
    failure_rate: all.length ? failed / all.length : 0,
    scripts: canaryIds.size,
    p50_s: pct(latS, 50),
    p90_s: pct(latS, 90),
    spend_usd: Number(spend.toFixed(4)),
    usd_per_script: canaryIds.size ? Number((spend / canaryIds.size).toFixed(4)) : null,
    flagged_scripts: flagged,
    flagged_lines: flagLines,
    rated: rated.length,
    avg_rating: rated.length ? Number((rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(2)) : null,
    edited: fb.filter((f) => f.edited).length,
    posted: postedIds.size,
  }
}

export function spike(s) {
  return (s.runs > 0 && s.failure_rate > FAIL_LIMIT) || (s.p90_s != null && s.p90_s > P90_LIMIT_S)
}

async function main() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const owner = String(process.env.CANARY_ACCOUNT_IDS ?? '').trim()
  if (!url || !key) { console.error('needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
  if (!/^[0-9a-f-]{36}$/i.test(owner)) { console.error('needs CANARY_ACCOUNT_IDS (one auth user id)'); process.exit(1) }
  const hours = Number((process.argv.find((a) => a.startsWith('--hours=')) ?? '--hours=24').split('=')[1]) || 24
  const since = new Date(Date.now() - hours * 3600_000).toISOString()
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data: attempts = [] } = await db.from('script_attempts')
    .select('run_id, generation_id, outcome, started_at, settled_at').eq('owner_id', owner).gte('started_at', since)
  const { data: gens = [] } = await db.from('generations')
    .select('id, blueprint').eq('user_id', owner).gte('created_at', since)
  const ids = (gens ?? []).map((g) => g.id)
  const [costs, feedback, posts] = ids.length ? await Promise.all([
    db.from('ai_cost_by_stage_script').select('generation_id, est_usd').in('generation_id', ids).then((r) => r.data ?? []),
    db.from('canary_feedback').select('generation_id, rating, edited:edited_script').in('generation_id', ids).then((r) => (r.data ?? []).map((f) => ({ ...f, edited: f.edited != null }))),
    db.from('posts').select('generation_id').in('generation_id', ids).then((r) => r.data ?? []),
  ]) : [[], [], []]

  const s = summarize({ attempts: attempts ?? [], gens: gens ?? [], costs, feedback, posts })
  const f = (v, d = 1) => (v == null ? '—' : Number(v).toFixed(d))
  console.log(`CANARY — last ${hours} h`)
  console.log(`  scripts ${s.scripts} · runs ${s.runs} · failed ${s.failed} (${f(s.failure_rate * 100)}%; limit 1 in 24)`)
  console.log(`  latency p50 ${f(s.p50_s)} s · p90 ${f(s.p90_s)} s (limit ${P90_LIMIT_S} s)`)
  console.log(`  spend $${f(s.spend_usd, 3)} · per script $${f(s.usd_per_script, 3)}`)
  console.log(`  "check this line": ${s.flagged_lines} lines on ${s.flagged_scripts} scripts`)
  console.log(`  rated ${s.rated} (avg ${f(s.avg_rating, 2)} of 10; exit needs 7+ over 15) · edited ${s.edited} · posted ${s.posted}`)
  if (spike(s)) { console.log('  ⚠️ ERROR SPIKE: consider CANARY_KILL=1 (instant rollback).'); process.exit(2) }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
