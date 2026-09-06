#!/usr/bin/env node
// THE COMPARISON THE BASELINE NAMED AND NOBODY HAD WIRED.
//
// ⚠️ `referenceBorrowingBaseline.test.ts` ends in a test that SKIPS without a
// key and, with one, throws `UNWIRED`. It named the comparison precisely and
// left it unbuilt, which is the honest thing to have done and is not a state to
// leave forever. This is that comparison.
//
// ⚠️⚠️ IT IS NOT A RE-RUN OF THE FIXTURES, AND THAT DISTINCTION IS THE WHOLE
// DESIGN. The four frozen runs are PRE-FIX artefacts: re-measuring them returns
// 26 / 4 / 17 by construction, because that is what freezing means. A diff there
// would mean somebody edited a fixture, never that borrowing fell. To observe a
// reduction you must generate NEW text under the changed condition.
//
// ⚖️ SO THIS IS A PAIRED A/B ON THE MECHANISM ITSELF, not a diff against a
// number that cannot move. For each fixture it builds TWO prompts from the SAME
// brief that differ in exactly one respect:
//
//     arm WITH     the reference transcript is in the prompt   (pre-fix)
//     arm WITHOUT  only the reference's SHAPE is described     (post-fix)
//
// and measures each generated script against the reference with the same
// `measureVerbatimOverlap` the baseline uses. The fixture's own stored script
// is reported alongside as a third point — the thing the shipped writer
// actually produced.
//
// ⚠️ ARM SYMMETRY IS ASSERTED, NOT ASSUMED. The two prompts are diffed before
// any model call and the run ABORTS unless they differ only inside the
// reference block. An A/B whose arms drifted in some other respect measures the
// drift.
//
// ⚠️ AND IT REFUSES TO DECLARE A RESULT. Four runs, one sample each by default,
// against a nondeterministic model. This prints the numbers and says what they
// do not establish. `--samples N` raises it; nothing here computes a p-value,
// because four runs cannot carry one.
//
// USAGE:  GEMINI_API_KEY=... node scripts/qa/borrowing-rerun.mjs [--samples 3] [--runs a,d]

import { readFileSync, mkdtempSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { build } from 'esbuild'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// ⚠️ THE REAL MEASURE, BUNDLED — NEVER A COPY OF IT. A harness that retyped
// `measureVerbatimOverlap` would report on a measure nobody ships, which is the
// exact failure `run-eval.mjs` records for its own retyped `selectSpeakable`.
// Node cannot import the shared TS directly (its internal specifiers end in
// `.js`), so esbuild — the compiler this repo already builds with — bundles it.
const out = join(mkdtempSync(join(tmpdir(), 'borrowing-')), 'measure.mjs')
await build({
  entryPoints: [join(REPO, 'packages/shared/src/script/verbatimOverlap.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
})
const { measureVerbatimOverlap, HIGH_OVERLAP_RUN_WORDS } = await import(pathToFileURL(out).href)
const DRY = process.argv.includes('--dry-run')
const KEY = process.env.GEMINI_API_KEY
// ⚖️ `--dry-run` EXERCISES EVERYTHING EXCEPT THE MODEL CALL, so the wiring can
// be proved without a key and the only untested step is the one that needs one.
// It also re-derives the frozen numbers with the bundled measure: if those do
// not match `referenceBorrowingBaseline`, the harness is measuring differently
// from the baseline it is meant to be compared against, and nothing it prints
// later would mean anything.
if (!KEY && !DRY) {
  console.error('set GEMINI_API_KEY. This comparison CANNOT run without a model call —')
  console.error('the fixtures are pre-fix artefacts and re-measuring them proves nothing.')
  console.error('(`--dry-run` checks the wiring and the measure without one.)')
  process.exit(1)
}

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const SAMPLES = Math.max(1, Number(argOf('--samples', '1')) || 1)
const RUNS = String(argOf('--runs', 'a,b,c,d')).split(',').map((s) => s.trim()).filter(Boolean)

function loadRun(id) {
  return JSON.parse(readFileSync(join(REPO, `eval/fixtures/live-runs/run-${id}.json`), 'utf8'))
}

/** The one block that differs between arms. Everything else is shared text. */
function referenceBlock(run, withText) {
  return withText
    ? `THE REFERENCE, TRANSCRIBED:\n"""\n${run.reference.text}\n"""\n`
      + 'Adapt its approach for this creator.'
    : 'THE REFERENCE\'S SHAPE, DESCRIBED (its words are deliberately withheld):\n'
      + `  · it runs about ${run.ui_header?.claimed_seconds ?? 30} seconds\n`
      + `  · it moves through about ${run.ui_header?.claimed_scenes ?? 4} scenes\n`
      + '  · borrow the ORDER and the function of its beats, never its sentences.'
}

function buildPrompt(run, withText) {
  const s = run.settings ?? {}
  return [
    'Write a short-form video script for this creator.',
    '',
    `TOPIC: ${s.subject ?? '(unstated)'}`,
    `GOAL: ${s.goal ?? '(unstated)'}`,
    `TONE: ${s.tone ?? '(unstated)'}`,
    `THE CREATOR'S NOTE: ${run.reference?.note ?? '(none)'}`,
    '',
    referenceBlock(run, withText),
    '',
    'Write in THIS creator\'s own words about THEIR own subject. Do not reproduce',
    'sentences from anybody else. Return JSON: {"script":[{"line":"..."}]}.',
  ].join('\n')
}

/**
 * ⚠️ THE ARMS MUST DIFFER ONLY IN THE REFERENCE BLOCK. Replacing each arm's own
 * block with a placeholder must leave two identical strings; anything else means
 * the A/B is measuring something it did not intend to.
 */
function assertArmSymmetry(run) {
  const strip = (withText) =>
    buildPrompt(run, withText).replace(referenceBlock(run, withText), '<<REFERENCE BLOCK>>')
  if (strip(true) !== strip(false)) {
    console.error(`ABORT: run-${run.id}'s two arms differ outside the reference block.`)
    console.error('An A/B whose arms drifted measures the drift, not the mechanism.')
    process.exit(1)
  }
}

async function generate(prompt) {
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + KEY,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 1 },
      }),
    },
  )
  if (!r.ok) throw new Error(`model call failed: ${r.status} ${await r.text()}`)
  const j = await r.json()
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const parsed = JSON.parse(text)
  if (!Array.isArray(parsed?.script)) throw new Error('model returned no script array')
  return parsed.script
}

const rows = []
for (const id of RUNS) {
  const run = loadRun(id)
  assertArmSymmetry(run)
  const ref = run.reference.text

  // The third point: what the SHIPPED writer actually produced, frozen.
  const frozen = measureVerbatimOverlap(run.generation.blueprint.script, ref)

  if (DRY) {
    rows.push({
      run: id, arm: 'dry-run (no model call)', sample: 0,
      sentences: frozen.sentences, high: frozen.highOverlapSentences,
      longestRun: frozen.longestRun,
      frozenHigh: frozen.highOverlapSentences, frozenLongest: frozen.longestRun,
    })
    continue
  }
  for (const arm of ['with', 'without']) {
    for (let i = 0; i < SAMPLES; i++) {
      let m
      try {
        m = measureVerbatimOverlap(await generate(buildPrompt(run, arm === 'with')), ref)
      } catch (e) {
        console.error(`run-${id} ${arm} sample ${i + 1}: ${e.message}`)
        continue
      }
      rows.push({
        run: id, arm, sample: i + 1,
        sentences: m.sentences, high: m.highOverlapSentences, longestRun: m.longestRun,
        frozenHigh: frozen.highOverlapSentences, frozenLongest: frozen.longestRun,
      })
    }
  }
}

// ⚠️ THE SELF-CHECK. Over all four runs the frozen fixtures measure
// 26 sentences / 4 high / longest 17 — the figures `referenceBorrowingBaseline`
// pins. A mismatch means the bundled measure and the baseline disagree, and the
// comparison must not be quoted until that is explained.
if (DRY && RUNS.length === 4) {
  const t = rows.reduce((a, r) => ({
    sentences: a.sentences + r.sentences, high: a.high + r.high,
    worst: Math.max(a.worst, r.longestRun),
  }), { sentences: 0, high: 0, worst: 0 })
  const ok = t.sentences === 26 && t.high === 4 && t.worst === 17
  console.error(ok
    ? 'self-check OK: frozen fixtures re-derive 26 / 4 / 17, matching referenceBorrowingBaseline.'
    : `SELF-CHECK FAILED: got ${t.sentences} / ${t.high} / ${t.worst}, expected 26 / 4 / 17.`)
  if (!ok) process.exit(1)
}

console.log(JSON.stringify({
  measure: { name: 'measureVerbatimOverlap', highOverlapRunWords: HIGH_OVERLAP_RUN_WORDS },
  dryRun: DRY || undefined,
  samplesPerArm: SAMPLES,
  rows,
  // ⚠️ STATED IN THE OUTPUT SO A READER CANNOT QUOTE THE TABLE WITHOUT IT.
  whatThisDoesNotEstablish: [
    `${RUNS.length} runs x ${SAMPLES} sample(s) per arm against a nondeterministic model.`,
    'No significance is computed and none should be claimed from this alone.',
    'run-b is the NEGATIVE CONTROL: it has zero overlap frozen. If the WITHOUT arm',
    'raises run-b above zero, the harness or the prompt is at fault, not the writer.',
    'The frozen columns are the shipped writer pre-fix; they are context, not an arm.',
  ],
}, null, 2))
