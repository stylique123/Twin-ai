#!/usr/bin/env node
// ⚠️ THE DANGEROUS FAILURE OF A TIER SYSTEM IS A CHANGE THAT GETS A CHEAPER GATE
// THAN IT NEEDS. Every case below pins something that must escalate, and each
// has a control proving the cheap path still exists — a classifier that sends
// everything to FULL is safe and useless, and would not be caught by
// escalation tests alone.
import {
  tierForFile, tierForFiles, TIERS, TIER_RANK, REQUIRES_MATRIX, CHEAP_TIERS,
  ALWAYS_REQUIRED_CHECKS,
} from './gate_tiers.mjs'

let pass = 0, fail = 0
const ok = (n, c) => { if (c) pass++; else { fail++; console.error(`  FAIL  ${n}`) } }
const tier = (f) => tierForFile(f)

// ── condition 3: workflow / gate implementation → FULL ────────────────────
ok('the gate\'s own workflow is FULL', tier('.github/workflows/staging-matrix-gate.yml') === 'FULL')
ok('any workflow is FULL', tier('.github/workflows/pr-checks.yml') === 'FULL')
ok('the deploy workflow is FULL — it decides what reaches production',
  tier('.github/workflows/deploy-edge.yml') === 'FULL')
// ⚠️ THE TRAP THIS FILE EXISTS TO AVOID. A naive scripts/ci/** exemption would
// have exempted the generator that writes edge-function code, and the gate
// grading its own rewrite.
ok('the gate implementation itself is FULL', tier('scripts/ci/staging_matrix_gate.mjs') === 'FULL')
ok('the tier classifier itself is FULL', tier('scripts/ci/gate_tiers.mjs') === 'FULL')
ok('the edge-function GENERATOR is FULL — it writes code that ships',
  tier('scripts/ci/generate_shared_pilot_core.mjs') === 'FULL')
ok('scripts/ci is FULL wholesale, with no allowlist to drift',
  tier('scripts/ci/anything_new_tomorrow.mjs') === 'FULL')

// ── condition 4: staging-integration → FULL ───────────────────────────────
ok('the harness that IS the matrix is FULL', tier('scripts/staging-integration/phase8.mjs') === 'FULL')
ok('and its selftests too', tier('scripts/staging-integration/zoomSweep.selftest.mjs') === 'FULL')

// ── condition 5: renderer / worker-media → FULL ───────────────────────────
ok('worker source is FULL', tier('worker/src/jobs/editorRender.ts') === 'FULL')
ok('the render catalog is FULL', tier('worker/render_catalog_v1.json') === 'FULL')

// ── condition 6: SQL is not static merely for being SQL ───────────────────
ok('a migration is FULL', tier('supabase/migrations/0166_whatever.sql') === 'FULL')
// ⚠️ BUT supabase/verify IS NOT supabase/migrations. Those files are pasted into
// a SQL editor by a human and applied by nothing.
ok('a read-only verifier query is STATIC', tier('supabase/verify/verify_0164_0165.sql') === 'STATIC')

// ── condition 7: db/edge/auth keeps its integration proof ─────────────────
ok('an edge function is DB_EDGE_AUTH', tier('supabase/functions/pilot-start/index.ts') === 'DB_EDGE_AUTH')
ok('a generated shared edge copy is DB_EDGE_AUTH', tier('supabase/functions/_shared/pilotCore.ts') === 'DB_EDGE_AUTH')
// ⚠️ AND THAT TIER IS NOT CHEAP TODAY. Naming a tier is not the same as having
// built the targeted subset it would run.
ok('DB_EDGE_AUTH still requires the matrix', REQUIRES_MATRIX.DB_EDGE_AUTH === true)
ok('WORKER_MEDIA still requires the matrix', REQUIRES_MATRIX.WORKER_MEDIA === true)
ok('only DOC and STATIC are cheap', CHEAP_TIERS.length === 2
  && CHEAP_TIERS.includes('DOC') && CHEAP_TIERS.includes('STATIC'))

// ── condition 8: genuinely static may skip ────────────────────────────────
ok('CONTROL: shared source is STATIC', tier('packages/shared/src/editor/uploadCeiling.ts') === 'STATIC')
ok('CONTROL: web source is STATIC', tier('apps/web/src/pages/v2/V2Capture.tsx') === 'STATIC')
ok('CONTROL: a shared test is STATIC', tier('packages/shared/src/editor/__tests__/x.test.ts') === 'STATIC')
ok('CONTROL: STATIC really does skip the matrix', REQUIRES_MATRIX.STATIC === false)
ok('CONTROL: documentation is DOC', tier('docs/x.md') === 'DOC' && tier('README.md') === 'DOC')

// ── the dependency surface ────────────────────────────────────────────────
// ⚠️ THE ROOT LOCKFILE CARRIES EVERY WORKSPACE'S RESOLUTIONS. A change there can
// move the worker's dependency tree even when the PR only meant to touch web.
// "It was only a web dependency" is a claim about intent, not about the file.
ok('the root lockfile is FULL', tier('package-lock.json') === 'FULL')
ok('a package.json is FULL', tier('apps/web/package.json') === 'FULL')

// ── condition 2 + 10: unknown escalates, never downgrades ─────────────────
ok('an unrecognised top-level file is FULL', tier('some_new_thing.py') === 'FULL')
ok('a new top-level directory is FULL', tier('infra/terraform/main.tf') === 'FULL')
ok('an empty name is FULL', tier('') === 'FULL' && tier(null) === 'FULL')

// ── the whole change set takes the HIGHEST tier any file demands ──────────
ok('one worker file among a hundred static ones forces FULL', (() => {
  const files = Array.from({ length: 100 }, (_, i) => `packages/shared/src/a${i}.ts`)
  files.push('worker/src/index.ts')
  const v = tierForFiles(files)
  return v.tier === 'FULL' && v.matrixRequired === true
})())
ok('and it NAMES the file that decided it', (() => {
  const v = tierForFiles(['apps/web/src/a.tsx', 'supabase/migrations/0166_x.sql'])
  return v.decidedBy === 'supabase/migrations/0166_x.sql'
})())
ok('an all-static change set is STATIC and skips the matrix', (() => {
  const v = tierForFiles(['packages/shared/src/a.ts', 'apps/web/src/b.tsx'])
  return v.tier === 'STATIC' && v.matrixRequired === false
})())
ok('docs plus one static file is STATIC, not DOC', (() => {
  const v = tierForFiles(['README.md', 'apps/web/src/b.tsx'])
  return v.tier === 'STATIC'
})())
ok('an all-docs change set stays DOC', tierForFiles(['README.md', 'docs/a.md']).tier === 'DOC')
// ⚠️ ZERO FILES IS NOT SAFETY. Same refusal the existing gate already makes.
ok('an empty list THROWS rather than returning a cheap tier', (() => {
  try { tierForFiles([]); return false } catch (e) { return /zero changed files/i.test(e.message) }
})())

// ── the ordering itself ───────────────────────────────────────────────────
ok('the tier order runs cheapest to dearest', (() => {
  for (let i = 1; i < TIERS.length; i++) if (TIER_RANK[TIERS[i]] <= TIER_RANK[TIERS[i - 1]]) return false
  return true
})())
ok('every tier has a matrix answer', TIERS.every((t) => typeof REQUIRES_MATRIX[t] === 'boolean'))
ok('FULL is the dearest tier', TIER_RANK.FULL === TIERS.length - 1)
// ⚖️ CONDITION 9: the cheap tiers are a claim about the MATRIX, never a claim
// that nothing needs to check the change.
ok('the always-required checks survive every tier', ALWAYS_REQUIRED_CHECKS.length === 4
  && ALWAYS_REQUIRED_CHECKS.includes('typecheck')
  && ALWAYS_REQUIRED_CHECKS.includes('generated-copy parity'))

console.log(`gate-tiers selftest: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
