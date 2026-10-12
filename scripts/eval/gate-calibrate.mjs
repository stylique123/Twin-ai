#!/usr/bin/env node
// ZERO-INVENTION GATE — OFFLINE CALIBRATION (design v1 A7; owner amendments a, b).
//
// Re-runs THE SAME GATE PATH PRODUCTION RUNS (the durable worker step, owner
// decision 13 Oct): rules prefilter, chunks of ~6 with a per-chunk ledger at
// concurrency 4, thinking off, the read→extract cascade, then repair and the
// re-judge of rewritten lines — on scripts that already exist. Its first
// classification is compared with an INDEPENDENTLY LABELLED set fed in from a
// CSV, and the whole gate's wall time per script is reported as p50/p90.
// Read-only: it SELECTs and calls the models; it writes nothing. It prints
// counts, rates, timings and ids only — never script or knowledge text.
//
//   node scripts/eval/gate-calibrate.mjs --batch=<label>[,<label>] \
//        (--labels=<labels.csv> | --labels-file-id=<test_run_files id>) \
//        [--modes=cascade,read,extract] [--measure-only] [--script-concurrency=2] \
//        [--dry-run] [--dump=<rows.json>]
//
// --modes: `cascade` (default, what production runs: fast `read` on every
// chunk, `extract` only for uncertain sentences), or a single task class / model
// id judged alone with no cascade (for comparison). --measure-only skips the
// repair step (classification latency only).
//
// --labels-file-id loads the CSV text from a private `test_run_files` row
// (kind 'ratings' or 'other') with the service client, so labels never sit in
// the repository or in workflow inputs — only the row id does.
//
// Env (live mode): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY.
//
// LABELS CSV: header `batch,n,sentence_i,label`; label is S, E, I or N.
// `sentence_i` is the gate's own sentence index: extractSentences() order over
// the SAVED blueprint (script sentences first, then hook options, titles,
// thumbnail text, captions, publish captions). Unlabelled sentences are
// classified and counted but not scored.
//
// THE LEDGER IS REBUILT FROM WHAT WAS SAVED: the knowledge ids the writer was
// shown (creator_knowledge_uses for that generation), every product of the
// owner, the request note and the scenario's answers. Outside material (niche
// research, moments, Reddit) is not recoverable per generation and is left
// out; it can never back a gated claim, so this only matters for plain S.
//
// --dry-run prints how many judge calls and roughly how many tokens a run
// would use, and calls nothing. --dump reads the joined rows from a JSON file
// ([{batch,n,blueprint,knowledge,products,note,answers,target_product_id}])
// instead of the database.
import { readFileSync } from 'node:fs'
import {
  buildLedger, extractSentences, ruleRead, decidedByRule, chunk, chunkLedger, buildJudgePrompt, runInventionGate,
  JUDGE_SYSTEM, JUDGE_SCHEMA, REWRITE_SYSTEM, REWRITE_SCHEMA, JUDGE_THINKING_BUDGET, INVENTION_JUDGE_CASCADE,
  INVENTION_RECHECK_TIMEOUT_MS,
} from '../../packages/shared/src/script/inventionGate.ts'

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/)
  return m ? [m[1], m[2] ?? true] : [a, true]
}))
const BATCHES = typeof args.batch === 'string' ? args.batch.split(',').map((s) => s.trim()).filter(Boolean) : []
// --models takes task classes of the routing catalog (read, extract) or model ids.
const ROUTING = JSON.parse(readFileSync(new URL('../../worker/model_routing_v1.json', import.meta.url), 'utf8')).taskClasses ?? {}
const modelOf = (m) => ROUTING[m]?.model ?? m
// `--models` is kept as an alias of `--modes` for older workflow inputs.
const MODE_ARG = typeof args.modes === 'string' ? args.modes : typeof args.models === 'string' ? args.models : 'cascade'
const MODES = MODE_ARG.split(',').map((s) => s.trim()).filter(Boolean).map((m) => (m === 'cascade'
  ? { name: `cascade ${INVENTION_JUDGE_CASCADE.fast}>${INVENTION_JUDGE_CASCADE.strong}`, fast: modelOf(INVENTION_JUDGE_CASCADE.fast), strong: modelOf(INVENTION_JUDGE_CASCADE.strong) }
  : { name: modelOf(m), fast: modelOf(m), strong: null }))
// The rewrite runs on the fast model, as in the worker.
const REWRITE_MODEL = modelOf(INVENTION_JUDGE_CASCADE.fast)
const MEASURE_ONLY = !!args['measure-only']
const SCRIPT_CONCURRENCY = Math.max(1, Number(args['script-concurrency'] ?? 2) || 2)
const DRY = !!args['dry-run']
if (!BATCHES.length && !args.dump) {
  console.error('usage: node scripts/eval/gate-calibrate.mjs --batch=<label>[,…] --labels=<file.csv> [--models=a,b] [--dry-run] [--dump=rows.json]')
  process.exit(2)
}

// ── labels ────────────────────────────────────────────────────────────────
export function readLabels(path) {
  return parseLabels(path ? readFileSync(path, 'utf8') : '')
}

export function parseLabels(text) {
  const out = new Map()
  if (!text) return out
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const head = lines.shift()?.toLowerCase().split(',').map((s) => s.trim()) ?? []
  const col = (name) => head.indexOf(name)
  const [cb, cn, ci, cl] = ['batch', 'n', 'sentence_i', 'label'].map(col)
  if ([cb, cn, ci, cl].some((x) => x < 0)) throw new Error('labels CSV needs columns batch,n,sentence_i,label')
  for (const l of lines) {
    const c = l.split(',').map((s) => s.trim())
    const label = (c[cl] ?? '').toUpperCase()
    if (!['S', 'E', 'I', 'N'].includes(label)) continue
    out.set(`${c[cb]}|${c[cn]}|${c[ci]}`, label)
  }
  return out
}

// ── statistics ────────────────────────────────────────────────────────────
/** 95% Wilson score interval for k successes of n. */
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0]
  const p = k / n
  const d = 1 + z * z / n
  const c = (p + z * z / (2 * n)) / d
  const h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d
  return [Math.max(0, c - h), Math.min(1, c + h)]
}
const pct = (x) => `${(100 * x).toFixed(1)}%`
const ci = ([a, b]) => `[${pct(a)}, ${pct(b)}]`

/** GitHub Actions annotation; only counts, rates and ids ever go in here. */
const notice = (msg) => { if (process.env.GITHUB_ACTIONS) console.log(`::notice title=gate-calibrate::${msg}`) }

// ── loading ───────────────────────────────────────────────────────────────
let dbClient = null
async function getDb() {
  if (dbClient) return dbClient
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dump=file and --labels=file)')
  dbClient = createClient(url, key, { auth: { persistSession: false } })
  return dbClient
}

/** Labels CSV text from a private test_run_files row, by id. Never printed. */
async function loadLabelsFile(id) {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) throw new Error('--labels-file-id must be a positive integer')
  const { data, error } = await (await getDb()).from('test_run_files').select('kind, content').eq('id', n).maybeSingle()
  if (error) throw error
  if (!data || !['ratings', 'other'].includes(data.kind)) throw new Error(`labels: test_run_files row ${n} not found or not kind=ratings/other`)
  return parseLabels(data.content)
}

async function loadLive() {
  const db = await getDb()
  const { data: res, error } = await db.from('script_batch_results').select('batch,n,generation_id,scenario')
    .in('batch', BATCHES).eq('status', 200).gte('n', 0).not('generation_id', 'is', null).order('batch').order('n')
  if (error) throw error
  const rows = []
  const productsByOwner = new Map()
  for (const r of res) {
    const { data: g, error: e1 } = await db.from('generations').select('id,user_id,blueprint,reference_note').eq('id', r.generation_id).maybeSingle()
    if (e1) throw e1
    if (!g?.blueprint) continue
    const { data: uses, error: e2 } = await db.from('creator_knowledge_uses').select('knowledge_id').eq('generation_id', g.id)
    if (e2) throw e2
    const ids = (uses ?? []).map((u) => u.knowledge_id).filter(Boolean)
    let knowledge = []
    if (ids.length) {
      const { data: k, error: e3 } = await db.from('creator_knowledge').select('id,kind,text').in('id', ids)
      if (e3) throw e3
      knowledge = k ?? []
    }
    if (!productsByOwner.has(g.user_id)) {
      const { data: p, error: e4 } = await db.from('product_entities').select('id,name,knowledge,offer').eq('owner_id', g.user_id).is('archived_at', null)
      if (e4) throw e4
      productsByOwner.set(g.user_id, p ?? [])
    }
    const body = r.scenario?.body ?? {}
    const target = typeof body.selected_product_id === 'string' && !body.selected_product_id.startsWith('brand:') ? body.selected_product_id : null
    const products = productsByOwner.get(g.user_id)
    rows.push({
      batch: r.batch, n: r.n, blueprint: g.blueprint, knowledge, products, note: g.reference_note ?? '',
      answers: body.readiness_answers ?? {}, target_product_id: target,
      offer: products.find((p) => p.id === target)?.offer ?? '',
    })
  }
  return rows
}

// Scripts run a few at a time (the worker runs one gate per job; inside a gate
// the judge chunks already run at concurrency 4). Each model call has its own
// timeout; the whole gate has the worker's budget.
const CALL_TIMEOUT_MS = 60_000
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i) }
  }))
  return out
}
const pctl = (xs, q) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))] }

// ── model call (same settings as the worker: temperature 0, judge thinking 0) ──
async function callModel(model, system, schema, prompt, thinkingBudget, used) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is required')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS)
  const send = async (budget) => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0, ...(budget === undefined ? {} : { thinkingConfig: { thinkingBudget: budget } }) },
      }),
    })
    const j = await res.json()
    if (!res.ok) throw new Error(`model ${res.status}: ${String(j?.error?.message ?? '').slice(0, 120)}`)
    return j
  }
  try {
    let j
    try { j = await send(thinkingBudget) } catch (e) {
      // Same fallback as the worker: a model that cannot switch thinking off gets the minimum.
      if (thinkingBudget === 0 && /thinking/i.test(String(e?.message ?? ''))) j = await send(128)
      else throw e
    }
    used.in += j?.usageMetadata?.promptTokenCount ?? 0
    used.out += j?.usageMetadata?.candidatesTokenCount ?? 0
    return j?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  } finally { clearTimeout(timer) }
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  const rows = args.dump ? JSON.parse(readFileSync(args.dump, 'utf8')).filter((r) => !BATCHES.length || BATCHES.includes(r.batch)) : await loadLive()
  const labels = typeof args['labels-file-id'] === 'string'
    ? await loadLabelsFile(args['labels-file-id'])
    : readLabels(typeof args.labels === 'string' ? args.labels : '')
  const prepared = rows.map((r) => {
    const products = (r.products ?? []).map((p) => ({ id: String(p.id ?? ''), name: String(p.name ?? '') })).filter((p) => p.id && p.name)
    const ledger = buildLedger({ knowledge: r.knowledge, answers: r.answers, note: r.note, products: r.products, targetProductId: r.target_product_id ?? null, offer: r.offer, now: Date.now() })
    const sentences = extractSentences(r.blueprint ?? {})
    return { r, products, ledger, sentences }
  }).filter((x) => x.sentences.length)

  // Dry run: what the fast pass would send (prefilter + chunks), no model call.
  let fastCalls = 0, judged = 0, prefiltered = 0, inTok = 0
  for (const x of prepared) {
    const pend = []
    for (const s of x.sentences) {
      const r = ruleRead(s, x.ledger, x.products, x.r.target_product_id ?? null)
      if (decidedByRule(s, r)) prefiltered++; else pend.push({ s, r })
    }
    judged += pend.length
    for (const g of chunk(pend)) {
      fastCalls++
      inTok += Math.ceil((buildJudgePrompt(g.map((y) => y.s), chunkLedger(g, x.ledger), x.products).length + JUDGE_SYSTEM.length) / 4)
    }
  }
  console.log(`scripts: ${prepared.length}  sentences: ${prepared.reduce((a, x) => a + x.sentences.length, 0)}  prefiltered by rule: ${prefiltered}  to judge: ${judged}  labelled: ${labels.size}`)
  console.log(`modes: ${MODES.map((m) => m.name).join(', ')}${MEASURE_ONLY ? '  (measure only, no repair)' : ''}`)
  console.log(`fast-pass judge calls per mode: ${fastCalls}  est. tokens ~${inTok} in / ~${judged * 30} out (plus escalations and rewrites)`)
  notice(`scripts ${prepared.length}, labelled sentences ${labels.size}${args['labels-file-id'] ? ` (labels row ${args['labels-file-id']})` : ''}; prefiltered ${prefiltered}, judged ${judged}; fast-pass calls ${fastCalls} per mode; est. tokens ~${inTok * MODES.length} in${DRY ? ' (dry run)' : ''}`)
  if (DRY) { console.log('dry run: no model called.'); return }

  for (const mode of MODES) {
    let tp = 0, fp = 0, fn = 0, tn = 0, labelledS = 0, falseIonS = 0, malformed = 0, failed = 0
    const used = { in: 0, out: 0 }
    const byClass = { S: 0, E: 0, I: 0, N: 0, G: 0 }
    const perfs = []
    const records = await mapLimit(prepared, SCRIPT_CONCURRENCY, async (x) => {
      const judgeWith = (model) => (p) => callModel(model, JUDGE_SYSTEM, JUDGE_SCHEMA, p, JUDGE_THINKING_BUDGET, used)
      const r = await runInventionGate({
        blueprint: x.r.blueprint, ledger: x.ledger, products: x.products, targetProductId: x.r.target_product_id ?? null,
        model: mode.name, measureOnly: MEASURE_ONLY, timeoutMs: INVENTION_RECHECK_TIMEOUT_MS,
      }, {
        judge: judgeWith(mode.fast),
        ...(mode.strong ? { judgeStrong: judgeWith(mode.strong) } : {}),
        rewrite: (p) => callModel(REWRITE_MODEL, REWRITE_SYSTEM, REWRITE_SCHEMA, p, undefined, used),
      })
      return r.record
    })
    for (const [k, x] of prepared.entries()) {
      const rec = records[k]
      if (rec.outcome === 'timeout' || rec.error) failed++
      malformed += rec.judge_malformed ?? 0
      if (rec.perf) perfs.push(rec.perf)
      for (const c of rec.sentences) {
        byClass[c.class]++
        const gold = labels.get(`${x.r.batch}|${x.r.n}|${c.i}`)
        if (!gold) continue
        const predI = c.class === 'I', goldI = gold === 'I'
        if (predI && goldI) tp++; else if (predI) fp++; else if (goldI) fn++; else tn++
        if (gold === 'S') { labelledS++; if (predI) falseIonS++ }
      }
    }
    const gateMs = records.map((r) => r.perf?.ms_total ?? r.ms)
    const chunkMs = perfs.flatMap((p) => p.chunk_ms)
    const calls = perfs.reduce((a, p) => a + p.judge_calls, 0)
    const esc = perfs.reduce((a, p) => a + p.escalations, 0)
    const jud = perfs.reduce((a, p) => a + p.judged, 0)
    const factual = byClass.S + byClass.E + byClass.I + byClass.G
    console.log(`\n== ${mode.name} ==`)
    console.log(`classes: S ${byClass.S}  E ${byClass.E}  I ${byClass.I}  G ${byClass.G}  N ${byClass.N}  invented rate on factual: ${factual ? pct(byClass.I / factual) : 'n/a'}  malformed: ${malformed}  failed/timeout: ${failed}`)
    console.log(`I precision: ${tp}/${tp + fp} = ${tp + fp ? pct(tp / (tp + fp)) : 'n/a'}  95% ${ci(wilson(tp, tp + fp))}`)
    console.log(`I recall:    ${tp}/${tp + fn} = ${tp + fn ? pct(tp / (tp + fn)) : 'n/a'}  95% ${ci(wilson(tp, tp + fn))}`)
    console.log(`false I on S-labelled: ${falseIonS}/${labelledS} = ${labelledS ? pct(falseIonS / labelledS) : 'n/a'}  95% ${ci(wilson(falseIonS, labelledS))}`)
    console.log(`confusion (I vs not-I): tp ${tp}  fp ${fp}  fn ${fn}  tn ${tn}   tokens used: ${used.in} in / ${used.out} out`)
    console.log(`WHOLE GATE per script: p50 ${pctl(gateMs, 0.5)} ms  p90 ${pctl(gateMs, 0.9)} ms  max ${Math.max(0, ...gateMs)} ms  (target p90 <= 30000)`)
    console.log(`judge calls: ${calls} (${prepared.length ? (calls / prepared.length).toFixed(1) : 0}/script)  per-call p50 ${pctl(chunkMs, 0.5)} ms p90 ${pctl(chunkMs, 0.9)} ms  escalated ${esc}/${jud} sentences`)
    const rate = (k, n) => `${k}/${n} = ${n ? pct(k / n) : 'n/a'} 95% ${ci(wilson(k, n))}`
    notice(`${mode.name}: I precision ${rate(tp, tp + fp)}; I recall ${rate(tp, tp + fn)}; false I on S ${rate(falseIonS, labelledS)}; whole gate ms p50 ${pctl(gateMs, 0.5)} p90 ${pctl(gateMs, 0.9)}; judge calls ${calls} (call ms p50 ${pctl(chunkMs, 0.5)} p90 ${pctl(chunkMs, 0.9)}); escalated ${esc}/${jud}; failed ${failed}; tokens ${used.in} in / ${used.out} out; malformed ${malformed}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
}
