// PANEL 13: THE BLIND PACK FOR THE VIEWER ARMS (owner, 5 Nov). PRIVATE OUTPUT ONLY.
//
// exportPanel.mjs reads each generation's CURRENT blueprint, and both arms share
// one generation, so it would only ever see the ON arm. This reads the per-arm
// rows panelRun stored (scenario.viewer_arm 'off' | 'on'), and writes into --out
// (a private directory OUTSIDE the repository; refused otherwise):
//   blind.md   every scored script under a random id, shuffled, NO arm, n or creator
//   key.json   id → { n, request_id, creator, arm }   (THE ARM KEY: never shared before labels)
//   report.json per arm: scripts, invented lines (gate, after repair), hook_copied,
//              check states, and failures — each counted SEPARATELY.
// Fictional panel only. Ids and counts in logs.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/ops/panelArmsBlind.mjs <batch> --out=/private/dir
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync, realpathSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const metricsOf = (row) => {
  const f = (row.findings ?? []).find((x) => x?.k === 'arm_metrics')
  try { return f ? JSON.parse(f.d) : null } catch { return null }
}

/** Why a row is not scored, or null. Failures are reported, never labelled. */
export function failureOf(row) {
  if (row.status !== 200) return `http_${row.status ?? 0}`
  if (row.scenario?.failure) return String(row.scenario.failure)
  if (row.scenario?.viewer_arm === 'on' && row.scenario?.viewers && row.scenario.viewers !== 'done') return `viewers_${row.scenario.viewers}`
  if (!row.script_text) return 'no_script'
  return null
}

/** Pure: rows → { blind, key, report }. `rand` returns n random bytes (injected for tests). */
export function buildArmsPack(rows, rand = (n) => randomBytes(n)) {
  const arms = rows.filter((r) => r.scenario?.viewer_arm === 'off' || r.scenario?.viewer_arm === 'on')
  const report = { off: blankArm(), on: blankArm() }
  const scored = []
  for (const r of arms) {
    const a = report[r.scenario.viewer_arm]
    const fail = failureOf(r)
    if (fail) { a.failures.push({ n: r.n, reason: fail }); continue }
    const m = metricsOf(r) ?? {}
    a.scripts++
    if (typeof m.invented_after === 'number') { a.invented_lines += m.invented_after; if (m.invented_after > 0) a.scripts_with_invented++ } else a.invented_unknown++
    a.hook_copied += Number(m.hook_copied ?? 0)
    a.check_status[m.check_status ?? 'none'] = (a.check_status[m.check_status ?? 'none'] ?? 0) + 1
    if (r.scenario.viewer_arm === 'on' && r.scenario.viewers_changed === false) a.unchanged_by_viewers++
    scored.push(r)
  }
  const ids = new Set()
  const withId = scored.map((r) => {
    let id
    do id = `S-${rand(3).toString('hex').toUpperCase()}`; while (ids.has(id))
    ids.add(id)
    return { id, sort: rand(4).readUInt32BE(0), r }
  }).sort((x, y) => x.sort - y.sort)
  const blind = withId.map(({ id, r }) => [`## ${id}`, `**Goal:** ${r.scenario?.body?.goal ?? ''} · **Request:** ${r.scenario?.body?.reference_note ?? r.scenario?.body?.note ?? ''}`, r.script_text, '', `Hooks: ${(r.hooks ?? []).join(' · ')}`, ''].join('\n')).join('\n')
  const key = Object.fromEntries(withId.map(({ id, r }) => [id, { n: r.n, request_id: r.scenario?.label ?? null, creator: r.scenario?.creator ?? null, arm: r.scenario.viewer_arm, generation_id: r.generation_id }]))
  return { blind: `# Panel 13 — blind scripts (${withId.length})\n\n${blind}`, key, report }
}
function blankArm() { return { scripts: 0, invented_lines: 0, scripts_with_invented: 0, invented_unknown: 0, hook_copied: 0, check_status: {}, unchanged_by_viewers: 0, failures: [] } }

async function main() {
  const batch = process.argv[2]
  const outArg = process.argv.find((a) => a.startsWith('--out='))?.slice(6)
  if (!batch || !outArg) throw new Error('usage: panelArmsBlind.mjs <batch> --out=/private/dir')
  const repo = realpathSync(resolve(fileURLToPath(import.meta.url), '..', '..', '..'))
  const out = resolve(outArg)
  if ((existsSync(out) ? realpathSync(out) : out).startsWith(repo)) throw new Error('refusing to write the arm key inside the repository')
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data, error } = await admin.from('script_batch_results').select('n, status, scenario, script_text, hooks, findings, generation_id').eq('batch', batch)
  if (error) throw new Error(error.message)
  const pack = buildArmsPack(data ?? [])
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'blind.md'), pack.blind)
  writeFileSync(join(out, 'key.json'), JSON.stringify(pack.key, null, 1))
  writeFileSync(join(out, 'report.json'), JSON.stringify(pack.report, null, 1))
  const c = (a) => ({ scripts: a.scripts, invented_lines: a.invented_lines, hook_copied: a.hook_copied, failures: a.failures.length })
  console.log(JSON.stringify({ event: 'panel_arms_blind', off: c(pack.report.off), on: c(pack.report.on) }))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
