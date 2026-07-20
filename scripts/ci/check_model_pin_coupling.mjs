// CI guard (P2): the model pin and the analyzer bundle version are COUPLED.
// If the semantic manifest core (repository, revision, required-file digests)
// changes versus the merge base, the DEFAULT analyzer bundle version in
// worker/src/env.ts MUST also change. A model-pin change with an unchanged
// version is a silent immutability break and FAILS CI.
//
// On a pull request this NEVER silently skips: it explicitly handles the
// "base introduces neither, head introduces both" case (this Phase-5 PR — main
// has no manifest yet), and it FAILS CLOSED if the base ref can't be fetched or
// the head manifest/version can't be parsed.
//
//   node scripts/ci/check_model_pin_coupling.mjs            # PR guard
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
  const m = JSON.parse(manifestText)   // throws on malformed → caller treats as null
  return createHash('sha256').update(canonicalize({ repository: m.repository, revision: m.revision, files: m.files })).digest('hex')
}
function defaultVersion(envText) {
  const m = envText.match(/speechVersion:\s*\(process\.env\.EDITOR_SPEECH_VERSION\s*\?\?\s*'([^']+)'/)
  return m ? m[1] : null
}

// PURE decision, unit-tested. `state` fields:
//   isPR, baseFetchOk, baseHasManifest, baseCore, baseVer, headCore, headVer
// Returns { ok, reason }.
export function evaluate(s) {
  if (!s.isPR) return { ok: true, reason: 'not a PR — merge-base coupling rule enforced on PRs' }
  if (!s.baseFetchOk) return { ok: false, reason: 'base ref not fetchable — fail closed' }
  if (!s.headCore) return { ok: false, reason: 'head manifest missing/malformed — fail closed' }
  if (!s.headVer) return { ok: false, reason: 'head default analyzer version missing — fail closed' }
  const baseCore = s.baseHasManifest ? s.baseCore : null
  if (baseCore === null) return { ok: true, reason: 'introduction: base has no manifest; head introduces manifest + version' }
  if (baseCore !== s.headCore && s.baseVer === s.headVer) {
    return { ok: false, reason: 'manifest core changed but default analyzer version did NOT (bump speechVersion)' }
  }
  return { ok: true, reason: 'core/version consistent' }
}

function selftest() {
  const A = 'coreA', B = 'coreB'
  const cases = [
    // name, state, expectedOk
    ['first introduction (base absent, head present)',
      { isPR: true, baseFetchOk: true, baseHasManifest: false, baseCore: null, baseVer: null, headCore: A, headVer: 'speech-6' }, true],
    ['future core + version bump',
      { isPR: true, baseFetchOk: true, baseHasManifest: true, baseCore: A, baseVer: 'speech-6', headCore: B, headVer: 'speech-7' }, true],
    ['core change WITHOUT version bump → violation',
      { isPR: true, baseFetchOk: true, baseHasManifest: true, baseCore: A, baseVer: 'speech-6', headCore: B, headVer: 'speech-6' }, false],
    ['version-only bump (cache bump, no core change)',
      { isPR: true, baseFetchOk: true, baseHasManifest: true, baseCore: A, baseVer: 'speech-6', headCore: A, headVer: 'speech-7' }, true],
    ['unfetchable merge base → fail closed',
      { isPR: true, baseFetchOk: false, baseHasManifest: false, baseCore: null, baseVer: null, headCore: A, headVer: 'speech-6' }, false],
    ['malformed head manifest → fail closed',
      { isPR: true, baseFetchOk: true, baseHasManifest: false, baseCore: null, baseVer: null, headCore: null, headVer: 'speech-6' }, false],
    ['missing head default version → fail closed',
      { isPR: true, baseFetchOk: true, baseHasManifest: false, baseCore: null, baseVer: null, headCore: A, headVer: null }, false],
    ['not a PR → skip allowed',
      { isPR: false }, true],
  ]
  let failed = 0
  for (const [name, state, exp] of cases) {
    const got = evaluate(state).ok
    if (got !== exp) { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${exp}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) { console.error(`coupling selftest: ${failed} failed`); process.exit(1) }
  console.log('coupling selftest: all cases passed'); process.exit(0)
}

function gitOk(cmd) { try { execSync(cmd, { stdio: 'ignore' }); return true } catch { return false } }
function gitShow(ref, path) { return execSync(`git show ${ref}:${path}`, { encoding: 'utf8' }) }

function main() {
  const isPR = process.env.GITHUB_EVENT_NAME === 'pull_request' || !!process.env.GITHUB_BASE_REF
  // Head state (always required to be valid on a PR).
  let headCore = null, headVer = null
  try { headCore = coreDigest(readFileSync(MANIFEST, 'utf8')) } catch { headCore = null }
  try { headVer = defaultVersion(readFileSync(ENV, 'utf8')) } catch { headVer = null }

  const state = { isPR, headCore, headVer, baseFetchOk: true, baseHasManifest: false, baseCore: null, baseVer: null }

  if (isPR) {
    const baseRef = process.env.GITHUB_BASE_REF || 'main'
    const fetched = gitOk(`git fetch --depth=50 origin ${baseRef}`)
    const resolved = fetched && gitOk(`git rev-parse --verify origin/${baseRef}`)
    state.baseFetchOk = resolved
    if (resolved) {
      // Distinguish "file absent at base" (introduction) from unreadable.
      state.baseHasManifest = gitOk(`git cat-file -e origin/${baseRef}:${MANIFEST}`)
      if (state.baseHasManifest) {
        try { state.baseCore = coreDigest(gitShow(`origin/${baseRef}`, MANIFEST)) } catch { state.baseCore = null; state.baseHasManifest = false }
      }
      try { state.baseVer = defaultVersion(gitShow(`origin/${baseRef}`, ENV)) } catch { state.baseVer = null }
    }
  }

  // Prove the actual base/head state used (item 1.6).
  console.log('coupling guard state: ' + JSON.stringify({
    isPR: state.isPR, baseFetchOk: state.baseFetchOk, baseHasManifest: state.baseHasManifest,
    baseCore: state.baseCore ? state.baseCore.slice(0, 12) : 'ABSENT',
    headCore: state.headCore ? state.headCore.slice(0, 12) : 'ABSENT/MALFORMED',
    baseVer: state.baseVer || 'ABSENT', headVer: state.headVer || 'ABSENT',
  }))

  const { ok, reason } = evaluate(state)
  console.log(`coupling guard: ${ok ? 'OK' : 'FAIL'} — ${reason}`)
  if (!ok) process.exit(1)
}

if (process.argv.includes('--selftest')) selftest()
else main()
