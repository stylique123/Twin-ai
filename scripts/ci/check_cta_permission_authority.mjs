#!/usr/bin/env node
// COMMERCIAL PERMISSION COMES FROM THE RELATIONSHIP. NOWHERE MAY DECIDE IT FROM
// THE GOAL ALONE.
//
// ⚠️ THE FAILURE THIS EXISTS FOR, MEASURED. `generate-blueprint` moved CTA
// permission from the video goal to the creator's commercial relationship. Two
// other places kept the old rule and nobody noticed:
//
//   run-eval.mjs     sent "your goal is commercial, so a purchase CTA is
//                    appropriate" — so every matrix measured deleted code.
//   score-matrix.mjs excused any sell/leads case — so it reported 0 leaks.
//
// Across 112 runs those two agreed with each other and with nothing that
// shipped: 16 purchase CTAs and 7 spoken pitches on creators with no
// commercial tie, all reported as zero. THREE COPIES OF A RULE, ONE OF THEM
// REAL, is not a drift problem — it is an authority problem, and the only fix
// that holds is refusing to let a fourth appear.
//
// ⚖️ WHAT THIS FORBIDS, PRECISELY: deciding whether a commercial CTA is
// permitted by testing the GOAL without also consulting the RELATIONSHIP. A
// goal may still narrow an already-granted permission — that is
// `goalWantsSale`, and it is legitimate — but it may never grant one, because
// no goal creates a commercial tie that does not exist.
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const FILES = execSync(
  "git ls-files '*.ts' '*.tsx' '*.mjs' '*.js' | grep -v node_modules",
  { encoding: 'utf8' },
).split('\n').filter(Boolean)

/** A line that tests the goal for commercial intent. */
const GOAL_TEST = /\b(?:sell|leads)\b[\s\S]{0,40}\b(?:test|includes|===|==)|\/\(?sell\|leads\)?\/|goal\s*===\s*'(?:sell|leads)'/
/** The words that mean the relationship was consulted somewhere nearby. */
const RELATIONSHIP = /relationship|relationshipCode|commercialCta|\bOWN_PRODUCT\b|\bAFFILIATE\b|\bSPONSOR\b|\bREVIEW_ONLY\b|sellIntent|mayPitch/

const problems = []
for (const f of FILES) {
  if (f === 'scripts/ci/check_cta_permission_authority.mjs') continue
  const src = readFileSync(f, 'utf8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return
    if (!GOAL_TEST.test(line)) return
    // ⚖️ A WINDOW, NOT THE LINE. The relationship is consulted a few lines
    // above where the goal narrows it — `sellIntent` reads `commercialCta`
    // first — so a line-local check would condemn the correct shape.
    const window = lines.slice(Math.max(0, i - 12), i + 6).join('\n')
    if (RELATIONSHIP.test(window)) return
    problems.push(`${f}:${i + 1}\n    ${line.trim()}`)
  })
}

if (problems.length) {
  console.error('cta-permission-authority guard: FAIL\n')
  console.error('These decide commercial intent from the GOAL with no relationship in sight:\n')
  for (const p of problems) console.error('  ' + p + '\n')
  console.error('Permission comes from the commercial relationship. A goal may narrow an')
  console.error('existing permission; it may never grant one. See generate-blueprint\'s')
  console.error('commercialCta/sellIntent derivation, and mirror it rather than restating it.')
  process.exit(1)
}
console.log(`cta-permission-authority guard: OK (${FILES.length} files scanned)`)
