#!/usr/bin/env node
// TARGETED FLAGS v2 precision / recall against the advisor's line labels (offline, free).
//
// Each labeled script line carries the advisor's class: S (her material), E
// (embellished), N (no claim), I (invented). Every line is run through the
// blocking flags Best-of-N uses (buildTargetedCheckLinesV2 + blockWrongProductLines),
// with her ledger from the fictional panel fixture. A line is "flagged" when any
// flag points at it. Positive = I (primary) and I or E (secondary).
//
//   node --experimental-strip-types --import ./scripts/quality/tsLoader.mjs \
//     scripts/quality/flagsV2Report.mjs [--index=<panel-index.json>] [--json]
//
// Prints ids and counts only.
import { buildTargetedCheckLinesV2, blockWrongProductLines } from '../../packages/shared/src/script/checkLines.ts'
import { parseNumbers } from '../../packages/shared/src/script/inventionGate.ts'
import { readJson, PANEL_FIXTURE, labeledWithContext, prf, fmt, arg, flag } from './lib.mjs'

/** Her ledger as flag items (the shape the worker passes). */
export function flagItems(ledger) {
  return (ledger?.items ?? []).map((it) => ({ text: it.text, first_party: it.first_party, live: it.live, numbers: parseNumbers(it.text, it.field), product_id: it.product_id, origin: it.origin }))
}

/** Flag reasons per line index of one script. */
export function flagsByLine(lines, ledger) {
  const bp = { script: lines.map((line) => ({ line })) }
  const items = flagItems(ledger)
  const products = ledger?.products ?? []
  const out = new Map()
  const add = (i, r) => { if (!out.has(i)) out.set(i, []); out.get(i).push(r) }
  for (const b of blockWrongProductLines(bp, items, products).blocked) add(b.line_index, 'wrong_product')
  for (const c of buildTargetedCheckLinesV2(bp, items, products)) add(c.line_index, c.reason)
  return out
}

export async function run(indexPath) {
  const panel = readJson(PANEL_FIXTURE)
  const rows = await labeledWithContext(panel, indexPath)
  const tally = { I: [0, 0, 0], IE: [0, 0, 0] }
  const byPanel = {}
  const byReason = {}
  const scripts = []
  for (const r of rows) {
    const flags = flagsByLine(r.lines, r.ledger)
    const p = (byPanel[r.panel] ??= { I: [0, 0, 0], IE: [0, 0, 0], lines: 0 })
    p.lines += r.lines.length
    const flaggedIdx = []
    r.lines.forEach((_, i) => {
      const lab = r.labels[i] ?? 'N'
      const f = flags.has(i)
      if (f) { flaggedIdx.push(i); for (const reason of flags.get(i)) { const x = (byReason[reason] ??= { flagged: 0, on_I: 0, on_E: 0, on_S: 0, on_N: 0 }); x.flagged++; x[`on_${lab}`]++ } }
      for (const [k, pos] of [['I', lab === 'I'], ['IE', lab === 'I' || lab === 'E']]) {
        const t = pos && f ? 0 : !pos && f ? 1 : pos && !f ? 2 : -1
        if (t >= 0) { tally[k][t]++; p[k][t]++ }
      }
    })
    scripts.push({ id: r.id, source: r.source, lines: r.lines.length, flagged: flaggedIdx.length, invented_lines: [...r.labels].filter((c) => c === 'I').length })
  }
  const res = (t) => prf(t[0], t[1], t[2])
  return {
    scripts: rows.length, lines: rows.reduce((a, r) => a + r.lines.length, 0),
    context_sources: rows.reduce((a, r) => ({ ...a, [r.source]: (a[r.source] ?? 0) + 1 }), {}),
    invented: res(tally.I), invented_or_embellished: res(tally.IE),
    by_panel: Object.fromEntries(Object.entries(byPanel).map(([k, v]) => [k, { lines: v.lines, invented: res(v.I), invented_or_embellished: res(v.IE) }])),
    by_reason: byReason, scripts_detail: scripts,
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isMain) {
  const out = await run(arg('index'))
  if (flag('json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0) }
  const line = (n, m) => `${n}: tp ${m.tp} fp ${m.fp} fn ${m.fn}  precision ${fmt(m.precision)}  recall ${fmt(m.recall)}`
  console.log(`flags v2 on ${out.scripts} labeled scripts, ${out.lines} lines (context: ${JSON.stringify(out.context_sources)})`)
  console.log(line('positive = I', out.invented))
  console.log(line('positive = I or E', out.invented_or_embellished))
  for (const [k, v] of Object.entries(out.by_panel)) console.log(`  ${k} (${v.lines} lines) ${line('I', v.invented)} | ${line('I+E', v.invented_or_embellished)}`)
  for (const [k, v] of Object.entries(out.by_reason)) console.log(`  reason ${k}: flagged ${v.flagged} (on I ${v.on_I}, E ${v.on_E}, S ${v.on_S}, N ${v.on_N})`)
}
