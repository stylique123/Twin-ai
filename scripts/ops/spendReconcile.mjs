// SPEND RECONCILIATION (plan v7.1 WP0). Our ledger showed about 10x less than
// Google's bill. This compares the two, per model, offline, from two CSV
// exports the owner downloads (nothing is fetched, no key is read):
//   --ledger   an ai_usage_ledger export: model, input_tokens, output_tokens, thinking_tokens, cached_tokens
//   --billing  a Google Cloud billing CSV: a SKU/description column and a cost column
//   --prices   JSON {"<model>": {"input": $/1M, "output": $/1M, "cached": $/1M}} from the price page
// Prints per model: ledger tokens, ledger $ (tokens x prices), billed $, and the gap.
// Output has numbers and model names only.
//
//   node scripts/ops/spendReconcile.mjs --ledger l.csv --billing b.csv --prices p.json
import { readFileSync } from 'node:fs'

/** Minimal CSV parser: quoted fields, commas, newlines inside quotes. */
export function parseCsv(text) {
  const rows = []; let row = []; let f = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++ } else if (c === '"') q = false; else f += c; continue }
    if (c === '"') q = true
    else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = '' }
    else f += c
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row) }
  const [head = [], ...body] = rows.filter((r) => r.some((x) => x !== ''))
  return body.map((r) => Object.fromEntries(head.map((h, j) => [h.trim().toLowerCase(), r[j] ?? ''])))
}

const num = (v) => { const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : 0 }

/** Ledger rows → per model token totals. */
export function ledgerTotals(rows) {
  const out = {}
  for (const r of rows) {
    const m = String(r.model ?? '').trim() || 'unknown'
    const t = out[m] ?? (out[m] = { input: 0, output: 0, cached: 0, calls: 0 })
    t.input += num(r.input_tokens); t.output += num(r.output_tokens) + num(r.thinking_tokens); t.cached += num(r.cached_tokens); t.calls += num(r.calls)
  }
  return out
}

/** Billing rows → $ per model (a SKU names the model when its description contains it). */
export function billedByModel(rows, models) {
  const out = {}; let unmatched = 0
  for (const r of rows) {
    const sku = String(r['sku description'] ?? r.sku ?? r.description ?? r['service description'] ?? '').toLowerCase()
    const cost = num(r.cost ?? r['cost ($)'] ?? r['subtotal ($)'] ?? r.subtotal)
    const m = models.find((x) => sku.includes(x.toLowerCase().replace(/^models\//, '')))
    if (m) out[m] = (out[m] ?? 0) + cost
    else unmatched += cost
  }
  return { byModel: out, unmatched }
}

export function reconcile(ledgerRows, billingRows, prices) {
  const tokens = ledgerTotals(ledgerRows)
  const models = [...new Set([...Object.keys(tokens), ...Object.keys(prices)])]
  const billed = billedByModel(billingRows, models)
  const lines = models.map((m) => {
    const t = tokens[m] ?? { input: 0, output: 0, cached: 0, calls: 0 }
    const p = prices[m] ?? null
    const ledgerUsd = p ? (t.input * (p.input ?? 0) + t.output * (p.output ?? 0) + t.cached * (p.cached ?? 0)) / 1e6 : null
    const billedUsd = billed.byModel[m] ?? 0
    return { model: m, calls: t.calls, input_tokens: t.input, output_tokens: t.output, ledger_usd: ledgerUsd === null ? null : Math.round(ledgerUsd * 100) / 100, billed_usd: Math.round(billedUsd * 100) / 100, gap_usd: ledgerUsd === null ? null : Math.round((billedUsd - ledgerUsd) * 100) / 100 }
  })
  return { lines, billed_unmatched_usd: Math.round(billed.unmatched * 100) / 100 }
}

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--selftest')) {
    const r = reconcile(
      parseCsv('model,input_tokens,output_tokens,thinking_tokens,cached_tokens,calls\nflash,1000000,500000,500000,0,10\n'),
      parseCsv('SKU description,Cost\n"Generate content flash input",3.5\nOther,1.25\n'),
      { flash: { input: 0.3, output: 2.5, cached: 0.03 } })
    const l = r.lines.find((x) => x.model === 'flash')
    if (l.ledger_usd !== 2.8 || l.billed_usd !== 3.5 || l.gap_usd !== 0.7 || r.billed_unmatched_usd !== 1.25) { console.error('spendReconcile selftest FAILED', JSON.stringify(r)); process.exit(1) }
    console.log('spendReconcile selftest: OK')
  } else {
    const ledger = arg('--ledger'); const billing = arg('--billing'); const prices = arg('--prices')
    if (!ledger || !billing || !prices) { console.error('usage: --ledger l.csv --billing b.csv --prices p.json'); process.exit(2) }
    console.log(JSON.stringify(reconcile(parseCsv(readFileSync(ledger, 'utf8')), parseCsv(readFileSync(billing, 'utf8')), JSON.parse(readFileSync(prices, 'utf8'))), null, 2))
  }
}
