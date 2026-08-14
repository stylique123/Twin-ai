#!/usr/bin/env node
// SPAN-LEVEL REPAIR, ROUTED — AND JUDGED ON PREFERENCE, NOT ON REMOVAL.
//
// ── THE DECISION THIS IMPLEMENTS ──────────────────────────────────────────
//
// 67% of scripts contain a soft beat and 6–8 of 8 are judged publishable, so
// "soft beat detected" is not "script materially harmed" and a mandatory repair
// pass would spend a call per generation polishing what creators already accept.
// The detector is therefore a ROUTING SIGNAL: repair only where softness lands
// somewhere that costs the video.
//
// ⚠️ THE METRIC IS NOT "THE SOFT BEAT WAS REMOVED." A repair that deletes the
// limp sentence and returns a stiffer script has succeeded by its own measure and
// failed by the only one that matters. So repaired scripts go to a BLIND panel
// against their originals, and the question is which one the creator would post.
//
// ── WHY THE SPAN AND NOT THE SCRIPT ───────────────────────────────────────
//
// ⚖️ THE MODEL SEES THE BEAT, ITS NEIGHBOURS, ITS PURPOSE AND ITS SOURCE — and
// nothing else. Handing over the whole script and asking for an improvement is
// how one mediocre sentence gets fixed while three good ones come back in
// LinkedIn vocabulary. Rewriting is licensed for exactly one line.
//
// Three candidates are requested and one is chosen, because the first completion
// for a vague line is frequently another vague line.
import { readFileSync, writeFileSync } from 'node:fs'

const KEY = process.env.GEMINI_API_KEY
if (!KEY) { console.error('set GEMINI_API_KEY'); process.exit(1) }
const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const soft = JSON.parse(readFileSync(process.argv[3], 'utf8'))

/** ⚖️ THE POLICY, WRITTEN ONCE. Everything not matched here ships as written. */
const HIGH_VALUE = new Set(['HOOK', 'REHOOK', 'PAYOFF'])
function shouldRepair(softBeats) {
  const why = []
  if (softBeats.some((s) => HIGH_VALUE.has(s.position))) why.push('high-value position')
  if (softBeats.some((s) => s.is_primary_substance)) why.push('primary substance')
  if (softBeats.filter((s) => s.function === 'SUBSTANCE' || s.function === 'CLAIM').length >= 2) why.push('2+ substantive')
  return why
}

const PROMPT = (beat, before, after, purpose, source, style) => `Rewrite ONE line of a short video script.

The creator's style: ${style}
This beat's job: ${purpose}
What this beat may draw on (do not invent beyond it): ${source || 'nothing specific — do not add facts'}

The beat before it: ${before || '(this is the first beat)'}
THE LINE TO REPLACE: ${beat}
The beat after it: ${after || '(this is the last beat)'}

The line is soft: it fills its slot without earning it. Replace it with a line that
does its job with something specific — a number, a name, an example, a step, a
concrete consequence — drawn ONLY from what it may draw on above.

Rules:
- Same job, same position, same rough length. This is a replacement, not a new beat.
- Do NOT restate the beat before or after.
- Do NOT invent a fact, a figure, or an outcome that is not in the source above.
- Keep the creator's voice. If the source has nothing specific to offer, make the
  line shorter and plainer rather than adding invented detail.

Reply as JSON only: {"candidates":["...","...","..."],"best":0,"why_best":"<few words>"}`

async function repairLine(ctx) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT(...ctx) }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 40000, responseMimeType: 'application/json' },
    }),
  })
  const j = await r.json()
  const t = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
  try {
    const p = JSON.parse(t)
    const c = p?.candidates ?? []
    return c[p?.best ?? 0] ?? c[0] ?? null
  } catch { return null }
}

const byScript = {}
for (const s of soft) (byScript[`${s.creator}|${s.arm}`] ??= []).push(s)

const out = []
let calls = 0
for (const row of rows) {
  const key = `${row.case?.creator}|${row.case?.label}`
  const script = row.blueprint?.script ?? []
  const mine = byScript[key] ?? []
  const why = shouldRepair(mine)
  if (!why.length || !script.length) continue

  // ⚠️ ONLY THE BEATS THAT TRIGGERED IT, not every soft beat in the script. The
  // routing decision is per script; the rewrite stays per line.
  const targets = mine.filter((s) => HIGH_VALUE.has(s.position) || s.is_primary_substance
    || s.function === 'SUBSTANCE' || s.function === 'CLAIM')
  const plan = (row.blueprint?.beat_plan ?? []).map((b) => String(b?.beat ?? ''))
  const supplied = (row.supplied?.knowledge ?? []).map((k) => `(${k.kind}) ${k.text}`).join('; ')
  const lines = script.map((b) => String(b?.line ?? ''))
  const repaired = [...lines]

  for (const t of targets) {
    const i = t.beat - 1
    if (!lines[i]) continue
    const evidence = String(script[i]?.substance_evidence ?? '') || supplied.slice(0, 600)
    const fixed = await repairLine([lines[i], lines[i - 1], lines[i + 1],
      plan[i] || 'unstated', evidence, row.case?.creator])
    calls++
    if (fixed && fixed.trim() && fixed.trim() !== lines[i].trim()) repaired[i] = fixed.trim()
  }
  out.push({ creator: row.case?.creator, arm: row.case?.label, why, original: lines, repaired,
    changed: repaired.filter((l, i) => l !== lines[i]).length })
  console.error(`repaired ${key}: ${repaired.filter((l, i) => l !== lines[i]).length} lines (${why.join(', ')})`)
}

writeFileSync(process.argv[4] ?? '/tmp/repaired.json', JSON.stringify(out, null, 1))
console.log(`scripts routed to repair: ${out.length}`)
console.log(`lines rewritten          : ${out.reduce((a, o) => a + o.changed, 0)}`)
console.log(`model calls spent        : ${calls}`)
