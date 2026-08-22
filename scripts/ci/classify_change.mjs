#!/usr/bin/env node
// RUN THE SMALLEST GATE CAPABLE OF FALSIFYING THE CHANGE.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// The staging matrix takes 85-95 minutes and every PR waits for it, including
// PRs that cannot possibly affect a render: a CI guard, a registry entry, a
// regenerated Deno copy. Serialised behind one lane, that is most of a day
// spent proving things nobody doubted.
//
// ⚠️ THE GOAL IS NOT "SKIP TESTS". A change that CAN break the renderer must
// still face the full matrix, and this file's whole job is to be honest about
// which changes those are. Same evidence, less duplicated waiting.
//
// ── WHY IT IS NOT A FILENAME MATCH, AND WHAT I MEASURED ───────────────────
//
// The obvious worry is that packages/shared is consumed by the worker, so a
// "shared utility" edit routed to the cheap path could change how a video is
// cut. ⚠️ I ASSUMED THAT AND IT IS FALSE HERE. Measured, not assumed:
//
//   worker/package.json dependencies : @supabase/supabase-js, undici
//   import statements for @twinai/shared in worker/src : 0
//   grep hits for "@twinai/shared" in worker/src : 17, ALL of them comments
//     forbidding the import ("the worker has no @twinai/shared runtime dep")
//
// The worker is self-contained so its Docker build is, and it DUPLICATES the
// handful of values it shares with the web app -- with CI guards asserting the
// copies agree (check_model_routing, the directorContract parity assertion).
//
// ⚖️ SO THE COUPLING IS PARITY, NOT IMPORTS, and the right response is not to
// escalate shared changes to a 90-minute render matrix that cannot observe the
// difference. It is to make sure the parity guards are in EVERY tier's required
// checks -- which they are -- and to refuse to let the premise rot silently.
// `assertWorkerIndependence` below fails the build the day the worker gains a
// dependency on shared, because on that day this classification stops being
// safe and nothing else would notice.
//
// Reach is still computed, because it is the right answer for worker-internal
// files and because an unresolvable import must escalate rather than shrink the
// set quietly.
//
// ⚠️ AND IT FAILS CLOSED. Anything this file cannot confidently classify gets
// the FULL matrix. An unknown diff must never take the cheap path — that is the
// one failure mode that silently removes evidence instead of adding wall-clock.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { execFileSync } from 'node:child_process'

export const TIERS = Object.freeze({
  STATIC: 'static',
  DB_EDGE_AUTH: 'db_edge_auth',
  WORKER_MEDIA: 'worker_media',
  FULL: 'full',
})

/** Highest wins. FULL is the ceiling and the fail-closed default. */
const RANK = { static: 1, db_edge_auth: 2, worker_media: 3, full: 4 }
export const higher = (a, b) => (RANK[a] >= RANK[b] ? a : b)

/**
 * ⚠️ EXPLICIT CAPABILITY OWNERSHIP, NOT A GUESS FROM THE PATH SHAPE. Each entry
 * is a claim someone made on purpose. A path matching nothing here is not
 * "probably static" — it is unclassified, and unclassified means FULL.
 */
export const OWNERSHIP = Object.freeze([
  // Pure/static: cannot reach a render or a credential.
  [/^scripts\/ci\//, TIERS.STATIC],
  [/^scripts\/[^/]+\.selftest\.mjs$/, TIERS.STATIC],
  [/^docs\//, TIERS.STATIC],
  [/^SECURITY\.md$/, TIERS.STATIC],
  [/^(README|ROADMAP|DESIGN|ARCHITECTURE|BUILD_PLAN|DEPLOY)\.md$/, TIERS.STATIC],

  // Database, edge, auth boundaries.
  [/^supabase\/migrations\//, TIERS.DB_EDGE_AUTH],
  [/^supabase\/functions\//, TIERS.DB_EDGE_AUTH],

  // Worker, media, renderer. Anything here can change a video.
  [/^worker\//, TIERS.WORKER_MEDIA],

  // ⚠️ THE WORKFLOWS THEMSELVES ARE FULL. A change to the gate is exactly the
  // change that must not be graded by the gate it is changing.
  [/^\.github\/workflows\//, TIERS.FULL],

  // packages/shared and apps/web reach the browser, never the renderer -- see
  // the measurement in this file's header. Their evidence is typecheck, their
  // own suites, and the parity guards that keep the worker's duplicated values
  // honest. All of those are in the STATIC tier's required checks.
  [/^packages\/shared\//, TIERS.STATIC],
  [/^apps\/web\//, TIERS.STATIC],
  [/^package(-lock)?\.json$/, TIERS.STATIC],
])

/**
 * ⚠️ THE PREMISE THIS FILE RESTS ON, ASSERTED RATHER THAN REMEMBERED.
 *
 * Routing packages/shared to the cheap path is only safe while the worker
 * cannot import it. The day somebody adds that dependency, every shared change
 * silently starts skipping the matrix that would have caught it -- and a
 * comment saying "the worker has no shared dep" would still be sitting there,
 * true when it was written.
 */
export function assertWorkerIndependence(root = process.cwd()) {
  const problems = []
  const pkgPath = join(root, 'worker/package.json')
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
    for (const name of Object.keys(all)) {
      if (name.startsWith('@twinai/')) {
        problems.push(`worker/package.json depends on ${name}. packages/shared is routed to the `
          + 'cheap gate BECAUSE the worker cannot import it. That is no longer true, so either '
          + 'drop the dependency or move packages/shared to worker_media in OWNERSHIP.')
      }
    }
  }
  return problems
}

export function ownedTier(path) {
  for (const [re, tier] of OWNERSHIP) if (re.test(path)) return tier
  return null
}

// ── dependency reach ──────────────────────────────────────────────────────

const IMPORT_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g

/** Resolve a relative specifier to a repo-relative file, tolerating the
 *  `.js`-for-`.ts` convention this repo uses in ESM imports. */
function resolveSpecifier(fromFile, spec, root) {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(join(root, fromFile)), spec)
  const tries = [
    base,
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
    `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`,
    join(base, 'index.ts'), join(base, 'index.tsx'),
  ]
  for (const t of tries) if (existsSync(t)) return relative(root, t)
  return null
}

/**
 * Every file reachable by imports FROM the given roots.
 *
 * ⚖️ FORWARD REACH FROM THE RISKY CODE, not backward from the change. The
 * question is "does the renderer end up running this?", and answering it from
 * the renderer's side means an unresolvable import makes the set SMALLER, which
 * would be unsafe — so `unresolved` is reported and the caller escalates on it.
 */
export function reachableFrom(roots, root = process.cwd()) {
  const seen = new Set()
  const unresolved = []
  const stack = [...roots]
  while (stack.length) {
    const cur = stack.pop()
    if (seen.has(cur)) continue
    seen.add(cur)
    const abs = join(root, cur)
    if (!existsSync(abs)) continue
    let src = ''
    try { src = readFileSync(abs, 'utf8') } catch { continue }
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1]
      if (!spec.startsWith('.')) {
        // A workspace package import (@twinai/shared) reaches the whole package;
        // handled by the caller seeding those roots explicitly.
        continue
      }
      const next = resolveSpecifier(cur, spec, root)
      if (next) stack.push(next)
      else unresolved.push(`${cur} -> ${spec}`)
    }
  }
  return { files: seen, unresolved }
}

/** The entry points whose behaviour the full matrix exists to protect. */
export const WORKER_ROOTS = Object.freeze([
  'worker/src/jobs/ffmpegGraph.ts',
  'worker/src/jobs/frameTimeline.ts',
  'worker/src/jobs/editorCompile.ts',
  'worker/src/jobs/editorValidateOutput.ts',
  'worker/src/jobs/editorRenderStage.ts',
])

/**
 * Classify one changed-file list.
 *
 * Returns the tier plus the REASONS, because a gate decision nobody can audit
 * is a gate decision nobody should trust.
 */
export function classify(changed, opts = {}) {
  const root = opts.root ?? process.cwd()
  const reasons = []
  let tier = TIERS.STATIC

  if (!Array.isArray(changed) || changed.length === 0) {
    // ⚠️ NO FILES IS NOT "NOTHING TO TEST". It means the diff could not be
    // computed, which is precisely when guessing is worst.
    return { tier: TIERS.FULL, reasons: ['no changed files were resolved — failing closed'] }
  }

  // ⚠️ THE PREMISE FIRST. If the worker has gained a shared dependency, the
  // cheap routing for packages/shared is no longer sound and nothing below is
  // trustworthy — so refuse to classify at all rather than classify wrongly.
  const premise = assertWorkerIndependence(root)
  if (premise.length > 0) return { tier: TIERS.FULL, reasons: premise }

  const reach = opts.reach ?? reachableFrom(WORKER_ROOTS, root)
  if (reach.unresolved.length > 0) {
    reasons.push(`${reach.unresolved.length} import(s) could not be resolved from the worker roots `
      + `(e.g. ${reach.unresolved[0]}) — the reachable set may be incomplete, so escalating`)
    tier = higher(tier, TIERS.FULL)
  }

  for (const path of changed) {
    // Dependency reach beats ownership, always upward.
    if (reach.files.has(path)) {
      reasons.push(`${path} is reachable from the worker/renderer entry points`)
      tier = higher(tier, TIERS.WORKER_MEDIA)
      continue
    }
    const owned = ownedTier(path)
    if (owned === null) {
      reasons.push(`${path} matches no capability owner — failing closed`)
      tier = higher(tier, TIERS.FULL)
      continue
    }
    reasons.push(`${path} -> ${owned}`)
    tier = higher(tier, owned)
  }
  return { tier, reasons }
}

/** What each tier must actually run. Never a subset that drops a security check. */
export const REQUIRED_CHECKS = Object.freeze({
  [TIERS.STATIC]: ['unit', 'typecheck', 'static-guards', 'generated-copy-drift'],
  [TIERS.DB_EDGE_AUTH]: ['unit', 'typecheck', 'static-guards', 'generated-copy-drift',
    'migration-schema', 'rls-auth-security', 'edge-deploy-verify', 'targeted-integration'],
  [TIERS.WORKER_MEDIA]: ['unit', 'typecheck', 'static-guards', 'generated-copy-drift',
    'migration-schema', 'rls-auth-security', 'edge-deploy-verify', 'full-staging-matrix'],
  [TIERS.FULL]: ['unit', 'typecheck', 'static-guards', 'generated-copy-drift',
    'migration-schema', 'rls-auth-security', 'edge-deploy-verify', 'full-staging-matrix'],
})

function changedFilesFromGit(base) {
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' })
  return out.split('\n').map((s) => s.trim()).filter(Boolean)
}

// ── CLI ───────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('classify_change.mjs')) {
  if (process.argv.includes('--selftest')) {
    // The selftest lives in its own file so this one stays importable.
    console.log('run: node scripts/ci/classify_change.selftest.mjs')
    process.exit(0)
  }
  const i = process.argv.indexOf('--base')
  const base = i < 0 ? 'origin/main' : process.argv[i + 1]
  let changed = []
  try { changed = changedFilesFromGit(base) } catch (e) {
    console.log(`::warning::could not diff against ${base} (${e.message}) — failing closed to full`)
  }
  const { tier, reasons } = classify(changed)
  for (const r of reasons.slice(0, 40)) console.log(`  ${r}`)
  if (reasons.length > 40) console.log(`  ...and ${reasons.length - 40} more`)
  console.log(`gate tier: ${tier}`)
  console.log(`required: ${REQUIRED_CHECKS[tier].join(', ')}`)
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('node:fs')
    appendFileSync(process.env.GITHUB_OUTPUT, `tier=${tier}\n`)
  }
}
