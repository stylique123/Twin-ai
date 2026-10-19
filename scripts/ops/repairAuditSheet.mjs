// REPAIR AUDIT LABEL SHEETS (owner, 19 Oct: save-before-repair). PRIVATE OUTPUT ONLY.
//
// Reads the panel generations of one batch label (e.g. panel-current-7) and,
// from each blueprint.invention_gate.repair_audit (written by the worker on
// test and panel accounts only), writes into --out (a private directory
// OUTSIDE the repository; refused otherwise):
//   repair-audit-blind.csv  one row per DROPPED, REPLACED or ASKED line:
//                           blind_id, pre_repair_text, first_party_items (the
//                           creator's own material for that request, fictional
//                           panel accounts only), and empty S/E/I/N label
//                           columns. NO gate verdict, action or replacement.
//   repair-audit-key.csv    blind_id → generation_id, script_id, round, line
//                           index, surface, action, replacement, fast_class,
//                           strong_class, verdict, class, reason, item_ids.
// Blind ids are shuffled (a hash of the label and the line), so row order says
// nothing about the gate. Prints counts only, never text.
//
// Run:
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ops/repairAuditSheet.mjs <batch-label> --out=/private/dir
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { assertOutsideRepo, csvCell } from './exportPanel.mjs'

export const LABELED_ACTIONS = new Set(['dropped', 'replaced', 'asked'])
export const BLIND_HEADER = ['blind_id', 'pre_repair_text', 'first_party_items', 'S', 'E', 'I', 'N']
export const KEY_HEADER = ['blind_id', 'generation_id', 'script_id', 'round', 'line_i', 'surface', 'action', 'replacement', 'class', 'fast_class', 'strong_class', 'verdict', 'reason', 'item_ids']

/** The creator's first-party items for one request, as text: her knowledge rows and the target product's facts. */
export function firstPartyItems({ knowledge, products, productId }) {
  const out = []
  for (const k of knowledge ?? []) if (typeof k?.text === 'string' && k.text.trim()) out.push(k.text.trim())
  const ps = (products ?? []).filter((p) => !productId || p.id === productId)
  for (const p of ps) for (const f of Array.isArray(p.knowledge) ? p.knowledge : []) {
    const t = String(f?.value ?? f?.text ?? '').trim()
    if (t) out.push(`${p.name}: ${t}`)
  }
  return out
}

/** Build both sheets from loaded rows. Pure (no network). */
export function buildSheets(label, gens) {
  const items = []
  for (const g of gens) {
    const audit = Array.isArray(g.blueprint?.invention_gate?.repair_audit) ? g.blueprint.invention_gate.repair_audit : []
    for (const a of audit) {
      if (!LABELED_ACTIONS.has(a?.action)) continue
      const h = createHash('sha256').update(`${label}\u0000${g.id}\u0000${a.round}\u0000${a.i}\u0000${a.surface}`).digest('hex')
      items.push({ h, g, a })
    }
  }
  items.sort((x, y) => (x.h < y.h ? -1 : x.h > y.h ? 1 : 0))
  const blind = [BLIND_HEADER.join(',')]
  const key = [KEY_HEADER.join(',')]
  items.forEach(({ g, a }, n) => {
    const id = `RA-${String(n + 1).padStart(4, '0')}`
    blind.push([id, a.text, (g.items ?? []).join(' | '), '', '', '', ''].map(csvCell).join(','))
    key.push([id, g.id, g.script_id ?? '', a.round, a.i, a.surface, a.action, a.replacement ?? '', a.class ?? '', a.fast_class ?? '', a.strong_class ?? '', a.verdict ?? '', a.reason ?? '', (a.item_ids ?? []).join(' ')].map(csvCell).join(','))
  })
  return { blind: blind.join('\n') + '\n', key: key.join('\n') + '\n', rows: items.length }
}

async function main() {
  const label = process.argv[2]
  const outArg = (process.argv.find((a) => a.startsWith('--out=')) ?? '').slice(6)
  if (!label || label.startsWith('--') || !outArg) throw new Error('usage: repairAuditSheet.mjs <batch-label> --out=/private/dir')
  const out = assertOutsideRepo(outArg)
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: rows, error } = await admin.from('script_batch_results').select('n, scenario, generation_id').eq('batch', label).gte('n', 0).not('generation_id', 'is', null).order('n')
  if (error) throw error
  // Fictional panel rows only.
  const panelRows = (rows ?? []).filter((r) => r.scenario?.group === 'panel')
  const gens = []
  for (const row of panelRows) {
    const { data: g, error: e1 } = await admin.from('generations').select('id, user_id, blueprint').eq('id', row.generation_id).single()
    if (e1) throw e1
    const { data: uses } = await admin.from('creator_knowledge_uses').select('knowledge_id').eq('generation_id', g.id)
    const ids = (uses ?? []).map((u) => u.knowledge_id).filter((x) => typeof x === 'string')
    const kq = admin.from('creator_knowledge').select('id, text').eq('owner_id', g.user_id)
    const { data: knowledge } = ids.length ? await kq.in('id', ids) : await kq
    const { data: products } = await admin.from('product_entities').select('id, name, knowledge').eq('owner_id', g.user_id)
    gens.push({ id: g.id, script_id: `${label}#${row.n}`, blueprint: g.blueprint, items: firstPartyItems({ knowledge, products, productId: g.blueprint?.writer_supply?.product_id ?? null }) })
  }
  const s = buildSheets(label, gens)
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'repair-audit-blind.csv'), s.blind)
  writeFileSync(join(out, 'repair-audit-key.csv'), s.key)
  const withAudit = gens.filter((g) => Array.isArray(g.blueprint?.invention_gate?.repair_audit)).length
  console.log(`repair audit: ${panelRows.length} panel generations, ${withAudit} with an audit, ${s.rows} lines to label`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
