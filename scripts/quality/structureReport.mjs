#!/usr/bin/env node
// W3 STRUCTURE CHECKS, offline report (STRUCTURE_CHECKS stays OFF; nothing ships).
//
// Runs the seven deterministic checks (packages/shared/src/script/structureChecks.ts)
// on the advisor's 109 labeled scripts and, when given, on panel 12's stored
// blueprints. The advisor did not label these seven properties line by line, so
// precision / recall is measured against the labels that DO exist:
//   - "not postable" (postable = N) as the positive class: a check that fails
//     should point at a script the advisor would not post;
//   - "craft 3 or less" as a second proxy;
//   - one_story also against the rubric's named case (P10-01: unrelated stories).
// reshape_keeps_refs needs a before/after pair: it is measured on the
// SPINE_COMPLETE + POLISH_REORDER and REFILL_V2 replays (spineBestOfReplay.mjs,
// refillV2Replay.mjs), where it is reported as a count of reshapes that lost an item.
//
//   node --experimental-strip-types --import ./scripts/quality/tsLoader.mjs \
//     scripts/quality/structureReport.mjs [--index=<panel-index.json>] [--p12=<snapshot.json>] [--json]
//
// Prints ids and counts only.
import { runStructureChecks, STRUCTURE_CHECK_IDS } from '../../packages/shared/src/script/structureChecks.ts'
import { readJson, PANEL_FIXTURE, labeledWithContext, ledgerFor, prf, fmt, arg, flag, sha256 } from './lib.mjs'

/** Her material in the checks' shape. */
export function materialOf(ledger) {
  const kind = (it) => (it.origin === 'her_story' ? 'story' : it.origin === 'product_fact' ? 'product_fact' : it.origin === 'offer' ? 'offer' : it.origin === 'her_fact' ? 'fact' : 'other')
  return (ledger?.items ?? []).filter((it) => it.field !== 'note').map((it) => ({ id: it.id, text: it.text, kind: kind(it) }))
}
export function contextOf(request, ledger) {
  return { goal: request?.kind ?? undefined, material: materialOf(ledger), products: (ledger?.products ?? []).map((p) => p.name), offer: ledger?.offer ?? '' }
}

const NAMED = { one_story: { positive: ['P10-01'] } }

export async function run(indexPath, p12path) {
  const panel = readJson(PANEL_FIXTURE)
  const rows = await labeledWithContext(panel, indexPath)
  const results = rows.map((r) => ({ r, checks: runStructureChecks(r.lines, contextOf(r.request, r.ledger)) }))
  const out = { labeled: { scripts: rows.length, not_postable: rows.filter((r) => !r.postable).length, craft_le3: rows.filter((r) => r.craft <= 3).length, checks: {} } }
  for (const id of STRUCTURE_CHECK_IDS) {
    const applied = results.filter((x) => x.checks.find((c) => c.id === id).status !== 'n/a')
    const fails = (x) => x.checks.find((c) => c.id === id).status === 'fail'
    const count = (pos) => { let tp = 0, fp = 0, fn = 0; for (const x of applied) { const p = pos(x.r), f = fails(x); if (p && f) tp++; else if (!p && f) fp++; else if (p && !f) fn++ } return prf(tp, fp, fn) }
    const reasons = {}
    for (const x of applied) { const c = x.checks.find((y) => y.id === id); if (c.status === 'fail') reasons[c.reason] = (reasons[c.reason] ?? 0) + 1 }
    const entry = {
      applied: applied.length, failed: applied.filter(fails).length, reasons,
      vs_not_postable: count((r) => !r.postable), vs_craft_le3: count((r) => r.craft <= 3),
      failed_ids: applied.filter(fails).map((x) => x.r.id),
    }
    if (NAMED[id]) entry.named_cases = Object.fromEntries(NAMED[id].positive.map((n) => [n, results.find((x) => x.r.id === n)?.checks.find((c) => c.id === id).status ?? 'missing']))
    out.labeled.checks[id] = entry
  }
  if (p12path) {
    const snap = readJson(p12path)
    const per = {}
    for (const row of snap.rows) {
      const req = panel.requests[row.n]
      const lines = row.l.filter((l) => String(l ?? '').trim())
      const checks = runStructureChecks(lines, contextOf(req, ledgerFor(panel, req)))
      for (const c of checks) { const p = (per[c.id] ??= { pass: 0, fail: 0, 'n/a': 0 }); p[c.status]++ }
    }
    out.panel12 = { snapshot_sha256: sha256(p12path), scripts: snap.rows.length, checks: per }
  }
  return out
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isMain) {
  const out = await run(arg('index'), arg('p12'))
  if (flag('json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0) }
  const L = out.labeled
  console.log(`structure checks on ${L.scripts} labeled scripts (${L.not_postable} not postable, ${L.craft_le3} craft <= 3)`)
  for (const [id, e] of Object.entries(L.checks)) {
    const m = (x) => `P ${fmt(x.precision)} R ${fmt(x.recall)} (tp ${x.tp} fp ${x.fp} fn ${x.fn})`
    console.log(`  ${id.padEnd(20)} applied ${e.applied} failed ${e.failed} | vs not-postable ${m(e.vs_not_postable)} | vs craft<=3 ${m(e.vs_craft_le3)}${e.named_cases ? ` | named ${JSON.stringify(e.named_cases)}` : ''}`)
  }
  if (out.panel12) for (const [id, p] of Object.entries(out.panel12.checks)) console.log(`  panel 12 ${id.padEnd(20)} pass ${p.pass} fail ${p.fail} n/a ${p['n/a']}`)
}
