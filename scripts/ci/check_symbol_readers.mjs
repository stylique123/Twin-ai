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
  'corpus/cohort.ts': {
    symbols: ['FACET_AGREEMENT', 'selectEvidenceCohort', 'shapeBlock'],
    // ⚠️⚠️ THIS ENTRY MUST NOT NAME THE SYMBOLS IT DISCUSSES. My first draft
    // explained the module by naming the functions it calls — and this guard
    // greps source, so a NAME IN THIS FILE'S STRING LITERALS became a reader.
    // It reported five symbols as newly read and demanded their entries be
    // deleted. The `creativeTransferPlan` entry below warns of exactly this:
    // two debt registers that can read each other are two guards that excuse
    // each other. Comment-stripping does not help — a `why` string is code.
    why: 'Stage 3/4 of the classification engine: the selector that decides '
      + 'which evidence reaches the prompt, and returns nothing far more often '
      + 'than it returns a shape. It consumes the facet match, the relative '
      + 'performance read and the caption shapes, all now in main. '
      + 'The consumer is generate-blueprint\'s prompt assembly, which is FULL '
      + 'tier and touches the paid generation path — landing the selector first '
      + 'is what lets its SILENCE be tested before any creator sees a shape. '
      + 'MEASURED LIMITATION recorded in its tests: the spec\'s headline '
      + 'photographer/physio cross-domain match is NOT achievable, because it '
      + 'rests on what a creator sells and how they deliver it, and those come '
      + 'from a products table with 12 rows across 10 of 51 owners. With four '
      + 'facets those two creators agree on at most two, and relaxing the '
      + 'agreement bar to two would admit "any consumer creator at the same '
      + 'follower stage" — a demographic, not a cohort. '
      + 'WHAT WOULD CHANGE THIS: the prompt assembler consuming this module. '
      + 'DELETE this entry then; if it never lands, delete the module.',
  },
  'corpus/captionShape.ts': {
    symbols: ['captionBody', 'isLikelyEnglish', 'classifyCaption', 'assessedCaptionShape'],
    // ⚠️⚠️ THIS GUARD CAUGHT THE AUTHOR OF THIS ENTRY, IN THE COMMIT THAT ADDED
    // THE MODULE. Stage 1a of the classification engine was written, tested
    // against 4,000 real rows, and had NO PRODUCTION READER — the dominant
    // defect class in this codebase, committed by the person cataloguing it.
    // Registered rather than the ceiling raised: the ceiling IS the check.
    why: 'Stage 1a of the corpus classification engine, deliberately landed one '
      + 'PR AHEAD of its consumer. The reader is the gallery_items backfill, '
      + 'which needs a migration adding caption_shape + its basis and an '
      + 'ingestion job — FULL tier, and it cannot share a lane with a STATIC '
      + 'change. Landing the classifier first is what let it be MEASURED before '
      + 'anything depended on it: 403 of 4,000 real rows classified (10.1%), and '
      + 'four false positives found by eye and fixed (a numbered list labelled '
      + 'negative_command, an exclamation labelled myth_bust). '
      + 'WHAT WOULD CHANGE THIS: the backfill calling the classifier over '
      + 'gallery_items. When that lands, DELETE this entry — do not extend it. '
      + 'If the backfill has not landed and nothing else reads it, the honest '
      + 'answer is to delete the module rather than keep excusing it.',
  },
  'corpus/facets.ts': {
    symbols: ['knownFacets', 'facetsOf'],
    // ⚖️ THIS ENTRY SHRANK BECAUSE ITS OWN TRIGGER FIRED. It said "WHAT WOULD
    // CHANGE THIS: the cohort selector calling the facet match" — the selector
    // landed, and five of the seven symbols now have a real production reader.
    // Removed rather than left standing: a registry entry for a symbol that IS
    // read is how a registry stops being believed, and this guard fails the
    // build for it, correctly.
    why: 'The two remaining accessors have no caller yet. The vector itself is '
      + 'now read by the cohort selector; these two are the shape it is BUILT '
      + 'from, and nothing constructs a vector from a stored profile until the '
      + 'prompt assembler does — that is FULL tier on the paid generation path. '
      + 'WHAT WOULD CHANGE THIS: the assembler building a vector from '
      + 'brand_voices. DELETE this entry then.',
  },
  'corpus/nicheVocabulary.ts': {
    symbols: ['MIN_CREATORS_FOR_TERM', 'MAX_NICHES_FOR_TERM', 'termsIn',
      'nicheVocabulary', 'nicheVocabularies'],
    why: 'Build item 2, the niche term list — "every physio says load tolerance". '
      + 'Two gates, BOTH measured on the real corpus before being written: '
      + 'creator spread >= 10 (frequency cannot tell a term from a name — vogue '
      + '91 cards vs garlic 97, madaan 52 vs tbsp 60, while creator counts are '
      + '4 and 1 against 23 and 13), and distinctiveness to one niche (spread '
      + 'alone returned `und/das/mit/ich` as Business vocabulary). '
      + 'The consumer is the prompt assembler, which puts a niche term list in '
      + 'HER MATERIAL alongside her own vocabulary — it needs the facet vector '
      + '(#798) to know which niche she is in. '
      + 'WHAT WOULD CHANGE THIS: the prompt assembler calling nicheVocabularies. '
      + 'DELETE this entry then; if it never lands, delete the module.',
  },
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
  'script/durationContract.ts': {
    symbols: ['durationMiss'],
    // ⚠️ VERIFIED BY HAND, NOT ASSUMED. `targetSeconds`, `durationBudget` and
    // `durationBrief` in this same file DO have production readers and are
    // deliberately not listed here — only the audit half is unread.
    why: 'The workspace half of a rule that exists twice on purpose. The edge '
      + 'function cannot import @twinai/shared, so generate-blueprint carries '
      + '`durationAuditInline`, and THAT is what runs in production; this is the '
      + 'tested reference the parity assertions in '
      + 'nothing-decided-how-long-the-video-should-be.test.ts hold the inline '
      + 'copy against. Deleting it would delete the authority the copy is '
      + 'checked against. WIRE when the Result screen tells a creator how far '
      + 'their script landed from the length it was written to — the numbers '
      + 'are already computed and stored in beat_audit, nothing renders them.',
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
/** ⚠️ A DECLARATION IS NOT A USE, AND THIS IS WHERE THAT BIT HARDEST. The
 *  transitive step asked `mentions(body, name)` — and a file ALWAYS mentions
 *  its own export, in the line `export function name(`. So the rule reduced to
 *  "any file with one reached export has ALL its exports reached", and the
 *  guard's real granularity was the FILE, not the symbol.
 *
 *  ⚖️ Proven rather than reasoned: two exports in one file, only one called
 *  anywhere, and the uncalled one came back reached. That fixture is now a
 *  selftest case, and it fails without this function.
 *
 *  This is the mention-versus-declaration trap the repo has now hit four times
 *  — and the fourth was inside the guard written to catch unreached symbols. */
export function mentionedBesidesItsOwnDeclaration(body, name) {
  const withoutDecl = body.replace(
    new RegExp(`^export\\s+(?:async\\s+)?(?:function|const|class)\\s+${name}\\b`, 'gm'),
    '',
  )
  return new RegExp(`\\b${name}\\b`).test(withoutDecl)
}

// ⚠️⚠️ A GUARD THAT GREPS SOURCE MUST TELL A MENTION FROM A CALL, and this one
// could not. Measured 2026-09-09: a NEW module's header comment contained the
// words "shapeForGoal's first draft", and this guard reported `shapeForGoal`
// and `rankShapesForGoal` as having acquired production readers — then failed
// the build demanding their registry entries be REMOVED. Nothing called them.
// A comment about a symbol had been counted as a use of it.
//
// ⚠️ THIS IS THE THIRD TIME IN THIS REPOSITORY. `check_analysis_components.mjs`
// shipped it once; `aWiringClaimMustBeTrue` shipped it twice more, one of them
// counting a comment that merely NAMED `affiliateUrl` as a wired reader. It is
// written down as a known trap and it still caught the person who wrote the
// note. Fixing it here rather than rewording the comment, because the comment
// is not the defect.
//
// ⚖️ WHOLE-LINE COMMENTS ONLY, NEVER EVERYTHING AFTER `//`. A real call sitting
// after a string containing "https://" would vanish, and the guard would stop
// catching the thing it exists for — trading a false positive for a false
// negative, which is strictly worse in a guard.
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '\n')
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l))
    .join('\n')
}

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
      if (byReached && mentionedBesidesItsOwnDeclaration(body, s.name)) {
        reached.add(s.name); grew = true
      }
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
  // ⚠️ THE CASE THE TRANSITIVE RULE GOT WRONG FOR ITS WHOLE LIFE. Two exports in
  // one file; only `used` is called anywhere. `neverCalled` was reported REACHED,
  // because the file "mentions" it — in its own declaration line. Verified
  // against the real tree: this fixture's bug was hiding 101 symbols.
  check('A SIBLING IS NOT A CALLER: an uncalled export in a reached file stays unreached',
    [...reachedSymbols(
      [{ name: 'used', file: '/f/a.ts' }, { name: 'neverCalled', file: '/f/a.ts' }],
      new Map([
        ['/f/a.ts', 'export function used(){}\nexport function neverCalled(){}\n'],
        ['/f/caller.ts', 'import { used } from "./a"; used()'],
      ]),
    )].sort(), ['used'])

  // ⚖️ AND THE HELPER ITSELF, BOTH WAYS: a declaration alone is not a mention,
  // a real second use is.
  check('a declaration alone is not a mention',
    mentionedBesidesItsOwnDeclaration('export function foo(){}\n', 'foo'), false)
  check('a genuine second use IS a mention',
    mentionedBesidesItsOwnDeclaration('export function foo(){}\nconst x = foo()\n', 'foo'), true)

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


  // ── stripComments: a comment is not a caller ──────────────────────────────
  // ⚠️ THESE WENT IN THE EXISTING BLOCK, NOT A NEW ONE. My first attempt added a
  // second selftest() with its own process.exit(0) ABOVE this block — which
  // would have short-circuited all nine cases above and reported OK. A guard
  // silently running fewer checks than it claims is the exact failure this file
  // exists to prevent, introduced into the file itself.
  check('a whole-line comment naming a symbol is not a call',
    stripComments("// shapeForGoal's first draft used a ratio\nconst x = 1").includes('shapeForGoal'), false)
  check('a block comment naming a symbol is not a call',
    stripComments('/* rankShapesForGoal is dead */\nconst y = 2').includes('rankShapesForGoal'), false)
  // ⚠️⚠️ THE CASE THAT MAKES THE NAIVE FIX WRONG. Stripping from the first `//`
  // erases a real call after a url string — a false negative, strictly worse.
  check('a real call after a url string SURVIVES',
    stripComments("const u = 'https://example.com'; shapeForGoal(a)").includes('shapeForGoal(a)'), true)
  check('a call with a trailing comment survives',
    stripComments('shapeForGoal(a) // genuinely called').includes('shapeForGoal(a)'), true)

  // ⚠️⚠️ AND THE STRIPPER MUST STILL BE WIRED IN. Mutation-tested: removing the
  // stripComments() call from the prodSources map leaves every case above
  // passing — they test the FUNCTION — while the guard silently reverts to
  // counting comments as callers. The raised ceiling absorbs the difference, so
  // nothing fails. A function that is correct and uncalled is this repository's
  // dominant defect; this asserts the call site itself.
  // ⚖️ RESOLVED LOCALLY: `SELF` is declared below this block, so referencing it
  // here is a temporal-dead-zone crash — which the selftest caught on its first
  // run, exactly as it should have.
  const selfCode = stripComments(readFileSync(fileURLToPath(import.meta.url), 'utf8'))
  check('stripComments is actually applied to the production sources',
    /prodSources[\s\S]{0,200}stripComments\(readFileSync/.test(selfCode), true)

  if (failures > 0) { console.error(`symbol-readers guard selftest: ${failures} FAILED`); process.exit(1) }
  console.log('symbol-readers guard selftest: OK (14 cases, incl. both transitive directions and comment-stripping)')
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
  .map((p) => [p, stripComments(readFileSync(p, 'utf8'))]))

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

// ⚠️ A RATCHET, BECAUSE THE FIX TO THE TRANSITIVE RULE REVEALED 101 SYMBOLS AT
// ONCE. Before `mentionedBesidesItsOwnDeclaration`, a file's own declaration
// counted as a mention, so ANY file with one reached export had ALL its exports
// marked reached: 801 of 839 looked reached, and 700 actually are.
//
// ⚖️ AND THE 101 ARE NOT REGISTERED WHOLESALE, WHICH WOULD BE THE DISHONEST
// MOVE. The REGISTRY's own instruction is "verify by hand first: this
// instrument cannot see a dynamic call", and 101 verifications is not a thing to
// do in one pass — it is how a registry fills with entries nobody checked, which
// is worse than the hole it closes. So the true number is reported, the ceiling
// can only go DOWN, and each symbol gets wired, deleted or registered with a
// real reason as it is actually examined. Same shape as the test-typecheck
// ratchet, and for the same reason.
//
// ⚠️ THE CEILING LIVES HERE, IN THE GUARD, not in the REGISTRY it measures. A
// ratchet whose limit sits inside the thing being ratcheted can be raised in the
// same edit that breaks it.
//
// ⚠️⚠️ RE-BASELINED 2026-09-09, FROM 101 TO 149, AND THAT IS NOT THE CHECK DOING
// LESS. The INSTRUMENT got stricter in this same commit: `stripComments` stopped
// a comment mentioning a symbol from counting as a call. `reached` fell 784 →
// 733. FIFTY-ONE symbols were never reached by any code — they were reached by
// prose ABOUT them.
//
// ⚖️ THE DEBT DID NOT GROW. IT BECAME VISIBLE. Those 51 symbols had no
// production caller yesterday either; the guard simply could not see it. A
// ceiling is a record of KNOWN debt, and when the instrument measuring it
// improves, the record has to be re-cut against the true number or the guard
// fails permanently and gets deleted — which is how a repository loses a check
// entirely.
//
// ⚠️ WHAT WOULD MAKE THIS ILLEGITIMATE, STATED SO IT CAN BE CHECKED. Raising
// this number without the instrument changing is weakening the check, and must
// never happen. This raise is admissible ONLY because it is paired with a strict
// improvement in the same commit, and only at the number that improvement
// measured. It ratchets DOWN from 149 and never up again.
//
// ⚠️ AND 149 IS A STARTING LINE, NOT A RESTING PLACE. Forty-nine symbols are
// newly visible as unwired. Each is a rule nothing runs. They are not triaged in
// this commit — deliberately: doing it in the same change that alters the
// instrument would make it impossible to tell which failures came from which.
const MAX_UNREGISTERED = 149

console.log(`symbol-readers: unregistered ${unregistered.length} of ceiling ${MAX_UNREGISTERED}`)
console.log(`symbol-readers: ${symbols.length} exported symbols, ${reached.size} reached, `
  + `${orphans.length} unreached (${registered.size} registered)`)

if (unregistered.length > MAX_UNREGISTERED) {
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
