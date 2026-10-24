#!/usr/bin/env node
// Calibrates the deterministic craft and hook judges on the advisor-labeled sets.
// FIT ON P5-P8 ONLY; P10 IS HELD OUT. Prints fitted weights and train/test metrics.
// No model calls, no network, no DB.
//
//   node --experimental-strip-types scripts/calibrate-judges.mjs          # report with shipped weights
//   node --experimental-strip-types scripts/calibrate-judges.mjs --fit    # refit on train, print weights
import { readFileSync } from 'node:fs'
import { hookFeatures, HOOK_FEATURES, HOOK_WEIGHTS, scoreHook } from '../packages/shared/src/script/hookJudge.ts'
import { craftFeatures, CRAFT_FEATURES, CRAFT_WEIGHTS, scoreCraft, splitScriptText } from '../packages/shared/src/script/craftJudge.ts'
import { parseCsv, spearman, within1, ridge } from '../packages/shared/src/script/judgeStats.ts'

const DIR = 'packages/shared/src/script/__tests__/fixtures/calibration/'
const TRAIN = new Set(['P5', 'P6', 'P7', 'P8'])
const fit = process.argv.includes('--fit')

const hooks = parseCsv(readFileSync(DIR + 'hook-calibration-set.csv', 'utf8'))
const scripts = parseCsv(readFileSync(DIR + 'craft-calibration-set.csv', 'utf8'))

function report(name, rows, pred, gold) {
  for (const [split, keep] of [['train P5-P8', (r) => TRAIN.has(r.panel)], ['test  P10  ', (r) => r.panel === 'P10']]) {
    const rs = rows.filter(keep)
    const p = rs.map(pred), g = rs.map(gold)
    console.log(`${name} ${split} n=${rs.length} spearman=${spearman(p.map((x) => x.raw), g).toFixed(3)} within1=${(100 * within1(p.map((x) => x.score), g)).toFixed(1)}%`)
  }
}

let hw = HOOK_WEIGHTS
let cw = CRAFT_WEIGHTS
if (fit) {
  const tr = hooks.filter((r) => TRAIN.has(r.panel))
  const X = tr.map((r) => HOOK_FEATURES.map((k) => hookFeatures(r.hook, { invented: r.invented === 'Y' })[k]))
  const b = ridge(X, tr.map((r) => Number(r.scroll_1_5)), 1)
  hw = { intercept: +b[0].toFixed(2), ...Object.fromEntries(HOOK_FEATURES.map((k, i) => [k, +b[i + 1].toFixed(2)])) }
  console.log('HOOK_WEIGHTS', JSON.stringify(hw))
  const trc = scripts.filter((r) => TRAIN.has(r.panel))
  const Xc = trc.map((r) => CRAFT_FEATURES.map((k) => craftFeatures(splitScriptText(r.script_text))[k]))
  const bc = ridge(Xc, trc.map((r) => Number(r.craft_1_7)), 5)
  cw = { intercept: +bc[0].toFixed(2), ...Object.fromEntries(CRAFT_FEATURES.map((k, i) => [k, +bc[i + 1].toFixed(2)])) }
  console.log('CRAFT_WEIGHTS', JSON.stringify(cw))
}
report('hook ', hooks, (r) => scoreHook(r.hook, { invented: r.invented === 'Y', weights: hw }), (r) => Number(r.scroll_1_5))
report('craft', scripts, (r) => { const s = scoreCraft(splitScriptText(r.script_text), { weights: cw }); return { raw: s.raw, score: s.craft } }, (r) => Number(r.craft_1_7))
