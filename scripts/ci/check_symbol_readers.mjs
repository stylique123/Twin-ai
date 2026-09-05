#!/usr/bin/env node
// A FUNCTION NOBODY CALLS IS A RULE NOBODY RUNS.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// `check_column_readers` closed this for COLUMNS and `check_counter_durability`
// for EVENTS. Neither covers the case that has cost the most this quarter: a
// RULE, written and unit-tested, that no production code path ever calls.
//
// Measured on 2026-09-05, both found by hand within an hour of each other:
//   * `isBillableScript` / `discoveryQuestions` decide whether a script that
//     asks the creator to fill in its own blanks may be CHARGED for. Zero
//     production callers; generate-blueprint re-implements the rule inline from
//     its own phrase list, under a comment claiming these are what detect it.
//   * `claimsQuestionFor` puts the offer's real name into the readiness
//     question. Zero callers, so every creator read "What does the OFFER do?"
//     while the server asked the personalised version.
//
// Both were heavily unit-tested. High coverage on an unreached function is the
// specific trap: it looks like the best-verified code in the repo.
//
// ── THE INSTRUMENT, AND THE THREE FALSE-POSITIVE CLASSES IT COST ──────────
//
// ⚠️ THE FIRST CUT REPORTED 232 ORPHANS OF 839. IT WAS WRONG THREE WAYS, and
// each correction is load-bearing — `check_column_readers`'s header records the
// same lesson (29 apparent, 7 real) and this one repeated it before reading it.
//
//   1. AN INLINE TWIN IS A READER OF THE RULE. Edge functions run on Deno and
//      cannot import @twinai/shared, so the house convention is a copy named
//      `<name>Inline`. Counting those as unread inflated the list with rules
//      that are very much live — `compileStyle` and `renderContentHistory` both
//      looked orphaned and both are called every generation.
//   2. `scripts/` IS A READER, AND SO IS `.mjs`. `borrowing-rerun.mjs`
//      esbuild-bundles `measureVerbatimOverlap` from source. Excluding the
//      directory and the extension made a live function look dead.
//   3. REACHABILITY IS TRANSITIVE. A helper called only inside its own file, by
//      an exported symbol that IS reached, is reached. Without a fixpoint this
//      reported every internal helper in the codebase. This was the big one:
//      it alone accounts for 193 of the 232.
//
// With all three the real number is 39 of 839 (4.6%), and every one was checked
// by hand: each appears in production source only in its own file.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
//
// ⚠️ IT CANNOT SEE A DYNAMIC CALL. `obj[name]()`, a symbol reached through a
// re-export alias, or a name assembled at runtime is invisible here. That
// direction is the unsafe one — it reports a live function as dead — which is
// why every entry in the registry below was verified by hand rather than
// accepted from the tool.
//
// ⚠️ A MENTION COUNTS AS A CALL. It asks whether the NAME appears, not whether
// it is invoked. A symbol named only in a comment reads as reached. Same hole
// `check_column_readers` documents, same reason: closing it needs a parser.
//
// ⚠️ IT PROVES NOTHING ABOUT BEHAVIOUR. A function with a caller may still be
// called with inputs that make it a no-op. That is the mutation tests' job.
//
// ⚠️ TESTS ARE NOT READERS, ON PURPOSE. That is the entire point: the two
// defects above were fully covered by tests and reached by nothing.
//
//   node scripts/ci/check_symbol_readers.mjs            # the real tree
//   node scripts/ci/check_symbol_readers.mjs --selftest # fixtures
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')

// ⚠️ EVERY ENTRY IS A DECISION SOMEBODY MADE, WITH A REASON THAT NAMES WHAT
// WOULD CHANGE IT. An unregistered unreached symbol fails the build; a
// registered one is a debt that was named. "Later" is not a reason.
export const REGISTRY = {
  'creativeTransferPlan.ts': {
    symbols: ['TransferPlanError', 'computePlanSha256', 'finalizeTransferPlan',
      'validateCreativeTransferPlan', 'canonicalTransferPlan'],
    // ⚠️ THE TWO COLUMNS OF THIS LINEAGE ARE NAMED IN `check_column_readers`'s
    // OWN REGISTRY AND MUST NOT BE SPELLED OUT HERE. Naming them made that
    // guard see a reader for columns it had registered as unread, and it failed
    // the build — this file mentioning a column is not code consuming it. The
    // same self-reference this guard asserts against for its own symbols, caused
    // one guard over, in the commit that added the assertion. Two debt registers
    // that can read each other are two guards that excuse each other.
    why: 'The whole CreativeTransferPlan lineage is measured dead: 0 rows in '
      + 'production and no caller for any of its exported functions. Its two '
      + 'dead columns are already registered on the column side, in '
      + 'check_column_readers\'s own registry — deliberately not repeated here. '
      + 'DECIDE as one unit — wire the lineage or drop it — not one symbol at a time.',
  },
  'communityChecks.ts': {
    symbols: ['unsupportedFigures', 'offMapLinks', 'checkCommunityScene', 'surfacesNotInCatalog'],
    why: 'Five repair checks for a community scene. The community BLOCK is live '
      + '(communityBlockInline reaches the prompt at index.ts:5085), so the '
      + 'scene is written; these validate the scene that comes back and nothing '
      + 'calls them. WIRE when a community scene is checked after generation '
      + 'rather than only instructed before it — the repair-not-refuse shape is '
      + 'already right, it has no call site.',
  },
  'editClassification.ts': {
    symbols: ['classifyEdit', 'summariseEdits', 'deriveLessons'],
    why: 'Deliberately read-time, not capture-time: 0127 stores the edit pair and '
      + 'refuses to store the judgement, so interpretation can be revised when it '
      + 'turns out wrong. Unreached because the reader does not exist yet. '
      + 'REVISIT at ~100 edit pairs plus accepted-final — the same precondition '
      + 'as the edit-pairs ranking signal.',
  },
  'editor/catalogs.ts': {
    symbols: ['allowedCatalogs', 'isCaptionPreset', 'isMusicMood'],
    why: 'Frozen bounded preset catalogs (Constitution §10A/§10B). The CATALOGS '
      + 'themselves are read; these three are the type guards that would validate '
      + 'a Director choice against them, and the re-resolution path validates by '
      + 'other means today. Low risk, real gap: an unguarded enum is how a model '
      + 'choice outside the catalog would reach the renderer.',
  },
  'editor/features.ts': {
    symbols: ['selectableRemovalCandidates', 'isRemovalKindEnabled'],
    why: 'Auto filler-removal is NOT shipped by owner decision 2026-07-20. These '
      + 'are the gate that keeps a filler candidate from being SELECTED for '
      + 'removal. Unreached because nothing downstream selects removals at all '
      + 'yet. REOPEN with task #117 (acoustically-grounded disfluency detector) — '
      + 'these must be wired BEFORE the flag flips, never after.',
  },
  'extractionParityDecisions.ts': {
    symbols: ['downstreamVerdicts', 'downstreamDisagreements', 'hardContradictions'],
    why: 'The pass criterion for a model swap, computed on DECISIONS rather than '
      + 'raw field equality. Unreached because the routing decision it exists to '
      + 'settle is still open: extract stays on Pro until a replacement passes '
      + 'semantic parity. This is the instrument for that run, not dead code — it '
      + 'gets its caller when the parity run is executed.',
  },
  'formatOutcomes.ts': {
    symbols: ['rankFormatsByOutcome', 'outcomeSpread'],
    why: 'Joins posts.views to the generation that produced each post — the join '
      + 'nothing has ever made, so a creator can see one video got 40k and still '
      + 'not know whether their listicles beat their storytimes. Both halves have '
      + 'existed for months. BLOCKED ON DATA, not effort: it needs published '
      + 'videos with view counts, which is an owner task.',
  },
  'pilot/backlogRuns.ts': {
    symbols: ['assessedRate', 'lostBeforeLooking', 'backlogBatch'],
    why: 'Pins what a backlog batch measured so it cannot drift, and so a batch '
      + 'is never pooled with a labelled pilot run. Deliberately a record rather '
      + 'than a code path — its job is to be read by a person deciding, which is '
      + 'why it has no caller. Same shape as knownLimitations.',
  },
  'pilot/cutOrder.ts': {
    symbols: ['presentationOrder', 'presentToReviewer'],
    why: 'Hides the controls from a reviewer, because a reviewer who can spot the '
      + 'controls has been told the answer. Unreached because the review queue it '
      + 'orders does not exist yet. WIRE with the cut-by-cut review queue — and '
      + 'it must be wired in the same PR as the queue, or the first session is '
      + 'run unblinded and its labels are worthless.',
  },
  'pilot/fieldMeaningUpgrades.ts': {
    symbols: ['upgradeFor'],
    why: '#483 put the field question under each claim for the REVIEWER; '
      + 'FIELD_QUESTIONS in worker/src/visualPrompt.ts still asks the model the '
      + 'loose original. This is the upgrade for the model side and nothing '
      + 'applies it, so reviewer and model are answering different questions. '
      + 'A real gap with a known fix, blocked only on a visual-prompt version bump.',
  },
  'pilot/knownLimitations.ts': {
    symbols: ['openLimitations', 'limitationById'],
    why: 'Accessors over the limitation registry. The REGISTRY is read (by its '
      + 'own guard and by docs/known-limitations.md parity); these two accessors '
      + 'have no caller because nothing renders limitations in a UI. Keep — they '
      + 'are the read API for a surface that should exist, and the registry is '
      + 'the thing that matters.',
  },
  // ⚖️ `referenceAssessment.ts` WAS THE HIGHEST-VALUE ENTRY IN THIS REGISTRY AND
  //  THE DEBT IS PAID. `assessFromText` and `isConclusive` were registered as
  //  having a caller-shaped hole and the data to fill it;
  //  scripts/qa/gallery-requirements-backfill.mjs is that caller, and it bundles
  //  the real function from source rather than restating the marker lists.
  //  Removed rather than kept with a note: an entry for a symbol that HAS a
  //  reader is what this guard exists to reject, and leaving it would make the
  //  guard fail on every branch from here on.
  'shapeForGoal.ts': {
    symbols: ['rankShapesForGoal', 'shapeForGoal'],
    why: 'A deferral with a trigger, not a comment saying later (#682). Measured '
      + 'inert: only `entertainment` separates at 2 standard errors, and the '
      + 'corpus read costs 311ms for one goal in seven. REOPEN when 4+ goals '
      + 'separate, or the read drops under 100ms. The trigger is armed in the '
      + 'file header.',
  },
  'shapeLibrary.ts': {
    symbols: ['projectShape', 'shapeStats'],
    why: 'Merged (#675) deliberately BEFORE its consumers, because a whitelist '
      + 'projection with no readers is free to change and one with readers is a '
      + 'taxonomy under live traffic. Unreached by design and by decision. WIRE '
      + 'with the gallery and angle engine, which are the named consumers.',
  },
  'uploadForensics.ts': {
    symbols: ['classifyUpload', 'tallyUploads', 'oursCount'],
    why: 'Tells an upload the creator abandoned from one WE broke — the '
      + 'single-shot XHR PUT with no ontimeout/onabort handler, measured as the '
      + 'cause of both stuck takes. The classification exists so the next stuck '
      + 'row is diagnosed rather than guessed; nothing calls it because there is '
      + 'no operator surface. Two rows is not enough to build one for.',
  },
}

const SRC_EXT = /\.(ts|tsx|mjs|js|cjs)$/
const isTest = (p) => /__tests__|\.test\.|\.spec\./.test(p)
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p, out) }
    else if (SRC_EXT.test(e)) out.push(p)
  }
  return out
}

/** Exported runtime symbols declared in a file. Types and interfaces are
 *  excluded: a type with no runtime reader is not this defect. SCREAMING_CASE
 *  constants are excluded too — a frozen table is data, read by value. */
export function exportedSymbols(body) {
  const out = []
  for (const m of body.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    const n = m[1]
    if (n.toUpperCase() === n && n.length > 3) continue
    out.push(n)
  }
  return out
}

/**
 * Which symbols are reached, given the production sources.
 *
 * A symbol is reached if a production file OTHER than its own names it (the
 * barrel re-export does not count — re-exporting is not consuming), or an edge
 * or worker file carries its `<name>Inline` twin, or — transitively — its own
 * file names it from a symbol that is itself reached.
 */
export function reachedSymbols(symbols, prodSources) {
  const mentions = (body, n) => new RegExp(`\\b${n}\\b`).test(body)
  const reached = new Set()
  for (const s of symbols) {
    for (const [p, body] of prodSources) {
      if (p === s.file) continue
      if (/packages[/\\]shared[/\\]src[/\\]index\.ts$/.test(p)) continue
      if (mentions(body, s.name)) { reached.add(s.name); break }
      if (/supabase[/\\]functions|worker[/\\]src/.test(p)
        && new RegExp(`\\b${s.name}Inline\\b`).test(body)) { reached.add(s.name); break }
    }
  }
  // ⚠️ FIXPOINT, NOT ONE PASS. A helper reached by a helper reached by an
  // exported entry point is reached; a single pass finds only the first link.
  for (let grew = true; grew;) {
    grew = false
    for (const s of symbols) {
      if (reached.has(s.name)) continue
      const body = prodSources.get(s.file)
      if (!body) continue
      const byReached = symbols.some((o) =>
        o.file === s.file && o.name !== s.name && reached.has(o.name))
      if (byReached && mentions(body, s.name)) { reached.add(s.name); grew = true }
    }
  }
  return reached
}

if (process.argv.includes('--selftest')) {
  let failures = 0
  const check = (name, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want)
    if (g !== w) { console.error(`selftest: ${name} — got ${g}, want ${w}`); failures++ }
  }
  check('exports functions, consts and classes', exportedSymbols(
    'export function a() {}\nexport const b = 1\nexport class c {}'), ['a', 'b', 'c'])
  check('skips types and interfaces', exportedSymbols(
    'export type T = 1\nexport interface I {}\nexport function keep() {}'), ['keep'])
  check('skips SCREAMING constant tables', exportedSymbols(
    'export const KNOWN_LIMITS = []\nexport const ok = 1'), ['ok'])
  check('keeps short upper names', exportedSymbols('export const ID = 1'), ['ID'])

  const S = (name, file) => ({ name, file })
  check('a caller in another file reaches it', [...reachedSymbols(
    [S('used', '/a.ts')], new Map([['/a.ts', 'export function used(){}'], ['/b.ts', 'used()']]))], ['used'])
  check('the barrel re-export is NOT a reader', [...reachedSymbols(
    [S('bare', '/a.ts')],
    new Map([['/a.ts', 'export function bare(){}'],
      ['/packages/shared/src/index.ts', "export * from './a'\nbare"]]))], [])
  check('an edge Inline twin reaches it', [...reachedSymbols(
    [S('rule', '/a.ts')], new Map([['/a.ts', 'export function rule(){}'],
      ['/supabase/functions/x/index.ts', 'function ruleInline(){}']]))], ['rule'])
  // ⚠️ THE CORRECTION THAT TOOK 232 TO 39.
  check('a helper reached only through a reached sibling is reached', [...reachedSymbols(
    [S('entry', '/a.ts'), S('helper', '/a.ts')],
    new Map([['/a.ts', 'export function entry(){ return helper() }\nexport function helper(){}'],
      ['/b.ts', 'entry()']]))].sort(), ['entry', 'helper'])
  check('a helper reached only through an UNREACHED sibling stays unreached', [...reachedSymbols(
    [S('dead', '/a.ts'), S('alsoDead', '/a.ts')],
    new Map([['/a.ts', 'export function dead(){ return alsoDead() }\nexport function alsoDead(){}']]))], [])

  if (failures > 0) { console.error(`symbol-readers guard selftest: ${failures} FAILED`); process.exit(1) }
  console.log('symbol-readers guard selftest: OK (9 cases, incl. both transitive directions)')
  process.exit(0)
}

const SHARED = join(REPO, 'packages', 'shared', 'src')
const ROOTS = ['packages/shared/src', 'apps/web/src', 'worker/src', 'supabase/functions', 'scripts']
  .map((r) => join(REPO, r))
  .filter((p) => { try { return statSync(p).isDirectory() } catch { return false } })

const allFiles = ROOTS.flatMap((r) => walk(r))

// ⚠️ THIS FILE IS NOT A READER OF THE SYMBOLS IT REGISTERS, AND EXCLUDING IT IS
// NOT A CONVENIENCE. `scripts/` is a scanned root (correctly — borrowing-rerun
// bundles shared source), and the REGISTRY below NAMES every symbol it excuses.
// On the first run that made all 39 look reached and the guard reported
// "0 unreached": the debt record was mistaken for the repayment. It is the
// mention-versus-call trap this repo has now hit three times, and here it was
// self-inflicted — a guard that reads its own registry always passes.
const SELF = join(REPO, 'scripts', 'ci', 'check_symbol_readers.mjs')
const prodSources = new Map(allFiles
  .filter((p) => !isTest(p) && p !== SELF)
  .map((p) => [p, readFileSync(p, 'utf8')]))

// ⚠️ A WALK THAT FINDS NOTHING PASSES EVERY CHECK BELOW. A wrong root is the
// way this guard would go quietly off without failing.
if (prodSources.size < 400) {
  console.error(`symbol-readers: only ${prodSources.size} production files scanned — wrong root?`)
  process.exit(1)
}

// ⚠️ AND THE SELF-EXCLUSION IS ASSERTED, NOT ASSUMED. Deleting that filter does
// not make this guard fail — it makes it report "0 unreached" and exit GREEN,
// because the REGISTRY names every symbol it excuses. That is the off state
// looking exactly like success, on the guard whose whole job is to catch that.
// So the filter is checked rather than trusted.
if (prodSources.has(SELF)) {
  console.error('symbol-readers: this file is in the scanned set — its own REGISTRY would')
  console.error('make every registered symbol look read, and the guard would pass vacuously.')
  process.exit(1)
}

const symbols = []
for (const f of walk(SHARED)) {
  if (isTest(f) || /index\.ts$/.test(f)) continue
  for (const n of exportedSymbols(readFileSync(f, 'utf8'))) symbols.push({ name: n, file: f })
}
const reached = reachedSymbols(symbols, prodSources)
const orphans = symbols.filter((s) => !reached.has(s.name))

const registered = new Map()
for (const [file, entry] of Object.entries(REGISTRY)) {
  for (const s of entry.symbols) registered.set(`${file}::${s}`, entry)
}

const unregistered = orphans.filter((o) =>
  !registered.has(`${relative(SHARED, o.file).replace(/\\/g, '/')}::${o.name}`))

console.log(`symbol-readers: ${symbols.length} exported symbols, ${reached.size} reached, `
  + `${orphans.length} unreached (${registered.size} registered)`)

if (unregistered.length > 0) {
  console.error('\nUNREGISTERED SYMBOLS WITH NO PRODUCTION READER:\n')
  for (const o of unregistered) {
    console.error(`  ${o.name}  —  ${relative(REPO, o.file)}`)
  }
  console.error('\nEach one is a rule nothing runs. Wire it, delete it, or add a REGISTRY entry')
  console.error('in scripts/ci/check_symbol_readers.mjs naming WHY and WHAT WOULD CHANGE IT.')
  console.error('Verify by hand first: this instrument cannot see a dynamic call.')
  process.exit(1)
}

// ⚠️ A REGISTRY ENTRY FOR A SYMBOL THAT IS NOW READ IS ALSO A FAILURE. The debt
// was paid and the record still says it is owed, which is how a registry stops
// being believed.
const stale = [...registered.keys()].filter((k) => {
  const [, name] = k.split('::')
  return reached.has(name)
})
if (stale.length > 0) {
  console.error('\nREGISTERED SYMBOLS THAT NOW HAVE READERS — remove these entries:\n')
  for (const s of stale) console.error(`  ${s}`)
  process.exit(1)
}

console.log('symbol-readers: OK')
