// THE BLIND PACK FOR A SINGLE-ARM PANEL (owner, 11 Nov). Runs inside GitHub
// Actions (panel-export.yml), where the service key already lives, so nobody
// handles the key by hand. Fictional panel rows only (scenario.group 'panel').
//
// Writes into --out (refused inside the repository):
//   blind.md     every scored script under a random id, shuffled, with its creator
//                slug (to check facts against her material); no label, n or generation id
//   report.json  counts only: scripts, asked instead of writing, failures, the
//                gate's invented lines (after repair), the rule-based craft
//                PRE-SCORE (not the advisor's craft), check states, the panel
//                final pass cuts. "headline" puts asked next to craft and invented,
//                because the ask rule removes thin requests from the scored set.
//   key.json     id → { n, label, creator, generation_id }. THE ANSWER KEY: the
//                workflow never uploads it; it dies with the runner.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ops/panelBlindPack.mjs <batch> --out=/private/dir
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync, realpathSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Why a row is not a scored script, or null. */
export function outcomeOf(row) {
  if (row.code === 'NEEDS_STORY' || row.scenario?.asked_instead) return 'asked'
  if (row.status !== 200) return `http_${row.status ?? 0}`
  if (row.scenario?.failure) return String(row.scenario.failure)
  if (!row.script_text) return 'no_script'
  return null
}

const linesOf = (text) => String(text ?? '').split('\n').map((l) => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean)
const round = (x) => Math.round(x * 100) / 100

/**
 * Pure: rows (script_batch_results) + blueprints by generation id → { blind, key, report }.
 * `craft(lines)` returns the 1–7 pre-score or null; `rand(n)` returns n random bytes.
 */
export function buildBlindPack(rows, blueprints = {}, craft = () => null, rand = (n) => randomBytes(n)) {
  const panel = rows.filter((r) => r.scenario?.group === 'panel')
  const report = { rows: panel.length, scripts: 0, asked: 0, failures: [], invented_lines: 0, scripts_with_invented: 0, invented_unknown: 0, craft_prescore_mean: null, craft_prescored: 0, check_status: {}, final_pass: {}, headline: null }
  const scored = []
  const crafts = []
  for (const r of panel) {
    const why = outcomeOf(r)
    if (why === 'asked') { report.asked++; continue }
    if (why) { report.failures.push({ reason: why }); continue }
    report.scripts++
    const bp = blueprints[r.generation_id] ?? {}
    const g = bp.invention_gate
    const inv = g?.after?.I ?? g?.before?.I
    if (typeof inv === 'number') { report.invented_lines += inv; if (inv > 0) report.scripts_with_invented++ } else report.invented_unknown++
    const cs = bp.check_status ?? 'none'
    report.check_status[cs] = (report.check_status[cs] ?? 0) + 1
    for (const [k, v] of Object.entries(bp.panel_final_pass ?? {})) if (typeof v === 'number') report.final_pass[k] = (report.final_pass[k] ?? 0) + v
    const c = craft(linesOf(r.script_text))
    if (Number.isFinite(c)) crafts.push(c)
    scored.push(r)
  }
  report.craft_prescored = crafts.length
  report.craft_prescore_mean = crafts.length ? round(crafts.reduce((a, b) => a + b, 0) / crafts.length) : null
  const requests = report.scripts + report.asked + report.failures.length
  report.headline = {
    requests,
    asked: report.asked,
    scripts: report.scripts,
    invented: `${report.scripts_with_invented} of ${report.scripts} scripts (${report.invented_lines} lines, gate after repair)`,
    craft_prescore: report.craft_prescore_mean,
    note: 'asked requests are not scripts: craft and invented are over the scripts written, not over all requests',
  }
  const ids = new Set()
  const withId = scored.map((r) => {
    let id
    do id = `S-${rand(3).toString('hex').toUpperCase()}`; while (ids.has(id))
    ids.add(id)
    return { id, sort: rand(4).readUInt32BE(0), r }
  }).sort((x, y) => x.sort - y.sort)
  const blind = withId.map(({ id, r }) => [`## ${id}`, `**Creator:** ${r.scenario?.creator ?? ''} · **Goal:** ${r.scenario?.body?.goal ?? ''} · **Request:** ${r.scenario?.body?.reference_note ?? r.scenario?.body?.note ?? ''}`, r.script_text, '', `Hooks: ${(r.hooks ?? []).join(' · ')}`, ''].join('\n')).join('\n')
  const key = Object.fromEntries(withId.map(({ id, r }) => [id, { n: r.n, label: r.scenario?.label ?? null, creator: r.scenario?.creator ?? null, generation_id: r.generation_id ?? null }]))
  return { blind: `# Panel — blind scripts (${withId.length})\n\n${blind}`, key, report }
}

async function loadCraft() {
  const target = join(REPO, 'scripts', 'ops', '.craftJudge.bundle.mjs')
  try { return (await import(target)).scoreCraft } catch { /* not built yet */ }
  const { buildSync } = await import('esbuild')
  buildSync({ entryPoints: [join(REPO, 'packages/shared/src/script/craftJudge.ts')], bundle: true, format: 'esm', platform: 'node', outfile: target, logLevel: 'silent' })
  return (await import(target)).scoreCraft
}

async function main() {
  const batch = process.argv[2]
  const outArg = process.argv.find((a) => a.startsWith('--out='))?.slice(6)
  if (!batch || batch.startsWith('--') || !outArg) throw new Error('usage: panelBlindPack.mjs <batch> --out=/private/dir')
  const out = resolve(outArg)
  if ((existsSync(out) ? realpathSync(out) : out).startsWith(realpathSync(REPO))) throw new Error('refusing to write the answer key inside the repository')
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data, error } = await admin.from('script_batch_results').select('n, status, code, scenario, script_text, hooks, generation_id').eq('batch', batch)
  if (error) throw new Error(error.message)
  const ids = [...new Set((data ?? []).map((r) => r.generation_id).filter(Boolean))]
  const blueprints = {}
  for (let i = 0; i < ids.length; i += 50) {
    const { data: gs, error: ge } = await admin.from('generations').select('id, blueprint').in('id', ids.slice(i, i + 50))
    if (ge) throw new Error(ge.message)
    for (const g of gs ?? []) blueprints[g.id] = g.blueprint ?? {}
  }
  const scoreCraft = await loadCraft()
  const pack = buildBlindPack(data ?? [], blueprints, (lines) => { try { return scoreCraft(lines).craft } catch { return null } })
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'blind.md'), pack.blind)
  writeFileSync(join(out, 'report.json'), JSON.stringify(pack.report, null, 1))
  writeFileSync(join(out, 'key.json'), JSON.stringify(pack.key, null, 1))
  // Counts only in the log.
  console.log(JSON.stringify({ event: 'panel_blind_pack', batch, ...pack.report.headline }))
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
