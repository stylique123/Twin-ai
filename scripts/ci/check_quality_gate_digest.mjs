// CI guard: the Phase-7 Director quality gate is IMMUTABLE once frozen. Recompute
// sha256(rubric.md || thresholds.json) and assert it equals the frozen digest.
// Any change to the rubric or thresholds must be a deliberate new evaluation
// version (which updates the frozen digest here in the same commit) — never a
// silent reinterpretation after results exist.
//
//   node scripts/ci/check_quality_gate_digest.mjs            # PR guard
//   node scripts/ci/check_quality_gate_digest.mjs --selftest # offline logic check
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const RUBRIC = 'docs/phase7-director-quality-rubric.md'
const THRESHOLDS = 'scripts/director-eval/thresholds.json'
const FROZEN = 'scripts/director-eval/QUALITY_GATE_DIGEST.txt'

export function computeDigest(rubric, thresholds) {
  return createHash('sha256').update(rubric).update(thresholds).digest('hex')
}

function selftest() {
  const a = computeDigest('x', 'y')
  const b = computeDigest('x', 'y')
  const c = computeDigest('x', 'z')
  let failed = 0
  if (a !== b) { console.error('SELFTEST FAIL: deterministic'); failed++ }
  if (a === c) { console.error('SELFTEST FAIL: sensitive to content'); failed++ }
  if (failed) { console.error('quality-gate-digest selftest: FAIL'); process.exit(1) }
  console.log('quality-gate-digest selftest: all cases passed'); process.exit(0)
}

function main() {
  const rubric = readFileSync(RUBRIC)
  const thresholds = readFileSync(THRESHOLDS)
  const frozen = readFileSync(FROZEN, 'utf8').trim()
  const got = computeDigest(rubric, thresholds)
  if (got !== frozen) {
    console.error(`::error::quality-gate digest drift: ${got} != frozen ${frozen}. A rubric/threshold change requires a NEW evaluationVersion + updated frozen digest in the same commit.`)
    process.exit(1)
  }
  console.log(`quality-gate digest OK: ${got}`)
}

if (process.argv.includes('--selftest')) selftest()
else main()
