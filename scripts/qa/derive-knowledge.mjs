#!/usr/bin/env node
// TURN A SCRAPED CAPTION CORPUS INTO PACK KNOWLEDGE, BY THE RULES PRODUCTION USES.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// `creator-pack.json` is what every measurement in this directory reads: the
// matrix, the knowledge-use measure, the routing measure, the ladder. Its
// `knowledge.items` are the creator truth the harness supplies to the writer, so
// they decide what "grounded in creator knowledge" means when we report a
// percentage.
//
// And nothing produced them. `run-eval`, `score-matrix`, `cross-pair`,
// `derive-references` all READ the pack; no script writes it. The items were
// written by hand. So "re-scan the creators and regenerate the pack" was a task
// with no runnable half — the scrape existed, and the step that turns captions
// into knowledge did not.
//
// ⚠️ WHICH MEANS THE HARNESS MAY HAVE BEEN MEASURING KNOWLEDGE PRODUCTION NEVER
// WOULD HAVE PRODUCED. Hand-written items can be cleaner, better phrased and
// better chosen than anything the extractor returns — and a matrix run on them
// reports how the writer does with GOOD knowledge, not with the knowledge a real
// creator's account actually yields. That gap is invisible until something
// derives the items the way production does and the two are compared.
//
// ── LIFT, DO NOT RETYPE ───────────────────────────────────────────────────
//
// ⚖️ THE PROMPT AND SCHEMA ARE READ OUT OF `worker/src/voice.ts`. A retyped copy
// drifts, and drift is indistinguishable from a result — the exact failure found
// in `run-eval.mjs` hours ago, where a typed copy of the beat-plan instruction
// would have reported a prompt fix as having changed nothing. Extraction FAILS
// LOUDLY here rather than falling back to a paraphrase.
//
// ── COSTS ─────────────────────────────────────────────────────────────────
//
// Gemini only. This never touches Apify: the captions are already on disk, and
// `scan-manifest.json` opens by warning that re-scraping costs credits.
//
//   GEMINI_API_KEY=... node scripts/qa/derive-knowledge.mjs \
//     scripts/qa/real/captions-2026-08-11.json [--handle brett.tech] [--diff]

import { readFileSync } from 'node:fs'

const KEY = process.env.GEMINI_API_KEY
if (!KEY) { console.error('set GEMINI_API_KEY'); process.exit(1) }

const VOICE = readFileSync('worker/src/voice.ts', 'utf8')

/** Lift a block between two markers, or die. Never paraphrase. */
function lift(startMarker, endMarker, label) {
  const from = VOICE.indexOf(startMarker)
  const to = VOICE.indexOf(endMarker, from)
  if (from < 0 || to < 0) {
    console.error(`FATAL: could not lift ${label} from worker/src/voice.ts.`)
    console.error('This harness will not run on a paraphrase. Fix the marker, do not inline the text.')
    process.exit(1)
  }
  return VOICE.slice(from, to + endMarker.length)
}

// The caption extractor's system prompt, verbatim, including its own rules about
// what a title may and may not be read as.
const CAPTION_SYSTEM = lift(
  "You are TwinAI's Creator Knowledge engine, reading CAPTIONS AND TITLES",
  'Engagement bait, "link in bio" and pure hype are not knowledge.',
  'the caption knowledge prompt',
)

// The same response shape the worker asks for, rebuilt in the REST dialect. The
// field names are what matter — they are what `readKnowledge` validates.
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING' }, text: { type: 'STRING' }, basis: { type: 'STRING' },
          times_seen: { type: 'STRING' }, confidence: { type: 'STRING' },
          source_video: { type: 'STRING' },
        },
        required: ['kind', 'text', 'basis', 'times_seen', 'confidence', 'source_video'],
      },
    },
  },
  required: ['items'],
}

// ⚖️ THE SAME KINDS AND BASES THE SHARED READER ACCEPTS. An item outside them is
// dropped rather than coerced: a `basis` we cannot read must not become
// `stated`, which is the strongest value and the one that licenses first-person.
const KINDS = new Set(['fact', 'opinion', 'topic', 'example', 'experience',
  'framework', 'claim', 'product', 'covered'])
const BASES = new Set(['stated', 'demonstrated', 'inferred'])

/** Same corpus construction as `extractKnowledgeFromCaptions` — 120 captions,
 *  12k characters, numbered so `source_video` means something. */
function buildPrompt(handle, platform, captions) {
  const usable = captions.map((c) => String(c ?? '').trim()).filter((c) => c.length > 8)
  if (!usable.length) return null
  const corpus = usable.slice(0, 120)
    .map((c, i) => `--- CAPTION ${i + 1} ---\n${c}`).join('\n')
    .slice(0, 12000)
  return `CREATOR: @${handle} on ${platform}
CAPTIONS AND TITLES:
${corpus}

Record what these videos are about, what products they name, and what subjects are already covered.`
}

async function extract(handle, platform, captions) {
  const prompt = buildPrompt(handle, platform, captions)
  if (!prompt) return []
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CAPTION_SYSTEM }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json', responseSchema: SCHEMA,
          // ⚠️ 40_000, THE SAME BUDGET `voice.ts` PASSES. A first version used
          // 8_000 — a number I typed rather than lifted — and every one of the
          // eight creators came back `MAX_TOKENS` with the JSON cut mid-item at
          // 881 characters, reported as "unparseable". Thinking tokens count
          // against this budget, so a figure that looks generous for the visible
          // output is not. Retyping a constant is the same defect as retyping a
          // prompt, one field over.
          maxOutputTokens: 40000, temperature: 0.3,
        },
      }),
    })
  const j = await r.json()
  const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!txt) { console.error(`  ${handle}: ${j?.error?.message ?? j?.candidates?.[0]?.finishReason ?? 'no text'}`); return [] }
  let parsed
  try { parsed = JSON.parse(txt) } catch {
    console.error(`  ${handle}: unparseable; finish=${j?.candidates?.[0]?.finishReason} len=${txt.length}`)
    console.error(`  head: ${txt.slice(0, 200)}`)
    console.error(`  tail: ${txt.slice(-120)}`)
    return []
  }

  const out = []
  for (const raw of parsed?.items ?? []) {
    const kind = String(raw?.kind ?? '').trim().toLowerCase()
    const text = String(raw?.text ?? '').trim()
    // ⚠️ `creator_knowledge.text` IS CHECK-CAPPED AT 240 CHARACTERS in the
    // database. An item over it would be accepted here and rejected on write,
    // which is a difference between what the harness measures and what
    // production can store.
    if (!KINDS.has(kind) || text === '' || text.length > 240) continue
    // ⚖️ AN UNREADABLE BASIS IS `inferred`, NEVER `stated` — the shared reader's
    // rule, because silence about where something came from is not evidence.
    const basis = BASES.has(String(raw?.basis ?? '').trim().toLowerCase())
      ? String(raw.basis).trim().toLowerCase() : 'inferred'
    const n = Number.parseInt(String(raw?.times_seen ?? '1'), 10)
    out.push({
      kind, text, basis, source: 'caption',
      timesSeen: Number.isFinite(n) && n > 0 ? n : 1,
      sourceRef: null, sourceExpiry: null,
    })
  }
  return out
}

const [corpusPath, ...rest] = process.argv.slice(2)
if (!corpusPath) { console.error('usage: derive-knowledge.mjs <corpus.json> [--handle X] [--diff]'); process.exit(1) }
const only = rest.includes('--handle') ? rest[rest.indexOf('--handle') + 1] : null
const wantDiff = rest.includes('--diff')

const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'))
const manifest = JSON.parse(readFileSync('scripts/qa/real/scan-manifest.json', 'utf8'))
const scan = manifest.scans.find((s) => corpusPath.endsWith(s.corpus))
const platformOf = new Map((scan?.accounts ?? []).map((a) => [a.handle.toLowerCase(), a.platform]))

const pack = JSON.parse(readFileSync('scripts/qa/creator-pack.json', 'utf8'))
const ALL = [...pack.creators, ...(pack.cohort2?.creators ?? []), ...(pack.cohort3?.creators ?? [])]
const packFor = (h) => ALL.find((c) => (c.handle ?? '').replace(/^@/, '').toLowerCase() === h.toLowerCase())

const derived = {}
for (const [handle, caps] of Object.entries(corpus)) {
  if (only && handle.toLowerCase() !== only.toLowerCase()) continue
  const captions = Array.isArray(caps) ? caps : (caps?.captions ?? [])
  const platform = platformOf.get(handle.toLowerCase()) ?? 'tiktok'
  const items = await extract(handle, platform, captions)
  derived[handle] = items
  const byKind = items.reduce((a, i) => ({ ...a, [i.kind]: (a[i.kind] ?? 0) + 1 }), {})
  const stated = items.filter((i) => i.basis === 'stated').length
  console.error(`${handle} (${platform}, ${captions.length} captions) -> ${items.length} items  stated=${stated}  ${JSON.stringify(byKind)}`)

  if (wantDiff) {
    const existing = packFor(handle)
    if (!existing) console.error('   (no pack entry to compare)')
    else {
      const was = existing.knowledge?.items ?? []
      const wasKind = was.reduce((a, i) => ({ ...a, [i.kind]: (a[i.kind] ?? 0) + 1 }), {})
      console.error(`   pack has ${was.length} items ${JSON.stringify(wasKind)}`)
      console.error(`   stated: pack ${was.filter((i) => i.basis === 'stated').length} vs derived ${stated}`)
    }
  }
}
process.stdout.write(JSON.stringify(derived, null, 1))
