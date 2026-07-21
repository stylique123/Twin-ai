// CI guard (B3): the TwinAI worker has ONE supported production deployment —
// VPS + Docker via worker/deploy-vps.sh, driven by
// .github/workflows/deploy-worker.yml. This guard fails the build if:
//
//   1. A SECOND deployment manifest for the WORKER reappears
//      (Fly/Railway/Render/Heroku) at ANY worker-deploy path — the repo root
//      or ANY path containing a `worker` segment (worker/, infra/worker/,
//      deploy/worker/, …). Manifests owned by known UNRELATED services
//      (postiz/, discovery/, apps/, …) are left alone.
//   2. ANY committed WORKER_JOB_TYPES runtime override exists outside the
//      allowlisted docs/tests/example files. The shared worker MUST run with
//      WORKER_JOB_TYPES unset (worker/src/env.ts is the canonical registry);
//      a committed override — even an incomplete non-retired one like
//      `WORKER_JOB_TYPES=ingest` — silently narrows/drifts the running set.
//   3. The canonical registry in worker/src/env.ts is not EXACTLY the five
//      allowed job types (order-insensitive, no extras, no duplicates):
//      ingest, build_voice, scrape_dna, validate_source, editor_v2. Strict
//      set-equality catches bypass names like `render_v2` / `edit_plan`.
//      Future EditPlan/renderer stages live INSIDE editor_v2, not as competing
//      top-level job types.
//
//   node scripts/ci/check_single_deploy_path.mjs            # PR guard
//   node scripts/ci/check_single_deploy_path.mjs --selftest # unit-test the logic
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const SELF = 'scripts/ci/check_single_deploy_path.mjs'
const ENV = 'worker/src/env.ts'
const ALLOWED_REGISTRY = ['ingest', 'build_voice', 'scrape_dna', 'validate_source', 'editor_v2']

// Second-deploy manifests. Vercel (web app) is intentionally NOT here.
const FORBIDDEN_MANIFEST = [
  /(^|\/)fly\.toml$/,
  /(^|\/)railway\.(toml|json)$/,
  /(^|\/)render\.ya?ml$/,
  /(^|\/)Procfile$/,
  /(^|\/)heroku\.yml$/,
]
// Known non-worker top-level service/dirs. A manifest whose FIRST path segment
// is one of these is that service's concern, never the worker's.
const UNRELATED_TOPLEVEL = new Set(['postiz', 'discovery', 'apps', 'packages', 'supabase', 'docs', 'eval'])

// A worker-deploy path = repo root, OR any path with a `worker` segment that
// isn't under a known unrelated top-level dir. Catches infra/worker/fly.toml,
// deploy/worker/render.yaml, worker/fly.toml — but not postiz/fly.toml.
export function isWorkerDeployPath(p) {
  const seg = p.split('/')
  if (seg.length === 1) return true
  if (UNRELATED_TOPLEVEL.has(seg[0])) return false
  return seg.includes('worker')
}
export function scopedManifests(tracked) {
  return tracked.filter((p) => isWorkerDeployPath(p) && FORBIDDEN_MANIFEST.some((re) => re.test(p)))
}

// Files where a WORKER_JOB_TYPES=<value> line is documentation/example/test, not
// a real runtime override of the shared worker.
export function isAllowlistedOverrideFile(p) {
  return p.endsWith('.md')
    || p === 'worker/.env.example'
    || /(^|\/)__tests__\//.test(p)
    || /\.(test|spec)\.[A-Za-z0-9]+$/.test(p)
    // The staging-integration matrix spawns EPHEMERAL workers with a specific
    // job type per phase — a test override, never the shared production worker.
    || /(^|\/)staging-integration\//.test(p)
    || p === SELF
}
// True when a line is an actual runtime assignment of WORKER_JOB_TYPES to a
// value (env file, Dockerfile ENV, export, compose `KEY: val` or `- KEY=val`) —
// NOT a comment, NOT a `sed '/^WORKER_JOB_TYPES=/d'` scrub, NOT the env.ts
// default (which reads `process.env.WORKER_JOB_TYPES ??`).
export function isRuntimeOverrideAssignment(content) {
  const t = content.replace(/^\s+/, '')
  if (t.startsWith('#')) return false
  const body = t.replace(/^(ENV\s+|export\s+|-\s+)/, '')
  return /^WORKER_JOB_TYPES\s*[:=]\s*\S/.test(body)
}

export function registryDiff(reg) {
  const extras = reg.filter((t) => !ALLOWED_REGISTRY.includes(t))
  const missing = ALLOWED_REGISTRY.filter((t) => !reg.includes(t))
  const dupes = [...new Set(reg.filter((t, i) => reg.indexOf(t) !== i))]
  return { extras, missing, dupes, equal: extras.length === 0 && missing.length === 0 && dupes.length === 0 }
}

// PURE decision. `state`: { tracked:[paths], overrides:[forbidden override lines], registry:[types] }.
export function evaluate(s) {
  const reasons = []
  const manifests = scopedManifests(s.tracked)
  if (manifests.length) {
    reasons.push(`second WORKER deployment manifest present (VPS+Docker is the only supported worker path): ${manifests.join(', ')}`)
  }
  if (s.overrides.length) {
    reasons.push(`committed WORKER_JOB_TYPES runtime override(s) — the shared worker must be unset (allowed only in docs/tests/.env.example): ${s.overrides.join(' ; ')}`)
  }
  const d = registryDiff(s.registry)
  if (!d.equal) {
    const bits = []
    if (d.extras.length) bits.push(`unexpected: ${d.extras.join(',')}`)
    if (d.missing.length) bits.push(`missing: ${d.missing.join(',')}`)
    if (d.dupes.length) bits.push(`duplicated: ${d.dupes.join(',')}`)
    reasons.push(`canonical registry (worker/src/env.ts) must equal exactly {${ALLOWED_REGISTRY.join(',')}} — ${bits.join('; ')}`)
  }
  return { ok: reasons.length === 0, reasons }
}

function selftest() {
  const R = [...ALLOWED_REGISTRY]
  const base = { tracked: ['worker/Dockerfile', 'package.json'], overrides: [], registry: R }
  const cases = [
    ['clean: exact five, no manifest/override', base, true],
    ['worker/fly.toml', { ...base, tracked: ['worker/fly.toml'] }, false],
    ['root fly.toml', { ...base, tracked: ['fly.toml'] }, false],
    ['infra/worker/fly.toml (worker-named anywhere)', { ...base, tracked: ['infra/worker/fly.toml'] }, false],
    ['deploy/worker/render.yaml (worker-named anywhere)', { ...base, tracked: ['deploy/worker/render.yaml'] }, false],
    ['postiz/fly.toml unrelated (allowed)', { ...base, tracked: ['postiz/fly.toml'] }, true],
    ['discovery/render.yaml unrelated (allowed)', { ...base, tracked: ['discovery/render.yaml'] }, true],
    ['apps/web/Procfile unrelated (allowed)', { ...base, tracked: ['apps/web/Procfile'] }, true],
    ['any committed override (even incomplete)', { ...base, overrides: ['deploy/worker.env:3 WORKER_JOB_TYPES=ingest'] }, false],
    ['retired-type override', { ...base, overrides: ['x.env:1 WORKER_JOB_TYPES=ingest,transcribe'] }, false],
    ['registry extra render_v2', { ...base, registry: [...R, 'render_v2'] }, false],
    ['registry extra edit_plan', { ...base, registry: [...R, 'edit_plan'] }, false],
    ['registry missing editor_v2', { ...base, registry: R.filter((t) => t !== 'editor_v2') }, false],
    ['registry duplicate editor_v2', { ...base, registry: [...R, 'editor_v2'] }, false],
  ]
  let failed = 0
  for (const [name, state, exp] of cases) {
    const got = evaluate(state).ok
    if (got !== exp) { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${exp}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  // classifier unit checks
  const assert = (cond, msg) => { if (!cond) { console.error(`SELFTEST FAIL: ${msg}`); failed++ } else console.log(`  ok: ${msg}`) }
  assert(isWorkerDeployPath('infra/worker/fly.toml'), 'isWorkerDeployPath infra/worker')
  assert(!isWorkerDeployPath('postiz/fly.toml'), 'isWorkerDeployPath postiz not worker')
  assert(isRuntimeOverrideAssignment('WORKER_JOB_TYPES=ingest'), 'assignment env form')
  assert(isRuntimeOverrideAssignment('  ENV WORKER_JOB_TYPES=a,b'), 'assignment Dockerfile ENV')
  assert(isRuntimeOverrideAssignment('  WORKER_JOB_TYPES: ingest'), 'assignment yaml form')
  assert(!isRuntimeOverrideAssignment("      sed -i '/^WORKER_JOB_TYPES=/d' f"), 'sed scrub is not an assignment')
  assert(!isRuntimeOverrideAssignment('# WORKER_JOB_TYPES=ingest'), 'comment is not an assignment')
  assert(!isRuntimeOverrideAssignment("  jobTypes: (process.env.WORKER_JOB_TYPES ?? 'a')"), 'env.ts default is not an assignment')
  assert(isAllowlistedOverrideFile('worker/.env.example'), 'allowlist .env.example')
  assert(isAllowlistedOverrideFile('DEPLOY.md'), 'allowlist docs')
  assert(isAllowlistedOverrideFile('scripts/staging-integration/phase5.mjs'), 'allowlist staging matrix')
  assert(!isAllowlistedOverrideFile('deploy/worker.env'), 'non-allowlisted real config')

  if (failed) { console.error(`single-deploy-path selftest: ${failed} failed`); process.exit(1) }
  console.log('single-deploy-path selftest: all cases passed'); process.exit(0)
}

function trackedFiles() {
  return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean)
}
function registryDefault() {
  const m = readFileSync(ENV, 'utf8').match(/jobTypes:\s*\(process\.env\.WORKER_JOB_TYPES\s*\?\?\s*'([^']*)'/)
  if (!m) return null
  return m[1].split(',').map((t) => t.trim()).filter(Boolean)
}

function main() {
  const tracked = trackedFiles()

  // Any committed WORKER_JOB_TYPES assignment outside allowlisted docs/tests.
  const overrides = []
  let grep = ''
  try { grep = execSync("git grep -nI 'WORKER_JOB_TYPES' -- . ':!" + SELF + "'", { encoding: 'utf8' }) } catch { grep = '' }
  for (const line of grep.split('\n').filter(Boolean)) {
    const m = line.match(/^(.+?):(\d+):(.*)$/)
    if (!m) continue
    const [, path, ln, content] = m
    if (isRuntimeOverrideAssignment(content) && !isAllowlistedOverrideFile(path)) {
      overrides.push(`${path}:${ln} ${content.trim()}`)
    }
  }

  const registry = registryDefault()
  if (!registry) {
    console.error(`::error::could not parse the canonical job registry from ${ENV}`)
    process.exit(1)
  }

  const state = { tracked, overrides, registry }
  console.log('single-deploy-path state: ' + JSON.stringify({
    workerManifests: scopedManifests(tracked), overrides, registry,
  }))

  const { ok, reasons } = evaluate(state)
  console.log(`single-deploy-path guard: ${ok ? 'OK' : 'FAIL'}`)
  if (!ok) { for (const r of reasons) console.error(`::error::${r}`); process.exit(1) }
}

if (process.argv.includes('--selftest')) selftest()
else main()
