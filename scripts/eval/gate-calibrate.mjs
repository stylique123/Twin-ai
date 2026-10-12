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
// THE SAME INPUT AS THE WORKER (v3): answers, outside board, offer, target
// product and measure-only are read from the generation's `invention_recheck`
// job payload (what the edge handed the worker), falling back to the scenario.
// Model calls retry 429/5xx like worker/src/gemini.ts.
//
// REPORT (counts only): the full confusion matrix gate {S,E,I,G,N,X=failed} x
// advisor {S,E,I,N}, the owner's metrics split by tune (n 0-11) and validation
// (n 12-23) half, recall misses by surface, failed-call error classes, and
// per-script gate ms with judge calls, escalations and rounds.
// --dump-row stores per-sentence {batch,n,i,surface,cls,reason,label} (NO
// text) in a private test_run_files row and prints only its id.
//
// --dry-run prints how many judge calls and roughly how many tokens a run
// would use, and calls nothing. --dump reads the joined rows from a JSON file
// ([{batch,n,blueprint,knowledge,products,note,answers,target_product_id}])
// instead of the database.
import { readFileSync } from 'node:fs'
import {
  buildLedger, extractSentences, pendingForJudge, errorClass, chunk, chunkLedger, buildJudgePrompt, runInventionGate,
  JUDGE_SYSTEM, JUDGE_SCHEMA, REWRITE_SYSTEM, REWRITE_SCHEMA, JUDGE_THINKING_BUDGET, INVENTION_JUDGE_CASCADE,
  INVENTION_RECHECK_TIMEOUT_MS,
} from '../../packages/shared/src/script/inventionGate.ts'
import { formatReport } from './gateScore.mjs'

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
    // What the edge handed the worker for this generation (the worker's ledger input).
    const { data: jobs, error: e5 } = await db.from('jobs').select('payload').eq('type', 'invention_recheck').eq('payload->>generation_id', g.id).order('created_at', { ascending: false }).limit(1)
    if (e5) throw e5
    const led = jobs?.[0]?.payload?.ledger ?? null
    const fromBody = typeof body.selected_product_id === 'string' && !body.selected_product_id.startsWith('brand:') ? body.selected_product_id : null
    const target = led ? (typeof led.target_product_id === 'string' && led.target_product_id ? led.target_product_id : null) : fromBody
    const products = productsByOwner.get(g.user_id)
    rows.push({
      batch: r.batch, n: r.n, blueprint: g.blueprint, knowledge, products, note: g.reference_note ?? '',
      answers: led?.answers ?? body.readiness_answers ?? {}, target_product_id: target,
      offer: typeof led?.offer === 'string' ? led.offer : (products.find((p) => p.id === target)?.offer ?? ''),
      outside: Array.isArray(led?.outside) ? led.outside : [],
      measure_only: led?.measure_only === true,
      worker_payload: !!led,
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
  // v4: one deadline PER ATTEMPT. A single controller shared by the retries
  // aborted the retry after a 429 back-off (the live 'abort' failures).
  const send = async (budget) => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS)
    try { return await sendOnce(budget, ctrl) } finally { clearTimeout(timer) }
  }
  const sendOnce = async (budget, ctrl) => {
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
  const sendRetry = async (budget) => {
    // Same policy as worker/src/gemini.ts: a 429 or 5xx is retried (3 attempts, backoff).
    for (let attempt = 0; ; attempt++) {
      try { return await send(budget) } catch (e) {
        const st = Number(String(e?.message ?? '').match(/^model (\d{3})/)?.[1] ?? 0)
        if (attempt < 2 && (st === 429 || st >= 500)) { await new Promise((r) => setTimeout(r, (st === 429 ? 4000 : 1000) * (attempt + 1) * (attempt + 1))); continue }
        throw e
      }
    }
  }
  try {
    let j
    try { j = await sendRetry(thinkingBudget) } catch (e) {
      // Same fallback as the worker: a model that cannot switch thinking off gets the minimum.
      if (thinkingBudget === 0 && /thinking/i.test(String(e?.message ?? ''))) j = await sendRetry(128)
      else { used.errors[errorClass(e)] = (used.errors[errorClass(e)] ?? 0) + 1; throw e }
    }
    used.in += j?.usageMetadata?.promptTokenCount ?? 0
    used.out += j?.usageMetadata?.candidatesTokenCount ?? 0
    return j?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  } finally { /* each attempt clears its own timer */ }
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  const rows = args.dump ? JSON.parse(readFileSync(args.dump, 'utf8')).filter((r) => !BATCHES.length || BATCHES.includes(r.batch)) : await loadLive()
  const labels = typeof args['labels-file-id'] === 'string'
    ? await loadLabelsFile(args['labels-file-id'])
    : readLabels(typeof args.labels === 'string' ? args.labels : '')
  const prepared = rows.map((r) => {
    const products = (r.products ?? []).map((p) => ({ id: String(p.id ?? ''), name: String(p.name ?? '') })).filter((p) => p.id && p.name)
    const ledger = buildLedger({ knowledge: r.knowledge, answers: r.answers, note: r.note, products: r.products, targetProductId: r.target_product_id ?? null, offer: r.offer, outside: r.outside ?? [], now: Date.now() })
    const sentences = extractSentences(r.blueprint ?? {})
    return { r, products, ledger, sentences }
  }).filter((x) => x.sentences.length)

  // Dry run: what the fast pass would send (prefilter + chunks), no model call.
  let fastCalls = 0, judged = 0, prefiltered = 0, inTok = 0
  for (const x of prepared) {
    // The worker's own prefilter (rules, v2 fragment inheritance, list counts).
    const pend = pendingForJudge(x.sentences, x.ledger, x.products, x.r.target_product_id ?? null)
    prefiltered += x.sentences.length - pend.length
    judged += pend.length
    for (const g of chunk(pend)) {
      fastCalls++
      inTok += Math.ceil((buildJudgePrompt(g.map((y) => y.s), chunkLedger(g, x.ledger), x.products).length + JUDGE_SYSTEM.length) / 4)
    }
  }
  console.log(`worker payload found for ${prepared.filter((x) => x.r.worker_payload).length}/${prepared.length} scripts; measure-only per payload: ${prepared.filter((x) => x.r.measure_only).length}`)
  console.log(`scripts: ${prepared.length}  sentences: ${prepared.reduce((a, x) => a + x.sentences.length, 0)}  prefiltered by rule: ${prefiltered}  to judge: ${judged}  labelled: ${labels.size}`)
  console.log(`modes: ${MODES.map((m) => m.name).join(', ')}${MEASURE_ONLY ? '  (measure only, no repair)' : ''}`)
  console.log(`fast-pass judge calls per mode: ${fastCalls}  est. tokens ~${inTok} in / ~${judged * 30} out (plus escalations and rewrites)`)
  notice(`scripts ${prepared.length}, labelled sentences ${labels.size}${args['labels-file-id'] ? ` (labels row ${args['labels-file-id']})` : ''}; prefiltered ${prefiltered}, judged ${judged}; fast-pass calls ${fastCalls} per mode; est. tokens ~${inTok * MODES.length} in${DRY ? ' (dry run)' : ''}`)
  if (DRY) { console.log('dry run: no model called.'); return }

  for (const mode of MODES) {
    let tp = 0, fp = 0, fn = 0, tn = 0, labelledS = 0, falseIonS = 0, malformed = 0, failed = 0
    const used = { in: 0, out: 0, errors: {} }
    const byClass = { S: 0, E: 0, I: 0, N: 0, G: 0 }
    const perfs = []
    const records = await mapLimit(prepared, SCRIPT_CONCURRENCY, async (x) => {
      const judgeWith = (model) => (p) => callModel(model, JUDGE_SYSTEM, JUDGE_SCHEMA, p, JUDGE_THINKING_BUDGET, used)
      const r = await runInventionGate({
        blueprint: x.r.blueprint, ledger: x.ledger, products: x.products, targetProductId: x.r.target_product_id ?? null,
        model: mode.name, measureOnly: MEASURE_ONLY || x.r.measure_only === true, timeoutMs: INVENTION_RECHECK_TIMEOUT_MS,
      }, {
        judge: judgeWith(mode.fast),
        ...(mode.strong ? { judgeStrong: judgeWith(mode.strong) } : {}),
        rewrite: (p) => callModel(REWRITE_MODEL, REWRITE_SYSTEM, REWRITE_SCHEMA, p, undefined, used),
      })
      return r.record
    })
    const sentRows = []
    const scriptLines = []
    const failReasons = {}
    for (const [k, x] of prepared.entries()) {
      const rec = records[k]
      const byI = new Map(rec.sentences.map((c) => [c.i, c]))
      for (const s of x.sentences) {
        const c = byI.get(s.i)
        sentRows.push({ batch: x.r.batch, n: x.r.n, i: s.i, surface: s.surface, cls: c ? c.class : 'X', reason: c ? c.reason : (rec.error ?? (rec.timed_out ? 'timeout' : 'none')), label: labels.get(`${x.r.batch}|${x.r.n}|${s.i}`) ?? null })
      }
      const p = rec.perf ?? {}
      scriptLines.push(`  n=${x.r.n} ms=${p.ms_total ?? rec.ms} calls=${p.judge_calls ?? 0} esc=${p.escalations ?? 0} fast_failed=${p.fast_failed ?? 0} rounds=${rec.rounds} outcome=${rec.outcome}${rec.error ? ` error=${rec.error}` : ''}${rec.timed_out ? ' timed_out' : ''}`)
      if (rec.outcome === 'timeout' || rec.error) { const k2 = rec.timed_out ? 'timeout' : rec.error; failReasons[k2] = (failReasons[k2] ?? 0) + 1 }
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
    console.log(`failed scripts by error class: ${JSON.stringify(failReasons)}; failed model calls by error class (after retries): ${JSON.stringify(used.errors)}`)
    console.log(`per-script gate (ms, judge calls, escalations, rounds):\n${scriptLines.join('\n')}`)
    console.log(formatReport(mode.name, sentRows))
    if (args['dump-row']) {
      const content = JSON.stringify({ mode: mode.name, batches: BATCHES, rows: sentRows })
      const { createHash } = await import('node:crypto')
      const { data, error } = await (await getDb()).from('test_run_files').insert({ label: `gate-calibrate-rows-${BATCHES.join('+')}`, kind: 'other', file_name: 'gate-calibrate-rows.json', sha256: createHash('sha256').update(content).digest('hex'), content }).select('id').single()
      if (error) throw error
      console.log(`per-sentence rows stored in test_run_files row ${data.id}`)
      notice(`${mode.name}: per-sentence rows in test_run_files row ${data.id}`)
    }
    const rate = (k, n) => `${k}/${n} = ${n ? pct(k / n) : 'n/a'} 95% ${ci(wilson(k, n))}`
    notice(`${mode.name}: I precision ${rate(tp, tp + fp)}; I recall ${rate(tp, tp + fn)}; false I on S ${rate(falseIonS, labelledS)}; whole gate ms p50 ${pctl(gateMs, 0.5)} p90 ${pctl(gateMs, 0.9)}; judge calls ${calls} (call ms p50 ${pctl(chunkMs, 0.5)} p90 ${pctl(chunkMs, 0.9)}); escalated ${esc}/${jud}; failed ${failed}; tokens ${used.in} in / ${used.out} out; malformed ${malformed}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
}
