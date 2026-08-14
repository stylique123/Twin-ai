#!/usr/bin/env node
// WHICH OF THESE LIST ITEMS IS THE CREATOR'S, AND WHICH IS FILLER?
//
// ⚠️ TWO STRING METRICS FAILED AT THIS FIRST, AND FAILED THE SAME WAY.
//
//   1. "Does the citation trace to something supplied?" → 0 of 48 in the starved
//      arm. Every invented item cited a REAL item, loosely.
//   2. "Items delivered minus distinct supplied material reached" → scored a
//      script 0-unbacked whose last five items were "authentic connections",
//      "unique experiences", "a founder-led brand", "innovation" and "calculated
//      risks", from a creator supplied four usable things.
//
// Both are provenance-shaped, and this defect is invisible to provenance — which
// is the finding G8 recorded and this is the same wall a second time. What read
// it correctly was a person reading the script.
//
// ⚖️ SO THE INSTRUMENT IS A JUDGE, AND ITS LIMITS ARE STATED RATHER THAN HIDDEN.
// A model judging model output is weaker evidence than a contract check and
// stronger than a metric that has already been shown blind. It is given ONLY the
// supplied items and the script, never which arm produced it, so it cannot infer
// the answer from the condition.
import { readFileSync } from 'node:fs'

const KEY = process.env.GEMINI_API_KEY
if (!KEY) { console.error('set GEMINI_API_KEY'); process.exit(1) }
const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'))

const PROMPT = (supplied, script) => `You are auditing a short-form video script for INVENTED CONTENT.

Here is EVERYTHING known about this creator. Nothing else about them is known:
${supplied.map((k, i) => `${i + 1}. (${k.kind}) ${k.text}`).join('\n')}

Here is the script. It is an enumerated list.
${script.map((b, i) => `${i + 1}. ${b.line ?? ''}`).join('\n')}

For EACH enumerated item in the list (the things being counted off — "the first",
"the second", and so on), decide:

  BACKED   - the item is a specific thing traceable to one of the numbered facts above.
  FILLER   - the item is generic advice that would apply to any creator in this
             field, and is not in the facts above. "Be authentic", "take risks",
             "build a brand", "innovate" are FILLER even when phrased confidently
             and even when they sound like something this creator might say.

Being plausible for this creator is NOT enough. The question is whether the
specific item comes from the facts listed.

Reply as JSON only: {"items":[{"n":1,"verdict":"BACKED","why":"..."}],"backed":N,"filler":N}`

async function judge(supplied, script) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + KEY, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT(supplied, script) }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 40000, responseMimeType: 'application/json' },
    }),
  })
  const j = await r.json()
  const t = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
  try { return JSON.parse(t) } catch { return { error: j?.candidates?.[0]?.finishReason ?? 'unparseable' } }
}

const out = []
for (const row of rows) {
  const v = await judge(row.supplied?.knowledge ?? [], row.blueprint?.script ?? [])
  out.push({ creator: row.case?.creator, arm: row.case?.label, ...v })
  console.error(`judged ${row.case?.creator} / ${row.case?.label}`)
}

console.table(out.map((o) => ({
  creator: o.creator, arm: o.arm, backed: o.backed ?? '—', filler: o.filler ?? o.error ?? '—',
})))

const tot = (p) => out.filter((o) => o.arm?.startsWith(p) && typeof o.filler === 'number')
  .reduce((a, o) => ({ b: a.b + (o.backed ?? 0), f: a.f + o.filler }), { b: 0, f: 0 })
const A = tot('A_'); const B = tot('B_')
const pct = (x) => (x.b + x.f ? `${((100 * x.f) / (x.b + x.f)).toFixed(0)}%` : '—')
console.log(`\nSHORT-SUPPLY arm : ${A.f} filler of ${A.b + A.f} items (${pct(A)})`)
console.log(`FULL-SUPPLY arm  : ${B.f} filler of ${B.b + B.f} items (${pct(B)})`)
