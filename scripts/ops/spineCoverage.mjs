#!/usr/bin/env node
// OFFLINE SPINE COVERAGE (craft rubric v1, item C). No model call, no DB, no network.
//
// Reads the advisor's craft calibration CSV (fictional creators only), takes the
// rows of one panel, and computes three rates by the same heuristics the
// completion step uses (packages/shared/src/script/planner/spineComplete.ts):
//   (a) a reality check or clear problem line,
//   (b) her truth (a line traced to her material, or her first-person account),
//   (c) exactly one call to action, at the end.
// "after" applies completeSpine (SPINE_COMPLETE) and then reorderEnding
// (POLISH_REORDER) with her material from scripts/ops/fixtures/fictional-panel.json
// (each row is matched to the fictional creator whose brand, products and stories it shares the most words with), so before/after needs no paid call.
//
//   node scripts/ops/spineCoverage.mjs <calibration.csv> [--panel P10] [--json]
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spineCoverage, completeSpine, reorderEnding, missingProblemQuestion } from '../../packages/shared/src/script/planner/spineComplete.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** RFC-4180 CSV (quoted fields may span lines). */
export function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++ } else if (c === '"') q = false; else f += c; continue }
    if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = '' }
    else f += c
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row) }
  const [h, ...rest] = rows.filter((r) => r.length > 1)
  return rest.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])))
}

export const scriptLines = (t) => String(t ?? '').split(/\n/).map((l) => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean)

const words = (t) => new Set(String(t ?? '').toLowerCase().match(/[a-z0-9']{4,}/g) ?? [])
/** The fictional creator a calibration row belongs to: the most shared words with her brand, products and stories. */
export function creatorFor(text, panel) {
  const w = words(text)
  let best = null, bs = 0
  for (const c of panel.creators) {
    const cw = words([c.brand?.name, ...c.products.map((p) => p.name), ...c.stories.map((s) => s.text), ...Object.values(c.answers ?? {})].join(' '))
    let hit = 0
    for (const x of w) if (cw.has(x)) hit++
    if (hit > bs) { bs = hit; best = c }
  }
  return best
}

/** Her material and offer for a calibration row, from the fictional panel fixture. */
export function materialFor(text, panel) {
  const cr = creatorFor(text, panel)
  if (!cr) return { material: [], offer: null, topic: '' }
  const material = []
  cr.stories.forEach((s, i) => material.push({ id: `story:${i}`, text: s.text }))
  for (const [k, v] of Object.entries(cr.answers ?? {})) if (k !== 'niche' && k !== 'profile') material.push({ id: `answer:${k}`, text: v })
  for (const p of cr.products) p.facts.forEach((f, i) => material.push({ id: `fact:${p.key}:${i}`, text: f.value }))
  const low = String(text).toLowerCase()
  const prod = cr.products.find((p) => low.includes(p.name.toLowerCase())) ?? cr.products[0]
  return { creator: cr.key, material, offer: prod?.offer ? { id: `offer:${prod.key}`, text: prod.offer } : null, topic: scriptLines(text)[0] ?? '' }
}

export function measure(rows, panel) {
  const tally = { n: 0, before: { problem: 0, truth: 0, cta: 0, all: 0 }, after: { problem: 0, truth: 0, cta: 0, all: 0 }, changed: 0, missingProblem: 0, wouldAsk: 0, per: [] }
  for (const r of rows) {
    const lines = scriptLines(r.script_text)
    const m = materialFor(r.script_text, panel)
    const b = spineCoverage(lines, m.material)
    const beats = lines.map((line, i) => ({ section: i === 0 ? 'hook' : 'body', line }))
    const done = completeSpine(beats, m)
    // Missing problem after completion: her material had no on-topic problem item.
    // SPINE_COMPLETE then ASKS her (missing_problem) instead of inventing one.
    const ask = missingProblemQuestion(beats, m)
    if (!spineCoverage(done.script.map((x) => String(x.line ?? '')).filter(Boolean), m.material).problem) {
      tally.missingProblem++
      if (ask) tally.wouldAsk++
    }
    const ended = reorderEnding(done.script).next
    const afterLines = ended.map((x) => String(x.line ?? '')).filter(Boolean)
    const a = spineCoverage(afterLines, m.material)
    tally.n++
    for (const [k, v] of [['before', b], ['after', a]]) {
      tally[k].problem += v.problem ? 1 : 0; tally[k].truth += v.truth ? 1 : 0; tally[k].cta += v.oneCtaAtEnd ? 1 : 0
      tally[k].all += v.problem && v.truth && v.oneCtaAtEnd ? 1 : 0
    }
    if (afterLines.join('\n') !== lines.join('\n')) tally.changed++
    tally.per.push({ id: r.script_id, creator: m.creator, before: b, after: a, record: done.record, asks: ask ? ask.writes_to : null })
  }
  return tally
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const args = process.argv.slice(2)
  const csv = args.find((a) => !a.startsWith('--'))
  if (!csv) { console.error('usage: node scripts/ops/spineCoverage.mjs <calibration.csv> [--panel P10] [--json]'); process.exit(2) }
  const pi = args.indexOf('--panel')
  const want = pi >= 0 ? args[pi + 1] : 'P10'
  const panel = JSON.parse(readFileSync(join(REPO, 'scripts/ops/fixtures/fictional-panel.json'), 'utf8'))
  const rows = parseCsv(readFileSync(csv, 'utf8')).filter((r) => r.panel === want)
  const t = measure(rows, panel)
  if (args.includes('--json')) { console.log(JSON.stringify(t, null, 1)); process.exit(0) }
  const pct = (x) => `${x}/${t.n} (${Math.round((100 * x) / Math.max(1, t.n))}%)`
  console.log(`panel ${want}: ${t.n} scripts`)
  for (const k of ['before', 'after']) console.log(`${k.padEnd(6)} problem/reality ${pct(t[k].problem)}  her truth ${pct(t[k].truth)}  one CTA at end ${pct(t[k].cta)}  all three ${pct(t[k].all)}`)
  console.log(`scripts changed by SPINE_COMPLETE + POLISH_REORDER: ${t.changed}`)
  console.log(`still missing a problem line after completion: ${t.missingProblem}; of those, would get the missing_problem question: ${t.wouldAsk}/${t.missingProblem}`)
}
