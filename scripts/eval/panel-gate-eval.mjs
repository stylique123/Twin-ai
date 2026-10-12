#!/usr/bin/env node
// ZERO-INVENTION GATE — OFFLINE PANEL EVALUATOR (owner gate tuning v2).
//
// Replays the CURRENT gate rules on a panel export against the owner's advisor
// labels, with NO model call. It reads two PRIVATE files by path (never
// committed, never printed): the advisor labels CSV
// (script_id,creator,kind,sentence_i,surface,text,advisor_label,script_n;
// labels S, E, I (strict), U unverifiable, N no claim) and the panel export
// JSON (exportPanel.mjs bundle: {scripts:[…]}). It prints counts and rates only.
//
//   node scripts/eval/panel-gate-eval.mjs --labels=/private/advisor-labels.csv \
//        --export=/private/export-raw.json [--half=tune|validation|all] \
//        [--baseline-ref=origin/main] [--ids]
//
// --half: `tune` = script_n 0..11 (default), `validation` = 12..23. Tune on
// `tune` only; read `validation` once, at the end.
//
// WHAT IS REPLAYED AND WHAT NEEDS A LIVE JUDGE:
//   REPLAYED exactly: every rule (prefilter hard I / soft N, list-count
//     delivery, outcome fragments, risk, inheritance of fragments from their
//     script line, the I-HARD vs G-SOFT split, first-party/scope/number rules).
//   REPLAYED from the RECORD: the judge. For a sentence the BASELINE rules
//     (--baseline-ref, the code that produced the export) sent to the judge,
//     the recorded class, item ids and claim types stand in for the judge's
//     verdict (the record holds the combined class, which for every judged
//     sentence is what the judge's verdict combined to).
//   NEEDS A LIVE JUDGE: a sentence the new rules send to the judge that the
//     baseline decided by rule (or a script with no record at all, e.g. a
//     rescued generation). Those are reported as `needs_judge` and left out of
//     the rates (their count is printed next to every rate).
// Outside items (niche notes, research, audience) had no text in older
// exports; they can back only plain S, never a gated claim.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  extractSentences, classifySentences, parseNumbers,
} from '../../packages/shared/src/script/inventionGate.ts'

const FIXTURE = new URL('../ops/fixtures/fictional-panel.json', import.meta.url)

export function parseCsv(text) {
  const rows = []
  let r = [], c = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { c += '"'; i++ } else q = false } else c += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { r.push(c); c = '' }
    else if (ch === '\n') { r.push(c); rows.push(r); r = []; c = '' }
    else if (ch !== '\r') c += ch
  }
  if (c || r.length) { r.push(c); rows.push(r) }
  const head = rows.shift() ?? []
  return rows.filter((x) => x.length >= head.length).map((x) => Object.fromEntries(head.map((k, i) => [k, x[i]])))
}

/** Product names for the fictional panel: product id → name, read off the fact ids `panel:<creator>:<key>:<n>`. */
export function panelProducts(script, fixture) {
  const creator = fixture.creators.find((c) => c.key === script.creator)
  const out = new Map()
  for (const it of script.material_ledger ?? []) {
    const m = String(it.id ?? '').match(/^panel:([^:]+):([^:]+):/)
    if (!m || !it.product_id) continue
    const p = creator?.products.find((x) => x.key === m[2])
    if (p) out.set(it.product_id, p.name)
  }
  return [...out].map(([id, name]) => ({ id, name }))
}

export function ledgerOf(script) {
  return (script.material_ledger ?? []).map((it) => {
    const text = typeof it.text === 'string' ? it.text : ''
    return { id: it.id, origin: it.origin, product_id: it.product_id ?? null, field: it.field ?? null, text, numbers: parseNumbers(text, it.field ?? null), first_party: !!it.first_party, live: !!it.live, source_label: it.origin }
  })
}

export function blueprintOf(script) {
  return {
    script: script.script ?? [],
    hook_options: script.hook_options ?? [],
    packaging: { titles: script.titles ?? [], thumbnail: { text_overlay: script.thumbnail_text ?? null } },
    captions: script.captions ?? [],
    publish_plan: (script.publish_captions ?? []).map((caption) => ({ caption })),
  }
}

/** Rates over one half. `pred`: Map key → class ('I' = I-HARD) or null (needs a live judge). */
export function metrics(rows, pred) {
  const known = rows.filter((r) => pred.get(r.key) != null)
  const advI = known.filter((r) => r.label === 'I')
  const gateI = known.filter((r) => pred.get(r.key) === 'I')
  const advS = known.filter((r) => r.label === 'S')
  const scripts = [...new Set(rows.map((r) => r.script))]
  const flagged = scripts.filter((s) => known.some((r) => r.script === s && pred.get(r.key) === 'I'))
  const real = scripts.filter((s) => rows.some((r) => r.script === s && r.label === 'I'))
  const byClass = {}
  for (const r of known) { const k = `${pred.get(r.key)}<-${r.label}`; byClass[k] = (byClass[k] ?? 0) + 1 }
  return {
    sentences: rows.length,
    needs_judge: rows.length - known.length,
    needs_judge_advisor_I: rows.filter((r) => pred.get(r.key) == null && r.label === 'I').length,
    recall_strict_I: [advI.filter((r) => pred.get(r.key) === 'I').length, advI.length],
    false_flag: [gateI.filter((r) => r.label === 'N' || r.label === 'S').length, gateI.length],
    false_I_on_S: [advS.filter((r) => pred.get(r.key) === 'I').length, advS.length],
    flagged_scripts: [flagged.length, scripts.length],
    advisor_real_scripts: [real.length, scripts.length],
    n_hidden_I: [advI.filter((r) => pred.get(r.key) === 'N').length, advI.length],
    g_soft: [known.filter((r) => pred.get(r.key) === 'G').length, known.length],
    confusion: byClass,
  }
}

/** The judge verdict a recorded (combined) class stands for. 'pin' = an I the
 *  combine step made from a judge S/E (gated, scarcity, cross-product): the
 *  record drops its cited ids, so it is kept as I rather than re-derived. */
export function recordedVerdict(x) {
  const ids = x.item_ids ?? []
  const types = x.claim_types ?? []
  switch (x.reason) {
    case 'entailed': case 'stronger_than_item': case 'hyperbole': return { cls: x.class, item_ids: ids, claim_types: types }
    case 'opinion_unbacked': case 'no_claim': return { cls: 'N', item_ids: ids, claim_types: types }
    case 'no_item': case 'general_unsourced': return { cls: 'I', item_ids: [], claim_types: types }
    case 'gated_no_first_party': case 'scarcity_not_live': case 'cross_product': return 'pin'
    default: return null
  }
}

/** Replay one exported script: new rules, the recorded judge where the baseline judged. */
export function replayScript(sc, fixture, baseline) {
  const ledger = ledgerOf(sc)
  const products = panelProducts(sc, fixture)
  const target = sc.writer_supply?.product_id ?? null
  const sentences = extractSentences(blueprintOf(sc))
  const rec = new Map((sc.invention_gate?.sentences ?? []).map((x) => [x.i, x]))
  // The judge as recorded, for the sentences the baseline rules sent to it.
  const judge = new Map()
  const pinned = new Set()
  for (const s of baseline.extractSentences(blueprintOf(sc))) {
    if (baseline.isPlaceholder(s.text)) continue
    const r = baseline.ruleRead(s, ledger, products, target)
    if (r.hard || r.soft) continue
    const x = rec.get(s.i)
    if (!x) continue
    const v = recordedVerdict(x)
    if (v === 'pin') pinned.add(s.i)
    else if (v) judge.set(s.i, { i: s.i, ...v, reason: '' })
  }
  const cls = classifySentences({ sentences, ledger, products, targetProductId: target, judge }).map((c) =>
    // A combine-step I the record cannot re-derive (its cited ids were not kept) stays I.
    (pinned.has(c.i) && judge.has(c.i) === false && c.reason === 'judge_missing' ? { ...c, class: 'I', reason: 'pinned_from_record' } : c))
  return { sentences, cls, rec }
}

const pct = ([k, n]) => `${k}/${n}${n ? ` = ${(100 * k / n).toFixed(0)}%` : ''}`

async function loadBaseline(ref) {
  const src = execFileSync('git', ['show', `${ref}:packages/shared/src/script/inventionGate.ts`], { encoding: 'utf8' })
  const dir = mkdtempSync(join(tmpdir(), 'gate-baseline-'))
  const file = join(dir, 'inventionGateBaseline.ts')
  writeFileSync(file, src)
  return import(file)
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true] }))
  if (typeof args.labels !== 'string' || typeof args.export !== 'string') throw new Error('usage: panel-gate-eval.mjs --labels=<csv> --export=<json> [--half=tune|validation|all] [--baseline-ref=<git ref>]')
  const half = typeof args.half === 'string' ? args.half : 'tune'
  const inHalf = (n) => (half === 'all' ? true : half === 'validation' ? n >= 12 && n <= 23 : n >= 0 && n <= 11)
  const labels = parseCsv(readFileSync(args.labels, 'utf8'))
  const exp = JSON.parse(readFileSync(args.export, 'utf8'))
  const scripts = Array.isArray(exp) ? exp : exp.scripts
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  const baseline = await loadBaseline(typeof args['baseline-ref'] === 'string' ? args['baseline-ref'] : 'origin/main')
  const label = new Map(labels.map((l) => [`${l.script_id}|${l.sentence_i}`, l.advisor_label]))
  const rows = []
  const before = new Map()
  const after = new Map()
  const reasons = {}
  let textMismatch = 0
  let noRecord = 0
  for (const sc of scripts) {
    const n = Number(String(sc.script_id).split('#')[1])
    if (!inHalf(n)) continue
    const { sentences, cls, rec } = replayScript(sc, fixture, baseline)
    for (const s of sentences) if ((sc.sentences ?? [])[s.i]?.text !== s.text) textMismatch++
    if (!sc.invention_gate?.sentences?.length) noRecord++
    for (const c of cls) {
      const key = `${sc.script_id}|${c.i}`
      const l = label.get(key)
      if (!l) continue
      rows.push({ key, script: sc.script_id, label: l, surface: c.surface })
      before.set(key, rec.get(c.i)?.class ?? null)
      after.set(key, c.reason === 'judge_missing' ? null : c.class)
      const rk = c.reason === 'judge_missing' ? 'needs_judge' : c.reason
      reasons[`${c.class}:${rk}`] = (reasons[`${c.class}:${rk}`] ?? 0) + 1
      if (args.ids && (l === 'I') !== (c.class === 'I')) console.log(`  ${key} ${c.surface} advisor=${l} gate=${c.class} reason=${c.reason}`)
    }
  }
  const show = (name, m) => {
    console.log(`\n== ${name} (${half}) ==`)
    console.log(`sentences ${m.sentences}; needs live judge ${m.needs_judge} (of which advisor I: ${m.needs_judge_advisor_I})`)
    console.log(`recall on strict I:        ${pct(m.recall_strict_I)}`)
    console.log(`false flags (I on N or S):  ${pct(m.false_flag)}`)
    console.log(`false I on S:               ${pct(m.false_I_on_S)}`)
    console.log(`flagged scripts:            ${pct(m.flagged_scripts)}   advisor real: ${pct(m.advisor_real_scripts)}`)
    console.log(`N-hidden I:                 ${pct(m.n_hidden_I)}`)
    console.log(`G-SOFT:                     ${pct(m.g_soft)}`)
    console.log(`gate<-advisor: ${JSON.stringify(m.confusion)}`)
  }
  console.log(`scripts in half: ${new Set(rows.map((r) => r.script)).size}; scripts with no gate record: ${noRecord}; sentence text mismatches vs export: ${textMismatch}`)
  // Baseline: the recorded classes as exported (a script with no record counts as "needs judge").
  show('BASELINE (recorded)', metrics(rows, before))
  show('V2 (replayed)', metrics(rows, after))
  console.log(`v2 reasons: ${JSON.stringify(reasons)}`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
