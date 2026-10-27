#!/usr/bin/env node
// REFILL_V2 OFFLINE REPLAY (#1321; plan v6.6 §32: no paid call, every switch stays OFF).
//
// For each stored script, the lines the old refill added (section 'refill', or a
// beat marked refill) are taken out, and REFILL_V2's own picker
// (relevantRefillUnits with the V2 context the edge builds: topic = her note,
// angle, niche, product) is asked what it would add to the rest. A stored refill
// line is KEPT when V2 would pick the same unit (near-duplicate text), BLOCKED
// otherwise. "After" = the script without its refill lines plus V2's picks,
// topped up to the stored script's own word count (topUpToBudget, as the gate does).
//
// Her material comes from the fictional panel fixture; panel 10's stored scripts
// from scripts/ci/fixtures/replay_panel_10_11.json and the advisor's labels from
// the craft calibration CSV (both in the repo). Panel 12's stored blueprints are
// a LOCAL snapshot (not committed): pass --p12=<file> to include them.
//
//   node --experimental-strip-types --import ./scripts/quality/tsLoader.mjs \
//     scripts/quality/refillV2Replay.mjs [--p12=<snapshot.json>] [--json] [--strict]
// --strict exits 1 when the panel-10 expectation is not met.
//
// Prints ids and counts only.
import { relevantRefillUnits, nearDuplicate, topUpToBudget } from '../../packages/shared/src/script/inventionGate.ts'
import { reshapeKeepsReferences } from '../../packages/shared/src/script/structureChecks.ts'
import { materialOf } from './structureReport.mjs'
import { readJson, PANEL_FIXTURE, labeledScripts, replayCases, p10IdsByCase, ledgerFor, scriptWords, median, arg, flag, sha256 } from './lib.mjs'

/** The advisor's expectation for panel 10 (plan v6.6 §32, panel-12-refill-ab.md). */
export const EXPECT_KEEP = ['P10-02', 'P10-09', 'P10-19']
export const EXPECT_BLOCK = ['P10-01', 'P10-05', 'P10-07', 'P10-20']

const isRefill = (b) => String(b?.section ?? '').toLowerCase() === 'refill' || b?.refill === true || b?.refill === 'true'

/** The V2 context refillContextFor() builds for a request (arm 'refill_v2'). */
export function v2Context(panel, request) {
  const { creator, targetName } = ledgerFor(panel, request)
  return { topic: request.note ?? '', angle: request.angle ?? '', v2: true, niche: [creator?.voice?.niche, creator?.voice?.sub_niche].filter(Boolean).join(' '), product: targetName ?? '' }
}

/** Replay one stored script (beats with `line` and `section`). Pure. */
export function replayOne(panel, request, beats) {
  const spoken = beats.filter((b) => String(b?.line ?? '').trim())
  const refill = spoken.filter(isRefill)
  const base = spoken.filter((b) => !isRefill(b))
  const { items, target } = ledgerFor(panel, request)
  const ctx = v2Context(panel, request)
  const picks = relevantRefillUnits(items, target, base.map((b) => String(b.line)), ctx)
  const kept = refill.filter((b) => picks.some((p) => nearDuplicate(p.text, String(b.line))))
  const before = scriptWords(spoken.map((b) => String(b.line)))
  const queue = picks.map((p) => p.text)
  const after = topUpToBudget(base.map((b) => ({ section: b.section, line: String(b.line) })), queue, before)
  const afterLines = after.script.map((b) => String(b.line))
  const beforeLines = spoken.map((b) => String(b.line))
  const changed = afterLines.length !== beforeLines.length || afterLines.some((l, i) => l !== beforeLines[i])
  return {
    changed, refs_lost: reshapeKeepsReferences(beforeLines, afterLines, materialOf(ledgerFor(panel, request))).lost.length,
    lines: spoken.length, refill_lines: refill.length, kept: kept.length, blocked: refill.length - kept.length,
    v2_picks: picks.length, v2_added: after.added, words_before: before, words_after: scriptWords(afterLines),
    verdict: refill.length === 0 ? 'no_refill' : kept.length === refill.length ? 'keep' : 'block',
  }
}

export function runPanel10(panel) {
  const labeled = labeledScripts()
  const cases = replayCases()
  const byId = p10IdsByCase(labeled, cases)
  const rows = []
  for (const [id, c] of [...byId].sort()) rows.push({ id, n: c.n, goal: c.goal, ...replayOne(panel, panel.requests[c.n], c.script) })
  return rows
}

export function runPanel12(panel, snap) {
  return snap.rows.map((r) => {
    const beats = r.l.map((line, i) => ({ line, section: r.sections?.[i] ?? '' }))
    return { id: `P12-n${String(r.n).padStart(2, '0')}`, gid: r.gid, arm: r.arm, kind: panel.requests[r.n]?.kind, ...replayOne(panel, panel.requests[r.n], beats) }
  })
}

function summary(rows) {
  const s = (k) => rows.reduce((a, r) => a + r[k], 0)
  return {
    scripts: rows.length, with_refill: rows.filter((r) => r.refill_lines).length,
    refill_lines: s('refill_lines'), kept: s('kept'), blocked: s('blocked'),
    scripts_keep: rows.filter((r) => r.verdict === 'keep').length, scripts_block: rows.filter((r) => r.verdict === 'block').length,
    v2_added: s('v2_added'), changed: rows.filter((r) => r.changed).length, reshapes_losing_an_item: rows.filter((r) => r.refs_lost > 0).length,
    words_before_median: median(rows.map((r) => r.words_before)), words_after_median: median(rows.map((r) => r.words_after)),
    words_before_total: s('words_before'), words_after_total: s('words_after'),
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isMain) {
  const panel = readJson(PANEL_FIXTURE)
  const p10 = runPanel10(panel)
  const want = [...EXPECT_KEEP.map((id) => [id, 'keep']), ...EXPECT_BLOCK.map((id) => [id, 'block'])]
  const checks = want.map(([id, exp]) => {
    const r = p10.find((x) => x.id === id)
    // A script with no stored refill line is kept by construction (V2 removes nothing).
    const got = !r ? 'missing' : r.verdict === 'no_refill' ? 'keep' : r.verdict
    return { id, expected: exp, got, ok: got === exp, refill_lines: r?.refill_lines ?? null, kept: r?.kept ?? null, blocked: r?.blocked ?? null }
  })
  const out = { panel10: { rows: p10, summary: summary(p10), expectation: checks, all_ok: checks.every((c) => c.ok) } }
  const p12path = arg('p12')
  if (p12path) {
    const snap = readJson(p12path)
    const rows = runPanel12(panel, snap)
    out.panel12 = {
      snapshot_sha256: sha256(p12path), rows, summary: summary(rows),
      by_arm: Object.fromEntries(['baseline_p10', 'refill_v2'].map((a) => [a, summary(rows.filter((r) => r.arm === a))])),
    }
  }
  if (flag('json')) { console.log(JSON.stringify(out, null, 1)); process.exit(flag('strict') && !out.panel10.all_ok ? 1 : 0) }
  console.log('REFILL_V2 offline replay (no model call)')
  console.log('panel 10 expectation:')
  for (const c of checks) console.log(`  ${c.id} expected ${c.expected.padEnd(5)} got ${c.got.padEnd(5)} ${c.ok ? 'OK ' : 'FAIL'} (refill lines ${c.refill_lines}, kept ${c.kept}, blocked ${c.blocked})`)
  const p = (t, s) => console.log(`${t}: scripts ${s.scripts}, with refill ${s.with_refill}, refill lines ${s.refill_lines} (kept ${s.kept}, blocked ${s.blocked}); scripts keep ${s.scripts_keep} / block ${s.scripts_block}; V2 adds ${s.v2_added} lines; scripts changed ${s.changed}; reshapes losing an item ${s.reshapes_losing_an_item}; words median ${s.words_before_median} -> ${s.words_after_median}, total ${s.words_before_total} -> ${s.words_after_total}`)
  p('panel 10', out.panel10.summary)
  if (out.panel12) { p('panel 12 all', out.panel12.summary); for (const [a, s] of Object.entries(out.panel12.by_arm)) p(`panel 12 ${a}`, s) }
  process.exit(flag('strict') && !out.panel10.all_ok ? 1 : 0)
}
