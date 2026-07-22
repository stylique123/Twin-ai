// CI guard for the Phase-7 Director quality gate.
//
// TWO layers, described HONESTLY (no overclaim):
//
//   1. CONTENT BINDING (always runs, even with no git history): the rubric +
//      thresholds hash to the frozen digest, and that digest is bound to the
//      `evaluationVersion` declared in thresholds.json (frozen as
//      "version:digest"). This ALONE does NOT enforce a version bump — a single
//      commit that changes the rubric AND the frozen line AND keeps the same
//      version would pass this layer. It only proves the label matches the
//      content in the working tree.
//
//   2. BUMP ENFORCEMENT via merge-base (runs only when the PR base is
//      resolvable in git history): compares the rubric / thresholds / frozen
//      digest against the merge-base with the base branch. If ANY of them
//      changed but `evaluationVersion` did NOT, the guard FAILS — a real
//      gate change without a new version is rejected. When the base commit is
//      not resolvable (e.g. a shallow clone with no base ref), this layer is
//      SKIPPED and the guard says so explicitly; it does not pretend the bump
//      was enforced. In that case the version-bump policy rests on human
//      review, which the content binding and the loud SKIP notice support.
//
//   node scripts/ci/check_quality_gate_digest.mjs            # PR guard
//   node scripts/ci/check_quality_gate_digest.mjs --selftest # offline logic check
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

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

// Pure bump-policy decision (unit-tested offline): a gated-content change with
// no evaluationVersion change is a violation.
export function isBumpViolation({ contentChanged, oldVersion, newVersion }) {
  return contentChanged && oldVersion === newVersion
}

function gitShow(ref, path) {
  return execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

// Best-effort resolution of the merge-base commit with the PR base branch.
// Returns a commit sha, or null when history is unavailable.
function resolveMergeBase() {
  const candidates = []
  if (process.env.GITHUB_BASE_REF) candidates.push(`origin/${process.env.GITHUB_BASE_REF}`)
  candidates.push('origin/main', 'main')
  for (const base of candidates) {
    try {
      const sha = execFileSync('git', ['merge-base', 'HEAD', base], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      if (sha) return sha
    } catch {
      // try the next candidate
    }
  }
  return null
}

function selftest() {
  let failed = 0
  const a = computeDigest('x', 'y')
  const b = computeDigest('x', 'y')
  const c = computeDigest('x', 'z')
  if (a !== b) { console.error('SELFTEST FAIL: deterministic'); failed++ }
  if (a === c) { console.error('SELFTEST FAIL: sensitive to content'); failed++ }
  try {
    const p = parseFrozen('phase7-director-quality-v1:deadbeef')
    if (p.version !== 'phase7-director-quality-v1' || p.digest !== 'deadbeef') { console.error('SELFTEST FAIL: parseFrozen'); failed++ }
  } catch { console.error('SELFTEST FAIL: parseFrozen threw'); failed++ }
  let rejected = false
  try { parseFrozen('no-colon-here') } catch { rejected = true }
  if (!rejected) { console.error('SELFTEST FAIL: malformed frozen accepted'); failed++ }
  // bump-policy truth table
  if (!isBumpViolation({ contentChanged: true, oldVersion: 'v1', newVersion: 'v1' })) { console.error('SELFTEST FAIL: change w/o bump must violate'); failed++ }
  if (isBumpViolation({ contentChanged: true, oldVersion: 'v1', newVersion: 'v2' })) { console.error('SELFTEST FAIL: change WITH bump is ok'); failed++ }
  if (isBumpViolation({ contentChanged: false, oldVersion: 'v1', newVersion: 'v1' })) { console.error('SELFTEST FAIL: no change is ok'); failed++ }
  if (failed) { console.error('quality-gate-digest selftest: FAIL'); process.exit(1) }
  console.log('quality-gate-digest selftest: all cases passed'); process.exit(0)
}

function main() {
  const rubric = readFileSync(RUBRIC)
  const thresholds = readFileSync(THRESHOLDS)
  const frozenText = readFileSync(FROZEN, 'utf8')
  const { version: frozenVersion, digest: frozenDigest } = parseFrozen(frozenText)
  const declaredVersion = JSON.parse(thresholds.toString('utf8')).evaluationVersion
  const got = computeDigest(rubric, thresholds)

  // Layer 1 — content binding.
  if (declaredVersion !== frozenVersion) {
    console.error(`::error::quality-gate evaluationVersion drift: thresholds.json declares "${declaredVersion}" but the frozen digest is bound to "${frozenVersion}".`)
    process.exit(1)
  }
  if (got !== frozenDigest) {
    console.error(`::error::quality-gate digest drift for "${declaredVersion}": ${got} != frozen ${frozenDigest}. Update the frozen line to "${declaredVersion}:${got}" and bump evaluationVersion.`)
    process.exit(1)
  }
  console.log(`quality-gate content binding OK: ${declaredVersion}:${got}`)

  // Layer 2 — bump enforcement via merge-base (best-effort).
  const base = resolveMergeBase()
  if (!base) {
    console.log('quality-gate bump-enforcement SKIPPED: PR base not resolvable in git history (shallow clone?). Content binding passed; the evaluationVersion-bump policy rests on human review for this run.')
    return
  }
  let oldRubric, oldThresholds, oldFrozen
  try {
    oldRubric = gitShow(base, RUBRIC)
    oldThresholds = gitShow(base, THRESHOLDS)
    oldFrozen = gitShow(base, FROZEN)
  } catch {
    console.log(`quality-gate bump-enforcement SKIPPED: gate files absent at merge-base ${base.slice(0, 12)} (first introduction). Content binding passed.`)
    return
  }
  const contentChanged = oldRubric !== rubric.toString('utf8') || oldThresholds !== thresholds.toString('utf8') || oldFrozen !== frozenText
  let oldVersion
  try { oldVersion = JSON.parse(oldThresholds).evaluationVersion } catch { oldVersion = null }
  if (isBumpViolation({ contentChanged, oldVersion, newVersion: declaredVersion })) {
    console.error(`::error::quality-gate change WITHOUT an evaluationVersion bump: rubric/thresholds/digest differ from merge-base ${base.slice(0, 12)} but evaluationVersion is still "${declaredVersion}". A gate change requires a NEW evaluationVersion + full rerun.`)
    process.exit(1)
  }
  if (contentChanged) {
    console.log(`quality-gate bump-enforcement OK: gate changed from "${oldVersion}" -> "${declaredVersion}" (new version) vs merge-base ${base.slice(0, 12)}.`)
  } else {
    console.log(`quality-gate bump-enforcement OK: gate unchanged vs merge-base ${base.slice(0, 12)}.`)
  }
}

if (process.argv.includes('--selftest')) selftest()
else main()
