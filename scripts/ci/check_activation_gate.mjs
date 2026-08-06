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

  // THE MIGRATION THAT IS ALLOWED TO TIE completed TO AN OUTPUT.
  //
  // This rule existed to stop the constraint landing before a renderer could
  // satisfy it: while every completion is a scaffold completion with a null
  // output, such a constraint reddens the whole pipeline and protects nothing.
  // It fired on 0094 and it was right — 8.4 deferred the trigger rather than
  // silencing it, and Gate-F carried the consequence as an explicit KNOWN GAP.
  //
  // 0096 is the migration the message meant by "lands WITH the real renderer".
  // It is allowed BY NAME, not by loosening the pattern: any OTHER migration
  // adding the same constraint is still premature, and a second renderer batch
  // would have to make the same deliberate edit here rather than inheriting an
  // exemption. The allowance is a fact about one file, not a weakened rule.
  const COMPLETION_CONSTRAINT_OWNER = '0096_editor_output_asset_and_completion.sql'
  for (const [p, sql] of Object.entries(migrations)) {
    if (sql == null) continue
    if (p.endsWith(COMPLETION_CONSTRAINT_OWNER)) continue
    // Any CHECK tying completed-status to a non-null output is premature until
    // rendering is real (every scaffold completion violates it).
    //
    // SCOPED TO TEXT THAT REJECTS A WRITE, not to the whole file.
    //
    // The rule's own reason is that such enforcement "reddens the whole pipeline
    // and protects nothing" while completions are scaffolds. So the line is
    // REJECTION vs QUERY, and it is not CHECK-vs-trigger: the control case below
    // is a TRIGGER that raises, and it rejects writes exactly as a CHECK does,
    // so it must still be caught. A first attempt at this scoping looked only at
    // `check (…)` and let that control through — the control was right and the
    // scoping was wrong.
    //
    // What is NOT enforcement is a `select … where status = 'completed' and
    // output_asset_id is not null`. That READS the rows which do have an output,
    // which is the correct way to ask that question and rejects nothing. 0111's
    // approval-binding RPC does exactly that and was flagged by the file-wide
    // test, and the honest fix is to match what the rule is about rather than
    // add a second name to the exemption the comment above warns against.
    const constraintText = enforcementText(sql)
    if (/output_asset_id\s+is\s+not\s+null/i.test(constraintText) && /completed/i.test(constraintText)) {
      reasons.push(`${p}: premature completed=>output_asset_id constraint (belongs in ${COMPLETION_CONSTRAINT_OWNER}, which lands WITH the real renderer)`)
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

/**
 * The parts of a migration that REJECT a write: `check ( … )` clauses, and the
 * conditions of `if … then raise` guards inside trigger/RPC bodies.
 *
 * Deliberately excludes `where` clauses. A query that filters on
 * `output_asset_id is not null` is asking which rows have an output — the
 * correct question — and cannot fail anyone's insert.
 */
function enforcementText(sql) {
  let out = ''
  // Balanced `check ( … )`.
  const re = /\bcheck\s*\(/gi
  let m
  while ((m = re.exec(sql)) !== null) {
    let depth = 0
    for (let i = m.index + m[0].length - 1; i < sql.length; i++) {
      if (sql[i] === '(') depth++
      else if (sql[i] === ')') { depth--; if (depth === 0) { out += sql.slice(m.index, i + 1) + '\n'; break } }
    }
  }
  // `add constraint … ;`
  for (const c of sql.matchAll(/\badd\s+constraint\b[\s\S]*?;/gi)) out += c[0] + '\n'
  // `if <condition> then … raise …` — the trigger form of the same rejection.
  // The WHOLE guard, condition and body: `completed` is frequently the raise
  // MESSAGE rather than the condition, and dropping the body loses it.
  //
  // The alternation terminates at whichever of `raise` / `end if` comes first,
  // which is what separates a rejection from a plain branch: an `if … then
  // select … end if` closes without ever reaching a raise, so it is skipped —
  // that is 0111's approval lookup, and it rejects nothing.
  for (const g of sql.matchAll(/\bif\b[\s\S]{0,400}?\bthen\b[\s\S]{0,400}?(?:\braise\b[^;]*;|\bend\s+if\b)/gi)) {
    if (/\braise\b/i.test(g[0])) out += g[0] + '\n'
  }
  return out
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
    // HOSTILE 5b: the 0096 allowance must be NAME-SCOPED, not a loosened rule.
    // The same constraint in the owning migration passes; in any other file it
    // still fails. Without this pair, "allowed by name" and "allowed anywhere"
    // look identical from the outside.
    ['the completion-constraint owner is allowed', (() => {
      const f = good()
      f.migrations['supabase/migrations/0096_editor_output_asset_and_completion.sql'] =
        "if new.output_asset_id is not null then raise exception 'completed'; end if;"
      return f
    })(), true],
    ['CONTROL: the identical constraint in ANOTHER migration still fails', (() => {
      const f = good()
      f.migrations['supabase/migrations/0097_someone_elses.sql'] =
        "if new.output_asset_id is not null then raise exception 'completed'; end if;"
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
