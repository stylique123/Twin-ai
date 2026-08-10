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
// THE PROMOTES PROHIBITION, LIFTED VERBATIM.
//
// The first version of this harness sent the bare enum ("review_only") and the
// output produced a founder launch — which I briefly recorded as a product
// defect. It was not. `generate-blueprint` emits a full prohibition for each
// value, and the harness was simply not sending it. That is the exact failure
// the edge function's own comment warns about: "`- What they do: saas` invites
// the model to invent what that implies; naming the consequence is what changes
// the writing."
//
// A harness that under-specifies the prompt does not measure the product, it
// measures the harness. So these are lifted rather than paraphrased.
function promotesLine(v) {
  const re = new RegExp(`brief\\.promotes === '${v}'[\\s\\S]*?\\?\\s*'([\\s\\S]*?)'\\n`, 'm')
  const m = EDGE.match(re)
  return m ? m[1].replace(/\\n/g, '').replace(/\\'/g, "'") : ''
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
- Third-party products featured: ${creator.answers.promotes}${promotesLine(creator.answers.promotes)}

REFERENCE (described, not transcribed)
${refNote}

${FID[fidelity]}
${(creator.truth?.regulated || (creator.forbiddenClaims||[]).length) && tone === 'punchy'
  ? "- TONE WAS CLAMPED. This creator works under stated limits on what they may claim, so the punchy register is not available to them: no hype openers (\"you won't believe\", \"this will blow your mind\"), no manufactured certainty. Write with energy, not with bait."
  : ''}
${/(sell|leads)/.test(goal ?? creator.answers.goal)
  ? '- CTA INTENT: this creator\'s goal is commercial, so a purchase or signup CTA is appropriate here.'
  : '- CTA INTENT: NOT a selling video. Do NOT write a purchase, signup, pre-order, "link in bio to buy", merch or course CTA — even if the creator owns something and even if the reference ends on one. The call to action is engagement: follow, save, share, or a question worth answering.'}

- beat_plan: BEFORE writing any words, decide the video's shape. How many beats it actually needs, what each beat is FOR, and how long each should run. DECIDE the count from what this video has to do: a short product demo and a long teardown do not both get seven beats. target_sec is a real decision in seconds. EMIT EXACTLY ONE BEAT PER script ENTRY, in the same order, so beat 1 is script line 1.
- Write every script line TO ITS BEAT'S target_sec. A line for a 6 second beat is roughly 15 words at a natural pace; a line for a 16 second beat is roughly 40. Do not write a forty word line into a six second beat.
- This is a SHORT-FORM vertical video.
- THE VIEWER HEARS ONLY THE SPOKEN LINE. Section names are never spoken aloud. If this video promises a count, every item's ordinal MUST appear in the spoken line itself ("the first one is...", "number two..."), and the section name MUST NOT contain a number or ordinal. A count that lives in section names is a count the audience never hears.

Return JSON only:
{"beat_plan":[{"beat":"","target_sec":"","scene_type":"","proof":""}],
 "concept":{"premise":""},"hook_options":["","","","",""],
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
