// SO IT DOES NOT GET SLOW AGAIN.
//
// The landing page shipped 14.3 MB of video because a 12 MB file was committed
// to apps/web/public and nothing objected. Nothing in CI looks at the size of a
// static asset, so the only feedback loop was someone noticing the site felt
// slow — which took until a user said so.
//
// This is that missing feedback loop: a per-file cap and a total cap on the
// directory Vite copies verbatim into the build.
//
// ── WHY public/ SPECIFICALLY ──────────────────────────────────────────────
//
// Everything under apps/web/public is copied to the output UNPROCESSED. Vite
// will not compress it, hash it, tree-shake it or warn about it. An import in
// src/ at least passes through the bundler and shows up in build output; a file
// dropped in public/ is invisible until it is being served.
//
// ── THE CAPS ARE DELIBERATELY NOT AT TODAY'S VALUES ───────────────────────
//
// A guard set exactly at the current number fails on the next honest edit and
// gets raised reflexively until it means nothing. These are set at what a
// landing page can afford to serve: 3 MB for any single file, 8 MB for the
// whole directory. The current 12 MB clip is over the per-file cap ON PURPOSE —
// this guard is meant to fail today, and the failure names the file.
//
// ── IT REPORTS WHAT IT SKIPPED ────────────────────────────────────────────
//
// If public/ does not exist, that is reported rather than passing quietly. A
// budget check that silently examines nothing is worse than none: it puts a
// green tick next to a question nobody asked.
//
//   node scripts/ci/check_web_asset_budget.mjs
//   node scripts/ci/check_web_asset_budget.mjs --selftest

import { readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const PUBLIC_DIR = 'apps/web/public'
export const MAX_FILE_BYTES = 3 * 1024 * 1024
export const MAX_TOTAL_BYTES = 8 * 1024 * 1024

/**
 * EXISTING DEBT, NAMED — not a raised cap.
 *
 * `reel-creator.mp4` is already over budget and re-encoding it needs ffmpeg,
 * which is not available where this was written. The choice was between raising
 * the caps until today passes (which makes the guard meaningless) and recording
 * the exception explicitly (which keeps the caps honest and makes the debt
 * visible in a diff).
 *
 * The exception is keyed to a SIZE, not just a path. So:
 *   - shrinking this file passes, and the entry can then be deleted
 *   - this file GROWING fails
 *   - any OTHER oversized file fails, exception or not
 *
 * Delete the entry when the asset is re-encoded. It is not a permanent licence,
 * and a guard whose exception list grows is a guard on its way to being theatre.
 */
export const KNOWN_OVERSIZE = {
  // Exact bytes, not a rounded MB: a rounded figure is either slightly too
  // small (fails today) or slightly too large (silently licenses growth).
  'media/reel-creator.mp4': 11860272,
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`

/** Every file under `dir`, recursively, with its size. */
export function walkSizes(dir) {
  const out = []
  const rec = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) { rec(p, r); continue }
      out.push({ path: r, bytes: statSync(p).size })
    }
  }
  rec(dir, '')
  return out.sort((a, b) => b.bytes - a.bytes)
}

/** Pure verdict, so the rule is testable without a filesystem full of fixtures. */
export function assess(files, maxFile = MAX_FILE_BYTES, maxTotal = MAX_TOTAL_BYTES,
                       known = KNOWN_OVERSIZE) {
  const total = files.reduce((n, f) => n + f.bytes, 0)
  const allowance = Object.entries(known).reduce((n, [, b]) => n + b, 0)
  // A known file is allowed its RECORDED size and not one byte more.
  const overFile = files.filter((f) => f.bytes > maxFile && !(f.path in known && f.bytes <= known[f.path]))
  const grown = files.filter((f) => f.path in known && f.bytes > known[f.path])
  const overTotal = total > maxTotal + allowance
  return { total, allowance, overFile, grown, overTotal, ok: overFile.length === 0 && grown.length === 0 && !overTotal }
}

function main() {
  if (!existsSync(PUBLIC_DIR)) {
    console.error(`web-asset-budget: ${PUBLIC_DIR} does not exist — nothing was checked, which is not the same as passing.`)
    process.exit(1)
  }
  const files = walkSizes(PUBLIC_DIR)
  const v = assess(files)
  console.log(`web-asset-budget: ${files.length} files, ${mb(v.total)} total (caps: ${mb(MAX_FILE_BYTES)}/file, ${mb(MAX_TOTAL_BYTES)} total)`)
  for (const f of files.slice(0, 5)) console.log(`  ${mb(f.bytes).padStart(8)}  ${f.path}`)

  if (v.ok) return
  console.error('')
  for (const f of v.overFile) {
    console.error(`::error::${PUBLIC_DIR}/${f.path} is ${mb(f.bytes)}, over the ${mb(MAX_FILE_BYTES)} per-file cap.`)
  }
  for (const f of v.grown) {
    console.error(`::error::${PUBLIC_DIR}/${f.path} is ${mb(f.bytes)}, larger than its recorded exception. Known debt may shrink, never grow.`)
  }
  if (v.overTotal) {
    console.error(`::error::${PUBLIC_DIR} totals ${mb(v.total)}, over the ${mb(MAX_TOTAL_BYTES)} cap.`)
  }
  console.error('')
  console.error('Files here are copied into the build UNPROCESSED — no compression, no warning.')
  console.error('Re-encode the asset, or move it to a CDN and reference it by URL.')
  process.exit(1)
}

function selftest() {
  const fails = []
  const check = (name, cond) => { if (!cond) fails.push(name) }
  const f = (bytes) => ({ path: 'x', bytes })

  check('an empty directory passes', assess([]).ok)
  check('a file at the cap passes', assess([f(MAX_FILE_BYTES)]).ok)
  check('a file one byte over fails', !assess([f(MAX_FILE_BYTES + 1)]).ok)
  check('the over-file list names the offender', assess([f(MAX_FILE_BYTES + 1)]).overFile.length === 1)
  check('many small files can still bust the TOTAL',
    !assess(Array.from({ length: 20 }, () => f(1024 * 1024))).ok)
  check('...and that is reported as a total, not a per-file, failure', (() => {
    const v = assess(Array.from({ length: 20 }, () => f(1024 * 1024)))
    return v.overTotal && v.overFile.length === 0
  })())
  check('the real tree is measurable', walkSizes(PUBLIC_DIR).length > 0)

  // THE EXCEPTION MECHANISM, which is the part most likely to rot into a licence.
  const known = { 'big.mp4': 10 * 1024 * 1024 }
  check('a known file at its recorded size passes',
    assess([{ path: 'big.mp4', bytes: 10 * 1024 * 1024 }], MAX_FILE_BYTES, 100e6, known).ok)
  check('a known file that GREW fails',
    !assess([{ path: 'big.mp4', bytes: 10 * 1024 * 1024 + 1 }], MAX_FILE_BYTES, 100e6, known).ok)
  check('a known file that SHRANK passes',
    assess([{ path: 'big.mp4', bytes: 1024 }], MAX_FILE_BYTES, 100e6, known).ok)
  check('an UNKNOWN oversized file still fails, exceptions notwithstanding',
    !assess([{ path: 'other.mp4', bytes: MAX_FILE_BYTES + 1 }], MAX_FILE_BYTES, 100e6, known).ok)
  check('the real tree passes with its recorded exception', assess(walkSizes(PUBLIC_DIR)).ok)

  if (fails.length) {
    console.error(`selftest FAILED (${fails.length}):`)
    for (const x of fails) console.error(`  - ${x}`)
    process.exit(1)
  }
  console.log('selftest ok')
}

if (process.argv[2] === '--selftest') selftest()
else main()
