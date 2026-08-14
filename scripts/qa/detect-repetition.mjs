#!/usr/bin/env node
// HOW OFTEN DOES A SCRIPT SAY THE SAME THING TWICE?
//
// The panel named REPETITION the most common biggest-flaw in the best arm, and
// the lexical dedupe found ZERO across the same 24 scripts. Before building any
// check, this establishes two things a fix needs: the real rate, and a set of
// LABELLED PAIRS to test a cheap detector against — so a model call is only
// shipped if nothing cheaper can find them.
import { readFileSync, writeFileSync } from 'node:fs'

const KEY = process.env.GEMINI_API_KEY
if (!KEY) { console.error('set GEMINI_API_KEY'); process.exit(1) }
const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'))

const PROMPT = (lines) => `Here are the beats of a short video script, numbered.

${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Find every pair of beats where the SECOND restates the same idea as the first,
even if the words are completely different. Restating counts. Adding a genuinely
new reason, example, number or step does NOT count as restating.

Be strict: two beats about the same broad topic are not a repeat. Only flag when
a listener would think "you already said that".

Reply as JSON only:
{"pairs":[{"a":1,"b":5,"why":"<what is repeated, in a few words>"}]}`

async function detect(lines) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT(lines) }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 40000, responseMimeType: 'application/json' },
    }),
  })
  const j = await r.json()
  const t = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
  try { return JSON.parse(t)?.pairs ?? [] } catch { return [] }
}

const labelled = []
let scripts = 0; let withRepeat = 0; let pairs = 0
for (const row of rows) {
  const lines = (row.blueprint?.script ?? []).map((b) => String(b?.line ?? '')).filter(Boolean)
  if (lines.length < 3) continue
  scripts++
  const found = await detect(lines)
  if (found.length) withRepeat++
  pairs += found.length
  for (const p of found) {
    if (!lines[p.a - 1] || !lines[p.b - 1]) continue
    labelled.push({ creator: row.case?.creator, arm: row.case?.label, why: p.why,
      a: lines[p.a - 1], b: lines[p.b - 1] })
  }
  console.error(`${row.case?.creator}/${row.case?.label}: ${found.length}`)
}

writeFileSync(process.argv[3] ?? '/tmp/repetition-labels.json', JSON.stringify(labelled, null, 1))
console.log(`\nscripts examined      : ${scripts}`)
console.log(`scripts with a repeat : ${withRepeat} (${Math.round((100 * withRepeat) / scripts)}%)`)
console.log(`repeated pairs total  : ${pairs}`)
console.log(`labelled pairs written: ${labelled.length}`)
console.log('\n── EXAMPLES ──')
for (const l of labelled.slice(0, 6)) {
  console.log(`\n[${l.creator}] ${l.why}`)
  console.log(`  A: ${l.a.slice(0, 110)}`)
  console.log(`  B: ${l.b.slice(0, 110)}`)
}
