#!/usr/bin/env node
// DID THE REPAIR MAKE A SCRIPT THE CREATOR WOULD RATHER POST?
//
// ⚠️ THE WRONG METRIC IS "THE SOFT BEAT IS GONE." A rewrite that removes the limp
// sentence and returns something stiffer succeeds by that measure and fails by
// the only one that pays. So the two versions are shown side by side, in RANDOM
// order, unlabelled, and the judge picks one.
//
// ⚖️ AND "NEITHER IS BETTER" IS AN ALLOWED ANSWER. Forcing a choice on two
// near-identical scripts manufactures a 50% win rate out of noise, which is
// exactly how a repair pass that does nothing gets shipped as an improvement.
import { readFileSync } from 'node:fs'

const KEY = process.env.GEMINI_API_KEY
if (!KEY) { console.error('set GEMINI_API_KEY'); process.exit(1) }
const pairs = JSON.parse(readFileSync(process.argv[2], 'utf8'))

const PROMPT = (a, b) => `You are a working short-form creator. Two versions of the same script.

VERSION 1:
${a.map((l, i) => `${i + 1}. ${l}`).join('\n')}

VERSION 2:
${b.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Which would you actually post? Judge on specificity, payoff, and whether it sounds
like a person rather than a brand. If they are equivalent, say so — do not invent a
preference.

Reply as JSON only:
{"prefer": 1 | 2 | 0, "why":"<one sentence>", "repaired_sounds_less_natural": true|false}
(0 means genuinely equivalent.)`

async function ask(a, b) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT(a, b) }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 40000, responseMimeType: 'application/json' },
    }),
  })
  const j = await r.json()
  const t = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
  try { return JSON.parse(t) } catch { return null }
}

const results = []
for (let i = 0; i < pairs.length; i++) {
  const p = pairs[i]
  if (!p.changed) continue
  // Deterministic alternation rather than randomness, so the run is reproducible
  // and the position bias is balanced across the set.
  const repairedFirst = i % 2 === 0
  const v = await ask(repairedFirst ? p.repaired : p.original,
    repairedFirst ? p.original : p.repaired)
  if (!v) continue
  const pickedRepaired = v.prefer === 0 ? null : (v.prefer === 1) === repairedFirst
  results.push({ creator: p.creator, arm: p.arm, why: p.why.join('+'),
    winner: pickedRepaired === null ? 'tie' : pickedRepaired ? 'REPAIRED' : 'original',
    unnatural: v.repaired_sounds_less_natural === true, note: v.why })
  console.error(`${p.creator}/${p.arm}: ${results.at(-1).winner}`)
}

console.table(results.map((r) => ({ creator: r.creator, arm: r.arm, trigger: r.why,
  winner: r.winner, 'repair less natural': r.unnatural ? 'YES' : '' })))

const w = results.filter((r) => r.winner === 'REPAIRED').length
const l = results.filter((r) => r.winner === 'original').length
const t = results.filter((r) => r.winner === 'tie').length
console.log(`\nrepaired preferred ${w} · original preferred ${l} · tie ${t}  (n=${results.length})`)
console.log(`repair judged less natural in ${results.filter((r) => r.unnatural).length}`)

const byTrigger = {}
for (const r of results) {
  const b = (byTrigger[r.why] ??= { trigger: r.why, win: 0, lose: 0, tie: 0 })
  if (r.winner === 'REPAIRED') b.win++; else if (r.winner === 'original') b.lose++; else b.tie++
}
console.log('\n── WIN RATE BY TRIGGER — this is the routing policy ──')
console.table(Object.values(byTrigger))
