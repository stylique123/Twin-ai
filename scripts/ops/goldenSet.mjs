// GOLDEN SET: OLD vs NEW FOR ONE RELEASE COMPONENT (docs/release/shadow-and-flags.md §4).
//
//   node --experimental-strip-types scripts/ops/goldenSet.mjs --component=hook_engine            # dry run (default)
//   node --experimental-strip-types scripts/ops/goldenSet.mjs --component=hook_engine --live     # real calls, capped
//
// A FIXED, VERSIONED SET: the first 24 requests of the fictional creator panel
// (scripts/ops/fixtures/fictional-panel.json). Every creator, product and story
// there is made up. Each request runs TWICE as its own fictional panel account:
//   old arm: `release_off: [component]` (that component on the old path only)
//   new arm: no flag (a panel account gets every component on the new path)
// so the two arms see the same facts and differ in one component.
//
// Per pair it compares the invented count (invention gate, measure mode),
// failure, end-to-end latency and spoken word count, and writes a JSON report
// to a LOCAL file. Nothing is written to the database by this script.
//
// ⚖️ DRY RUN BY DEFAULT: no network, no spend; the report lists the planned pairs.
// ⚖️ --live needs SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and
//    PANEL_FILE_ID, refuses any account that is not tagged fictional_panel, and
//    stops once the estimated spend reaches GOLDEN_BUDGET_USD (default 2.0).
// ⚖️ The report holds ids, counts and statuses, never script text.
import { readFileSync, writeFileSync } from 'node:fs'
import { panelScenarios } from './panelRun.mjs'
import { COMPONENTS } from '../../supabase/functions/_shared/releaseFlags.ts'
import { inventedOf, postableOf, wordsOf } from '../../supabase/functions/_shared/shadowRunner.ts'

export const GOLDEN_SET = Object.freeze({ version: 'golden-v1', fixture: 'fictional-panel.json', fixtureVersion: 2, size: 24 })
const FIXTURE = new URL('./fixtures/fictional-panel.json', import.meta.url)
const PANEL_TAG = 'fictional_panel'
// A rough per-script estimate for the dry-run plan only; live runs read real cost.
export const EST_USD_PER_SCRIPT = 0.03

/** The versioned golden requests: the first 24 fixture requests, as fake accounts for the plan. */
export function goldenRequests(fixture) {
  if (fixture?.version !== GOLDEN_SET.fixtureVersion) throw new Error(`golden: fixture version ${fixture?.version} is not ${GOLDEN_SET.fixtureVersion}; bump GOLDEN_SET.version with the fixture`)
  return fixture.requests.slice(0, GOLDEN_SET.size)
}

/** The two request bodies of one pair. */
export function armBodies(body, component, tag) {
  const base = { ...body, lengthen: false }
  return {
    old: { ...base, release_off: [component], idempotency_key: `${tag}-old` },
    new: { ...base, idempotency_key: `${tag}-new` },
  }
}

/** One arm's measures from the edge response. */
export function armResult(r) {
  const bp = r?.json?.blueprint ?? null
  const ok = r?.status === 200 && !!bp && wordsOf(bp) > 0
  return {
    status: r?.status ?? 0,
    failed: !ok,
    code: ok ? null : String(r?.json?.code ?? `http_${r?.status ?? 0}`).slice(0, 48),
    latency_ms: r?.ms ?? null,
    invented: ok ? inventedOf(bp) : null,
    postable: ok ? postableOf(bp) : null,
    words: ok ? wordsOf(bp) : 0,
    generation_id: r?.json?.id ?? null,
  }
}

function p90(xs) {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  return v.length ? v[Math.min(v.length - 1, Math.ceil(0.9 * v.length) - 1)] : null
}
const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)

/** Per-arm totals and the doc's gate rows (§5) that this set can measure. Blind craft is judged separately. */
export function summarize(pairs) {
  const arm = (k) => {
    const rs = pairs.map((p) => p[k]).filter(Boolean)
    const done = rs.filter((r) => !r.failed)
    return {
      n: rs.length,
      failure_rate: rs.length ? rs.filter((r) => r.failed).length / rs.length : null,
      invented_rate: done.length ? done.filter((r) => (r.invented ?? 0) > 0).length / done.length : null,
      invented_total: done.reduce((a, r) => a + (r.invented ?? 0), 0),
      postable_rate: done.length ? done.filter((r) => r.postable).length / done.length : null,
      p90_latency_ms: p90(rs.map((r) => r.latency_ms).filter((x) => x > 0)),
      mean_words: mean(done.map((r) => r.words)),
    }
  }
  const o = arm('old'), n = arm('new')
  const gate = n.n && o.n ? {
    invented: n.invented_rate != null && o.invented_rate != null ? (n.invented_rate < o.invented_rate || (n.invented_rate === 0 && o.invented_rate === 0)) : null,
    postable: n.postable_rate != null && o.postable_rate != null ? n.postable_rate > o.postable_rate : null,
    failure: n.failure_rate <= o.failure_rate,
    p90_latency: n.p90_latency_ms != null && o.p90_latency_ms != null ? n.p90_latency_ms <= o.p90_latency_ms + 20_000 : null,
    min_sample: pairs.filter((p) => p.old && p.new).length >= 30,
  } : null
  return { old: o, new: n, gate }
}

export function parseArgs(argv) {
  const a = Object.fromEntries(argv.filter((x) => x.startsWith('--')).map((x) => { const [k, v] = x.slice(2).split('='); return [k, v ?? true] }))
  const component = String(a.component ?? '')
  if (!COMPONENTS.includes(component)) throw new Error(`golden: --component must be one of ${COMPONENTS.join(', ')}`)
  const limit = Math.max(1, Math.min(GOLDEN_SET.size, Number(a.limit ?? GOLDEN_SET.size) || GOLDEN_SET.size))
  return { component, live: a.live === true, limit, out: typeof a.out === 'string' ? a.out : `golden-${component}-${new Date().toISOString().slice(0, 10)}.json`, budget: Number(a.budget ?? process.env.GOLDEN_BUDGET_USD ?? 2.0) }
}

/** The dry-run report: what would run, and the estimated spend against the cap. */
export function dryRunReport(fixture, opts) {
  const reqs = goldenRequests(fixture).slice(0, opts.limit)
  const est = Math.round(reqs.length * 2 * EST_USD_PER_SCRIPT * 1000) / 1000
  return {
    golden_set: GOLDEN_SET, component: opts.component, mode: 'dry_run', budget_usd: opts.budget,
    estimated_usd: est, within_budget: est <= opts.budget,
    pairs: reqs.map((r, n) => ({ n, id: r.id ?? null, creator: r.creator, goal: r.goal, kind: r.kind, arms: ['old', 'new'] })),
  }
}

/** Live run with injected I/O (`post(sc, body)` → {status, json, ms}; `costOf(ids)` → USD). */
export async function runGolden({ scenarios, component, budget, post, costOf, tag = 'golden', log = () => {} }) {
  const pairs = []
  const ids = []
  let spent = 0
  let stopped = null
  for (const sc of scenarios) {
    if (spent >= budget) { stopped = 'budget'; break }
    const bodies = armBodies(sc.body, component, `${tag}-${sc.n}`)
    const old = armResult(await post(sc, bodies.old))
    const neu = armResult(await post(sc, bodies.new))
    for (const r of [old, neu]) if (r.generation_id) ids.push(r.generation_id)
    spent = await costOf(ids)
    pairs.push({ n: sc.n, id: sc.id ?? null, creator: sc.creator, goal: sc.body?.goal ?? null, old, new: neu })
    log(`#${sc.n} old=${old.status}/I${old.invented ?? '-'} new=${neu.status}/I${neu.invented ?? '-'} spent=$${spent.toFixed(3)}`)
  }
  return { pairs, spent_usd: Math.round(spent * 1e4) / 1e4, stopped }
}

async function live(opts, fixture) {
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY, service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const fileId = Number(process.env.PANEL_FILE_ID || 0)
  if (!url || !anon || !service || !fileId) throw new Error('golden --live: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and PANEL_FILE_ID are required')
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { data: row, error } = await admin.from('test_run_files').select('kind, content').eq('id', fileId).single()
  if (error || !row || row.kind !== 'other') throw new Error(`golden: test_run_files row ${fileId} not found`)
  const scenarios = panelScenarios({ ...fixture, requests: goldenRequests(fixture) }, JSON.parse(row.content), opts.limit)
  // Test accounts only: every account must carry the fictional panel tag.
  for (const owner of new Set(scenarios.map((s) => s.owner_id))) {
    const { data } = await admin.auth.admin.getUserById(owner)
    if (data?.user?.app_metadata?.twin_test_account !== PANEL_TAG) throw new Error(`golden: account ${owner} is not a fictional panel account; refusing`)
  }
  const clients = new Map()
  const tokenFor = async (sc) => {
    if (!clients.has(sc.creator)) {
      const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email: sc.email })
      const c = createClient(url, anon, { auth: { persistSession: false } })
      const { data: s } = await c.auth.verifyOtp({ token_hash: data?.properties?.hashed_token, type: 'magiclink' })
      if (!s?.session) throw new Error(`golden: sign-in failed for ${sc.creator}`)
      clients.set(sc.creator, c)
    }
    return (await clients.get(sc.creator).auth.getSession()).data?.session?.access_token
  }
  const post = async (sc, body) => {
    const t0 = Date.now()
    try {
      const res = await fetch(`${url}/functions/v1/generate-blueprint`, { method: 'POST', headers: { authorization: `Bearer ${await tokenFor(sc)}`, apikey: anon, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(240_000) })
      const json = await res.json().catch(() => null)
      return { status: res.status, json, ms: Date.now() - t0 }
    } catch { return { status: 0, json: null, ms: Date.now() - t0 } }
  }
  const costOf = async (ids) => {
    if (!ids.length) return 0
    const { data } = await admin.from('ai_cost_by_stage_script').select('est_usd').in('generation_id', ids)
    return (data ?? []).reduce((a, r) => a + Number(r.est_usd ?? 0), 0)
  }
  const tag = `golden-${GOLDEN_SET.version}-${opts.component}-${Date.now().toString(36)}`
  const run = await runGolden({ scenarios, component: opts.component, budget: opts.budget, post, costOf, tag, log: (l) => console.log(l) })
  return { golden_set: GOLDEN_SET, component: opts.component, mode: 'live', budget_usd: opts.budget, ...run, summary: summarize(run.pairs) }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  const report = opts.live ? await live(opts, fixture) : dryRunReport(fixture, opts)
  writeFileSync(opts.out, JSON.stringify(report, null, 2))
  console.log(`golden ${report.mode}: ${opts.component}, ${report.pairs.length} pairs → ${opts.out}${report.mode === 'dry_run' ? ` (est $${report.estimated_usd}, cap $${opts.budget}; add --live to run)` : ` (spent $${report.spent_usd})`}`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
