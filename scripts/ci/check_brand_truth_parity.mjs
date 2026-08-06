// THE EDGE COPY OF `brandTruth.ts` MUST BE THE SHARED ONE.
//
// C3 on the open-items ledger — "the readers exist and the writer does not" —
// is closed by an edge function that PROJECTS brand truth server-side. It has
// to project server-side rather than accept a projection: 0095 grants
// `brand_truth_snapshots` to service_role alone and says why, in as many words
// — "a client that could insert one could assert its own brand truth, which is
// authority level 1."
//
// So the projection logic has to exist inside `supabase/functions/`, because
// the edge bundler resolves imports from the function directory and a relative
// path out to `packages/shared` does not deploy. This tree already solves that
// twice — `_shared/dna.ts`, `_shared/outputLinks.ts` — and the worker solves it
// a third way, by hand-retyping the projection with a parity test
// (`worker/src/jobs/brandSnapshot.ts`).
//
// ── WHY THIS GUARD, RATHER THAN "REMEMBER TO UPDATE BOTH" ─────────────────
//
// The hand-retyped mirrors are correct today because someone checked. This one
// cannot be checked by reading, because the two files are 595 lines of
// provenance rules, authority levels and absence reasons — and a single changed
// confidence constant would produce a DIFFERENT DIGEST for the same brand.
//
// That is the failure worth naming. `brand_truth_snapshots` has a unique index
// on `(owner_id, snapshot_sha256)` so an unchanged brand reuses its row. If the
// two copies drift, the same brand hashes two ways, the reuse silently stops,
// and every plan that pins a digest starts pinning whichever copy produced it.
// Nothing errors. The lineage just quietly stops meaning one thing.
//
// `brandTruth.ts` imports NOTHING and touches no runtime API — it returns a
// canonical string and leaves hashing to its caller — so unlike the retyped
// mirrors, this copy can be EXACT, and exactness is checkable by a machine.
//
//   node scripts/ci/check_brand_truth_parity.mjs            # live
//   node scripts/ci/check_brand_truth_parity.mjs --selftest # fixtures
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')
const SOURCE = join(REPO, 'packages', 'shared', 'src', 'brandTruth.ts')
const COPY = join(REPO, 'supabase', 'functions', '_shared', 'brandTruth.ts')

/** The banner ends at the first blank line following the last banner comment. */
export const BANNER_MARK = '// GENERATED — DO NOT EDIT.'

/**
 * The copy minus its generated banner.
 *
 * Only a leading run of `//` comment lines is stripped, and only when the file
 * actually opens with the banner mark. A copy that has grown real code above
 * the banner is NOT quietly forgiven — it fails, which is the point.
 */
export function stripBanner(text) {
  if (!text.startsWith(BANNER_MARK)) return { body: text, hadBanner: false }
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length && lines[i].startsWith('//')) i++
  // Exactly one blank line separates the banner from the copied source.
  if (lines[i] === '') i++
  return { body: lines.slice(i).join('\n'), hadBanner: true }
}

export function compare(sourceText, copyText) {
  const problems = []
  const { body, hadBanner } = stripBanner(copyText)
  if (!hadBanner) {
    problems.push(
      'the edge copy does not start with the generated banner — it must say it is generated, '
      + 'or the next person will edit it and the two projections will drift apart silently')
  }
  if (body !== sourceText) {
    problems.push(
      'supabase/functions/_shared/brandTruth.ts has drifted from packages/shared/src/brandTruth.ts. '
      + 'The same brand would hash two ways, so `brand_truth_snapshots` stops reusing its row and '
      + 'every plan pins whichever copy produced its digest. Nothing errors; the lineage just stops '
      + 'meaning one thing. Re-copy it:\n'
      + '    cp packages/shared/src/brandTruth.ts /tmp/bt.ts && \\\n'
      + '      (sed -n "1,/^$/p" supabase/functions/_shared/brandTruth.ts; cat /tmp/bt.ts) \\\n'
      + '      > supabase/functions/_shared/brandTruth.ts')
  }
  return problems
}

function selftest() {
  const src = 'export const A = 1\n'
  const banner = `${BANNER_MARK}\n// more banner\n\n`
  const cases = [
    ['an exact copy under a banner passes', src, banner + src, 0],
    ['a drifted copy FAILS', src, `${banner}export const A = 2\n`, 1],
    ['a copy with no banner FAILS even when identical', src, src, 1],
    ['a copy with neither banner nor parity reports BOTH', src, 'export const A = 2\n', 2],
    ['a one-character change is caught', 'export const N = 1000\n', `${banner}export const N = 100\n`, 1],
  ]
  let failed = 0
  for (const [name, a, b, expected] of cases) {
    const got = compare(a, b).length
    if (got !== expected) { console.error(`SELFTEST FAIL: ${name} => ${got}, expected ${expected}`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  // The banner stripper must not eat real code that merely begins with a comment.
  const { body } = stripBanner(`${BANNER_MARK}\n\n// a real leading comment\nexport const A = 1\n`)
  if (body !== '// a real leading comment\nexport const A = 1\n') {
    console.error('SELFTEST FAIL: stripBanner ate a legitimate leading comment'); failed++
  } else console.log('  ok: stripBanner keeps a legitimate leading comment')

  if (failed) { console.error(`brand-truth-parity selftest: ${failed} failed`); process.exit(1) }
  console.log('brand-truth-parity selftest: all cases passed'); process.exit(0)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (process.argv.includes('--selftest')) selftest()
  else {
    const problems = compare(readFileSync(SOURCE, 'utf8'), readFileSync(COPY, 'utf8'))
    if (problems.length) { for (const p of problems) console.error(`::error::${p}`); process.exit(1) }
    console.log('brand-truth-parity guard: OK (the edge copy is the shared projection, exactly)')
  }
}
