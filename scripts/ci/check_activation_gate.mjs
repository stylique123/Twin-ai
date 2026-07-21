// CI guard (Phase 6, correction 4): ACTIVATION SAFETY as decidable facts.
//
// The editor-v2 pipeline is a scaffold (`completed` with output_asset_id NULL
// is never a product success), so production activation must stay IMPOSSIBLE
// by construction. The historic production gate run (29829091202) is
// evidence, not permanent authority — this guard asserts the CURRENT code
// facts on every PR:
//
//   1. start-editor-v2 carries the fail-closed gate: EDITOR_V2_START_ENABLED
//      compared with exactly 'true', returning the stable 503 body
//      code 'editor_not_available' — and no default-enabled softening.
//   2. NO web caller: nothing under apps/web/src invokes 'start-editor-v2'.
//   3. The worker's completion path still writes the scaffold marker
//      (`simulated_after_analysis`) — completed is still not a product success.
//   4. No migration adds the completed => output_asset_id NOT NULL constraint
//      yet (it would be violated by every scaffold completion; it lands WITH
//      the real renderer, and updating this guard then is the deliberate act).
//   5. The shared contract documents the scaffold semantics of
//      editor_not_available / NULL output.
//
//   node scripts/ci/check_activation_gate.mjs            # PR guard
//   node scripts/ci/check_activation_gate.mjs --selftest # hostile fixtures
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const GATE_FILE = 'supabase/functions/start-editor-v2/index.ts'
const WORKER_FILE = 'worker/src/jobs/editorV2.ts'
const CONTRACTS_FILE = 'packages/shared/src/editor/contracts.ts'

// PURE decision over:
//   files:      { path: content|null } for the three required files
//   webSources: { path: content } for every source file under apps/web/src
//   migrations: { path: content } for every supabase migration
export function evaluate({ files, webSources, migrations }) {
  const reasons = []
  const gate = files[GATE_FILE]
  if (gate == null || gate.trim() === '') {
    reasons.push(`${GATE_FILE}: REQUIRED gate file missing/empty (fail-closed)`)
  } else {
    if (!/EDITOR_V2_START_ENABLED/.test(gate)) {
      reasons.push(`${GATE_FILE}: the EDITOR_V2_START_ENABLED gate is gone`)
    }
    if (!/editor_not_available/.test(gate)) {
      reasons.push(`${GATE_FILE}: the stable 'editor_not_available' rejection is gone`)
    }
    // Only EXACTLY 'true' may enable — the disabled branch must compare !== 'true'.
    if (!/EDITOR_V2_START_ENABLED[\s\S]{0,200}!==\s*'true'/.test(gate)) {
      reasons.push(`${GATE_FILE}: the gate no longer requires exactly 'true' to enable (fail-open risk)`)
    }
    // Softening patterns: default-enabled fallbacks.
    if (/EDITOR_V2_START_ENABLED[^\n]{0,80}\?\?\s*'true'/.test(gate) || /!==\s*'false'/.test(gate)) {
      reasons.push(`${GATE_FILE}: gate softened to default-enabled`)
    }
  }

  for (const [p, content] of Object.entries(webSources)) {
    if (content != null && content.includes('start-editor-v2')) {
      reasons.push(`${p}: web caller of start-editor-v2 exists (activation seam must stay unused)`)
    }
  }

  const worker = files[WORKER_FILE]
  if (worker == null || worker.trim() === '') {
    reasons.push(`${WORKER_FILE}: REQUIRED worker orchestrator missing/empty (fail-closed)`)
  } else if (!/simulated_after_analysis/.test(worker)) {
    reasons.push(`${WORKER_FILE}: the completion scaffold marker (simulated_after_analysis) is gone — completed would read as a product success`)
  }

  for (const [p, sql] of Object.entries(migrations)) {
    if (sql == null) continue
    // Any check tying completed-status to a non-null output is premature until
    // rendering is real (every scaffold completion violates it).
    if (/output_asset_id\s+is\s+not\s+null/i.test(sql) && /completed/i.test(sql)) {
      reasons.push(`${p}: premature completed=>output_asset_id constraint (lands WITH the real renderer, updating this guard deliberately)`)
    }
  }

  const contracts = files[CONTRACTS_FILE]
  if (contracts == null || contracts.trim() === '') {
    reasons.push(`${CONTRACTS_FILE}: REQUIRED contracts file missing/empty (fail-closed)`)
  } else if (!/scaffold/i.test(contracts) || !/editor_not_available/.test(contracts)) {
    reasons.push(`${CONTRACTS_FILE}: scaffold semantics of the launch gate are no longer documented`)
  }

  return { ok: reasons.length === 0, reasons }
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) yield p
  }
}

function selftest() {
  const goodGate = [
    "if ((Deno.env.get('EDITOR_V2_START_ENABLED') ?? '').trim().toLowerCase() !== 'true') {",
    "  return json({ error: 'AI editing is not available yet.', code: 'editor_not_available' }, 503)",
    '}',
  ].join('\n')
  const good = () => ({
    files: {
      [GATE_FILE]: goodGate,
      [WORKER_FILE]: "await finishProject(job, projectId, 'completed', undefined, { simulated_after_analysis: true })",
      [CONTRACTS_FILE]: "// editor_not_available: production stays disabled while the pipeline is a scaffold",
    },
    webSources: { 'apps/web/src/pages/Result.tsx': 'no editor calls here' },
    migrations: { 'supabase/migrations/0086_x.sql': 'alter table public.media_analyses add column component_digest text;' },
  })
  const cases = [
    ['current healthy state passes', good(), true],
    // HOSTILE 1: gate removed entirely — attempted silent enablement.
    ['gate removal fails', (() => { const f = good(); f.files[GATE_FILE] = 'return json({ ok: true })'; return f })(), false],
    // HOSTILE 2: gate softened to default-enabled.
    ['default-enabled softening fails', (() => {
      const f = good()
      f.files[GATE_FILE] = "if ((Deno.env.get('EDITOR_V2_START_ENABLED') ?? 'true') !== 'true') { return json({ code: 'editor_not_available' }, 503) }"
      return f
    })(), false],
    // HOSTILE 3: a web caller appears — activation via the product UI.
    ['web caller fails', (() => {
      const f = good()
      f.webSources['apps/web/src/pages/Result.tsx'] = "await supabase.functions.invoke('start-editor-v2', { body })"
      return f
    })(), false],
    // HOSTILE 4: scaffold completion marker dropped — completed masquerades as success.
    ['scaffold-marker removal fails', (() => { const f = good(); f.files[WORKER_FILE] = "await finishProject(job, projectId, 'completed')"; return f })(), false],
    // HOSTILE 5: premature completed=>output constraint sneaks into a migration.
    ['premature output constraint fails', (() => {
      const f = good()
      f.migrations['supabase/migrations/0099_x.sql'] =
        "alter table edit_projects add constraint completed_output check (status <> 'completed' or output_asset_id is not null);"
      return f
    })(), false],
    ['!== false softening fails', (() => {
      const f = good()
      f.files[GATE_FILE] = "if ((Deno.env.get('EDITOR_V2_START_ENABLED') ?? '') !== 'false') { /* enabled */ } else { return json({ code: 'editor_not_available' }, 503) } // EDITOR_V2_START_ENABLED !== 'true'"
      return f
    })(), false],
    ['missing gate file fails closed', (() => { const f = good(); f.files[GATE_FILE] = null; return f })(), false],
    ['missing worker file fails closed', (() => { const f = good(); f.files[WORKER_FILE] = null; return f })(), false],
  ]
  let failed = 0
  for (const [name, input, exp] of cases) {
    const got = evaluate(input).ok
    if (got !== exp) { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${exp}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) { console.error(`activation-gate selftest: ${failed} failed`); process.exit(1) }
  console.log('activation-gate selftest: all cases passed'); process.exit(0)
}

if (process.argv.includes('--selftest')) selftest()
else {
  const read = (p) => { try { return readFileSync(p, 'utf8') } catch { return null } }
  const files = Object.fromEntries([GATE_FILE, WORKER_FILE, CONTRACTS_FILE].map((p) => [p, read(p)]))
  const webSources = {}
  for (const p of walk('apps/web/src')) webSources[p] = read(p)
  const migrations = {}
  for (const name of readdirSync('supabase/migrations')) {
    if (name.endsWith('.sql')) migrations[`supabase/migrations/${name}`] = read(`supabase/migrations/${name}`)
  }
  const { ok, reasons } = evaluate({ files, webSources, migrations })
  console.log(`activation-gate guard: ${ok ? 'OK' : 'FAIL'} (web sources scanned: ${Object.keys(webSources).length}; migrations: ${Object.keys(migrations).length})`)
  if (!ok) { for (const r of reasons) console.error(`::error::${r}`); process.exit(1) }
}
