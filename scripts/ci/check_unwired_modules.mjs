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

// ── AND A MODULE CAN BE WIRED WHILE ITS INPUT IS NOT ────────────────────────
//
// ⚠️ THE FIFTH INSTANCE, AND THE FIRST THIS GUARD COULD NOT SEE.
// `csEntityEvidence` takes `entities` so a product the creator TOLD us about
// counts as known. The module was imported, the function was called, the branch
// was tested — and the call site passed only `items`, so the `relationship`
// branch was unreachable in production for as long as it existed. An affiliate
// product on record was indistinguishable from one nobody had ever mentioned.
//
// The module-level check above reports "wired" for exactly this case, because it
// asks whether anything IMPORTS the module. Nothing asked whether anything
// SUPPLIES the input. So: every optional field on a shared input interface is a
// capability, and one that no production file ever writes is a dead branch with
// a test in front of it.
//
// ⚖️ TEXTUAL, AND THEREFORE UNDER-CLAIMING ON PURPOSE. A field counts as
// supplied if any non-test production file writes `field:` anywhere — spread
// objects and renamed locals are not traced. That direction is chosen
// deliberately: this must not manufacture findings, because a report nobody
// believes is a report nobody reads. It will miss some dead inputs. It will not
// invent one.
// ⚠️ AND "OPTIONAL FIELD" IS NOT "INPUT". The first version scanned every
// optional field in every shared module and reported 47 — most of them columns
// on `types.ts` row shapes, which arrive FROM PostgREST and are read rather than
// passed. Nothing "supplies" `thumb_path` because nothing is supposed to; a
// report where the true findings are outnumbered four to one by that is a report
// that gets skimmed and then ignored. So the scan is restricted to interfaces
// that are ACTUALLY USED AS A FUNCTION PARAMETER TYPE in their own module —
// which is what makes a field an input rather than a column.
const PARAM_TYPE = /\([^)]*?:\s*([A-Z][\w$]*)\s*[,)]/g
const BLOCK = (name) => new RegExp(`(?:interface|type)\\s+${name}\\b[^{]*\\{([\\s\\S]*?)\\n\\}`, 'm')
const OPTIONAL_FIELD = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\?\s*:/gm
// Field names too generic for a textual reader test to mean anything. Each is
// here because the name appears as an object key across the codebase for
// unrelated reasons, so "somebody writes it" proves nothing either way.
const AMBIGUOUS = new Set([
  'id', 'name', 'text', 'kind', 'type', 'value', 'label', 'title', 'url', 'source',
  'reason', 'error', 'status', 'mode', 'now', 'basis', 'line', 'goal', 'note',
])
const dead = []
for (const m of modules) {
  let src
  try { src = readFileSync(m, 'utf8') } catch { continue }
  const paramTypes = new Set([...src.matchAll(PARAM_TYPE)].map((x) => x[1]))
  const fields = new Set()
  for (const t of paramTypes) {
    const block = src.match(BLOCK(t))
    if (!block) continue
    for (const mm of block[1].matchAll(OPTIONAL_FIELD)) {
      if (!AMBIGUOUS.has(mm[1])) fields.add(mm[1])
    }
  }
  for (const f of fields) {
    const written = new RegExp(`\\b${f}\\s*:`)
    let supplied = false
    for (const [file, body] of bodies) {
      if (file.includes('__tests__') || file === m) continue
      if (written.test(body)) { supplied = true; break }
    }
    if (!supplied) dead.push({ m, f })
  }
}
console.log(`\ndeclared-but-unsupplied inputs: ${dead.length}`)
for (const d of dead) console.log(`  ⚠️  nothing ever passes \`${d.f}\`  ${d.m}`)
if (dead.length) {
  console.log('\nAn optional input nothing supplies is a branch that cannot run in')
  console.log('production, with a passing test in front of it. Pass it, or drop it.')
}

// ── AND A MODULE CAN BE WIRED WHILE THE FUNCTION IS NOT ─────────────────────
//
// ⚠️ THE BLIND SPOT UNDER THE BLIND SPOT. `traceability.ts` passes the
// module-level check because `traceabilityLevel` is imported by the edge. Under
// that cover, `routeSubstance` — the ONLY function in the codebase that can
// return `CHANGE_CONCEPT`, which is to say the only built mechanism for
// rejecting a concept BEFORE the writer runs — has no production caller at all.
// It has eleven passing assertions and has never executed for a paying creator.
//
// Module-level wiring is therefore not evidence about any particular export.
// This asks the narrower question per exported function, which is the one that
// decides whether a capability is real.
//
// ⚠️ AND MODULE-LEVEL MIRRORING MUST NOT EXCUSE A FUNCTION. A first pass
// labelled every export of a mirrored module "pinned source, not a caller" —
// and that label swallowed `routeSubstance`, because the edge mirrors OTHER
// parts of `traceability.ts`. The per-function search needs no such excuse: an
// inlined copy keeps the function's NAME, so a real mirror already counts as a
// caller here. A name that appears nowhere is dead whatever else its module has.
//
// ⚖️ SAME TEXTUAL, UNDER-CLAIMING RULE. A function counts as called if any
// non-test production file outside its own module names it. Re-exports through
// `index.ts` are excluded (that is a listing, not a call) — everything else is
// taken at its word.
const INDEX = 'packages/shared/src/index.ts'
// ⚠️ AND THE GUARD MUST NOT COUNT ITSELF. The first run of this check reported
// `routeSubstance` as CALLED — by the comment four lines above, in this file,
// naming it as the headline example of a function nothing calls. A report that
// launders its own prose into evidence is worse than no report; it would have
// quietly cleared any function it ever discussed.
const SELF = 'scripts/ci/check_unwired_modules.mjs'
const EXPORTED_FN = /^export function ([A-Za-z_$][\w$]*)/gm
const orphans = []
for (const m of modules) {
  let src
  try { src = readFileSync(m, 'utf8') } catch { continue }
  for (const mm of src.matchAll(EXPORTED_FN)) {
    const fn = mm[1]
    const named = new RegExp(`\\b${fn}\\b`)
    let called = false
    for (const [file, body] of bodies) {
      if (file.includes('__tests__') || file === m || file === INDEX || file === SELF) continue
      if (named.test(body)) { called = true; break }
    }
    if (!called) orphans.push({ m, fn })
  }
}
// ⚖️ GROUPED, AND THE DORMANT SUBTREE SEPARATED — because 101 lines in one flat
// list is the same failure as 47 noisy fields, arrived at from the other side.
// `editor/` is uncalled ON PURPOSE: EDITOR_V2 is off, and that half of the
// product is deliberately unreachable. Mixing it in would bury the findings that
// mean something under a wing nobody claimed was live. It is still counted,
// because "dormant by decision" stops being true the day the flag flips.
const isEditor = (p) => p.startsWith('packages/shared/src/editor/')
// A module the FIRST check already reported has nothing hiding underneath it —
// every export is uncalled and saying so again per function is double-counting.
const alreadyFlagged = new Set(findings.map((f) => f.m))
const live = orphans.filter((o) => !isEditor(o.m) && !alreadyFlagged.has(o.m))
const dormant = orphans.filter((o) => isEditor(o.m))
console.log(`\nexported functions with no production caller: ${orphans.length}`
  + ` (${dormant.length} under editor/, dormant behind EDITOR_V2;`
  + ` ${orphans.length - live.length - dormant.length} in modules already listed above)`)
const byModule = new Map()
for (const o of live) byModule.set(o.m, [...(byModule.get(o.m) ?? []), o.fn])
for (const [m, fns] of [...byModule].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ⚠️  ${m}`)
  console.log(`      ${fns.map((f) => `${f}()`).join(', ')}`)
}
if (live.length) {
  console.log('\nA module counts as wired when ONE of its exports is imported. These')
  console.log('are the ones hiding underneath that. Call them, or delete them.')
}
