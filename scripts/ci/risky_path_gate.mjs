// risky-path-gate: a path-filtered merge gate that is NEVER pending.
//
// A PR that touches a risky path (migrations, edge functions, worker, workflows,
// auth/billing code) may merge only when a `staging-integration` run concluded
// `success` at the PR's exact head SHA. Anything else is a FAILURE with a
// message saying how to fix it -- never a pending/expected state.
// A PR touching no risky path passes immediately.
//
//   node scripts/ci/risky_path_gate.mjs --selftest
//   node scripts/ci/risky_path_gate.mjs --files changed.txt [--runs runs.json]
//     prints JSON {conclusion, title, summary, risky:[...]} and exits 0 on
//     success, 1 on failure. Without --runs, a risky diff is judged against an
//     empty run list (i.e. fails).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const RISKY_PATTERNS = Object.freeze([
  /^supabase\/migrations\//,
  /^supabase\/functions\//, // covers billing*, billing-webhook, referral
  /^worker\//,
  /^\.github\/workflows\//,
  /^apps\/web\/src\/(?:.*\/)?[^/]*auth[^/]*$/i, // auth files anywhere under web src
  /^apps\/web\/src\/(?:.*\/)?auth[^/]*\//i, // auth* directories
  /^apps\/web\/src\/(?:.*\/)?[^/]*(?:billing|referral)[^/]*$/i,
])

export function isRisky(path) {
  const p = String(path).trim().replace(/^\.\//, '')
  return p !== '' && RISKY_PATTERNS.some((re) => re.test(p))
}

export function riskyFiles(files) {
  return files.map((f) => String(f).trim()).filter(Boolean).filter(isRisky)
}

export const HOW_TO =
  'Run staging-integration on this head: Actions -> staging-integration -> "Run workflow", ' +
  'choose this PR\'s branch (the ci-bootstrap credential gate only answers on main and ' +
  'rebuild/editor-v2-* refs, so the branch must be one of those), or push to a ' +
  'rebuild/editor-v2-* branch. When it succeeds, this gate re-evaluates automatically ' +
  '(workflow_run); or run the risky-path-gate workflow by hand with the PR number.'

/** Decision table. files: string[]; runs: Actions API workflow-runs objects (or null). */
export function decide({ files, runs, headSha }) {
  if (!Array.isArray(files)) {
    return { conclusion: 'failure', title: 'Could not enumerate changed files', summary: 'Failing closed: unknown diff.', risky: [] }
  }
  const risky = riskyFiles(files)
  if (risky.length === 0) {
    return { conclusion: 'success', title: 'Not risky', summary: `No risky paths among ${files.length} changed file(s).`, risky }
  }
  const list = (Array.isArray(runs) ? runs : []).filter(
    (r) => r && (!headSha || r.head_sha === headSha),
  )
  const ok = list.find((r) => r.status === 'completed' && r.conclusion === 'success')
  const head = `${risky.length} risky file(s): ${risky.slice(0, 20).join(', ')}${risky.length > 20 ? ', ...' : ''}`
  if (ok) {
    return { conclusion: 'success', title: 'Risky, staging-integration passed at this head', summary: `${head}\nEvidence: ${ok.html_url || ok.id}`, risky }
  }
  const inflight = list.some((r) => r.status !== 'completed')
  const why = list.length === 0
    ? 'No staging-integration run exists at this head.'
    : inflight
      ? 'A staging-integration run at this head is still in progress (gate re-evaluates when it completes).'
      : `staging-integration at this head concluded: ${[...new Set(list.map((r) => r.conclusion))].join(', ')}.`
  return { conclusion: 'failure', title: 'Risky paths need staging-integration at this head', summary: `${head}\n${why}\n${HOW_TO}`, risky }
}

function selftest() {
  let n = 0
  const eq = (a, b, m) => { n++; if (a !== b) { console.error(`FAIL: ${m}: got ${a}, want ${b}`); process.exit(1) } }
  const cls = {
    'supabase/migrations/20260101_x.sql': true,
    'supabase/functions/billing-webhook/index.ts': true,
    'supabase/functions/referral/index.ts': true,
    'supabase/functions/billing/index.ts': true,
    'worker/src/main.ts': true,
    '.github/workflows/pr-checks.yml': true,
    'apps/web/src/contexts/AuthContext.tsx': true,
    'apps/web/src/lib/authRouting.ts': true,
    'apps/web/src/pages/Auth.tsx': true,
    'apps/web/src/auth/x.ts': true,
    'apps/web/src/pages/Billing.tsx': true,
    'docs/README.md': false,
    'scripts/ci/risky_path_gate.mjs': false,
    'apps/web/src/components/Button.tsx': false,
    'packages/shared/src/index.ts': false,
    'supabase/config.toml': false,
    'workers.md': false,
    '': false,
  }
  for (const [p, want] of Object.entries(cls)) eq(isRisky(p), want, `isRisky(${p})`)
  const S = 'a'.repeat(40)
  const T = 'b'.repeat(40)
  const ok = { head_sha: S, status: 'completed', conclusion: 'success', id: 1 }
  const bad = { head_sha: S, status: 'completed', conclusion: 'failure', id: 2 }
  const run = { head_sha: S, status: 'in_progress', conclusion: null, id: 3 }
  const other = { head_sha: T, status: 'completed', conclusion: 'success', id: 4 }
  const R = ['worker/a.ts']
  const table = [
    [{ files: ['docs/a.md'], runs: [] }, 'success', 'not risky'],
    [{ files: [], runs: null }, 'success', 'empty diff'],
    [{ files: null, runs: [ok] }, 'failure', 'unknown diff fails closed'],
    [{ files: R, runs: [] }, 'failure', 'risky, no run'],
    [{ files: R, runs: null }, 'failure', 'risky, runs unknown'],
    [{ files: R, runs: [bad] }, 'failure', 'risky, failed run'],
    [{ files: R, runs: [run] }, 'failure', 'risky, in progress is red not pending'],
    [{ files: R, runs: [bad, ok] }, 'success', 'risky, any success at head'],
    [{ files: R, runs: [other] }, 'failure', 'success on another SHA does not count'],
  ]
  for (const [inp, want, m] of table) {
    const d = decide({ ...inp, headSha: S })
    eq(d.conclusion, want, m)
    eq(['success', 'failure'].includes(d.conclusion), true, `${m}: never pending`)
  }
  eq(decide({ files: R, runs: [], headSha: S }).summary.includes('Run staging-integration on this head'), true, 'how-to message')
  console.log(`risky_path_gate selftest: ${n} assertions OK`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2)
  if (args.includes('--selftest')) { selftest(); process.exit(0) }
  const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
  let files = null
  try { files = readFileSync(arg('--files'), 'utf8').split('\n') } catch { files = null }
  let runs = null
  if (arg('--runs')) {
    try { const j = JSON.parse(readFileSync(arg('--runs'), 'utf8')); runs = Array.isArray(j.workflow_runs) ? j.workflow_runs : null } catch { runs = null }
  }
  const d = decide({ files, runs, headSha: arg('--head') })
  console.log(JSON.stringify(d))
  process.exit(d.conclusion === 'success' ? 0 : 1)
}
