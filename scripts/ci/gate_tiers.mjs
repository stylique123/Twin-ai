// WHICH GATE A CHANGE ACTUALLY NEEDS, AND WHY IT IS ALLOWED TO BE CHEAPER.
//
// Every code PR currently costs a full 85-95 minute staging matrix, because the
// gate knows exactly two things: "documentation" and "everything else". Seven
// queued PRs is therefore about eleven hours of mostly duplicated waiting.
//
// ⚖️ THIS IS AN OPTIMISATION OF DUPLICATED VERIFICATION, NOT A REDUCTION IN
// EVIDENCE. Nothing here lets a change ship with less proof than it needs; it
// lets a change stop paying for proof that cannot possibly apply to it. A web
// component cannot be falsified by a renderer matrix, and running one anyway is
// not rigour, it is a queue.
//
// ⚠️ EVERY RULE BELOW FAILS CLOSED AND ESCALATES UPWARD, NEVER DOWNWARD.
// Anything unrecognised is FULL. Any file that pulls a change up wins over
// every file that would leave it cheap. A tie does not exist: the highest tier
// any single file demands is the tier the whole PR gets.
//
// ⚠️ AND THE TRAP THAT MADE THIS DANGEROUS, RECORDED BEFORE IT WAS WRITTEN:
// a naive `scripts/ci/**` exemption would have exempted
// generate_shared_pilot_core.mjs — which GENERATES CODE THAT SHIPS INTO EDGE
// FUNCTIONS — and staging_matrix_gate.mjs itself, letting the gate grade its
// own rewrite cheaply. So scripts/ci is FULL, wholesale, with no allowlist to
// drift.

/** Ordered cheapest to most expensive. The order IS the escalation rule. */
export const TIERS = Object.freeze(['DOC', 'STATIC', 'DB_EDGE_AUTH', 'WORKER_MEDIA', 'FULL'])

export const TIER_RANK = Object.freeze(Object.fromEntries(TIERS.map((t, i) => [t, i])))

/** Does this tier still require the full staging matrix? Only FULL does. */
export const REQUIRES_MATRIX = Object.freeze({
  DOC: false, STATIC: false, DB_EDGE_AUTH: true, WORKER_MEDIA: true, FULL: true,
})

/**
 * ⚠️ DB_EDGE_AUTH AND WORKER_MEDIA STILL RUN THE MATRIX TODAY.
 *
 * The routing names four destinations, but only two of them are cheap on this
 * pass. Splitting the matrix into targeted integration subsets is a second
 * piece of work with its own falsifiable claim; pretending those tiers are
 * already cheap would be the exact "reduction in evidence" this must not be.
 * They are named now so the classifier records the RIGHT answer, and the
 * cheapening follows once the subsets exist.
 */
export const CHEAP_TIERS = Object.freeze(['DOC', 'STATIC'])

const startsWithAny = (f, prefixes) => prefixes.some((p) => f.startsWith(p))

/**
 * FULL, and the reasons are the owner's activation conditions 2-6 verbatim.
 *
 * ⚠️ scripts/ci IS HERE WHOLESALE, DELIBERATELY. It contains the generator that
 * writes edge-function code and the gate that would be grading itself.
 * ⚠️ THE ROOT LOCKFILE IS HERE TOO. In a workspace repo it carries EVERY
 * workspace's resolutions, so a change to it can move the worker's dependency
 * tree even when the PR only meant to touch the web app. "It was only a web
 * dependency" is a claim about intent, not about the file.
 */
const FULL_PREFIXES = Object.freeze([
  '.github/workflows/',            // gate + deploy implementation
  'scripts/ci/',                   // generators, guards, and this gate itself
  'scripts/staging-integration/',  // the harness that IS the matrix
  'worker/',                       // worker + media execution path
  'supabase/migrations/',          // schema — never static merely for being SQL
])

const FULL_EXACT = Object.freeze([
  'package-lock.json',
  'package.json',
  'Dockerfile',
  '.github/dependabot.yml',
])

/** Server-side request handling: real integration proof, never cheap. */
const DB_EDGE_PREFIXES = Object.freeze(['supabase/functions/'])

/**
 * Genuinely static: type-checked, unit-tested, and incapable of changing what
 * the worker or the renderer does at runtime.
 *
 * ⚠️ supabase/verify IS NOT supabase/migrations. Those files are pasted into a
 * SQL editor by a human and applied by nothing; they alter no schema on their
 * own. The distinction is explicit here and tested, because "it is SQL" is
 * exactly the reasoning condition 6 forbids.
 */
const STATIC_PREFIXES = Object.freeze([
  'packages/shared/src/',
  'apps/web/src/',
  'apps/web/public/',
  'supabase/verify/',
])

const DOC_EXACT = Object.freeze(['LICENSE'])
const DOC_PREFIXES = Object.freeze(['docs/', '.github/ISSUE_TEMPLATE/', '.github/PULL_REQUEST_TEMPLATE'])

/**
 * The tier ONE file demands.
 *
 * ⚠️ THE ORDER OF THESE TESTS IS THE SAFETY PROPERTY. FULL is asked first, so a
 * file that matches both an escalating prefix and a cheap one escalates. A
 * selftest pins that: scripts/ci/foo.mjs must never be read as a script.
 */
export function tierForFile(file) {
  const f = String(file ?? '').trim()
  if (!f) return 'FULL'
  if (FULL_EXACT.includes(f) || startsWithAny(f, FULL_PREFIXES)) return 'FULL'
  if (startsWithAny(f, DB_EDGE_PREFIXES)) return 'DB_EDGE_AUTH'
  if (DOC_EXACT.includes(f) || startsWithAny(f, DOC_PREFIXES) || f.endsWith('.md')) return 'DOC'
  if (startsWithAny(f, STATIC_PREFIXES)) {
    // ⚠️ A TEST FILE IS STILL STATIC, but a shared file that the worker imports
    // is not something this path can rule on — the worker prefix already
    // escalated anything under worker/, and shared code reaches the worker only
    // through the generated copies, which live under supabase/functions or are
    // produced by scripts/ci. Both of those escalate above.
    return 'STATIC'
  }
  // ⚠️ UNRECOGNISED IS FULL. Condition 2, and the reason a new top-level
  // directory cannot quietly arrive in a cheap tier.
  return 'FULL'
}

/**
 * The tier a whole change set demands: the HIGHEST any single file demands.
 *
 * ⚠️ THROWS ON AN EMPTY LIST, exactly as the existing gate does. Resolving zero
 * changed files is an API problem or an empty PR, and neither is evidence of
 * safety.
 */
export function tierForFiles(files) {
  const list = (Array.isArray(files) ? files : []).map((f) => String(f).trim()).filter(Boolean)
  if (list.length === 0) {
    throw new Error('Resolved zero changed files. That is an API problem or an empty PR; neither is evidence of safety. Failing closed.')
  }
  let tier = 'DOC'
  let reason = ''
  for (const f of list) {
    const t = tierForFile(f)
    if (TIER_RANK[t] > TIER_RANK[tier]) { tier = t; reason = f }
  }
  const matrix = REQUIRES_MATRIX[tier]
  return {
    tier,
    matrixRequired: matrix,
    // The file that set the tier is named, so a surprising verdict is
    // immediately explicable rather than something to go and re-derive.
    decidedBy: reason || list[0],
    fileCount: list.length,
    reason: matrix
      ? `${tier}: ${reason || list[0]} can alter runtime behaviour. A successful staging matrix on this exact head is REQUIRED.`
      : `${tier}: all ${list.length} changed files are ${tier === 'DOC' ? 'documentation' : 'static (typechecked, unit-tested, no worker or renderer reach)'}. The editor matrix cannot falsify this change.`,
  }
}

/**
 * ⚠️ MANDATORY IN EVERY TIER, INCLUDING THE CHEAPEST. Condition 9. A cheap tier
 * is a claim that the MATRIX cannot falsify the change — never a claim that
 * nothing needs to.
 */
export const ALWAYS_REQUIRED_CHECKS = Object.freeze([
  'typecheck', 'unit-tests', 'static guards', 'generated-copy parity',
])
