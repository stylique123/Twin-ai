// Shared pieces for the two small paid evals (evalCraftJudgePairs, shadowRepeatCheck).
// Pure helpers (CSV, pairs, sampling, scoring, cost cap) have no I/O and are
// unit-tested in evalLib.selftest.mjs. Only callGemini touches the network, and
// only when a key is present and the cost guard allows it. Fixture data is fictional.
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

export const CALIB_DIR = 'packages/shared/src/script/__tests__/fixtures/calibration'

/** RFC-4180-ish CSV parser (quoted fields, "" escapes, newlines inside quotes). */
export function parseCsv(text) {
  const rows = []; let row = []; let f = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++ } else if (c === '"') q = false; else f += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some((x) => x !== '')) rows.push(row); row = [] }
    else f += c
  }
  if (f !== '' || row.length) { row.push(f); if (row.some((x) => x !== '')) rows.push(row) }
  const [head, ...body] = rows
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

/** "S07" in panel "P10" → "P10-07" (the id used by the rubric and ground truth). */
export const scriptKey = (panel, sid) => (String(sid).startsWith(`${panel}-`) ? String(sid) : `${panel}-${String(sid).replace(/^S/i, '').padStart(2, '0')}`)

export function splitLines(text) {
  return String(text).split(/\n+/).map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean)
}

export function loadCraftSet(root = process.cwd()) {
  return parseCsv(readFileSync(join(root, CALIB_DIR, 'craft-calibration-set.csv'), 'utf8')).map((r) => ({
    panel: r.panel, id: scriptKey(r.panel, r.script_id), craft: Number(r.craft_1_7), words: Number(r.words), text: r.script_text, lines: splitLines(r.script_text),
  }))
}

/** All unordered pairs inside one panel whose craft differs by at least minGap. A is always the first in input order. */
export function buildPairs(scripts, { panel, minGap = 1 } = {}) {
  const s = panel ? scripts.filter((x) => x.panel === panel) : scripts
  const out = []
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
    if (s[i].panel !== s[j].panel) continue
    const gap = Math.abs(s[i].craft - s[j].craft)
    if (gap >= minGap) out.push({ a: s[i], b: s[j], gap, better: s[i].craft > s[j].craft ? 'A' : 'B' })
  }
  return out
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
  let t = seed >>> 0
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296 }
}
export function shuffle(arr, rand) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

/** Up to `max` pairs, spread across gaps round-robin (largest gap bucket last so small gaps are not starved). */
export function sampleByGap(pairs, max, seed = 1) {
  if (!(max > 0) || pairs.length <= max) return pairs.slice()
  const rand = rng(seed)
  const buckets = new Map()
  for (const p of shuffle(pairs, rand)) { if (!buckets.has(p.gap)) buckets.set(p.gap, []); buckets.get(p.gap).push(p) }
  const keys = [...buckets.keys()].sort((x, y) => x - y)
  const out = []
  while (out.length < max) {
    let took = false
    for (const k of keys) { const b = buckets.get(k); if (b.length && out.length < max) { out.push(b.shift()); took = true } }
    if (!took) break
  }
  return out
}

/**
 * Score pairwise verdicts. Each result: { gap, correct } where correct is 1, 0 or 0.5 (tie / split
 * across the two orders). Returns accuracy for gap>=1, gap>=2 and per exact gap.
 */
export function pairAccuracy(results) {
  const acc = (rs) => (rs.length ? rs.reduce((s, r) => s + r.correct, 0) / rs.length : null)
  const byGap = {}
  for (const g of [...new Set(results.map((r) => r.gap))].sort((x, y) => x - y)) { const rs = results.filter((r) => r.gap === g); byGap[g] = { n: rs.length, acc: acc(rs) } }
  const ge2 = results.filter((r) => r.gap >= 2)
  return { n: results.length, gap1: acc(results), n2: ge2.length, gap2: acc(ge2), byGap }
}

/** Combine the two orders: verdicts are the label picked in each presentation ('A'|'B'|null). */
export function combineOrders(pair, vFwd, vSwap) {
  // forward: A=pair.a. swapped: A=pair.b.
  const pickF = vFwd === 'A' ? 'a' : vFwd === 'B' ? 'b' : null
  const pickS = vSwap === 'A' ? 'b' : vSwap === 'B' ? 'a' : null
  const truth = pair.better === 'A' ? 'a' : 'b'
  const score = (p) => (p == null ? 0.5 : p === truth ? 1 : 0)
  return { gap: pair.gap, correct: (score(pickF) + score(pickS)) / 2, consistent: pickF != null && pickF === pickS }
}

/** Pairwise accuracy for any numeric scorer (higher = better). Ties score 0.5. */
export function scorerPairAccuracy(pairs, scoreFn) {
  return pairAccuracy(pairs.map((p) => {
    const sa = scoreFn(p.a), sb = scoreFn(p.b)
    const truth = p.better === 'A' ? 1 : -1
    const d = Math.sign(sa - sb)
    return { gap: p.gap, correct: d === 0 ? 0.5 : d === truth ? 1 : 0 }
  }))
}

// ---- cost -------------------------------------------------------------------
/** Per-1M prices; mirror supabase/migrations/0287_ai_model_prices.sql (UNCONFIRMED there too). */
export const PRICES = {
  'gemini-3.8-flash': { in: 0.75, out: 3.75 },
  'gemini-3.7-flash': { in: 0.75, out: 3.75 },
  'gemini-3.5-flash': { in: 1.5, out: 9.0 },
  'gemini-3.1-pro-preview': { in: 2.0, out: 12.0 },
}
export const estTokens = (s) => Math.ceil(String(s).length / 4)
export function usd(model, inTok, outTok) {
  const p = PRICES[model]; if (!p) throw new Error(`no price for ${model}; add it to PRICES`)
  return (inTok * p.in + outTok * p.out) / 1e6
}

/** Hard cap: check(next) refuses any call whose worst-case cost would push spend past the cap. */
export function costGuard(capUsd) {
  let spent = 0
  return {
    get spent() { return spent },
    cap: capUsd,
    allows(worstCaseUsd) { return spent + worstCaseUsd <= capUsd },
    add(x) { spent += x },
  }
}

/** --out=<path>: write a JSON of ids, gaps, verdict letters and scores only (never script text,
 *  prompts or model reasons). Used by .github/workflows/judge-evals.yml as the only artifact. */
export function writeResultsJson(argv, obj) {
  const a = argv.find((x) => x.startsWith('--out='))
  if (!a) return
  writeFileSync(a.slice(6), JSON.stringify(obj, null, 2) + '\n')
}

export function capFromEnv(name, def = 0.15) {
  const v = process.env[name]; const n = v == null || v === '' ? def : Number(v)
  if (!(n > 0) || n > 1) throw new Error(`${name} must be in (0, 1] USD; got ${v}`)
  return n
}

export function cheapModel(root = process.cwd()) {
  if (process.env.EVAL_MODEL) return process.env.EVAL_MODEL
  try { return JSON.parse(readFileSync(join(root, 'worker', 'model_routing_v1.json'), 'utf8')).taskClasses.read.model } catch { return 'gemini-3.8-flash' }
}

/** One Gemini call. Returns { text, inTok, outTok } (usage from the API when given). */
export async function callGemini({ model, system, user, maxOut = 64, json = false }) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY missing: refusing to call a model')
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0, maxOutputTokens: maxOut, thinkingConfig: { thinkingBudget: 0 }, ...(json ? { responseMimeType: 'application/json' } : {}) },
  }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`gemini ${r.status}`)
  const j = await r.json()
  const u = j.usageMetadata ?? {}
  return {
    text: j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '',
    inTok: u.promptTokenCount ?? estTokens(system + user),
    outTok: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
  }
}

/** Bundle craftJudge.ts (it imports .js siblings) so a plain node script can use it. */
export async function loadCraftJudge(root = process.cwd()) {
  const out = join(root, 'scripts/ops/.craftJudge.bundle.mjs')
  if (!existsSync(out)) {
    const bin = join(root, 'node_modules/.bin/esbuild')
    execFileSync(bin, [join(root, 'packages/shared/src/script/craftJudge.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`], { stdio: 'ignore' })
  }
  return import(out)
}

export const fmtPct = (x) => (x == null ? 'n/a' : `${(100 * x).toFixed(1)}%`)

// ---- repeat check -------------------------------------------------------------
/** "lines 1 and 3", "lines 1 to 3", "told three times" → expected line numbers (may be empty). */
export function truthLines(note) {
  const m = /lines?\s+(\d+)\s+(and|to)\s+(\d+)/i.exec(note)
  if (!m) return []
  const a = Number(m[1]), b = Number(m[3])
  if (m[2].toLowerCase() === 'to') return Array.from({ length: b - a + 1 }, (_, i) => a + i)
  return [a, b]
}

/** Parse the model's repeat JSON into [[i,j],...] 1-based line pairs (i<j), dropping junk. */
export function parseRepeatPairs(text, nLines) {
  let j
  try { j = JSON.parse(String(text).replace(/^```(json)?|```$/g, '').trim()) } catch { return null }
  const arr = Array.isArray(j) ? j : j?.repeats
  if (!Array.isArray(arr)) return null
  const out = []
  for (const r of arr) {
    const a = Number(r?.earlier ?? r?.[0]), b = Number(r?.later ?? r?.[1])
    const v = r?.verdict ?? 'pure_repeat'
    if (v !== 'pure_repeat') continue
    if (Number.isInteger(a) && Number.isInteger(b) && a >= 1 && b <= nLines && a < b) out.push([a, b])
  }
  return out
}

/** Recall on the ground-truth ids and the extra hits (ids flagged but not in the truth set). */
export function repeatRecall(truthIds, flagged) {
  const t = new Set(truthIds); const f = new Set(flagged)
  const hit = [...t].filter((x) => f.has(x))
  return { n: t.size, hit: hit.length, recall: t.size ? hit.length / t.size : null, missed: [...t].filter((x) => !f.has(x)), extra: [...f].filter((x) => !t.has(x)) }
}
