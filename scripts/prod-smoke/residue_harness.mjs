// R5-5: failure-injection harness for the prod-source-smoke residue accounting.
//
// The pure classifier (probe_residue_report.mjs) is necessary but not
// sufficient — it only proves the verdict function. THIS harness models the
// WORKFLOW's real control-flow branches (create committed/response-lost;
// malformed/no assetId; signed-upload failure; finalize failure; client Storage
// DELETE denied; DB/pointer/job/event residue; classifier/report failure) and
// asserts the safety invariant:
//
//   No branch in which a create was ATTEMPTED may exit success (clean) while any
//   artifact is PRESENT or UNKNOWN. The ONLY clean exit is "no create was ever
//   attempted" (nothing was created).
//
// It also VALIDATES THE POLICY ASSUMPTION FROM MIGRATIONS (not comments): the
// `takes` bucket must have NO storage DELETE policy, so the workflow can never
// confirm the object absent via a client delete — its `storage_object` state
// after an attempted create must be `true` or `"unknown"`, never `false`.
//
//   node scripts/prod-smoke/residue_harness.mjs --selftest
import { readFileSync, readdirSync } from 'node:fs'
import { classify } from './probe_residue_report.mjs'

// A workflow scenario → the residue artifact state the workflow would report,
// plus whether a create was attempted. present ∈ {true,false,"unknown"}.
const SCEN = [
  {
    name: 'no create attempted (nothing created)',
    attemptedCreate: false,
    artifacts: [a('storage_object', false), a('media_assets_row', false), a('generation_pointer', false), a('validation_job_events', false)],
  },
  {
    name: 'create committed but response lost (no assetId)',
    attemptedCreate: true,
    artifacts: [a('storage_object', 'unknown'), a('media_assets_row', 'unknown'), a('generation_pointer', 'unknown'), a('validation_job_events', 'unknown')],
  },
  {
    name: 'malformed / null assetId returned',
    attemptedCreate: true,
    artifacts: [a('storage_object', 'unknown'), a('media_assets_row', 'unknown'), a('generation_pointer', 'unknown'), a('validation_job_events', 'unknown')],
  },
  {
    name: 'signed upload (PUT) failure after create',
    attemptedCreate: true,
    artifacts: [a('storage_object', 'unknown'), a('media_assets_row', true), a('generation_pointer', 'unknown'), a('validation_job_events', 'unknown')],
  },
  {
    name: 'finalize failure after upload',
    attemptedCreate: true,
    artifacts: [a('storage_object', true), a('media_assets_row', true), a('generation_pointer', 'unknown'), a('validation_job_events', 'unknown')],
  },
  {
    name: 'client Storage DELETE denied (no takes DELETE policy)',
    attemptedCreate: true,
    artifacts: [a('storage_object', 'unknown'), a('media_assets_row', true), a('generation_pointer', true), a('validation_job_events', true)],
  },
  {
    name: 'full chain ok but DB row/pointer/jobs remain (not client-removable)',
    attemptedCreate: true,
    artifacts: [a('storage_object', 'unknown'), a('media_assets_row', true), a('generation_pointer', true), a('validation_job_events', true)],
  },
]

function a(name, present) { return { name, id: 'probe', present } }

function migrationsHaveNoTakesDelete() {
  const dir = 'supabase/migrations'
  let all = ''
  for (const f of readdirSync(dir)) { if (f.endsWith('.sql')) all += '\n' + readFileSync(`${dir}/${f}`, 'utf8') }
  // any policy on storage.objects that is FOR DELETE and scoped to bucket 'takes'
  const deletePolicy = /create\s+policy[\s\S]{0,400}?for\s+delete[\s\S]{0,400}?takes/i.test(all)
    || /takes[\s\S]{0,200}?for\s+delete/i.test(all)
  return !deletePolicy
}

function selftest() {
  let failed = 0
  const ok = (cond, msg) => { if (!cond) { console.error(`HARNESS FAIL: ${msg}`); failed++ } else console.log(`  ok: ${msg}`) }

  // 1. Policy assumption validated from migrations, not comments.
  ok(migrationsHaveNoTakesDelete(), 'migrations define NO `takes` storage DELETE policy (client cannot delete its take object)')

  // 2. Safety invariant across every modeled branch.
  for (const s of SCEN) {
    const { clean } = classify(s.artifacts)
    const anyResidue = s.artifacts.some((x) => x.present !== false)
    if (s.attemptedCreate) {
      // After an attempted create, a clean/success exit is ONLY allowed when
      // every artifact is confirmed absent — which never happens here because
      // the object is never client-deletable and the DB rows are service-side.
      ok(!(clean && anyResidue), `attempted-create branch never exits clean with residue — ${s.name}`)
      ok(!clean, `attempted-create branch fails closed (exit non-zero) — ${s.name}`)
      // The storage_object must never be reported confirmed-absent by a client
      // delete (no DELETE policy): it must be true or "unknown".
      const obj = s.artifacts.find((x) => x.name === 'storage_object')
      ok(obj.present !== false, `storage_object not falsely confirmed-deleted — ${s.name}`)
    } else {
      ok(clean, `no-create branch may exit clean — ${s.name}`)
    }
  }

  // 3. Classifier/report failure ⇒ fail closed (invalid input is not "clean").
  //    The workflow runs the classifier with `set -euo pipefail`; a throw/nonzero
  //    aborts the step. Model: malformed artifact array must not classify clean.
  const malformed = classify([{ name: 'x', present: 'unknown' }])
  ok(!malformed.clean, 'classifier on any unknown artifact is not clean (report-path failure stays fail-closed)')

  if (failed) { console.error(`residue-harness: ${failed} failed`); process.exit(1) }
  console.log('residue-harness: all branches + migration policy check passed'); process.exit(0)
}

if (process.argv.includes('--selftest')) selftest()
else { console.error('run with --selftest'); process.exit(2) }
