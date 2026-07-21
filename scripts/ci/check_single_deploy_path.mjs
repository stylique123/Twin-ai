// CI guard (B3): the TwinAI worker has ONE supported production deployment —
// VPS + Docker via worker/deploy-vps.sh, driven by
// .github/workflows/deploy-worker.yml. This guard fails the build if:
//
//   1. A SECOND deployment manifest for the WORKER reappears
//      (Fly/Railway/Render/Heroku) at a worker-deploy path (repo root or
//      worker/). Manifests belonging to UNRELATED services (e.g. postiz/,
//      discovery/) are NOT the worker's deploy path and are left alone.
//   2. A committed WORKER_JOB_TYPES override resurrects a RETIRED job type
//      (`autoedit` removed with the old editor; `transcribe` folded into
//      `ingest`).
//   3. The canonical registry in worker/src/env.ts is not EXACTLY the five
//      allowed job types (order-insensitive, no extras, no duplicates):
//      ingest, build_voice, scrape_dna, validate_source, editor_v2.
//      Strict set-equality — not per-name counting — so a bypass name like
//      `render_v2` or `edit_plan` is caught as an extra. Preserves one
//      editor_v2 loop; future EditPlan/renderer stages live INSIDE editor_v2,
//      not as competing top-level job types. Update this list deliberately
//      when a new top-level job type is genuinely added.
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

// A worker-deploy path is the repo root (no directory) or under worker/.
// Anything under another service dir (postiz/, discovery/, apps/, …) is that
// service's concern, not the worker's, and is never flagged here.
export function isWorkerDeployPath(p) {
  if (p.startsWith('worker/')) return true
  return !p.includes('/')
}
export function scopedManifests(tracked) {
  return tracked.filter((p) => isWorkerDeployPath(p) && FORBIDDEN_MANIFEST.some((re) => re.test(p)))
}
export function registryDiff(reg) {
  const extras = reg.filter((t) => !ALLOWED_REGISTRY.includes(t))
  const missing = ALLOWED_REGISTRY.filter((t) => !reg.includes(t))
  const dupes = [...new Set(reg.filter((t, i) => reg.indexOf(t) !== i))]
  return { extras, missing, dupes, equal: extras.length === 0 && missing.length === 0 && dupes.length === 0 }
}

// PURE decision, unit-tested. `state` fields:
//   tracked:      array of tracked file paths
//   badOverrides: array of "file:line value" WORKER_JOB_TYPES overrides naming a retired type
//   registry:     array of job types parsed from the canonical env.ts default
// Returns { ok, reasons }.
export function evaluate(s) {
  const reasons = []
  const manifests = scopedManifests(s.tracked)
  if (manifests.length) {
    reasons.push(`second WORKER deployment manifest present (VPS+Docker is the only supported worker path): ${manifests.join(', ')}`)
  }
  if (s.badOverrides.length) {
    reasons.push(`WORKER_JOB_TYPES override names a retired job type: ${s.badOverrides.join(' ; ')}`)
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
  const cases = [
    ['clean: exact five + no manifest', { tracked: ['worker/Dockerfile', 'package.json'], badOverrides: [], registry: R }, true],
    ['worker/fly.toml reintroduced', { tracked: ['worker/fly.toml'], badOverrides: [], registry: R }, false],
    ['root fly.toml reintroduced', { tracked: ['fly.toml'], badOverrides: [], registry: R }, false],
    ['root render.yaml reintroduced', { tracked: ['render.yaml'], badOverrides: [], registry: R }, false],
    // UNRELATED-service manifests must NOT trip the worker guard:
    ['postiz/fly.toml is unrelated (allowed)', { tracked: ['postiz/fly.toml'], badOverrides: [], registry: R }, true],
    ['discovery/render.yaml is unrelated (allowed)', { tracked: ['discovery/render.yaml'], badOverrides: [], registry: R }, true],
    ['apps/web/vercel Procfile-elsewhere unrelated', { tracked: ['apps/web/Procfile'], badOverrides: [], registry: R }, true],
    ['WORKER_JOB_TYPES override resurrects transcribe', { tracked: [], badOverrides: ['worker/fly.toml:12 ingest,transcribe'], registry: R }, false],
    // Strict set-equality catches bypass names that per-name counting missed:
    ['bypass name render_v2 as extra', { tracked: [], badOverrides: [], registry: [...R, 'render_v2'] }, false],
    ['bypass name edit_plan as extra', { tracked: [], badOverrides: [], registry: [...R, 'edit_plan'] }, false],
    ['retired autoedit as extra', { tracked: [], badOverrides: [], registry: [...R, 'autoedit'] }, false],
    ['editor_v2 missing', { tracked: [], badOverrides: [], registry: R.filter((t) => t !== 'editor_v2') }, false],
    ['editor_v2 duplicated', { tracked: [], badOverrides: [], registry: [...R, 'editor_v2'] }, false],
  ]
  let failed = 0
  for (const [name, state, exp] of cases) {
    const got = evaluate(state).ok
    if (got !== exp) { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${exp}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
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

  // WORKER_JOB_TYPES *assignments* (not prose) whose VALUE names a retired type.
  const badOverrides = []
  let grep = ''
  try { grep = execSync("git grep -nE 'WORKER_JOB_TYPES[[:space:]]*=' -- . ':!" + SELF + "'", { encoding: 'utf8' }) } catch { grep = '' }
  for (const line of grep.split('\n').filter(Boolean)) {
    const eq = line.indexOf('=')
    const value = eq >= 0 ? line.slice(eq + 1) : ''
    if (/\b(autoedit|transcribe)\b/.test(value)) badOverrides.push(line.trim())
  }

  const registry = registryDefault()
  if (!registry) {
    console.error(`::error::could not parse the canonical job registry from ${ENV}`)
    process.exit(1)
  }

  const state = { tracked, badOverrides, registry }
  console.log('single-deploy-path state: ' + JSON.stringify({
    workerManifests: scopedManifests(tracked), badOverrides, registry,
  }))

  const { ok, reasons } = evaluate(state)
  console.log(`single-deploy-path guard: ${ok ? 'OK' : 'FAIL'}`)
  if (!ok) { for (const r of reasons) console.error(`::error::${r}`); process.exit(1) }
}

if (process.argv.includes('--selftest')) selftest()
else main()
