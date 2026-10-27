#!/usr/bin/env node
// SPINE_COMPLETE + POLISH_REORDER (#1310) and BEST_OF_N_JUDGE (#1311), offline replay.
// Plan v6.6 §32: no paid call; every switch stays OFF; this only measures.
//
// SPINE / ENDING: on every stored script, completeSpine() (her problem item after
// the hook, exactly one CTA at the end, her offer when no CTA) then reorderEnding()
// (her most specific line before the CTA). Reports how many scripts change and the
// FREE rule-based craft judge (craftJudge.ts scoreCraft) before and after, plus
// whether every reshape kept her items (structureChecks reshapeKeepsReferences).
//
// BEST-OF-N: the same 24 requests were run in panels 10, 11 and 12, so each has
// up to three stored drafts. Scenario A: panel 12 shipped; candidates = the
// panel 10, 11 and 12 drafts. Scenario B: panel 11 shipped (odd requests were
// Plan B there); candidates = the panel 10 and 11 drafts. Rules (craftJudge.ts):
// only candidates with ZERO blocking flags (targeted flags v2 + wrong product)
// are compared; when the shipped draft is not eligible nothing is compared and
// it ships; a tie keeps the shipped draft; a shipped Plan B script is NEVER swapped out.
//
//   node --experimental-strip-types --import ./scripts/quality/tsLoader.mjs \
//     scripts/quality/spineBestOfReplay.mjs [--index=<panel-index.json>] [--p12=<snapshot.json>] [--json]
//
// Prints ids and counts only.
import { completeSpine, reorderEnding, reorderCheck } from '../../packages/shared/src/script/planner/spineComplete.ts'
import { scoreCraft, checkCandidate } from '../../packages/shared/src/script/craftJudge.ts'
import { reshapeKeepsReferences } from '../../packages/shared/src/script/structureChecks.ts'
import { readJson, PANEL_FIXTURE, labeledWithContext, replayCases, ledgerFor, mean, r2, arg, flag, sha256 } from './lib.mjs'
import { flagItems } from './flagsV2Report.mjs'
import { materialOf } from './structureReport.mjs'

const spoken = (beats) => beats.map((b) => String(b?.line ?? '').trim()).filter(Boolean)
const craft = (lines) => (lines.length ? scoreCraft(lines) : { raw: 0, craft: 0 })

/** SPINE_COMPLETE then POLISH_REORDER on one script, as the edge and worker would (trial on). */
export function spineOne(beats, request, ledger) {
  const items = ledger?.items ?? []
  const material = items.filter((it) => it.first_party && it.origin !== 'offer' && it.origin !== 'product_fact' && it.field !== 'note').map((it) => ({ id: it.id, text: it.text }))
  const offerIt = items.find((it) => it.origin === 'offer')
  const input = { material, offer: offerIt ? { id: offerIt.id, text: offerIt.text } : null, topic: [request?.note, ledger?.targetName].filter(Boolean).join(' ') }
  const before = beats.filter((b) => String(b?.line ?? '').trim()).map((b) => ({ section: b.section, line: String(b.line) }))
  const sp = completeSpine(before, input)
  const ro = reorderEnding(sp.script)
  const ok = reorderCheck(sp.script, ro.next).ok
  const after = ok ? ro.next : sp.script
  const bl = spoken(before), al = spoken(after)
  const changed = bl.length !== al.length || bl.some((l, i) => l !== al[i])
  const refs = reshapeKeepsReferences(bl, al, materialOf(ledger))
  return {
    changed, spine_changed: !!(sp.record.problem_added || sp.record.ctas_removed || sp.record.cta_moved || sp.record.cta_appended),
    reorder_changed: ok && (ro.record.moved_specific || ro.record.trimmed > 0 || spoken(sp.script).some((l, i) => l !== spoken(ro.next)[i])),
    reorder_refused: !ok, problem_added: !!sp.record.problem_added, cta_appended: !!sp.record.cta_appended, ctas_removed: sp.record.ctas_removed,
    refs_lost: refs.lost.length,
    before: craft(bl), after: craft(al),
  }
}

function spineSummary(rows) {
  const ch = rows.filter((r) => r.changed)
  return {
    scripts: rows.length, changed: ch.length, spine_changed: rows.filter((r) => r.spine_changed).length, reorder_changed: rows.filter((r) => r.reorder_changed).length,
    reorder_refused: rows.filter((r) => r.reorder_refused).length, problem_added: rows.filter((r) => r.problem_added).length, cta_appended: rows.filter((r) => r.cta_appended).length,
    ctas_removed: rows.reduce((a, r) => a + r.ctas_removed, 0), reshapes_losing_an_item: rows.filter((r) => r.refs_lost > 0).length,
    craft_raw_mean_before: r2(mean(rows.map((r) => r.before.raw))), craft_raw_mean_after: r2(mean(rows.map((r) => r.after.raw))),
    craft_int_mean_before: r2(mean(rows.map((r) => r.before.craft))), craft_int_mean_after: r2(mean(rows.map((r) => r.after.craft))),
    changed_raw_mean_before: r2(mean(ch.map((r) => r.before.raw))), changed_raw_mean_after: r2(mean(ch.map((r) => r.after.raw))),
    up: rows.filter((r) => r.after.raw > r.before.raw + 1e-9).length, down: rows.filter((r) => r.after.raw < r.before.raw - 1e-9).length,
  }
}

/** Best-of-N over stored drafts of one request. `shipped` is the key of the draft today's code ships. */
export function bestOfN(cands, shipped, ctx) {
  const checks = Object.fromEntries(Object.entries(cands).map(([k, c]) => [k, { ...checkCandidate(c.lines, ctx), plan_b: !!c.plan_b }]))
  const s = checks[shipped]
  let chosen = shipped, reason = 'compared'
  if (cands[shipped].plan_b) reason = 'plan_b_kept'
  else if (!s.eligible) reason = 'shipped_not_eligible'
  else {
    const elig = Object.entries(checks).filter(([, c]) => c.eligible)
    if (elig.length < 2) reason = 'fewer_than_two_eligible'
    else for (const [k, c] of elig) if (c.score > checks[chosen].score) chosen = k
  }
  return { chosen, swapped: chosen !== shipped, reason, checks }
}

export async function run(indexPath, p12path) {
  const panel = readJson(PANEL_FIXTURE)
  const out = { spine: {}, best_of_n: {} }
  // Spine on the labeled scripts (with the advisor's craft for reference) ...
  const labeled = await labeledWithContext(panel, indexPath)
  const lab = labeled.map((r) => ({ id: r.id, advisor: r.craft, ...spineOne(r.lines.map((line) => ({ line })), r.request, r.ledger) }))
  out.spine.labeled = { ...spineSummary(lab), advisor_craft_mean_changed: r2(mean(lab.filter((r) => r.changed).map((r) => r.advisor))), advisor_craft_mean_unchanged: r2(mean(lab.filter((r) => !r.changed).map((r) => r.advisor))) }
  // ... on panels 10 and 11 stored (repo fixture) ...
  const cases = replayCases()
  for (const b of ['panel-current-10', 'panel-current-11']) {
    const rows = [...cases.values()].filter((c) => c.batch === b).map((c) => { const req = panel.requests[c.n]; return { id: `${b}#${c.n}`, ...spineOne(c.script, req, ledgerFor(panel, req)) } })
    out.spine[b] = spineSummary(rows)
  }
  // ... and on panel 12 (local snapshot).
  let snap = null
  if (p12path) {
    snap = readJson(p12path)
    const rows = snap.rows.map((r) => { const req = panel.requests[r.n]; return { id: `P12-n${r.n}`, ...spineOne(r.l.map((line, i) => ({ line, section: r.sections?.[i] })), req, ledgerFor(panel, req)) } })
    out.spine['panel-current-12'] = { snapshot_sha256: sha256(p12path), ...spineSummary(rows) }
  }
  // Best-of-N.
  const scen = (name, shippedKey, keys) => {
    const rows = []
    for (let n = 0; n < 24; n++) {
      const req = panel.requests[n]
      const led = ledgerFor(panel, req)
      const ctx = { items: flagItems(led), products: led.products, v2: true, wrongProduct: true }
      const cands = {}
      for (const k of keys) {
        if (k === 'p12') { const r = snap?.rows.find((x) => x.n === n); if (r) cands.p12 = { lines: r.l.filter((l) => String(l ?? '').trim()), plan_b: false } }
        else { const c = cases.get(`panel-current-${k.slice(1)}#${n}`); if (c) cands[k] = { lines: spoken(c.script), plan_b: k === 'p11' && n % 2 === 1 } }
      }
      if (!cands[shippedKey]) continue
      const res = bestOfN(cands, shippedKey, ctx)
      rows.push({ n, ...res, before: craft(cands[shippedKey].lines).raw, after: craft(cands[res.chosen].lines).raw })
    }
    const reasons = rows.reduce((a, r) => ({ ...a, [r.reason]: (a[r.reason] ?? 0) + 1 }), {})
    const allC = rows.flatMap((r) => Object.values(r.checks))
    out.best_of_n[name] = {
      requests: rows.length, candidates: allC.length, eligible_candidates: allC.filter((c) => c.eligible).length, plan_b_shipped: rows.filter((r) => r.reason === 'plan_b_kept').length,
      swapped: rows.filter((r) => r.swapped).length, reasons,
      chosen_from: rows.reduce((a, r) => ({ ...a, [r.chosen]: (a[r.chosen] ?? 0) + 1 }), {}),
      craft_raw_mean_before: r2(mean(rows.map((r) => r.before))), craft_raw_mean_after: r2(mean(rows.map((r) => r.after))),
      swapped_requests: rows.filter((r) => r.swapped).map((r) => `n${r.n}:${r.chosen}`),
      plan_b_never_swapped: rows.filter((r) => r.checks[shippedKey].plan_b).every((r) => !r.swapped),
    }
  }
  if (snap) scen('A_shipped_p12', 'p12', ['p10', 'p11', 'p12'])
  scen('B_shipped_p11', 'p11', ['p10', 'p11'])
  return out
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isMain) {
  const out = await run(arg('index'), arg('p12'))
  if (flag('json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0) }
  for (const [k, s] of Object.entries(out.spine)) console.log(`spine+reorder ${k}: ${s.scripts} scripts, changed ${s.changed} (spine ${s.spine_changed}, reorder ${s.reorder_changed}, refused ${s.reorder_refused}); problem added ${s.problem_added}, offer CTA appended ${s.cta_appended}, extra CTAs removed ${s.ctas_removed}; reshapes losing an item ${s.reshapes_losing_an_item}; craft raw mean ${s.craft_raw_mean_before} -> ${s.craft_raw_mean_after} (changed only ${s.changed_raw_mean_before} -> ${s.changed_raw_mean_after}; up ${s.up}, down ${s.down}); integer mean ${s.craft_int_mean_before} -> ${s.craft_int_mean_after}`)
  for (const [k, s] of Object.entries(out.best_of_n)) console.log(`best-of-N ${k}: ${s.requests} requests, ${s.candidates} candidates (${s.eligible_candidates} eligible), swapped ${s.swapped} ${JSON.stringify(s.swapped_requests)}; reasons ${JSON.stringify(s.reasons)}; craft raw mean ${s.craft_raw_mean_before} -> ${s.craft_raw_mean_after}; plan B shipped ${s.plan_b_shipped}, never swapped ${s.plan_b_never_swapped}`)
}
