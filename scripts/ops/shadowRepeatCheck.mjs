#!/usr/bin/env node
// SHADOW run of the meaning-level repeat check (docs/quality/meaning-level-repeat-check-design.md).
// Shadow = record verdicts only; nothing is cut. Fictional calibration data only.
//   node scripts/ops/shadowRepeatCheck.mjs --dry-run    count calls + estimated cost, no network
//   GEMINI_API_KEY=... node scripts/ops/shadowRepeatCheck.mjs   paid run (hard cap EVAL_REPEAT_CAP_USD, default 0.15)
// Scope: every script in craft-calibration-set.csv for panels P6, P7, P8, P10 (one call per script;
// the calibration set has no story item ids, so the whole numbered script stands in for the
// candidate pairs). Compares to repeat-ground-truth-v0.csv: recall on its ids + extra hits.
// Prints ids and line numbers only; never script text. --out=FILE writes the same (ids/line numbers/scores) as JSON.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CALIB_DIR, loadCraftSet, parseCsv, estTokens, usd, costGuard, capFromEnv, cheapModel, callGemini,
  parseRepeatPairs, repeatRecall, truthLines, fmtPct, writeResultsJson,
  nullGuard, MIN_MAX_OUT,
} from './evalLib.mjs'

export const PANELS = ['P6', 'P7', 'P8', 'P10']
const MAX_OUT = MIN_MAX_OUT // thinking tokens count here; see callGemini
const EST_OUT = 300 // typical thoughts + answer, for planning; the cost guard charges real usage

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
  const perCall = (s) => usd(model, estTokens(SYSTEM + userPrompt(s.lines)) + 8, EST_OUT)
  const est = scripts.reduce((a, s) => a + perCall(s), 0)
  console.log(`model=${model} scripts=${scripts.length} (${PANELS.map((p) => `${p}:${scripts.filter((s) => s.panel === p).length}`).join(' ')}) truth ids=${truth.length}`)
  console.log(`calls=${scripts.length}, est ~$${est.toFixed(4)} (~${EST_OUT} output tok each incl. thinking), cap $${cap}`)
  const out = { eval: 'repeat-shadow', mode: dry ? 'dry-run' : 'paid', model, cap_usd: cap, script_ids: scripts.map((s) => s.id), est_usd: est }
  if (dry) return writeResultsJson(process.argv, out)
  if (!process.env.GEMINI_API_KEY) { console.error('refusing: GEMINI_API_KEY not set (use --dry-run)'); process.exit(2) }

  const guard = costGuard(cap)
  const flagged = []
  const rows = []
  let done = 0, errors = 0
  const ng = nullGuard()
  for (const s of scripts) {
    if (!guard.allows(perCall(s) * 1.25)) { console.log(`STOPPED at cost cap after ${done} scripts`); break }
    const r = await callGemini({ model, system: SYSTEM, user: userPrompt(s.lines), maxOut: MAX_OUT, json: true })
    guard.add(usd(model, r.inTok, r.outTok))
    done++
    const pairs = parseRepeatPairs(r.text, s.lines.length)
    ng.add(pairs == null)
    if (pairs == null) {
      errors++
      console.log(`${s.id} parse_error finishReason=${r.finishReason} text=${JSON.stringify(r.text.slice(0, 80))}`); rows.push({ id: s.id, parse_error: true })
      if (ng.shouldStop()) {
        console.error(`ABORTED: ${ng.nulls}/${ng.calls} unparsable responses in the first calls; spent ~$${guard.spent.toFixed(4)}`)
        writeResultsJson(process.argv, { ...out, aborted_null_verdicts: true, results: rows, spent_usd: guard.spent })
        process.exit(3)
      }
      continue
    }
    if (ng.shouldStop()) { console.error('ABORTED: too many unparsable responses in the first calls'); writeResultsJson(process.argv, { ...out, aborted_null_verdicts: true, results: rows, spent_usd: guard.spent }); process.exit(3) }
    rows.push({ id: s.id, repeats: pairs.map(([a, b]) => [a, b]) })
    if (pairs.length) flagged.push(s.id)
    console.log(`${s.id} repeats=${pairs.length ? 'Y' : 'N'}${pairs.length ? ' ' + pairs.map(([a, b]) => `${a}-${b}`).join(',') : ''}`)
  }
  const truthIds = truth.map((t) => t.script_id)
  const rr = repeatRecall(truthIds, flagged)
  console.log(`recall ${rr.hit}/${rr.n} = ${fmtPct(rr.recall)}; missed: ${rr.missed.join(',') || '-'}`)
  console.log(`extra hits (not in truth set): ${rr.extra.join(',') || '-'}`)
  console.log(`truth line hints: ${truth.map((t) => `${t.script_id}[${truthLines(t.repeat_note).join(',') || '?'}]`).join(' ')}`)
  console.log(`scripts checked ${done}/${scripts.length}, spent ~$${guard.spent.toFixed(4)}`)
  writeResultsJson(process.argv, { ...out, results: rows, recall: rr.recall, hit: rr.hit, n_truth: rr.n, missed: rr.missed, extra: rr.extra, checked: done, parse_errors: errors, spent_usd: guard.spent })
  if (errors) { console.error(`ERROR: ${errors} unparsable responses; recall is not trustworthy`); process.exit(3) }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
