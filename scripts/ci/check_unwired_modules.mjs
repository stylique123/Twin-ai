#!/usr/bin/env node
// A CAPABILITY WITH NO READER IS WORSE THAN AN ABSENT ONE.
//
// ⚠️ THIS SHAPE APPEARED FOUR TIMES IN ONE WEEK, and each time it was found by
// accident rather than by a check:
//
//   scanTargetConfirmation.ts   100 lines of tests, no importer anywhere. The
//                               defect it was written for stayed live the whole
//                               time the suite reported it covered.
//   extractKnowledgeFromCaptions  written and tested; the DNA scan had the
//                               captions in hand and never called it, so
//                               creators could finish a scan with an EMPTY
//                               knowledge table.
//   audience readiness field    `assessReadiness` evaluated it, the edge never
//                               did — so shared blocked a case production
//                               charged for.
//   entityEvidence              built, then wired only because someone asked.
//
// CI reported all four green. That is the whole problem: a module with tests and
// no consumer looks HEALTHIER than one with neither, because the coverage number
// counts it.
//
// ⚖️ REPORTS, NEVER FAILS — for now, and deliberately. Some modules are wired
// through the EDGE, which cannot import @twinai/shared and mirrors the rule
// inline instead; others are genuinely new and land a commit before their
// reader. A guard that failed on both would be argued with and then disabled.
// It prints, and a human decides.
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const sh = (c) => execSync(c, { encoding: 'utf8' })

const modules = sh("git ls-files 'packages/shared/src/*.ts'")
  .split('\n').filter(Boolean)
  .filter((f) => !f.includes('__tests__') && !f.endsWith('index.ts'))

/** Where a shared module can legitimately be consumed. */
// ⚠️ `worker/src/**/*.ts` DOES NOT MATCH `worker/src/scanTarget.ts`. In git's
// pathspec globbing `**/` requires at least one intervening directory, so the
// first version of this list was blind to every TOP-LEVEL file in each source
// root — which is exactly where the inlined mirrors live. It reported
// `scanTargetConfirmation` as unwired while `worker/src/scanTarget.ts` sat
// there naming it in line 3.
const CONSUMERS = sh(
  "git ls-files 'apps/web/*.ts' 'apps/web/**/*.ts' 'apps/web/*.tsx' 'apps/web/**/*.tsx' " +
  "'worker/src/*.ts' 'worker/src/**/*.ts' 'packages/shared/src/*.ts' 'packages/shared/src/**/*.ts' " +
  "'supabase/functions/*.ts' 'supabase/functions/**/*.ts' 'scripts/**/*.mjs' 'scripts/**/*.mts' " +
  "| grep -v node_modules | sort -u",
).split('\n').filter(Boolean)

const bodies = new Map()
for (const f of CONSUMERS) { try { bodies.set(f, readFileSync(f, 'utf8')) } catch { /* deleted */ } }

const findings = []
for (const m of modules) {
  const name = m.split('/').pop().replace(/\.ts$/, '')
  const testFile = `packages/shared/src/__tests__/${name}.test.ts`
  const hasTests = [...bodies.keys()].some((k) => k.includes('__tests__') && k.includes(name))

  let readers = 0
  let mirrored = false
  for (const [f, src] of bodies) {
    if (f === m) continue
    // ⚠️ THE EDGE AND THE WORKER CANNOT IMPORT @twinai/shared, so the real
    // convention for wiring is INLINING with a comment naming the source path.
    // The first version of this guard only recognised a "…Parity" test filename
    // and flagged 26 of 62 modules — 42%, including `spokenPlaceholders` and
    // `referenceMechanism`, both of which are inlined and documented as such. A
    // guard that cries wolf at 42% gets disabled, which is the exact failure its
    // own header warns about.
    // ⚠️ A TEST MENTIONING THE MODULE IS NOT WIRING. The second version of this
    // guard let any file naming the module count, tests included — and since
    // every module has a test that names it, the report swung from 26 findings
    // to zero. Both numbers were wrong for the same reason: the guard was
    // measuring whether anything MENTIONS the module rather than whether
    // PRODUCTION READS it. Tests are excluded here permanently; a module whose
    // only reader is its own test is the exact thing being hunted.
    if (f.includes('__tests__')) continue
    // The edge and the worker cannot import @twinai/shared, so the convention
    // for wiring them is INLINING with a comment naming the source path. That
    // is real wiring and must count.
    // Two conventions are in use for inlining, and both are real wiring:
    //   "Inlined from `packages/shared/src/x.ts`"  — full path
    //   "Duplicated from `voiceMetrics` in @twinai/shared" — bare name
    if (src.includes(m)) { mirrored = true; continue }
    if (new RegExp(`(?:Inlined|Duplicated|Mirrors) from \`?${name}\`? in @twinai/shared`).test(src)) {
      mirrored = true; continue
    }
    if (new RegExp(`from '[^']*${name}(\\.[jt]s)?'`).test(src)) readers++
  }
  if (readers === 0 && !mirrored) findings.push({ m, hasTests })
}

const tested = findings.filter((f) => f.hasTests)
console.log(`unwired-modules: ${modules.length} shared modules scanned`)
if (!findings.length) { console.log('all have a production reader or an edge mirror'); process.exit(0) }
console.log(`\n${findings.length} with NO importer and no edge mirror` +
  (tested.length ? ` — ${tested.length} of them have tests, which is the dangerous kind:` : ':'))
for (const f of findings) {
  console.log(`  ${f.hasTests ? '⚠️  tested but unread' : '   no tests, no readers'}  ${f.m}`)
}
console.log('\nA module with tests and no consumer looks HEALTHIER than one with')
console.log('neither, because the coverage number counts it. Wire it, or delete it.')
