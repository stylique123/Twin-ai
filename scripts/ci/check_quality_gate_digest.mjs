// CI guard for the Phase-7 Director quality gate — an HONEST, review-visible
// DRIFT GUARD, not a cryptographic immutability proof.
//
// What it CAN enforce (in one commit's view):
//   * The combined content of the rubric + thresholds hashes to the frozen
//     digest, AND that digest is bound to the declared `evaluationVersion` in
//     thresholds.json. So editing the sample table, procedure, or thresholds
//     WITHOUT (a) bumping `evaluationVersion` and (b) updating the frozen
//     `version:digest` line here fails CI. A silent reinterpretation of the
//     gate after results exist cannot slip through review unnoticed.
//
// What it CANNOT do (stated plainly, no overclaim):
//   * It does NOT make the gate immutable. A single deliberate commit can
//     change the rubric AND bump the version AND update the frozen line here,
//     and this guard will pass. That is by design: the guard makes such a
//     change EXPLICIT and REVIEWABLE (a diff to this file + a new version),
//     it does not forbid it. Policy — "a new evaluationVersion means a FULL
//     rerun, never a reinterpretation of existing results" — is enforced by
//     human review, which this guard exists to make possible.
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

// The frozen file binds the content digest to the evaluationVersion it was
// computed for: a single line `evaluationVersion:sha256hex`.
export function parseFrozen(text) {
  const line = text.trim()
  const idx = line.indexOf(':')
  if (idx <= 0 || idx === line.length - 1) {
    throw new Error(`malformed frozen digest line (expected "version:digest"): ${line}`)
  }
  return { version: line.slice(0, idx), digest: line.slice(idx + 1) }
}

function selftest() {
  const a = computeDigest('x', 'y')
  const b = computeDigest('x', 'y')
  const c = computeDigest('x', 'z')
  let failed = 0
  if (a !== b) { console.error('SELFTEST FAIL: deterministic'); failed++ }
  if (a === c) { console.error('SELFTEST FAIL: sensitive to content'); failed++ }
  try {
    const p = parseFrozen('phase7-director-quality-v1:deadbeef')
    if (p.version !== 'phase7-director-quality-v1' || p.digest !== 'deadbeef') {
      console.error('SELFTEST FAIL: parseFrozen'); failed++
    }
  } catch { console.error('SELFTEST FAIL: parseFrozen threw'); failed++ }
  let rejected = false
  try { parseFrozen('no-colon-here') } catch { rejected = true }
  if (!rejected) { console.error('SELFTEST FAIL: malformed frozen accepted'); failed++ }
  if (failed) { console.error('quality-gate-digest selftest: FAIL'); process.exit(1) }
  console.log('quality-gate-digest selftest: all cases passed'); process.exit(0)
}

function main() {
  const rubric = readFileSync(RUBRIC)
  const thresholds = readFileSync(THRESHOLDS)
  const { version: frozenVersion, digest: frozenDigest } = parseFrozen(readFileSync(FROZEN, 'utf8'))
  const declaredVersion = JSON.parse(thresholds.toString('utf8')).evaluationVersion
  const got = computeDigest(rubric, thresholds)

  if (declaredVersion !== frozenVersion) {
    console.error(`::error::quality-gate evaluationVersion drift: thresholds.json declares "${declaredVersion}" but the frozen digest is bound to "${frozenVersion}". A gate change must bump evaluationVersion AND update ${FROZEN} in the same commit (a deliberate, reviewable change — never a silent reinterpretation).`)
    process.exit(1)
  }
  if (got !== frozenDigest) {
    console.error(`::error::quality-gate digest drift for "${declaredVersion}": ${got} != frozen ${frozenDigest}. Editing the rubric/thresholds requires a NEW evaluationVersion + updated frozen line "${declaredVersion}:${got}" — this guard makes the change explicit and reviewable, it does not authorize it.`)
    process.exit(1)
  }
  console.log(`quality-gate digest OK: ${declaredVersion}:${got} (review-visible drift guard)`)
}

if (process.argv.includes('--selftest')) selftest()
else main()
