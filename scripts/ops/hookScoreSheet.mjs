#!/usr/bin/env node
// HOOK SCORE SHEET (A5): runs the hook engine over fictional fixtures and writes
// a 20-row CSV for the owner to label (candidate, shape and score columns, plus
// an empty owner_label column).
//
//   node --experimental-strip-types scripts/ops/hookScoreSheet.mjs [--out file.csv] [--fixture file.json]
//
// ⚖️ FICTIONAL FIXTURES ONLY. Real creator material never goes in a fixture.
// Reads the generated Deno mirror (same source as the shared package) so no
// build step is needed.
import { readFileSync, writeFileSync } from 'node:fs'
import { runHookEngine } from '../../supabase/functions/_shared/hookEngine.ts'

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt }
const fixturePath = arg('--fixture', new URL('./fixtures/hook-score-sheet.json', import.meta.url).pathname)
const outPath = arg('--out', 'hook-score-sheet.csv')
export const SHEET_ROWS = 20

const toItem = (o) => ({ product_id: null, field: null, numbers: [], first_party: true, live: false, source_label: o.origin, ...o })
const csv = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

export function buildSheet(fixture) {
  const rows = []
  for (const c of fixture.cases) {
    const ledger = c.ledger.map(toItem)
    const { record, pick } = runHookEngine(c.candidates, ledger)
    for (const r of record.candidates) {
      rows.push({
        case: c.id, index: r.index, candidate: c.candidates[r.index].text, shape: r.shape, pass: r.ok ? 'pass' : 'fail',
        reasons: r.reasons.join(' '), fit: r.score.fit, specificity: r.score.specificity, length: r.score.length,
        total: r.score.total, picked: pick.indices.includes(r.index) ? 'yes' : '', owner_label: '',
      })
    }
  }
  return rows.slice(0, SHEET_ROWS)
}

export function toCsv(rows) {
  const cols = ['case', 'index', 'candidate', 'shape', 'pass', 'reasons', 'fit', 'specificity', 'length', 'total', 'picked', 'owner_label']
  return [cols.join(','), ...rows.map((r) => cols.map((k) => csv(r[k])).join(','))].join('\n') + '\n'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = buildSheet(JSON.parse(readFileSync(fixturePath, 'utf8')))
  if (rows.length !== SHEET_ROWS) { console.error(`expected ${SHEET_ROWS} rows, got ${rows.length}`); process.exit(1) }
  writeFileSync(outPath, toCsv(rows))
  console.log(`wrote ${rows.length} rows to ${outPath}`)
}
