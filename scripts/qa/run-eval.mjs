#!/usr/bin/env node
// Generate blueprints for QA personas so they can be scored.
//
// USAGE
//   GEMINI_API_KEY=... CASES='[{...}]' node scripts/qa/run-eval.mjs > out.json
//
// A case is { creator, label, fidelity, tone, goal?, refNote }. `creator` keys
// into scripts/qa/creator-pack.json; `refNote` DESCRIBES a reference rather than
// linking one, which is the path that works without a transcript ingest.
//
// ⚠️ THIS IS A HARNESS, NOT THE EDGE FUNCTION. It lifts the REAL rule strings
// (FIDELITY_RULE, TONE_RULE) verbatim out of generate-blueprint/index.ts so the
// axes under test are the product's own, but the surrounding prompt is
// reconstructed. It therefore tests the DESIGN — containers, ownership, goals,
// options — and cannot prove the deployed function behaves identically.
import { readFileSync } from 'node:fs'

const KEY = process.env.GEMINI_API_KEY
if (!KEY) { console.error('set GEMINI_API_KEY'); process.exit(1) }

const EDGE = readFileSync('supabase/functions/generate-blueprint/index.ts', 'utf8')
// Lift the real rules rather than paraphrasing them.
const lift = (name, key) => {
  const m = EDGE.match(new RegExp(`${name}:\\s*\\n?\\s*'([\\s\\S]*?)',\\n`, 'm'))
  return m ? m[1].replace(/\\'/g, "'").replace(/\\n/g, ' ') : null
}
const FID = {
  close: lift('close'), balanced: lift('balanced'), loose: lift('loose'),
}
const pack = JSON.parse(readFileSync('scripts/qa/creator-pack.json', 'utf8'))

async function gen({ creator, refNote, fidelity, tone, goal }) {
  const t = creator.truth ?? {}
  const prompt = `You are TwinAI's reference engine. Turn a proven short-form reference into a personalized, shootable blueprint in the creator's OWN voice.

CREATOR DNA
- Name: ${creator.name}
- Signature structure: ${t.signature ?? 'unknown'}
- Argues against: ${t.enemy ?? 'unknown'}
- CTA style: ${t.ctaStyle ?? 'unknown'}
- Commercial relationship: ${t.relationship ?? 'unknown'}
- Owns: ${t.ownsProduct ?? 'nothing confirmed'}
- Can put product on screen: ${t.showability ?? 'UNKNOWN'}
${t.regulated ? `- REGULATED PROFESSIONAL. Forbidden claims:\n${(creator.forbiddenClaims ?? []).map(c => '  * ' + c).join('\n')}` : ''}

CREATOR'S ANSWERS
- Goal: ${goal ?? creator.answers.goal}
- Audience: ${creator.answers.audience}
- What they do: ${creator.answers.workKind}
- Third-party products featured: ${creator.answers.promotes}

REFERENCE (described, not transcribed)
${refNote}

${FID[fidelity]}

Return JSON only:
{"concept":{"premise":""},"hook_options":["","","","",""],
 "script":[{"section":"","line":"","location":"","broll_request":"","wardrobe":"","action_posing":""}],
 "cta":""}`

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 20000, temperature: 0.9, thinkingConfig: { thinkingBudget: 0 } },
    }),
  })
  const j = await r.json()
  const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!txt) return { error: j?.error?.message ?? j?.candidates?.[0]?.finishReason ?? 'no text' }
  try { return JSON.parse(txt) } catch { return { error: 'unparseable', raw: txt.slice(0, 300) } }
}

const CASES = JSON.parse(process.env.CASES ?? '[]')
const out = []
for (const c of CASES) {
  const creator = pack.creators.find(x => x.key === c.creator)
  const bp = await gen({ creator, refNote: c.refNote, fidelity: c.fidelity, tone: c.tone, goal: c.goal })
  out.push({ case: c, blueprint: bp })
  console.error(`done: ${c.creator} / ${c.fidelity} / ${c.label}`)
}
console.log(JSON.stringify(out, null, 2))
