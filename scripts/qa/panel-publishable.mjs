#!/usr/bin/env node
// WOULD THIS CREATOR ACTUALLY POST THIS?
//
// ── WHY A PANEL AND NOT ANOTHER COUNTER ───────────────────────────────────
//
// Three string metrics in a row failed to see what is wrong with these scripts:
//
//   1. "citation does not trace"        → 0 of 48, while the arm was inventing
//   2. "delivered minus supply reached" → 0 unbacked on a script whose last five
//                                          items were business platitudes
//   3. "repeated beat"                  → 0 of 24, on scripts that state the same
//                                          idea twice in different words
//
// ⚠️ EVERY ONE OF THOSE DEFECTS IS REAL AND NONE IS LEXICAL. The system is past
// the point where a regex can find its remaining faults, and shipping another
// one would be measuring what is easy rather than what is wrong.
//
// ⚖️ SO THE INSTRUMENT IS A JUDGE, AND ITS LIMITS ARE STATED RATHER THAN HIDDEN.
// A model judging model output is the weakest evidence in this repo. It is used
// here because the alternative is no evidence, and because the question — "would
// a person publish this" — is a judgement by nature. It is NOT a metric to tune
// against; it is a way to find the next defect worth making decidable.
//
// The judge never learns which arm produced a script, so it cannot infer the
// answer from the condition.
import { readFileSync } from 'node:fs'

const KEY = process.env.GEMINI_API_KEY
if (!KEY) { console.error('set GEMINI_API_KEY'); process.exit(1) }
const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'))

const PROMPT = (dna, script) => `You are a working short-form creator reviewing a script written for YOU.

Your account: ${dna}

The script:
${script.map((b, i) => `${i + 1}. ${b.line ?? ''}`).join('\n')}

Answer as this creator would — not as a marketer, not as a critic. You are deciding
whether to spend an afternoon filming this.

Judge on:
  HOOK      - does line 1 make someone stop, and does it leave a reason to keep watching?
              A hook that gives away the whole payoff is a WEAK hook.
  PAYOFF    - does the script deliver on what the hook promised? Does it explain
              HOW, or only assert THAT?
  SHAPE     - is there a sequence with a turn in it, or is it a list of facts
              in confident sentences?
  REPETITION- does any beat restate an earlier beat in different words?
  VOICE     - does this sound like you, or like a generic creator in your niche?

Reply as JSON only:
{"publish": true|false,
 "score": 1-10,
 "biggest_flaw": "<one specific sentence naming the single thing most wrong>",
 "flaw_category": "HOOK|PAYOFF|SHAPE|REPETITION|VOICE|NONE",
 "what_you_would_cut": "<quote the beat you would delete, or empty>"}`

async function judge(dna, script) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + KEY, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT(dna, script) }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 40000, responseMimeType: 'application/json' },
    }),
  })
  const j = await r.json()
  const t = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
  try { return JSON.parse(t) } catch { return { error: j?.candidates?.[0]?.finishReason ?? 'unparseable' } }
}

const out = []
for (const row of rows) {
  const script = row.blueprint?.script ?? []
  if (!script.length) continue
  const supplied = (row.supplied?.knowledge ?? []).slice(0, 6)
    .map((k) => `(${k.kind}) ${k.text}`).join('; ')
  const v = await judge(`${row.case?.creator} — ${supplied}`, script)
  out.push({ creator: row.case?.creator, arm: row.case?.label, ...v })
  console.error(`judged ${row.case?.creator} / ${row.case?.label}`)
}

const ARM = { A_pack: 'hand pack', B_production: 'all sources', C_transcript_only: 'transcript only' }
console.table(out.map((o) => ({
  creator: o.creator, arm: ARM[o.arm] ?? o.arm,
  publish: o.publish === true ? 'YES' : o.publish === false ? 'no' : (o.error ?? '?'),
  score: o.score ?? '—', flaw: o.flaw_category ?? '—',
})))

for (const arm of Object.keys(ARM)) {
  const a = out.filter((o) => o.arm === arm && typeof o.score === 'number')
  if (!a.length) continue
  const pub = a.filter((o) => o.publish === true).length
  const avg = (a.reduce((s, o) => s + o.score, 0) / a.length).toFixed(1)
  console.log(`\n${ARM[arm]}: would publish ${pub}/${a.length} · mean score ${avg}`)
  const flaws = {}
  for (const o of a) flaws[o.flaw_category] = (flaws[o.flaw_category] ?? 0) + 1
  console.log('  biggest flaw by category:', JSON.stringify(flaws))
}

console.log('\n── WHAT THEY WOULD CUT ──')
for (const o of out.filter((x) => x.arm === 'C_transcript_only' && x.biggest_flaw)) {
  console.log(`\n${o.creator} [${o.flaw_category}] ${o.biggest_flaw}`)
  if (o.what_you_would_cut) console.log(`   cut: "${String(o.what_you_would_cut).slice(0, 140)}"`)
}
