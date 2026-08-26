#!/usr/bin/env node
// WHAT THE RENDERS ACTUALLY COST, AND WHAT WE STILL CANNOT SEE.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// `packages/shared/src/editor/renderCost.ts` was written, exported, tested --
// and called by NOTHING (measured 2026-08-26). A cost model nobody runs is the
// same defect as a column nobody reads: it looks like the question was answered.
// This is its caller.
//
// ⚠️ IT DELIBERATELY REFUSES TO PRINT A TOTAL. Egress is metered nowhere, and a
// single "this render cost X" assembled from the terms we DO have would be
// wrong in the direction that matters -- it would make every render look
// affordable, and a budget built on it would wave through exactly the expensive
// ones. The gap is printed as loudly as the numbers.
//
//   node scripts/render-cost.mjs                 # every project with events
//   node scripts/render-cost.mjs <project-id>    # one project
//   node scripts/render-cost.mjs --selftest      # no database needed
//
// ⚠️ THE TYPESCRIPT SOURCE, NOT A BUILD OUTPUT -- the same import style
// `scripts/assess-references.mjs` uses, for the same reason: `@twinai/shared`
// is consumed as source in this repo and has no build step.
import { renderCost, costIsComparable } from '../packages/shared/src/editor/renderCost.ts'

const fmtMs = (ms) => (ms === null ? 'not recorded' : `${(ms / 1000).toFixed(1)}s`)
const fmtBytes = (b) => (b === null ? 'not recorded' : `${(b / 1_048_576).toFixed(1)} MiB`)

/**
 * One project's rows -> the lines to print.
 *
 * Pure, so the selftest can exercise the whole shape without a database, and so
 * the arithmetic stays arguable. `renderCost` does the deriving; this only
 * decides what a human sees.
 */
export function reportFor(rows) {
  const measured = rows.events.find((e) => e.message_code === 'render_measured')
  const cost = renderCost({
    projectId: rows.projectId,
    // `stage` is what renderCost spans; the event log calls it message_code.
    events: rows.events.map((e) => ({ stage: e.message_code, created_at: e.created_at })),
    directorCall: rows.directorCall ?? null,
    outputDurationMs: rows.outputDurationMs ?? null,
    // Handed over untouched -- re-keying is where a field silently becomes
    // undefined and a measured render starts reporting as unmeasured.
    renderMeasured: measured?.details ?? null,
  })
  const lines = [
    `project ${cost.projectId}`,
    `  compute (ffmpeg wall-clock)  ${fmtMs(cost.computeMs)}`,
    `  output size                  ${fmtBytes(cost.outputBytes)}`,
    `  video length                 ${fmtMs(cost.outputDurationMs)}`,
    `  director tokens              ${cost.directorTokens?.total ?? 'not recorded'}`
      + `${cost.directorModel ? ` (${cost.directorModel})` : ''}`,
    `  wall-clock, first to last    ${fmtMs(cost.wallClockMs)}  [queue time included -- NOT a billing quantity]`,
  ]
  if (cost.stages.length) {
    lines.push('  longest stages:')
    for (const s of cost.stages.slice(0, 3)) lines.push(`    ${s.stage.padEnd(28)} ${fmtMs(s.ms)}`)
  }
  // ⚠️ THE GAP PRINTS EVEN WHEN IT IS BORING, and it is never empty today.
  lines.push(`  ⚠️ NOT MEASURED: ${cost.unmeasured.join(', ')}`)
  lines.push(`  comparable between renders: ${costIsComparable(cost) ? 'yes' : 'NO -- a term is missing'}`)
  return { cost, lines }
}

if (process.argv.includes('--selftest')) {
  let failures = 0
  const expect = (name, got, want) => {
    if (got !== want) { console.error(`selftest: ${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); failures++ }
  }
  const at = (s) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString()

  const measured = reportFor({
    projectId: 'p-measured',
    events: [
      { message_code: 'render_started', created_at: at(0) },
      { message_code: 'render_measured', created_at: at(41), details: { render_ms: 41000, output_bytes: 9_400_000 } },
    ],
    directorCall: { model: 'gemini-3.1-pro-preview', total_tokens: 8123 },
    outputDurationMs: 32000,
  })
  expect('compute is read from the event', measured.cost.computeMs, 41000)
  expect('compute leaves the gap', measured.cost.unmeasured.includes('compute_seconds'), false)
  expect('egress never leaves the gap', measured.cost.unmeasured.includes('egress_bytes'), true)
  expect('never comparable while egress is missing', costIsComparable(measured.cost), false)
  expect('the gap is printed', measured.lines.some((l) => l.includes('NOT MEASURED')), true)

  const bare = reportFor({ projectId: 'p-bare', events: [], directorCall: null })
  expect('no events -> compute not recorded', bare.cost.computeMs, null)
  expect('no events -> compute still in the gap', bare.cost.unmeasured.includes('compute_seconds'), true)
  expect('a null compute prints as not recorded, never 0s',
    bare.lines.some((l) => l.includes('compute') && l.includes('not recorded')), true)

  // ⚠️ THE RE-KEY TRAP. renderMeasured is handed over as the event wrote it. A
  // camelCase copy would read as absent and report a measured render as a gap.
  const rekeyed = reportFor({
    projectId: 'p-rekeyed',
    events: [{ message_code: 'render_measured', created_at: at(1), details: { renderMs: 41000 } }],
    directorCall: null,
  })
  expect('a camelCased detail is NOT accepted as a measurement', rekeyed.cost.computeMs, null)

  if (failures > 0) { console.error(`render-cost selftest: ${failures} FAILED`); process.exit(1) }
  console.log('render-cost selftest: OK (9 assertions, incl. the re-key trap)')
  process.exit(0)
}

const { createClient } = await import('@supabase/supabase-js')
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. This reads edit_events, '
    + 'which is service-role only by design.')
  process.exit(2)
}
const db = createClient(url, key, { auth: { persistSession: false } })
const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null

const { data: events, error } = await db
  .from('edit_events')
  .select('project_id, message_code, details, created_at')
  .order('created_at', { ascending: true })
if (error) { console.error(`could not read edit_events: ${error.message}`); process.exit(1) }

const byProject = new Map()
for (const e of events ?? []) {
  if (only && e.project_id !== only) continue
  if (!byProject.has(e.project_id)) byProject.set(e.project_id, [])
  byProject.get(e.project_id).push(e)
}
// ⚠️ ZERO PROJECTS IS A FINDING, NOT AN EMPTY REPORT. Production had 0 rows in
// every editor table on 2026-08-26 because EDITOR_V2_START_ENABLED is off, and
// a silent exit would read as "renders are cheap".
if (byProject.size === 0) {
  console.log('No edit_events rows. Either no render has ever run here, or EDITOR_V2_START_ENABLED '
    + 'is off. This is not evidence that renders are cheap.')
  process.exit(0)
}
for (const [projectId, rows] of byProject) {
  const { data: call } = await db.from('edit_director_calls')
    .select('model, prompt_tokens, response_tokens, total_tokens')
    .eq('edit_project_id', projectId).maybeSingle()
  const { data: out } = await db.from('edit_outputs')
    .select('measured_duration_ms').eq('edit_project_id', projectId).maybeSingle()
  const { lines } = reportFor({
    projectId, events: rows, directorCall: call ?? null,
    outputDurationMs: out?.measured_duration_ms ?? null,
  })
  console.log(lines.join('\n'))
}
console.log(`\n${byProject.size} project(s). No total is printed on purpose: egress is metered nowhere.`)
