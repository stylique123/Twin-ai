// RC5 + R5: honest residue classifier for the prod-source-smoke probe cleanup.
//
// A probe run creates up to FOUR artifacts: a Storage object, a
// public.media_assets row, a generations.source_asset_id pointer, and
// service-side validate_source job/event state. The in-workflow cleanup CANNOT
// remove any of them from the client: the `takes` bucket has only INSERT+SELECT
// policies (NO DELETE — verified from migrations), and the DB row/pointer/jobs
// are service-side. So the workflow must NEVER claim "no orphan left" or claim a
// deletion it did not observe.
//
// Each artifact carries `present`: true (confirmed present), false (confirmed
// absent via an OBSERVED supported-API result), or "unknown" (could not be
// confirmed removed — e.g. a create whose response was lost, or a delete with
// no observed 400/404). CLEAN requires EVERY artifact to be confirmed absent
// (present === false). true OR "unknown" is residue → fail closed. A partial
// cleanup, a lost create response, or an unconfirmed delete can never pass.
//
//   node scripts/prod-smoke/probe_residue_report.mjs            # reads PROBE_RESIDUE_JSON
//   node scripts/prod-smoke/probe_residue_report.mjs --selftest # unit-test the logic

// artifacts: [{ name, id, present: true|false|"unknown" }] — PURE decision.
export function classify(artifacts) {
  const residue = artifacts.filter((a) => a.present !== false)
  const clean = residue.length === 0
  const label = (a) => (a.present === 'unknown' ? 'UNKNOWN' : 'PRESENT')
  const report = clean
    ? 'RESIDUE REPORT: clean — every probe artifact confirmed absent via observed results.'
    : [
        'RECOVERABLE-ARTIFACT REPORT — probe residue is PRESENT or UNKNOWN and in-workflow cleanup CANNOT remove it.',
        'This is NOT self-cleaning and claims no deletion it did not observe. Hand off to the sanctioned operator retention cleanup:',
        ...residue.map((a) => `  - [${label(a)}] ${a.name}: ${a.id ?? '(no id)'}`),
      ].join('\n')
  return { clean, residue, report }
}

function selftest() {
  const A = (name, present, id) => ({ name, id: id ?? null, present })
  const all = ['storage_object', 'media_assets_row', 'generation_pointer', 'validation_job_events']
  const cases = []
  cases.push(['all confirmed absent → clean', all.map((n) => A(n, false)), true])
  for (const n of all) {
    cases.push([`${n} present → not clean`, all.map((x) => A(x, x === n)), false])
    cases.push([`${n} unknown → not clean`, all.map((x) => A(x, x === n ? 'unknown' : false)), false])
  }
  // create-response-loss: asset id unknown, so object/row/pointer all unknown
  cases.push(['create response lost (asset unknown) → not clean', [
    A('storage_object', 'unknown', 'gen/attempt'), A('media_assets_row', 'unknown', 'gen/attempt'),
    A('generation_pointer', 'unknown', 'gen'), A('validation_job_events', 'unknown', 'gen')], false])
  // realistic: delete unconfirmed (unknown) + row/pointer/jobs present
  cases.push(['delete unconfirmed + db residue → not clean', [
    A('storage_object', 'unknown', 'p'), A('media_assets_row', true, 'ma'),
    A('generation_pointer', true, 'gen'), A('validation_job_events', true, 'job')], false])

  let failed = 0
  for (const [name, arts, expClean] of cases) {
    const { clean, residue } = classify(arts)
    const residual = arts.filter((a) => a.present !== false)
    const ok = clean === expClean && residue.length === residual.length && residual.every((r) => residue.includes(r))
    if (!ok) { console.error(`SELFTEST FAIL: ${name} => clean=${clean}, residue=${residue.length}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) { console.error(`probe-residue selftest: ${failed} failed`); process.exit(1) }
  console.log('probe-residue selftest: all cases passed'); process.exit(0)
}

// Only self-execute when run directly (NOT when imported, e.g. by the harness).
import { fileURLToPath } from 'node:url'
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (process.argv.includes('--selftest')) selftest()
  else {
    let arts
    try { arts = JSON.parse(process.env.PROBE_RESIDUE_JSON || '[]') } catch { console.error('::error::PROBE_RESIDUE_JSON not valid JSON'); process.exit(1) }
    const { clean, report } = classify(arts)
    console.log(report)
    if (!clean) { console.error('::error::probe cleanup left PRESENT/UNKNOWN residue — sanctioned operator retention required (see report above)'); process.exit(1) }
  }
}
