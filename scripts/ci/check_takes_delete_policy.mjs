// R6-4: robust, migration-derived proof of the `takes` storage-policy posture.
//
// The prod-source-smoke residue accounting depends on ONE fact: a client cannot
// delete its own `takes` object, because the `takes` bucket has no DELETE-capable
// storage.objects policy. The previous evidence was a single bounded regex over
// all migrations concatenated together — brittle against alternate formatting and
// statement order. This module instead builds a real policy INVENTORY:
//
//   1. strip SQL comments,
//   2. split into statements on `;`,
//   3. parse every `create policy` / `drop policy` on `storage.objects`,
//   4. resolve the live set (a drop removes an earlier create by name),
//   5. classify each live policy by command and whether it targets the `takes`
//      bucket, where DELETE-CAPABLE = command is `delete` OR `all`.
//
// A takes-bucket policy that is DELETE-capable is a hard failure. We also assert
// the expected INSERT and SELECT policies exist (posture sanity), so silently
// dropping them is caught too.
//
//   node scripts/ci/check_takes_delete_policy.mjs            # live: read migrations
//   node scripts/ci/check_takes_delete_policy.mjs --selftest # fixtures incl. a planted DELETE policy
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DELETE_CAPABLE = new Set(['delete', 'all'])

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

// Parse policy statements from one SQL source. Robust to newlines/formatting/
// clause order AND to policies nested inside `do $$ … $$` blocks (the codebase
// creates its storage policies inside an idempotent DO block). We scan for every
// `create policy … ;` / `drop policy … ;` clause WHEREVER it appears — not only
// at the start of a `;`-delimited statement — and read each clause's own text up
// to its terminating `;`. Results are returned in positional order so a later
// drop-then-recreate resolves correctly.
export function parsePolicyStatements(sql) {
  const clean = stripComments(sql)
  const found = []
  let m
  const createRe = /create\s+policy\s+("([^"]+)"|[a-zA-Z0-9_]+)[\s\S]*?;/gi
  while ((m = createRe.exec(clean))) {
    const stmt = m[0]
    const name = (m[2] || m[1]).replace(/^"|"$/g, '')
    const onStorage = /\bon\s+storage\.objects\b/i.test(stmt)
    const cmd = /\bfor\s+(all|select|insert|update|delete)\b/i.exec(stmt)
    // Postgres default when FOR is omitted is ALL (all commands, incl. delete).
    const command = cmd ? cmd[1].toLowerCase() : 'all'
    // Bucket targeting: a `'takes'` literal anywhere in the predicate, or the
    // bucket named in the policy name (the codebase convention: "twinai takes …").
    const targetsTakes = /'takes'/i.test(stmt) || /\btakes\b/i.test(name)
    found.push({ at: m.index, kind: 'create', name, onStorage, command, targetsTakes })
  }
  const dropRe = /drop\s+policy\s+(?:if\s+exists\s+)?("([^"]+)"|[a-zA-Z0-9_]+)[\s\S]*?;/gi
  while ((m = dropRe.exec(clean))) {
    const name = (m[2] || m[1]).replace(/^"|"$/g, '')
    found.push({ at: m.index, kind: 'drop', name })
  }
  return found.sort((a, b) => a.at - b.at).map(({ at, ...rest }) => rest)
}

// Build the LIVE inventory across an ordered map of {source: sql}. Later drops
// remove earlier creates by name; a re-create after a drop wins.
export function buildTakesInventory(sqlBySource) {
  const live = new Map() // name → {command, onStorage, targetsTakes}
  for (const sql of Object.values(sqlBySource)) {
    for (const st of parsePolicyStatements(sql)) {
      if (st.kind === 'drop') live.delete(st.name)
      else live.set(st.name, { command: st.command, onStorage: st.onStorage, targetsTakes: st.targetsTakes })
    }
  }
  const takesPolicies = [...live.entries()]
    .map(([name, p]) => ({ name, ...p }))
    .filter((p) => p.onStorage && p.targetsTakes)
  const deleteCapable = takesPolicies.filter((p) => DELETE_CAPABLE.has(p.command))
  const has = (cmd) => takesPolicies.some((p) => p.command === cmd)
  return {
    takesPolicies,
    deleteCapable,
    insertPresent: has('insert') || has('all'),
    selectPresent: has('select') || has('all'),
    deletePolicyPresent: deleteCapable.length > 0,
  }
}

export function evaluate(sqlBySource) {
  const inv = buildTakesInventory(sqlBySource)
  const reasons = []
  if (inv.deletePolicyPresent) {
    for (const p of inv.deleteCapable) reasons.push(`DELETE-capable takes policy present: "${p.name}" (for ${p.command})`)
  }
  if (!inv.insertPresent) reasons.push('expected takes INSERT policy is missing')
  if (!inv.selectPresent) reasons.push('expected takes SELECT policy is missing')
  return { ok: reasons.length === 0, reasons, inventory: inv }
}

function readMigrations(dir = 'supabase/migrations') {
  const map = {}
  for (const f of readdirSync(dir).sort()) if (f.endsWith('.sql')) map[f] = readFileSync(`${dir}/${f}`, 'utf8')
  return map
}

function selftest() {
  const cases = []
  const INSERT = `create policy "twinai takes insert" on storage.objects for insert to authenticated with check (bucket_id = 'takes');`
  const SELECT = `create policy "twinai takes read" on storage.objects for select to authenticated using (bucket_id = 'takes');`
  // 1. allowed posture: insert + select only, no delete
  cases.push(['insert+select only → ok', { a: INSERT + '\n' + SELECT }, true])
  // 2. planted FOR DELETE policy → fail
  cases.push(['planted FOR DELETE → fail', { a: INSERT + '\n' + SELECT + `\ncreate policy "twinai takes delete" on storage.objects for delete to authenticated using (bucket_id = 'takes');` }, false])
  // 3. planted FOR ALL policy (grants delete) → fail
  cases.push(['planted FOR ALL → fail', { a: INSERT + '\n' + SELECT + `\ncreate policy "takes all" on storage.objects for all to authenticated using (bucket_id = 'takes');` }, false])
  // 4. alternate formatting / newlines / reordered clauses → still detected
  cases.push(['alt-format multiline DELETE → fail', { a: INSERT + '\n' + SELECT + `\ncreate policy "weird"\n  on storage.objects\n  as permissive\n  for   delete\n  to authenticated\n  using ( bucket_id = 'takes' );` }, false])
  // 5. FOR omitted (defaults to ALL) targeting takes → delete-capable → fail
  cases.push(['FOR omitted defaults ALL → fail', { a: INSERT + '\n' + SELECT + `\ncreate policy "implicit all takes" on storage.objects to authenticated using (bucket_id = 'takes');` }, false])
  // 6. DELETE policy created then dropped → live set is clean → ok
  cases.push(['created-then-dropped DELETE → ok', { a: INSERT + '\n' + SELECT + `\ncreate policy "tmp del" on storage.objects for delete to authenticated using (bucket_id = 'takes');`, b: `drop policy if exists "tmp del" on storage.objects;` }, true])
  // 7. DELETE policy for a DIFFERENT bucket → not a takes delete → ok
  cases.push(['delete on another bucket → ok', { a: INSERT + '\n' + SELECT + `\ncreate policy "edits delete" on storage.objects for delete to authenticated using (bucket_id = 'edits');` }, true])
  // 8. missing insert → fail (posture sanity)
  cases.push(['missing insert → fail', { a: SELECT }, false])

  let failed = 0
  for (const [name, sqlBySource, expOk] of cases) {
    const { ok } = evaluate(sqlBySource)
    if (ok !== expOk) { console.error(`SELFTEST FAIL: ${name} => ok=${ok}, expected ${expOk}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) { console.error(`takes-delete-policy selftest: ${failed} failed`); process.exit(1) }
  console.log('takes-delete-policy selftest: all cases passed'); process.exit(0)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (process.argv.includes('--selftest')) selftest()
  else {
    const { ok, reasons, inventory } = evaluate(readMigrations())
    console.log('takes storage policy inventory:', JSON.stringify(inventory.takesPolicies))
    console.log(`insert=${inventory.insertPresent} select=${inventory.selectPresent} deleteCapable=${inventory.deletePolicyPresent}`)
    if (!ok) { for (const r of reasons) console.error(`::error::${r}`); process.exit(1) }
    console.log('takes-delete-policy guard: OK (no client DELETE-capable takes policy; insert+select present)')
  }
}
