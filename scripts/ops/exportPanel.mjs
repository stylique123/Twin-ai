// EXPORT THE FICTIONAL PANEL FOR LABELING (owner, 13 Oct). PRIVATE OUTPUT ONLY.
//
// For every script of a panel batch it writes, into --out (a private directory
// OUTSIDE the repository; the script refuses a path inside it):
//   sentences.csv            one row per gate sentence, in gate order
//                            (extractSentences): script_id, creator, kind,
//                            sentence_i, surface, text, label (blank). The gate's
//                            own class is NOT in this file, so labels stay blind.
//   scripts/<script_id>.json the script, hooks, titles, captions, and its material
//                            ledger WITH TEXT (fictional material only), plus the
//                            gate record (classes) and writer_supply, for scoring
//                            the labels afterwards.
// With --to-db it also stores the bundle as one private test_run_files row
// (kind 'other') and prints only that row's id.
//
// Run:
//   npx esbuild packages/shared/src/script/inventionGate.ts --bundle --format=esm --platform=node --outfile=scripts/ops/.inventionGate.bundle.mjs
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ops/exportPanel.mjs <batch-label> --out=/private/dir [--to-db]
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const REPO = resolve(fileURLToPath(import.meta.url), '..', '..', '..')

export function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const CSV_HEADER = ['script_id', 'creator', 'kind', 'sentence_i', 'surface', 'text', 'label']

/** The material ledger with text: each compact gate_ledger item joined to the text it stood for. */
export function ledgerWithText({ gateLedger, knowledge, products, answers, note, offer }) {
  const kById = new Map((knowledge ?? []).map((k) => [String(k.id), k]))
  const facts = new Map()
  for (const p of products ?? []) for (const f of Array.isArray(p.knowledge) ? p.knowledge : []) if (f?.id) facts.set(String(f.id), { ...f, product: p.name })
  return (gateLedger ?? []).map((it) => {
    let text = null
    if (kById.has(it.id)) text = kById.get(it.id).text
    else if (facts.has(it.id)) text = String(facts.get(it.id).value ?? facts.get(it.id).text ?? '')
    else if (it.id.startsWith('answer:')) text = answers?.[it.id.slice(7)] ?? null
    else if (it.id === 'note') text = note ?? null
    else if (it.id === 'offer') text = offer ?? null
    return { ...it, text, text_known: text !== null }
  })
}

export function assertOutsideRepo(out) {
  const abs = resolve(out)
  const rel = relative(REPO, abs)
  if (!rel.startsWith('..') && !isAbsolute(rel)) throw new Error(`--out must be outside the repository (public): ${abs}`)
  return abs
}

async function main() {
  const batch = process.argv[2]
  const outArg = (process.argv.find((a) => a.startsWith('--out=')) ?? '').slice(6)
  if (!batch || batch.startsWith('--') || !outArg) throw new Error('usage: exportPanel.mjs <batch-label> --out=/private/dir [--to-db]')
  const out = assertOutsideRepo(outArg)
  const { extractSentences } = await import('./.inventionGate.bundle.mjs')
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: rows, error } = await admin.from('script_batch_results').select('n, scenario, generation_id, status').eq('batch', batch).gte('n', 0).not('generation_id', 'is', null).order('n')
  if (error) throw error
  const panelRows = (rows ?? []).filter((r) => r.scenario?.group === 'panel')
  mkdirSync(join(out, 'scripts'), { recursive: true })
  const csv = [CSV_HEADER.join(',')]
  const bundle = []
  for (const row of panelRows) {
    const { data: g } = await admin.from('generations').select('id, user_id, blueprint, reference_note').eq('id', row.generation_id).single()
    const bp = g?.blueprint ?? {}
    const owner = g?.user_id
    const { data: knowledge } = await admin.from('creator_knowledge').select('id, kind, text').eq('owner_id', owner)
    const { data: products } = await admin.from('product_entities').select('id, name, offer, knowledge').eq('owner_id', owner)
    const target = (products ?? []).find((p) => p.id === bp?.writer_supply?.product_id) ?? null
    const scriptId = `${batch}#${row.n}`
    const sentences = extractSentences(bp)
    for (const s of sentences) csv.push([scriptId, row.scenario?.creator, row.scenario?.kind, s.i, s.surface, s.text, ''].map(csvCell).join(','))
    const file = {
      script_id: scriptId, creator: row.scenario?.creator ?? null, kind: row.scenario?.kind ?? null, goal: row.scenario?.body?.goal ?? null,
      request: { note: row.scenario?.body?.reference_note ?? null, answers: row.scenario?.body?.readiness_answers ?? {} },
      script: Array.isArray(bp.script) ? bp.script.map((b) => ({ section: b?.section ?? null, line: b?.line ?? '' })) : [],
      hook_options: bp.hook_options ?? [], titles: bp.packaging?.titles ?? [], thumbnail_text: bp.packaging?.thumbnail?.text_overlay ?? null,
      captions: bp.captions ?? [], publish_captions: Array.isArray(bp.publish_plan) ? bp.publish_plan.map((p) => p?.caption ?? null) : [],
      sentences: sentences.map((s) => ({ i: s.i, surface: s.surface, text: s.text })),
      material_ledger: ledgerWithText({ gateLedger: bp.gate_ledger, knowledge, products, answers: row.scenario?.body?.readiness_answers ?? {}, note: g?.reference_note ?? row.scenario?.body?.reference_note, offer: target?.offer ?? null }),
      writer_supply: bp.writer_supply ?? null,
      invention_gate: bp.invention_gate ?? null,
      check_status: bp.check_status ?? null,
    }
    writeFileSync(join(out, 'scripts', `${scriptId.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`), JSON.stringify(file, null, 2))
    bundle.push(file)
  }
  writeFileSync(join(out, 'sentences.csv'), csv.join('\n') + '\n')
  console.log(`exported ${bundle.length} panel scripts, ${csv.length - 1} sentences`)
  if (process.argv.includes('--to-db')) {
    const content = JSON.stringify({ batch, scripts: bundle, sentences_csv: csv.join('\n') })
    const { data, error: e2 } = await admin.from('test_run_files').insert({ label: `panel-export-${batch}`, kind: 'other', file_name: `panel-export-${batch}.json`, sha256: createHash('sha256').update(content).digest('hex'), content }).select('id').single()
    if (e2) throw e2
    console.log(`stored in test_run_files row ${data.id}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
