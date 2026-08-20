#!/usr/bin/env node
// COUNT THE BOUNDARIES. DO NOT JUDGE THE RENDER.
//
// ⚠️ "THE RENDER SOUNDED OKAY" IS NOT A MEASUREMENT. It averages a hundred good
// cuts with three mutilated ones into a verdict that cannot be compared against
// anything, cannot be re-run after a change, and quietly favours whatever the
// listener expected. The unit is the CUT BOUNDARY, and every one of them gets a
// label.
//
// ⚖️ THIS DECIDES WHETHER TO SPEND ~800MB. `acousticAlignment` (torch +
// torchaudio + a wav2vec2 model) is declined until a measured bad-cut rate
// justifies it — and then only if a bounded nearest-silence snap, using the
// Silero VAD ALREADY IN THE IMAGE, fails to fix it. This script produces that
// rate. Without it, adding torch would be the audio equivalent of paying for
// residential proxy egress before confirming the IP was ever the problem.
//
// ⚠️ AND IT IS DELIBERATELY NOT AUTOMATED. A model asked "does this cut sound
// clipped" would produce a number with no ears behind it. The listening is
// human; this script's job is to make the listening cheap, ordered and
// countable — it extracts every automatic cut boundary with a short window of
// audio either side, then totals whatever labels come back.
//
// USAGE
//   node scripts/measure_cut_boundaries.mjs plan <edit_plan.json> <render.mp4> <outdir>
//       → writes outdir/boundary-NNN.wav clips and outdir/score.csv with a blank
//         label column, one row per boundary, in output order.
//   node scripts/measure_cut_boundaries.mjs score <outdir>/score.csv
//       → reads the filled-in labels and prints the rate.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

/** ⚠️ THE VOCABULARY IS FIXED BEFORE LISTENING, not invented while listening.
 *  A label set that grows as you go turns disagreement into new categories and
 *  makes the first half of the set incomparable with the second. */
export const CUT_LABELS = [
  // No audible defect at the boundary.
  'clean',
  // The cut removed the start or end of a consonant — the sharpest, most
  // audible failure ("...ba—" for "bat").
  'clips_consonant',
  // The cut landed inside a vowel: a truncated, unnatural-sounding syllable.
  'clips_vowel',
  // Nothing was clipped, but a breath or a deliberate pause was removed and the
  // result sounds rushed or unnatural. A DIFFERENT defect from clipping, and one
  // that word alignment would not fix at all.
  'removes_breath_or_pause',
  // The cut happened later than intended — a leftover fragment of removed speech.
  'cuts_too_late',
  // Audibly wrong in a way none of the above describes. If this is common, the
  // vocabulary is wrong and should be revised BEFORE the next measurement round,
  // not during this one.
  'other',
]

/** ⚖️ ONLY `clean` IS GOOD. Everything else counts against, including
 *  `removes_breath_or_pause` — a cut that mangles rhythm is a bad cut even
 *  though nothing was clipped. Grading on clipping alone would report success
 *  for a snap that fixed clipping by removing every pause. */
const GOOD = new Set(['clean'])

/** How much audio to hand the listener either side of a boundary. Long enough to
 *  hear the word before and after, short enough that the boundary is obviously
 *  the thing being judged. */
const WINDOW_MS = 900

function fail(msg) { console.error(msg); process.exit(1) }

/** Every automatic cut boundary in output time order.
 *
 *  ⚠️ AUTOMATIC ONLY. A boundary the creator placed by hand is their decision
 *  and not evidence about our cutting; pooling the two would let manual edits
 *  flatter or damn the automatic ones. */
function boundariesFromPlan(plan) {
  const segs = plan?.segments ?? plan?.timeline ?? plan?.cuts
  if (!Array.isArray(segs)) {
    fail('could not find an array of segments in the edit plan (looked for .segments, .timeline, .cuts).\n'
      + 'This script does not guess at a shape — point it at the right field rather than letting it invent boundaries.')
  }
  const out = []
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i]
    const source = s?.source ?? s?.origin ?? 'automatic'
    if (source === 'manual') continue
    const at = s?.outputEndMs ?? s?.endMs ?? s?.end
    if (typeof at === 'number' && Number.isFinite(at)) out.push({ index: out.length, atMs: at })
  }
  return out
}

function cutClips(renderPath, boundaries, outdir) {
  mkdirSync(outdir, { recursive: true })
  const rows = ['boundary_index,at_ms,clip,label,note']
  for (const b of boundaries) {
    const startSec = Math.max(0, (b.atMs - WINDOW_MS) / 1000)
    const clip = join(outdir, `boundary-${String(b.index).padStart(3, '0')}.wav`)
    const r = spawnSync('ffmpeg', ['-y', '-ss', String(startSec), '-i', renderPath,
      '-t', String((WINDOW_MS * 2) / 1000), '-vn', '-ac', '1', '-ar', '16000', clip],
      { stdio: 'ignore' })
    // ⚠️ A CLIP THAT DID NOT EXTRACT IS RECORDED, NOT SKIPPED. Dropping it would
    // shrink the denominator and flatter the rate.
    rows.push([b.index, b.atMs, r.status === 0 ? clip : 'EXTRACT_FAILED', '', ''].join(','))
  }
  const csv = join(outdir, 'score.csv')
  writeFileSync(csv, rows.join('\n') + '\n')
  console.log(`${boundaries.length} automatic boundaries → ${csv}`)
  console.log(`Listen to each clip and fill the label column with one of:\n  ${CUT_LABELS.join(', ')}`)
}

function score(csvPath) {
  const lines = readFileSync(csvPath, 'utf8').trim().split('\n').slice(1).filter(Boolean)
  const counts = Object.fromEntries(CUT_LABELS.map((l) => [l, 0]))
  let unlabelled = 0, unknown = []
  for (const line of lines) {
    const label = (line.split(',')[3] ?? '').trim()
    if (label === '') { unlabelled++; continue }
    if (!(label in counts)) { unknown.push(label); continue }
    counts[label]++
  }
  if (unknown.length) {
    fail(`unrecognised labels: ${[...new Set(unknown)].join(', ')}\n`
      + 'The vocabulary is fixed before listening. Fix the typo, or revise CUT_LABELS deliberately and re-score the whole set.')
  }
  const reviewed = Object.values(counts).reduce((a, b) => a + b, 0)
  // ⚠️ UNLABELLED ROWS ARE REPORTED, NEVER TREATED AS CLEAN. A half-finished
  // review that reads as a good result is worse than no review.
  if (reviewed === 0) fail('nothing labelled yet — no rate to report.')
  const bad = CUT_LABELS.filter((l) => !GOOD.has(l)).reduce((a, l) => a + counts[l], 0)
  console.log(`reviewed ${reviewed} boundaries` + (unlabelled ? `, ${unlabelled} STILL UNLABELLED (not counted)` : ''))
  for (const l of CUT_LABELS) if (counts[l]) console.log(`  ${l.padEnd(24)} ${counts[l]}`)
  console.log(`\naudible_bad_cut_rate = ${bad}/${reviewed} = ${(bad / reviewed * 100).toFixed(1)}%`)
  console.log('\nWhat this rate decides:')
  console.log('  negligible → delete the problem from the roadmap. Not fixing a defect users')
  console.log('               do not have is the cheapest outcome available.')
  console.log('  material   → bounded nearest-silence snap using the Silero VAD already in')
  console.log('               the image, then RE-MEASURE THESE SAME BOUNDARIES.')
  console.log('  residual   → only then is acoustic alignment (torch) worth pricing.')
}

const [mode, ...rest] = process.argv.slice(2)
if (mode === 'plan') {
  const [planPath, renderPath, outdir] = rest
  if (!planPath || !renderPath || !outdir) fail('usage: plan <edit_plan.json> <render.mp4> <outdir>')
  cutClips(renderPath, boundariesFromPlan(JSON.parse(readFileSync(planPath, 'utf8'))), outdir)
} else if (mode === 'score') {
  const [csvPath] = rest
  if (!csvPath) fail('usage: score <score.csv>')
  score(csvPath)
} else {
  fail('usage: measure_cut_boundaries.mjs plan|score ...')
}
