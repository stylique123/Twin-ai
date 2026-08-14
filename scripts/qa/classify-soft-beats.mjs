#!/usr/bin/env node
// A SOFT BEAT IS NOT AUTOMATICALLY A DEFECT WORTH A MODEL CALL.
//
// ── WHY THIS CLASSIFIES INSTEAD OF COUNTING ───────────────────────────────
//
// The panel judged 6–8 of 8 scripts publishable while a dedicated judge found a
// restated beat in 67% of them. Both are true, and together they say the obvious
// thing: **"soft beat detected" is not "script materially harmed"**. Repairing
// every one would spend a model call per generation to polish something creators
// already accept.
//
// ⚖️ SO THE DETECTOR BECOMES A ROUTING SIGNAL, NOT A GATE. What decides whether
// a repair is worth its call is not that softness exists but WHERE it sits and
// WHAT JOB it was supposed to do. A limp connective in the middle of a strong
// script costs nothing; the same sentence in the hook costs the video.
//
// ⚠️ AND "SOFT" IS WIDER THAN "REPEATED". `detect-repetition.mjs` finds one kind
// — a beat restating an earlier one. The others are vagueness ("there are a few
// things you should know"), and abdication ("so just find what works for you").
// Routing on repetition alone would leave the hook defects that matter most
// unrouted, so this asks for the superset.
//
// This writes a distribution, not a verdict. A policy branch that fires on two
// of a hundred beats is not worth building, and that is only knowable by looking.
import { readFileSync, writeFileSync } from 'node:fs'

const KEY = process.env.GEMINI_API_KEY
if (!KEY) { console.error('set GEMINI_API_KEY'); process.exit(1) }
const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'))

const PROMPT = (lines, plan) => `Here is a short-form video script, numbered, with each beat's planned purpose.

${lines.map((l, i) => `${i + 1}. [purpose: ${plan[i] ?? 'unstated'}]\n   ${l}`).join('\n')}

Find every SOFT BEAT. A beat is soft when it occupies its slot without earning it:

  - it restates something an earlier beat already said, in different words
  - it is vague filler ("there are a few things you should know", "this can really make a difference")
  - it abdicates ("so just find what works for you", "everyone is different")
  - it asserts without any specific: no number, no example, no name, no step

A beat is NOT soft merely because it is short, or because it is a transition that
does real work, or because it shares a topic with another beat while making a new point.

For each soft beat report:
  severity  LOW    - a limp sentence; the script survives it untouched
            MEDIUM - noticeably weak; a viewer's attention dips
            HIGH   - actively costs the video: the promise, the payoff, or a whole item
  position  HOOK | SETUP | BODY | REHOOK | PAYOFF | CTA
  function  TRANSITION | SUBSTANCE | CLAIM | SUMMARY
  is_primary_substance  true if this beat is the ONLY thing carrying its container/item

Reply as JSON only:
{"soft":[{"beat":3,"severity":"MEDIUM","position":"BODY","function":"SUBSTANCE",
          "is_primary_substance":false,"why":"<a few words>"}]}
If nothing is soft, reply {"soft":[]}.`

async function classify(lines, plan) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT(lines, plan) }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 40000, responseMimeType: 'application/json' },
    }),
  })
  const j = await r.json()
  const t = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
  try { return JSON.parse(t)?.soft ?? [] } catch { return [] }
}

const all = []
let scripts = 0; let beats = 0
for (const row of rows) {
  const script = row.blueprint?.script ?? []
  const lines = script.map((b) => String(b?.line ?? '')).filter(Boolean)
  if (lines.length < 3) continue
  const plan = (row.blueprint?.beat_plan ?? []).map((b) => String(b?.beat ?? ''))
  scripts++; beats += lines.length
  const soft = await classify(lines, plan)
  for (const s of soft) {
    all.push({ creator: row.case?.creator, arm: row.case?.label, ...s,
      line: lines[s.beat - 1] ?? '', of: lines.length })
  }
  console.error(`${row.case?.creator}/${row.case?.label}: ${soft.length} soft`)
}

writeFileSync(process.argv[3] ?? '/tmp/soft-beats.json', JSON.stringify(all, null, 1))

const tally = (key) => all.reduce((a, s) => ({ ...a, [s[key]]: (a[s[key]] ?? 0) + 1 }), {})
console.log(`\nscripts ${scripts} · beats ${beats} · soft beats ${all.length}`
  + ` (${Math.round((100 * all.length) / beats)}% of all beats)`)
console.log('severity :', JSON.stringify(tally('severity')))
console.log('position :', JSON.stringify(tally('position')))
console.log('function :', JSON.stringify(tally('function')))
console.log('primary substance:', all.filter((s) => s.is_primary_substance).length)

// ── HOW OFTEN WOULD EACH POLICY BRANCH FIRE? ──────────────────────────────
// A branch that never fires is not worth building; one that fires on everything
// is the mandatory repair pass wearing a disguise.
const HIGH_VALUE = new Set(['HOOK', 'REHOOK', 'PAYOFF'])
const byScript = {}
for (const s of all) (byScript[`${s.creator}|${s.arm}`] ??= []).push(s)
let repaired = 0
const reasons = {}
for (const [, soft] of Object.entries(byScript)) {
  const hits = []
  if (soft.some((s) => HIGH_VALUE.has(s.position))) hits.push('high-value position')
  if (soft.some((s) => s.is_primary_substance)) hits.push('primary substance')
  if (soft.filter((s) => s.function === 'SUBSTANCE' || s.function === 'CLAIM').length >= 2) hits.push('2+ substantive')
  if (soft.some((s) => s.severity === 'HIGH')) hits.push('HIGH severity')
  if (hits.length) { repaired++; for (const h of hits) reasons[h] = (reasons[h] ?? 0) + 1 }
}
console.log(`\nscripts with any soft beat : ${Object.keys(byScript).length}/${scripts}`)
console.log(`scripts the policy REPAIRS : ${repaired}/${scripts}`
  + ` (${Math.round((100 * repaired) / scripts)}%) — the rest ship as written`)
console.log('trigger frequency:', JSON.stringify(reasons))
