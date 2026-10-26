#!/usr/bin/env node
// PRACTICE-VIEWER (PERSONA) CALIBRATION HARNESS (plan v6.8 §34.3).
//
// The practice viewers (worker/src/nicheBrain/audience.ts, and the VIEWER PANEL
// in scriptBatch.mjs's reviewer) may only influence selection once each one is
// CALIBRATED against the advisor's labels:
//   - hook-calibration-set.csv  (rated hooks, scroll_1_5)
//   - craft-calibration-set.csv (craft-rated scripts, craft_1_7)
// in packages/shared/src/script/__tests__/fixtures/calibration/.
// The gate itself is in code: realisticPanel.ts personaMayInfluence (r ≥ 0.5 on
// BOTH sets) and selectWithPersonas (the honesty gate is never overridden).
//
// ⚠️ PREPARED, NOT RUN. It needs AI calls and the AI is paused. The default is a
// DRY RUN that prints the plan and the budget estimate and calls nothing.
//
//   node scripts/ops/personaCalibration.mjs                 # dry run: counts + budget
//   node scripts/ops/personaCalibration.mjs --scores=f.json # offline: correlations from saved persona scores
//   node scripts/ops/personaCalibration.mjs --run           # LIVE (when the AI returns): needs
//        GEMINI_API_KEY, PERSONA_CALIBRATION_CAP_USD ≥ the estimate, and AI_PAUSED unset
//
// Output is NUMBERS ONLY (counts, correlations, dollars). No hook or script text
// is ever printed or written; results go to a local file the caller chooses.
import { readFileSync, writeFileSync } from 'node:fs'
import { pearson, spearman, PERSONA_MIN_CORRELATION, personaMayInfluence } from '../../packages/shared/src/script/realisticPanel.ts'
import { parseCsv } from '../../packages/shared/src/script/painMap.ts'

const DIR = new URL('../../packages/shared/src/script/__tests__/fixtures/calibration/', import.meta.url)

/** The calibration viewers: the same three the reviewer's VIEWER PANEL imagines. */
export const CALIBRATION_PERSONAS = [
  { id: 'loyal_follower', brief: 'a loyal follower who already likes this creator' },
  { id: 'new_scroller', brief: 'a new viewer scrolling past who has never seen this creator' },
  { id: 'skeptic', brief: 'a skeptic who has seen ten videos like this one' },
]

/** Prices per million tokens, UNCONFIRMED (re-read ai_model_prices before running). */
export const MODEL = 'gemini-2.5-flash'
export const PRICE = { input_per_m: 0.30, output_per_m: 2.50 }
export const HOOKS_PER_CALL = 20
export const TOKENS = { hook_call_in: 1500, hook_call_out: 400, script_call_in: 1100, script_call_out: 150 }

function rows(file) {
  const [head, ...body] = parseCsv(readFileSync(new URL(file, DIR), 'utf8'))
  return body.filter((r) => r.length >= head.length && r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

export function loadSets() {
  const hooks = rows('hook-calibration-set.csv').map((r, i) => ({ key: `h${i}`, text: r.hook, label: Number(r.scroll_1_5) })).filter((h) => h.text && Number.isFinite(h.label))
  const scripts = rows('craft-calibration-set.csv').map((r, i) => ({ key: `s${i}`, text: r.script_text, label: Number(r.craft_1_7) })).filter((s) => s.text && Number.isFinite(s.label))
  return { hooks, scripts }
}

/** The budget for a full calibration run (every persona × every item). */
export function calibrationBudget({ hooks, scripts, personas = CALIBRATION_PERSONAS.length }) {
  const hookCalls = Math.ceil(hooks / HOOKS_PER_CALL) * personas
  const scriptCalls = scripts * personas
  const inTok = hookCalls * TOKENS.hook_call_in + scriptCalls * TOKENS.script_call_in
  const outTok = hookCalls * TOKENS.hook_call_out + scriptCalls * TOKENS.script_call_out
  const usd = (inTok * PRICE.input_per_m + outTok * PRICE.output_per_m) / 1e6
  return { model: MODEL, calls: hookCalls + scriptCalls, hook_calls: hookCalls, script_calls: scriptCalls, input_tokens: inTok, output_tokens: outTok, est_usd: Math.round(usd * 10000) / 10000, with_retries_usd: Math.round(usd * 1.5 * 10000) / 10000, prices: 'UNCONFIRMED' }
}

/**
 * Correlation per persona from saved scores `{ persona: { key: score } }`
 * against the advisor labels. Returns numbers only.
 */
export function correlate(sets, scores) {
  const out = []
  for (const p of Object.keys(scores ?? {})) {
    const s = scores[p] ?? {}
    const pair = (items) => {
      const have = items.filter((it) => Number.isFinite(Number(s[it.key])))
      return { n: have.length, r: pearson(have.map((it) => Number(s[it.key])), have.map((it) => it.label)), rho: spearman(have.map((it) => Number(s[it.key])), have.map((it) => it.label)) }
    }
    const h = pair(sets.hooks), c = pair(sets.scripts)
    const rec = { persona: p, hook_r: h.r, hook_rho: h.rho, hook_n: h.n, craft_r: c.r, craft_rho: c.rho, craft_n: c.n, measured_at: new Date().toISOString() }
    out.push({ ...rec, may_influence: personaMayInfluence(rec) })
  }
  return out
}

async function gemini(key, prompt) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }),
  })
  if (!res.ok) throw new Error(`gemini ${res.status}`)
  const j = await res.json()
  return JSON.parse(j?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'null')
}

async function liveRun(sets, budget, outFile) {
  const key = process.env.GEMINI_API_KEY
  const cap = Number(process.env.PERSONA_CALIBRATION_CAP_USD || 0)
  if (process.env.AI_PAUSED) throw new Error('refused: AI_PAUSED is set')
  if (!key) throw new Error('refused: GEMINI_API_KEY missing')
  if (!(cap >= budget.with_retries_usd)) throw new Error(`refused: PERSONA_CALIBRATION_CAP_USD must be ≥ $${budget.with_retries_usd}`)
  const scores = {}
  for (const p of CALIBRATION_PERSONAS) {
    scores[p.id] = {}
    for (let i = 0; i < sets.hooks.length; i += HOOKS_PER_CALL) {
      const chunk = sets.hooks.slice(i, i + HOOKS_PER_CALL)
      const r = await gemini(key, `You are ${p.brief}. For each opening line of a short video, score 1-5 how likely you are to keep watching past the first two seconds. Reply JSON {"<key>": score}.\n${chunk.map((h) => `${h.key}: ${h.text}`).join('\n')}`).catch(() => null)
      for (const h of chunk) if (Number.isFinite(Number(r?.[h.key]))) scores[p.id][h.key] = Number(r[h.key])
    }
    for (const s of sets.scripts) {
      const r = await gemini(key, `You are ${p.brief}. Score 1-7 how well made this short-video script is for you to watch to the end. Reply JSON {"score": n}.\n${s.text}`).catch(() => null)
      if (Number.isFinite(Number(r?.score))) scores[p.id][s.key] = Number(r.score)
    }
  }
  const result = correlate(sets, scores)
  writeFileSync(outFile, JSON.stringify({ min_correlation: PERSONA_MIN_CORRELATION, model: MODEL, personas: result }, null, 2))
  return result
}

async function main() {
  const args = process.argv.slice(2)
  const sets = loadSets()
  const budget = calibrationBudget({ hooks: sets.hooks.length, scripts: sets.scripts.length })
  console.log(JSON.stringify({ hooks: sets.hooks.length, scripts: sets.scripts.length, personas: CALIBRATION_PERSONAS.map((p) => p.id), gate: `r >= ${PERSONA_MIN_CORRELATION} on both sets`, budget }, null, 2))
  const scoresArg = args.find((a) => a.startsWith('--scores='))
  if (scoresArg) {
    console.log(JSON.stringify(correlate(sets, JSON.parse(readFileSync(scoresArg.slice(9), 'utf8'))), null, 2))
    return
  }
  if (!args.includes('--run')) { console.log('dry run: no AI called. Pass --run when the AI returns (see header).'); return }
  const out = (args.find((a) => a.startsWith('--out=')) ?? '--out=persona-calibration.result.json').slice(6)
  console.log(JSON.stringify(await liveRun(sets, budget, out), null, 2))
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
