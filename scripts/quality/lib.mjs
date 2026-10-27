// Shared helpers for the offline quality replays (plan v6.6 §32: Gemini paused,
// no paid call, no network). Everything here is deterministic and reads only
// files: the advisor's labels and the fictional panel fixture (in the repo), and
// an optional local snapshot of stored blueprints (NOT in the repo; pass its
// path). Reports print ids and counts only, never script or creator text.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from '../ops/spineCoverage.mjs'

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const CALIBRATION = join(REPO, 'packages/shared/src/script/__tests__/fixtures/calibration/craft-calibration-set.csv')
export const REPEAT_TRUTH = join(REPO, 'packages/shared/src/script/__tests__/fixtures/calibration/repeat-ground-truth-v0.csv')
export const PANEL_FIXTURE = join(REPO, 'scripts/ops/fixtures/fictional-panel.json')
export const REPLAY_10_11 = join(REPO, 'scripts/ci/fixtures/replay_panel_10_11.json')

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
export const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
export const md5 = (t) => createHash('md5').update(t).digest('hex')
/** The hash key the panel index uses: lower case, letters and digits only. */
export const normKey = (t) => md5(String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ''))

export const words = (t) => (String(t ?? '').match(/[A-Za-z0-9$][A-Za-z0-9$'’.,-]*/g) ?? []).length
export const scriptWords = (lines) => lines.reduce((n, l) => n + words(l), 0)
export const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0 }
export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
export const r2 = (x) => Math.round(x * 100) / 100

/** "1. line\n2. line" → lines (the calibration CSV's format). */
export const csvLines = (t) => String(t ?? '').split(/\n/).map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean)

/** The advisor's labeled scripts (panels 5, 6, 7, 8, 10). */
export function labeledScripts() {
  return parseCsv(readFileSync(CALIBRATION, 'utf8')).map((r) => ({
    panel: r.panel, id: r.script_id, craft: Number(r.craft_1_7), postable: r.postable === 'Y', invented: r.has_invented === 'Y',
    labels: r.line_labels, lines: csvLines(r.script_text),
  }))
}

/** Panel number of a calibration panel id ("P10" → 10). */
export const panelNo = (p) => Number(String(p).replace(/^P/, ''))

/**
 * The (batch, n) of a labeled script, by the hash of its first line inside its
 * own panel, from a hashes-only panel index (`--index`, a local file of
 * {batch, n, kind, cr, prod, h1}). Returns null when the index is not given or
 * no row matches.
 */
export function indexMatcher(index) {
  const rows = index?.rows ?? []
  return (row) => {
    const batch = `panel-current-${panelNo(row.panel)}`
    const h = normKey(row.lines[0] ?? '')
    const hits = rows.filter((x) => x.batch === batch && x.h1 === h)
    return hits.length === 1 ? hits[0] : null
  }
}

/** Panel 10/11 stored scripts (repo fixture), keyed `${batch}#${n}`. */
export function replayCases() {
  const f = readJson(REPLAY_10_11)
  return new Map(f.cases.map((c) => [`${c.batch}#${c.n}`, c]))
}

/** Panel 10's labeled id for a stored case: matched by line text (the CSV holds the shipped script). */
export function p10IdsByCase(labeled, cases) {
  const out = new Map()
  for (const r of labeled.filter((x) => x.panel === 'P10')) {
    for (const [k, c] of cases) {
      if (!k.startsWith('panel-current-10#')) continue
      const lines = c.script.map((b) => String(b.line ?? '').trim()).filter(Boolean)
      if (lines.length === r.lines.length && lines.every((l, i) => normKey(l) === normKey(r.lines[i]))) { out.set(r.id, c); break }
    }
  }
  return out
}

// ── the fictional panel: her material as ledger items ──────────────────────

const STORY_KINDS = new Set(['experience', 'example', 'story'])

/** Her ledger for one request, built like buildLedger() from the seeded fixture (stories, answers, the note, product facts, the offer). */
export function ledgerFor(panel, request) {
  const cr = panel.creators.find((c) => c.key === request.creator)
  if (!cr) return { creator: null, items: [], products: [], target: null }
  const items = []
  const push = (it) => { if (String(it.text ?? '').trim()) items.push({ numbers: [], live: false, first_party: true, source_label: it.origin, ...it }) }
  cr.stories.forEach((s, i) => push({ id: `${cr.key}:story:${i}`, origin: STORY_KINDS.has(s.kind) ? 'her_story' : 'her_fact', product_id: null, field: s.kind, text: s.text }))
  push({ id: 'note', origin: 'her_answer', product_id: null, field: 'note', text: request.note ?? '' })
  const products = cr.products.map((p) => ({ id: `${cr.key}:${p.key}`, name: p.name }))
  for (const p of cr.products) p.facts.forEach((f, i) => push({ id: `${cr.key}:${p.key}:${i}`, origin: f.field === 'urgency' ? 'urgency' : 'product_fact', product_id: `${cr.key}:${p.key}`, field: f.field, text: f.value ?? f.text ?? '' }))
  const target = request.product ? `${cr.key}:${request.product}` : null
  const tp = cr.products.find((p) => p.key === request.product)
  if (tp?.offer) push({ id: 'offer', origin: 'offer', product_id: target, field: 'offer', text: tp.offer })
  return { creator: cr, items, products, target, targetName: tp?.name ?? '', offer: tp?.offer ?? '' }
}

/**
 * The labeled scripts with their request context: panel 10 by its stored case
 * (repo fixture); panels 5-8 by the optional hashes-only index (`--index`), else
 * by the fictional creator they share the most words with (goal unknown).
 */
export async function labeledWithContext(panel, indexPath = null) {
  const { creatorFor } = await import('../ops/spineCoverage.mjs')
  const labeled = labeledScripts()
  const p10 = p10IdsByCase(labeled, replayCases())
  const ix = indexPath ? indexMatcher(readJson(indexPath)) : () => null
  return labeled.map((r) => {
    let request = null, source = 'none'
    const c = r.panel === 'P10' ? p10.get(r.id) : null
    if (c) { request = { ...panel.requests[c.n] }; source = 'case' } else {
      const hit = ix(r)
      if (hit) {
        const base = panel.requests[hit.n]?.creator === hit.cr ? panel.requests[hit.n] : {}
        request = { ...base, creator: hit.cr, kind: hit.kind, product: hit.prod ?? undefined }
        if (!hit.prod) delete request.product
        source = 'index'
      } else {
        const cr = creatorFor(r.lines.join(' '), panel)
        if (cr) { request = { creator: cr.key, kind: null, note: '' }; source = 'creator_match' }
      }
    }
    return { ...r, request, source, ledger: request ? ledgerFor(panel, request) : null }
  })
}

/** Sell and leads requests carry an offer; the rest are non-sell. */
export const isSellGoal = (kind) => kind === 'sell' || kind === 'leads'

/** Precision / recall / F1 from counts. */
export function prf(tp, fp, fn) {
  const p = tp + fp ? tp / (tp + fp) : null
  const r = tp + fn ? tp / (tp + fn) : null
  return { tp, fp, fn, precision: p == null ? null : r2(p), recall: r == null ? null : r2(r) }
}
export const fmt = (x) => (x == null ? 'n/a' : String(x))

/** argv helpers: --name=value and --flag. */
export function arg(name, def = null) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.slice(name.length + 3) : def
}
export const flag = (name) => process.argv.includes(`--${name}`)
