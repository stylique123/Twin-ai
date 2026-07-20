// CI guard (P2): the model pin and the analyzer bundle version are COUPLED.
// If the semantic manifest core (repository, revision, required-file digests)
// changes versus the merge base, the DEFAULT analyzer bundle version in
// worker/src/env.ts MUST also change. A model-pin change with an unchanged
// version is a silent immutability break and FAILS CI.
//
//   node scripts/ci/check_model_pin_coupling.mjs            # PR guard (uses base)
//   node scripts/ci/check_model_pin_coupling.mjs --selftest # unit-test the logic
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const MANIFEST = 'worker/models/faster-whisper-small.manifest.json'
const ENV = 'worker/src/env.ts'

function canonicalize(v) {
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']'
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}'
  return JSON.stringify(v)
}
function coreDigest(manifestText) {
  const m = JSON.parse(manifestText)
  return createHash('sha256').update(canonicalize({ repository: m.repository, revision: m.revision, files: m.files })).digest('hex')
}
function defaultVersion(envText) {
  const m = envText.match(/speechVersion:\s*\(process\.env\.EDITOR_SPEECH_VERSION\s*\?\?\s*'([^']+)'/)
  return m ? m[1] : null
}

// PURE, unit-tested rule: a manifest-core change REQUIRES a version change.
export function couplingViolation(baseCore, headCore, baseVer, headVer) {
  const coreChanged = baseCore !== headCore
  const verChanged = baseVer !== headVer
  return coreChanged && !verChanged
}

function selftest() {
  const A = 'coreA', B = 'coreB'
  const cases = [
    // [baseCore, headCore, baseVer, headVer, expectViolation]
    [A, A, 'speech-6', 'speech-6', false],   // nothing changed
    [A, B, 'speech-6', 'speech-7', false],   // core + version both changed → ok
    [A, B, 'speech-6', 'speech-6', true],    // core changed, version NOT → violation
    [A, A, 'speech-6', 'speech-7', false],   // version bumped without core change → ok (cache bump)
  ]
  let failed = 0
  for (const [bc, hc, bv, hv, exp] of cases) {
    const got = couplingViolation(bc, hc, bv, hv)
    if (got !== exp) { console.error(`SELFTEST FAIL: (${bc},${hc},${bv},${hv}) => ${got}, expected ${exp}`); failed++ }
  }
  if (failed) { console.error(`coupling selftest: ${failed} failed`); process.exit(1) }
  console.log('coupling selftest: all cases passed'); process.exit(0)
}

function main() {
  const base = `origin/${process.env.GITHUB_BASE_REF || 'main'}`
  let baseManifest, baseEnv
  try {
    execSync(`git fetch --depth=50 origin ${process.env.GITHUB_BASE_REF || 'main'}`, { stdio: 'ignore' })
    baseManifest = execSync(`git show ${base}:${MANIFEST}`, { encoding: 'utf8' })
    baseEnv = execSync(`git show ${base}:${ENV}`, { encoding: 'utf8' })
  } catch {
    console.log(`coupling guard: base ${base} not available (not a PR?) — skipping merge-base check.`)
    return
  }
  const baseCore = coreDigest(baseManifest)
  const headCore = coreDigest(readFileSync(MANIFEST, 'utf8'))
  const baseVer = defaultVersion(baseEnv)
  const headVer = defaultVersion(readFileSync(ENV, 'utf8'))
  console.log(`coupling: core base=${baseCore.slice(0, 12)} head=${headCore.slice(0, 12)}; version base=${baseVer} head=${headVer}`)
  if (couplingViolation(baseCore, headCore, baseVer, headVer)) {
    console.error('MODEL PIN / VERSION COUPLING VIOLATION: the manifest semantic core changed but the default analyzer bundle version did NOT. Bump speechVersion in worker/src/env.ts.')
    process.exit(1)
  }
  console.log('coupling guard: OK')
}

if (process.argv.includes('--selftest')) selftest()
else main()
