#!/usr/bin/env node
// OFFLINE GATE REPORT (plan v6.6 §32: no paid calls, no network, no DB writes).
//
// Replays the HELD hook gate v2 (PR #1325) and polish check v2 (PR #1322) on the
// stored FICTIONAL panel 10/11 blueprints (scripts/ci/fixtures/replay_panel_10_11.json)
// with the fictional creators' items (scripts/ops/fixtures/fictional-panel.json).
// Prints ids and counts only, never line text. Deterministic: same code + same
// fixtures + same labels → same output.
//
//   node scripts/eval/offline-gate-report.mjs [--labels=/private/labels.csv] [--json]
//   node scripts/eval/offline-gate-report.mjs --labeled=/private/labeled.csv [--json]
//
// Item ids:  hooks  P<panel>-<n> H<k>   (k = 1-based position in hook_options)
//            lines  P<panel>-<n> L<i>   (i = 1-based position in the stored script)
// --labels: a PRIVATE CSV (never committed) with header `id,label`, label one of
// INVENTED or TRUE (other labels are ignored). With labels it prints recall
// (INVENTED caught / INVENTED) and the false-block rate (TRUE blocked / TRUE),
// with the ids. Without labels it prints what each gate flags, by id.
//
// --labeled: a PRIVATE CSV (never committed) of advisor-labelled items with header
// `id,panel,creator,request_n,kind,pos,last,text,label` (kind hook|line, label
// INVENTED|TRUE). The gates run on each row's text with that fictional creator's
// items; lines run only when they are middle lines (pos > 1 and last != 1). It
// prints, per panel and in total, recall and false-block rate with ids (no text).
//
// Each gate is run only when the checked-out branch has it: hookClaimRiskV2 is on
// claude/hook-gate-v2, polishCheckV2 is on claude/polish-voice-v2.
import { buildSync } from 'esbuild'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)

export function itemsFor(creator) {
  const items = []
  for (const s of creator.stories ?? []) items.push({ text: s.text, first_party: true, live: false, product_id: null, origin: 'story' })
  for (const v of Object.values(creator.answers ?? {})) if (typeof v === 'string') items.push({ text: v, first_party: true, live: false, product_id: null, origin: 'answer' })
  for (const p of creator.products ?? []) {
    for (const f of p.facts ?? []) items.push({ text: `${f.value}`, first_party: true, live: false, product_id: p.key, origin: 'product_fact' })
    if (p.offer) items.push({ text: p.offer, first_party: true, live: false, product_id: p.key, origin: 'product_offer' })
  }
  return items
}

export function readLabels(path) {
  const out = new Map()
  const rows = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean)
  const head = rows.shift().split(',').map((s) => s.trim().toLowerCase())
  const iId = head.indexOf('id'), iL = head.indexOf('label')
  for (const r of rows) {
    const c = r.split(',')
    const l = String(c[iL] ?? '').trim().toUpperCase()
    if (l === 'INVENTED' || l === 'TRUE') out.set(String(c[iId]).trim(), l)
  }
  return out
}

const panelOf = (batch) => String(batch).replace(/^panel-current-/, '')
const isMiddle = (sec) => !/^(hook|cta)$/i.test(String(sec ?? '').trim())

export function score(flagged, labels) {
  const inv = [...labels].filter(([, l]) => l === 'INVENTED').map(([id]) => id)
  const tru = [...labels].filter(([, l]) => l === 'TRUE').map(([id]) => id)
  const f = new Set(flagged)
  const caught = inv.filter((id) => f.has(id)).sort()
  const missed = inv.filter((id) => !f.has(id)).sort()
  const falseBlocks = tru.filter((id) => f.has(id)).sort()
  return { invented: inv.length, caught: caught.length, recall: inv.length ? +(caught.length / inv.length).toFixed(3) : null, missed, true_labeled: tru.length, false_blocks: falseBlocks.length, false_block_rate: tru.length ? +(falseBlocks.length / tru.length).toFixed(3) : null, false_block_ids: falseBlocks, caught_ids: caught }
}

export function run(cl, fixture, panel, labels) {
  const byKey = new Map(panel.creators.map((c) => [c.key, c]))
  const out = {}
  if (typeof cl.hookClaimRiskV2 === 'function') {
    const v1 = [], v2 = [], reasons = {}
    let total = 0
    for (const c of fixture.cases) {
      const cr = byKey.get(c.creator); const items = itemsFor(cr)
      const products = (cr.products ?? []).map((p) => ({ id: p.key, name: p.name }))
      ;(c.hook_options ?? []).forEach((h, k) => {
        const id = `P${panelOf(c.batch)}-${c.n} H${k + 1}`; total++
        if (cl.hookClaimRisk(String(h), items, products)) v1.push(id)
        const r = cl.hookClaimRiskV2(String(h), items, products)
        if (r) { v2.push(id); reasons[r] = (reasons[r] ?? 0) + 1 }
      })
    }
    out.hook_gate = { hooks: total, v1_flagged: v1.length, v2_flagged: v2.length, v2_reasons: reasons, v2_ids: v2, v1_ids: v1 }
    if (labels) { out.hook_gate.v1_score = score(v1, labels); out.hook_gate.v2_score = score(v2, labels) }
  }
  if (typeof cl.polishCheckV2 === 'function') {
    const rejected = [], reasons = {}, byId = {}
    let total = 0
    for (const c of fixture.cases) {
      const cr = byKey.get(c.creator); const items = itemsFor(cr)
      const products = (cr.products ?? []).map((p) => ({ id: p.key, name: p.name }))
      // The stored fixture keeps no source product per line: the scope falls back to
      // the video's product (request n of the fictional panel, when it is hers).
      const req = panel.requests?.[c.n]
      const productId = req && req.creator === c.creator ? (req.product ?? null) : null
      const scope = { items, products, productId, voiceText: [cr.voice?.style_note ?? '', ...(cr.voice?.samples ?? [])].join(' ') }
      ;(c.script ?? []).forEach((b, i) => {
        if (!isMiddle(b.section) || typeof b.line !== 'string' || !b.line.trim()) return
        const id = `P${panelOf(c.batch)}-${c.n} L${i + 1}`; total++
        // The pre-polish text is not stored: the line is checked against her items
        // and voice only (original = ''), so this is an upper bound on rejections.
        const r = cl.polishCheckV2('', b.line, scope)
        if (!r.ok) { rejected.push(id); byId[id] = r.reason; reasons[r.reason] = (reasons[r.reason] ?? 0) + 1 }
      })
    }
    out.polish_check = { middle_lines: total, v2_rejected: rejected.length, v2_reasons: reasons, v2_ids: rejected, v2_reason_by_id: byId }
    if (labels) out.polish_check.v2_score = score(rejected, labels)
  }
  return out
}

export function parseCsv(text) {
  const rows = []
  let r = [], c = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { c += '"'; i++ } else q = false } else c += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { r.push(c); c = '' }
    else if (ch === '\n') { r.push(c); rows.push(r); r = []; c = '' }
    else if (ch !== '\r') c += ch
  }
  if (c || r.length) { r.push(c); rows.push(r) }
  const head = rows.shift() ?? []
  return rows.filter((x) => x.length >= head.length).map((x) => Object.fromEntries(head.map((k, i) => [k, x[i]])))
}

export function runLabeled(cl, rows, panel) {
  const byKey = new Map(panel.creators.map((c) => [c.key, c]))
  const groups = {}
  const add = (gate, p, id, label, flagged) => {
    for (const g of [p, 'total']) {
      const x = (groups[gate] ??= {})[g] ??= { labels: new Map(), flagged: [] }
      x.labels.set(id, label); if (flagged) x.flagged.push(id)
    }
  }
  for (const r of rows) {
    const cr = byKey.get(r.creator); if (!cr) continue
    const items = itemsFor(cr)
    const products = (cr.products ?? []).map((p) => ({ id: p.key, name: p.name }))
    const p = `P${r.panel}`
    if (r.kind === 'hook') {
      if (typeof cl.hookClaimRisk === 'function') add('hook_gate_v1', p, r.id, r.label, !!cl.hookClaimRisk(r.text, items, products))
      if (typeof cl.hookClaimRiskV2 === 'function') add('hook_gate_v2', p, r.id, r.label, !!cl.hookClaimRiskV2(r.text, items, products))
    } else if (r.kind === 'line' && typeof cl.polishCheckV2 === 'function' && +r.pos > 1 && String(r.last) !== '1') {
      const req = panel.requests?.[+r.request_n]
      const productId = req && req.creator === r.creator ? (req.product ?? null) : null
      const scope = { items, products, productId, voiceText: [cr.voice?.style_note ?? '', ...(cr.voice?.samples ?? [])].join(' ') }
      add('polish_check_v2', p, r.id, r.label, !cl.polishCheckV2('', r.text, scope).ok)
    }
  }
  const out = {}
  for (const [gate, gs] of Object.entries(groups)) {
    out[gate] = {}
    for (const g of Object.keys(gs).sort((a, b) => (a === 'total') - (b === 'total') || a.localeCompare(b, 'en', { numeric: true }))) out[gate][g] = score(gs[g].flagged, gs[g].labels)
  }
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = mkdtempSync(join(tmpdir(), 'offline-gate-'))
  try {
    const outFile = join(dir, 'checkLines.mjs')
    buildSync({ entryPoints: [join(root, 'packages/shared/src/script/checkLines.ts')], bundle: true, format: 'esm', platform: 'node', outfile: outFile, logLevel: 'error' })
    const cl = await import(pathToFileURL(outFile).href)
    const fixture = JSON.parse(readFileSync(join(root, 'scripts/ci/fixtures/replay_panel_10_11.json'), 'utf8'))
    const panel = JSON.parse(readFileSync(join(root, 'scripts/ops/fixtures/fictional-panel.json'), 'utf8'))
    const lp = arg('labels'), ld = arg('labeled')
    const res = ld ? runLabeled(cl, parseCsv(readFileSync(ld, 'utf8')), panel) : run(cl, fixture, panel, lp ? readLabels(lp) : null)
    console.log(JSON.stringify(res, null, process.argv.includes('--json') ? 0 : 1))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
