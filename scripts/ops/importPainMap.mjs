#!/usr/bin/env node
// B2 Tier-1 pain-map importer. Reads a HAND-WRITTEN CSV (a person read public
// threads and paraphrased them). No fetching, no scraping: this script reads
// one local file and, only with --apply, writes to audience_pain_map.
//
// USE RULE: Twin may use a pain only as a hook or topic seed matched to a
// pillar. It is never proof, never the creator's experience, never quoted.
//
// Default is --dry-run. Output is COUNTS ONLY; sentences are never printed.
//
//   node scripts/ops/importPainMap.mjs <file.csv> [--dry-run | --apply]
//   --apply needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env.
import { readFileSync } from 'node:fs'
import { rowsFromCsv, validatePainRow } from '../../packages/shared/src/script/painMap.ts'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const apply = args.includes('--apply') && !args.includes('--dry-run')
if (!file) { console.error('usage: importPainMap.mjs <file.csv> [--dry-run|--apply]'); process.exit(2) }

const rows = rowsFromCsv(readFileSync(file, 'utf8'))
const ok = []
const reasonCounts = {}
for (const r of rows) {
  const res = validatePainRow(r)
  if (res.ok) ok.push(res.record)
  else for (const x of res.reasons) reasonCounts[x] = (reasonCounts[x] ?? 0) + 1
}
const counts = {
  mode: apply ? 'apply' : 'dry-run',
  rows: rows.length,
  valid: ok.length,
  rejected: rows.length - ok.length,
  patterns: ok.filter((r) => r.kind === 'pattern').length,
  ideas: ok.filter((r) => r.kind === 'idea').length,
  reject_reasons: reasonCounts,
}
console.log(JSON.stringify(counts, null, 2))

if (apply && ok.length) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(url, key, { auth: { persistSession: false } })
  const { error, count } = await db.from('audience_pain_map')
    .upsert(ok, { onConflict: 'niche,pain_sentence', count: 'exact' })
  if (error) { console.error(`upsert failed: ${error.code ?? 'error'}`); process.exit(1) }
  console.log(JSON.stringify({ written: count ?? ok.length }))
}
