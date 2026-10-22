#!/usr/bin/env node
// SHADOW run of the meaning-level repeat check (docs/quality/meaning-level-repeat-check-design.md).
// Shadow = record verdicts only; nothing is cut. Fictional calibration data only.
//   node scripts/ops/shadowRepeatCheck.mjs --dry-run    count calls + estimated cost, no network
//   GEMINI_API_KEY=... node scripts/ops/shadowRepeatCheck.mjs   paid run (hard cap EVAL_REPEAT_CAP_USD, default 0.15)
// Scope: every script in craft-calibration-set.csv for panels P6, P7, P8, P10 (one call per script;
// the calibration set has no story item ids, so the whole numbered script stands in for the
// candidate pairs). Compares to repeat-ground-truth-v0.csv: recall on its ids + extra hits.
// Prints ids and line numbers only; never script text.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CALIB_DIR, loadCraftSet, parseCsv, estTokens, usd, costGuard, capFromEnv, cheapModel, callGemini,
  parseRepeatPairs, repeatRecall, truthLines, fmtPct,
} from './evalLib.mjs'

export const PANELS = ['P6', 'P7', 'P8', 'P10']
const MAX_OUT = 200

export const SYSTEM = `You check a short video script for repeated content by MEANING, not by shared words.
For each later line that retells an event, story beat or fact already told in an earlier line, decide:
- pure_repeat: retells the same event or fact with no new fact, consequence or turn.
- payoff: closes what the hook or an earlier line set up (keep).
- new_info: adds a fact, number, consequence or different angle (keep).
Only report pure_repeat pairs. Reply as JSON: {"repeats":[{"earlier":<line no>,"later":<line no>,"verdict":"pure_repeat","reason":"<under 20 words>"}]}.
Return {"repeats":[]} when nothing is repeated.`

export const userPrompt = (lines) => `Script:\n${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`

async function main() {
  const root = process.cwd()
  const dry = process.argv.includes('--dry-run')
  const model = (process.argv.find((a) => a.startsWith('--model=')) ?? '').split('=')[1] || cheapModel(root)
  const cap = capFromEnv('EVAL_REPEAT_CAP_USD', 0.15)
  const scripts = loadCraftSet(root).filter((s) => PANELS.includes(s.panel))
  const truth = parseCsv(readFileSync(join(root, CALIB_DIR, 'repeat-ground-truth-v0.csv'), 'utf8'))
  const perCall = (s) => usd(model, estTokens(SYSTEM + userPrompt(s.lines)) + 8, MAX_OUT)
  const est = scripts.reduce((a, s) => a + perCall(s), 0)
  console.log(`model=${model} scripts=${scripts.length} (${PANELS.map((p) => `${p}:${scripts.filter((s) => s.panel === p).length}`).join(' ')}) truth ids=${truth.length}`)
  console.log(`calls=${scripts.length}, est ~$${est.toFixed(4)} worst-case (max ${MAX_OUT} output tok each), cap $${cap}`)
  if (dry) return
  if (!process.env.GEMINI_API_KEY) { console.error('refusing: GEMINI_API_KEY not set (use --dry-run)'); process.exit(2) }

  const guard = costGuard(cap)
  const flagged = []
  let done = 0
  for (const s of scripts) {
    if (!guard.allows(perCall(s) * 1.25)) { console.log(`STOPPED at cost cap after ${done} scripts`); break }
    const r = await callGemini({ model, system: SYSTEM, user: userPrompt(s.lines), maxOut: MAX_OUT, json: true })
    guard.add(usd(model, r.inTok, r.outTok))
    done++
    const pairs = parseRepeatPairs(r.text, s.lines.length)
    if (pairs == null) { console.log(`${s.id} parse_error`); continue }
    if (pairs.length) flagged.push(s.id)
    console.log(`${s.id} repeats=${pairs.length ? 'Y' : 'N'}${pairs.length ? ' ' + pairs.map(([a, b]) => `${a}-${b}`).join(',') : ''}`)
  }
  const truthIds = truth.map((t) => t.script_id)
  const rr = repeatRecall(truthIds, flagged)
  console.log(`recall ${rr.hit}/${rr.n} = ${fmtPct(rr.recall)}; missed: ${rr.missed.join(',') || '-'}`)
  console.log(`extra hits (not in truth set): ${rr.extra.join(',') || '-'}`)
  console.log(`truth line hints: ${truth.map((t) => `${t.script_id}[${truthLines(t.repeat_note).join(',') || '?'}]`).join(' ')}`)
  console.log(`scripts checked ${done}/${scripts.length}, spent ~$${guard.spent.toFixed(4)}`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
