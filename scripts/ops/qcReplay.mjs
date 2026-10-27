#!/usr/bin/env node
// OFFLINE QC ACCEPTANCE REPLAY (plan v6.8 §33). Deterministic: no model, no
// network, no database. Replays the stored FICTIONAL panel 10/11/12 scripts
// (scripts/ci/fixtures/replay_panel_10_11.json, replay_panel_12.json) through
// the Quality Controller with each request's ledger rebuilt from
// scripts/ops/fixtures/fictional-panel.json. Prints ids and counts only.
//   node scripts/ops/qcReplay.mjs            summary + acceptance (exit 1 on a miss)
//   node scripts/ops/qcReplay.mjs --items    + one row per item
//   node scripts/ops/qcReplay.mjs --json     machine-readable
import { buildSync } from 'esbuild'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const dir = mkdtempSync(join(tmpdir(), 'qc-replay-'))
const out = join(dir, 'qcReplay.mjs')
try {
  buildSync({ entryPoints: [join(root, 'packages/shared/src/script/qcReplay.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' })
  const q = await import(pathToFileURL(out).href)
  const fx = JSON.parse(readFileSync(join(here, 'fixtures/fictional-panel.json'), 'utf8'))
  const p1011 = JSON.parse(readFileSync(join(root, 'scripts/ci/fixtures/replay_panel_10_11.json'), 'utf8')).cases
  const p12 = JSON.parse(readFileSync(join(root, 'scripts/ci/fixtures/replay_panel_12.json'), 'utf8')).cases
  const r = q.qcReplayAll([...p1011, ...p12], fx.creators, fx.requests)
  const p10Judge = r.panels['panel-current-10'].judge_mean_before
  const arms = {}
  for (const a of ['baseline_p10', 'refill_v2']) {
    const its = r.items.filter((i) => i.batch === 'panel-current-12' && i.arm === a)
    if (its.length) arms[`panel-current-12/${a}`] = q.qcMetrics(its)
  }
  const vsP10 = q.judgeVsP10(r.items)
  const accept = q.qcAcceptance(r.all, vsP10)
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ panels: r.panels, arms, all: r.all, p10_baseline_judge: p10Judge, judge_vs_p10: vsP10, acceptance: accept, items: r.items.map((i) => ({ batch: i.batch, n: i.n, id: i.id, arm: i.arm, words: [i.words_before, i.words_after], judge: [i.judge_before, i.judge_after], repeats: [i.repeats_before, i.repeats_after], flags: [i.flags_before, i.flags_after], added: i.report.added.map((a) => `${a.kind}:${a.id}`), refused: [...new Set(i.report.refused.map((x) => x.reason))], removed_repeats: i.report.removed_repeats, story_hook: i.report.story_hook, thin: i.report.thin, question: i.report.question, chosen: i.report.best_of_n.chosen, beats_met: i.report.beats_met })) }, null, 1))
  } else {
    for (const [k, m] of Object.entries({ ...r.panels, ...arms, all: r.all })) console.log(`${k.padEnd(32)} ${JSON.stringify(m)}`)
    console.log(`P10 baseline judge mean: ${p10Judge}`)
    for (const [k, v] of Object.entries(vsP10)) console.log(`judge vs P10 (same requests) ${k}: ${JSON.stringify(v)}`)
    if (process.argv.includes('--items')) for (const i of r.items) console.log(`${i.batch} ${i.id} ${i.arm ?? '-'} words ${i.words_before}->${i.words_after} judge ${i.judge_before}->${i.judge_after} rep ${i.repeats_before}->${i.repeats_after} flags ${i.flags_before}->${i.flags_after} added=[${i.report.added.map((a) => `${a.kind}:${a.id}`).join(',')}] refused=[${[...new Set(i.report.refused.map((x) => x.reason))].join(',')}] thin=${i.report.thin ?? '-'}`)
    if (accept.length) { for (const v of accept) console.error(`  ✗ ${v}`); process.exitCode = 1 } else console.log('QC acceptance OK')
  }
} finally { rmSync(dir, { recursive: true, force: true }) }
