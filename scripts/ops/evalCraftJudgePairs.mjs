#!/usr/bin/env node
// PAIRWISE craft judge eval (owner-approved, small, paid). Fictional calibration data only.
//   node scripts/ops/evalCraftJudgePairs.mjs --dry-run      count calls + estimated cost, no network
//   node scripts/ops/evalCraftJudgePairs.mjs --rule-only    free: rule-based craftJudge pairwise accuracy on P10
//   GEMINI_API_KEY=... node scripts/ops/evalCraftJudgePairs.mjs   paid run (hard cap EVAL_CRAFT_CAP_USD, default 0.15)
// Pairs: same panel, craft differs >= 1. Test panel P10 only. The prompt = rubric (P10 example
// lines removed, since P10 is the test set) + 6 few-shot scripts drawn ONLY from P5-P8.
// Every pair is asked in both orders (A/B swapped) to cancel position bias; the first order is random.
// Options: --max-pairs=N (default: as many as the cap affords), --seed=N, --model=ID,
//   --out=FILE (JSON of ids/gaps/verdicts/scores only; the workflow uploads only this file).
// Prints ids, gaps and scores only; never script text.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CALIB_DIR, loadCraftSet, buildPairs, sampleByGap, rng, combineOrders, pairAccuracy, scorerPairAccuracy,
  estTokens, usd, costGuard, capFromEnv, cheapModel, callGemini, loadCraftJudge, fmtPct, writeResultsJson,
} from './evalLib.mjs'

const TEST_PANEL = 'P10'
const SHOT_PANELS = ['P5', 'P6', 'P7', 'P8']
const MAX_OUT = 16

/** Rubric text with every line that cites a P10 script removed (P10 is the test set). */
export function rubricForPrompt(md) {
  return md.split('\n').filter((l) => !/\bP10\b/.test(l)).join('\n')
}

/** 6 shots from P5-P8: the two the rubric names (P8-09, P8-03) + the best and worst of P5-P7 not yet chosen. */
export function pickShots(scripts) {
  const pool = scripts.filter((s) => SHOT_PANELS.includes(s.panel))
  const byId = new Map(pool.map((s) => [s.id, s]))
  const chosen = ['P8-09', 'P8-03'].map((id) => byId.get(id)).filter(Boolean)
  const rest = pool.filter((s) => s.panel !== 'P8' && !chosen.includes(s)).sort((a, b) => b.craft - a.craft || a.id.localeCompare(b.id))
  const hi = rest.slice(0, 2), lo = rest.slice(-2).reverse()
  for (const s of [...hi, ...lo]) if (chosen.length < 6 && !chosen.includes(s)) chosen.push(s)
  if (chosen.some((s) => s.panel === TEST_PANEL)) throw new Error('few-shot leak: a P10 script is in the prompt')
  return chosen
}

export function systemPrompt(rubric, shots) {
  const ex = shots.map((s) => `### Example ${s.id} (craft ${s.craft} of 7)\n${s.lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`).join('\n\n')
  return `You judge short-form video scripts by craft, using this rubric.\n\n${rubric}\n\n## Rated examples\n\n${ex}\n\nYou will see two scripts, A and B. Reply with exactly one letter: A or B, whichever has better craft by the rubric. No other text.`
}
export function userPrompt(x, y) {
  const f = (s) => s.lines.map((l, i) => `${i + 1}. ${l}`).join('\n')
  return `Script A:\n${f(x)}\n\nScript B:\n${f(y)}\n\nWhich has better craft, A or B?`
}
export function parseVerdict(t) { const m = /\b([AB])\b/.exec(String(t).trim().toUpperCase()); return m ? m[1] : null }

function arg(name, def) { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=')[1] : def }

async function main() {
  const root = process.cwd()
  const dry = process.argv.includes('--dry-run')
  const ruleOnly = process.argv.includes('--rule-only')
  const model = arg('model', cheapModel(root))
  const seed = Number(arg('seed', '7'))
  const cap = capFromEnv('EVAL_CRAFT_CAP_USD', 0.15)
  const scripts = loadCraftSet(root)
  const all = buildPairs(scripts, { panel: TEST_PANEL, minGap: 1 })

  // Free baseline: the rule-based judge on every P10 pair.
  const cj = await loadCraftJudge(root)
  const rule = scorerPairAccuracy(all, (s) => cj.scoreCraft(s.lines).raw)
  const ruleRub = scorerPairAccuracy(all, (s) => cj.scoreCraft(s.lines).rubric)
  const show = (name, r) => {
    console.log(`${name}: n=${r.n} acc(gap>=1)=${fmtPct(r.gap1)}  n2=${r.n2} acc(gap>=2)=${fmtPct(r.gap2)}  targets 70% / 85%`)
    console.log(`  by gap: ${Object.entries(r.byGap).map(([g, v]) => `${g}:${fmtPct(v.acc)} (n=${v.n})`).join('  ')}`)
  }
  show('rule-based craftJudge (raw score)', rule)
  show('rule-based craftJudge (rubric sum)', ruleRub)
  const acc = (r) => ({ n: r.n, gap1: r.gap1, n2: r.n2, gap2: r.gap2 })
  const out = { eval: 'craft-pairs', mode: ruleOnly ? 'rule-only' : dry ? 'dry-run' : 'paid', rule_raw: acc(rule), rule_rubric: acc(ruleRub) }
  if (ruleOnly) return writeResultsJson(process.argv, out)

  const rubric = rubricForPrompt(readFileSync(join(root, CALIB_DIR, 'craft-rubric-v1.md'), 'utf8'))
  const shots = pickShots(scripts)
  const sys = systemPrompt(rubric, shots)
  const perCall = (p) => usd(model, estTokens(sys + userPrompt(p.a, p.b)) + 8, MAX_OUT)
  const avg = all.reduce((s, p) => s + perCall(p), 0) / all.length
  const affordable = Math.floor(cap / avg / 2)
  const maxPairs = Number(arg('max-pairs', String(affordable)))
  const pairs = sampleByGap(all, maxPairs, seed)
  const est = pairs.reduce((s, p) => s + 2 * perCall(p), 0)
  console.log(`model=${model} shots=${shots.map((s) => s.id).join(',')} system~${estTokens(sys)} tok`)
  console.log(`P10 pairs: all=${all.length} (gap>=2: ${all.filter((p) => p.gap >= 2).length}); full set would be ${2 * all.length} calls ~$${(2 * all.length * avg).toFixed(3)}`)
  console.log(`this run: ${pairs.length} pairs x 2 orders = ${2 * pairs.length} calls, est ~$${est.toFixed(4)} (cap $${cap})`)
  Object.assign(out, { model, cap_usd: cap, shots: shots.map((s) => s.id), planned_pairs: pairs.map((p) => [p.a.id, p.b.id]), est_usd: est })
  if (dry) return writeResultsJson(process.argv, out)
  if (!process.env.GEMINI_API_KEY) { console.error('refusing: GEMINI_API_KEY not set (use --dry-run or --rule-only)'); process.exit(2) }

  const guard = costGuard(cap)
  const rand = rng(seed + 1)
  const results = []
  const rows = []
  let stopped = false
  for (const p of pairs) {
    const worst = 2 * perCall(p) * 1.25
    if (!guard.allows(worst)) { stopped = true; break }
    const swapFirst = rand() < 0.5
    const orders = swapFirst ? [[p.b, p.a, 'swap'], [p.a, p.b, 'fwd']] : [[p.a, p.b, 'fwd'], [p.b, p.a, 'swap']]
    const v = {}
    for (const [x, y, tag] of orders) {
      const r = await callGemini({ model, system: sys, user: userPrompt(x, y), maxOut: MAX_OUT })
      guard.add(usd(model, r.inTok, r.outTok))
      v[tag] = parseVerdict(r.text)
    }
    const c = combineOrders(p, v.fwd, v.swap)
    results.push(c)
    rows.push({ a: p.a.id, b: p.b.id, gap: p.gap, truth: p.better, fwd: v.fwd, swap: v.swap, correct: c.correct })
    console.log(`${p.a.id} vs ${p.b.id} gap=${p.gap} truth=${p.better} fwd=${v.fwd} swap=${v.swap} correct=${c.correct}`)
  }
  const s = pairAccuracy(results)
  if (stopped) console.log(`STOPPED at cost cap after ${results.length} pairs`)
  show(`LLM pairwise (${model})`, s)
  console.log(`order-consistent: ${results.filter((r) => r.consistent).length}/${results.length}  spent ~$${guard.spent.toFixed(4)}`)
  writeResultsJson(process.argv, { ...out, stopped_at_cap: stopped, pairs: rows, llm: acc(s), order_consistent: results.filter((r) => r.consistent).length, spent_usd: guard.spent })
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
