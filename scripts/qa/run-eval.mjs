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
// verbatim out of generate-blueprint/index.ts so the axes under test are the
// product's own, but the surrounding prompt is reconstructed. It therefore tests
// the DESIGN — containers, ownership, goals, options — and cannot prove the
// deployed function behaves identically.
//
// EVERY RULE UNDER TEST MUST BE LIFTED, NEVER RETYPED. Twice now a hand-written
// approximation has been mistaken for a product finding: once for `promotes`
// (a bare enum with the prohibition omitted), once for the count contract (a
// paraphrase missing the clause the fix turned on, and gated behind a
// `reference_read` field the harness never requested, so the rule was inert).
// Retyped text drifts, and drift is indistinguishable from a result. `liftBlock`
// exits non-zero rather than falling back — a harness that silently
// under-specifies the prompt does not measure the product, it measures itself.
//
// ⚠️ AND THE THIRD TIME: ORDER IS A RULE TOO, AND THIS HARNESS DOES NOT LIFT IT.
//
// Lifting the strings fixed WHAT is sent and not WHERE. In the cross-paired run,
// 4 of 12 cases returned a complete, parseable object containing ONLY
// `reference_read` — finishReason STOP, so the model had finished, not been cut
// off. It had read the mechanism and considered the job done, because
// MECHANISM_READ opens "READ THE FORMAT'S SPINE ... before you write anything
// else" and this prompt is short enough that a near-final instruction dominates.
// In `generate-blueprint` the same sentence is one bullet inside ~100 lines of
// SYSTEM with an explicit ordered task list after it, and it does not dominate.
//
// So a stopped-early case here is EVIDENCE ABOUT THIS FILE, not about the
// product, and must never be reported as a refusal or a defect. Until the
// harness reproduces the real prompt's ORDER, only cases that return a full
// blueprint carry any signal at all.
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
// THE COUNT CONTRACT, LIFTED VERBATIM — for the same reason as the above.
//
// This block was PARAPHRASED here for one round of runs, and the paraphrase
// dropped the clause the fix actually turned on ("this is the specific way that
// rule was broken three times"). The runs that moved Cleo from one spoken
// ordinal to five therefore measured a string the product does not send. The
// direction held, the evidence did not cover the shipped text.
//
// ⚖️ Anything hand-copied here will drift, and drift is indistinguishable from
// a finding. So the block is extracted between two markers and the extraction
// FAILS LOUDLY rather than falling back to a paraphrase.
function liftBlock(startMarker, endMarker, label) {
  const from = EDGE.indexOf(startMarker)
  const to = EDGE.indexOf(endMarker, from)
  if (from < 0 || to < 0) {
    console.error(`FATAL: could not lift ${label} from generate-blueprint/index.ts.`)
    console.error('The harness will not run on a paraphrase. Fix the marker, do not inline the text.')
    process.exit(1)
  }
  return EDGE.slice(from, to + endMarker.length)
    .split('\n').map((l) => l.replace(/^\s{2}/, '')).join('\n')
}
const COUNT_CONTRACT = liftBlock(
  '- THE COUNT IS THE FORMAT',
  'Silent beats are fine BEFORE the first item and AFTER the last.',
  'the count contract',
)
// ⚖️ THE COUNT CONTRACT IS CONDITIONAL ON A FIELD THE HARNESS NEVER ASKED FOR.
// Every rule above fires only "if enumeration.is_enumerated is true" — and the
// harness's requested JSON had no `reference_read` at all, so that condition was
// never established in any run to date. The rules were present and inert. The
// mechanism read is lifted too, and emitted BEFORE the contract, in the same
// order as production, so the precondition can actually become true.
const MECHANISM_READ = liftBlock(
  '- reference_read.mechanism: READ THE FORMAT',
  'the debt that makes a list a sequence rather than a pile.',
  'the mechanism read',
)

// ⚠️ THE REASON 4 OF 12 CASES RETURNED ONLY `reference_read`.
//
// `generate-blueprint` sends `responseSchema: blueprintSchema` with `required`
// lists. This harness sent `responseMimeType` alone, so the model was free to
// emit a well-formed PARTIAL object — and it did: 2,299 output tokens of a
// 20,000 budget, finishReason STOP. It read the mechanism, wrote a beat-by-beat
// `beat_debts`, and considered the job finished.
//
// I blamed prompt ORDER first and moved the blocks to match production. That
// changed nothing, which is what ruled the hypothesis out — the reorder stays
// because it is closer to the real prompt, but it was not the cause. Then I
// blamed token exhaustion; the usage numbers ruled that out too. The difference
// was the one piece of the request I had never compared.
//
// ⚖️ Kept deliberately shallow. Mirroring the full production schema would be a
// second copy of it here, free to drift; this pins only the KEYS whose absence
// silently turns a run into a non-result.
const S = (t) => ({ type: t })
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reference_read: {
      type: 'OBJECT',
      properties: {
        mechanism: {
          type: 'OBJECT',
          properties: {
            enumeration: {
              type: 'OBJECT',
              properties: { is_enumerated: S('STRING'), count: S('STRING'), unit: S('STRING') },
              required: ['is_enumerated', 'count', 'unit'],
            },
            hook_promise: S('STRING'),
            rehook_after_item: S('STRING'),
            beat_debts: { type: 'ARRAY', items: S('STRING') },
          },
          required: ['enumeration', 'hook_promise', 'rehook_after_item', 'beat_debts'],
        },
      },
      required: ['mechanism'],
    },
    beat_plan: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { beat: S('STRING'), target_sec: S('STRING'), scene_type: S('STRING'), proof: S('STRING') },
        required: ['beat', 'target_sec', 'scene_type', 'proof'],
      },
    },
    concept: { type: 'OBJECT', properties: { premise: S('STRING') }, required: ['premise'] },
    hook_options: { type: 'ARRAY', items: S('STRING') },
    script: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          section: S('STRING'), line: S('STRING'), location: S('STRING'),
          broll_request: S('STRING'), wardrobe: S('STRING'), action_posing: S('STRING'),
        },
        required: ['section', 'line', 'location', 'broll_request', 'wardrobe', 'action_posing'],
      },
    },
    cta: S('STRING'),
  },
  required: ['reference_read', 'beat_plan', 'concept', 'hook_options', 'script', 'cta'],
}

// CREATOR KNOWLEDGE, rendered exactly as `knowledgePromptLine` renders it.
// ⚖️ Empty stays EMPTY. The whole point of the module is that it never tells the
// model to invent substance, so a creator with no knowledge must produce no
// block at all — otherwise the A/B below measures a different prompt, not a
// different memory.
function knowledgeBlock(k) {
  if (!k) return ''
  const items = (k.items ?? []).filter((i) => i.basis !== 'inferred' && i.kind !== 'covered')
    .sort((a, b) => (b.timesSeen ?? 1) - (a.timesSeen ?? 1))
  const covered = (k.items ?? []).filter((i) => i.kind === 'covered')
  const parts = []
  if (items.length) {
    parts.push('\nWHAT THIS CREATOR ACTUALLY KNOWS AND HAS SAID — real substance, not style.'
      + ' Build the video out of THIS. These are their own positions and examples,'
      + ' so you may put them in their mouth; anything you add that is not here is'
      + ' yours, and they did not say it.\n'
      + items.slice(0, 12).map((c) => `  * (${c.kind}) ${c.text}`).join('\n'))
  }
  if (covered.length) {
    parts.push('\nALREADY COVERED — they have made a video about each of these. Do NOT hand'
      + ' them their own upload back; go at the topic from an angle they have not used.'
      + ' THIS LIST IS NEVER SPOKEN. It steers what you choose, and it must not appear'
      + ' in any line: a script that says "we\'ve had a video on this" is narrating our'
      + ' notes to the audience, and it asserts something about their back catalogue'
      + ' that nobody checked the phrasing of. Use it to pick a DIFFERENT angle, then'
      + ' write as though the earlier video were simply not the subject.\n'
      + covered.map((c) => `  * ${c.text}`).join('\n'))
  }
  if ((k.audience ?? []).length) {
    parts.push('\nWHAT THEIR AUDIENCE KEEPS ASKING — summarised, never quoted. A video that'
      + ' answers one of these is wanted before it is made. THIS LIST IS NEVER SPOKEN'
      + ' EITHER. Answer the question; do not announce that it was asked. A line like'
      + ' "one my audience asks about a lot" narrates our notes to the room.\n'
      + k.audience.map((a) => `  * ${a.summary} (asked ~${a.asked}x)`).join('\n'))
  }
  return parts.join('\n')
}

const pack = JSON.parse(readFileSync('scripts/qa/creator-pack.json', 'utf8'))

async function gen({ creator, refNote, fidelity, tone, goal, withKnowledge = true }) {
  const t = creator.truth ?? {}
  // ⚠️ ORDER MIRRORS PRODUCTION, AND IT IS LOAD-BEARING.
  //
  // The rules come FIRST, as they do in `generate-blueprint`'s SYSTEM constant,
  // and the task list comes LAST. When MECHANISM_READ sat near the end instead,
  // 4 of 12 cases returned only `reference_read` and stopped — finishReason
  // STOP, not truncation. Its opening words are "before you write anything
  // else", and in a short prompt a near-final instruction reads as the whole
  // job. In the real SYSTEM it is one bullet with a hundred lines after it.
  const prompt = `You are TwinAI's reference engine. Turn a proven short-form reference into a personalized, shootable blueprint in the creator's OWN voice.

HOW TO READ THE REFERENCE AND HOLD ITS FORMAT
${MECHANISM_READ}

${COUNT_CONTRACT}

HOW TO SHAPE THE VIDEO
- beat_plan: BEFORE writing any words, decide the video's shape. How many beats it actually needs, what each beat is FOR, and how long each should run. DECIDE the count from what this video has to do: a short product demo and a long teardown do not both get seven beats. target_sec is a real decision in seconds. EMIT EXACTLY ONE BEAT PER script ENTRY, in the same order, so beat 1 is script line 1.
- Write every script line TO ITS BEAT'S target_sec. A line for a 6 second beat is roughly 15 words at a natural pace; a line for a 16 second beat is roughly 40. Do not write a forty word line into a six second beat.
- This is a SHORT-FORM vertical video.

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
${withKnowledge ? knowledgeBlock(creator.knowledge) : ''}

REFERENCE (described, not transcribed)
${refNote}

${FID[fidelity]}
${(creator.truth?.regulated || (creator.forbiddenClaims||[]).length) && tone === 'punchy'
  ? "- TONE WAS CLAMPED. This creator works under stated limits on what they may claim, so the punchy register is not available to them: no hype openers (\"you won't believe\", \"this will blow your mind\"), no manufactured certainty. Write with energy, not with bait."
  : ''}
${/(sell|leads)/.test(goal ?? creator.answers.goal)
  ? '- CTA INTENT: this creator\'s goal is commercial, so a purchase or signup CTA is appropriate here.'
  : '- CTA INTENT: NOT a selling video. Do NOT write a purchase, signup, pre-order, "link in bio to buy", merch or course CTA — even if the creator owns something and even if the reference ends on one. The call to action is engagement: follow, save, share, or a question worth answering.'}

YOUR TASK: produce the FULL blueprint now — the mechanism read AND the beat plan AND the concept AND five hook options AND every script beat AND the CTA. Reading the reference is the first step, never the deliverable; a response containing only reference_read is incomplete.

Return JSON only, with EVERY key below present and populated:
{"reference_read":{"mechanism":{"enumeration":{"is_enumerated":"","count":"","unit":""},"hook_promise":"","rehook_after_item":"","beat_debts":[""]}},
 "beat_plan":[{"beat":"","target_sec":"","scene_type":"","proof":""}],
 "concept":{"premise":""},"hook_options":["","","","",""],
 "script":[{"section":"","line":"","location":"","broll_request":"","wardrobe":"","action_posing":""}],
 "cta":""}`

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, maxOutputTokens: 20000, temperature: 0.9, thinkingConfig: { thinkingBudget: 0 } },
    }),
  })
  const j = await r.json()
  const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!txt) return { error: j?.error?.message ?? j?.candidates?.[0]?.finishReason ?? 'no text' }
  const finish = j?.candidates?.[0]?.finishReason
  if (finish && finish !== 'STOP') console.error(`  finishReason=${finish}`)
  try { return JSON.parse(txt) } catch { return { error: 'unparseable', raw: txt.slice(0, 300) } }
}

const CASES = JSON.parse(process.env.CASES ?? '[]')
const out = []
for (const c of CASES) {
  const creator = pack.creators.find(x => x.key === c.creator)
  const bp = await gen({ creator, refNote: c.refNote, fidelity: c.fidelity, tone: c.tone, goal: c.goal, withKnowledge: c.withKnowledge !== false })
  out.push({ case: c, blueprint: bp })
  console.error(`done: ${c.creator} / ${c.fidelity} / ${c.label}${c.withKnowledge === false ? " [no-knowledge]" : ""}`)
}
console.log(JSON.stringify(out, null, 2))
