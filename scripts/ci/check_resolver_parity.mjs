// THE EDGE COPIES OF THE SUBSTANCE RULES MUST BE THE SHARED ONES.
//
// ⚠️ THESE RULES DECIDE WHETHER A BEAT IS GROUNDED. `generate-blueprint` used to
// carry FIVE hand-inlined copies of them, each with its own ad-hoc parity test,
// and the cost of that arrangement is measured rather than theoretical: a stale
// copy of the first-person detector saw 2 history beats where `claimStrength`
// saw 22 — the check its own comment calls "THE MOST EXPENSIVE ERROR" running at
// a tenth of its sensitivity, for months, with a passing test suite.
//
// ⚖️ SO THERE IS ONE COPY PER MODULE AND ONE GUARD OVER BOTH. Drift here is
// silent: nothing errors, the prompt is simply graded by different rules than
// the ones every test in `packages/shared` proves.
//
// ── THE ALLOWED DIFFERENCES ───────────────────────────────────────────────
//
// `claimStrength` imports nothing: byte-for-byte below its marker.
// `knowledgeResolver` imports five modules — two resolve in `_shared`, three are
// type-only and inlined above its marker. Below the marker, character for
// character.
// `writerInput` is compared between TWO markers rather than to end of file,
// because its tail — `WriterInput`, `audienceRules`, `buildWriterInput` — is
// built on `StyleProfile`, which `generate-blueprint` cannot produce and does
// not need. The edge takes the slot machinery and stops. A region with an END
// is the honest way to say "this much is shared and the rest is not"; the
// alternative was an edge copy carrying types it never reads, which is how a
// copy starts drifting in the first place.
//
//   node scripts/ci/check_resolver_parity.mjs
//   node scripts/ci/check_resolver_parity.mjs --selftest
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')

const PAIRS = [
  {
    name: 'claimStrength',
    source: join(REPO, 'packages', 'shared', 'src', 'claimStrength.ts'),
    copy: join(REPO, 'supabase', 'functions', '_shared', 'claimStrength.ts'),
    marker: 'export const CLAIM_STRENGTHS = [',
  },
  {
    name: 'knowledgeResolver',
    source: join(REPO, 'packages', 'shared', 'src', 'knowledgeResolver.ts'),
    copy: join(REPO, 'supabase', 'functions', '_shared', 'knowledgeResolver.ts'),
    marker: 'export const EVIDENCE_LEVELS = [',
  },
  {
    name: 'writerInput',
    source: join(REPO, 'packages', 'shared', 'src', 'writerInput.ts'),
    copy: join(REPO, 'supabase', 'functions', '_shared', 'writerInput.ts'),
    marker: 'export const CONTENT_CLASSES = [',
    endMarker: 'export interface WriterAudience {',
  },
]

export function comparable(text, marker, endMarker) {
  const i = text.indexOf(marker)
  if (i < 0) return null
  if (!endMarker) return text.slice(i)
  // ⚠️ AN END MARKER THAT IS MISSING IS NOT AN END OF FILE. Silently comparing
  // to EOF when the region's closing marker was renamed would pass a truncated
  // copy while reporting success. Absent end marker, absent comparison.
  const j = text.indexOf(endMarker, i)
  return j < 0 ? null : text.slice(i, j)
}

/**
 * ⚖️ THE END MARKER BOUNDS THE SOURCE, NOT THE COPY. The copy IS the region and
 * stops there — it has no tail to exclude, and demanding it carry the closing
 * declaration would mean carrying the very types the region exists to leave
 * behind. So the copy is compared from its marker to end of file, which also
 * means anything appended to it fails: the copy may be the region and nothing
 * else.
 */
export function check(sourceText, copyText, marker, endMarker) {
  const want = comparable(sourceText, marker, endMarker)
  if (want === null) return 'the SHARED file has lost its marker — cannot compare'
  const got = comparable(copyText, marker)
  if (got === null) return 'the edge copy has lost its marker — cannot compare'
  if (got === want) return null
  const a = want.split('\n'), b = got.split('\n')
  for (let k = 0; k < Math.max(a.length, b.length); k++) {
    if (a[k] !== b[k]) {
      return `line ${k + 1} differs:\n  shared: ${a[k] ?? '(missing)'}\n  edge:   ${b[k] ?? '(missing)'}`
    }
  }
  return 'copies differ'
}

if (process.argv.includes('--selftest')) {
  const M = 'export const X = ['
  const src = `${M}\n  'a',\n] as const\n`
  const good = `// DERIVED\nimport y from './y.ts'\ntype Z = string\n\n${M}\n  'a',\n] as const\n`
  // ⚠️ THE DRIFT THAT ACTUALLY HAPPENED ONCE: a detector quietly narrowed.
  const drifted = good.replace("'a',", "'a', 'b',")
  let failed = 0
  for (const [name, source, copy, expectFail] of [
    ['an identical copy passes', src, good, false],
    ['a widened rule FAILS', src, drifted, true],
    ['a copy with no marker FAILS', src, 'export const Q = 1\n', true],
    ['a SOURCE with no marker FAILS', 'export const Q = 1\n', good, true],
  ]) {
    const got = check(source, copy, M) !== null
    if (got !== expectFail) { console.error(`selftest: ${name} — wrong`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  // ⚠️ THE REGION FORM, WHICH IS THE ONE THAT CAN FAIL QUIETLY. A copy that
  // matches inside the region must pass even though the two files diverge
  // completely after it — and a missing END marker must FAIL rather than
  // silently widening the comparison to end of file.
  const E = 'export interface Tail {'
  const rSrc = `${M}\n  'a',\n] as const\n\n${E}\n  style: StyleProfile\n}\n`
  const rCopy = `// DERIVED\n${M}\n  'a',\n] as const\n\n`
  for (const [name, source, copy, expectFail] of [
    ['a region copy passes while the source has a tail', rSrc, rCopy, false],
    ['drift INSIDE the region FAILS', rSrc, rCopy.replace("'a',", "'a', 'b',"), true],
    ['a copy that APPENDS past the region FAILS', rSrc, `${rCopy}export const extra = 1\n`, true],
    ['a SOURCE missing the END marker FAILS', `${M}\n  'a',\n] as const\n`, rCopy, true],
  ]) {
    const got = check(source, copy, M, E) !== null
    if (got !== expectFail) { console.error(`selftest: ${name} — wrong`); failed++ }
    else console.log(`  ok: ${name}`)
  }
  if (failed) process.exit(1)
  console.log('resolver-parity selftest: all cases passed')
  process.exit(0)
}

let bad = 0
for (const p of PAIRS) {
  const problem = check(readFileSync(p.source, 'utf8'), readFileSync(p.copy, 'utf8'), p.marker, p.endMarker)
  if (problem) {
    console.error(`::error::${p.name} parity FAILED: ${problem}`)
    bad++
  } else {
    console.log(`  ${p.name} parity: OK`)
  }
}
if (bad) {
  console.error('Fix the SHARED file, then re-derive the edge copy — never edit the copy alone.')
  process.exit(1)
}
console.log('resolver parity: OK')
