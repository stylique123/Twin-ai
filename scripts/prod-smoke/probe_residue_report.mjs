// RC5: honest residue classifier for the prod-source-smoke probe cleanup.
//
// A probe run creates FOUR artifacts: a Storage object, a public.media_assets
// row, a generations.source_asset_id pointer, and service-side validate_source
// job/event state. The in-workflow cleanup can only delete the Storage object
// (owner-RLS); it CANNOT remove the media_assets row, null the generation
// pointer, or delete the service-side job/events. So the workflow must NEVER
// claim "no orphan left". This classifier is the single truth: it is CLEAN only
// when EVERY artifact is absent; otherwise it emits a RECOVERABLE-ARTIFACT
// REPORT listing exactly what remains, and the workflow fails closed and hands
// off to the sanctioned operator retention path. A partial cleanup can never
// silently pass with an unreported row/pointer/blob.
//
//   node scripts/prod-smoke/probe_residue_report.mjs            # reads PROBE_RESIDUE_JSON
//   node scripts/prod-smoke/probe_residue_report.mjs --selftest # unit-test the logic

// artifacts: [{ name, id, present }] — PURE decision.
export function classify(artifacts) {
  const residue = artifacts.filter((a) => a.present)
  const clean = residue.length === 0
  const report = clean
    ? 'RESIDUE REPORT: clean — every probe artifact (object, media_assets row, generation pointer, validation job/events) is absent.'
    : [
        'RECOVERABLE-ARTIFACT REPORT — the probe left residue that in-workflow cleanup CANNOT remove.',
        'This is NOT self-cleaning. Hand off to the sanctioned operator retention cleanup to remove/unlink:',
        ...residue.map((a) => `  - ${a.name}: ${a.id ?? '(present)'}`),
      ].join('\n')
  return { clean, residue, report }
}

function selftest() {
  const A = (name, present, id) => ({ name, id: id ?? null, present })
  const all = ['storage_object', 'media_assets_row', 'generation_pointer', 'validation_job_events']
  const cases = []
  // all absent → clean
  cases.push(['all absent → clean', all.map((n) => A(n, false)), true])
  // each single artifact present → NOT clean (can't silently pass)
  for (const present of all) {
    cases.push([`${present} present → not clean`, all.map((n) => A(n, n === present, n === present ? 'id-1' : null)), false])
  }
  // realistic partial: object deleted, row + pointer + jobs remain → not clean, 3 residue
  cases.push(['object deleted but row+pointer+jobs remain → not clean',
    [A('storage_object', false), A('media_assets_row', true, 'ma-1'), A('generation_pointer', true, 'gen-1'), A('validation_job_events', true, 'job-1')], false])

  let failed = 0
  for (const [name, arts, expClean] of cases) {
    const { clean, residue } = classify(arts)
    const present = arts.filter((a) => a.present)
    // invariant: clean iff no artifact present; residue must list EVERY present artifact
    const ok = clean === expClean && residue.length === present.length && present.every((p) => residue.includes(p))
    if (!ok) { console.error(`SELFTEST FAIL: ${name} => clean=${clean}, residue=${residue.length}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) { console.error(`probe-residue selftest: ${failed} failed`); process.exit(1) }
  console.log('probe-residue selftest: all cases passed'); process.exit(0)
}

if (process.argv.includes('--selftest')) selftest()
else {
  let arts
  try { arts = JSON.parse(process.env.PROBE_RESIDUE_JSON || '[]') } catch { console.error('::error::PROBE_RESIDUE_JSON not valid JSON'); process.exit(1) }
  const { clean, report } = classify(arts)
  console.log(report)
  if (!clean) { console.error('::error::probe cleanup left recoverable residue — sanctioned operator retention required (see report above)'); process.exit(1) }
}
