#!/usr/bin/env node
// CAN THE JUDGE PREDICT WHAT A REAL CREATOR ACTUALLY CHOSE?
//
// ── WHY THIS IS THE ONLY NON-CIRCULAR EVIDENCE IN THE EVAL STACK ──────────
//
// Every quality instrument built this session is a model judging a model. The
// panel scored three arms with genuinely different grounding — 58% vs 73%,
// generic beats 23% vs 8% — at 8.0, 8.0 and 8.1. It could not tell them apart,
// and there was no way to know whether that was the arms or the judge.
//
// ⚖️ PRODUCTION HAS BEEN QUIETLY COLLECTING GROUND TRUTH THE WHOLE TIME. A
// creator is shown five hook options and picks one. That pick is a real human
// preference over real alternatives, already stored in `generations.selected_hook`.
//
// So the target stops being "does the judge like this" and becomes:
//
//     Can the judge predict which hook the creator took?
//
// ⚠️ AND IT MUST BEAT THE DUMB BASELINE, NOT ZERO. The writer already ranks its
// own hooks — option 0 is the recommendation — and creators take it most of the
// time. A judge that scores below "always guess the recommendation" has negative
// value however good its accuracy sounds in isolation.
import { readFileSync } from 'node:fs'

const KEY = process.env.GEMINI_API_KEY
if (!KEY) { console.error('set GEMINI_API_KEY'); process.exit(1) }
const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  .filter((c) => Number.isInteger(c.picked_index) && Array.isArray(c.hooks) && c.hooks.length > 1)

const PROMPT = (dna, hooks) => `A creator is choosing the opening line for their next short video.

The creator: ${dna || '(no description available)'}

Their options:
${hooks.map((h, i) => `${i + 1}. ${h}`).join('\n')}

Which one will THIS creator actually pick? Not which is objectively best — which one
this particular person, with this particular voice and audience, chooses to say out loud.

Reply as JSON only: {"pick": <number>, "why": "<one short sentence>"}`

async function predict(dna, hooks) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT(dna, hooks) }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 40000, responseMimeType: 'application/json' },
    }),
  })
  const j = await r.json()
  const t = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
  try { return JSON.parse(t) } catch { return null }
}

let judgeRight = 0; let baselineRight = 0; let n = 0
const rows = []
for (const c of cases) {
  // ⚠️ SHUFFLE, OR THE JUDGE IS REWARDED FOR THE SAME POSITION BIAS THE BASELINE
  // EXPLOITS. Deterministic rotation keeps the run reproducible.
  const rot = n % c.hooks.length
  const shown = [...c.hooks.slice(rot), ...c.hooks.slice(0, rot)]
  const v = await predict(c.dna_summary, shown)
  if (!v || !Number.isInteger(v.pick)) continue
  const predictedOriginalIndex = (v.pick - 1 + rot) % c.hooks.length
  const hit = predictedOriginalIndex === c.picked_index
  if (hit) judgeRight++
  if (c.picked_index === 0) baselineRight++
  n++
  rows.push({ creator: c.handle, options: c.hooks.length, creator_picked: c.picked_index,
    judge_predicted: predictedOriginalIndex, hit: hit ? 'YES' : '' })
  console.error(`${c.handle}: creator ${c.picked_index}, judge ${predictedOriginalIndex} ${hit ? 'HIT' : 'miss'}`)
}

console.table(rows)
const pct = (x) => `${((100 * x) / n).toFixed(0)}%`
const chance = rows.reduce((a, r) => a + 1 / r.options, 0)
console.log(`\nn = ${n} real creator choices`)
console.log(`JUDGE predicts the creator's pick : ${judgeRight}  (${pct(judgeRight)})`)
console.log(`BASELINE "always the recommended" : ${baselineRight}  (${pct(baselineRight)})`)
console.log(`RANDOM chance                     : ${chance.toFixed(1)}  (${pct(chance)})`)
console.log(judgeRight > baselineRight
  ? '\nThe judge beats the writer\'s own ranking — it carries signal a reranker could use.'
  : '\nThe judge does NOT beat the writer\'s own ranking. A reranker built on it would'
    + ' pick worse hooks than simply taking option 0.')
