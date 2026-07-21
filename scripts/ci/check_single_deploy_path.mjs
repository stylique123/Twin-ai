// CI guard (B3): the TwinAI worker has ONE supported production deployment —
// VPS + Docker via worker/deploy-vps.sh, driven by
// .github/workflows/deploy-worker.yml. This guard fails the build if:
//
//   1. A SECOND deployment manifest reappears (Fly/Railway/Render/Heroku/GAE) —
//      a stale second path is how the box config drifted from the code registry
//      (the removed worker/fly.toml still claimed retired `transcribe` and
//      omitted validate_source/editor_v2).
//   2. A committed WORKER_JOB_TYPES override resurrects a RETIRED job type
//      (`autoedit` removed with the old editor; `transcribe` folded into
//      `ingest`). worker/src/env.ts is the single canonical registry.
//   3. The canonical registry stops being a clean singleton set: `editor_v2`
//      must appear EXACTLY once, and any future `render`/`editplan` job type at
//      most once — preserving one editor_v2 job type, one canonical EditPlan,
//      and one renderer (never two competing paths).
//
//   node scripts/ci/check_single_deploy_path.mjs            # PR guard
//   node scripts/ci/check_single_deploy_path.mjs --selftest # unit-test the logic
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const SELF = 'scripts/ci/check_single_deploy_path.mjs'
const ENV = 'worker/src/env.ts'

// Second-deploy-path manifests. Vercel (web app) is intentionally NOT here —
// it deploys the frontend, not the worker.
const FORBIDDEN_MANIFEST = [
  /(^|\/)fly\.toml$/,
  /(^|\/)railway\.(toml|json)$/,
  /(^|\/)render\.ya?ml$/,
  /(^|\/)Procfile$/,
  /(^|\/)heroku\.yml$/,
  /(^|\/)app\.yaml$/,
]

// PURE decision, unit-tested. `state` fields:
//   manifests:   array of forbidden deploy-manifest paths found (tracked)
//   badOverrides:array of "file:line value" WORKER_JOB_TYPES overrides that
//                name a retired type
//   editorV2Count, renderCount, editplanCount: occurrences in the canonical
//                registry default; hasAutoedit/hasTranscribe: retired types in it
// Returns { ok, reasons }.
export function evaluate(s) {
  const reasons = []
  if (s.manifests.length) {
    reasons.push(`second deployment manifest present (VPS+Docker is the only supported path): ${s.manifests.join(', ')}`)
  }
  if (s.badOverrides.length) {
    reasons.push(`WORKER_JOB_TYPES override names a retired job type: ${s.badOverrides.join(' ; ')}`)
  }
  if (s.hasAutoedit) reasons.push('canonical registry (worker/src/env.ts) still lists retired `autoedit`')
  if (s.hasTranscribe) reasons.push('canonical registry (worker/src/env.ts) still lists retired `transcribe`')
  if (s.editorV2Count !== 1) reasons.push(`canonical registry must list \`editor_v2\` exactly once (found ${s.editorV2Count})`)
  if (s.renderCount > 1) reasons.push(`more than one renderer job type in the canonical registry (found ${s.renderCount})`)
  if (s.editplanCount > 1) reasons.push(`more than one EditPlan job type in the canonical registry (found ${s.editplanCount})`)
  return { ok: reasons.length === 0, reasons }
}

function selftest() {
  const base = { manifests: [], badOverrides: [], hasAutoedit: false, hasTranscribe: false, editorV2Count: 1, renderCount: 0, editplanCount: 0 }
  const cases = [
    ['clean singleton registry, no extra manifest', base, true],
    ['fly.toml reintroduced', { ...base, manifests: ['worker/fly.toml'] }, false],
    ['render.yaml reintroduced', { ...base, manifests: ['render.yaml'] }, false],
    ['WORKER_JOB_TYPES override resurrects transcribe', { ...base, badOverrides: ['worker/fly.toml:12 ingest,transcribe'] }, false],
    ['registry still lists autoedit', { ...base, hasAutoedit: true }, false],
    ['registry still lists transcribe', { ...base, hasTranscribe: true }, false],
    ['editor_v2 missing from registry', { ...base, editorV2Count: 0 }, false],
    ['editor_v2 duplicated', { ...base, editorV2Count: 2 }, false],
    ['two renderers', { ...base, renderCount: 2 }, false],
    ['two editplan types', { ...base, editplanCount: 2 }, false],
    ['one renderer + one editplan is allowed', { ...base, renderCount: 1, editplanCount: 1 }, true],
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
  // Parse the default string from:
  //   jobTypes: (process.env.WORKER_JOB_TYPES ?? 'a,b,c').split(',')...
  const m = readFileSync(ENV, 'utf8').match(/jobTypes:\s*\(process\.env\.WORKER_JOB_TYPES\s*\?\?\s*'([^']*)'/)
  if (!m) return null
  return m[1].split(',').map((t) => t.trim()).filter(Boolean)
}

function main() {
  const tracked = trackedFiles()
  const manifests = tracked.filter((p) => FORBIDDEN_MANIFEST.some((re) => re.test(p)))

  // WORKER_JOB_TYPES *assignments* (not prose) whose VALUE names a retired type.
  const badOverrides = []
  let grep = ''
  try { grep = execSync("git grep -nE 'WORKER_JOB_TYPES[[:space:]]*=' -- . ':!" + SELF + "'", { encoding: 'utf8' }) } catch { grep = '' }
  for (const line of grep.split('\n').filter(Boolean)) {
    const eq = line.indexOf('=')
    const value = eq >= 0 ? line.slice(eq + 1) : ''
    if (/\b(autoedit|transcribe)\b/.test(value)) badOverrides.push(line.trim())
  }

  const reg = registryDefault()
  if (!reg) {
    console.error(`::error::could not parse the canonical job registry from ${ENV}`)
    process.exit(1)
  }
  const count = (t) => reg.filter((x) => x === t).length
  const state = {
    manifests,
    badOverrides,
    hasAutoedit: reg.includes('autoedit'),
    hasTranscribe: reg.includes('transcribe'),
    editorV2Count: count('editor_v2'),
    renderCount: count('render'),
    editplanCount: count('editplan'),
  }

  console.log('single-deploy-path state: ' + JSON.stringify({
    manifests: state.manifests, badOverrides: state.badOverrides,
    registry: reg, editorV2Count: state.editorV2Count,
  }))

  const { ok, reasons } = evaluate(state)
  console.log(`single-deploy-path guard: ${ok ? 'OK' : 'FAIL'}`)
  if (!ok) { for (const r of reasons) console.error(`::error::${r}`); process.exit(1) }
}

if (process.argv.includes('--selftest')) selftest()
else main()
