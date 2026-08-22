#!/usr/bin/env node
// ⚠️ THE ONLY FAILURE THAT MATTERS IS ROUTING SOMETHING DANGEROUS TO THE CHEAP
// PATH. A classifier that over-escalates costs wall-clock; one that
// under-escalates removes evidence and nobody finds out. Every case below is
// written from that asymmetry.
import {
  classify, ownedTier, higher, reachableFrom, assertWorkerIndependence,
  TIERS, REQUIRED_CHECKS, WORKER_ROOTS,
} from './classify_change.mjs'

let pass = 0, fail = 0
const ok = (n, c) => { if (c) pass++; else { fail++; console.error(`  FAIL  ${n}`) } }

// Fixed reach so these cases test the CLASSIFIER, not the repo's current graph.
const reach = { files: new Set(['worker/src/jobs/ffmpegGraph.ts']), unresolved: [] }
const cls = (files, r = reach) => classify(files, { reach: r })

// ── the cheap path, earned ────────────────────────────────────────────────
ok('a CI guard is static', cls(['scripts/ci/check_thing.mjs']).tier === TIERS.STATIC)
ok('a doc is static', cls(['docs/whatever.md']).tier === TIERS.STATIC)
ok('a shared module is static — the worker cannot import it', cls(['packages/shared/src/api.ts']).tier === TIERS.STATIC)
ok('a web page is static', cls(['apps/web/src/pages/Thing.tsx']).tier === TIERS.STATIC)

// ── escalation ────────────────────────────────────────────────────────────
ok('a migration is db/edge/auth', cls(['supabase/migrations/0166_x.sql']).tier === TIERS.DB_EDGE_AUTH)
ok('an edge function is db/edge/auth', cls(['supabase/functions/pilot-start/index.ts']).tier === TIERS.DB_EDGE_AUTH)
ok('a worker file is worker/media', cls(['worker/src/jobs/ffmpegGraph.ts']).tier === TIERS.WORKER_MEDIA)
ok('a workflow change is FULL — the gate may not grade its own change',
  cls(['.github/workflows/pr-checks.yml']).tier === TIERS.FULL)

// ⚠️ THE ONE THAT PROTECTS EVERYTHING ELSE.
ok('an UNKNOWN path fails closed to full', cls(['some/brand/new/place.ts']).tier === TIERS.FULL)
ok('...and says why', cls(['some/brand/new/place.ts']).reasons.some((r) => r.includes('no capability owner')))
ok('an empty file list fails closed to full — a missing diff is not "nothing to test"',
  cls([]).tier === TIERS.FULL)
ok('a non-array fails closed to full', classify(null, { reach }).tier === TIERS.FULL)

// ── the highest wins ──────────────────────────────────────────────────────
ok('static + worker = worker', cls(['docs/a.md', 'worker/src/x.ts']).tier === TIERS.WORKER_MEDIA)
ok('worker + unknown = full', cls(['worker/src/x.ts', 'mystery/z.ts']).tier === TIERS.FULL)
ok('db + worker = worker', cls(['supabase/migrations/1.sql', 'worker/src/x.ts']).tier === TIERS.WORKER_MEDIA)
ok('higher() never goes down', higher(TIERS.FULL, TIERS.STATIC) === TIERS.FULL
  && higher(TIERS.STATIC, TIERS.FULL) === TIERS.FULL)

// ── dependency reach beats ownership, upward only ─────────────────────────
{
  // A file that OWNERSHIP would call static, but which the renderer reaches.
  const r = { files: new Set(['packages/shared/src/api.ts']), unresolved: [] }
  const got = cls(['packages/shared/src/api.ts'], r)
  ok('a reachable "static" file is ESCALATED, not trusted to its path',
    got.tier === TIERS.WORKER_MEDIA)
  ok('...and the reason names the reach', got.reasons.some((x) => x.includes('reachable from the worker')))
}

// ── an incomplete graph escalates rather than shrinking quietly ───────────
{
  const r = { files: new Set(), unresolved: ['worker/src/a.ts -> ./missing.js'] }
  const got = cls(['docs/a.md'], r)
  ok('unresolvable imports escalate to full', got.tier === TIERS.FULL)
  ok('...and say the reachable set may be incomplete',
    got.reasons.some((x) => x.includes('incomplete')))
}

// ── required checks never drop a security check ───────────────────────────
for (const tier of Object.values(TIERS)) {
  const req = REQUIRED_CHECKS[tier]
  ok(`${tier} still runs the static guards`, req.includes('static-guards'))
  ok(`${tier} still runs the generated-copy drift check`, req.includes('generated-copy-drift'))
  ok(`${tier} still typechecks`, req.includes('typecheck'))
}
ok('only the two top tiers run the full matrix',
  !REQUIRED_CHECKS[TIERS.STATIC].includes('full-staging-matrix')
  && !REQUIRED_CHECKS[TIERS.DB_EDGE_AUTH].includes('full-staging-matrix')
  && REQUIRED_CHECKS[TIERS.WORKER_MEDIA].includes('full-staging-matrix')
  && REQUIRED_CHECKS[TIERS.FULL].includes('full-staging-matrix'))
ok('a db/edge change still gets its auth and schema evidence',
  REQUIRED_CHECKS[TIERS.DB_EDGE_AUTH].includes('rls-auth-security')
  && REQUIRED_CHECKS[TIERS.DB_EDGE_AUTH].includes('migration-schema'))

// ── the premise ───────────────────────────────────────────────────────────
ok('the worker really is independent of shared in THIS repo right now',
  assertWorkerIndependence().length === 0)
{
  // Prove the guard would fire, using a fixture root rather than the real repo.
  const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'wi-'))
  mkdirSync(join(dir, 'worker'))
  writeFileSync(join(dir, 'worker/package.json'),
    JSON.stringify({ dependencies: { '@twinai/shared': '1.0.0' } }))
  const problems = assertWorkerIndependence(dir)
  ok('a worker that depends on shared is caught', problems.length === 1)
  ok('...and the message says what to change', String(problems[0]).includes('OWNERSHIP'))
  ok('...and classification refuses entirely rather than routing cheaply',
    classify(['docs/a.md'], { root: dir, reach }).tier === TIERS.FULL)
}

// ── the real graph, sanity ────────────────────────────────────────────────
{
  const r = reachableFrom(WORKER_ROOTS)
  ok('the worker roots reach a non-trivial set', r.files.size > 5)
  ok('and every import in it resolves', r.unresolved.length === 0)
}

console.log(`classify-change selftest: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
