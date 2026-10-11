#!/usr/bin/env node
// ZERO-INVENTION GATE — OFFLINE CALIBRATION (design v1 A7; owner amendments a, b).
//
// Re-runs the gate's classifier (rules + model judge, NO repair, NO
// generation) on scripts that already exist, and compares its I calls with an
// INDEPENDENTLY LABELLED set fed in from a CSV. Read-only: it SELECTs and calls
// the judge model; it writes nothing. It prints counts, rates and ids only —
// never script or knowledge text.
//
//   node scripts/eval/gate-calibrate.mjs --batch=<label>[,<label>] \
//        (--labels=<labels.csv> | --labels-file-id=<test_run_files id>) \
//        [--models=read,extract] [--dry-run] [--dump=<rows.json>]
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
  buildLedger, extractSentences, buildJudgePrompt, parseJudge, classifySentences,
  JUDGE_SYSTEM, JUDGE_SCHEMA, INVENTION_JUDGE_TASKS,
} from '../../packages/shared/src/script/inventionGate.ts'

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/)
  return m ? [m[1], m[2] ?? true] : [a, true]
}))
const BATCHES = typeof args.batch === 'string' ? args.batch.split(',').map((s) => s.trim()).filter(Boolean) : []
// --models takes task classes of the routing catalog (read, extract) or model ids.
const ROUTING = JSON.parse(readFileSync(new URL('../../worker/model_routing_v1.json', import.meta.url), 'utf8')).taskClasses ?? {}
const MODELS = (typeof args.models === 'string' ? args.models.split(',').map((s) => s.trim()).filter(Boolean) : [...INVENTION_JUDGE_TASKS])
  .map((m) => ROUTING[m]?.model ?? m)
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

// Calls run in parallel (the sequential run hit the 20-minute job limit on
// 13 Oct); each call has its own timeout and a failed call counts as malformed.
const JUDGE_CONCURRENCY = 6
const JUDGE_CALL_TIMEOUT_MS = 150_000
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i) }
  }))
  return out
}
const pctl = (xs, q) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))] }

// ── judge ─────────────────────────────────────────────────────────────────
async function callJudge(model, prompt) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is required')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), JUDGE_CALL_TIMEOUT_MS)
  const t0 = Date.now()
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', signal: ctrl.signal,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: JUDGE_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: JUDGE_SCHEMA, temperature: 0 },
    }),
  })
  const j = await res.json().finally(() => clearTimeout(timer))
  return {
    ms: Date.now() - t0,
    text: j?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '',
    tokens: { in: j?.usageMetadata?.promptTokenCount ?? 0, out: j?.usageMetadata?.candidatesTokenCount ?? 0 },
  }
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
    return { r, products, ledger, sentences, prompt: buildJudgePrompt(sentences, ledger, products) }
  }).filter((x) => x.sentences.length)

  const calls = prepared.length * MODELS.length
  const inTok = prepared.reduce((a, x) => a + Math.ceil((x.prompt.length + JUDGE_SYSTEM.length) / 4), 0)
  const outTok = prepared.reduce((a, x) => a + x.sentences.length * 30, 0)
  console.log(`scripts: ${prepared.length}  sentences: ${prepared.reduce((a, x) => a + x.sentences.length, 0)}  labelled: ${labels.size}`)
  console.log(`models: ${MODELS.join(', ')}`)
  console.log(`judge calls: ${calls}  est. tokens per model: ~${inTok} in / ~${outTok} out  (total ~${inTok * MODELS.length} in / ~${outTok * MODELS.length} out)`)
  notice(`scripts ${prepared.length}, labelled sentences ${labels.size}${args['labels-file-id'] ? ` (labels row ${args['labels-file-id']})` : ''}; judge calls ${calls}; est. tokens ~${inTok * MODELS.length} in / ~${outTok * MODELS.length} out${DRY ? ' (dry run)' : ''}`)
  if (DRY) { console.log('dry run: no judge called.'); return }

  for (const model of MODELS) {
    let tp = 0, fp = 0, fn = 0, tn = 0, labelledS = 0, falseIonS = 0, used = { in: 0, out: 0 }, malformed = 0
    const byClass = { S: 0, E: 0, I: 0, N: 0 }
    const results = await mapLimit(prepared, JUDGE_CONCURRENCY, (x) => callJudge(model, x.prompt).catch(() => ({ text: '', tokens: { in: 0, out: 0 }, ms: JUDGE_CALL_TIMEOUT_MS, failed: true })))
    const msList = results.map((r) => r.ms)
    const failed = results.filter((r) => r.failed).length
    for (const [k, x] of prepared.entries()) {
      const { text, tokens } = results[k]
      used.in += tokens.in; used.out += tokens.out
      const parsed = parseJudge(text, x.sentences.length, new Set(x.ledger.map((it) => it.id)))
      malformed += parsed.malformed
      const cs = classifySentences({ sentences: x.sentences, ledger: x.ledger, products: x.products, targetProductId: x.r.target_product_id ?? null, judge: parsed.verdicts })
      for (const c of cs) {
        byClass[c.class]++
        const gold = labels.get(`${x.r.batch}|${x.r.n}|${c.i}`)
        if (!gold) continue
        const predI = c.class === 'I', goldI = gold === 'I'
        if (predI && goldI) tp++; else if (predI) fp++; else if (goldI) fn++; else tn++
        if (gold === 'S') { labelledS++; if (predI) falseIonS++ }
      }
    }
    const factual = byClass.S + byClass.E + byClass.I
    console.log(`\n== ${model} ==`)
    console.log(`classes: S ${byClass.S}  E ${byClass.E}  I ${byClass.I}  N ${byClass.N}  invented rate on factual: ${factual ? pct(byClass.I / factual) : 'n/a'}  malformed: ${malformed}`)
    console.log(`I precision: ${tp}/${tp + fp} = ${tp + fp ? pct(tp / (tp + fp)) : 'n/a'}  95% ${ci(wilson(tp, tp + fp))}`)
    console.log(`I recall:    ${tp}/${tp + fn} = ${tp + fn ? pct(tp / (tp + fn)) : 'n/a'}  95% ${ci(wilson(tp, tp + fn))}`)
    console.log(`false I on S-labelled: ${falseIonS}/${labelledS} = ${labelledS ? pct(falseIonS / labelledS) : 'n/a'}  95% ${ci(wilson(falseIonS, labelledS))}`)
    console.log(`confusion (I vs not-I): tp ${tp}  fp ${fp}  fn ${fn}  tn ${tn}   tokens used: ${used.in} in / ${used.out} out`)
    const rate = (k, n) => `${k}/${n} = ${n ? pct(k / n) : 'n/a'} 95% ${ci(wilson(k, n))}`
    notice(`${model}: I precision ${rate(tp, tp + fp)}; I recall ${rate(tp, tp + fn)}; false I on S ${rate(falseIonS, labelledS)}; judge calls ${prepared.length} (failed ${failed}); judge ms p50 ${pctl(msList, 0.5)} p90 ${pctl(msList, 0.9)}; tokens ${used.in} in / ${used.out} out; malformed ${malformed}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
}
