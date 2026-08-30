#!/usr/bin/env node
// ONE SOURCE, MECHANICALLY COPIED — NEVER RETYPED.
//
// The edge runtime cannot import scripts/ from inside the functions bundle, and
// this repo has been bitten by the alternative: label-packet.mjs kept its own
// copy of a rate helper, the copy kept the 500%-of-a-different-population bug
// after the original was fixed, and its selftest passed against stale code.
//
// So the Deno copies are GENERATED, and CI regenerates and diffs them. A drifted
// copy is a failing check, not a surprise in production.
//
//   node scripts/ci/generate_shared_pilot_core.mjs          # write
//   node scripts/ci/generate_shared_pilot_core.mjs --check  # fail if stale
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCES = [
  ['scripts/pilot-core.mjs', 'supabase/functions/_shared/pilotCore.ts'],
  ['scripts/pilot-decision.mjs', 'supabase/functions/_shared/pilotDecision.ts'],
  ['scripts/pilot-start.mjs', 'supabase/functions/_shared/pilotStart.ts'],
  // The packet materialiser and the frozen-run reader it depends on. Generated
  // rather than reimplemented so loadPilotRun stays ONE authority: the digest
  // check that refuses a sample changed after freeze must not exist twice.
  ['scripts/pilot-db.mjs', 'supabase/functions/_shared/pilotDb.ts'],
  ['scripts/pilot-collect.mjs', 'supabase/functions/_shared/pilotCollect.ts'],
  ['scripts/d1-core.mjs', 'supabase/functions/_shared/d1Core.ts'],
  ['scripts/watched-session.mjs', 'supabase/functions/_shared/watchedSession.ts'],
  ['scripts/owner-console.mjs', 'supabase/functions/_shared/ownerConsole.ts'],
  // ⚠️ THE HOOK CONTRACT, COPIED RATHER THAN RE-TYPED AS AN `…Inline` HELPER.
  // The writer's ≤12-word hook rule needs a check on BOTH sides: the shared
  // package (tested, imported by the web app) and the edge function that
  // actually repairs the hooks. Every other two-copy rule in this repo is hand
  // written under the `…Inline` convention and guarded by a parity test that
  // compares the shipped sources — which works, and which is strictly weaker
  // than not having two authors at all. This file exists because a hand copy
  // once kept a bug after the original was fixed; the hook contract gets the
  // mechanism rather than the convention.
  //
  // ⚖️ THE SOURCE IS TYPESCRIPT AND THAT IS FINE. The copy is `@ts-nocheck`ed
  // like every other generated file, and the module has no imports to rewrite.
  ['packages/shared/src/script/hookContract.ts', 'supabase/functions/_shared/hookContract.ts'],
  ['packages/shared/src/script/craftBeats.ts', 'supabase/functions/_shared/craftBeats.ts'],
  ['packages/shared/src/script/emphasis.ts', 'supabase/functions/_shared/emphasis.ts'],
  ['packages/shared/src/script/beatAsk.ts', 'supabase/functions/_shared/beatAsk.ts'],
  ['packages/shared/src/script/shotLabel.ts', 'supabase/functions/_shared/shotLabel.ts'],
  ['packages/shared/src/scanCeiling.ts', 'supabase/functions/_shared/scanCeiling.ts'],
  ['packages/shared/src/brandTruthPrompt.ts', 'supabase/functions/_shared/brandTruthPrompt.ts'],
  ['packages/shared/src/script/repetition.ts', 'supabase/functions/_shared/repetition.ts'],
  // ⚠️ FIX 1 (Wave 1). The reference-copying check. Generated rather than
  // retyped so the writer path's `≥6-content-word` threshold and the tested
  // module agree by construction — a hand copy is exactly how the 2026-08-26
  // Run D evidence (verbatim reference sentences at fidelity="loose") would
  // survive its own fix.
  ['packages/shared/src/script/phraseOverlap.ts', 'supabase/functions/_shared/phraseOverlap.ts'],
  // ⚠️ THE FIDELITY→EXPOSURE BUDGET. Generated rather than retyped for the same
  // reason as `phraseOverlap` beside it: this table is what decides how much of
  // the reference's verbatim speech reaches the writer, and a hand copy that
  // drifted upward would silently restore the unconditional 6,000 characters
  // that produced the Run A / Run D leaks — while the tested module still
  // reported the fix as present.
  ['packages/shared/src/script/referenceExposure.ts', 'supabase/functions/_shared/referenceExposure.ts'],
  // ⚠️ FIX 2 (Wave 1). The CTA-entity check. Generated rather than retyped so
  // the writer path's fallback-trigger condition and the tested module agree
  // by construction — a hand copy is exactly how the Run C evidence (a CTA
  // naming the reference creator's own company, "Acquisition.com") would
  // survive its own fix.
  ['packages/shared/src/script/ctaEntity.ts', 'supabase/functions/_shared/ctaEntity.ts'],
  // ⚠️ FIX 3 (Wave 1). The hook-entity check. Generated rather than retyped so
  // the writer path's demotion condition and the tested module agree by
  // construction — a hand copy is exactly how Run A's "revenue was stagnant"
  // and Run D's "we do over a million in revenue" / "stop blaming your churn"
  // would survive their own fix.
  ['packages/shared/src/script/hookEntity.ts', 'supabase/functions/_shared/hookEntity.ts'],
  ['packages/shared/src/script/advisoryRead.ts', 'supabase/functions/_shared/advisoryRead.ts'],
  // ⚠️ FIX 8b. The trigger the edge function's judge call must obey — "2+
  // substantive soft beats", never the payoff branch G20 forbids. Generated
  // rather than retyped so the edge call site and the tested rule are the
  // same code, not two authors of one blind-tested boundary.
  ['packages/shared/src/script/semanticRepetition.ts', 'supabase/functions/_shared/semanticRepetition.ts'],
  // ⚠️ FIX 4 (Wave 2). The shot-list <-> teleprompter resync. Generated
  // rather than retyped so the edge function that ships the blueprint and
  // the tested module agree by construction — a hand copy is exactly how
  // run A/B/C's shot-list drift (see liveRunFixtures.test.ts §4) would
  // survive its own fix. `silentBeat.ts` is copied alongside it because the
  // resync reuses `isSilentBeat` rather than a second marker check.
  ['packages/shared/src/script/silentBeat.ts', 'supabase/functions/_shared/silentBeat.ts'],
  ['packages/shared/src/script/shotListSync.ts', 'supabase/functions/_shared/shotListSync.ts'],
  // ⚠️ FIX 5 (Wave 2). The retention-map <-> final-script resync. Generated
  // rather than retyped for the same reason as shotListSync.ts just above —
  // a hand copy is exactly how the coaching panel's drift from the shipped
  // script (see liveRunFixtures.test.ts §5) would survive its own fix.
  ['packages/shared/src/script/retentionMapSync.ts', 'supabase/functions/_shared/retentionMapSync.ts'],
  // ⚠️ FIX 7 (Wave 3). The setup-letter <-> description resync. Generated
  // rather than retyped for the same reason as shotListSync.ts above — a
  // hand copy is exactly how run A-D's comma-split, repeating, non-
  // deterministic setup letters (see liveRunFixtures.test.ts §7) would
  // survive its own fix.
  ['packages/shared/src/script/setupLabelSync.ts', 'supabase/functions/_shared/setupLabelSync.ts'],
]

// ⚠️ A SHEBANG IS LEGAL ONLY ON LINE 1, AND THE HEADER PUSHES IT TO LINE 5.
// The first five sources here are library modules with no shebang, so this went
// unnoticed until pilot-db.mjs and pilot-collect.mjs — which are executable
// scripts — joined the set and produced `TS1005: ';' expected` at line 5 in
// both. Stripped rather than tolerated: the Deno copy is imported, never run.
const stripShebang = (src) => src.replace(/^#![^\n]*\n/, '')

const render = (from, src0) => {
  const src = stripShebang(src0)
  return `// GENERATED FROM ${from} — DO NOT EDIT.\n`
  + `// Run: node scripts/ci/generate_shared_pilot_core.mjs\n`
  + `// Edit the source instead. CI regenerates this file and fails on a diff.\n`
  + `// @ts-nocheck\n`
  + src
    .replace(/from '\.\/pilot-core\.mjs'/g, "from './pilotCore.ts'")
    .replace(/from '\.\/pilot-db\.mjs'/g, "from './pilotDb.ts'")
    .replace(/from '\.\/d1-core\.mjs'/g, "from './d1Core.ts'")
    .replace(/from '\.\/brandTruth\.js'/g, "from './brandTruth.ts'")
    .replace(/from '\.\/repetition\.js'/g, "from './repetition.ts'")
    .replace(/from '\.\/craftBeats\.js'/g, "from './craftBeats.ts'")
    .replace(/from '\.\/hookContract\.js'/g, "from './hookContract.ts'")
}

const check = process.argv.includes('--check')
let stale = 0
for (const [from, to] of SOURCES) {
  const want = render(from, readFileSync(from, 'utf8'))
  let have = null
  try { have = readFileSync(to, 'utf8') } catch { /* absent counts as stale */ }
  if (have === want) { console.log(`  fresh: ${to}`); continue }
  if (check) {
    console.error(`::error::${to} has drifted from ${from}. Run `
      + 'node scripts/ci/generate_shared_pilot_core.mjs and commit the result. A hand-edited copy '
      + 'is how the 500% rate bug survived its own fix.')
    stale++
  } else { writeFileSync(to, want); console.log(`  wrote: ${to}`) }
}
process.exit(stale === 0 ? 0 : 1)
